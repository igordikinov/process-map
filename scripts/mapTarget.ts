// Какую карту собираем — единственная точка, где это известно (process-map-3wh.6).
//
// ЗАЧЕМ. Приложение показывает ОДНУ карту, но карт в репозитории несколько
// (src/data/<id>/process.json). Выбор делается на сборке, а не в рантайме:
// роутера и переключателя карт в интерфейсе нет (решение владельца), в бандл
// попадает ровно один JSON, а разные карты раздаются с разных адресов
// (корень — snp, подкаталог /mrp/ — mrp).
//
// ПОЧЕМУ ЗДЕСЬ, А НЕ В КАЖДОМ КОНФИГЕ. vitest.config.ts — отдельный файл, и
// Vitest при его наличии vite.config.ts НЕ ЧИТАЕТ ВОВСЕ (заменяет, а не
// мержит). Алиас, объявленный только в одном из них, даёт зелёный `npm run
// build` и красный `vitest run` — и наоборот. Оба конфига обязаны брать его
// отсюда; инлайнить путь в конфиге нельзя.
//
// Файл лежит в scripts/, потому что eslint.config.js уже разрешает там
// globals.node, а src/** уезжает в браузер и process в нём запрещён.
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Карты, которые умеет собирать проект. Второй экземпляр этого списка —
 * реестр MAPS в scripts/import-pptx.py (там же презентации и профили разбора);
 * их совпадение сторожит tests/mapRegistry.test.ts.
 */
export const MAP_IDS = ['snp', 'mrp'] as const;
export type MapId = (typeof MAP_IDS)[number];

/**
 * Карты, собранные из модели BPMN (process-map-0c5.3).
 *
 * У них ЕСТЬ данные в src/data/<id>/, но НЕТ собственной цели сборки: они не
 * раздаются со своего адреса, а живут второй версией внутри чужой страницы
 * (см. MAP_ALT_VERSION). Поэтому их нельзя класть в MAP_IDS: tests/mapRegistry
 * немедленно потребовал бы записи в реестре MAPS импортёра презентаций, а
 * презентации у этой карты нет — реестр начал бы врать.
 */
export const BPMN_MAP_IDS = ['inplan-model'] as const;
export type BpmnMapId = (typeof BPMN_MAP_IDS)[number];

/** Всё, у чего есть src/data/<id>/process.json, независимо от источника. */
export type DataMapId = MapId | BpmnMapId;

/** Карта, которая раздаётся из корня сайта и собирается без флагов. */
export const DEFAULT_MAP: MapId = 'snp';

/**
 * Корень репозитория. Считается ЛЕНИВО: модуль импортируется в том числе из
 * тестов через scripts/layout.ts, а там import.meta.url — не file:-URL, и
 * вычисление на уровне модуля уронило бы импорт (тот же довод, что у
 * jsonPath() в scripts/layout.ts).
 */
function root(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), '..');
}

export function isMapId(value: string): value is MapId {
  return (MAP_IDS as readonly string[]).includes(value);
}

export function isBpmnMapId(value: string): value is BpmnMapId {
  return (BPMN_MAP_IDS as readonly string[]).includes(value);
}

/** Есть ли у карты данные на диске — то есть можно ли её прогнать конвейером. */
export function isDataMapId(value: string): value is DataMapId {
  return isMapId(value) || isBpmnMapId(value);
}

const ALL_DATA_MAPS = [...MAP_IDS, ...BPMN_MAP_IDS];

function assertDataMapId(value: string, source: string): DataMapId {
  if (!isDataMapId(value)) {
    throw new Error(
      `Неизвестная карта «${value}» (${source}). Известны: ${ALL_DATA_MAPS.join(', ')}.`,
    );
  }
  return value;
}

function assertMapId(value: string, source: string): MapId {
  if (!isMapId(value)) {
    // Отдельное сообщение для карты из модели: у неё есть данные, но нет цели
    // сборки, и «неизвестная карта» о ней было бы неправдой.
    if (isBpmnMapId(value)) {
      throw new Error(
        `Карта «${value}» собирается из модели и не имеет своего адреса (${source}). ` +
          `Цели сборки: ${MAP_IDS.join(', ')}.`,
      );
    }
    throw new Error(`Неизвестная карта «${value}» (${source}). Известны: ${MAP_IDS.join(', ')}.`);
  }
  return value;
}

