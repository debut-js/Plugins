import { NeuralNetwork } from 'brain.js';
import { utils } from 'debut';

export type TrainingData<T> = { input: T[]; output: [number] | null; id: string };

export class NeuroHelper<T = number> {
    public trained = false;
    protected nn: NeuralNetwork;
    protected trainingSet: Array<TrainingData<T>> = [];
    protected botData: utils.cli.BotData;

    constructor(botName: string, nnOptions: ConstructorParameters<typeof NeuralNetwork>[0] = {}) {
        this.botData = utils.cli.getBotData(botName);
        this.nn = new NeuralNetwork({
            hiddenLayers: [64, 32, 16], // array of ints for the sizes of the hidden layers in the network
            activation: 'sigmoid', // supported activation types: ['sigmoid', 'relu', 'leaky-relu', 'tanh'],
            leakyReluAlpha: 0.01,
            ...nnOptions,
        });
    }

    public addTrainingData(data: TrainingData<T>) {
        this.trainingSet.push(data);
    }

    public updateTrainingOut(id: string, output: number) {
        const target = this.trainingSet.find((item) => item.id === id);

        if (!target) {
            return;
        }

        target.output = [output];
    }

    public train(options: { iterations?: number; errorThresh?: number; log?: boolean } = {}) {
        this.trainingSet.forEach((data) => {
            if (!data || data.output === null) {
                throw 'Training data is invalid';
            }
        });

        console.log('Traning data size:', this.trainingSet.length);

        console.log('\n---- Neuro Training ----\n');

        this.nn.train(this.trainingSet, {
            iterations: 40000,
            errorThresh: 0.006,
            logPeriod: 1000,
            log: true,
            ...options,
        });
    }

    public run(input: T[]) {
        // @ts-ignore
        return this.nn.run(input)[0];
    }

    public save(ticker: string) {
        const path = `${this.botData.src}/neuroData/${ticker}.json`;
        utils.file.ensureFile(path);
        utils.file.saveFile(path, this.nn.toJSON());
    }

    public load(ticker: string) {
        const path = `${this.botData.src}/neuroData/${ticker}.json`;
        const data = utils.file.readFile(path);

        if (data) {
            this.nn.fromJSON(JSON.parse(data));
            this.trained = true;
        }
    }
}
