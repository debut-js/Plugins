import { PluginInterface, ExecutedOrder, DebutCore, Candle, OrderType } from '@debut/types';

export type VirtualTakesOptions = {
    stopLoss: number; // Stop in percent 12 = 12%
    takeProfit: number; // Take in percent 20 = 20%
    trailing?: number; // 1 or 2 1 - Trailing from start 2 - after take trailing
    ignoreTicks?: boolean;
};

type OrderTakes = {
    takePrice: number;
    stopPrice: number;
    price: number;
};

type TakesLookup = Map<number, OrderTakes>;
type TrailingLookup = Set<number>;

export function virtualTakesPlugin(opts: VirtualTakesOptions): PluginInterface {
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

            if (opts.trailing === 2 && closeState === 'take') {
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

        async onOpen(order) {
            createTakes(order, opts, lookup);

            if (opts.trailing === 1) {
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

function createTakes(order: ExecutedOrder, opts: VirtualTakesOptions, lookup: TakesLookup) {
    const { type, price, cid } = order;
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
