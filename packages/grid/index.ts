import { PluginInterface, ExecutedOrder, OrderType, Candle, PluginCtx } from '@debut/types';
import { orders } from '@debut/plugin-utils';

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
    stopLoss: number; // общий стоп в процентах для всего грида
    reduceEquity?: boolean; // уменьшать доступный баланс с каждой сделкой
    trend?: boolean; // по тренду или против
};

export function gridPlugin(opts: GridPluginOptions): GridPluginInterface {
    let grid: GridClass | null;
    let startMultiplier: number;

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
            startMultiplier = this.debut.opts.lotsMultiplier || 1;
        },

        async onOpen(order: ExecutedOrder) {
            if (!('orderId' in order)) {
                throw `Grid Creating error with order ${orders}`;
            }

            if (!grid) {
                grid = new GridClass(order.price, opts);
            }
        },

        async onClose() {
            // When all orders are closed - revert multiplier
            if (this.debut.orders.length === 0) {
                this.debut.opts.lotsMultiplier = startMultiplier;
            }
        },

        async onTick(tick: Candle) {
            if (this.debut.orders.length) {
                const profit = orders.getCurrencyBatchProfit(this.debut.orders, tick.c);
                const percentProfit = (profit / this.debut.opts.amount) * 100;

                if (percentProfit >= opts.takeProfit || percentProfit <= -opts.stopLoss) {
                    grid = null;
                    await this.debut.closeAll();
                    // Вернем лотность наместо
                    this.debut.opts.lotsMultiplier = startMultiplier;

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
                    return;
                }
            }

            if (grid) {
                if (tick.c <= grid.getNextLow()?.price) {
                    const lotsMulti = opts.martingale ** (opts.levelsCount - grid.lowLevels.length);
                    this.debut.opts.lotsMultiplier = lotsMulti;
                    await this.debut.createOrder(opts.trend ? OrderType.SELL : OrderType.BUY);
                    grid.activateLow();
                }

                if (tick.c >= grid.getNextUp()?.price) {
                    const lotsMulti = opts.martingale ** (opts.levelsCount - grid.upLevels.length);
                    this.debut.opts.lotsMultiplier = lotsMulti;
                    await this.debut.createOrder(opts.trend ? OrderType.BUY : OrderType.SELL);
                    grid.activateUp();
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
