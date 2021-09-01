# @debut/plugin-order-expire
The Debut plugin allows you to limit the lifetime of open positions by the number of candles in the current time frame. It is mainly used for closing "hanging" positions during long sideways periods or when the original signal for a trade loses its relevance after some time.

## Setting

```
npm install @debut/plugin-order-expire --save
```

## Settings

| Name | Type | Description
|-----------|----------|------------|
| orderCandlesLimit | number | number Maximum lifetime of the trade in number of candles |
| closeAtZero | number | at half of the limit start to close the trade at zero |
