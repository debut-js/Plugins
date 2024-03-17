import { TimeFrame } from '@debut/types';

/**
 * Compare two dates and check if they are have same day of month.
 * @param d1 first date
 * @param d2 second date
 */
export function isSameDay(d1: Date, d2: Date) {
    return d1.getFullYear() === d2.getFullYear() && d1.getMonth() === d2.getMonth() && d1.getDate() === d2.getDate();
}

/**
 * Detect weekends days from any date
 * @param d date
 */
export function isWeekend(d: string | number | Date) {
    d = new Date(d);

    const day = d.getDay();
    return day === 6 || day === 0; // 6 = Saturday, 0 = Sunday
}

/**
 * Timezone offset in ms.
 */
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
 * Create date with custom ISO format (preffered for Tinkoff history API)
 * @param date date
 */
export function toIsoString(date: Date | number | string) {
    date = new Date(date);
    const tzo = -date.getTimezoneOffset(),
        dif = tzo >= 0 ? '+' : '-',
        pad = function (num: number) {
            const norm = Math.floor(Math.abs(num));
            return (norm < 10 ? '0' : '') + norm;
        };
    return (
        date.getFullYear() +
        '-' +
        pad(date.getMonth() + 1) +
        '-' +
        pad(date.getDate()) +
        'T' +
        pad(date.getHours()) +
        ':' +
        pad(date.getMinutes()) +
        ':' +
        pad(date.getSeconds()) +
        '.' +
        '000000' +
        dif +
        pad(tzo / 60) +
        ':' +
        pad(tzo % 60)
    );
}

/**
 * Get number of week day from timestamp
 * @param stamp timestamp
 */
export function getWeekDay(stamp: number) {
    // Convert to number of days since 1 Jan 1970
    const days = stamp / 86400000;
    // 1 Jan 1970 was a Thursday, so add 4 so Sunday is day 0, and mod 7
    const day_of_week = (days + 4) % 7;

    return Math.floor(day_of_week);
}

/**
 * Convert candle size to milliseconds value
 */
export function intervalToMs(interval: TimeFrame) {
    let time = 0;

    switch (interval) {
        case '1min':
            time = 1;
            break;
        case '5min':
            time = 5;
            break;
        case '15min':
            time = 15;
            break;
        case '30min':
            time = 30;
            break;
        case '1h':
            time = 60;
            break;
        case '4h':
            time = 240;
            break;
        case 'day':
            time = 1440;
            break;
    }

    if (!time) {
        throw new Error('Unsupported interval');
    }

    return time * 60 * 1000;
}

export const MINUTE = 60 * 1000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;
export const enum TimeMode {
    'Summer' = 'Summer',
    'Winter' = 'Winter',
}
export const enum MARKET_TIMEZONES {
    US = 'America/New_York',
    RU = 'Europe/Moscow',
}

/**
 * Create function dst detection for selected timezone code, see `MARKET_TIMEZONES`
 */
export function getDSTDetector(tz: string) {
    const summerTimePeriods: Array<number[]> = [];

    switch (tz) {
        case MARKET_TIMEZONES.US:
            savingTimePeriodsForUS(summerTimePeriods);
            break;
        case MARKET_TIMEZONES.RU: // <- no dst country
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
}

/**
 * Get timezone offset in ms by timezone code e.g. "Amerca/NEW_YORK"
 */
export function getOffsetMs(tz: string) {
    const currentYear = new Date().getFullYear();
    const summerOffset = getTimezoneOffset(new Date(currentYear, 6, 1), tz);
    const winterOffset = getTimezoneOffset(new Date(currentYear, 0, 1), tz);

    return [summerOffset * 60 * 1000, winterOffset * 60 * 1000];
}

/**
 * DST change periods for US
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
