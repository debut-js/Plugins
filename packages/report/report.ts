import { PluginInterface, Candle, OrderType, ExecutedOrder, TimeFrame } from '@debut/types';
import { file } from '@debut/plugin-utils';
import { StatsInterface } from '@debut/plugin-stats';
import path from 'path';
import { formatTime } from './utils';
import type { VirtualTakesPlugin } from '@debut/plugin-virtual-takes';
import type { DynamicTakesPlugin } from '@debut/plugin-dynamic-takes';

export const enum FillType {
    'tozeroy' = 'tozeroy',
    'tonexty' = 'tonexty',
    'toself' = 'toself',
}

export type OrderInfo = [
    closeTime: number,
    id: number | string,
    type: 'Open' | 'Close' | 'Both' | 'Entry',
    price: number,
    orderType: OrderType,
    stopPrice?: number,
    closeType?: 'Exit',
    closePrice?: number,
    closeTime?: number,
    openTime?: number,
];

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
        addOpenTarget: (cid: number, time: string, price: number, operation: OrderType) => void;
    };
}

export type IndicatorsSchema = Array<Indicator>;

export interface IndicatorHeader {
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
export const enum FigureModifier {
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
    } = { toolbar: true };

    const deals = {
        type: 'Orders',
        name: 'Orders',
        data: [] as Array<OrderInfo>,
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
    let virtualTakes: VirtualTakesPlugin;
    let dynamicTakes: DynamicTakesPlugin;

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

    function createVisualData(interval: TimeFrame) {
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
            settings.rangeFrom = 0;
            settings.rangeTo = ohlcv.length;
        }

        const chart = {
            type: 'Candles',
            indexBased: true,
            data: ohlcv,
            tf: debutToChartTimeframe(interval),
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
                settings.rangeFrom = from;
                settings.rangeTo = to;
                settings.toolbar = false;
            },
            addOpenTarget(cid: number, time: string, price: number, operation: OrderType) {
                const fTime = formatTime(time);

                deals.data.push([fTime, cid, 'Entry', price, operation, getTakes(cid)]);
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
                cid: number,
                operation: OrderType,
                openTime: string,
                closeTime: string,
                openPrice: number,
                closePrice: number,
            ) {
                deals.data.push([
                    formatTime(closeTime),
                    cid,
                    'Both',
                    openPrice,
                    operation,
                    0,
                    'Exit',
                    closePrice,
                    formatTime(openTime),
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

            virtualTakes = this.findPlugin('takes');
            dynamicTakes = this.findPlugin('dynamicTakes');
        },

        async onTick(tick) {
            lastTick = tick;
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

            deals.data.push([
                closeTime,
                order.reduce ? `r-${closing.cid}` : closing.cid,
                'Both',
                closing.price,
                closing.type,
                getTakes(order.cid),
                'Exit',
                order.price,
                openTime,
            ]);

            equity.push([formatTime(order.time), stats.api.getState().profit]);
        },

        async onDispose() {
            // Последняя свечка
            ohlcv.push([formatTime(lastTick.time), lastTick.o, lastTick.h, lastTick.l, lastTick.c, lastTick.v]);

            const savePath = path.join(__dirname + '/../static/data.json');

            file.ensureFile(savePath);
            file.saveFile(savePath, createVisualData(this.debut.opts.interval));
            console.log('Report data is ready...');
        },
    };
}

export function debutToChartTimeframe(tf: TimeFrame) {
    switch (tf) {
        case '1min':
            return '1m';
        case '5min':
            return '5m';
        case '15min':
            return '15m';
        case '30min':
            return '30m';
        case '1h':
            return '1H';
        case '4h':
            return '4H';
        case 'day':
            return '1D';
    }

    throw 'Unsupported player interval';
}
