# @debut/more-candles
Плагин Debut, позволяет хранить указанное количество свечей, вместо 10 в this.candles.

## Установка

```
npm install @debut/more-candles --save
```

## Настройки

| Название | Тип | Описание   |
|-----------|----------|------------|
| amountOfCandles  |  number | Количество свеч которое нужно хранить |

## Использование плагина
```javascript
import { moreCandlesPlugin, MoreCandlesPluginApi, MoreCandlesPluginOptions } from '@debut/plugin-more-candles';

export interface MyStrategyOptions extends DebutOptions, MoreCandlesPluginOptions;

export class MyStrategy extends Debut {
    declare plugins: MoreCandlesPluginApi;

    constructor(transport: BaseTransport, opts: MyStrategyOptions) {
        super(transport, opts);

        this.registerPlugins([
            moreCandlesPlugin({ amountOfCandles: 40 }),
        ]);
    }

    async onCandle(candle: Candle) {
        // usage
        const candles = this.plugins.moreCandles.getCandles();
    }
}
```
