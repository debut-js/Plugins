import { PluginInterface, ExecutedOrder, OrderType, Candle, PluginCtx, PendingOrder } from '@debut/types';
import { orders } from '@debut/plugin-utils';
import { VirtualTakesPlugin, TrailingType } from '@debut/plugin-virtual-takes';

type GridLevel = { price: number; activated: boolean };
interface Methods {
    createGrid(price: number, type?: OrderType): Grid;
    disposeGrid(): void;
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
    fibo?: number; // коэффициент фибоначи уровней
    martingale: number; // коэффициент мартингейла от 1-2
    levelsCount: number; // кол-во уровней грида
    takeProfit: number; // тейк в процентах 3 5 7 9 и тд
    stopLoss?: number; // общий стоп в процентах для всего грида
    reduceEquity?: boolean; // уменьшать доступный баланс с каждой сделкой
    trailing?: TrailingType; // трейлинг последней сделки, требует плагин virtual-takes 1 - 3
    trailingDistance?: number; // треубет установку трейлинга
    trailingAndReduce?: boolean;
    collapse?: boolean; // collapse orders when close
    timePause?: number; // pause between grid openings ONLY FOR PORUCTION! Not for Backtesting.
    trend?: boolean; // working on trend or not
    reduceTakeOnTime?: number; // reduce teak on each candle
    gridByCandle?: boolean; // working on candle or on tick
};

