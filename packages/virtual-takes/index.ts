import { PluginInterface, ExecutedOrder, DebutCore, Candle, OrderType } from '@debut/types';

export type VirtualTakesOptions = {
    stopLoss: number; // Stop in percent 12 = 12%
    takeProfit: number; // Take in percent 20 = 20%
    trailing?: number; // 1 or 2; 1 - Trailing from start | 2 - after take trailing | 3 - trailing after each take
    ignoreTicks?: boolean;
    manual?: boolean; // manual control
};

export const enum TrailingType {
    None,
    Classic,
    StartAfterTake,
    MoveAfterEachTake,
}

type OrderTakes = {
    takePrice: number;
    stopPrice: number;
    price: number;
};

type TakesLookup = Map<number, OrderTakes>;
type TrailingLookup = Set<number>;

interface Methods {
    setForOrder(cid: number, type: OrderType, price: number): void;
    getTakes(cid: number): OrderTakes | undefined;
    isManual(): boolean;
}
export interface VirtualTakesPluginAPI {
    dynamicTakes: Methods;
}

export interface VirtualTakesPlugin extends PluginInterface {
    name: 'takes';
    api: Methods;
}

export function virtualTakesPlugin(opts: VirtualTakesOptions): VirtualTakesPlugin {
    const lookup: TakesLookup = new Map();
    const trailing: TrailingLookup = new Set();
    async function handleTick(debut: DebutCore, tick: Candle) {
        const price = tick.c;
        // Нет заявки активной - нет мониторинга
        if (!debut.ordersCount) {
            return;
        }

        for (const order of [...debut.orders]) {
            if (!('orderId' in order)) {
                continue;
            }

            if (trailing.has(order.cid)) {
                trailingTakes(order, price, lookup);

                if (checkClose(order, price, lookup)) {
                    await debut.closeOrder(order);
                }

                continue;
            }

            const closeState = checkClose(order, price, lookup);

            if (opts.trailing === TrailingType.MoveAfterEachTake && closeState === 'take') {
                createTakes(order.cid, order.type, price, opts, lookup);
            } else if (opts.trailing === TrailingType.StartAfterTake && closeState === 'take') {
                const data = lookup.get(order.cid) || ({} as OrderTakes);

                data.stopPrice = order.price;
                data.price = price;
                trailing.add(order.cid);
            } else if (closeState) {
                await debut.closeOrder(order);
            }
        }
    }

    return {
        name: 'takes',

        api: {
            setForOrder(cid: number, type: OrderType, price: number): void {
                if (!opts.manual) {
                    throw 'Virtual Takes Plugin should be in a manual mode for call `setForOrder`';
                }

                createTakes(cid, type, price, opts, lookup);

                if (opts.trailing === TrailingType.Classic) {
                    trailing.add(cid);
                }
            },
            getTakes(cid: number): OrderTakes | undefined {
                return lookup.get(cid);
            },
            isManual() {
                return opts.manual || false;
            },
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

        async onClose(order) {
            if (order.openId) {
                trailing.delete(order.cid);
                lookup.delete(order.cid);
            }
        },

        async onCandle(tick) {
            if (opts.ignoreTicks) {
                await handleTick(this.debut, tick);
            }
        },

        async onTick(tick) {
            if (!opts.ignoreTicks) {
                await handleTick(this.debut, tick);
            }
        },
    };
}

/**
 * Проверяем достижение тейка на оснвании текущей цены
 */
function checkClose(order: ExecutedOrder, price: number, lookup: TakesLookup) {
    const { type, cid } = order;
    const { takePrice, stopPrice } = lookup.get(cid) || ({} as OrderTakes);

    if ((type === OrderType.BUY && price >= takePrice) || (type === OrderType.SELL && price <= takePrice)) {
        return 'take';
    }

    if ((type === OrderType.BUY && price <= stopPrice) || (type === OrderType.SELL && price >= stopPrice)) {
        return 'stop';
    }

    return void 0;
}

function createTakes(cid: number, type: OrderType, price: number, opts: VirtualTakesOptions, lookup: TakesLookup) {
    const rev = type === OrderType.SELL ? -1 : 1;

    // XXX Так как тейки и стопы виртуальные, можем их не делать реальными ценами с шагом
    const stopPrice = price - rev * price * (opts.stopLoss / 100);
    const takePrice = price + rev * price * (opts.takeProfit / 100);

    lookup.set(cid, { stopPrice, takePrice, price });
}

function trailingTakes(order: ExecutedOrder, price: number, lookup: TakesLookup) {
    const { cid } = order;
    const takes = lookup.get(cid);

    if (!takes) {
        return;
    }

    takes.takePrice = order.type === OrderType.BUY ? Infinity : -Infinity;

    if (
        (order.type === OrderType.BUY && price > takes.price) ||
        (order.type === OrderType.SELL && price < takes.price)
    ) {
        const delta = price - takes.price;

        takes.stopPrice += delta;
        takes.price = price;
    }
}
