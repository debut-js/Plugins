import { Candle, PluginInterface } from '@debut/types';
import { cli } from '@debut/plugin-utils';
import { Network } from './neural';

export interface NeuroVisionPluginArgs {
    neuroTrain: boolean;
}

export interface NeuroVisionPluginOptions {
    windowSize: number; // 25;
    segmentsCount: number; // 6
    precision: number; // 3
    hiddenLayers?: number[];
    debug?: boolean;
}

interface Methods {
    nextValue(candle: Candle): { maxPrice: number; minPrice: number } | undefined;
    addTrainValue(candle: Candle): void;
    restore(): void;
    isTraining(): boolean;
}

interface NeuroVisionPluginInterface extends PluginInterface {
    name: 'neuroVision';
    api: Methods;
}

export interface NeuroVisionPluginAPI {
    neuroVision: Methods;
}

export function neuroVisionPlugin(params: NeuroVisionPluginOptions): NeuroVisionPluginInterface {
    const neuroTrain = 'neuroTrain' in cli.getArgs<NeuroVisionPluginArgs>();
    let neural: Network;

    return {
        name: 'neuroVision',
        api: {
            nextValue(candle: Candle) {
                return neural.activate(candle);
            },
            addTrainValue(candle: Candle) {
                neural.addTrainingData(candle);
            },
            restore() {
                neural.restore();
            },
            isTraining() {
                return neuroTrain;
            },
        },

        onInit() {
            const botData = cli.getBotData(this.debut.getName())!;
            const workingDir = `${botData.src}/neuro-vision/${this.debut.opts.ticker}/`;

            neural = new Network({ ...params, workingDir });
        },

        async onDispose() {
            if (neuroTrain) {
                neural.serveTrainingData();
                neural.training();
                neural.save();
            }
        },
    };
}
