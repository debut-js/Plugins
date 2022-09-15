import { CrossValidate, INeuralNetworkOptions, NeuralNetwork } from 'brain.js';
import { file, math } from '@debut/plugin-utils';
import { Candle } from '@debut/types';
import path from 'path';
import { getDistribution, getQuoteRatioData, RatioCandle, DistributionSegment } from './utils';
import { NeuroVision } from './index';

export interface Params {
    segmentsCount: number;
    precision: number;
    windowSize: number;
    workingDir: string;
    hiddenLayers?: number[];
    debug?: boolean;
    crossValidate?: boolean;
}

export class Network {
    private crossValidate: CrossValidate = null!;
    private network: NeuralNetwork = null!;
    private dataset: RatioCandle[] = [];
    private trainingSet: Array<{ input: number[]; output: number[] }> = [];
    private distribution: DistributionSegment[] = [];
    private prevCandle: Candle | null = null;
    private input: number[] = [];
    private layersPath: string;
    private gaussPath: string;

    constructor(private params: Params) {
        const nnOpts: INeuralNetworkOptions = {
            hiddenLayers: params.hiddenLayers || [32, 16], // array of ints for the sizes of the hidden layers in the network
            activation: 'sigmoid', // supported activation types: ['sigmoid', 'relu', 'leaky-relu', 'tanh'],
            leakyReluAlpha: 0.01,
        };
        if (this.params.crossValidate) {
            this.crossValidate = new CrossValidate(NeuralNetwork, nnOpts);
        } else {
            this.network = new NeuralNetwork(nnOpts);
        }

        this.gaussPath = path.resolve(params.workingDir, './gaussian-groups.json');
        this.layersPath = path.resolve(params.workingDir, './nn-layers.json');
    }

    /**
     * Add training set with ratios and forecast ratio as output
     */
    addTrainingData = (candle: Candle) => {
        const ratioCandle = this.prevCandle && getQuoteRatioData(candle, this.prevCandle);

        if (ratioCandle) {
            this.dataset.push(ratioCandle);
        }

        this.prevCandle = candle;
    };

    serveTrainingData = () => {
        this.distribution = getDistribution(this.dataset, this.params.segmentsCount, this.params.precision);
        if (this.params.debug) {
            console.log(this.distribution);
        }

        for (let i = 0; i < this.dataset.length; i++) {
            const ratioCandle = this.dataset[i];
            const groupId = this.normalize(
                this.distribution.findIndex(
                    (group) => ratioCandle.ratio >= group.ratioFrom && ratioCandle.ratio < group.ratioTo,
                ),
            );

            this.input.push(groupId);

            if (this.input.length === this.params.windowSize) {
                const forecastingRatio = this.dataset[i + 1]?.ratio;

                if (!forecastingRatio) {
                    break;
                }

                const outputGroupId = this.distribution.findIndex(
                    (group) => forecastingRatio >= group.ratioFrom && forecastingRatio < group.ratioTo,
                );
                const normalizedOutput = this.normalize(outputGroupId);

                this.trainingSet.push({ input: [...this.input], output: [normalizedOutput] });
                this.input.shift();
            }

            // this.input.push(this.normalize(groupId));
        }
    };

    /**
     * Run forecast
     */
    activate(candle: Candle, count = 1): NeuroVision[] | undefined {
        const ratioCandle = this.prevCandle && getQuoteRatioData(candle, this.prevCandle);
        const result: NeuroVision[] = [];

        this.prevCandle = candle;

        if (ratioCandle) {
            let idx = this.distribution.findIndex(
                (group) => ratioCandle.ratio >= group.ratioFrom && ratioCandle.ratio < group.ratioTo,
            );

            if (idx === -1) {
                idx = ratioCandle.ratio < this.distribution[0].ratioFrom ? 0 : this.distribution.length - 1;
            }

            const groupId = this.normalize(idx);

            this.input.push(groupId);

            if (this.input.length === this.params.windowSize) {
                const forecast = this.network.run<number[], number[]>(this.input).slice(0, count);
                console.log('fcst:', forecast);
                this.input.shift();

                while (forecast.length) {
                    const cast = forecast.shift();

                    if (!cast) {
                        break;
                    }

                    const denormalized = this.denormalize(cast);
                    const group = this.distribution[denormalized];

                    if (!group) {
                        console.log(denormalized);
                    }

                    result.push(group.classify);
                }
            }

            return result;
        }
    }

    save() {
        const source = this.crossValidate || this.network;
        file.ensureFile(this.gaussPath);
        file.ensureFile(this.layersPath);
        file.saveFile(this.gaussPath, this.distribution);
        file.saveFile(this.layersPath, source.toJSON());
    }

    restore() {
        const groupsData = file.readFile(this.gaussPath);
        const nnLayersData = file.readFile(this.layersPath);

        if (!groupsData) {
            throw 'Unknown data in gaussian-groups.json, or file does not exists, please run training before use';
        }

        if (!nnLayersData) {
            throw 'Unknown data in nn-layers.json, or file does not exists, please run training before use';
        }

        const nnLayers = JSON.parse(nnLayersData);

        this.distribution = JSON.parse(groupsData);

        if (this.params.crossValidate) {
            this.network = this.crossValidate.fromJSON(nnLayers);
        } else {
            this.network.fromJSON(nnLayers);
        }
    }

    training() {
        const source = this.crossValidate || this.network;

        source.train(this.trainingSet, {
            // Defaults values --> expected validation
            iterations: 40000, // the maximum times to iterate the training data --> number greater than 0
            errorThresh: 0.001, // the acceptable error percentage from training data --> number between 0 and 1
            log: true, // true to use console.log, when a function is supplied it is used --> Either true or a function
            logPeriod: 100, // iterations between logging out --> number greater than 0
            learningRate: 0.3, // scales with delta to effect training rate --> number between 0 and 1
            momentum: 0.1, // scales with next layer's change value --> number between 0 and 1
            timeout: 1500000,
        });

        if (!this.network) {
            this.network = this.crossValidate.toNeuralNetwork();
        }
    }

    private normalize(groupId: number) {
        // return groupId;
        return math.toFixed(groupId / (this.params.segmentsCount - 1), this.params.precision);
    }

    private denormalize(value: number) {
        // return Math.round(value);
        return Math.min(Math.floor(value * this.params.segmentsCount), this.params.segmentsCount - 1);
    }
}
