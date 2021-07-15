import { PluginInterface } from '@debut/types';
import { orders } from '@debut/plugin-utils';

export type OrderExpireOptions = {
    orderCandlesLimit: number;
    closeAtZero?: boolean;
};

type LimitLookup = Record<string, number>;

export function orderExpirePlugin(opts: OrderExpireOptions): PluginInterface {
    const lookup: LimitLookup = {};
    const halfLimit = opts.orderCandlesLimit / 2;

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

        async onCandle({ c, time}) {
            for (const order of [...this.debut.orders]) {
                const counter = ++lookup[order.orderId];

                if (counter >= opts.orderCandlesLimit) {
                    await this.debut.closeOrder(order);
                }

                if (opts.closeAtZero && counter > halfLimit) {
                    const profit = orders.getCurrencyProfit(order, c);
                    const percentProfit = (profit / this.debut.opts.amount) * 100;

                    if (percentProfit >= (this.debut.opts.fee || 0)) {
                        await this.debut.closeOrder(order);
                    }
                }
            }
        },
    };
}
