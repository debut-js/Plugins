import { ExecutedOrder, PendingOrder, OrderType } from '@debut/types';
import { getPrecision, percentChange } from './math';

/**
 * Reverse order type
 */
export function inverseType(type: OrderType) {
    return type === OrderType.BUY ? OrderType.SELL : OrderType.BUY;
}

/**
 * Generate synthetic order id from order
 */
export function syntheticOrderId(order: ExecutedOrder | PendingOrder) {
    return `${Math.floor(Math.random() * 100000)}-${order.type}-${order.price}`;
}

/**
 * Get minimal increment value for float number with current precision
 */
export function getMinIncrementValue(price: number | string) {
    const precision = getPrecision(price);
    return Number(`${parseFloat('0').toFixed(precision - 1)}1`);
}

/**
 * Calculate order profit
 */
export function getCurrencyProfit(order: ExecutedOrder, price: number) {
    const rev = order.type === OrderType.SELL ? -1 : 1;

    return (price - order.price) * order.executedLots * rev - order.commission.value;
}

/** Calculate batch orders profit */
export function getCurrencyBatchProfit(orders: Array<ExecutedOrder | PendingOrder>, price: number) {
    let totalProfit = 0;

    for (const order of orders) {
        if ('orderId' in order) {
            totalProfit += getCurrencyProfit(order, price);
        }
    }

    return totalProfit;
}
