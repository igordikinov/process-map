// Загрузка ProcessMap и наложение пользовательских overrides (SPEC.md §3 «Overrides»).
//
// Файл разделён на две части:
//   1) чистые функции (parse/merge) — работают без браузера и покрыты тестами;
//   2) обёртки над localStorage — все обращения в try/catch, ни одна ошибка
//      хранилища не должна ронять приложение.
//
// Устойчивость (см. также tests/loader-merge.test.ts):
//   - localStorage отсутствует (SSR, node-окружение) → читатели возвращают {},
//     писатели возвращают false; приложение работает на «чистом» JSON;
//   - под ключом лежит битый или чужой JSON → он игнорируется (overrides = {}),
//     карта отдаётся без правок. Повреждённое значение НЕ удаляется молча:
//     решение о сбросе принимает пользователь кнопкой «Сбросить правки» (SPEC §4.4);
//   - переполнение квоты при записи (QuotaExceededError) → writeStoredOverrides
//     возвращает false, состояние в памяти остаётся корректным, вызывающий UI
//     решает, что показать пользователю.
// Данные собираемой карты. Какой именно — решает алиас @map в конфигах
// сборки (scripts/mapTarget.ts): в src/ нет ни process.env, ни import.meta.env,
// ни ветвлений, и в бандл попадает ровно один JSON.
import rawProcessJson from '@map/process.json';
import {
  LEGACY_OVERRIDES_MAP_ID,
  LEGACY_OVERRIDES_STORAGE_KEY,
  OverridesSchema,
  overridesStorageKey,
  ProcessMapSchema,
  type Overrides,
  type ProcessMap,
  type ProcessNode,
  type ScreenLink,
  type Stage,
} from './schema';

/**
 * Идентификатор карты и её ключ overrides.
 *
 * Берётся ИЗ ДАННЫХ, а не из переменной сборки: тогда ключ выведен из того
 * самого файла, который реально попал в бандл. Забытый MAP=mrp даёт карту SNP
 * с ключом SNP — то есть просто вторую копию SNP, — а не данные MRP под чужим
 * ключом (process-map-3wh.5).
 */
const MAP_ID = rawProcessJson.id;

/** Ключ overrides ЗАГРУЖЕННОЙ карты. Экспортируется, чтобы тесты и отладка
 *  брали ровно то значение, которым пользуется код, а не повторяли формулу. */
export const OVERRIDES_KEY = overridesStorageKey(MAP_ID);

// ───────────────────────────── чистые функции ─────────────────────────────

/** Валидирует произвольное значение как ProcessMap. Бросает ZodError при несоответствии. */
export function parseProcessMap(raw: unknown): ProcessMap {
  return ProcessMapSchema.parse(raw);
}

/** Валидирует overrides. Бросает ZodError — нужен для импорта JSON (M3). */
export function parseOverrides(raw: unknown): Overrides {
  return OverridesSchema.parse(raw);
}

/** Мягкая валидация overrides: всё, что не проходит схему, превращается в {}. */
export function safeParseOverrides(raw: unknown): Overrides {
  const result = OverridesSchema.safeParse(raw);
  return result.success ? result.data : {};
}

/**
 * Накладывает override на один узел. Три различимых состояния:
 *   - записи нет / entry.screen === undefined → screen остаётся из JSON;
 *   - entry.screen — объект → заменяет screen узла;
 *   - entry.screen === null → ссылка удалена явно, поле screen убирается из узла
 *     (именно убирается, а не откатывается к значению из JSON).
 *
 * Различие «нет ключа» и «null» опирается на то, что zod для .optional() не
 * создаёт ключ, которого не было во входных данных, поэтому undefined
 * однозначно означает «не трогали».
 */
function applyNodeOverride(node: ProcessNode, overrides: Overrides): ProcessNode {
  const entry = overrides[node.id];
  if (entry === undefined || entry.screen === undefined) {
    return node;
  }
  if (entry.screen === null) {
    if (node.screen === undefined) {
      return node;
    }
    const stripped: ProcessNode = { ...node };
    delete stripped.screen;
    return stripped;
  }
  return { ...node, screen: entry.screen };
}

/**
 * Иммутабельно накладывает overrides поверх карты: входная карта не мутируется.
 * Overrides применяются только к узлам этапов (SPEC §3 задаёт значение как
 * Record<nodeId, …>); stage.screen не переопределяется — см. отчёт по задаче.
 * Ключи, которым не соответствует ни один узел, игнорируются.
 */
export function mergeOverrides(map: ProcessMap, overrides: Overrides): ProcessMap {
  if (Object.keys(overrides).length === 0) {
    return map;
  }
  const stages: Stage[] = map.stages.map((stage) => ({
    ...stage,
    nodes: stage.nodes.map((node) => applyNodeOverride(node, overrides)),
  }));
  return { ...map, stages };
}

// ─────────────────────────── работа с localStorage ───────────────────────────

