// Общие хелперы e2e (задача process-map-6ja).
//
// Файл намеренно назван не `*.spec.ts`: playwright.config.ts задаёт
// testDir: './e2e' с дефолтным testMatch, который подхватывает только спеки,
// поэтому модуль рядом с ними тестом не станет.
import type { Page } from '@playwright/test';

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
 * window.open(url, '_top'), а страница теста не в iframe, поэтому фолбэк на
 * '_blank' не срабатывает и настоящий вызов увёл бы весь тест на чужой сайт.
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

/** Что успел перехватить interceptWindowOpen. */
export async function openCalls(page: Page): Promise<OpenCall[]> {
  return page.evaluate(() => window.__openCalls ?? []);
}
