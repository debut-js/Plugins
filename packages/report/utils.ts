export function formatTime(originalTime: number | string) {
    const d = new Date(originalTime);

    return Date.UTC(
        d.getFullYear(),
        d.getMonth(),
        d.getDate(),
        d.getHours(),
        d.getMinutes(),
        d.getSeconds(),
        d.getMilliseconds(),
    );
}
