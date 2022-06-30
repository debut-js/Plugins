import { PluginInterface, Candle, OrderType } from '@debut/types';
import { file, orders } from '@debut/plugin-utils';
import { StatsInterface } from '@debut/plugin-stats';
import path from 'path';

export const enum FillType {
    'tozeroy' = 'tozeroy',
    'tonexty' = 'tonexty',
    'toself' = 'toself',
}
export interface ReportPluginAPI {
    report: {
        addIndicators(schema: IndicatorsSchema): void;
        disableProfitPlot: () => void;
        setXRange: (from: number, to: number) => void;
        disableOrdersDisplay: () => void;
        cleanup: () => void;
        setManualOrder: (
            operation: OrderType,
            openTime: string,
            closeTime: string,
            openPrice: number,
            closePrice: number,
        ) => void;
        addOpenTarget: (time: string, price: number, operation: OrderType) => void;
    };
}

export type IndicatorsSchema = Array<Indicator>;

interface IndicatorHeader {
    // @deprecated
    name: string;
    type: 'Indicators';
    data: Array<unknown>;
    settings: {
        schema: string[];
        levels: number[];
        colors: Array<string | null>;
        'z-index'?: number;
    };
}
export interface Indicator {
    name: string;
    figures: Array<{
        name: string;
        type?: FigureType;
        fill?: FillType;
        fillcolor?: string;
        color?: string;
        getValue: () => number | string;
    }>;
    levels?: number[];
    inChart?: boolean;
}

export const enum FigureType {
    'line' = 'line',
    'hist' = 'hist',
    'dot' = 'dot',
    'bar' = 'bar',
    'text' = 'text',
}
const enum FigureModifier {
    'color' = 'color',
    'width' = 'width',
    'value' = 'value',
}

