// Версии карты, доступные читателю на этом адресе (process-map-0c5.6).
//
// ЧТО ТАКОЕ ВЕРСИЯ. Страница вики описывает один процесс, и карта этого
// процесса собрана из источника: из презентации владельца или из модели
// Camunda. Это и есть версии — одно и то же дело, показанное с разной глубиной.
// Их набор фиксируется на сборке (scripts/mapTarget.ts, алиасы @map и
// @map-alt), а читатель переключает уже готовые.
//
// ПОЧЕМУ ОТДЕЛЬНЫЙ МОДУЛЬ, А НЕ ЧАСТЬ activeMap.ts. Тот документирован как
// «карта, загруженная ПОЛЬЗОВАТЕЛЕМ», и на этом стоит его пространство ключей
// `imported:` — заведённое против того, что id из чужого файла совпадёт с id
// встроенной карты. Встроенная вторая версия чужим файлом не является: у неё
// свой каталог в репозитории, свой уникальный id и полное право на обычный
// ключ. Проведи её через тот же флаг — и читатель увидел бы бейдж «Загруженная
// схема» на карте, которая лежит в этом же репозитории.
//
// ПОЧЕМУ ОБЕ ВЕРСИИ ГРУЗЯТСЯ ЖАДНО. Замерено: карта из модели — 232 КБ сырых,
// 27 КБ gzip, при бюджете PRD ≤ 400 КБ gzip на весь бандл (израсходовано ~161).
// Ленивая загрузка стоила бы несоразмерно: `loadBaseProcessMap()` синхронна,
// потому что через неё идёт `getSnapshot()` в `useSyncExternalStore`, а тот
// ОБЯЗАН отдавать стабильную ссылку синхронно. Асинхронность потянула бы
// состояние «карты ещё нет» в Overview, StageDetail, Breadcrumbs и useDeepLink,
// то есть экран загрузки, которого нет ни в одном артборде.
//
// Ленивым остаётся РАЗБОР: zod прогоняется по версии при первом её показе и
// кэшируется. Это не оптимизация: `loadProcessMap()` зовётся на каждый
// `refreshProcessMap()`, то есть на каждую правку ссылки, и разбирать 454 узла
// заново каждый раз незачем. Кэш заодно даёт стабильную ссылку на объект.
import builtinRaw from '@map/process.json';
import altRaw from '@map-alt/process.json';
import { ProcessMapSchema, type ProcessMap } from './schema';

/** Что показать в переключателе: id и заголовок версии. */
export interface MapVersion {
  readonly id: string;
  readonly title: string;
  readonly stages: number;
}

interface RawVersion {
  readonly id: string;
  readonly raw: unknown;
}

/**
 * Сырые версии этого бандла.
 *
 * У страницы без второй версии оба алиаса ведут в один каталог, и второй
 * записи здесь не появляется: сравнение по id, а не по ссылке, потому что
 * Rollup дедуплицирует модуль, а Vitest — не обязательно.
 */
const RAW: readonly RawVersion[] = (() => {
  const builtin: RawVersion = { id: builtinRaw.id, raw: builtinRaw };
  return altRaw.id === builtinRaw.id ? [builtin] : [builtin, { id: altRaw.id, raw: altRaw }];
})();

/** Версия по умолчанию — та, что собрана в `@map`: с неё открывается страница. */
export const DEFAULT_VERSION_ID: string = builtinRaw.id;

const parsed = new Map<string, ProcessMap>();

function parseVersion(entry: RawVersion): ProcessMap {
  const cached = parsed.get(entry.id);
  if (cached !== undefined) {
    return cached;
  }
  const map = ProcessMapSchema.parse(entry.raw);
  parsed.set(entry.id, map);
  return map;
}

/**
 * Версии для переключателя. Меньше двух — переключать нечего, и интерфейс
 * обязан не рисовать группу вовсе, а не показывать один неактивный сегмент.
 *
 * Заголовок берётся из данных версии: он же стоит в шапке, и разъехаться им
 * негде.
 */
export function listVersions(): readonly MapVersion[] {
  return RAW.map((entry) => {
    const map = parseVersion(entry);
    return { id: entry.id, title: map.title, stages: map.stages.length };
  });
}

/** Есть ли такая версия в этом бандле. Не меняет ничего — нужна до `back()`. */
export function hasVersion(id: string): boolean {
  return RAW.some((entry) => entry.id === id);
}

let selectedId: string = DEFAULT_VERSION_ID;

/** Какая версия показывается сейчас. */
export function getSelectedVersionId(): string {
  return selectedId;
}

/**
 * Выбрать версию. Неизвестный id ИГНОРИРУЕТСЯ, а не роняет приложение:
 * значение приходит в том числе из адреса (`?v=`), а битый параметр по
 * действующему правилу оставляет экран на месте, а не ломает его.
 */
export function setSelectedVersionId(id: string): boolean {
  if (!hasVersion(id)) {
    return false;
  }
  selectedId = id;
  return true;
}

/** Карта выбранной версии, разобранная и закэшированная. */
export function getSelectedMap(): ProcessMap {
  const entry = RAW.find((item) => item.id === selectedId) ?? RAW[0];
  if (entry === undefined) {
    throw new Error('В бандле нет ни одной версии карты');
  }
  return parseVersion(entry);
}

/** Сброс для тестов — по образцу clearImportedMap() в activeMap.ts. */
export function resetSelectedVersion(): void {
  selectedId = DEFAULT_VERSION_ID;
}