function getStorage(): Storage | null {
  try {
    const storage = globalThis.localStorage;
    // Наличие объекта ещё не гарантирует работоспособность (Safari private mode
    // отдаёт localStorage, но бросает на setItem), поэтому проверяем записью.
    const probe = `${OVERRIDES_KEY}:probe`;
    storage.setItem(probe, '1');
    storage.removeItem(probe);
    return storage;
  } catch {
    return null;
  }
}

/** Доступен ли localStorage для чтения и записи. */
export function isStorageAvailable(): boolean {
  return getStorage() !== null;
}

/**
 * Переносит правки со старого общего ключа на ключ карты SNP и возвращает их
 * СЫРУЮ строку. Ничего не найдено — null.
 *
 * Три вещи здесь сделаны намеренно и каждая проверена тестом:
 *   1) переносится сырая строка, а НЕ результат safeParseOverrides. Иначе
 *      битое легаси-значение превратилось бы в {} и записалось поверх — то
 *      есть молчаливая потеря, ровно та, которую этот файл обещает не делать;
 *   2) легаси-ключ НЕ удаляется. Удаление необратимо, а решение о сбросе
 *      принимает пользователь кнопкой (SPEC §4.4);
 *   3) миграция работает только для карты, которой ключ принадлежал. Для
 *      второй карты чужой черновик — не её данные.
 *
 * Провал записи по квоте не ошибка: значение всё равно возвращается, а
 * миграция идемпотентно повторится при следующей загрузке.
 */
function migrateLegacyOverrides(): string | null {
  if (MAP_ID !== LEGACY_OVERRIDES_MAP_ID) {
    return null;
  }
  try {
    const legacy = globalThis.localStorage?.getItem(LEGACY_OVERRIDES_STORAGE_KEY);
    if (legacy === null || legacy === undefined || legacy === '') {
      return null;
    }
    try {
      globalThis.localStorage?.setItem(OVERRIDES_KEY, legacy);
    } catch {
      // Квота: перенос не «прилипнет», но правки пользователь всё равно увидит.
    }
    return legacy;
  } catch {
    return null;
  }
}

/** Читает overrides из localStorage. Любая проблема → {}. */
export function readStoredOverrides(): Overrides {
  try {
    const raw = globalThis.localStorage?.getItem(OVERRIDES_KEY) ?? migrateLegacyOverrides();
    if (raw === null || raw === undefined) {
      return {};
    }
    return safeParseOverrides(JSON.parse(raw));
  } catch {
    return {};
  }
}

/** Пишет overrides в localStorage. false — хранилище недоступно или переполнено. */
export function writeStoredOverrides(overrides: Overrides): boolean {
  const storage = getStorage();
  if (storage === null) {
    return false;
  }
  try {
    storage.setItem(OVERRIDES_KEY, JSON.stringify(overrides));
    return true;
  } catch {
    return false;
  }
}

/**
 * Создаёт или обновляет override одного узла и сохраняет его.
 * `screen: null` — явное удаление ссылки (SPEC §4.4, кнопка «Удалить ссылку»).
 * Возвращает новый объект overrides, чтобы вызывающий код мог сразу пересчитать
 * merge, не перечитывая хранилище (и работать даже если запись не удалась).
 */
export function setNodeOverride(nodeId: string, screen: ScreenLink | null): Overrides {
  const next: Overrides = { ...readStoredOverrides(), [nodeId]: { screen } };
  writeStoredOverrides(next);
  return next;
}

/** Удаляет override одного узла — узел возвращается к значению из JSON. */
export function removeNodeOverride(nodeId: string): Overrides {
  const next: Overrides = { ...readStoredOverrides() };
  delete next[nodeId];
  writeStoredOverrides(next);
  return next;
}

/** Полный сброс правок («Сбросить правки», SPEC §4.4). */
export function resetOverrides(): void {
  try {
    globalThis.localStorage?.removeItem(OVERRIDES_KEY);
  } catch {
    // Хранилище недоступно — сбрасывать нечего.
  }
}

/** Заменяет все overrides целиком (импорт JSON, M3). */
export function replaceOverrides(overrides: Overrides): boolean {
  return writeStoredOverrides(overrides);
}

// ───────────────────────────── публичная загрузка ─────────────────────────────

/** Валидированная карта из process.json, без пользовательских правок. */
export function loadBaseProcessMap(): ProcessMap {
  return parseProcessMap(rawProcessJson);
}

/** Карта из process.json с наложенными overrides из localStorage. */
export function loadProcessMap(): ProcessMap {
  return mergeOverrides(loadBaseProcessMap(), readStoredOverrides());
}

/**
 * Полный слитый ProcessMap для «Экспорт JSON» (SPEC §4.4): экспорт отдаёт
 * готовый process.json, а не только правки.
 */
export function getMergedProcessMap(): ProcessMap {
  return loadProcessMap();
}
