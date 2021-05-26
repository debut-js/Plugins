import { PluginInterface, ExecutedOrder, Candle, PluginCtx, OrderType, utils } from '@debut/community-core';

export function debugPlugin(): PluginInterface {
    let stats: StatsInterface;
    let prevTick: Candle;
    let listener;

    return {
        name: 'debug',
        onInit() {
            stats = this.findPlugin<StatsInterface>('stats');

            if (!stats) {
                throw 'Production debug: stats plugin is required!';
            }

            listener = () => {
                console.log(`\n------ DEBUG ${this.pinstock.getName()} - ${this.pinstock.opts.ticker} ------- \n`);
                console.log('\n------ STATS ------- \n');
                console.log(stats.api.report());
                console.log('\n------ CURRENT ORDER ------- \n');
                console.log(this.pinstock.orders);
                console.log('\n------ LAST TICK ------- \n');
                console.log(prevTick);
                console.log(`\n------ DEBUG END ------- \n`);
            };

            process.on('SIGUSR1', listener);
        },

        async onTick(tick) {
            prevTick = tick;
        },

        async onDispose() {
            process.off('SIGUSR1', listener);
        },
    };
}
