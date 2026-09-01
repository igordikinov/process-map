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
import rawProcessJson from './snp/process.json';
import {
  OVERRIDES_STORAGE_KEY,
  OverridesSchema,
  ProcessMapSchema,
  type Overrides,
  type ProcessMap,
  type ProcessNode,
  type ScreenLink,
  type Stage,
} from './schema';

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
    const probe = `${OVERRIDES_STORAGE_KEY}:probe`;
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

/** Читает overrides из localStorage. Любая проблема → {}. */
export function readStoredOverrides(): Overrides {
  try {
    const raw = globalThis.localStorage?.getItem(OVERRIDES_STORAGE_KEY);
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
    storage.setItem(OVERRIDES_STORAGE_KEY, JSON.stringify(overrides));
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
    globalThis.localStorage?.removeItem(OVERRIDES_STORAGE_KEY);
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
