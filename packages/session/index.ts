import { PluginInterface, TimeFrame } from '@debut/types';
import { date } from '@debut/plugin-utils';

export const enum TimeMode {
    'Summer' = 'Summer',
    'Winter' = 'Winter',
}
export interface SessionPluginOptions {
    interval: TimeFrame;
    timezone?: string;
    from?: string;
    to?: string;
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
    const { from, to, interval, timezone = 'en-US' } = options;
    const sessionValidator = createSessionValidator(interval, timezone, from, to);

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
    timezone: string,
    from?: string,
    to?: string,
): (stamp: number) => SessionValidatorResult {
    let start = 0;
    let end = 86_400_000;
    const intervalMs = date.intervalToMs(interval);

    if (from) {
        const [fromHour, fromMinute] = from.split(':').map(Number);
        start = fromHour * 60 * 60 * 1000 + fromMinute * 60 * 1000;
    }

    if (to) {
        const [toHour, toMinute] = to.split(':').map(Number);
        end = toHour * 60 * 60 * 1000 + toMinute * 60 * 1000;
    }

    return createSessionFilter(intervalMs, timezone, start, end);
}

function getTimezoneOffset(d: Date, tz: string) {
    const a = d.toLocaleString('ja', { timeZone: tz }).split(/[/\s:]/);

    // @ts-expect-error
    a[1]--;

    // @ts-expect-error
    const t1 = Date.UTC.apply(null, a);
    const t2 = new Date(d).setMilliseconds(0);
    return (t2 - t1) / 60 / 1000;
}

/**
 * Метод создания валидатора сессионного окна по дате, с переходом на зимнее и летнее время
 */
function createSessionFilter(intervalMs: number, timezone: string, start: number, end: number) {
    let currentDayMarker = 0;
    let marketStart = 0;
    let marketEnd = 0;
    let timeMode: TimeMode;
    const getDST = getDSTDetector(timezone);
    const [summerOffset, winterOffset] = getOffsetMs(timezone);

    return (stamp: number): SessionValidatorResult => {
        const dayChanged = stamp > currentDayMarker;

        if (dayChanged) {
            timeMode = getDST(stamp);
        }

        if (dayChanged || currentDayMarker === 0) {
            // Если еще нет текущей даты или сменился день, перегенерируем дату
            // Коррекция дат, для разных часовых поясов, время старта указывается в летнем времени
            const dstOffset = timeMode === TimeMode.Summer ? summerOffset : winterOffset;
            const currentDay = ~~(stamp / 86_400_000) * 86_400_000;
            currentDayMarker = currentDay + 86_400_000 - 1;

            // Переводич часы и минуты в stamp и прибавляем к дате
            marketStart = currentDay + start + dstOffset;
            marketEnd = currentDay + end + dstOffset;
        }

        const stampEnd = stamp + intervalMs;

        return { inSession: marketStart <= stamp && stampEnd <= marketEnd, dayChanged };
    };
}
// DST - Daylight saving time
const getDSTDetector = (tz: string) => {
    const summerTimePeriods: Array<number[]> = [];

    switch (tz) {
        case 'America/New_York':
            savingTimePeriodsForUS(summerTimePeriods);
            break;
        case 'Europe/Moscow': // <- no dst country
            return () => TimeMode.Summer;
        default:
            throw new Error(`${tz} is not supported`);
    }

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

/**
 * Get timezone offset in ms
 */
function getOffsetMs(tz: string) {
    const currentYear = new Date().getFullYear();
    const summerOffset = getTimezoneOffset(new Date(currentYear, 6, 1), tz);
    const winterOffset = getTimezoneOffset(new Date(currentYear, 0, 1), tz);

    return [summerOffset * 60 * 1000, winterOffset * 60 * 1000];
}

/**
 * Получение данных о переключении времени на DST для US
 */
function savingTimePeriodsForUS(summerTimePeriods: number[][]) {
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
}