export function reportPlugin(showMargin = true): PluginInterface {
    let indicatorsSchema: IndicatorsSchema = [];
    let title: string;
    let indicatorsData: Record<string, IndicatorHeader> = {};
    const ohlcv: Array<[time: number, open: number, high: number, low: number, close: number, volume: number]> = [];
    const onchart: Array<unknown> = [];
    const offchart: Array<unknown> = [];
    const settings: {
        rangeFrom?: number;
        rangeTo?: number;
        toolbar?: boolean;
    } = {};

    const deals = {
        type: 'Orders',
        name: 'Orders',
        data: [] as Array<
            [
                opentime: number,
                type: number,
                price: number,
                name: string,
                closetime: number,
                closetype: number,
                closeprice: number,
                closename: string,
            ]
        >,
        settings: {
            'z-index': 1,
        },
    };
    const equity: Array<[time: number, balance: number]> = [];
    const margins: Array<[time: number, usage: number]> = [];

    let startTime: number;
    let lastTick: Candle;
    let stats: StatsInterface;
    let disabledProfit = false;
    let isManualOrder = false;

    function formatTime(originalTime: number | string) {
        const d = new Date(originalTime);

        return Date.UTC(
            d.getFullYear(),
            d.getMonth(),
            d.getDate(),
            d.getHours(),
            d.getMinutes(),
            d.getSeconds(),
            d.getMilliseconds(),
        );
    }

    function createVisualData() {
        onchart.push(deals);

        if (!disabledProfit) {
            const profitPayload = {
                name: 'Balance & Equity',
                type: 'Balance',
                data: equity,
                margins,
            };

            if (!showMargin) {
                profitPayload.margins.length = 0;
            }

            offchart.push(profitPayload);
        }

        if (!settings.rangeFrom && !settings.rangeTo) {
            settings.rangeFrom = ohlcv[0][0];
            settings.rangeTo = ohlcv[ohlcv.length - 1][0];
        }

        const chart = {
            type: 'Candles',
            indexBased: true,
            data: ohlcv,
        };

        return { chart, title, onchart, offchart, settings };
    }

    return {
        name: 'report',

        api: {
            addIndicators(schema: IndicatorsSchema) {
                indicatorsSchema = schema;

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

                    indicatorsData[schema.name] = indicatorHeader;

                    if (schema.inChart) {
                        onchart.push(indicatorHeader);
                    } else {
                        offchart.push(indicatorHeader);
                    }

                    schema.figures.forEach((figure, idx) => {
                        indicatorHeader.settings.colors.push(figure.color || null);
                        indicatorHeader.settings.schema.push(
                            `${figure.name}.${figure.type || `line`}.${FigureModifier.value}`,
                        );
                    });
                });
            },

            disableProfitPlot() {
                disabledProfit = true;
            },

            setXRange(from: number, to: number) {
                settings.rangeFrom = formatTime(from);
                settings.rangeTo = formatTime(to);
                settings.toolbar = false;
            },
            addOpenTarget(time: string, price: number, operation: OrderType) {
                const fTime = formatTime(time);
                deals.data.push([
                    fTime,
                    operation === OrderType.BUY ? 1 : 0,
                    price,
                    operation,
                    fTime,
                    1,
                    price,
                    'Exit',
                ]);
            },
            disableOrdersDisplay() {
                isManualOrder = true;
            },
            resetOrders() {
                deals.data.length = 0;
            },
            cleanup() {
                deals.data.length = 0;
                ohlcv.length = 0;
                equity.length = 0;
                indicatorsData = {};
            },
            setManualOrder(
                operation: OrderType,
                openTime: string,
                closeTime: string,
                openPrice: number,
                closePrice: number,
            ) {
                const isProfitable = operation === OrderType.BUY ? openPrice < closePrice : openPrice > closePrice;

                deals.data.push([
                    formatTime(openTime),
                    operation === OrderType.BUY ? 1 : 0,
                    openPrice,
                    operation,
                    formatTime(closeTime),
                    isProfitable ? 1 : 0,
                    closePrice,
                    isProfitable ? 'Exit' : 'Stop',
                ]);
            },
        },

        onInit() {
            stats = this.findPlugin<StatsInterface>('stats');

            if (!stats) {
                throw 'Genetic Shutdown: stats plugin is required!';
            }

            title = this.debut.opts.ticker;

            // Replace for binance BTCUSDT, removes USDT
            if (this.debut.opts.ticker.endsWith(this.debut.opts.currency)) {
                title = title.replace(this.debut.opts.currency, '');
            }

            title += ` / ${this.debut.opts.currency} - ${this.debut.opts.broker.toLocaleUpperCase()}`;
        },

        async onTick(tick) {
            lastTick = tick;
        },

        async onCandle(tick) {
            let profit = this.debut.ordersCount ? orders.getCurrencyBatchProfit(this.debut.orders, tick.c) : 0;

            equity.push([formatTime(tick.time), stats.api.getState().profit + profit]);
        },

        async onAfterCandle(candle) {
            const time = candle.time;
            const formattedTime = formatTime(time);

            ohlcv.push([formattedTime, candle.o, candle.h, candle.l, candle.c, candle.v]);

            indicatorsSchema.forEach((schema) => {
                const meta = indicatorsData[schema.name];
                let step: Array<number | string> = [formattedTime];

                schema.figures.forEach((figure) => {
                    step.push(figure.getValue());
                });

                if (step.filter(Boolean).length > 1) {
                    meta.data.push(step);
                }
            });

            if (!startTime) {
                startTime = formattedTime;
            }
        },

        onBeforeClose(order) {
            const usage = this.debut.orders.reduce((sum, order) => {
                if ('orderId' in order) {
                    return sum + order.lots * order.price;
                }

                return sum;
            }, 0);

            if (Math.floor(usage) > this.debut.opts.amount * (this.debut.opts.equityLevel || 1) && showMargin) {
                margins.push([formatTime(order.time), usage]);
            }
        },

        async onClose(order, closing) {
            if (isManualOrder) {
                return;
            }

            const closeTime = formatTime(order.time);
            const openTime = formatTime(closing.time);
            const isProfitable = orders.getCurrencyProfit(closing, order.price) >= 0;

            deals.data.push([
                openTime,
                closing.type == OrderType.BUY ? 1 : 0,
                closing.price,
                closing.type,
                closeTime,
                isProfitable ? 1 : 0,
                order.price,
                isProfitable ? 'Exit' : 'Stop',
            ]);
        },

        async onDispose() {
            // Последняя свечка
            ohlcv.push([formatTime(lastTick.time), lastTick.o, lastTick.h, lastTick.l, lastTick.c, lastTick.v]);

            const savePath = path.join(__dirname + '/../static/data.json');

            file.ensureFile(savePath);
            file.saveFile(savePath, createVisualData());
            console.log('Report data is ready...');
        },
    };
}
