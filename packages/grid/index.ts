import { PluginInterface, ExecutedOrder, OrderType, Candle, PluginCtx, PendingOrder } from '@debut/types';
import { orders } from '@debut/plugin-utils';
import { VirtualTakesPlugin, TrailingType } from '@debut/plugin-virtual-takes';

type GridLevel = { price: number; activated: boolean };
interface Methods {
    createGrid(price: number, type?: OrderType): Grid;
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
            createGrid(price: number, type?: OrderType) {
                grid = new GridClass(price, opts, type);
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
                grid = new GridClass(order.price, opts, order.type);
                // Fixation amount for all time grid lifecycle
                amount = ctx.debut.opts.amount * (ctx.debut.opts.equityLevel || 1);
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

                    if (opts.trailing && this.debut.ordersCount > 1) {
                        // Close all orders exclude last order
                        const lastOrder = this.debut.orders[this.debut.orders.length - 1];

                        await this.debut.closeAll(true, (order: PendingOrder | ExecutedOrder) => {
                            return order !== lastOrder;
                        });

                        const rev = lastOrder.type === OrderType.BUY ? 1 : -1;
                        const take = tick.c * (1 + (opts.trailingDistance! / 100) * rev);
                        const stop = tick.c * (1 - (opts.trailingDistance! / 100) * rev);

                        takesPlugin.api.setTrailingForOrder(lastOrder.cid, take, stop);

                        if (opts.trailingAndReduce) {
                            await this.debut.reduceOrder(lastOrder, 0.5);
                        }

                        trailingSetted = true;
                    } else {
                        await this.debut.closeAll(opts.collapse);
                    }

                    return;
                }
            }

            const canTrade = ctx.debut.learning || !opts.timePause || Date.now() - lastOpeningTime > opts.timePause;

            if (grid && canTrade) {
                // Dont active when grid getted direaction to short side
                if (!grid.nextUpIdx && tick.c <= grid.getNextLow()?.price) {
                    grid.activateLow();
                    const lotsMulti = opts.martingale ** grid.nextLowIdx;
                    this.debut.opts.lotsMultiplier = lotsMulti;
                    await this.debut.createOrder(OrderType.BUY);
                }

                // Dont active when grid getted direaction to long side
                if (!grid.nextLowIdx && tick.c >= grid.getNextUp()?.price) {
                    grid.activateUp();
                    const lotsMulti = opts.martingale ** grid.nextUpIdx;
                    this.debut.opts.lotsMultiplier = lotsMulti;
                    await this.debut.createOrder(OrderType.SELL);
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
