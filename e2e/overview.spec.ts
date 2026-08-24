// e2e обзора уровня 1 (SPEC §7, §4.1).
//
// Смысл этих проверок — именно настоящий браузер: jsdom не делает hit-testing,
// поэтому дефект «React Flow глушит pointer-events у обёртки узла» юнит-тестом
// не ловится. Здесь клик идёт реальной мышью по координатам.
import { expect, test } from '@playwright/test';

const VIEWPORT = { width: 1280, height: 720 };

test.beforeEach(async ({ page }) => {
  await page.setViewportSize(VIEWPORT);
  await page.goto('/');
  await page.waitForSelector('.react-flow__node');
});

test('шапка показывает заголовок, число этапов и дату обновления', async ({ page }) => {
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByText('4 этапа')).toBeVisible();
  await expect(page.getByText(/^Обновлено /)).toBeVisible();
});

test('на полотне 4 карточки этапов, оба свимлейна и рёбра', async ({ page }) => {
  await expect(page.locator('.react-flow__node-stage')).toHaveCount(4);
  await expect(page.locator('.react-flow__node-lane')).toHaveCount(2);
  await expect(page.locator('.react-flow__node-system')).toHaveCount(8);
  await expect(page.locator('.react-flow__edge')).toHaveCount(9);
});

test('центр карточки этапа принимает события мыши, а не полотно', async ({ page }) => {
  const card = page.locator('.react-flow__node-stage button').first();
  const box = await card.boundingBox();
  expect(box).not.toBeNull();

  const hit = await page.evaluate(
    ({ x, y }) => {
      const el = document.elementFromPoint(x, y);
      return {
        tag: el?.tagName ?? null,
        insideCard: el?.closest('.react-flow__node-stage') !== null,
        isPane: el?.classList.contains('react-flow__pane') ?? false,
      };
    },
    { x: (box?.x ?? 0) + (box?.width ?? 0) / 2, y: (box?.y ?? 0) + (box?.height ?? 0) / 2 },
  );

  expect(hit.isPane).toBe(false);
  expect(hit.insideCard).toBe(true);
});

// Проверка переписана в задаче process-map-1ts. До появления уровня 2 клик по
// карточке только помечал этап активным (App всегда рендерил обзор), теперь
// App по currentStageId переключает экран, и обзор вместе с карточкой
// размонтируется — прежнее утверждение стало непроверяемым в принципе.
// Смысл проверки прежний: настоящий клик мышью доходит до карточки
// (регрессия pointer-events из M1), а не гаснет на полотне.
test('настоящий клик мышью по карточке уводит на детализацию этапа', async ({ page }) => {
  const card = page.locator('.react-flow__node-stage button').nth(1);
  const label = await card.getAttribute('aria-label');
  expect(label).toMatch(/^Этап 2: /);

  await card.click();

  await expect(page.locator('.react-flow__node-stage')).toHaveCount(0);
  await expect(page.locator('.react-flow__node-step').first()).toBeVisible();
  await expect(page.getByText('E2E-процесс')).toBeVisible();
});

test('до первой карточки этапа один Tab', async ({ page }) => {
  await page.locator('body').click({ position: { x: 2, y: 2 } });
  await page.keyboard.press('Tab');

  const focused = await page.evaluate(() => {
    const el = document.activeElement;
    return {
      tag: el?.tagName ?? null,
      label: el?.getAttribute('aria-label') ?? null,
    };
  });

  expect(focused.tag).toBe('BUTTON');
  expect(focused.label).toMatch(/^Этап 1: /);
});

test('узлы не перетаскиваются (CLAUDE.md, v1)', async ({ page }) => {
  const card = page.locator('.react-flow__node-stage').first();
  // Сравнивается собственный transform узла, а не boundingBox: протаскивание
  // мышью по полотну панорамирует холст (panOnDrag включён), и экранные
  // координаты узла законно меняются — а координаты в графе меняться не должны.
  const transformBefore = await card.evaluate((el) => (el as HTMLElement).style.transform);
  const box = await card.boundingBox();

  await page.mouse.move((box?.x ?? 0) + 20, (box?.y ?? 0) + 8);
  await page.mouse.down();
  await page.mouse.move((box?.x ?? 0) + 220, (box?.y ?? 0) + 120, { steps: 10 });
  await page.mouse.up();

  const transformAfter = await card.evaluate((el) => (el as HTMLElement).style.transform);
  expect(transformAfter).toBe(transformBefore);
  await expect(card).not.toHaveClass(/draggable/);
});
