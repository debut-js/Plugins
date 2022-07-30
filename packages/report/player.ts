import { Candle, ExecutedOrder, OrderType, PluginInterface } from '@debut/types';
import type { VirtualTakesPlugin } from '@debut/plugin-virtual-takes';
import type { DynamicTakesPlugin } from '@debut/plugin-dynamic-takes';
import express from 'express';
import SSEExpress from 'express-sse-ts';
import { formatTime } from './utils';
import path from 'path';
import { debutToChartTimeframe, FigureModifier, IndicatorHeader, IndicatorsSchema } from './report';

// Остановился на том, что метод setPricesForOrder вызывает после открытия сделки, нужно опрашиваь сделку постоянно и обновлять ее стоп
// кажется все открытые сделки должны быть в какой то мапе, которая будет считывать их и подставлять данные
// но не ясно что делать в случае когда плагин используется как репорт
export type PlayerOrderInfo = [
    id: number | string,
    type: 'Open' | 'Close' | 'Both' | 'Entry' | 'Reduce',
    price: number,
    orderType: OrderType,
    stopPrice?: number,
    closeType?: 'Exit',
    closePrice?: number,
    closeTime?: number,
    openTime?: number,
];

export interface PlayerPluginAPI {
    player: {
        addIndicators(schema: IndicatorsSchema): void;
    };
}

