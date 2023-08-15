import { PluginInterface, ExecutedOrder, DebutCore, Candle, OrderType, PluginCtx } from '@debut/types';

export type VirtualTakesOptions = {
    stopLoss?: number; // Stop in percent 12 = 12%
    takeProfit?: number; // Take in percent 20 = 20%
    trailing?: TrailingType; // 1 or 2; 1 - Trailing from start | 2 - after take trailing | 3 - trailing after each take
    ignoreTicks?: boolean;
    manual?: boolean; // manual control
    maxRetryOrders?: number; // how many order can be retried after stop reached
    reduceWhen?: number; // reduce order size when reached price level change in percent 12 = 12% or 2 = 2%
    reduceSize?: number; // How many order size should be reduced 0 - 0%, 1 - 100%, default is 0.5 = 50%
    separateStops?: boolean; // use separate stop loss for each retry order
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
};

type TakesLookup = Map<number, OrderTakes>;
type TrailingLookup = Set<number>;

interface Methods {
    setTrailingForOrder(cid: number, takePrice: number, stopPrice: number): void;
    setPricesForOrder(cid: number, takePrice: number, stopPrice: number): void;
    setForOrder(cid: number, type: OrderType): void;
    getTakes(cid: number): OrderTakes | undefined;
    isManual(): boolean;
    updateUpts(opts: VirtualTakesOptions): void;
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
    const reducePrices = new Map<number, number>();
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
            const { data, isLink } = getOrderData(order.cid, lookup, opts.separateStops);
            const closeState = checkClose(order, price, lookup, opts.separateStops);
            const moveTakeAfter = opts.trailing === TrailingType.MoveAfterEachTake && closeState === CloseType.TAKE;
            const startTakeAfter =
                !hasTrailing && opts.trailing === TrailingType.StartAfterTake && closeState === CloseType.TAKE;
            const reducePrice = reducePrices.get(order.cid);

            if (opts.reduceWhen && reducePrice) {
                const shouldClose = checkReduce(order.type, price, reducePrice);

                if (shouldClose) {
                    await ctx.debut.reduceOrder(order, opts.reduceSize || 0.5);

                    reducePrices.delete(order.cid);
                }
            }

            // if (opts.reduceOnTrailingTake && (moveTakeAfter || startTakeAfter)) {
            //     const originalData = lookup.get(order.cid)!;

            //     if (!originalData.reduced) {
            //         await ctx.debut.reduceOrder(order, 0.5);
            //         originalData.reduced = true;
            //     }
            // }

            if (isLink) {
                continue;
            }

            // Update trailings and next check close state
            if (hasTrailing && opts.trailing !== TrailingType.MoveAfterEachTake) {
                trailingTakes(order, price, lookup);
            }

            if (moveTakeAfter) {
                createTrailingTakes(order, price, lookup, opts.separateStops);
                trailing.add(order.cid);
            } else if (startTakeAfter) {
                const priceDiff = order.price - data.stopPrice;

                data.stopPrice = price - priceDiff;
                data.takePrice = price + priceDiff;
                data.price = price;
                trailing.add(order.cid);
            } else if (closeState === CloseType.STOP && data.tryLeft! > 0 && data.tryPrice && !data.trailed) {
                const priceDiff = price - data.tryPrice;

                data.stopPrice = data.stopPrice + priceDiff;
                data.takePrice = data.takePrice + priceDiff;
                data.tryPrice = price;
                data.price = price;

                // Create same type as origin order
                const newOrder = await ctx.debut.createOrder(order.type);

                // Error cannot be opened fallback
                if (!newOrder) {
                    await ctx.debut.closeAll(true);
                    return;
                }

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
            updateUpts(update: Partial<VirtualTakesOptions>) {
                opts = { ...opts, ...update };
            },
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
            if (opts.reduceWhen) {
                const rev = order.type === OrderType.SELL ? -1 : 1;
                const reducePrice = price + rev * price * (opts.reduceWhen / 100);

                reducePrices.set(order.cid, reducePrice);
            }

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

function getOrderData(
    cid: number,
    lookup: TakesLookup,
    separateStops?: boolean,
): { data: OrderTakes; isLink: boolean } {
    let data = lookup.get(cid);
    let isLink = false;

    if (!separateStops && data?.retryFor) {
        data = lookup.get(data.retryFor);
        isLink = true;
    }

    return { data: data || ({} as OrderTakes), isLink };
}

/**
 * Проверяем достижение тейка на оснвании текущей цены
 */
function checkClose(
    order: ExecutedOrder,
    price: number,
    lookup: TakesLookup,
    separateStops?: boolean,
): CloseType | void {
    const { type, cid } = order;
    const { takePrice, stopPrice } = getOrderData(cid, lookup, separateStops).data;

    if ((type === OrderType.BUY && price >= takePrice) || (type === OrderType.SELL && price <= takePrice)) {
        return CloseType.TAKE;
    }

    if ((type === OrderType.BUY && price <= stopPrice) || (type === OrderType.SELL && price >= stopPrice)) {
        return CloseType.STOP;
    }

    return;
}

/**
 * Order reduce price achieved
 */
function checkReduce(type: OrderType, price: number, reducePrice: number): boolean {
    if ((type === OrderType.BUY && price >= reducePrice) || (type === OrderType.SELL && price <= reducePrice)) {
        return true;
    }

    return false;
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

function createTrailingTakes(order: ExecutedOrder, price: number, lookup: TakesLookup, separateStops?: boolean) {
    const takes = getOrderData(order.cid, lookup, separateStops).data;

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
    const prevPrice = takes.price;

    if (!takes.trailed) {
        takes.price = price;
        takes.trailed = true;

        return;
    }

    takes.takePrice = order.type === OrderType.BUY ? Infinity : -Infinity;

    if ((order.type === OrderType.BUY && price > prevPrice) || (order.type === OrderType.SELL && price < prevPrice)) {
        const delta = price - prevPrice;

        takes.stopPrice += delta;
        takes.price = price;
    }
}
