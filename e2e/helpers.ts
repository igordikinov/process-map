// Общие хелперы e2e (задача process-map-6ja).
//
// Файл намеренно назван не `*.spec.ts`: playwright.config.ts задаёт
// testDir: './e2e' с дефолтным testMatch, который подхватывает только спеки,
// поэтому модуль рядом с ними тестом не станет.
import { expect, type Page } from '@playwright/test';

/** Аргументы перехваченных вызовов window.open: [url, target]. */
export type OpenCall = [string, string];

declare global {
  interface Window {
    __openCalls?: OpenCall[];
  }
}

/**
 * Перехват window.open на всё время жизни страницы.
 *
 * Руками звать не нужно: это делает авто-fixture в e2e/fixtures.ts, через
 * которую спеки получают `test` (задача process-map-vjz.2). Функция оставлена
 * экспортируемой, потому что вызывает её именно fixture.
 *
 * Ставится через addInitScript, то есть до первого скрипта приложения: модуль
 * utils/url.ts читает window.open в момент вызова, поэтому подмена работает.
 * Переживает page.reload().
 *
 * Подмена обязательна не только ради проверки аргументов: openScreen зовёт
 * настоящий window.open, и без неё вызов увёл бы браузер на чужой сайт.
 */
export async function interceptWindowOpen(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.__openCalls = [];
    window.open = (url?: string | URL, target?: string): Window | null => {
      window.__openCalls?.push([String(url), String(target)]);
      return null;
    };
  });
}

/**
 * Селектор карточки ШАГА, у которой НЕТ ссылки на экран (process-map-071).
 *
 * ЗАЧЕМ. Тесты пустого состояния — «Ссылка не задана», кнопка «Добавить»,
 * заблокированная «Открыть в модуле» — до сих пор брали просто первую карточку
 * шага. Пока `screen` не заполнен ни у одного узла, это работало; первая же
 * ссылка владельца (process-map-lqa) в неудачном месте покрасила бы сборку без
 * внятной причины. Признак берётся из DOM, а не из id: кнопка ссылки
 * рендерится ровно при `screen !== undefined` (StepCard.tsx), и её aria-label
 * начинается с «Открыть экран».
 */
const STEP_WITHOUT_LINK = '.react-flow__node-step:not(:has(button[aria-label^="Открыть экран"]))';

/**
 * id первой карточки шага БЕЗ ссылки на экран.
 *
 * Падает с внятным текстом, если ссылки проставлены всем шагам этапа: тогда
 * тесты пустого состояния проверять не на чем, и это надо увидеть сразу, а не
 * гадать по таймауту.
 */
export async function firstStepWithoutLink(page: Page): Promise<string> {
  const node = page.locator(STEP_WITHOUT_LINK).first();
  await expect(node, 'на этапе не осталось ни одного шага без ссылки').toBeAttached();
  return (await node.getAttribute('data-id')) ?? '';
}

/** Что успел перехватить interceptWindowOpen. */
export async function openCalls(page: Page): Promise<OpenCall[]> {
  return page.evaluate(() => window.__openCalls ?? []);
}
