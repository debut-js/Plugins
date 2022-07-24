import { PluginInterface, ExecutedOrder, DebutCore, Candle, OrderType, PluginCtx } from '@debut/types';

export type VirtualTakesOptions = {
    stopLoss?: number; // Stop in percent 12 = 12%
    takeProfit?: number; // Take in percent 20 = 20%
    trailing?: TrailingType; // 1 or 2; 1 - Trailing from start | 2 - after take trailing | 3 - trailing after each take
    ignoreTicks?: boolean;
    manual?: boolean; // manual control
    maxRetryOrders?: number; // how many order can be retried after stop reached
    reduceOnTrailingTake?: boolean; // reduce order size when trake reached, only for trailing 2 and 3
};

export const enum TrailingType {
    None,
    Classic,
    StartAfterTake,
    MoveAfterEachTake,
}

const enum CloseType {
    STOP,
    TAKE,
}

type OrderTakes = {
    takePrice: number;
    stopPrice: number;
    price: number;
    tryLeft?: number;
    tryPrice?: number;
    retryFor?: number;
    trailed?: boolean;
    reduced?: boolean;
};

type TakesLookup = Map<number, OrderTakes>;
type TrailingLookup = Set<number>;

interface Methods {
    setTrailingForOrder(cid: number, takePrice: number, stopPrice: number): void;
    setPricesForOrder(cid: number, takePrice: number, stopPrice: number): void;
    setForOrder(cid: number, type: OrderType): void;
    getTakes(cid: number): OrderTakes | undefined;
    isManual(): boolean;
}
export interface VirtualTakesPluginAPI {
    takes: Methods;
}

export interface VirtualTakesPlugin extends PluginInterface {
    name: 'takes';
    api: Methods;
}

export function virtualTakesPlugin(opts: VirtualTakesOptions): VirtualTakesPlugin {
    const lookup: TakesLookup = new Map();
    const trailing: TrailingLookup = new Set();
    let price = 0;
    let ctx: PluginCtx;

    async function handleTick() {
        // Нет заявки активной - нет мониторинга
        if (!ctx.debut.ordersCount) {
            return;
        }

        const orders = [...ctx.debut.orders];

        for (let i = 0; i < orders.length; i++) {
            const order = orders[i];

            if (!order || !('orderId' in order)) {
                continue;
            }

            const hasTrailing = trailing.has(order.cid);
            const { data, isLink } = getOrderData(order.cid, lookup);
            const closeState = checkClose(order, price, lookup);

            if (isLink) {
                return;
            }

            // Update trailings and next check close state
            if (hasTrailing && opts.trailing !== TrailingType.MoveAfterEachTake) {
                trailingTakes(order, price, lookup);
            }

            if (opts.trailing === TrailingType.MoveAfterEachTake && closeState === CloseType.TAKE) {
                createTrailingTakes(order, price, lookup);
                trailing.add(order.cid);

                if (opts.reduceOnTrailingTake && !data.reduced && ctx.debut.ordersCount === 1) {
                    await ctx.debut.reduceOrder(order, 0.5);
                }
            } else if (opts.trailing === TrailingType.StartAfterTake && closeState === CloseType.TAKE) {
                data.stopPrice = order.price;
                data.price = price;
                trailing.add(order.cid);

                if (opts.reduceOnTrailingTake && !data.reduced && ctx.debut.ordersCount === 1) {
                    await ctx.debut.reduceOrder(order, 0.5);
                }
            } else if (closeState === CloseType.STOP && data.tryLeft! > 0 && data.tryPrice && !data.trailed) {
                const priceDiff = price - data.tryPrice;

                data.stopPrice = data.stopPrice + priceDiff;
                data.takePrice = data.takePrice + priceDiff;
                data.tryPrice = price;

                // Create same type as origin order
                const newOrder = await ctx.debut.createOrder(order.type);

                lookup.set(newOrder.cid, { ...data, tryLeft: undefined, retryFor: order.cid });
                data.tryLeft!--;
            } else if (closeState === CloseType.STOP || closeState === CloseType.TAKE) {
                if (opts.maxRetryOrders && data.tryLeft! < opts.maxRetryOrders) {
                    await ctx.debut.closeAll(true);
                    return;
                } else {
                    await ctx.debut.closeOrder(order);
                }
            }
        }
    }

    return {
        name: 'takes',

        api: {
            setTrailingForOrder(cid: number, takePrice: number, stopPrice: number) {
                if (!opts.manual) {
                    throw 'Virtual Takes Plugin should be in a manual mode for call `setForOrder`';
                }

                if (opts.trailing === TrailingType.Classic) {
                    trailing.add(cid);
                }

                lookup.set(cid, { price, stopPrice, takePrice });
            },
            setPricesForOrder(cid: number, takePrice: number, stopPrice: number) {
                if (!opts.manual) {
                    throw 'Virtual Takes Plugin should be in a manual mode for call `setForOrder`';
                }

                if (!takePrice || !stopPrice) {
                    throw `prices in setForOrder() should be a number, current take: ${takePrice}, stop: ${stopPrice}`;
                }

                // Only for orders seted up using API
                lookup.set(cid, { price, takePrice, stopPrice, tryLeft: opts.maxRetryOrders, tryPrice: price });

                if (opts.trailing === TrailingType.Classic) {
                    trailing.add(cid);
                }
            },
            setForOrder(cid: number, type: OrderType): void {
                if (!opts.manual) {
                    throw 'Virtual Takes Plugin should be in a manual mode for call `setForOrder`';
                }

                createTakes(cid, type, price, opts, lookup);

                if (opts.trailing === TrailingType.Classic) {
                    trailing.add(cid);
                }
            },
            getTakes(cid: number): OrderTakes | undefined {
                return getOrderData(cid, lookup).data;
            },
            isManual() {
                return opts.manual || false;
            },
        },

        onInit() {
            ctx = this;
        },

        async onOpen(order) {
            if (opts.manual) {
                return;
            }

            createTakes(order.cid, order.type, order.price, opts, lookup);

            if (opts.trailing === TrailingType.Classic) {
                trailing.add(order.cid);
            }
        },

        async onClose(order, closing) {
            if (!order.reduce) {
                trailing.delete(closing.cid);
                lookup.delete(closing.cid);
            }
        },

        async onCandle() {
            if (opts.ignoreTicks) {
                await handleTick();
            }
        },

        async onTick(tick) {
            price = tick.c;

            if (!opts.ignoreTicks) {
                await handleTick();
            }
        },
    };
}

