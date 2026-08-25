// Открытие ссылок на экраны In.Plan и валидация URL (SPEC §4.8, §4.4).
//
// Без зависимостей от React и от данных: и карточка шага (StepCard), и футер
// боковой панели (NodeDrawer), и будущая форма редактора (process-map-0sb)
// обязаны открывать ссылку ОДИНАКОВО — поэтому логика ровно одна и живёт здесь.
import { config } from '../config';

// ────────────────────────────── открытие ──────────────────────────────

/**
 * Доступен ли `window.top` — то есть можно ли осмысленно целиться в `_top`.
 *
 * Приложение работает внутри iframe на чужом домене (SPEC §6), и это штатный
 * режим, а не крайний случай. Проверять НАЛИЧИЕ `window.top` бесполезно:
 * `top` входит в белый список свойств кросс-доменного WindowProxy (наравне с
 * `parent`, `location`, `postMessage`, `closed`), поэтому обращение к нему
 * молча возвращает объект и из соседнего домена. Исключение бросает первое же
 * обращение к свойству ВНЕ этого списка — здесь `document`: для чужого origin
 * браузер отвечает `SecurityError`, для своего отдаёт документ.
 *
 * `top === null` — отдельный случай (окно уже отсоединено от своего фрейма):
 * ссылки в никуда тоже не откроются, значит тоже «недоступен».
 *
 * Результат `top.document` кладётся в переменную и участвует в возвращаемом
 * значении, а не отбрасывается через `void`: выражение, значение которого
 * нигде не используется, минификатор вправе выкинуть вместе с проверкой.
 */
function isTopReachable(): boolean {
  try {
    const top = window.top;
    if (top === null) {
      return false;
    }
    const topDocument: unknown = top.document;
    return topDocument !== null && topDocument !== undefined;
  } catch {
    return false;
  }
}

/** Куда открывать ссылку: `config.linkTarget` с фолбэком `_top` → `_blank`. */
function resolveTarget(): '_top' | '_blank' {
  if (config.linkTarget !== '_top') {
    return config.linkTarget;
  }
  return isTopReachable() ? '_top' : '_blank';
}

/**
 * Открывает экран In.Plan (SPEC §4.8).
 *
 * Возвращает то же, что `window.open`. `null` означает «браузер не дал открыть»
 * — как правило, блокировщик всплывающих окон. Повторной попытки с другим
 * target здесь НЕТ намеренно:
 *  - `null` приходит и тогда, когда открытие удалось (например, окно отдано с
 *    `noopener`), так что retry открывал бы вторую вкладку поверх успешной;
 *  - блокировщик, зарубивший `_blank`, зарубит и вторую попытку — сообщать
 *    пользователю всё равно нечего, кроме «разрешите всплывающие окна», а
 *    такого текста в SPEC нет.
 * Значение возвращается, чтобы вызывающий код (и тесты) мог это увидеть.
 *
 * Ссылка, не прошедшая валидацию, не открывается вовсе: `screen.url` приходит
 * из overrides в localStorage (SPEC §3), то есть из данных, которые может
 * подменить кто угодно, а `window.open('javascript:…', '_top')` выполнил бы
 * скрипт в контексте страницы-хозяина.
 */
export function openScreen(url: string): Window | null {
  if (validateUrl(url).status === 'invalid') {
    return null;
  }
  return window.open(url, resolveTarget());
}

// ────────────────────────────── валидация ──────────────────────────────

/**
 * Итог проверки URL (SPEC §4.4).
 *
 * Три состояния, а не булево: предупреждение о `http:` редактор обязан
 * показывать ОТДЕЛЬНО от ошибки — с ним ссылку сохранять можно, с ошибкой
 * нельзя. `reason` позволяет форме подобрать текст, не разбирая строку заново.
 */
export type UrlValidation =
  | { readonly status: 'valid' }
  | { readonly status: 'warning'; readonly reason: 'insecure-protocol' }
  | { readonly status: 'invalid'; readonly reason: 'empty' | 'malformed' | 'unsupported-protocol' };

const VALID: UrlValidation = { status: 'valid' };
const INSECURE: UrlValidation = { status: 'warning', reason: 'insecure-protocol' };

/**
 * `https:` — корректен, `http:` — корректен с предупреждением (SPEC §4.4),
 * всё остальное (включая `javascript:`, `data:`, `file:`) — ошибка.
 *
 * Разбор через `new URL()`, как требует SPEC: собственные регулярки на URL
 * всегда расходятся с тем, что реально откроет браузер. Относительные адреса
 * («/plan») тоже ошибка: ссылка ведёт в соседнюю систему, а не внутрь iframe,
 * и база у неё не наша.
 */
export function validateUrl(value: string): UrlValidation {
  const trimmed = value.trim();
  if (trimmed === '') {
    return { status: 'invalid', reason: 'empty' };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { status: 'invalid', reason: 'malformed' };
  }

  if (parsed.protocol === 'https:') {
    return VALID;
  }
  if (parsed.protocol === 'http:') {
    return INSECURE;
  }
  return { status: 'invalid', reason: 'unsupported-protocol' };
}
