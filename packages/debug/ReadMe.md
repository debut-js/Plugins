# @debut/plugin-debug

Debut plugin, for displaying debug information while the node process is running (when the Debut-based application is running).
## Installation

```bash
npm install @debut/plugin-debug --save
```

## Usage

Use your process manager to send the [SIGUSR1](https://ru.wikipedia.org/wiki/SIGUSR1_%D0%B8_SIGUSR2) command to the application process.

Or linux command:
```bash
kill -USR1 $ pid
```
## Example of console output

```bash
------ DEBUG MYSTRATEGY - NEARUSDT -------


------ STATS -------

{
  startBalance: 500,
  balance: 720.72,
  maxBalance: 775.63,
  minBalance: 500,
  maxMarginUsage: 500,
  profit: 220.72,
  long: 11,
  longRight: 6,
  short: 6,
  shortRight: 4,
  absoluteDD: 1.63,
  relativeDD: 7.08,
  maxWin: 22.6,
  maxLoose: -7.76,
  profitProb: 0.59,
  looseProb: 0.41,
  avgProfit: 31.39,
  avgLoose: 13.31,
  expectation: 12.98,
  failLine: 3,
  rightLine: 5,
  avgFailLine: 1.33,
  avgRightLine: 3.33,
  ticksHandled: 48714,
  candlesHandled: 2000
}

------ CURRENT ORDER -------

[]

------ LAST TICK -------

{
  o: 3.2529,
  h: 3.2529,
  l: 3.211,
  c: 3.2445,
  v: 41676.93,
  time: 1622145600000
}

------ DEBUG END -------
```
