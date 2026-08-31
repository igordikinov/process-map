// Открытие ссылок на экраны In.Plan и валидация URL (SPEC §4.8, §4.4).
//
// Без зависимостей от React и от данных: и карточка шага (StepCard), и футер
// боковой панели (NodeDrawer), и будущая форма редактора (process-map-0sb)
// обязаны открывать ссылку ОДИНАКОВО — поэтому логика ровно одна и живёт здесь.
import { config } from '../config';

// ────────────────────────────── открытие ──────────────────────────────

/**
 * ПОЧЕМУ ЗДЕСЬ БОЛЬШЕ НЕТ ПРОБЫ ДОСТУПНОСТИ ВЕРХНЕГО ОКНА (process-map-6ap).
 *
 * Раньше цель выбиралась так: прочитать `window.top.document` и, если вышло,
 * целиться в `_top`, иначе в `_blank`. Проба путала две разные вещи —
 * ДОСТУП к документу верхнего фрейма и ПРАВО увести этот фрейм на другой
 * адрес. Первое кросс-доменно запрещено ВСЕГДА, второе по клику обычно
 * разрешено. А карта по построению живёт на чужом origin: она на GitHub
 * Pages, вики — на своём домене (SPEC §6).
 *
 * Следствие было тихим и потому неприятным: `_top` в проде не выполнялся
 * никогда, «фолбэк» был единственным поведением, а SPEC и чек-лист приёмки в
 * README продолжали описывать уход всей страницы как исправный исход.
 *
 * Решение владельца — закрепить то, что и так происходит: новая вкладка.
 * Цель теперь берётся из `config.linkTarget` напрямую, без угадывания.
 */

/**
 * Открывает экран In.Plan (SPEC §4.8) — в новой вкладке (`config.linkTarget`).
 *
 * Возвращает то же, что `window.open`. `null` означает «браузер не дал открыть»
 * — как правило, блокировщик всплывающих окон или `sandbox` без `allow-popups`
 * на встраивающем iframe. Повторной попытки с другим target здесь НЕТ
 * намеренно:
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
  return window.open(url, config.linkTarget);
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
