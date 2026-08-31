// Базовый `test` для всех e2e (задача process-map-vjz.2).
//
// ЗАЧЕМ. openScreen зовёт настоящий window.open, и без подмены вызов увёл бы
// браузер на чужой сайт: ассерты начинают гонку с живой навигацией. Именно
// так флачил тест иконки link-external (process-map-6ja). Пока перехват ставили
// руками, забыть про него было легко — screen-link-editor.spec.ts и
// json-transfer.spec.ts уже доводят эту иконку до DOM без перехвата, и первый
// же клик там воспроизвёл бы тот же флак.
//
// Авто-fixture снимает выбор: перехват ставится каждому тесту до его тела и до
// beforeEach, то есть раньше любого page.goto — включая те beforeEach, которые
// делают goto внутри себя (overview.spec.ts, compact.spec.ts).
//
// Спеки импортируют `test` и `expect` отсюда, а не из '@playwright/test'.
import { test as base } from '@playwright/test';
import { interceptWindowOpen } from './helpers';

export const test = base.extend<{ openInterception: void }>({
  // Значение fixture не нужно — важен побочный эффект, поэтому void и auto.
  openInterception: [
    async ({ page }, use) => {
      await interceptWindowOpen(page);
      await use();
    },
    { auto: true },
  ],
});

export { expect } from '@playwright/test';
