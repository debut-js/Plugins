import { CrossValidate, INeuralNetworkOptions, NeuralNetwork } from 'brain.js';
import { file, math } from '@debut/plugin-utils';
import { Candle } from '@debut/types';
import path from 'path';
import { getDistribution, getQuoteRatioData, RatioCandle, DistributionSegment, getPredictPrices } from './utils';
import { NeuroVision } from './index';

export interface Params {
    segmentsCount: number;
    precision: number;
    inputSize: number;
    outputSize: number;
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

        let output: number[] = [];

        // test

        const groupData = this.dataset.map((ratioCandle) => {
            return this.distribution.findIndex(
                (group) => ratioCandle.ratio >= group.ratioFrom && ratioCandle.ratio < group.ratioTo,
            );
        });

        const normalizedData = groupData.map((item) => this.normalize(item));
        const denormalizedData = normalizedData.map((item) => this.denormalize(item));

        for (let i = 0; i < normalizedData.length; i++) {
            const groupId = normalizedData[i];

            if (groupData[i] !== denormalizedData[i]) {
                throw new Error('Invalid denormalization');
            }

            if (this.input.length < this.params.inputSize) {
                this.input.push(groupId);
                // Skip to next dataset item
                continue;
            }

            if (this.input.length === this.params.inputSize && output.length < this.params.outputSize) {
                output.push(groupId);
            }

            if (output.length === this.params.outputSize) {
                this.trainingSet.push({ input: [...this.input], output: [...output] });
                this.input.shift();
                this.input.push(groupId);
                output.length = 0;
            }
        }
    };

    /**
     * Add candle
     */
    addInput(candle: Candle) {
        const ratioCandle = this.prevCandle && getQuoteRatioData(candle, this.prevCandle);

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

            if (this.input.length > this.params.inputSize) {
                this.input.shift();
            }
        }
    }

    /**
     * Get forecast at the moment
     */
    momentActivate(candle: Candle): NeuroVision[] | undefined {
        const ratioCandle = this.prevCandle && getQuoteRatioData(candle, this.prevCandle);

        if (ratioCandle) {
            let idx = this.distribution.findIndex(
                (group) => ratioCandle.ratio >= group.ratioFrom && ratioCandle.ratio < group.ratioTo,
            );

            if (idx === -1) {
                idx = ratioCandle.ratio < this.distribution[0].ratioFrom ? 0 : this.distribution.length - 1;
            }

            const groupId = this.normalize(idx);
            const input = [...this.input, groupId];
            const output: NeuroVision[] = [];

            input.shift();

            if (input.length === this.params.inputSize) {
                const forecast = Array.from(this.network.run<number[], number[]>(input));

                for (let i = 0; i < forecast.length; i++) {
                    const cast = forecast[i];
                    const denormalized = this.denormalize(cast);
                    const group = this.distribution[denormalized];

                    output.push(getPredictPrices(candle.c, group.ratioFrom, group.ratioTo));
                }

                return output;
            }
        }
    }

    /**
     * Run forecast
     */
    activate(candle: Candle): NeuroVision[] | undefined {
        if (this.input.length === this.params.inputSize) {
            const forecast = Array.from(this.network.run<number[], number[]>(this.input));
            const output: NeuroVision[] = [];

            for (let i = 0; i < forecast.length; i++) {
                const cast = forecast[i];
                const denormalized = this.denormalize(cast);
                const group = this.distribution[denormalized];

                output.push(getPredictPrices(candle.c, group.ratioFrom, group.ratioTo));
            }

            return output;
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

    training(errTresh?: number) {
        const source = this.crossValidate || this.network;

        source.train(this.trainingSet, {
            // Defaults values --> expected validation
            iterations: 40000, // the maximum times to iterate the training data --> number greater than 0
            errorThresh: errTresh || 0.005, // the acceptable error percentage from training data --> number between 0 and 1
            log: true, // true to use console.log, when a function is supplied it is used --> Either true or a function
            logPeriod: 25, // iterations between logging out --> number greater than 0
            learningRate: 0.6, // scales with delta to effect training rate --> number between 0 and 1
            momentum: 0.1, // scales with next layer's change value --> number between 0 and 1
            timeout: 1500000,
        });

        if (!this.network) {
            this.network = this.crossValidate.toNeuralNetwork();
        }
    }

    private normalize(groupId: number) {
        // return groupId;
        return groupId / this.params.segmentsCount;
    }

    private denormalize(value: number) {
        // return Math.round(value);
        return Math.min(Math.round(value * this.params.segmentsCount), this.params.segmentsCount - 1);
    }
}
