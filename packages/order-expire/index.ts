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
    let amount: number;

    return {
        name: 'order-expire',

        async onOpen(order) {
            amount = this.debut.opts.amount * (this.debut.opts.equityLevel || 1);
            lookup[order.cid] = 0;
        },

        async onClose(order, closing) {
            delete lookup[closing.cid];
        },

        async onCandle({ c }) {
            for (const order of [...this.debut.orders]) {
                if (!('orderId' in order)) {
                    return;
                }

                const counter = ++lookup[order.cid];

                if (counter >= opts.orderCandlesLimit) {
                    await this.debut.closeOrder(order);
                }

                if (opts.closeAtZero && counter > halfLimit) {
                    const profit = orders.getCurrencyProfit(order, c);
                    const percentProfit = (profit / amount) * 100;

                    if (percentProfit >= (this.debut.opts.fee || 0)) {
                        await this.debut.closeOrder(order);
                    }
                }
            }
        },
    };
}
