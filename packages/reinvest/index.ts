import { OrderType, PluginInterface } from '@debut/community-core';

export function reinvestPlugin(): PluginInterface {
    return {
        name: 'reinvest',
        async onClose(order, closing) {
            if (!order.openPrice) {
                return;
            }

            const rev = order.type === OrderType.SELL ? -1 : 1;
            this.debut.opts.amount +=
                (order.openPrice - order.price) * order.lots * rev - order.commission.value - closing.commission.value;
        },
    };
}
