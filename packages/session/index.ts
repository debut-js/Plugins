import { PluginInterface } from 'debut';

export const enum TimeMode {
    'Summer' = 'Summer',
    'Winter' = 'Winter',
}
export interface SessionPluginOptions {
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
    const { from = '00:00', to = '23:59', noTimeSwitching } = options;
    const sessionValidator = createSessionValidator(from, to, noTimeSwitching);

    return {
        name: 'session',
        api: {
            createSessionValidator,
        },
        async onTick(tick) {
            const stamp = Date.parse(tick.time);
            const result = !!sessionValidator && sessionValidator(stamp);

            if (onDayEnd && result.dayChanged) {
                onDayEnd();
            }

            return !result.inSession;
        },
    };
}

export type SessionValidator = ReturnType<typeof createSessionValidator>;
export type SessionValidatorResult = {
    inSession: boolean;
    dayChanged: boolean;
};

/**
 * Метод создания валидатора сессионного окна по дате, с переходом на зимнее и летнее время
 */
export function createSessionValidator(start: string, end: string, noDST?: boolean) {
    const [fromHour, fromMinute] = start.split(':').map(Number);
    const [toHour, toMinute] = end.split(':').map(Number);

    let dailyFromStamp: number;
    let dailyToStamp: number;
    let currentDayMarker = 0;
    let timeMode: TimeMode;

    if (noDST) {
        timeMode = TimeMode.Summer;
    }

    return (stamp: number): SessionValidatorResult => {
        const dayChanged = stamp > currentDayMarker;

        if (dayChanged && !noDST) {
            timeMode = getDST(stamp);
        }

        if (dayChanged) {
            // Если еще нет текущей даты или сменился день, перегенерируем дату
            // Коррекция дат, для разных часовых поясов, время старта указывается в летнем времени
            const startHrs = timeMode === TimeMode.Summer ? fromHour : fromHour + 1;
            const endHrs = timeMode === TimeMode.Summer ? toHour : toHour + 1;
            // Pro tip: Be careful with negative numbers!
            const from = ~~(stamp / 86400000) * 86400000 - 180 * 60 * 1000; // - timezone offset = -180 GMT+3;
            currentDayMarker = from + 86400000 - 1;

            // Переводич часы и минуты в stamp и прибавляем к дате
            dailyFromStamp = from + startHrs * 60 * 60 * 1000 + fromMinute * 60 * 1000;
            dailyToStamp = from + endHrs * 60 * 60 * 1000 + toMinute * 60 * 1000;
        }

        return { inSession: dailyFromStamp <= stamp && stamp < dailyToStamp, dayChanged };
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
