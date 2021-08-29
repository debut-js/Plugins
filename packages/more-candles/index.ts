import { PluginInterface, Candle } from '@debut/types';

interface MoreCandlesPluginInterface extends PluginInterface {
    name: 'moreCandles';
    api: {
        getCandles: () => Candle[];
    };
}

export type MoreCandlesOptions = {
    amountOfCandles: number;
};

export interface MoreCandlesPluginAPI {
    moreCandles: {
        getCandles: () => Candle[];
    };
}

export function moreCandlesPlugin(opts: MoreCandlesOptions): MoreCandlesPluginInterface {
    let extendedCandles: Candle[] = [];

    return {
        name: 'moreCandles',
        api: {
            getCandles() {
                return extendedCandles;
            },
        },

        async onCandle(candle: Candle) {
            extendedCandles.unshift(candle);

            if (extendedCandles.length > opts.amountOfCandles) {
                extendedCandles = extendedCandles.slice(0, opts.amountOfCandles);
            }
        },
    };
}
