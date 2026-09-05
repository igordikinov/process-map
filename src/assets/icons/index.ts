// Реестр иконок: имя → URL, посчитанный сборщиком (задача process-map-o62).
//
// Почему не `${import.meta.env.BASE_URL}icons/…` и не public/:
// в vite.config.ts `base: './'` (SPEC §6 — приложение живёт в iframe в
// подкаталоге и путь до него заранее неизвестен). BASE_URL при этом равен
// './', то есть путь резолвится браузером ОТНОСИТЕЛЬНО URL ДОКУМЕНТА. Если
// iframe встроен без завершающего слэша (`/process-map` вместо
// `/process-map/`), './icons/x.svg' превращается в '/icons/x.svg' в корне
// хоста, и иконка не грузится.
//
// Импорт ассета решает это на уровне сборки: Vite кладёт файл в
// dist/assets/<имя>-<хеш>.svg и подставляет путь, который вычисляется от
// URL модуля (import.meta.url), а не от URL документа. Дополнительно
// появляются хеш в имени (кеширование) и ошибка сборки при опечатке в имени
// файла — строковый путь молча отдал бы 404.
//
// Файлы лежат в src/assets/icons/ (перенесены из public/icons/, которого
// больше нет): только из src/ Vite их обрабатывает как ассеты. Копия
// design/assets/icons/ — независимая, часть макета, её не трогаем.
//
// Добавление иконки для M2: положить .svg рядом, добавить import и строку в
// ICONS. Тип IconName расширится сам.
import calc from './calc.svg';
import dataBase from './data-base.svg';
import event from './event.svg';
import fit from './fit.svg';
import forecastData from './forecast-data.svg';
import gateway from './gateway.svg';
import link from './link.svg';
import linkExternal from './link-external.svg';
import minus from './minus.svg';
import plus from './plus.svg';
import recalculation from './recalculation.svg';
import returnBack from './return-back.svg';
import stepInProcess from './step-in-process.svg';
import subprocess from './subprocess.svg';
import tables from './tables.svg';
import warningTriangle from './warning-triangle.svg';
import xClose from './x-close.svg';

/** Имена совпадают с именами файлов без расширения — как в макете design/. */
export const ICONS = {
  calc,
  'data-base': dataBase,
  event,
  fit,
  'forecast-data': forecastData,
  gateway,
  link,
  'link-external': linkExternal,
  minus,
  plus,
  recalculation,
  'return-back': returnBack,
  'step-in-process': stepInProcess,
  subprocess,
  tables,
  'warning-triangle': warningTriangle,
  'x-close': xClose,
} as const satisfies Record<string, string>;

export type IconName = keyof typeof ICONS;

/** URL иконки. Опечатка в имени не компилируется — это и есть смысл реестра. */
export function iconUrl(name: IconName): string {
  return ICONS[name];
}
