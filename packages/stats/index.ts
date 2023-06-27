import { PluginInterface, ExecutedOrder, OrderType, TimeFrame } from '@debut/types/dist';
import { math, orders, date } from '@debut/plugin-utils';

export type StatsOptions = {
    amount: number;
    interval: TimeFrame;
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
    potentialDD: number;
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
    avgProfitLifespan: number; // candles
    avgLooseLifespan: number;
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
            potentialDD: 0,
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
            avgProfitLifespan: 0,
            avgLooseLifespan: 0,
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
        winLifespan: 0,
        looseLifespan: 0,
    };

    function addOrderCounter(order: ExecutedOrder) {
        const isShort = order.type === OrderType.SELL;

        if (isShort) {
            state.short++;
        } else {
            state.long++;
        }
    }

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
                res.avgProfitLifespan = temp.winLifespan / date.intervalToMs(opts.interval) / profitCount || 0;
                res.avgLooseLifespan = temp.looseLifespan / date.intervalToMs(opts.interval) / looseCount || 0;

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
            addOrderCounter(order);
            // Decrase balance and profit by opening comission
            const fees = order.commission.value;

            state.balance -= fees;
            state.profit -= fees;
        },

        async onClose(order: ExecutedOrder, closing: ExecutedOrder) {
            // For reduce incrase orders total counter for original order, because
            // reduce its should be logged as separate order
            if (order.reduce) {
                addOrderCounter(closing);
            }

            const amount = this.debut.opts.amount * (this.debut.opts.equityLevel || 1);

            state.maxMarginUsage = Math.max(
                state.maxMarginUsage,
                this.debut.orders.reduce((sum, order) => sum + order.lots * order.price, 0),
            );

            const rev = closing.type === OrderType.SELL ? -1 : 1;
            // For reduce order we have close order with how much lots are executed
            // Decrase commission from profit
            const profit = (order.price - order.openPrice!) * order.executedLots * rev - order.commission.value;
            const percentProfit = (profit / amount) * 100;
            const isLastOrder = !this.debut.ordersCount;

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
                const ddFromStartBalance = ((state.maxBalance - state.balance) / state.startBalance) * 100;

                if (state.relativeDD < dd) {
                    state.relativeDD = dd;
                }

                if (state.potentialDD < ddFromStartBalance) {
                    state.potentialDD = ddFromStartBalance;
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

                temp.winLifespan += order.time - closing.time;
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

                temp.looseLifespan += order.time - closing.time;
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
