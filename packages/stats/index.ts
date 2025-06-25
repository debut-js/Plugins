import { PluginInterface, ExecutedOrder, OrderType, TimeFrame } from '@debut/types';

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

export type ReportData = {
    performance: PerformanceMetrics;
};

export type RawStatsData = {
    openedOrders: ExecutedOrder[];
    closedOrders: ClosedDeal[];
    equityOnClose: Array<[number, number]>;
    margins: Array<[number, number]>;
};

export interface StatsPluginAPI {
    stats: Methods;
}

export interface Methods {
    report(): ReportData;
    getState(): StatsState;
    cleanup(): void;
    getPerformanceMetrics(): PerformanceMetrics;
    getRawData(): RawStatsData;
}

export interface StatsInterface extends PluginInterface {
    name: 'stats';
    api: Methods;
}

interface PerformanceMetrics {
    initialCapital: number;
    totalPL: number;
    netProfit: number;
    buyHoldReturn: number;
    strategyOutperformance: number;
    openPL: number;
    grossProfit: number;
    grossLoss: number;
    profitFactor: number;
    commissionPaid: number;
    accountSizeRequired: number;
    accountSizeEfficiency: number;
    returnOnAccount: number;
    returnOnInitialCapital: number;
    returnOnMaxDrawdown: number;
    maxEquityRunup: number;
    maxEquityDrawdown: number;
    avgTimeBetweenProfitPeaks: number;
    dateOfMaxEquityRunup: number | null;
    dateOfMaxEquityDrawdown: number | null;
    dateOfMaxEquityDrawdownIntra: number | null;
    returnOfMaxEquityDrawdown: number;
    returnOfMaxEquityDrawdownIntra: number;
    maxEquityRunupOnInitialCapital: number;
    maxContractsHeld: number;
    netProfitAsPercentOfLargestLoss: number;
    largestLoserAsPercentOfGrossLoss: number;
    largestWinnerAsPercentOfGrossProfit: number;
}

// Новый тип для закрытой сделки
interface ClosedDeal {
    openPrice: number;
    closePrice: number;
    openTime: number;
    closeTime: number;
    lots: number;
    commission: number;
    type: OrderType;
    cid: string | number;
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
        currentMargin: 0,
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

    const openedOrders: ExecutedOrder[] = [];
    const closedOrders: ClosedDeal[] = [];
    const equityOnClose: Array<[number, number]> = [];
    const margins: Array<[number, number]> = [];

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
            report: (): ReportData => {
                return {
                    performance: roundPerformanceMetrics(
                        calculatePerformanceMetrics(openedOrders, closedOrders, equityOnClose, margins, state)
                    ),
                };
            },
            getPerformanceMetrics: () => {
                return roundPerformanceMetrics(
                    calculatePerformanceMetrics(openedOrders, closedOrders, equityOnClose, margins, state)
                );
            },
            getRawData: (): RawStatsData => ({
                openedOrders,
                closedOrders,
                equityOnClose,
                margins,
            }),
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

            // Инкрементально обновляем маржу
            temp.currentMargin += order.price * order.lots;
            state.maxMarginUsage = Math.max(state.maxMarginUsage, temp.currentMargin);
            margins.push([order.time, temp.currentMargin]);

            openedOrders.push(order);
        },

        async onClose(order: ExecutedOrder, closing: ExecutedOrder) {
            if (order.reduce) {
                addOrderCounter(closing);
            }
            const lots = closing.executedLots || closing.lots || 1;
            const openPrice = closing.openPrice ?? closing.price;
            const closePrice = order.price;
            const rev = closing.type === OrderType.SELL ? -1 : 1;
            const commission = Math.abs(order.commission?.value || 0) + Math.abs(closing.commission?.value || 0);
            const profit = (closePrice - openPrice) * lots * rev - commission;

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

            if (state.balance < state.maxBalance) {
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
                if (state.maxWin < 0) {
                    state.maxWin = 0;
                }

                temp.winSum += profit;
                temp.sumLooseStreak += temp.looseStreak;
                temp.looseStreak = 0;

                if (temp.winStreak === 0) {
                    temp.winCountStreak++;
                }

                temp.winStreak++;

                // Закрытие будет иметь противоположный тип, поэтмоу считаем инверсию
                if (closing.type === OrderType.BUY) {
                    state.shortRight++;
                } else {
                    state.longRight++;
                }

                temp.winLifespan += closing.time - order.time;
            } else {
                temp.looseSum += profit;
                temp.sumWinStreak += temp.winStreak;
                temp.winStreak = 0;

                if (state.maxLoose > 0) {
                    state.maxLoose = 0;
                }

                if (temp.looseStreak === 0) {
                    temp.looseCountStreak++;
                }

                temp.looseStreak++;

                temp.looseLifespan += closing.time - order.time;
            }

            if (state.failLine < temp.looseStreak) {
                state.failLine = temp.looseStreak;
            }

            if (state.rightLine < temp.winStreak) {
                state.rightLine = temp.winStreak;
            }

            // Формируем закрытую сделку
            const closedDeal: ClosedDeal = {
                openPrice: closing.price,
                closePrice: order.price,
                openTime: closing.time,
                closeTime: order.time,
                lots,
                commission,
                type: closing.type,
                cid: closing.cid,
            };
            closedOrders.push(closedDeal);
            equityOnClose.push([closing.time, state.balance]);
            margins.push([closing.time, temp.currentMargin]);
        },
    };
}

