import { CrossValidate, NeuralNetwork } from 'brain.js';
import { file, math } from '@debut/plugin-utils';
import { Candle } from '@debut/types';
import path from 'path';
import { getDistribution, getQuoteRatioData, RatioCandle, DistributionSegment } from './utils';

export interface Params {
    segmentsCount: number;
    precision: number;
    windowSize: number;
    workingDir: string;
    hiddenLayers?: number[];
    debug?: boolean;
}

export class Network {
    private crossValidate: CrossValidate;
    private network: NeuralNetwork = null!;
    private dataset: RatioCandle[] = [];
    private trainingSet: Array<{ input: number[]; output: number[] }> = [];
    private distribution: DistributionSegment[] = [];
    private prevCandle: Candle | null = null;
    private input: number[] = [];
    private layersPath: string;
    private gaussPath: string;

    constructor(private params: Params) {
        this.crossValidate = new CrossValidate(NeuralNetwork, {
            hiddenLayers: params.hiddenLayers || [32, 16], // array of ints for the sizes of the hidden layers in the network
            activation: 'sigmoid', // supported activation types: ['sigmoid', 'relu', 'leaky-relu', 'tanh'],
            leakyReluAlpha: 0.01,
        });

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

        this.dataset.forEach((ratioCandle) => {
            const groupId = this.normalize(
                this.distribution.findIndex(
                    (group) => ratioCandle.ratio >= group.ratioFrom && ratioCandle.ratio < group.ratioTo,
                ),
            );

            if (this.input.length === this.params.windowSize) {
                this.trainingSet.push({ input: [...this.input], output: [groupId] });
                this.input.shift();
            }

            this.input.push(groupId);

            // this.input.push(this.normalize(groupId));
        });
    };

    /**
     * Run forecast
     */
    activate(candle: Candle) {
        const ratioCandle = this.prevCandle && getQuoteRatioData(candle, this.prevCandle);

        this.prevCandle = candle;

        if (ratioCandle) {
            const groupId = this.normalize(
                this.distribution.findIndex(
                    (group) => ratioCandle.ratio >= group.ratioFrom && ratioCandle.ratio < group.ratioTo,
                ),
            );

            this.input.push(groupId);

            if (this.input.length === this.params.windowSize) {
                const forecast = this.network.run<number[], number[]>(this.input);
                this.input.shift();

                const denormalized = this.denormalize(forecast[0]);
                const group = this.distribution[denormalized];

                return {
                    maxPrice: candle.c * group.ratioTo,
                    minPrice: candle.c * group.ratioFrom || candle.c,
                };
            }
        }
    }

    save() {
        file.ensureFile(this.gaussPath);
        file.ensureFile(this.layersPath);
        file.saveFile(this.gaussPath, this.distribution);
        file.saveFile(this.layersPath, this.crossValidate.toJSON());
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
        this.network = this.crossValidate.fromJSON(nnLayers);
    }

    training() {
        this.crossValidate.train(this.trainingSet, {
            // Defaults values --> expected validation
            iterations: 40000, // the maximum times to iterate the training data --> number greater than 0
            errorThresh: 0.001, // the acceptable error percentage from training data --> number between 0 and 1
            log: true, // true to use console.log, when a function is supplied it is used --> Either true or a function
            logPeriod: 100, // iterations between logging out --> number greater than 0
            learningRate: 0.3, // scales with delta to effect training rate --> number between 0 and 1
            momentum: 0.1, // scales with next layer's change value --> number between 0 and 1
            timeout: 1500000,
        });
        this.network = this.crossValidate.toNeuralNetwork();
    }

    private normalize(groupId: number) {
        // return groupId;
        return math.toFixed(groupId / (this.params.segmentsCount - 1), this.params.precision);
    }

    private denormalize(value: number) {
        // return Math.round(value);
        return Math.floor(value * this.params.segmentsCount);
    }
}
