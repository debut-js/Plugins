import { PluginInterface } from 'debut';

export type OrderExpireOptions = {
    orderCandlesLimit: number;
};

type LimitLookup = Record<string, number>;

export function orderExpire(opts: OrderExpireOptions): PluginInterface {
    const lookup: LimitLookup = {};

    return {
        name: 'order-expire',

        async onOpen(order) {
            lookup[order.orderId] = 0;
        },

        async onClose(order) {
            if (order.openId) {
                delete lookup[order.openId];
            }
        },

        async onCandle() {
            for (const order of this.debut.orders) {
                if (++lookup[order.orderId] >= opts.orderCandlesLimit) {
                    await this.debut.closeOrder(order);
                }
            }
        },
    };
}