/**
 * Карта из переменной окружения MAP; пусто — карта по умолчанию.
 *
 * Неизвестное значение роняет сборку, а не откатывается на карту по умолчанию:
 * опечатка в MAP собрала бы под адресом второй карты первую, и заметить это
 * можно было бы только глазами на стенде.
 */
export function mapIdFromEnv(raw: string | undefined = process.env['MAP']): MapId {
  if (raw === undefined || raw === '') {
    return DEFAULT_MAP;
  }
  return assertMapId(raw, 'переменная MAP');
}

/**
 * Карта из аргументов командной строки: `--map <id>`.
 *
 * Принимает и карты из модели: это команда КОНВЕЙЕРА ДАННЫХ, а не сборки, и
 * `npm run data -- --map inplan-model` обязан работать, хотя своего адреса у
 * этой карты нет.
 */
export function mapIdFromArgv(argv: readonly string[]): DataMapId {
  const index = argv.indexOf('--map');
  if (index === -1) {
    return DEFAULT_MAP;
  }
  const value = argv[index + 1];
  if (value === undefined) {
    throw new Error('--map требует значение, например: --map snp');
  }
  return assertDataMapId(value, '--map');
}

/** Каталог данных карты — любой, включая собранную из модели. */
export function mapDir(id: DataMapId): string {
  return resolve(root(), 'src', 'data', id);
}

/** Файл данных карты — для scripts/layout.ts и для чтения заголовка на сборке. */
export function mapJsonPath(id: DataMapId): string {
  return resolve(mapDir(id), 'process.json');
}

/**
 * Вторая ВЕРСИЯ страницы — карта, собранная из модели (process-map-0c5.6).
 *
 * Ключ — цель сборки, значение — карта, которая ляжет в тот же бандл второй
 * версией и будет доступна читателю переключателем. Нет записи — нет второй
 * версии, и переключатель на этом адресе не рендерится вовсе.
 */
export const MAP_ALT_VERSION: Partial<Record<MapId, BpmnMapId>> = { snp: 'inplan-model' };

/**
 * Алиасы данных для resolve.alias в vite.config.ts И в vitest.config.ts.
 * Через них src/data/versions.ts импортирует данные, не зная, какие это карты.
 *
 * ОТКАТ `@map-alt` НА САМУ СЕБЯ — не заглушка, а рабочее решение. У страницы
 * без второй версии оба алиаса ведут в один каталог: Rollup дедуплицирует
 * модуль по resolved id, второго JSON в бандле не появляется, а список версий
 * схлопывается до одной записи (versions.ts сравнивает id). Альтернатива —
 * условный импорт в src/, то есть ветвление по карте внутри приложения,
 * которого здесь нет намеренно (SPEC §3).
 */
export function mapAlias(id: MapId): Record<string, string> {
  const alt = MAP_ALT_VERSION[id] ?? id;
  return { '@map': mapDir(id), '@map-alt': mapDir(alt) };
}

/**
 * Каталог сборки. Карта по умолчанию раздаётся из корня, остальные — из
 * подкаталога по своему id: base в vite.config.ts относительный ('./'),
 * поэтому подкаталог работает без правок путей к ассетам.
 */
export function mapOutDir(id: MapId): string {
  return id === DEFAULT_MAP ? 'dist' : `dist/${id}`;
}

/** Заголовок карты из её данных — единственный источник и для страницы, и для вкладки. */
export function mapTitle(id: MapId): string {
  const raw = JSON.parse(readFileSync(mapJsonPath(id), 'utf8')) as { title?: unknown };
  if (typeof raw.title !== 'string' || raw.title === '') {
    throw new Error(`В ${mapJsonPath(id)} нет непустого поля title`);
  }
  return raw.title;
}
