import { PluginInterface, TimeFrame } from '@debut/types';
import { date } from '@debut/plugin-utils';

export const enum TimeMode {
    'Summer' = 'Summer',
    'Winter' = 'Winter',
}
export interface SessionPluginOptions {
    interval: TimeFrame;
    from?: string;
    to?: string;
    noTimeSwitching?: boolean;
}

export interface SessionPluginExtends {
    onDayEnded(): void;
}

interface Methods {
    createSessionValidator: typeof createSessionValidator;
}

export interface SessionAPI {
    session: Methods;
}
export interface SessionInterface extends PluginInterface {
    name: 'stats';
    api: Methods;
}

export function sessionPlugin(options: SessionPluginOptions, onDayEnd?: (...args: unknown[]) => void): PluginInterface {
    const { from, to, noTimeSwitching, interval } = options;
    const sessionValidator = createSessionValidator(interval, from, to, noTimeSwitching);

    return {
        name: 'session',
        api: {
            createSessionValidator: createSessionFilter,
        },
        onBeforeTick(tick) {
            const stamp = tick.time;
            const result = !!sessionValidator && sessionValidator(stamp);

            if (onDayEnd && result.dayChanged) {
                onDayEnd();
            }

            return !result.inSession;
        },
    };
}

export type SessionValidator = ReturnType<typeof createSessionFilter>;
export type SessionValidatorResult = {
    inSession: boolean;
    dayChanged: boolean;
};

/**
 * Метод создания валидатора из человеко читаемых дат
 */
export function createSessionValidator(
    interval: TimeFrame,
    from?: string,
    to?: string,
    noDST?: boolean,
): (stamp: number) => SessionValidatorResult {
    let start = 0;
    let end = 86_400_000;
    const intervalMs = date.intervalToMs(interval);
    const timezoneOffset = new Date().getTimezoneOffset() * 60 * 1000;

    if (from) {
        const [fromHour, fromMinute] = from.split(':').map(Number);
        start = fromHour * 60 * 60 * 1000 + fromMinute * 60 * 1000 + timezoneOffset;
    }

    if (to) {
        const [toHour, toMinute] = to.split(':').map(Number);
        end = toHour * 60 * 60 * 1000 + toMinute * 60 * 1000 + timezoneOffset;
    }

    return createSessionFilter(intervalMs, start, end, noDST);
}

/**
 * Метод создания валидатора сессионного окна по дате, с переходом на зимнее и летнее время
 */
function createSessionFilter(intervalMs: number, start: number, end: number, noDST?: boolean) {
    let currentDayMarker = 0;
    let marketStart = 0;
    let marketEnd = 0;
    let timeMode: TimeMode;

    if (noDST) {
        timeMode = TimeMode.Summer;
    }

    return (stamp: number): SessionValidatorResult => {
        const dayChanged = stamp > currentDayMarker;

        // if (dayChanged && !noDST) {
        //     timeMode = getDST(stamp);
        // }

        if (dayChanged || currentDayMarker === 0) {
            // Если еще нет текущей даты или сменился день, перегенерируем дату
            // Коррекция дат, для разных часовых поясов, время старта указывается в летнем времени
            // const dstOffset = timeMode === TimeMode.Summer ? 0 : 60 * 60 * 1000;
            const currentDay = ~~(stamp / 86_400_000) * 86_400_000;
            currentDayMarker = currentDay + 86_400_000 - 1;

            // Переводич часы и минуты в stamp и прибавляем к дате
            marketStart = currentDay + start; // + dstOffset;
            marketEnd = currentDay + end; // + dstOffset; // не включая
        }

        const stampEnd = stamp + intervalMs;

        // console.log(new Date(marketStart), '<=', new Date(stamp), new Date(stampEnd), '<', new Date(marketEnd));

        return { inSession: marketStart <= stamp && stampEnd <= marketEnd, dayChanged };
    };
}
// DST - Daylight saving time
const getDSTDetector = () => {
    const summerTimePeriods: Array<number[]> = [];
    const currentYear = new Date().getFullYear();

    // Для упрощения вычислений возьмем несколько лет
    [0, 1, 2, 3, 4, -1, -2, -3, -4, -5].forEach((move) => {
        const year = currentYear + move;
        const march = new Date(year, 2, 7);
        const secondSunday = 7 + (7 - march.getDay());
        const november = new Date(year, 10, 7);
        const sunday = 7 - november.getDay();
        const summer = new Date(year, 2, secondSunday).getTime();
        const winter = new Date(year, 10, sunday).getTime();
        summerTimePeriods.push([summer, winter]);
    });

    return (stamp: number) => {
        let isSummerDST = false;

        for (let i = 0; i < summerTimePeriods.length; i++) {
            if (stamp >= summerTimePeriods[i][0] && stamp < summerTimePeriods[i][1]) {
                isSummerDST = true;
                break;
            }
        }

        if (isSummerDST) {
            return TimeMode.Summer;
        } else {
            return TimeMode.Winter;
        }
    };
};

export const getDST = getDSTDetector();
