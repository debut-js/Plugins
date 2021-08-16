# @debut/plugin-neuro-vision [beta]

<img alt="Debut Neuro Vision, нейросеть для торговли на бирже" src=".github/banner.png" width="400">

Плагин Debut, позволяет обучить нейронную сеть на исторических данных. Использовать ее как для фильтрации сделок, так и для прямого прогнозирования направления цены. Прогнозирование основано на алгоритме кластеризации изменения цены, в котором каждое изменение цены за временной период пропорциольнально цене за предыдущий временной период. Такие изменения группируются в гауссово распределение, создвая равномерный паттерн для работы и обучения нейронной сети. Иными словами, каждая свеча попадает в конечное количество групп (от 5 до 11), и затем прогнозируется следующая свеча, а точнее группа к которой она будет примыкать.

## Установка

```
npm install @debut/plugin-neuro-vision --save
```

## Настройки

| Название | Тип | Описание   |
|-----------|----------|------------|
| windowSize  |  number | Размер окна для обучения и использования нейронной сети (размер input) |
| segmentsCount  |  boolean | Количество сегментов на которое будет разбито распределение по гауссу |
| precision  |  number | Количество знаков после запятой, при округлениях (Влияет на распределение) |
| hiddenLayers?  |  number | Опционально, количество скрытых слоев, по умолчанию [32, 16] |

## API Плагина
| Метод | Описание   |
|-----------|------------|
| nextValue | Для обученной нейросети подает на вход свечу, как только наберется input, будет прогноз значения |
| addTrainValue  | Добавить в обучающую выборку свечу (использовать только при `--neuroTrain`) |
| restore  | Количество знаков после запятой, при округлениях (Влияет на распределение) |
| isTraining  | Вернет флаг тренинга, при `--neuroTrain` true, иначе false |
## Инициализация плагина
```javascript
import { neuroVisionPlugin, NeuroVisionPluginAPI } from '@debut/plugin-neuro-vision';

// ...
export interface MyStrategyOptions extends DebutOptions, NeuroVisionPluginOptions;

export class MyStrategy extends Debut {
    declare plugins: NeuroVisionPluginAPI;
    private neuroTraining = false;

    constructor(transport: BaseTransport, opts: MyStrategyOptions) {
        super(transport, opts);

        this.registerPlugins([
            // ...
            neuroVisionPlugin({ windowSize: 25, segmentsCount: 11, precision: 6 }),
            // or
            // neuroVisionPlugin(opts),
            // ...
        ]);

        this.neuroTraining = this.plugins.neuroVision.isTraining();

        if (!this.neuroTraining) {
            this.plugins.neuroVision.restore();
        }
    }
```

```javascript
//...
 async onCandle(candle: Candle) {
     // training
    if (this.neuroTraining) {
        this.plugins.neuroVision.addTrainValue(candle);
        return;
    }

    // usage
    this.neuroVision = this.plugins.neuroVision.nextValue(candle);
 }
```
## Обучение нейросети

Для обучения используется стандартный механизм тестирования Debut
Добавьте флаг `--neuroTrain` для обучения нейросети. Не забудьте задать `gap`, чтобы можно было проверить на необученных данных.
Данные обучения автоматически сохранятся в конце процесса. В директорию торговой стратегии в `src`. При использовании и вызове метода `restore` сеть будет воссоздана из сохраненных данных.

```bash
npm run compile && npm run testing -- --bot=Name --ticker=ETHUSDT --days=600 --gap=60 --neuroTrain
```

## Алгоритм
Действительно значимыми для предсказаний являются изменения котировок. Поэтому на вход нейронной сети после предварительной обработки будем подавать ряд процентных приращений котировок, рассчитанных по формуле X[t] / X[t-1], где X[t] и X[t-1] цены закрытия периодов.

<p>
<img src=".github/pic1.png" width="600"></br>
Рис. 1 — Ряд процентных приращений котировок, рассчитанных по формуле X[t] / X[t-1].
</p>

Изначально процентные приращения имеют гауссово распределение, а из всех статистических функций распределения, определенных на конечном интервале, максимальной энтропией обладает равномерное распределение, то для этого перекодируем входные переменные, чтобы все примеры в обучающей выборке несли примерно одинаковую информационную нагрузку.

<p>
<img src=".github/pic2.png" width="600"></br>
Рис. 2 — Распределение процентных приращений котировок.
</p>

Для того чтобы создать несколько групп, попадание свечей в которые будет иметь равную вероятность, отрезок от минимального процентного приращения до максимального разбивается на N отрезков, так, чтобы в диапазон значений каждого отрезка входило равное количество процентных приращений котировок. Каждый отрезок будет являться группой, самая левая группа - падение цены, центр - нейтральная зона, конец - зона активного роста цен.

<p>
<img src=".github/pic2.png" width="600"></br>
Рис. 3 — Равномерное распределение. По вертикали количество свечей попавших в группу, по горизонтали номер группы.
</p>

Задача получения входных образов для формирования обучающего множества в задачах прогнозирования временных рядов предполагает использование метода «окна». Этот метод подразумевает использование «окна» с фиксированным размером, способного перемещаться по временной последовательности исторических данных, начиная с первого элемента, и предназначены для доступа к данным временного ряда, причем «окно» размером N, получив такие данные, передает на вход нейронной сети элементы с 1 по N-1, а N-ый элемент используется в качестве выхода. Метод окна используется не только для обучения но и для прогнозирования. Количество элементо в окне совпадает с количеством входных узлов в нейронной сети.

<p>
<img src=".github/pic2.png" width="600"></br>
Рис. 4 — Метод окна.
</p>

Качество обучающей выборки тем выше, чем меньше ее противоречивость и больше повторяемость. Для задач прогнозирования финансовых временных рядов высокая противоречивость обучающей выборки является признаком того, что способ описания выбран неудачно