import { PluginInterface, TimeFrame } from '@debut/types';
import { date } from '@debut/plugin-utils';

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
    let end = date.DAY;
    const intervalMs = date.intervalToMs(interval);

    if (from) {
        const [fromHour, fromMinute] = from.split(':').map(Number);
        start = fromHour * date.HOUR + fromMinute * date.MINUTE;
    }

    if (to) {
        const [toHour, toMinute] = to.split(':').map(Number);
        end = toHour * date.HOUR + toMinute * date.MINUTE;
    }

    return createSessionFilter(intervalMs, timezone, start, end);
}

/**
 * Метод создания валидатора сессионного окна по дате, с переходом на зимнее и летнее время
 */
function createSessionFilter(intervalMs: number, timezone: string, start: number, end: number) {
    let currentDayMarker = 0;
    let marketStart = 0;
    let marketEnd = 0;
    let timeMode: date.TimeMode;
    const getDST = date.getDSTDetector(timezone);
    const [summerOffset, winterOffset] = date.getOffsetMs(timezone);

    return (stamp: number): SessionValidatorResult => {
        const dayChanged = stamp > currentDayMarker;

        if (dayChanged) {
            timeMode = getDST(stamp);
        }

        if (dayChanged || currentDayMarker === 0) {
            // Если еще нет текущей даты или сменился день, перегенерируем дату
            // Коррекция дат, для разных часовых поясов, время старта указывается в летнем времени
            const dstOffset = timeMode === date.TimeMode.Summer ? summerOffset : winterOffset;
            const currentDay = ~~(stamp / date.DAY) * date.DAY;
            currentDayMarker = currentDay + date.DAY - 1;

            // Переводич часы и минуты в stamp и прибавляем к дате
            marketStart = currentDay + start + dstOffset;
            marketEnd = currentDay + end + dstOffset;
        }

        const stampEnd = stamp + intervalMs;

        return { inSession: marketStart <= stamp && stampEnd <= marketEnd, dayChanged };
    };
}
