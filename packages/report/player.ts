import { Candle, ExecutedOrder, PluginInterface } from '@debut/types';
import express from 'express';
import SSEExpress from 'express-sse-ts';
import { formatTime } from './utils';
import path from 'path';
import { FigureModifier, IndicatorHeader, IndicatorsSchema } from './report';

export interface PlayerPluginAPI {
    player: {
        addIndicators(schema: IndicatorsSchema): void;
    };
}

export function playerPlugin(tickDelay = 10): PluginInterface {
    const app = express();
    const sse = new SSEExpress();
    let indicatorsSchema: IndicatorsSchema;
    const staticPath = path.resolve(__dirname + '/../static');
    let inited = false;
    let filled = false;
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
        offchart: []
    };

    const orders = {
        type: "Orders",
        name: "Orders",
        data: [],
        settings: { "z-index": 1 }
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
    app.listen(5000, () => console.log('player stream is available on http://localhost:5000/sse'));

    function send(data: unknown, event: string) {
        sse.send(JSON.stringify(data), event);
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

                initialData.onchart.push(orders as never);
                indicatorsSchema = schema;
            },
        },

        onInit() {
            initialData.title = `${this.debut.opts.ticker}`;
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

                send(update, 'tick');
            }
        },
        async onAfterCandle(candle: Candle) {
            const transformedCandle = mapCandle(candle);
            const formattedTime = formatTime(candle.time);
            const update: Record<string, unknown> = { candle: transformedCandle };

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
        async onOpen(order) {
            // send(formatTime(order), 'open-order');
        },
        async onClose(order: ExecutedOrder) {
            // send(formatTime(order), 'close-order');
            // // Если buy, значит оригинальный ордер был Sell, инвертируем профит
            // const rev = order.type === OrderType.BUY ? -1 : 1;
            // const lots = order.executedLots;
            // if (order.openPrice) {
            //     const profit = (order.price - order.openPrice) * lots * rev - order.commission.value;
            //     balance += profit;
            // }
            // send(formatTime({ time: order.time, value: balance }), 'balance-change');
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
