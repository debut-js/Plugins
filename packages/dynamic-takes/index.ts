import { PluginInterface, ExecutedOrder, Candle, PluginCtx, OrderType } from '@debut/types';
import { orders } from '@debut/plugin-utils';

export interface DynamicTakesPlugin extends PluginInterface {
    name: 'dynamicTakes';
    api: Methods;
}

export type DynamicTakesPluginOptions = {
    trailing?: boolean;
    ignoreTicks?: boolean;
    maxRetryOrders?: number;
};

interface Methods {
    setForOrder(orderId: string, takePrice: number, stopPrice: number): void;
    getTakes(orderId: string): OrderTakes;
}

type OrderTakes = {
    takePrice: number;
    stopPrice: number;
    price?: number;
    tryLeft?: number;
};

export interface DynamicTakesPluginAPI {
    dynamicTakes: Methods;
}

type TakesLookup = Record<string, OrderTakes>;

export function dynamicTakesPlugin(opts: DynamicTakesPluginOptions): PluginInterface {
    const lookup: TakesLookup = {};
    let trackZeroClose = false;

    async function handleTick(this: PluginCtx, tick: Candle) {
        const price = tick.c;
        // No orders => no tracking
        if (!this.debut.orders.length) {
            return;
        }

        if (trackZeroClose) {
            const profit = orders.getCurrencyBatchProfit(this.debut.orders, tick.c);

            if (profit >= 0) {
                await this.debut.closeAll();
                trackZeroClose = false;
            }

            return;
        }

        for (const order of this.debut.orders) {
            if (opts.trailing) {
                trailingTakes(order, price, lookup);
            }

            // const debug = new Date(tick.time).toISOString().startsWith('2021-05-21');

            // if (debug) {
            //     console.log(trackZeroClose);
            // }


            if (!order.processing && checkClose.call(this, order, price, lookup) && !trackZeroClose) {
                // if (debug) {
                //     console.log(this.debut.orders.length, profit)
                // }

                await this.debut.closeOrder(order);
            }
        }
    }

    return {
        name: 'dynamicTakes',

        api: {
            setForOrder(orderId: string, takePrice: number, stopPrice: number) {
                // Only for orders seted up using API
                lookup[orderId] = { takePrice, stopPrice, tryLeft: opts.maxRetryOrders };
            },
            getTakes(orderId: string) {
                return lookup[orderId];
            },
        },

        async onBeforeClose(order, closing) {
            if (opts.maxRetryOrders && !order.force) {
                let { stopPrice, takePrice, tryLeft } = lookup[closing.orderId] || {};

                // Skip orders closed above stop price, its take
                if (order.price >= stopPrice) {
                    return;
                }

                if (tryLeft) {
                    tryLeft--;
                    // Create same type as origin order
                    await this.debut.createOrder(closing.type);
                    const price = this.debut.currentCandle.c;


                    takePrice = takePrice;
                    stopPrice = price + stopPrice - order.price;

                    // Update takes and stops for all
                    for (const activeOrder of this.debut.orders) {
                        if (activeOrder.type === closing.type) {
                            lookup[activeOrder.orderId] = { takePrice, stopPrice };
                        }
                    }

                    // Rewrite tries left to closing order
                    lookup[closing.orderId].tryLeft = tryLeft;

                    trackZeroClose = tryLeft === 0;

                    return true;
                }
            }
        },

        async onClose(order) {
            if (order.openId) {
                delete lookup[order.openId];
            }
        },

        async onCandle(candle) {
            if (opts.ignoreTicks) {
                await handleTick.call(this, candle);
            }
        },

        async onTick(tick) {
            if (!opts.ignoreTicks) {
                await handleTick.call(this, tick);
            }
        },
    };
}

/**
 * Проверяем достижение тейка на оснвании текущей цены
 */
function checkClose(this: PluginCtx, order: ExecutedOrder, price: number, lookup: TakesLookup) {
    const { type, orderId } = order;
    const { takePrice, stopPrice } = lookup[orderId] || {};

    if (!takePrice || !stopPrice) {
        throw 'Unknown take data';
    }

    return type === OrderType.BUY ? price >= takePrice || price <= stopPrice : price <= takePrice || price >= stopPrice;
}

function trailingTakes(order: ExecutedOrder, price: number, lookup: TakesLookup) {
    const { orderId } = order;
    const takes = lookup[orderId];

    if (!takes) {
        return;
    }

    if (!takes.price) {
        takes.price = price;
        return;
    }

    if (
        (order.type === OrderType.BUY && price > takes.price) ||
        (order.type === OrderType.SELL && price < takes.price)
    ) {
        const delta = price - takes.price;

        takes.takePrice += delta;
        takes.stopPrice += delta;
        takes.price = price;
    }
}
