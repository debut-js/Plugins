# @debut/plugin-reinvest
Плагин Debut, для добавления прибыли от сделок к стартовому капиталу (ренивестирование). В основном используется для увеличения прибыли. При включении, вся прибыль ули убыток от сделок, будут вычитаться или складываться с начальным капиталом.

## Установка

```
npm install @debut/plugin-reinvest --save
```

## Инициализация плагина
```javascript
    // Конструктор стратегии в контексте Debut...
    constructor(transport: BaseTransport, opts: CCIDynamicBotOptions) {
        super(transport, opts);

        this.registerPlugins([
            // ...
            // Можно задать опциональное включение кастомной настройкой, либо включать всегда
            this.opts.reinvest ? reinvestPlugin() : null,
            // ...
        ]);
    }
```
