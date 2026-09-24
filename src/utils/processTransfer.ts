// Экспорт и импорт карты процесса (SPEC §3 «Overrides», §4.4 «тулбар редактора»).
//
// ПОЧЕМУ ЭТОТ ФАЙЛ ВЫГЛЯДИТ СЛОЖНЕЕ, ЧЕМ «сохранить и прочитать»
// -------------------------------------------------------------
// SPEC §3 описывает два конца одной кнопочной пары РАЗНЫМИ форматами:
//   «Экспорт отдаёт полный слитый `process.json`; импорт валидирует zod'ом
//    и заменяет overrides.»
// Экспорт — это ProcessMap (вся карта), а хранилище — Overrides
// (Record<nodeId, { screen?: ScreenLink | null }>). Если понять импорт
// буквально как «файл overrides», round-trip «экспорт → импорт» не сойдётся:
// пользователь выгрузит одно, а положить обратно сможет только другое, и
// единственный файл, который приложение отдаёт, оно же и не примет.
//
// Здесь противоречие снимается так: импорт принимает ФАЙЛ ПОЛНОЙ КАРТЫ (ровно
// то, что отдал экспорт), валидирует его ProcessMapSchema (это и есть
// «валидирует zod'ом»), а затем ВЫЧИСЛЯЕТ overrides как разницу между
// импортированной картой и базовым process.json — и заменяет ими хранилище
// (это и есть «заменяет overrides»). Оба требования SPEC выполняются, а
// round-trip замыкается.
//
// Ключевой случай, который эта разница обязана пережить, — «ссылка удалена
// пользователем»:
//   база: node.screen задан  →  в файле screen нет  →  override { screen: null }
// то есть «пользователь удалил ссылку», а НЕ «ссылки не было». Обратное
// сопоставление (нет записи в overrides) означало бы откат к значению из
// process.json — см. комментарии в src/data/loader.ts::applyNodeOverride.
//
// Чего импорт СОЗНАТЕЛЬНО не переносит: всё, что не является node.screen —
// version/updatedAt/title, координаты, рёбра, stage.screen, новые узлы.
// Overrides (SPEC §3) физически не умеют это выразить, поэтому такие правки
// в файле игнорируются молча. Файл при этом остаётся валидным и импорт не
// падает.
import { parseOverrides, parseProcessMap } from '../data/loader';
import { ProcessMapSchema, type Overrides, type ProcessMap, type ScreenLink } from '../data/schema';

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

/**
 * Разбирает текст импортируемого файла в overrides, готовые к записи.
 * `null` — файл не подошёл (битый JSON или не карта процесса); вызывающий код
 * обязан это учесть и НЕ писать в хранилище.
 *
 * parseOverrides в конце — не формальность: replaceOverrides() ничего не
 * валидирует (см. src/data/loader.ts), поэтому единственная гарантия, что в
 * localStorage попадёт разбираемая форма, — строгая проверка здесь.
 */
/**
 * Исход разбора импортируемого файла.
 *
 * Три значения, а не «overrides или null», потому что исходов у пользователя
 * действительно три, и один из них появился вместе с версиями карты
 * (process-map-0c5.9): файл может быть исправной картой процесса, но ДРУГОЙ.
 * Сказать про него «это не файл карты процесса» — неправда, и пользователь
 * пошёл бы искать поломку не там.
 *
 * Форма — та же, что у parseBpmnDocument: наружу отдаётся либо результат, либо
 * причина отказа, промежуточных состояний нет.
 */
export type ImportedOverridesResult =
  | { readonly status: 'ok'; readonly overrides: Overrides }
  | { readonly status: 'rejected' }
  | { readonly status: 'other-map'; readonly mapId: string };

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

  /*
   * ФАЙЛ ЧУЖОЙ КАРТЫ ОТВЕРГАЕТСЯ (process-map-0c5.9), и это не придирка.
   *
   * `deriveOverrides` считает разницу по id узлов и НАМЕРЕННО игнорирует те,
   * которых нет в базе. Пока карты жили на разных адресах, это было безопасно:
   * файл соседней карты туда просто не приносили. С двумя версиями на ОДНОМ
   * адресе `process.snp.json`, поданный на карте из модели, даёт ноль
   * совпадений — и пользователь получает «файл принят, расхождений нет», то
   * есть ему говорят, что всё в порядке, хотя он подал файл другой версии.
   *
   * Отдельный исход, а не `null`: «это не файл карты процесса» о файле карты
   * процесса было бы неправдой, и пользователь искал бы поломку не там.
   */
  if (parsed.data.id !== base.id) {
    return { status: 'other-map', mapId: parsed.data.id };
  }

  try {
    return { status: 'ok', overrides: parseOverrides(deriveOverrides(base, parsed.data)) };
  } catch {
    return { status: 'rejected' };
  }
}
