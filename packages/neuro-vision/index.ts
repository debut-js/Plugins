import { Candle, PluginInterface } from '@debut/types';
import { cli } from '@debut/plugin-utils';
import { Network } from './neural';

export interface NeuroVision {
    low: number;
    high: number;
    avg: number;
}

export interface NeuroVisionPluginArgs {
    neuroTrain: boolean;
}

export interface NeuroVisionPluginOptions {
    inputSize: number; // 25;
    outputSize: number;
    segmentsCount: number; // 6
    precision: number; // 3
    hiddenLayers?: number[];
    debug?: boolean;
    crossValidate?: boolean;
    errTresh?: number;
}

interface Methods {
    addInput(candle: Candle): void;
    momentForecast(candle: Candle): NeuroVision[] | undefined;
    forecast(candle: Candle): NeuroVision[] | undefined;
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
            addInput(candle: Candle) {
                return neural.addInput(candle);
            },
            momentForecast(candle: Candle) {
                return neural.momentActivate(candle);
            },
            forecast(candle: Candle) {
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

        async onInit() {
            const botData = await cli.getBotData(this.debut.getName())!;
            const workingDir = `${botData?.src}/neuro-vision/${this.debut.opts.ticker}/`;

            neural = new Network({ ...params, workingDir });
        },

        async onDispose() {
            if (neuroTrain) {
                neural.serveTrainingData();
                neural.training(params.errTresh);
                neural.save();
            }
        },
    };
}