export function playerPlugin(tickDelay = 10): PluginInterface {
    let virtualTakes: VirtualTakesPlugin;
    let dynamicTakes: DynamicTakesPlugin;
    const app = express();
    const sse = new SSEExpress();
    let indicatorsSchema: IndicatorsSchema;
    const staticPath = path.resolve(__dirname + '/../static');
    let inited = false;
    let filled = false;
    let orderUpdates: PlayerOrderInfo[] = [];
    let candleIdx = 0;
    const openMap = new Map<number, number>();
    const indicatorsData = new Map();
    const initialData = {
        chart: {
            type: 'Candles',
            indexBased: true,
            data: [] as any[],
            tf: '15m',
        },
        title: `Debut strategy player`,
        onchart: [],
        offchart: [],
    };

    const ordersData = {
        type: 'Orders',
        name: 'Orders',
        data: [] as any,
        settings: { 'z-index': 1 },
    };

    app.use((req, res, next) => {
        const origins = ['http://localhost:5000'];

        for (let i = 0; i < origins.length; i++) {
            const origin = origins[i];
            if (req.headers.origin && req.headers.origin.indexOf(origin) > -1) {
                res.header('Access-Control-Allow-Origin', req.headers.origin);
            }
        }

        res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
        res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
        next();
    });

    app.get('/sse', (...args) => {
        sse.init(...args);
        send(initialData, 'init');
        inited = true;
    });
    app.use(express.static(staticPath));
    app.listen(5000, () => {
        console.log('Player chart is available on http://localhost:5000/player.html');
        console.log('Player stream is available on http://localhost:5000/sse');
    });

    function send(data: unknown, event: string) {
        sse.send(JSON.stringify(data), event);
    }

    function getTakes(cid: number) {
        let stopPrice: number = 0;

        if (virtualTakes) {
            stopPrice = virtualTakes.api.getTakes(cid)?.stopPrice || 0;
        }

        if (dynamicTakes) {
            stopPrice = dynamicTakes.api.getTakes(cid)?.stopPrice || 0;
        }

        return stopPrice;
    }

    return {
        name: 'player',

        api: {
            addIndicators(schema: IndicatorsSchema) {
                schema.forEach((schema, index) => {
                    const indicatorHeader: IndicatorHeader = {
                        name: schema.name,
                        type: 'Indicators',
                        data: [],
                        settings: {
                            schema: ['time'],
                            colors: [],
                            levels: [],
                            'z-index': 2,
                        },
                    };

                    if (schema.inChart) {
                        initialData.onchart.push(indicatorHeader as never);
                    } else {
                        initialData.offchart.push(indicatorHeader as never);
                    }

                    indicatorsData.set(schema.name, indicatorHeader);

                    schema.figures.forEach((figure, idx) => {
                        indicatorHeader.settings.colors.push(figure.color || null);
                        indicatorHeader.settings.schema.push(
                            `${figure.name}.${figure.type || `line`}.${FigureModifier.value}`,
                        );
                    });
                });

                initialData.onchart.push(ordersData as never);
                indicatorsSchema = schema;
            },
        },

        onInit() {
            initialData.title = `${this.debut.opts.ticker}`;
            initialData.chart.tf = debutToChartTimeframe(this.debut.opts.interval);
            virtualTakes = this.findPlugin('takes');
            dynamicTakes = this.findPlugin('dynamicTakes');
        },

        async onAfterTick(tick: Candle) {
            let update: Record<string, any> = {};

            if (inited && filled) {
                update = mapTick(tick);

                indicatorsSchema.forEach((schema) => {
                    let step: Array<number | string> = [];

                    schema.figures.forEach((figure) => {
                        step.push(figure.getValue());
                    });

                    if (step.filter(Boolean).length) {
                        update[schema.name] = step;
                    }
                });

                if (orderUpdates.length) {
                    update.Orders = [...orderUpdates];
                }

                openMap.forEach((value, key) => {
                    value = getTakes(key);

                    if (value) {
                        // @ts-ignore
                        const stopData = [key, 'StopLoss', value];
                        update.Orders = [...(update.Orders || []), stopData];
                    }
                });

                send(update, 'tick');
            }

            if (filled) {
                await sleep(tickDelay);
            }
        },
        async onAfterCandle(candle: Candle) {
            const transformedCandle = mapCandle(candle);
            const formattedTime = formatTime(candle.time);
            const update: Record<string, unknown> = { candle: transformedCandle };

            initialData.chart.data.push(transformedCandle);
            filled = filled || (initialData.chart.data.length > 50 && ordersData.data.length > 0);
            indicatorsSchema.forEach((schema) => {
                const meta = indicatorsData.get(schema.name);
                let step: Array<number | string> = [formattedTime];

                schema.figures.forEach((figure) => {
                    step.push(figure.getValue());
                });

                if (step.filter(Boolean).length > 1) {
                    meta.data.push(step);
                    update[schema.name] = step.slice(1);
                }
            });

            if (inited) {
                send(update, 'candle');
            }
        },
        async onOpen(order: ExecutedOrder) {
            const { price, type, cid } = order;
            const stopPrice = getTakes(cid);
            const data: PlayerOrderInfo = [cid, 'Open', price, type, stopPrice];

            openMap.set(cid, candleIdx);

            if (inited) {
                orderUpdates.push(data);
            }
        },

        async onCandle() {
            candleIdx++;
            orderUpdates.length = 0;
        },
        async onClose(order: ExecutedOrder, closing: ExecutedOrder) {
            const openTime = openMap.get(closing.cid);
            const openTimeMs = formatTime(closing.time);
            const closeTimeMs = formatTime(order.time);
            const cid = order.reduce ? `r-${closing.cid}` : closing.cid;
            const data: PlayerOrderInfo = [
                cid,
                order.reduce ? 'Reduce' : 'Close',
                closing.price,
                closing.type,
                getTakes(closing.cid),
                'Exit',
                order.price,
                openTime,
            ];

            const bothData = [
                closeTimeMs,
                cid,
                'Both',
                closing.price,
                closing.type,
                getTakes(closing.cid),
                'Exit',
                order.price,
                openTimeMs,
            ];

            ordersData.data.push(bothData);

            if (!order.reduce) {
                openMap.delete(closing.cid);
            }

            if (inited) {
                orderUpdates.push(data);
            }
        },
    };
}

function mapCandle(candle: Candle) {
    const time = candle.time;
    const formattedTime = formatTime(time);

    return [formattedTime, candle.o, candle.h, candle.l, candle.c, candle.v];
}

function mapTick(candle: Candle) {
    const time = candle.time;
    const formattedTime = formatTime(time);

    return { t: formattedTime, price: candle.c, volume: candle.v };
}

function sleep(ms: number) {
    return new Promise((resolve: Function) => setTimeout(resolve, ms));
}
