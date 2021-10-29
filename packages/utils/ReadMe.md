# @debut/plugin-utils
A set of indispensable utilities for the Debut ecosystem.

## Installation

```
npm install @debut/plugin-utils --save
```

<hr/>

## CLI - Command Line Interface utilities

### `requireUncached(module: string)`
Allows the specified module to be connected without the standard Node caching. Instead of a native call to `require(module: string)`

### `getBotsSchema()`
Get the contents of `schema.json` file

### `getBotData(name: string, schema = getBotsSchema())`
Getting the bot's meta data by the name of the constructor.

### `getArgs<T>()`
Gets the arguments passed at startup. Returns an object key-value.

Example: `node ./myscript.js --arg1=foo --arg2=bar`.

```javascript
import { cli } from '@debut/plugin-utils`;

const args = getArgs(); // { arg1: "foo", arg2: "bar" }
```

### `getTokens()`.
Getting an object with private keys to work with the broker's API. From the file `.tokens.json` in the working directory of the project.

<hr/>.

## Date - Utilities for working with dates

### `isSameDay(d1: Date, d2: Date)`
Are the two dates the same day

### `isWeekend(d: string | number | Date)`
Is the date the same day off

### `toIsoString(d: string | number | Date)`
Convert date to custom ISO format to work with tinkoff API.

### `getWeekDay(stamp: number)`
Get the day of the week in UTC time stamp

### `intervalToMs(interval: TimeFrame)`
Converting candlestick timeframe into a value in milliseconds

<hr/>

## Debug - Debugging utilities

### `logDebug(...data: any[])`
Logging with event time information

<hr/>

## File - Utilities for working with files

### `saveFile(path: string, data: any)`
## `saveFile(path: string: data: any`) ## Save the transferred data to the `path` path

### `ensureFile(path: string)`
Checks if the path exists; if it does not, creates it

### `readFile(path: string)`
Safely reads a file

### `isDir(path: string)`
Is the path a directory

<hr/>

## Math - Calculation utilities

### `clamp(num: number, min: number, max: number)`
Clamping a number between a minimum and a maximum value

### `getPrecision(number: number | string)`
Getting the precision of a floating point number calculation

### `percentChange(current: number, prev: number)`
Percentage difference between two numbers

### `toFixed(num: number, precision = 2)`
A quick fix for the accuracy of a calculation, without losing type

### `getRandomArbitrary(min: number, max: number, odd?: boolean)`
Generation of a random number in the range [min, max] and optionally an odd number

### `getRandomInt(min: number, max: number, odd?: boolean)`
Generation of a random integer in the range [min, max], optionally odd

<hr/>

## Orders - Utilities for working with deals

### `inverseType(type: OrderType)`
Inverts the type of a trade

### `syntheticOrderId(order: ExecutedOrder | OrderOptions)`
Synthetic random identifier for a trade

### `getMinIncrementValue(price: number | string)`
Minimum value in the accuracy of the passed number

### `getCurrencyProfit(order: ExecutedOrder, price: number)`
Counting the current profit in the currency of the trade

### `getCurrencyBatchProfit(orders: ExecutedOrder[], price: number)`
Counting current profit in the currency of the trade for several orders simultaneously

### `getCurrencyComissions(orders: ExecutedOrder[], price: number, fee: number)`
Counting current commision for single order based on predicatable fee number

### `getCurrencyBatchComissions(orders: ExecutedOrder[], price: number, fee: number)`
Counting current commision for several orders order based on predicatable fee number

<hr/>

## Promise

### `sleep(ms: number)`
Initializes downtime for some time in milliseconds
