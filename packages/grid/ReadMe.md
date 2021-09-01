# @debut/plugin-grid
The Debut plugin allows you to organize the operation of strategies on a grid system (DCA). It is a system of additional purchases with an increase in volumes at each additional purchase by martingale. To open trades, grid levels with a fixed distance between them are used. It is also possible to use the Fibonacci distance between the levels.

## Install

```
npm install @debut/plugin-grid --save
```

## Settings

| Name | Type | Description |
| ----------- | ---------- | ------------ |
| step | number | Grid step, percentage. The step is always the same if the `fibo` option is not activated |
| fibo | boolean | Calculation of Fibonacci levels. Each next level of the grid is equal to the sum of the two previous |
| martingale | number | Martingale coefficient. Determines the number of lots for a trade. In the classic martingale system it is equal to 2, which means that we always double the lot of the previous deal, if 1 - the lot will be fixed |
| levelsCount | number | The number of grid levels, the more the more funds you need |
| takeProfit | number | Take profit as a percentage. Calculated as the total profit from open positions in relation to the initial capital |
| stopLoss | number | Stop loss in percentage. It is calculated by the sum of all open positions, as well as takeProfit* |
| reduceEquity | boolean | Each next grid start lot will reduced |
| trend | boolean | default - false, true mean top levels initiate buy, bottom levels initiate sell (reversed) |

\* Stop/Take does not work on the basis of price, but on the basis of a percentage of funds.

## Plugin initialization
```javascript
import { gridPlugin, GridPluginOptions } from '@debut/plugin-grid';

// ...
export interface MyStrategyOptinos extends DebutOptions, GridPluginOptions;

export class MyStrategy extends Debut {
    declare plugins: GridPluginAPI;
    constructor(transport: BaseTransport, opts: CCISolderGOptions) {
        super(transport, opts);

        this.registerPlugins([
            // ...
            gridPlugin(this.opts),
            // ...
        ]);
    }

    onCandle(candle) {
        // Grid can created manually withoun order
        // if (!this.orders.length) {
        //     this.plugins.grid.createGrid(candle.c;
        // }

        // By default, the grid is created automatically, instead of closing the first order at a loss
    }
```

## Screenshots (by report plugin [Report](../report/))

<p>
<img alt="Grid Strategy price trap" src="img/screen2.png" width="400"></br>
Trading against the trend on a grid of transactions
</p>
