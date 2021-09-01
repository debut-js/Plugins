# @debut/plugin-genetic-shutdown
Debut plugin, to speed up the genetic algorithm process. Allows you to discard configurations with bad metrics at an early stage.

## Working Principle
The plugin makes a control slice of the statistics every 30 days. If one of the default conditions describing the configuration as bad is met during that time, the strategy variant is disabled and stops performing further calculations, which saves resources.

## Default disconnection conditions
Relative drawdown greater than 30%. 2.
Absolute drawdown is over 35%
3. Long/Shorts ratio is less than 0.25 (this strategy is short only)
4. Long/Shorts ratio is greater than 2 (this strategy trades only longs)
5. Less than 30 Long or Short trades in 30 days
6. Less than half of any positions were profitable

## Install

```
npm install @debut/plugin-genetic-shutdown --save
```

## Setup
It is recommended to initialize the plugin in a Meta file of the strategy, only for the `WorkingEnv.genetic` environment
Example implementation in `meta.ts` file

```javascript
import { geneticShutdownPlugin } from '@debut/plugin-genetic-shutdown';
// ...
// custom shutdown method
const shutdown = (stats: StatsState, state: ShutdownState) => ...

const meta: DebutMeta = {.
    // ...
    async create(transport: BaseTransport, cfg: MyStrategyOptions, env: WorkingEnv) {
        const bot = new SpikesG(transport, cfg);

        //specific environment plugins
        if (env === WorkingEnv.genetic) {
            // The second shutdown argument can be omitted if the standard shutdown conditions work for us
            bot.registerPlugins([geneticShutdownPlugin(cfg.interval, shutdown)]);
        }
        // ...
    }
```


## Customizing shutdown conditions
`ShutdownState` - allows to get number of deals or profits at the beginning of period (or end of previous period). And also the number of candlesticks at the moment in the current period.

```javascript
const shutdown = (stats: StatsState, state: ShutdownState) => {
    const totalOrders = stats.long + stats.short;

    // add conditions for at least 5 trades within 30 days
    if (state.prevOrders && totalOrders - state.prevOrders < 5) {
        return true;
    }

    // Add a condition to limit maximal margin (e.g. for Grid strategies)
    if (stats.maxMarginUsage > 10000) {
        return true;
    }

    return stats.relativeDD > 80 || stats.absoluteDD > 30;
};

```
