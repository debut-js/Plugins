import { PluginInterface, ExecutedOrder, OrderType } from '@debut/types';
import { math, orders } from '@debut/plugin-utils';

export type StatsOptions = {
    amount: number;
};

export interface StatsState {
    startBalance: number;
    balance: number;
    maxBalance: number;
    minBalance: number;
    maxMarginUsage: number;
    profit: number;
    long: number;
    longRight: number;
    short: number;
    shortRight: number;
    absoluteDD: number;
    relativeDD: number;
    maxWin: number;
    maxLoose: number;
    profitProb: number;
    looseProb: number;
    avgProfit: number;
    avgLoose: number;
    expectation: number;
    failLine: number;
    rightLine: number;
    avgFailLine: number;
    avgRightLine: number;
    ticksHandled: number;
    candlesHandled: number;
}
export interface StatsPluginAPI {
    stats: Methods;
}

export interface Methods {
    report(): StatsState;
    getState(): StatsState;
    cleanup(): void;
}

export interface StatsInterface extends PluginInterface {
    name: 'stats';
    api: Methods;
}

export function statsPlugin(opts: StatsOptions): StatsInterface {
    function getState() {
        return {
            startBalance: opts.amount,
            balance: opts.amount,
            maxBalance: opts.amount,
            minBalance: opts.amount,
            maxMarginUsage: opts.amount,
            profit: 0,
            long: 0,
            longRight: 0,
            short: 0,
            shortRight: 0,
            absoluteDD: 0,
            relativeDD: 0,
            maxWin: 0,
            maxLoose: 0,
            profitProb: 0,
            looseProb: 0,
            avgProfit: 0,
            avgLoose: 0,
            expectation: 0,
            failLine: 0,
            rightLine: 0,
            avgFailLine: 0,
            avgRightLine: 0,
            ticksHandled: 0,
            candlesHandled: 0,
        };
    }

    let state: StatsState = getState();

    const temp = {
        sumLooseStreak: 0,
        looseCountStreak: 0,
        sumWinStreak: 0,
        winCountStreak: 0,
        looseSum: 0,
        winSum: 0,
        looseStreak: 0,
        winStreak: 0,
    };

    return {
        name: 'stats',

        api: {
            getState: () => state,
            cleanup: () => {
                state = getState();
            },
            report: () => {
                const res = { ...state };
                const ordersCount = res.long + res.short;
                const looseCount = ordersCount - res.longRight - res.shortRight;
                const profitCount = res.longRight + res.shortRight;

                res.avgFailLine = temp.sumLooseStreak / temp.looseCountStreak;
                res.avgRightLine = temp.sumWinStreak / temp.winCountStreak;
                res.avgLoose = Math.abs(temp.looseSum) / looseCount || 0;
                res.avgProfit = temp.winSum / profitCount || 0;
                res.profitProb = profitCount / ordersCount || 0;
                res.looseProb = looseCount / ordersCount || 0;
                res.expectation = res.profitProb * res.avgProfit - res.looseProb * res.avgLoose;

                // FIXME: Types should be right
                Object.keys(res).forEach((key) => {
                    // @ts-ignore
                    if (key in res && typeof res[key] === 'number') {
                        // @ts-ignore
                        res[key] = math.toFixed(res[key]);
                    }
                });

                return res;
            },
        },

        async onTick() {
            state.ticksHandled++;
        },

        async onCandle() {
            state.candlesHandled++;
        },

        async onOpen(order) {
            const isShort = order.type === OrderType.SELL;

            if (isShort) {
                state.short++;
            } else {
                state.long++;
            }
        },

        async onClose(order: ExecutedOrder, closing: ExecutedOrder) {
            const amount = this.debut.opts.amount * (this.debut.opts.equityLevel || 1);

            state.maxMarginUsage = Math.max(
                state.maxMarginUsage,
                this.debut.orders.reduce((sum, order) => sum + order.lots * order.price, 0),
            );

            // Прибыль минус налог на закрытии
            const profit = orders.getCurrencyProfit(closing, order.price) - order.commission.value;
            const percentProfit = (profit / amount) * 100;
            const isLastOrder = !this.debut.orders.length;

            state.balance += profit;
            state.profit += profit;

            if (state.balance > state.maxBalance) {
                state.maxBalance = state.balance;
            }

            if (state.profit < 0) {
                const currentEquity = opts.amount - state.profit;

                if (currentEquity < state.minBalance) {
                    state.minBalance = currentEquity;
                }
            }

            if (isLastOrder && state.profit < 0) {
                // Инверсия для того чтобы убрать знак минус
                const currentEquity = amount - state.profit;
                const dd = math.percentChange(currentEquity, amount);

                if (state.absoluteDD < dd) {
                    state.absoluteDD = dd;
                }
            }

            if (isLastOrder && state.balance < state.maxBalance) {
                const dd = ((state.maxBalance - state.balance) / state.maxBalance) * 100;

                if (state.relativeDD < dd) {
                    state.relativeDD = dd;
                }
            }

            if (profit > 0) {
                // Perfomance reasons
                if (state.maxWin < percentProfit) {
                    state.maxWin = percentProfit;
                }

                temp.winSum += profit;
                temp.sumLooseStreak += temp.looseStreak;
                temp.looseStreak = 0;

                if (temp.winStreak === 0) {
                    temp.winCountStreak++;
                }

                temp.winStreak++;

                // Закрытие будет иметь противоположный тип, поэтмоу считаем инверсию
                if (order.type === OrderType.BUY) {
                    state.shortRight++;
                } else {
                    state.longRight++;
                }
            } else {
                temp.looseSum += profit;
                temp.sumWinStreak += temp.winStreak;
                temp.winStreak = 0;

                if (state.maxLoose > percentProfit) {
                    state.maxLoose = percentProfit;
                }

                if (temp.looseStreak === 0) {
                    temp.looseCountStreak++;
                }

                temp.looseStreak++;
            }

            if (state.failLine < temp.looseStreak) {
                state.failLine = temp.looseStreak;
            }

            if (state.rightLine < temp.winStreak) {
                state.rightLine = temp.winStreak;
            }
        },
    };
}
