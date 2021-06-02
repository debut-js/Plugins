# @debut/plugin-session
Плагин Debut, для ограничения времени торговой сессии. Позволяет настроить рабочие часы для стратегии, а также детектировать смену дня. Плагин автоматически выполняет коррекцию часовых поясов, при переходе США на летнее и зимнее время, таким образом во время тестирования не происходит сбоев на смещении времени. Рекомендуется использовать для блокировки работы на пре или пост маркетах биржи.

## Установка

```
npm install @debut/plugin-session --save
```

## Настройки
Плагин имеет ряд параметров, доступных к настройке при инициализации.

## Параметры
| Название | Тип | Описание   |
|-----------|----------|------------|
| from  |  string | Строка в формате `HH:MM`, например `10:00` время открытия основной сессии биржи MOEX |
| to  |  string | Строка в формате `HH:MM`, например `19:00` время окончания основной сессии биржи MOEX |
| onDayChanged  |  Function | Опционально, можно передать функцию, которая будет вызываться на смену дня |

## Инициализация
```javascript
import { SessionPluginOptions, sessionPlugin } from '@debut/plugin-session';

export interface MyStrategyOpts extends DebutOptions, SessionPluginOptions;

// ...
constructor(transport: BaseTransport, opts: MyStrategyOpts) {
    super(transport, opts);

    this.registerPlugins([
        // ...
        this.opts.from && this.opts.to && sessionPlugin(this.opts),
        // ...
    ]);
```

## Работа с Genetic
Плагин автоматически удаляет свечи не вошедшие в заданый в настройках времени диапазон. Это повзоляет увеличить скрорость оптимизации стратегии.

Для включения фукнции фильтрации свеч необходимо в мета файле (`meta.ts`) добавить соответствующий фильтр

```javascript
import { createSessionValidator } from '@debut/plugin-session';

// ...
ticksFilter(cfg: MyStrategyOpts) {
    if (!cfg.from && !cfg.to) {
        return () => true;
    }

    const tickValidator = createSessionValidator(cfg.from, cfg.to, cfg.noTimeSwitching);

    return (tick) => {
        return tickValidator(tick.time).inSession;
    };
},
// ...

```
