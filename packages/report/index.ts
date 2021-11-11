import { PluginInterface, Candle, OrderType } from '@debut/types';
import { file, orders } from '@debut/plugin-utils';
import { StatsInterface } from '@debut/plugin-stats';
import path from 'path';

export const enum FigureType {
    'bar' = 'bar',
    'line' = 'scatter',
}

export const enum FillType {
    'tozeroy' = 'tozeroy',
    'tonexty' = 'tonexty',
}
export interface IndicatorsData {
    line: {
        width: number;
    };
    mode: string;
    name: string;
    type: string;
    fill?: 'tozeroy' | 'tonexty';
    x: string[];
    y: number[];
    yaxis: string;
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
export interface Indicator {
    name: string;
    figures: Array<{
        name: string;
        type?: FigureType;
        fill?: FillType;
        getValue: () => number;
    }>;
    levels?: number[];
    inChart?: boolean;
}

type Deal = {
    type: string;
    openTime: string;
    openPrice: number;
    closeTime: string;
    open?: boolean;
};

export function reportPlugin(showMargin = true): PluginInterface {
    let indicatorsSchema: IndicatorsSchema = [];
    const indicatorsData: Record<string, IndicatorsData[]> = {};
    const chartData: Array<{ time: string; open: number; high: number; low: number; close: number }> = [];
    const deals: Deal[] = [];
    const profit: Array<{ profit: number; time: string }> = [];
    const equity: Array<{ balance: number; time: string }> = [];
    const margins: Array<{ usage: number; time: string }> = [];
    let limitFrom: number;
    let limitTo: number;

    let startTime: string;
    let lastTick: Candle;
    let stats: StatsInterface;
    let disabledProfit = false;
    let isManualOrder = false;
    let step = 0.2;

    const visLayout: Record<string, any> = {
        xaxis: {
            showspikes: true,
            spikemode: 'across',
            autorange: true,
            domain: [0, 1],
            type: 'category',
            rangeslider: { visible: false },
            visible: false,
        },
        yaxis: {
            autorange: true,
            domain: [0, 1],
            type: 'linear',
            color: '#c2c2c2',
            zerolinecolor: '#9E9E9E',
            gridcolor: '#3b3d46',
            title: {
                font: {
                    color: '#ffffff',
                    size: 12,
                },
            },
            rangebreaks: {
                tick: {
                    font: {
                        color: '#FFFFFF',
                        size: 12,
                    },
                },
            },
        },
        yaxis2: {
            autorange: true,
            domain: [0, 0.2],
            type: 'linear',
        },
        shapes: [],
    };

    function getVisXAxis() {
        const x: string[] = [];

        chartData.forEach((candle) => {
            x.push(candle.time);
        });

        return x;
    }

    function formatTime(stamp: number | string) {
        return new Date(stamp).toLocaleString();
    }

    function createCandlesAndDealsVisData() {
        const candlesData = {
            x: getVisXAxis(),
            close: [] as number[],
            high: [] as number[],
            low: [] as number[],
            open: [] as number[],
        };

        chartData.forEach((candle) => {
            candlesData.open.push(candle.open);
            candlesData.high.push(candle.high);
            candlesData.low.push(candle.low);
            candlesData.close.push(candle.close);
        });

        return { candlesData, deals };
    }

    function getProfitVisData() {
        return {
            x: profit.map((o) => o.time),
            y: profit.map((o) => o.profit),
            type: 'scatter',
            mode: 'lines',
            line: { width: 2 },
            marker: { color: '#29ab16' },
            name: 'Profit',
            yaxis: 'y2',
        };
    }

    function getEquityVisData() {
        return {
            x: equity.map((o) => o.time),
            y: equity.map((o) => o.balance),
            type: 'scatter',
            mode: 'lines',
            line: { width: 1 },
            marker: { color: 'rgba(66, 206, 245, 0.6)' },
            name: 'Equity',
            yaxis: 'y2',
        };
    }

    function getMarginVisData() {
        return {
            x: margins.map((o) => o.time),
            y: margins.map((o) => o.usage),
            type: 'bar',
            marker: { color: 'orange' },
            name: 'Margin',
            yaxis: 'y2',
        };
    }

    function setupDomains() {
        const count = indicatorsSchema.filter((schema) => !schema.inChart).length + (disabledProfit ? 0 : 1);
        let startDomain: number;
        const offset = 0.015;

        if (count === 0) {
            startDomain = step;
        } else {
            startDomain = 0.5;
        }

        let currentDomainOffset = startDomain;
        visLayout.yaxis.domain = [startDomain, 1];

        step = (1 - startDomain) / count;

        indicatorsSchema.forEach((schema, index) => {
            const axisName = `yaxis${index + 3}`;

            if (indicatorsData[schema.name]) {
                let domain: number[] = [];

                if (!schema.inChart) {
                    domain = [currentDomainOffset - step, currentDomainOffset - offset];
                    currentDomainOffset -= step;
                }

                visLayout[axisName].domain = domain;
            }
        });

        visLayout.yaxis2.domain = [0, currentDomainOffset - offset];
    }

    function createVisualData() {
        let subplots: any[] = [];

        if (!disabledProfit) {
            subplots.push(getProfitVisData(), getEquityVisData());

            if (showMargin) {
                subplots.push(getMarginVisData());
            }
        }

        if (indicatorsSchema) {
            indicatorsSchema.forEach((indicatorSchema) => {
                subplots = subplots.concat(indicatorsData[indicatorSchema.name]);
            });
        }

        return {
            ...createCandlesAndDealsVisData(),
            layout: visLayout,
            subplots,
        };
    }

    return {
        name: 'report',

        api: {
            addIndicators(schema: IndicatorsSchema) {
                indicatorsSchema = schema;
                let inChartAxisName: string;

                schema.forEach((schema, index) => {
                    const axisName = `yaxis${index + 3}`;
                    const axisShortName = `y${index + 3}`;

                    if (!indicatorsData[schema.name]) {
                        const data: IndicatorsData[] = [];
                        const inChart = schema.inChart ? { overlaying: 'y1' } : {};

                        if (schema.inChart) {
                            if (!inChartAxisName) {
                                inChartAxisName = axisShortName;
                            }

                            visLayout.yaxis.matches = inChartAxisName;
                        }

                        visLayout[axisName] = {
                            autorange: true,
                            gridcolor: '#3b3d46',
                            color: '#c2c2c2',
                            type: 'linear',
                            ...inChart,
                        };

                        schema.figures.forEach((figure, idx) => {
                            data.push({
                                line: {
                                    width: 1,
                                },
                                mode: 'lines',
                                name: figure.name,
                                type: figure.type || 'scatter',
                                fill: figure.fill,
                                x: [],
                                y: [],
                                yaxis: schema.inChart ? inChartAxisName : axisShortName, // y1 y2 заняты
                            });
                        });

                        indicatorsData[schema.name] = data;
                    }
                });

                setupDomains();
            },

            disableProfitPlot() {
                disabledProfit = true;

                setupDomains();

                delete visLayout.yaxis2;
                const count = indicatorsSchema.filter((schema) => !schema.inChart).length;

                if (count === 0) {
                    visLayout.yaxis.domain = [0, 1];
                }
            },

            setXRange(from: number, to: number) {
                limitFrom = from;
                limitTo = to;

                // chartData = chartData.filter(item => item.time);
                // indicatorsData;
                // deals;
                // profit;
                // equity;
                // margins;
            },
            addOpenTarget(time: string, price: number, operation: OrderType) {
                deals.push({
                    type: operation === OrderType.BUY ? 'Long' : 'Short',
                    openTime: formatTime(time),
                    openPrice: price,
                    closeTime: formatTime(time),
                    open: true,
                });
            },
            disableOrdersDisplay() {
                isManualOrder = true;
            },
            resetOrders() {
                deals.length = 0;
            },
            cleanup() {
                deals.length = 0;
                chartData.length = 0;
                equity.length = 0;
                profit.length = 0;

                if (indicatorsSchema.length) {
                    indicatorsSchema.forEach((schema) => {
                        const data = indicatorsData[schema.name];

                        schema.figures.forEach((figure, idx) => {
                            const lineData = data[idx];
                            lineData.x.length = 0;
                            lineData.y.length = 0;
                        });
                    });
                }
            },
            setManualOrder(
                operation: OrderType,
                openTime: string,
                closeTime: string,
                openPrice: number,
                closePrice: number,
            ) {
                // Plotly visualization.
                const deal = {
                    type: operation === OrderType.BUY ? 'Long' : 'Short',
                    openTime: formatTime(openTime),
                    openPrice,
                    closeTime: formatTime(closeTime),
                    closePrice,
                };

                deals.push(deal);
            },
        },

        onInit() {
            stats = this.findPlugin<StatsInterface>('stats');

            if (!stats) {
                throw 'Genetic Shutdown: stats plugin is required!';
            }

            visLayout.title = this.debut.opts.ticker;

            // Replace for binance BTCUSDT, removes USDT
            if (this.debut.opts.ticker.endsWith(this.debut.opts.currency)) {
                visLayout.title = visLayout.title.replace(this.debut.opts.currency, '');
            }

            visLayout.title += ` / ${this.debut.opts.currency} - ${this.debut.opts.broker.toLocaleUpperCase()}`;
        },

        async onTick(tick) {
            lastTick = tick;
        },

        async onCandle(tick) {
            if (limitTo && limitFrom && (tick.time < limitFrom || tick.time > limitTo)) {
                return;
            }

            let profit = orders.getCurrencyBatchProfit(this.debut.orders, tick.c);

            if (profit === 0) {
                return;
            }

            equity.push({ balance: stats.api.getState().profit + profit, time: formatTime(tick.time) });
        },

        async onAfterCandle(candle) {
            if (limitTo && limitFrom && (candle.time < limitFrom || candle.time > limitTo)) {
                return;
            }

            chartData.push({
                time: formatTime(candle.time),
                open: candle.o,
                high: candle.h,
                low: candle.l,
                close: candle.c,
            });

            indicatorsSchema.forEach((schema) => {
                const data = indicatorsData[schema.name];

                schema.figures.forEach((figure, idx) => {
                    const lineData = data[idx];

                    lineData.y.push(figure.getValue());
                    lineData.x.push(formatTime(candle.time));
                });
            });

            if (!startTime) {
                startTime = formatTime(candle.time);
            }
        },

        async onBeforeClose(order) {
            if (limitTo && limitFrom && (order.time < limitFrom || order.time > limitTo)) {
                return;
            }

            const usage = this.debut.orders.reduce((sum, order) => {
                if ('orderId' in order) {
                    return sum + order.lots * order.price;
                }

                return sum;
            }, 0);

            margins.push({ usage, time: formatTime(order.time) });
        },

        async onClose(order, closing) {
            if (limitTo && limitFrom && (order.time < limitFrom || order.time > limitTo)) {
                return;
            }

            if (isManualOrder) {
                return;
            }

            // Plotly visualization.
            const deal = {
                type: closing.type === OrderType.BUY ? 'Long' : 'Short',
                openTime: formatTime(closing.time),
                openPrice: closing.price,
                closeTime: formatTime(order.time),
                closePrice: order.price,
                sandbox: order.sandbox,
            };

            deals.push(deal);

            if (!this.debut.ordersCount) {
                profit.push({ profit: stats.api.getState().profit, time: formatTime(order.time) });
            }
        },

        async onDispose() {
            if (!limitTo || !limitFrom || (lastTick.time >= limitFrom && lastTick.time <= limitTo)) {
                // Последняя свечка
                chartData.push({
                    time: formatTime(lastTick.time),
                    open: lastTick.o,
                    high: lastTick.h,
                    low: lastTick.l,
                    close: lastTick.c,
                });
            }

            indicatorsSchema.forEach((schema, schemaIdx) => {
                if (schema.levels) {
                    schema.levels.forEach((level) => {
                        visLayout.shapes.push({
                            type: 'line',
                            yref: `y${schemaIdx + 3}`,
                            x0: startTime,
                            y0: level,
                            x1: formatTime(lastTick.time),
                            y1: level,
                            line: {
                                color: '#909090',
                                width: 1,
                                dash: 'dashdot',
                            },
                        });
                    });
                }
            });

            const savePath = path.join(__dirname + '/../static/data.json');

            file.ensureFile(savePath);
            file.saveFile(savePath, createVisualData());
            console.log('Report data is ready...');
        },
    };
}
