# Official Debut plugin directory

📦 One department store for all plugins.

The official plugins for [Debut](https://github.com/debut-js/Debut) are collected here. This is a mono-repository - home to proven and quality extensions developed by the community.
Keep in mind that many unofficial plugins can negatively impact performance.

## List of plugins:

| Name | Description |
| ----------------------------------- | ---------------------------------------------------------- |
| [virtual-takes](packages/virtual-takes) | Simplified system of virtual stop/take in the form of constant interest, trailing |
| [genetic-shutdown](packages/genetic-shutdown) | An early "switch" of strategies for the geneticist. Allows you to greatly save resources |
| [grid](packages/grid) | To create strategies based on grids and martingale |
| [neuro-vision](packages/neuro-vision) | Uses a neural network to filterning or forecasting prices and entry points |
| [order-expire](packages/order-expire) | Limits the maximum duration of a trade by the number of candles |
| [reinvest](packages/reinvest) | Reveals profit and puts it into circulation on the following transactions |
| [report](packages/report) | Creation of strategy testing reports, charts based on [Plotly](https://plotly.com/javascript/), also allows you to visualize indicators |
| [session](packages/session) | Sets the running time of the strategy to the nearest minute. Start time and end time can be specified |
| [stats](packages/stats) | Plugin for collecting various statistics on the slave strategy. Shows drawdown, checkmate. waiting and stuff |

## Contributing
Requires npm v7.x.x to work

In the root directory, execute:

```bash
npm i
npm i --workspaces
npm run build --workspaces
```

to link to local packages use
```bash
npm run link --workspaces
```

### License
Apache-2.0 license prohibits commercial use of the codebase as part of the current repository
