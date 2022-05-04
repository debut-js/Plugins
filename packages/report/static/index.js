import './vue.js';
import './trading-vue.js';
import trades from './overlays/orders.js';
import indicators from './overlays/indicators.js';
import balance from './overlays/balance.js';

(async function () {
    const res = await fetch('./data.json', { mode: 'no-cors' });
    const json = await res.json();
    const { rangeFrom, rangeTo, toolbar } = json.settings;
    const app = new Vue({
        el: '#chart',
        data: {
            data: new TradingVueJs.DataCube({ ...json }),
            overlays: [trades, indicators, balance],
            width: window.innerWidth,
            height: window.innerHeight,
            night: true,
            title: json.title,
            toolbar,
        },
        mounted() {
            window.addEventListener('resize', this.onResize);
            // @ts-ignore
            window.DataCube = this.data;
            this.$nextTick(() => {
                this.data.tv.setRange(rangeFrom, rangeTo);
            });
        },
        methods: {
            onResize(event) {
                this.width = window.innerWidth;
                this.height = window.innerHeight;
            },
        },
        computed: {
            colors() {
                return this.night
                    ? {}
                    : {
                          colorBack: '#fff',
                          colorGrid: '#eee',
                          colorText: '#333',
                      };
            },
        },
        beforeDestroy() {
            window.removeEventListener('resize', this.onResize);
        },
    });
})();
