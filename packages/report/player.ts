import { Candle, ExecutedOrder, OrderType, PluginInterface } from '@debut/types';
import type { VirtualTakesPlugin } from '@debut/plugin-virtual-takes';
import type { DynamicTakesPlugin } from '@debut/plugin-dynamic-takes';
import express from 'express';
import SSEExpress from 'express-sse-ts';
import { formatTime } from './utils';
import path from 'path';
import { debutToChartTimeframe, FigureModifier, IndicatorHeader, IndicatorsSchema } from './report';
import { orders } from '@debut/plugin-utils';

export interface PlayerPluginAPI {
    player: {
        addIndicators(schema: IndicatorsSchema): void;
    };
}

export function playerPlugin(tickDelay = 10): PluginInterface {
    let virtualTakes: VirtualTakesPlugin;
    let dynamicTakes: DynamicTakesPlugin;
    let activeOrderCid: number;
    let activeOrderCandle: number;
    let candleIndx = 0;
    const app = express();
    const sse = new SSEExpress();
    let indicatorsSchema: IndicatorsSchema;
    const staticPath = path.resolve(__dirname + '/../static');
    let inited = false;
    let filled = false;
    let orderUpdates = [] as any[];
    let activeOrderData: any[] | null = null;
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
        data: [] as any[],
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

    function updateTakes(data: unknown[]) {
        let stopPrice: number = 0;

        if (virtualTakes && activeOrderCid) {
            stopPrice = virtualTakes.api.getTakes(activeOrderCid)?.stopPrice || 0;
        }

        if (dynamicTakes && activeOrderCid) {
            stopPrice = dynamicTakes.api.getTakes(activeOrderCid)?.stopPrice || 0;
        }

        if (stopPrice !== 0) {
            return data.concat(stopPrice);
        }

        return data;
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
            let update: Record<string, unknown> = {};

            if (filled) {
                await sleep(tickDelay);
            }

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

                if (activeOrderData) {
                    update['Orders'] = updateTakes(activeOrderData);
                }

                if (orderUpdates.length) {
                    const data = orderUpdates.shift();

                    update['Orders'] = updateTakes(data);
                }

                send(update, 'tick');
            }
        },
        async onAfterCandle(candle: Candle) {
            const transformedCandle = mapCandle(candle);
            const formattedTime = formatTime(candle.time);
            const update: Record<string, unknown> = { candle: transformedCandle };

            candleIndx++;
            initialData.chart.data.push(transformedCandle);
            filled = initialData.chart.data.length > 50;
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
            const { price, type } = order;
            const fTime = formatTime(order.time);
            const data = [order.cid, type === OrderType.BUY ? 1 : 0, price, type, undefined, 1, undefined, 'Exit'];

            orderUpdates.push(data);
            ordersData.data.push([fTime, ...data]);
            activeOrderCid = order.cid;
            activeOrderData = data;
        },
        async onClose(order: ExecutedOrder, closing: ExecutedOrder) {
            const closeTime = formatTime(order.time);
            const openTime = formatTime(closing.time);
            const isProfitable = orders.getCurrencyProfit(closing, order.price) >= 0;
            const data = [
                closing.cid,
                closing.type == OrderType.BUY ? 1 : 0,
                closing.price,
                closing.type,
                closeTime,
                isProfitable ? 1 : 0,
                order.price,
                isProfitable ? 'Exit' : 'Stop',
            ];

            ordersData.data.push([openTime, ...data]);
            orderUpdates.push(data);

            if (!this.debut.ordersCount) {
                activeOrderData = null;
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
