// Форматирование значений для UI. Без зависимостей от React и от данных.

/**
 * Русская форма множественного числа.
 * `one` — 1 этап, `few` — 2 этапа, `many` — 5 этапов.
 * Intl.PluralRules дал бы то же самое, но тянет локальные данные и в jsdom
 * ведёт себя по-разному между версиями Node — правило короче и детерминированнее.
 */
export function pluralRu(count: number, one: string, few: string, many: string): string {
  const abs = Math.abs(Math.trunc(count));
  const mod100 = abs % 100;
  if (mod100 >= 11 && mod100 <= 14) {
    return many;
  }
  const mod10 = abs % 10;
  if (mod10 === 1) {
    return one;
  }
  if (mod10 >= 2 && mod10 <= 4) {
    return few;
  }
  return many;
}

/**
 * `updatedAt` из process.json (ISO-дата или дата-время) → «24.08.2026».
 * Дата разбирается вручную, а не через `new Date()`: конструктор для строки
 * «2026-08-24» трактует её как UTC-полночь, и в отрицательных часовых поясах
 * пользователь увидел бы 23.08. Строку, не похожую на ISO, отдаём как есть —
 * лучше показать сырое значение, чем «Invalid Date».
 */
export function formatIsoDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (match === null) {
    return value;
  }
  const [, year, month, day] = match;
  return `${day}.${month}.${year}`;
}
