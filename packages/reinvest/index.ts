import { PluginInterface } from '@debut/types';
import { orders } from '@debut/plugin-utils';

export function reinvestPlugin(): PluginInterface {
    return {
        name: 'reinvest',
        async onClose(order, closing) {
            // Dont accumulate learning orders
            if (!order.openPrice || order.learning) {
                return;
            }

            const profit = orders.getCurrencyProfit(closing, order.price) - order.commission.value;

            this.debut.opts.amount += profit;
        },
    };
}
