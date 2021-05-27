import { OrderType, PluginInterface } from '@debut/types';
import { cli } from '@debut/plugin-utils';
import { NeuroHelper, TrainingData } from './neurohelper';

export interface NeuroFilterPluginArgs {
    neuroTrain: boolean;
}

export interface NeuroFilterPluginAPI {
    neurofilter: {
        train(input: number[], orderId: string): void;
        run(input: number[]): number;
        trained(): boolean;
    };
}

export interface NeuroFilterPluginOptions {
    neuroFilterLevel?: number;
    hiddenLayers?: number[];
}

export function neuroFilterPlugin(): PluginInterface {
    let neuro: NeuroHelper;
    const neuroTrain = 'neuroTrain' in cli.getArgs<NeuroFilterPluginArgs>();

    return {
        name: 'neurofilter',
        api: {
            train(input: number[], orderId: string) {
                const data: TrainingData<number> = {
                    input,
                    output: null,
                    id: orderId,
                };

                neuro.addTrainingData(data);
            },
            run(input: number[]) {
                if (!neuro.trained) {
                    return 1;
                }

                return neuro.run(input);
            },
            trained() {
                return neuro.trained;
            },
        },
        onInit() {
            const botName = this.debut.getName();

            neuro = new NeuroHelper(botName);

            if (!neuroTrain) {
                neuro.load(this.debut.opts.ticker);
            }
        },
        async onClose(order) {
            if (neuro.trained || !neuroTrain || !order.openId || !order.openPrice) {
                return;
            }

            let output = 0;

            if (order.type === OrderType.SELL && order.openPrice < order.price) {
                output = 1;
            } else if (order.type === OrderType.BUY && order.openPrice > order.price) {
                output = 1;
            }

            neuro.updateTrainingOut(order.openId, output);
        },
        async onDispose() {
            if (neuroTrain) {
                neuro.train({ log: true });
                neuro.save(this.debut.opts.ticker);
            }
        },
    };
}