function getOrderData(cid: number, lookup: TakesLookup): { data: OrderTakes; isLink: boolean } {
    let data = lookup.get(cid);
    let isLink = false;

    if (data?.retryFor) {
        data = lookup.get(data.retryFor);
        isLink = true;
    }

    return { data: data || ({} as OrderTakes), isLink };
}

/**
 * Проверяем достижение тейка на оснвании текущей цены
 */
function checkClose(order: ExecutedOrder, price: number, lookup: TakesLookup): CloseType | void {
    const { type, cid } = order;
    const { takePrice, stopPrice } = getOrderData(cid, lookup).data;

    if ((type === OrderType.BUY && price >= takePrice) || (type === OrderType.SELL && price <= takePrice)) {
        return CloseType.TAKE;
    }

    if ((type === OrderType.BUY && price <= stopPrice) || (type === OrderType.SELL && price >= stopPrice)) {
        return CloseType.STOP;
    }

    return;
}

function createTakes(cid: number, type: OrderType, price: number, opts: VirtualTakesOptions, lookup: TakesLookup) {
    const rev = type === OrderType.SELL ? -1 : 1;

    if (!opts.stopLoss || !opts.takeProfit) {
        throw new Error('Virtual Takes Plugin needs stopLoss and takeProfit in strategy options');
    }

    // XXX Так как тейки и стопы виртуальные, можем их не делать реальными ценами с шагом
    const stopPrice = price - rev * price * (opts.stopLoss / 100);
    const takePrice = price + rev * price * (opts.takeProfit / 100);

    lookup.set(cid, { stopPrice, takePrice, price });
}

function createTrailingTakes(order: ExecutedOrder, price: number, lookup: TakesLookup) {
    const takes = getOrderData(order.cid, lookup).data;

    if (!takes) {
        return;
    }

    const delta = (price - takes.stopPrice) / 2;

    takes.takePrice += delta;
    takes.stopPrice += delta;
    takes.trailed = true;
}

function trailingTakes(order: ExecutedOrder, price: number, lookup: TakesLookup) {
    const takes = getOrderData(order.cid, lookup).data;

    takes.takePrice = order.type === OrderType.BUY ? Infinity : -Infinity;

    if (
        (order.type === OrderType.BUY && price > takes.price) ||
        (order.type === OrderType.SELL && price < takes.price)
    ) {
        const delta = price - takes.price;

        takes.trailed = true;
        takes.stopPrice += delta;
        takes.price = price;
    }
}
