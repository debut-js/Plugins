import { ExecutedOrder, PendingOrder, OrderType } from '@debut/types';
import { getPrecision } from './math';

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
export function getMinIncrementValue(price: number | string): number {
    const precision = getPrecision(price);

    // Corner case, minimal precision is for next formula uses
    if (precision === 1) {
        return 0.1;
    }

    return Number(`${parseFloat('0').toFixed(precision - 1)}1`);
}

/**
 * Calculate order profit in currency
 */
export function getCurrencyProfit(order: ExecutedOrder | PendingOrder, price: number) {
    if ('orderId' in order) {
        const rev = order.type === OrderType.SELL ? -1 : 1;

        return (price - order.price) * order.executedLots * rev - order.commission.value;
    }

    return 0;
}

/** Calculate batch orders profit in currency */
export function getCurrencyBatchProfit(orders: Array<ExecutedOrder | PendingOrder>, price: number) {
    let totalProfit = 0;

    for (const order of orders) {
        totalProfit += getCurrencyProfit(order, price);
    }

    return totalProfit;
}

/** Calculate order comission (based on predictable comission level) */
export function getCurrencyComissions(order: ExecutedOrder | PendingOrder, price: number, fee: number) {
    if ('orderId' in order) {
        return price * order.executedLots * fee;
    }

    return 0;
}

/** Calculate batch orders profit */
export function getCurrencyBatchComissions(orders: Array<ExecutedOrder | PendingOrder>, price: number, fee: number) {
    let totalProfit = 0;

    for (const order of orders) {
        totalProfit += getCurrencyComissions(order, price, fee);
    }

    return totalProfit;
}
