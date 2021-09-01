# @debut/plugin-reinvest
Debut plugin, for adding profits from trades to your starting capital (re-investment). It is mainly used to increase profits. When enabled, all profits or losses from trades will be subtracted or added to the initial capital.

## Setup

```
npm install @debut/plugin-reinvest --save
```

## Initializing the plugin
```javascript
import { reinvestPlugin } from '@debut/plugin-reinvest';

// ...
// Strategy constructor in the context of Debut...
constructor(transport: BaseTransport, opts: MyStrategyOpts) {
    super(transport, opts);

    this.registerPlugins([
        // ...
        // You can optionally enable it with a custom configuration, or always enable it
        this.opts.reinvest ? reinvestPlugin() : null,
        // ...
    ]);
}
```
