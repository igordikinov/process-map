// Текст элементов BPMN: нормализация и разбор имени (process-map-70e.5).
//
// Вынесено отдельно от адаптера, потому что тут нет ни DOM-обхода, ни правил
// отображения — только строки, и проверяется это без единого узла XML.

/**
 * Пробелы в порядок: неразрывный пробел → обычный, любая последовательность
 * пробельных → один, края обрезаны.
 *
 * Неразрывные пробелы в файле владельца есть, и без нормализации они утекли бы
 * в подписи и в слаги: U+00A0 не равен обычному U+0020 при сравнении строк,
 * поэтому два визуально одинаковых имени дали бы разные id и разошлись бы в
 * поиске. Сам символ в исходнике не пишется: правило no-irregular-whitespace
 * его запрещает, и в диффе он неотличим от обычного пробела.
 *
 * Переводы строк схлопываются вместе с остальными пробельными — многострочное
 * имя модуля разбирается ДО нормализации, функцией `nameLines`.
 */
export function normalizeText(value: string | null | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim();
}

/** Имя элемента, нормализованное. Пустая строка, если имени нет. */
export function elementName(el: Element): string {
  return normalizeText(el.getAttribute('name'));
}

/**
 * Строки многострочного имени, каждая нормализована; пустые отброшены.
 *
 * Модули в модели владельца названы тремя строками — код, название, владелец:
 * `SNP\nПланирование сети поставок\nИ. Дикинов`. Разбирать это регуляркой по
 * уже схлопнутой строке было бы гаданием, поэтому перевод строки читается до
 * нормализации и остаётся значащим разделителем.
 */
export function nameLines(value: string | null | undefined): string[] {
  return (value ?? '')
    .split(/\r?\n/)
    .map((line) => normalizeText(line))
    .filter((line) => line !== '');
}

/**
 * Похоже ли на подпись владельца процесса: «И. Дикинов», «А. Репин (Лев
 * Дегтярев)».
 *
 * Сознательно узкое правило — инициал с точкой и фамилия с большой буквы.
 * Широкое («последняя строка — это владелец») ошибалось бы на модулях, которые
 * названы двумя строками без владельца, и подпись этапа теряла бы половину
 * названия.
 */
const OWNER_LINE = /^[А-ЯЁA-Z]\.\s*[А-ЯЁA-Z][^\s]*(\s*\(.+\))?$/u;

export interface ModuleName {
  /** Короткий код: `SNP`, `DP`. Пусто, если первая строка не похожа на код. */
  readonly code: string;
  /** Название без кода и без владельца. */
  readonly title: string;
  /** Владелец процесса, если он назван в имени. */
  readonly owner?: string;
}

/** Код модуля: короткий токен из букв, цифр и `&` — `SNP`, `S&OP`, `TPP`. */
const CODE_LINE = /^[A-ZА-ЯЁ][A-ZА-ЯЁ0-9&]{1,7}$/u;

/**
 * Имя модуля → код, название, владелец.
 *
 * Разбирает три формы, встречающиеся в модели владельца:
 *   `SNP\nПланирование сети поставок\nИ. Дикинов`  — три строки;
 *   `Replenishment – И. Фроликов`                  — одна строка с тире;
 *   `MRP`                                          — только код.
 *
 * Ничего не выдумывает: если разобрать не удалось, `title` равен исходному
 * имени целиком, а `code` пуст. Пустой `code` для вызывающего кода — сигнал
 * взять короткую подпись этапа из названия, а не из кода.
 */
export function parseModuleName(rawName: string | null | undefined): ModuleName {
  const lines = nameLines(rawName);
  if (lines.length === 0) {
    return { code: '', title: '' };
  }

  let owner: string | undefined;
  const rest = [...lines];
  const last = rest[rest.length - 1];
  if (rest.length > 1 && last !== undefined && OWNER_LINE.test(last)) {
    owner = last;
    rest.pop();
  }

  // Однострочное имя с отделителем: «Replenishment – И. Фроликов».
  if (rest.length === 1 && owner === undefined) {
    const single = rest[0] ?? '';
    const parts = single.split(/\s[–—-]\s*/u);
    const tail = parts.length > 1 ? normalizeText(parts[parts.length - 1]) : '';
    if (parts.length > 1 && OWNER_LINE.test(tail)) {
      owner = tail;
      rest[0] = normalizeText(parts.slice(0, -1).join(' - '));
    }
  }

  const first = rest[0] ?? '';
  const code = CODE_LINE.test(first) ? first : '';
  const title = code === '' ? rest.join(' — ') : rest.slice(1).join(' — ');

  return {
    code,
    // Модуль, названный одним лишь кодом («MRP»), не остаётся без названия:
    // код становится и названием тоже, иначе карточка этапа была бы пустой.
    title: title === '' ? first : title,
    ...(owner === undefined ? {} : { owner }),
  };
}

/**
 * Ведущий код шага: `DP-010-010 Фоновая загрузка` → `DP-010-010`.
 *
 * Нужен, чтобы вывести подпись безымянной группы из диапазона кодов её
 * участников. Шаблон передаётся снаружи: кодовая схема — знание про конкретную
 * модель, а не про формат BPMN, и жить оно обязано в профиле.
 */
export function leadingCode(label: string, pattern: RegExp): string | undefined {
  const match = pattern.exec(label);
  return match?.[0];
}
