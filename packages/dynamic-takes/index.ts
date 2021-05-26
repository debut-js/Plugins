import { PluginInterface, ExecutedOrder, Candle, PluginCtx, OrderType, utils } from '@debut/community-core';

export interface DynamicTakesPlugin extends PluginInterface {
    name: 'dynamicTakes';
    api: Methods;
}

export type DynamicTakesPluginOpts = {
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
};

export interface DynamicTakesPluginAPI {
    dynamicTakes: Methods;
}

type TakesLookup = Record<string, OrderTakes>;

export function dynamicTakesPlugin(opts: DynamicTakesPluginOpts): PluginInterface {
    const lookup: TakesLookup = {};
    let trackZeroClose = false;

    async function handleTick(this: PluginCtx, tick: Candle) {
        const price = tick.c;
        // Нет заявки активной - нет мониторинга
        if (!this.debut.orders.length) {
            return;
        }

        if (trackZeroClose) {
            const profit = profitMonitor(this.debut.orders, tick.c);

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

            if (!order.processing && checkClose(order, price, lookup) && !trackZeroClose) {
                const profit = getProfit(order, price);

                if (opts.maxRetryOrders && profit < 0) {
                    const retryOrder = await this.debut.createOrder(order.type);
                    let { stopPrice, takePrice } = lookup[order.orderId];

                    if (this.debut.orders.length === opts.maxRetryOrders) {
                        trackZeroClose = true;
                        return;
                    }

                    stopPrice = price + stopPrice - order.price;
                    takePrice = takePrice;

                    lookup[retryOrder.orderId] = { takePrice, stopPrice };
                    lookup[order.orderId] = { takePrice, stopPrice };
                } else {
                    await this.debut.closeOrder(order);
                }
            }
        }
    }

    return {
        name: 'dynamicTakes',

        api: {
            setForOrder(orderId: string, takePrice: number, stopPrice: number) {
                lookup[orderId] = { takePrice, stopPrice };
            },
            getTakes(orderId: string) {
                return lookup[orderId];
            },
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
function checkClose(order: ExecutedOrder, price: number, lookup: TakesLookup) {
    const { type, orderId } = order;
    const { takePrice, stopPrice } = lookup[orderId];

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

function profitMonitor(orders: ExecutedOrder[], price: number) {
    let totalProfit = 0;

    for (const order of orders) {
        totalProfit += getProfit(order, price);
    }

    return totalProfit;
}

function getProfit(order: ExecutedOrder, price: number) {
    const rev = order.type === OrderType.SELL ? -1 : 1;

    return (utils.math.percentChange(price, order.price) / 100) * rev * order.executedLots;
}
