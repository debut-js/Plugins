import { PluginInterface, TimeFrame } from '@debut/types';
import { StatsInterface, StatsState } from '@debut/plugin-stats';

export interface ShutdownPluginAPI {
    shutdown: Methods;
}

interface Methods {
    isShutdown: () => boolean;
}
export interface ShutdownState {
    prevOrders: number;
    candlesCount: number;
    prevProfit: number;
}

const minOrdersInPeriod = 5;

/**
 * Плагин выключает бота если тот выдал слишком плохую статистику
 * @param candlesPeriod - 840 это 30 дней на м15 свечах
 * @param shutdown - функция выключения
 */
export function geneticShutdownPlugin(
    interval: TimeFrame,
    shutdown?: (stats: StatsState, state: ShutdownState) => boolean,
): PluginInterface {
    const state: ShutdownState = {
        candlesCount: 0,
        prevOrders: 0,
        prevProfit: 0,
    };

    let candlesPeriod: number;

    // Расчет свеч на один месяц
    switch (interval) {
        case '1min':
            candlesPeriod = 43200;
            break;
        case '5min':
            candlesPeriod = 8640;
            break;
        case '15min':
            candlesPeriod = 2880;
            break;
        case '30min':
            candlesPeriod = 1440;
            break;
        case '1h':
            candlesPeriod = 720;
            break;
        case '4h':
            candlesPeriod = 180;
            break;
        default:
            throw Error(`unsupported shutdown plugin interval: ${interval}`);
    }

    let stats: StatsInterface;
    let shutdowned = false;

    const shutdownFn = shutdown || defaultShutdownFn;

    return {
        name: 'shutdown',
        api: {
            isShutdown() {
                return shutdowned;
            },
        },
        onInit() {
            stats = this.findPlugin<StatsInterface>('stats');

            if (!stats) {
                throw 'Genetic Shutdown: stats plugin is required!';
            }
        },
        async onCandle() {
            state.candlesCount++;

            if (state.candlesCount > candlesPeriod) {
                const report = stats.api.report();
                shutdowned = shutdownFn(report, state);
                state.candlesCount = 0;
                state.prevProfit = ((report.profit - state.prevProfit) / state.prevProfit) * 100;
                state.prevOrders = report.long + report.short;

                if (shutdowned) {
                    this.debut.dispose();
                }
            }
        },
    };
}

const defaultShutdownFn = (stats: StatsState, state: ShutdownState) => {
    const totalOrders = stats.long + stats.short;
    const lsRatio = stats.long / stats.short;
    if (!state.prevOrders && totalOrders < minOrdersInPeriod) {
        return true;
    }

    if (state.prevOrders && totalOrders - state.prevOrders < minOrdersInPeriod) {
        return true;
    }

    return (
        stats.relativeDD > 35 ||
        stats.absoluteDD > 35 ||
        lsRatio < 0.25 ||
        lsRatio > 2 ||
        (stats.long > 30 && stats.longRight / stats.long < 0.5) ||
        (stats.short > 30 && stats.shortRight / stats.short < 0.5)
    );
};
