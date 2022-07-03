import { createChart } from './chart.js';
import './trading-vue.js';

const es = new EventSource(`${location.origin}/sse`);
let inited = false;
let datacube = null;
let chart = null;
const markers = [];
const balance = [];

function init(data) {
    datacube = new TradingVueJs.DataCube(data);
    chart = createChart(datacube);
}

es.addEventListener('init', function (message) {
    const initialData = JSON.parse(message.data);
    init(initialData);
    inited = true;
});

es.addEventListener('tick', function (message) {
    if (inited) {
        const update = JSON.parse(message.data);
        datacube.update(update);
    }
    // const tick = JSON.parse(message.data);
    // const lastTick = data[data.length - 1];
    // if (lastTick && lastTick.time === tick.time) {
    //     data[data.length - 1] = tick;
    // } else {
    //     data.push(tick);
    //     if (data.length > 1000) {
    //         data.shift();
    //     }
    // }
    // barSeries.setData(data);
});

es.addEventListener('candle', function (message) {
    if (inited) {
        const update = JSON.parse(message.data);
        datacube.update(update);
    }
    // data[data.length - 1] = candle;
    // barSeries.setData(data);
});

es.addEventListener('open-order', function (message) {
    const update = JSON.parse(message.data);
    datacube.update(update);
});

es.addEventListener('close-order', function (message) {
    const update = JSON.parse(message.data);
    datacube.update(update);
});

// es.addEventListener('balance-change', function (message) {
//     balance.push(JSON.parse(message.data));
//     balanceSeries.setData(balance);
// });