function calculatePerformanceMetrics(
    openedOrders: ExecutedOrder[],
    closedOrders: ClosedDeal[],
    equityOnClose: Array<[number, number]>,
    margins: Array<[number, number]>,
    state: StatsState,
): PerformanceMetrics {
    // Initial capital
    const initialCapital = state.startBalance;

    // Gross profit, gross loss, commission paid, largest winner/loser
    let grossProfit = 0;
    let grossLoss = 0;
    let commissionPaid = 0;
    let largestWinner: number | null = null;
    let largestLoser: number | null = null;
    let openPL = 0;
    let totalPL = 0;
    let netProfit = 0;
    let buyHoldReturn = 0;
    let strategyOutperformance = 0;
    let profitFactor = 0;
    let maxContractsHeld = 0;
    let maxEquityRunup = 0;
    let maxEquityDrawdown = 0;
    let maxEquityRunupOnInitialCapital = 0;
    let accountSizeRequired = 0;
    let accountSizeEfficiency = 0;
    let returnOnAccount = 0;
    let returnOnInitialCapital = 0;
    let returnOnMaxDrawdown = 0;
    let avgTimeBetweenProfitPeaks = 0;
    let dateOfMaxEquityRunup: number | null = null;
    let dateOfMaxEquityDrawdown: number | null = null;
    let dateOfMaxEquityDrawdownIntra: number | null = null;
    let returnOfMaxEquityDrawdown = 0;
    let returnOfMaxEquityDrawdownIntra = 0;
    let netProfitAsPercentOfLargestLoss = 0;
    let largestLoserAsPercentOfGrossLoss = 0;
    let largestWinnerAsPercentOfGrossProfit = 0;

    // --- Считаем сделки только по closedOrders ---
    for (const deal of closedOrders) {
        const profit = getCurrencyProfit(deal);
        commissionPaid += deal.commission;
        if (profit > 0) {
            grossProfit += profit;
            if (largestWinner === null || profit > largestWinner) largestWinner = profit;
        }
        if (profit < 0) {
            grossLoss += profit;
            if (largestLoser === null || profit < largestLoser) largestLoser = profit;
        }
    }
    grossLoss = Math.abs(grossLoss);
    profitFactor = grossLoss > 0 ? grossProfit / grossLoss : 0;
    netProfit = grossProfit - grossLoss - commissionPaid;

    // --- Buy & Hold ---
    if (equityOnClose.length > 1) {
        const entryPrice = equityOnClose[0][1];
        const finalPrice = equityOnClose[equityOnClose.length - 1][1];
        const contracts = initialCapital / entryPrice;
        buyHoldReturn = (finalPrice - entryPrice) * contracts;
        strategyOutperformance = netProfit - buyHoldReturn;
    }

    // --- Open P&L (нереализованный) ---
    // Для простоты считаем 0, если нет открытых позиций (иначе нужен доступ к текущим позициям)
    openPL = 0;

    // --- Total P&L ---
    totalPL = netProfit + openPL;
    // --- Max contracts held ---
    let currentContracts = 0;
    for (const order of openedOrders) {
        if (order.type === OrderType.BUY) {
            currentContracts += order.executedLots || order.lots || 1;
        } else if (order.type === OrderType.SELL) {
            currentContracts -= order.executedLots || order.lots || 1;
        }
        if (Math.abs(currentContracts) > maxContractsHeld) {
            maxContractsHeld = Math.abs(currentContracts);
        }
    }

    // --- Account size required ---
    let maxMargin = 0;
    if (margins.length) {
        maxMargin = Math.max(...margins.map((m) => m[1]));
    }
    // --- Max equity drawdown/runup ---
    if (equityOnClose.length) {
        let peak = equityOnClose[0][1];
        let trough = equityOnClose[0][1];
        let maxDD = 0;
        let maxRunup = 0;
        let lastPeakTime = equityOnClose[0][0];
        let lastTroughTime = equityOnClose[0][0];
        for (const [time, bal] of equityOnClose) {
            if (bal > peak) {
                peak = bal;
                lastPeakTime = time;
            }
            if (bal < trough) {
                trough = bal;
                lastTroughTime = time;
            }
            const dd = peak - bal;
            if (dd > maxDD) {
                maxDD = dd;
                dateOfMaxEquityDrawdown = time;
            }
            const runup = bal - trough;
            if (runup > maxRunup) {
                maxRunup = runup;
                dateOfMaxEquityRunup = time;
            }
        }
        maxEquityDrawdown = maxDD;
        maxEquityRunup = maxRunup;
    }
    maxEquityRunupOnInitialCapital = initialCapital ? maxEquityRunup / initialCapital : 0;
    accountSizeRequired = maxMargin + Math.abs(maxEquityDrawdown);
    accountSizeEfficiency = netProfit
        ? (margins.reduce((sum, m) => sum + m[1], 0) / margins.length / netProfit) * 100
        : 0;
    returnOnAccount = accountSizeRequired ? (netProfit / accountSizeRequired) * 100 : 0;
    returnOnInitialCapital = initialCapital ? (netProfit / initialCapital) * 100 : 0;
    returnOnMaxDrawdown = maxEquityDrawdown ? (netProfit / maxEquityDrawdown) * 100 : 0;
    returnOfMaxEquityDrawdown = maxEquityDrawdown ? netProfit / maxEquityDrawdown : 0;
    returnOfMaxEquityDrawdownIntra = 0; // Требует отдельной intra-day логики

    // --- Avg. Time Between Trade Profit Peaks ---
    let lastPeakTime = null;
    let sumIntervals = 0;
    let peakCount = 0;
    let maxEquity = -Infinity;
    for (let i = 0; i < equityOnClose.length; i++) {
        const [time, equity] = equityOnClose[i];
        if (equity > maxEquity) {
            if (lastPeakTime !== null) {
                sumIntervals += time - lastPeakTime;
                peakCount++;
            }
            lastPeakTime = time;
            maxEquity = equity;
        }
    }
    avgTimeBetweenProfitPeaks = peakCount ? sumIntervals / peakCount : 0;

    // --- Net Profit as % of Largest Loss ---
    netProfitAsPercentOfLargestLoss = largestLoser ? netProfit / Math.abs(largestLoser) : 0;
    largestLoserAsPercentOfGrossLoss = largestLoser && grossLoss ? Math.abs(largestLoser) / grossLoss : 0;
    largestWinnerAsPercentOfGrossProfit = largestWinner && grossProfit ? largestWinner / grossProfit : 0;

    return {
        initialCapital,
        totalPL,
        netProfit,
        buyHoldReturn,
        strategyOutperformance,
        openPL,
        grossProfit,
        grossLoss,
        profitFactor,
        commissionPaid,
        accountSizeRequired,
        accountSizeEfficiency,
        returnOnAccount,
        returnOnInitialCapital,
        returnOnMaxDrawdown,
        maxEquityRunup,
        maxEquityDrawdown,
        avgTimeBetweenProfitPeaks,
        dateOfMaxEquityRunup,
        dateOfMaxEquityDrawdown,
        dateOfMaxEquityDrawdownIntra,
        returnOfMaxEquityDrawdown,
        returnOfMaxEquityDrawdownIntra,
        maxEquityRunupOnInitialCapital,
        maxContractsHeld,
        netProfitAsPercentOfLargestLoss,
        largestLoserAsPercentOfGrossLoss,
        largestWinnerAsPercentOfGrossProfit,
    };
}