export function gridPlugin(opts: GridPluginOptions): GridPluginInterface {
    let grid: GridClass | null;
    let startMultiplier: number;
    let amount: number;
    let ctx: PluginCtx;
    let fee: number;
    let takesPlugin: VirtualTakesPlugin;
    let trailingSetted = false;
    let lastOpeningTime = 0;
    let takeProfit = opts.takeProfit;

    if (!opts.stopLoss) {
        opts.stopLoss = Infinity;
    }

    if (!opts.levelsCount) {
        opts.levelsCount = 6;
    }

    async function processLogic(tick: Candle) {
        if (trailingSetted) {
            return;
        }

        const ordersLen = ctx.debut.ordersCount;

        if (ordersLen) {
            // TODO: Create streaming profit watcher with nextValue
            const closingComission = orders.getCurrencyBatchComissions(ctx.debut.orders, tick.c, fee);
            const profit = orders.getCurrencyBatchProfit(ctx.debut.orders, tick.c) - closingComission;
            const percentProfit = (profit / amount) * 100;

            if (percentProfit <= -opts.stopLoss!) {
                await ctx.debut.closeAll(!opts.trend && opts.collapse && ctx.debut.ordersCount > 1);
                return;
            }

            if (percentProfit >= takeProfit) {
                if (opts.reduceEquity) {
                    if (!ctx.debut.opts.equityLevel) {
                        ctx.debut.opts.equityLevel = 1;
                    }

                    ctx.debut.opts.equityLevel *= 0.97;

                    if (ctx.debut.opts.equityLevel < 0.002) {
                        console.log(ctx.debut.getName(), 'Grid Disposed', new Date().toLocaleDateString());
                        ctx.debut.dispose();
                    }
                }

                if (opts.trailing && ctx.debut.ordersCount > 1) {
                    // Close all orders exclude last order
                    const lastOrder = ctx.debut.orders[ctx.debut.orders.length - 1];

                    await ctx.debut.closeAll(!opts.trend, (order: PendingOrder | ExecutedOrder) => {
                        return order !== lastOrder;
                    });

                    const rev = lastOrder.type === OrderType.BUY ? 1 : -1;
                    const take = tick.c * (1 + (opts.trailingDistance! / 100) * rev);
                    const stop = tick.c * (1 - (opts.trailingDistance! / 100) * rev);

                    takesPlugin.api.setTrailingForOrder(lastOrder.cid, take, stop);

                    if (opts.trailingAndReduce) {
                        await ctx.debut.reduceOrder(lastOrder, 0.5);
                    }

                    trailingSetted = true;
                } else {
                    await ctx.debut.closeAll(!opts.trend && opts.collapse);
                }

                return;
            }
        }

        const canTrade = ctx.debut.learning || !opts.timePause || Date.now() - lastOpeningTime > opts.timePause;

        if (grid && canTrade) {
            // Dont active when grid getted direaction to short side
            const useLow = !grid.nextUpIdx || opts.trend;

            if (useLow && tick.c <= grid.getNextLow()?.price) {
                grid.activateLow();
                const lotsMulti = opts.martingale ** grid.nextLowIdx;
                ctx.debut.opts.lotsMultiplier = lotsMulti;
                await ctx.debut.createOrder(opts.trend ? OrderType.SELL : OrderType.BUY);
            }

            // Dont active when grid getted direaction to long side
            const useUp = !grid?.nextLowIdx || opts.trend;

            if (useUp && tick.c >= grid.getNextUp()?.price) {
                grid.activateUp();
                const lotsMulti = opts.martingale ** grid.nextUpIdx;
                ctx.debut.opts.lotsMultiplier = lotsMulti;
                await ctx.debut.createOrder(opts.trend ? OrderType.BUY : OrderType.SELL);
            }
        }
    }

    return {
        name: 'grid',

        api: {
            /**
             * Create new grid immediatly
             */
            createGrid(price: number, type?: OrderType) {
                grid = new GridClass(price, opts, type);
                takeProfit = opts.takeProfit;
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

            /**
             * Remove existing grid
             */
            disposeGrid() {
                grid = null;
            },
        },
        onInit() {
            ctx = this;
            startMultiplier = this.debut.opts.lotsMultiplier || 1;
            fee = (this.debut.opts.fee || 0.02) / 100;

            if (opts.trailing) {
                takesPlugin = this.findPlugin<VirtualTakesPlugin>('takes');

                if (!takesPlugin) {
                    throw new Error('@debut/plugin-virtual-takes is required for trailing');
                }

                if (!opts.trailingDistance) {
                    throw new Error('@debut/plugin-grid trailing option requires trailingDistance parameter');
                }

                takesPlugin.api.updateUpts({ trailing: opts.trailing, manual: true });
            }
        },

        async onOpen(order: ExecutedOrder) {
            if (!grid) {
                grid = new GridClass(order.price, opts, opts.trend ? undefined : order.type);
                // Fixation amount for all time grid lifecycle
                amount = ctx.debut.opts.amount * (ctx.debut.opts.equityLevel || 1);
                takeProfit = opts.takeProfit;
            } else {
                lastOpeningTime = Date.now();
            }
        },

        async onClose() {
            // When all orders are closed - revert multiplier
            if (this.debut.ordersCount === 0) {
                this.debut.opts.lotsMultiplier = startMultiplier;
                grid = null;
                trailingSetted = false;
                takeProfit = opts.takeProfit;
            }
        },

        async onCandle(candle: Candle) {
            if (opts.gridByCandle) {
                await processLogic(candle);
            }

            if (grid && opts.reduceTakeOnTime) {
                takeProfit -= opts.reduceTakeOnTime;
            }
        },

        async onTick(tick: Candle) {
            if (!opts.gridByCandle) {
                await processLogic(tick);
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
    public paused = false;

    constructor(price: number, options: GridPluginOptions, type?: OrderType) {
        let step = price * (options.step / 100);
        let fPrevUp = price;
        let fPrevLow = price;

        for (let i = 1; i <= options.levelsCount; i++) {
            let upLevel: GridLevel;
            let lowLevel: GridLevel;

            if (options.fibo) {
                fPrevUp = fPrevUp + step;
                fPrevLow = fPrevLow - step;
                upLevel = { price: fPrevUp, activated: false };
                lowLevel = { price: fPrevLow, activated: false };
                step *= options.fibo;
            } else {
                upLevel = { price: price + step * i, activated: false };
                lowLevel = { price: price - step * i, activated: false };
            }

            if (type) {
                if (type === OrderType.BUY) {
                    this.lowLevels.push(lowLevel);
                } else {
                    this.upLevels.push(upLevel);
                }
            } else {
                this.upLevels.push(upLevel);
                this.lowLevels.push(lowLevel);
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
