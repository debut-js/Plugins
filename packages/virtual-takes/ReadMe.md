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
| trailing | number | 1 - tradiling from opening, 2 - trailing ater take reached trailing is disabled by default, 3 - trailing after each new take reached |
| ignoreTicks | boolean | Ignore ticks, check takes on each candle closed |
| manual | boolean | Manual control, for using API |

## Plugin API
| Name | Description |
|-----------|------------|
| setForOrder | setup stop and take prices for signle order, setting up by passed options parameters |
| getTakes | get take and stop price for order from plugin state |
| isManual | return manual state for plugin, need to use when another plugin depends from takes plugin |
