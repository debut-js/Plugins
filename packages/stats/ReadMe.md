# @debut/plugin-stats
The Debut plugin, for collecting trade statistics. It works both in real time and in the strategy tester.

## Installation

```
npm install @debut/plugin-stats --save
```

## Parameters
| Name | Type | Description |
|-----------|----------|------------|
| amount | number | number Initial amount to trade |

## API
The plugin has only two methods:

`this.plugins.stats.report()` - allows you to generate a report in human-understandable form, with rounded numbers to 2 decimal places

`this.plugins.stats.getState()` - gives the current state of data without any processing, allows to get real data quickly, if necessary, without causing slow formatting


## Stats description
| Name | Description |
|----------|------------|
| startBalance | start means |
| balance | end (current) level of funds |
| maxBalance | maximum level of funds for the trading period |
| minBalance | minimum level of funds for the trading period |
| maxMarginUsage | maximum margin (funds over one trade) |
| profit | net profit excluding commissions |
| long | number of buy trades |
| longRight | Number of profitable buy trades |
| short | number of shorts |
| shortRight | Number of profitable shorts |
| absoluteDD | absolute drawdown |
| relativeDD | relative drawdown |
| maxWin | Maximum gain per trade |
| maxLoose | Maximum loss per trade |
| profitProb | Probability of profitable trade |
| looseProb | Probability of losing trade |
| expectation | mathematical expectation of winning |
| failLine | Maximum length of a series of losing trades of any type |
| rightLine | Maximum length of a series of profitable trades of any type |
| avgFailLine | Average length of the series of losing trades |
| avgRightLine | Average length of the series of profitable trades |
| ticksHandled | Number of processed ticks for the period of work |
| candlesHandled | Number of candles processed during the period of work |
