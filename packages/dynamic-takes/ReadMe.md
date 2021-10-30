# @debut/plugin-dynamic-takes
The Debut plugin for setting take and stop prices in manual mode. Allows you to set or change stop and take prices for open positions at any time using their identifier. It also allows you to optionally make fill-ups instead of closing unprofitable positions.

## Install

```
npm install @debut/plugin-dynamic-takes --save
```

## Settings

| Name | Type | Default value | Description |
|-----------|------------|----------|------------|
| trailing | boolean | false | trailing a stop position after setting the takes and stops |
| ignoreTicks | boolean | false | ignore ticks, because it often happens that stops can be knocked out by the shadow but not the body of the candle |
| maxRetryOrders | number | 0 | Sets the number of buybacks |

## Plugin API
| Name | Description |
|-----------|------------|
| setTrailingForOrder | start trailing for a single target order |
| setForOrder | setup stop and take prices for signle order, setting up by passed options parameters |
| getTakes | get take and stop price for order from plugin state |

#### \* The rebates are always of the same size as the original position. They are executed when the stop of the last created trade reaches the stop. Stop levels will be copied from the original trade.

#### \*\** If the number of pending orders is not set, the position will be closed when the stop is reached.
When the maximum number of pending orders is reached, the system will set takeovers to the breakeven level on all trades, and if the price does not turn around, all previously created trades will be closed at a loss.

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
    this.plugins.dynamicTakes.setForOrder(order.cid, take, stop);

    return order;
}
```

## Screenshots (plugin [Report](../report/))

Order with zero loose level | Profitable close with support order
:------------------------------------------------------------------:|:-------------------------------------------------------------------------:
<img alt="Deal with withdrawal at 0" src="img/screen1.png" width="400"> | <img alt="Profitable deal with docup" src="img/screen2.png" width="400">
