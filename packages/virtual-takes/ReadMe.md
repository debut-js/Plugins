# @debut/plugin-virtual-takes
The Debut plugin, for limiting the trading session time. Allows you to configure the working hours for the strategy, as well as to detect the change of the day. The plugin automatically performs the correction of time zones, at the transition of USA to summer and winter time, so there are no failures on time shifts during testing. It is recommended to use to block work on pre or post market exchanges.

## Install

```
npm install @debut/plugin-virtual-takes --save
```

## Settings

| Name | Type | Description |
|-----------|----------|------------|
| takeProfit | number | Percentage level from order opening price |
| stopLoss | number | Percentage level from order opening price (positive number as well) |
| reduceWhen | number | Pecentage level from order price - reduce order size when reached |
| reduceSize | number | How many size of order need to reduce, default = 0.5 mean 50%, 1 - 100%, 0 - 0% |
| trailing | number | 1 - tradiling from opening, 2 - trailing ater take reached, 3 - trailing after each new take reached (trailing is disabled by default) |
| ignoreTicks | boolean | Ignore ticks, check takes on each candle closed |
| maxRetryOrders | number | Allows open new orders insted of closing by stop loss, no more than value |
| manual | boolean | Manual control, for using API |

## Plugin API
| Name | Description |
|-----------|------------|
| setForOrder | setup stop and take prices for signle order, setting up by passed options parameters (manual) |
| setPricesForOrder | setup stop and take prices for signle order, setting up by precalculated prices (manual) |
| setTrailingForOrder | setup stop and take prices for signle order, setting up by passed options parameters (manual) |
| getTakes | get take and stop price for order from plugin state |
| isManual | return manual state for plugin, need to use when another plugin depends from takes plugin |



## Takeaway setting
```javascript
// in context of Debut...
async onCandle({ c }) {
    // some entry conditions
    const order = await this.createOrder(target);
    let take = c + c * 0.15; // Assume 15%
    let stop = c - c * 0.10; // And the stop is 10%

    // If the trade is of the SELL type, swap the stop and take positions
    if (target === OrderType.SELL) {
        [take, stop] = [stop, take];
    }

    // Hand over the cid (client-id) to the price plugin.
    // Then it will monitor when it reaches a take or stop
    // after which it will automatically close the trade
    this.plugins.takes.setForOrder(order.cid, take, stop);

    return order;
}
```
