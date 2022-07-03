import { createChart } from './chart.js';
import './trading-vue.js';
document.addEventListener('DOMContentLoaded', async () => {
    const res = await fetch('./data.json', { mode: 'no-cors' });
    const json = await res.json();
    const dc = new TradingVueJs.DataCube({ ...json });
    const app = createChart(dc);
});
