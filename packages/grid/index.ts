import { PluginInterface, ExecutedOrder, OrderType, Candle, PluginCtx } from '@debut/types';
import { orders } from '@debut/plugin-utils';
import { DynamicTakesPlugin } from '@debut/plugin-dynamic-takes';

type GridLevel = { price: number; activated: boolean };
interface Methods {
    createGrid(price: number): Grid;
    getGrid(): Grid | null;
}

export interface GridPluginInterface extends PluginInterface {
    name: 'grid';
    api: Methods;
}

export interface GridPluginAPI {
    grid: Methods;
}

export type GridPluginOptions = {
    step: number; // дистанция первого уровня или всех, если не включен фибо
    fibo?: boolean; // фибоначи уровни
    martingale: number; // коэффициент мартингейла от 1-2
    levelsCount: number; // кол-во уровней грида
    takeProfit: number; // тейк в процентах 3 5 7 9 и тд
    stopLoss?: number; // общий стоп в процентах для всего грида
    reduceEquity?: boolean; // уменьшать доступный баланс с каждой сделкой
    trend?: boolean; // по тренду или против
    trailing?: boolean; // трейлинг последней сделки, требует плагин dynamic-takes
    collapse?: boolean; // collapse orders when close
};

export function gridPlugin(opts: GridPluginOptions): GridPluginInterface {
    let grid: GridClass | null;
    let startMultiplier: number;
    let amount: number;
    let ctx: PluginCtx;
    let fee: number;
    let zeroPrice = 0;
    let prevProfit = 0;
    let dynamicTakesPlugin: DynamicTakesPlugin;
    let trailingSetted = false;

    if (!opts.stopLoss) {
        opts.stopLoss = Infinity;
    }

    if (!opts.levelsCount) {
        opts.levelsCount = 6;
    }

    return {
        name: 'grid',

        api: {
            /**
             * Create new grid immediatly
             */
            createGrid(price: number) {
                grid = new GridClass(price, opts);
                // Fixation amount for all time grid lifecycle
                amount = ctx.debut.opts.amount * (ctx.debut.opts.equityLevel || 1);
                return grid;
            },

            /**
             * Get existing grid
             */
            getGrid() {
                return grid;
            },
        },
        onInit() {
            ctx = this;
            startMultiplier = this.debut.opts.lotsMultiplier || 1;
            fee = (this.debut.opts.fee || 0.02) / 100;

            if (opts.trailing) {
                dynamicTakesPlugin = this.findPlugin<DynamicTakesPlugin>('dynamicTakes');

                if (!dynamicTakesPlugin) {
                    throw new Error('@debut/plugin-dynamic-takes is required for trailing');
                }
            }
        },

        async onOpen(order: ExecutedOrder) {
            if (!grid) {
                grid = new GridClass(order.price, opts);
                // Fixation amount for all time grid lifecycle
                amount = ctx.debut.opts.amount * (ctx.debut.opts.equityLevel || 1);
            } else {
                zeroPrice = order.price;
            }
        },

        async onClose() {
            // When all orders are closed - revert multiplier
            if (this.debut.ordersCount === 0) {
                this.debut.opts.lotsMultiplier = startMultiplier;
                grid = null;
                trailingSetted = false;
            }
        },

        async onTick(tick: Candle) {
            if (trailingSetted) {
                return;
            }

            const ordersLen = this.debut.ordersCount;

            if (ordersLen) {
                // TODO: Create streaming profit watcher with nextValue
                const closingComission = orders.getCurrencyBatchComissions(this.debut.orders, tick.c, fee);
                const profit = orders.getCurrencyBatchProfit(this.debut.orders, tick.c) - closingComission;
                const percentProfit = (profit / amount) * 100;

                if (prevProfit < 0 && profit >= 0 && ordersLen > 1) {
                    zeroPrice = tick.c;
                }

                prevProfit = profit;

                if (percentProfit <= -opts.stopLoss!) {
                    await this.debut.closeAll(opts.collapse && this.debut.ordersCount > 1);
                    return;
                }

                if (percentProfit >= opts.takeProfit) {
                    if (opts.reduceEquity) {
                        if (!this.debut.opts.equityLevel) {
                            this.debut.opts.equityLevel = 1;
                        }

                        this.debut.opts.equityLevel *= 0.97;

                        if (this.debut.opts.equityLevel < 0.002) {
                            console.log(this.debut.getName(), 'Grid Disposed', new Date().toLocaleDateString());
                            this.debut.dispose();
                        }
                    }

                    if (opts.trailing) {
                        // Close all orders exclude last order
                        while (this.debut.ordersCount !== 1) {
                            await this.debut.closeOrder(this.debut.orders[0]);
                        }

                        dynamicTakesPlugin.api.setTrailingForOrder(this.debut.orders[0].cid, zeroPrice);
                        trailingSetted = true;
                    } else {
                        await this.debut.closeAll(opts.collapse);
                    }

                    return;
                }
            }

            if (grid) {
                if (tick.c <= grid.getNextLow()?.price) {
                    grid.activateLow();
                    const lotsMulti = opts.martingale ** grid.nextLowIdx;
                    this.debut.opts.lotsMultiplier = lotsMulti;
                    await this.debut.createOrder(opts.trend ? OrderType.SELL : OrderType.BUY);
                }

                if (tick.c >= grid.getNextUp()?.price) {
                    grid.activateUp();
                    const lotsMulti = opts.martingale ** grid.nextUpIdx;
                    this.debut.opts.lotsMultiplier = lotsMulti;
                    await this.debut.createOrder(opts.trend ? OrderType.BUY : OrderType.SELL);
                }
            }
        },
    };
}

export interface Grid {
    nextUpIdx: number;
    nextLowIdx: number;
    upLevels: GridLevel[];
    lowLevels: GridLevel[];
}
class GridClass implements Grid {
    public nextUpIdx = 0;
    public nextLowIdx = 0;
    public upLevels: GridLevel[] = [];
    public lowLevels: GridLevel[] = [];
    public zeroPointPrice = 0;
    public paused = false;

    constructor(price: number, options: GridPluginOptions) {
        const step = price * (options.step / 100);
        const fiboSteps: number[] = [step];

        for (let i = 1; i <= options.levelsCount; i++) {
            if (options.fibo) {
                const fiboStep = fiboSteps.slice(-2).reduce((sum, item) => item + sum, 0);

                fiboSteps.push(fiboStep);

                this.upLevels.push({ price: price + fiboStep, activated: false });
                this.lowLevels.push({ price: price - fiboStep, activated: false });
            } else {
                this.upLevels.push({ price: price + step * i, activated: false });
                this.lowLevels.push({ price: price - step * i, activated: false });
            }
        }
    }

    activateUp() {
        const upLevel = this.upLevels[this.nextUpIdx];

        if (upLevel) {
            upLevel.activated = true;
        }

        this.nextUpIdx++;
    }

    activateLow() {
        const lowLevel = this.lowLevels[this.nextLowIdx];

        if (lowLevel) {
            lowLevel.activated = true;
        }

        this.nextLowIdx++;
    }

    getNextUp() {
        return this.upLevels[this.nextUpIdx];
    }

    getNextLow() {
        return this.lowLevels[this.nextLowIdx];
    }
}
