# @debut/plugin-genetic-shutdown
Плагин Debut, для ускорения процесса работы генетического алгоритма. Позволяет на раннем этапе отбрасывать конфигурацию с плохими показателями.

## Принцип работы
Плагин делает контрольный срез статистики каждые 30 дней. Если за это время выполняется одно из стандартных условий, характирезующих конфигурацию как плохую - вариант стратегии отключается и перестает выполнять дальнейшие вычисления, что экономит ресурсы.

## Условия отключения по умолчанию
1. Относительная просадка больше 30%
2. Абсолютная просадка больше 35%
3. Соотношение Лонг/Шорт меньше 0.25 (стратегия торгует только в шорт)
4. Соотношение Лонг/Шорт больше 2 (стратегия торгует только в лонг)
5. За 30 дней меньше 30 операций лонг или шорт
6. Прибыльными оказались меньше половини любых позиций

## Установка

```
npm install @debut/plugin-genetic-shutdown --save
```

## Настройка
Инициализацию плагина рекомендуется выпонять в Meta файле стратегии, только для окружения `WorkingEnv.genetic`
Пример реализации в файле `meta.ts`

```javascript
// Кастомный метод выключения
const shutdown = (stats: StatsState, state: ShutdownState) => ...

const meta: DebutMeta = {
    // ...
    async create(transport: BaseTransport, cfg: MyStrategyOptions, env: WorkingEnv) {
        const bot = new SpikesG(transport, cfg);

        // Специфичные плагины окружения
        if (env === WorkingEnv.genetic) {
            // Второй аргумент shutdown можно не передавать, если нас устраивают стандартные условия выключения
            bot.registerPlugins([geneticShutdownPlugin(cfg.interval, shutdown)]);
        }
        // ...
    }
```


## Кастомизация условий отключения
`ShutdownState` - позволяет получить количество сделок или прибыли на начало периода (или конец предыдущего). А также количество свеч на данный момент в текущем периоде.

```javascript
const shutdown = (stats: StatsState, state: ShutdownState) => {
    const totalOrders = stats.long + stats.short;

    // Добавим условия на минимум 5 сделок за период 30 дней
    if (state.prevOrders && totalOrders - state.prevOrders < 5) {
        return true;
    }

    // Добавим условие на ограничение максимальной маржи (например для Grid стратегий)
    if (stats.maxMarginUsage > 10000) {
        return true;
    }

    return stats.relativeDD > 80 || stats.absoluteDD > 30;
};

```
