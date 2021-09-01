# @debut/plugin-session
The Debut plugin, for limiting the trading session time. Allows you to configure the working hours for the strategy, as well as to detect the change of the day. The plugin automatically performs the correction of time zones, at the transition of USA to summer and winter time, so there are no failures on time shifts during testing. It is recommended to use to block work on pre or post market exchanges.

## Setup

```
npm install @debut/plugin-session --save
```

## Settings
The plugin has a number of parameters available for customization during initialization.

## Parameters
| Name | Type | Description |
|-----------|----------|------------|
| from | string | string in format `HH:MM`, for example `10:00` (GMT+3) time of opening of the main session of exchange MOEX |
| to | string | string in the format `HH:MM`, for example `19:00` (GMT+3) time of the end of the main session of the MOEX |
| onDayChanged | Function | Optionally, you can pass a function to be called on day change |

The time is set locally. The plugin automatically adjusts for the current time zone.
## Initialization
```javascript
import { SessionPluginOptions, sessionPlugin } from '@debut/plugin-session';

export interface MyStrategyOpts extends DebutOptions, SessionPluginOptions;

// ...
constructor(transport: BaseTransport, opts: MyStrategyOpts) {
    super(transport, opts);

    this.registerPlugins([
        // ...
        this.opts.from && this.opts.to && sessionPlugin(this.opts),
        // ...
    ]);
```

## Work with Genetic
The plugin automatically removes candles, which are not within a range specified in the time settings. This will increase the speed of the strategy optimization.

To enable the candlestick filtration, add the appropriate filter in the meta file (`meta.ts`)

```javascript
import { createSessionValidator } from '@debut/plugin-session';

// ...
ticksFilter(cfg: MyStrategyOpts) {
    if (!cfg.from && !cfg.to) {
        return () => true;
    }

    const tickValidator = createSessionValidator(cfg.from, cfg.to, cfg.noTimeSwitching);

    return (tick) => {
        return tickValidator(tick.time).inSession;
    };
},
// ...

```
