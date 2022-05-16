# @debut/plugin-report

<p align="center"><img alt="Debut Report, report plugin" src="img/banner.png" width="1000"></p>

Debut plugin, for setting targets and stops in manual mode. Allows you to set or change the stop and take prices for open positions at any time, using their identifier. It also allows you to optionally make additions instead of closing unprofitable positions.
By default, the plugin draws balance changes and the used margin (if the strategy has more than 1 trade at a time). It has some API to customize it.

## Install

```
npm install @debut/plugin-report --save
```

## Settings

### Creation of indicators
During initialization, you can pass an array of data to the plugin to build a chart of indicators.  To do this, create a method, for example `getIndicators` that returns the indicators plotting scheme [`IndicatorsSchema`](https://github.com/debut-js/Plugins/tree/master/packages/report#%D0%BE%D0%BF%D0%B8%D1%81%D0%B0%D0%BD%D0%B8%D0%B5-%D1%81%D1%85%D0%B5%D0%BC%D1%8B-%D0%B8%D0%BD%D0%B4%D0%B8%D0%BA%D0%B0%D1%82%D0%BE%D1%80%D0%B0-indicator)

```javascript
import { ReportPluginAPI, IndicatorsSchema } from '@debut/plugin-report';
// ...

// In Debut context.
public getIndicators = (): IndicatorsSchema => {
    return [{
        // Indicator name
        name: 'cci',
        // array of lines
        lines: [{
            name: 'cci',
            getValue: () => {
                return this.cciValue;
            },
        }],
        // levels
        levels: [-100, 100],
    }];
```

### Initialize plugin

In the `create` method in the meta file of the strategy, add to the `tester` environment for initialization

```javascript
// ...
async create(transport: BaseTransport, cfg: MyStrategyNameOptions, env: WorkingEnv) {
    const bot = new MyStrategyName(transport, cfg);
    // ...
    // environment-specific plugins
    if (env === WorkingEnv.tester) {
        // Plugin registration
        bot.registerPlugins([reportPlugin()]);

        // installing the indicators
        bot.plugins.report.addIndicators(bot.getIndicators());
    }

    // ...
    return bot;
},
```

### Web server for viewing statistics
The server is started with the command ``npm run serve`` to do this, add the appropriate command to the `scripts` section in the package.json file.

```json
// ...
"scripts": {
    "serve": 'report-serve',
    // ...
}
```

### Description of indicator circuit `Indicator

| Name | Type | Description |
|-----------|------------|------------|
name | string | name of curve group, not shown on the chart, serves for the creation and storage of service information about the indicator.
Figures | Array<{ name: string; getValue: () => number; fill: boolean; type: FigureType; }> | array of lines, the `name` field - describes the line name on the chart, the `getValue` method - returns the current indicator value at this time, `fill` - allows to fill by `FillType` either to axis or to line below, `FigureType` supports line and bar.
levels | number[] | array of numbers, to draw constant lines of levels on the chart
inChart | boolean | way of placing the indicator. If `true` the indicator will be drawn on a candlestick chart, on top of the candlesticks. If `false`, the indicator is drawn separately from the price chart. For example, the _SMA_ or _Bollinger Bands_ indicators are drawn in `inChart: true` mode.

### API description
All API is available through the call `this.plugins.report.method_name`, you can read more about how the API works in the documentation.

| Method name | Description |
|------------------------|------------|
addIndicators | Allows you to pass the scheme for creation of indicators, it is called once at plugin initialization
disableProfitPlot | When called, disables profit drawing on the chart. It is mainly used for convenience, when there is not enough space on the chart to draw indicators or candlesticks.
setXRange | Sets the range of values for the X-axis, allows you to cut off the beginning and end. It takes values from and to what time to cut off.
disableOrdersDisplay | Disables trade visualization when called
setManualOrder | Allows you to draw on the chart any deal in the manual mode, using the passed price and time parameters.
addOpenTarget | Allows you to create on the chart only the point of opening a deal in manual mode
resetOrders | Clear trades on the chart

### Example MACD indicator

```javascript
public getIndicators = (): IndicatorsSchema => {
    return [
        {
            name: `MACD Indicator',
            shapes: [
                {
                    name: 'signal',
                    fill: FillType.tozeroy,
                    getValue: () => {
                        return this.macdValue.signal;
                    },
                    color: 'red',
                    fillcolor: 'rgba(255, 0, 0, 0.2)',
                },
                {
                    name: 'macd',
                    fill: FillType.tozeroy,
                    getValue: () => {
                        return this.macdValue.macd;
                    },
                },
                {
                    name: 'histogram',
                    type: FigureType.bar,
                    getValue: () => {
                        return this.macdValue.histogram;
                    },
                },
            ],
        },
    ];
};
```
