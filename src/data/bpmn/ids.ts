// Идентификаторы узлов карты, собранной из BPMN (process-map-70e.5).
//
// ПОЧЕМУ id БЕРЁТСЯ ИЗ id ЭЛЕМЕНТА BPMN, А НЕ ИЗ СЛАГА ПОДПИСИ.
//
// Обе карты, собранные из презентаций, слагифицируют подпись шага. Здесь так
// нельзя, и на то две причины разного веса.
//
// Слабая — уникальность: в модели владельца 29 узлов уровня карты вообще без
// имени, а среди именованных «DP» встречается 8 раз и «SP» 6 раз; различных
// подписей 218 на 304 узла. Коллизии были бы не исключением, а нормой.
//
// Сильная — СТАБИЛЬНОСТЬ. `node.id` это ключ правок в localStorage
// (`overrides`) и параметр `?node=` в deep-link; именно по нему владелец
// вручную привязывает ссылки на экраны In.Plan. Camunda не меняет
// `Activity_1mo5vfb` при переименовании шага, а слаг подписи меняется — то
// есть на слаге подписи каждая правка текста в Modeler молча убивала бы все
// ссылки на этот узел.
//
// Читаемость URL при этом теряется: `?node=activity-1mo5vfb` ничего не говорит
// человеку. Это принятая цена; вернуть читаемость должен отчёт импорта, где
// есть таблица «id ↔ подпись».

/** Кириллица → латиница. Таблица та же, что в scripts/import-pptx.py::TRANSLIT. */
const TRANSLIT: Readonly<Record<string, string>> = {
  а: 'a',
  б: 'b',
  в: 'v',
  г: 'g',
  д: 'd',
  е: 'e',
  ё: 'e',
  ж: 'zh',
  з: 'z',
  и: 'i',
  й: 'y',
  к: 'k',
  л: 'l',
  м: 'm',
  н: 'n',
  о: 'o',
  п: 'p',
  р: 'r',
  с: 's',
  т: 't',
  у: 'u',
  ф: 'f',
  х: 'h',
  ц: 'c',
  ч: 'ch',
  ш: 'sh',
  щ: 'sch',
  ъ: '',
  ы: 'y',
  ь: '',
  э: 'e',
  ю: 'yu',
  я: 'ya',
};

/** Тот же потолок, что MAX_ID_LENGTH в импортёре презентаций. */
const MAX_ID_LENGTH = 72;

/**
 * Строка → kebab-case ASCII. Пустой результат заменяется на `fallback`:
 * идентификатор не имеет права быть пустой строкой, а входом бывает и имя из
 * одних знаков препинания.
 */
export function slugify(value: string, fallback = 'x', maxLength = MAX_ID_LENGTH): string {
  const latin = [...value.toLowerCase()].map((ch) => TRANSLIT[ch] ?? ch).join('');
  let slug = latin.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  if (slug.length > maxLength) {
    const cut = slug.slice(0, maxLength);
    const lastDash = cut.lastIndexOf('-');
    slug = (lastDash > 0 ? cut.slice(0, lastDash) : cut).replace(/^-+|-+$/g, '');
  }
  return slug === '' ? fallback : slug;
}

/**
 * id элемента BPMN → id узла карты: `Activity_1mo5vfb` → `activity-1mo5vfb`.
 *
 * Отдельная функция, а не `slugify` напрямую, ради читаемости вызывающего кода
 * и одного места, где решается запасной вариант для элемента без id (в
 * выгрузках Modeler id есть всегда, но входные данные чужие).
 */
export function slugifyBpmnId(bpmnId: string): string {
  return slugify(bpmnId, 'node');
}

/**
 * Детерминированный короткий хеш (FNV-1a, base36).
 *
 * Нужен только как разрешитель коллизий, поэтому криптостойкость не требуется;
 * требуется устойчивость — одна и та же строка обязана давать один и тот же
 * суффикс в любом прогоне и в любом окружении.
 */
function shortHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    // Умножение на 16777619 через сдвиги: иначе выходим за 32 бита и теряем
    // младшие разряды в double.
    hash = (hash + ((hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24))) >>> 0;
  }
  return hash.toString(36);
}

/**
 * Уникальные id для набора элементов BPMN — по одному на вход, в том же порядке.
 *
 * ДВЕ ФАЗЫ, как у IdFactory в импортёре презентаций: сначала считаем, сколько
 * раз встретился каждый базовый слаг, и лишь потом раздаём id. Уникальный слаг
 * становится id как есть; ВСЕ участники коллизии получают суффикс — хеш своего
 * исходного id.
 *
 * ПОЧЕМУ ХЕШ, А НЕ ПОРЯДКОВЫЙ НОМЕР. Номер зависит от порядка обхода: стоило бы
 * автору поменять два элемента местами в Modeler — и id обменялись бы, а вместе
 * с ними разъехались бы ссылки на экраны и deep-link. Хеш исходного id зависит
 * только от самого элемента, поэтому перестановка соседей ничего не меняет.
 *
 * Вызывать НУЖНО ОДИН РАЗ НА ВЕСЬ ДОКУМЕНТ, а не по этапу: `validateIntegrity`
 * требует глобальной уникальности id узлов по всей карте.
 */
export function assignUniqueIds(sources: readonly string[]): string[] {
  const bases = sources.map(slugifyBpmnId);
  const counts = new Map<string, number>();
  for (const base of bases) {
    counts.set(base, (counts.get(base) ?? 0) + 1);
  }

  const used = new Set<string>();
  return bases.map((base, index) => {
    const source = sources[index] ?? '';
    let candidate = (counts.get(base) ?? 0) <= 1 ? base : `${base}-${shortHash(source)}`;
    // Полнота функции: даже при совпадении хешей она обязана вернуть уникальное
    // значение, а не зациклиться и не отдать дубль.
    let extra = 2;
    while (used.has(candidate)) {
      candidate = `${base}-${shortHash(source)}-${extra}`;
      extra += 1;
    }
    used.add(candidate);
    return candidate;
  });
}

/**
 * id карты: должен пройти регулярку схемы `/^[a-z][a-z0-9-]*$/`.
 *
 * Единственное место всей модели, где ограничение на форму id стоит в самой
 * схеме, поэтому проверка здесь, а не в общем `slugify`: слаг, начинающийся с
 * цифры (`2024-model`), регулярку не проходит, и его надо чинить, а не отдавать
 * наружу и падать на `parse`.
 */
export function mapIdFrom(value: string, fallback = 'bpmn'): string {
  const slug = slugify(value, fallback);
  return /^[a-z]/.test(slug) ? slug : `${fallback}-${slug}`;
}