function roundPerformanceMetrics(metrics: PerformanceMetrics): PerformanceMetrics {
    const rounded: any = {};
    const obj = metrics as Record<string, any>;
    for (const key in obj) {
        let value = obj[key];
        if (key === 'avgTimeBetweenProfitPeaks') {
            // value — это миллисекунды, преобразуем в часы или дни
            if (typeof value === 'number' && isFinite(value) && value > 0) {
                const hours = value / (1000 * 60 * 60);
                if (hours < 24) {
                    value = `${Math.round(hours * 100) / 100} ч.`;
                } else {
                    const days = hours / 24;
                    value = `${Math.round(days * 100) / 100} дн.`;
                }
            } else {
                value = '0 ч.';
            }
        } else if (/date|time/i.test(key) && typeof value === 'number' && isFinite(value)) {
            // Форматируем дату как 'дд.мм.гггг чч:мм'
            const d = new Date(value);
            function pad(n: number) { return n.toString().padStart(2, '0'); }
            value = `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
        } else if (typeof value === 'number' && isFinite(value)) {
            value = Math.round(value * 100) / 100;
        }
        rounded[key] = value;
    }
    return rounded as PerformanceMetrics;
}

function getCurrencyProfit(deal: ClosedDeal): number {
    const rev = deal.type === OrderType.SELL ? -1 : 1;
    return (deal.closePrice - deal.openPrice) * deal.lots * rev - deal.commission;
}
