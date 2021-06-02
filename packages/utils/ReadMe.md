# @debut/plugin-utils
Набор незаменимых утилит для экосистемы Debut.

## Установка

```
npm install @debut/plugin-utils --save
```

<hr/>

## CLI - Утилиты для работы Command Line Interface

### `requireUncached(module: string)`
Позволяет подключить указаный модуль без стандартного кеширования Node. Вместо нативного вызова `require(module: string)`

### `getBotsSchema()`
Получение содержимого файла `schema.json`

### `getBotData(name: string, schema = getBotsSchema())`
Получение мета данных бота по имени конструктора.

### `getArgs<T>()`
Получение аргументов переданных при запуске. Возвращает обьект ключ - значение.

Пример: `node ./myscript.js --arg1=foo --arg2=bar`

```javascript
import { cli } from '@debut/plugin-utils`;

const args = getArgs(); // { arg1: "foo", arg2: "bar" }
```

### `getTokens()`
Получение объекта с приватными ключами для работы с API брокера. Из файла `.tokens.json` в рабочей директории проекта.

<hr/>

## Date - Утилиты для работы с датами

### `isSameDay(d1: Date, d2: Date)`
Являются ли две даты одним и тем же днем

### `isWeekend(d: string | number | Date)`
Является ли дата выходным днем

### `toIsoString(d: string | number | Date)`
Конвертация даты в кастомный ISO формат для работы с тинькофф API.

### `getWeekDay(stamp: number)`
Получение дня недели по таймстампу UTC

### `intervalToMs(interval: TimeFrame)`
Преобразование таймфрейма свеч в значение в милисекундах

<hr/>

## Debug - Утилиты отладки

### `logDebug(...data: any[])`
Логирование с информацией о времени события

<hr/>

## File - Утилиты для работы с файлами

### `saveFile(path: string, data: any)`
Сохранить переданные данные по пути `path`

### `ensureFile(path: string)`
Проверяет существование пути, если путь не существует создает его

### `readFile(path: string)`
Безопасное чтение файла

### `isDir(path: string)`
Является ли путь директорией

<hr/>

## Math - Утилиты вычислений

### `clamp(num: number, min: number, max: number)`
Зажатие числа между минимальным и максимальным значением

### `getPrecision(number: number | string)`
Получение точности вычисления числа с плавающей точкой

### `percentChange(current: number, prev: number)`
Разница в процентах между двумя числами

### `toFixed(num: number, precision = 2)`
Быстрая фиксация точности вычислений, без потери типа

### `getRandomArbitrary(min: number, max: number, odd?: boolean)`
Генерация случайного числа в диапазоне [min, max] и опционально нечетного

### `getRandomInt(min: number, max: number, odd?: boolean)`
Генерация случайного целого в диапазоне [min, max], опционально нечентного

<hr/>

## Orders - Утилиты для работы со сделками

### `inverseType(type: OrderType)`
Инвертирует тип сделки

### `syntheticOrderId(order: ExecutedOrder | OrderOptions)`
Синтетический случайный индетификатор для сделки

### `getMinIncrementValue(price: number | string)`
Минимальное значение в точности переданного числа

### `getCurrencyProfit(order: ExecutedOrder, price: number)`
Подсчет текущей прибыли в валюте сделки

### `getCurrencyBatchProfit(orders: ExecutedOrder[], price: number)`
Подсчет текущей прибыли в валюте сделки для нескольких ордеров одновременно

<hr/>

## Promise

### `sleep(ms: number)`
Инициализирует простой на какое-то время в милисекундах
