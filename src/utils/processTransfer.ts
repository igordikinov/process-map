// Полный ProcessMap для экспорта и импорта. Ссылочный diff сохраняется для
// совместимости v1; структуру этапов применяет единый слой команд редактора.
import { parseOverrides, parseProcessMap } from '../data/loader';
import { ProcessMapSchema, type Overrides, type ProcessMap, type ScreenLink } from '../data/schema';
import { assertEditorMap } from '../editor/operations';

/**
 * Имя скачиваемого файла: `process.<id карты>.json` (SPEC §4.4).
 *
 * ЗАЧЕМ ИМЯ КАРТЫ В ФАЙЛЕ (решение владельца, process-map-3wh.13). Карт две, а
 * инструкция владельцу говорит «положи скачанный файл в src/data/<карта>/».
 * С одинаковым именем `process.json` файл, выгруженный из вкладки MRP и
 * положенный по пути SNP, затёр бы карту SNP целиком. Побайтовый тест такое
 * поймал бы, но только если больше ничего не менялось. Имя, которое само
 * говорит, откуда файл, делает ошибку невозможной, а не маловероятной.
 *
 * Берётся из ТОЙ САМОЙ карты, которую сериализуем, а не из константы сборки:
 * имя и содержимое тогда не могут разойтись.
 */
export function exportFileName(map: ProcessMap): string {
  return `process.${map.id}.json`;
}

/**
 * Текст файла экспорта — байт в байт в формате репозитория, чтобы выгруженный
 * файл можно было положить в src/data/snp/process.json без diff-шума:
 * отступ 2 пробела, кириллица без \u-экранирования (JSON.stringify её не
 * экранирует, как и `ensure_ascii=False` в scripts/import-pptx.py), перевод
 * строки в конце, LF. То же самое делает scripts/layout.ts::serialize.
 *
 * Карта прогоняется через parseProcessMap не ради валидации, а ради
 * НОРМАЛИЗАЦИИ: zod пересобирает объекты в порядке ключей схемы. Без этого
 * узел, которому overrides добавили screen, получил бы ключ screen последним
 * (после position) — файл остался бы валидным, но перестал совпадать с
 * порядком ключей в process.json.
 */
export function serializeProcessMap(map: ProcessMap): string {
  return `${JSON.stringify(parseProcessMap(map), null, 2)}\n`;
}

function screensEqual(a: ScreenLink | undefined, b: ScreenLink | undefined): boolean {
  if (a === undefined || b === undefined) {
    return a === b;
  }
  return a.title === b.title && a.url === b.url;
}

/**
 * Разница «импортированная карта минус базовый process.json» в виде overrides.
 *
 * Правила (base → imported):
 *   - screen совпал                → записи нет (правки нет);
 *   - в файле есть, в базе нет/иной → { screen: {...} };
 *   - в базе есть, в файле нет      → { screen: null } (ссылка удалена);
 *   - узла нет в файле              → записи нет (нечего сравнивать).
 * Узлы, которых нет в базе, игнорируются: overrides адресуются по id узла
 * базовой карты, а добавление узлов v1 не поддерживает.
 */
export function deriveOverrides(base: ProcessMap, imported: ProcessMap): Overrides {
  const importedScreens = new Map<string, ScreenLink | undefined>();
  for (const stage of imported.stages) {
    for (const node of stage.nodes) {
      importedScreens.set(node.id, node.screen);
    }
  }

  const overrides: Overrides = {};
  for (const stage of base.stages) {
    for (const node of stage.nodes) {
      if (!importedScreens.has(node.id)) {
        continue;
      }
      const next = importedScreens.get(node.id);
      if (screensEqual(node.screen, next)) {
        continue;
      }
      // next === undefined здесь означает «в базе ссылка была, в файле её нет»,
      // то есть явное удаление — null, а не отсутствие записи.
      overrides[node.id] = { screen: next ?? null };
    }
  }
  return overrides;
}

/** Валидный полный документ; другая верхняя структура требует явного открытия. */
export type ImportedOverridesResult =
  | { readonly status: 'ok'; readonly overrides: Overrides; readonly map: ProcessMap }
  | { readonly status: 'rejected' }
  | { readonly status: 'other-map'; readonly mapId: string; readonly map: ProcessMap };

/** Структура верхних уровней не меняется командами редактора этапа. */
export function sameMapStructure(a: ProcessMap, b: ProcessMap): boolean {
  const structure = (map: ProcessMap) => ({
    ...map,
    stages: map.stages.map((stage) => ({ ...stage, nodes: [], edges: [], groups: [] })),
  });
  return JSON.stringify(structure(a)) === JSON.stringify(structure(b));
}

export function parseImportedOverrides(text: string, base: ProcessMap): ImportedOverridesResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { status: 'rejected' };
  }

  const parsed = ProcessMapSchema.safeParse(raw);
  if (!parsed.success) {
    return { status: 'rejected' };
  }

  try {
    assertEditorMap(parsed.data);
  } catch {
    return { status: 'rejected' };
  }

  if (!sameMapStructure(base, parsed.data)) {
    return { status: 'other-map', mapId: parsed.data.id, map: parsed.data };
  }

  try {
    return {
      status: 'ok',
      overrides: parseOverrides(deriveOverrides(base, parsed.data)),
      map: parsed.data,
    };
  } catch {
    return { status: 'rejected' };
  }
}
