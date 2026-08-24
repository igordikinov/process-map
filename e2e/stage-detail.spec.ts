// e2e детализации уровня 2 (SPEC §7, §4.2, задача process-map-1ts).
//
// Смысл этих проверок — именно настоящий браузер: jsdom не делает hit-testing,
// поэтому дефект «React Flow глушит pointer-events у обёртки узла» юнит-тестом
// не ловится (fireEvent «сработает» и по мёртвому узлу). Здесь клик идёт
// реальной мышью по координатам, а попадание проверяется через
// document.elementFromPoint.
import { expect, test, type Page } from '@playwright/test';

const VIEWPORT = { width: 1280, height: 720 };

/** Ключ и формат overrides — SPEC §3, src/data/schema.ts. */
const OVERRIDES_KEY = 'inplan-process-map:overrides:v1';

/** Переход обзор → детализация настоящим кликом мыши по карточке этапа. */
async function openStage(page: Page, index: number): Promise<void> {
  await page.waitForSelector('.react-flow__node-stage');
  const card = page.locator('.react-flow__node-stage button').nth(index);
  const box = await card.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.click(
    (box?.x ?? 0) + (box?.width ?? 0) / 2,
    (box?.y ?? 0) + (box?.height ?? 0) / 2,
  );
  await page.waitForSelector('.react-flow__node-step');
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize(VIEWPORT);
});

test('клик по карточке этапа открывает детализацию с крошками и узлами', async ({ page }) => {
  await page.goto('/');
  await openStage(page, 0);

  await expect(page.getByText('E2E-процесс')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Назад к обзору процесса' })).toBeVisible();
  await expect(page.getByText(/ · .+ · /)).toBeVisible();
  // Обзорных карточек этапов на уровне 2 быть не должно.
  await expect(page.locator('.react-flow__node-stage')).toHaveCount(0);
  // Этап 1: 2 группы + колонка входов (выходов у этапа 1 нет).
  await expect(page.locator('.react-flow__node-groupBox')).toHaveCount(3);
});

test('центр карточки шага принимает события мыши, а не полотно', async ({ page }) => {
  await page.goto('/');
  await openStage(page, 0);

  const card = page.locator('.react-flow__node-step button').first();
  const box = await card.boundingBox();
  expect(box).not.toBeNull();

  const hit = await page.evaluate(
    ({ x, y }) => {
      const el = document.elementFromPoint(x, y);
      return {
        tag: el?.tagName ?? null,
        insideNode: el?.closest('.react-flow__node-step') !== null,
        isPane: el?.classList.contains('react-flow__pane') ?? false,
      };
    },
    { x: (box?.x ?? 0) + (box?.width ?? 0) / 2, y: (box?.y ?? 0) + (box?.height ?? 0) / 2 },
  );

  expect(hit.isPane).toBe(false);
  expect(hit.insideNode).toBe(true);
});

test('настоящий клик мышью по узлу выбирает его', async ({ page }) => {
  await page.goto('/');
  await openStage(page, 0);

  const card = page.locator('.react-flow__node-step button').first();
  await expect(card).not.toHaveAttribute('aria-current', 'true');

  const box = await card.boundingBox();
  await page.mouse.click(
    (box?.x ?? 0) + (box?.width ?? 0) / 2,
    (box?.y ?? 0) + (box?.height ?? 0) / 2,
  );

  await expect(card).toHaveAttribute('aria-current', 'true');
});

test('клик по карточке данных в колонке входов выбирает её', async ({ page }) => {
  await page.goto('/');
  await openStage(page, 0);

  const card = page.locator('.react-flow__node-data button').first();
  const box = await card.boundingBox();
  await page.mouse.click(
    (box?.x ?? 0) + (box?.width ?? 0) / 2,
    (box?.y ?? 0) + (box?.height ?? 0) / 2,
  );

  await expect(card).toHaveAttribute('aria-current', 'true');
  await expect(page.getByText('Входные данные')).toBeVisible();
});

// Ссылок в process.json нет ни у одного узла (они приходят из редактора M3),
// поэтому screen подкладывается штатным путём — overrides в localStorage,
// которые накладывает src/data/loader.ts при старте.
test('иконка link-external появляется при screen и не открывает Drawer (stopPropagation)', async ({
  page,
}) => {
  await page.goto('/');
  await openStage(page, 0);

  // id узла берём из уже отрисованного приложения, чтобы тест не зависел от
  // конкретных строк в process.json.
  const stepId = await page.locator('.react-flow__node-step').first().getAttribute('data-id');
  expect(stepId).not.toBeNull();

  await page.evaluate(
    ({ key, id }) => {
      window.localStorage.setItem(
        key,
        JSON.stringify({
          [id]: { screen: { title: 'Объёмный план', url: 'https://example.com/' } },
        }),
      );
    },
    { key: OVERRIDES_KEY, id: stepId ?? '' },
  );

  await page.reload();
  await openStage(page, 0);

  const linkButton = page.locator(`[data-id="${stepId}"] button[aria-label^="Открыть экран"]`);
  await expect(linkButton).toHaveCount(1);

  const box = await linkButton.boundingBox();
  await page.mouse.click(
    (box?.x ?? 0) + (box?.width ?? 0) / 2,
    (box?.y ?? 0) + (box?.height ?? 0) / 2,
  );

  // Открытие ссылки — задача process-map-lfj; здесь важно только, что клик по
  // иконке НЕ выбрал узел.
  await expect(page.locator(`[data-id="${stepId}"] button[aria-current="true"]`)).toHaveCount(0);

  await page.evaluate((key) => {
    window.localStorage.removeItem(key);
  }, OVERRIDES_KEY);
});

test('узлы уровня 2 не перетаскиваются (CLAUDE.md, v1)', async ({ page }) => {
  await page.goto('/');
  await openStage(page, 0);

  const node = page.locator('.react-flow__node-step').first();
  // Сравнивается собственный transform узла, а не boundingBox: протаскивание
  // мышью панорамирует полотно, и экранные координаты законно меняются.
  const before = await node.evaluate((el) => (el as HTMLElement).style.transform);
  const box = await node.boundingBox();

  await page.mouse.move((box?.x ?? 0) + 20, (box?.y ?? 0) + 8);
  await page.mouse.down();
  await page.mouse.move((box?.x ?? 0) + 220, (box?.y ?? 0) + 120, { steps: 10 });
  await page.mouse.up();

  expect(await node.evaluate((el) => (el as HTMLElement).style.transform)).toBe(before);
});

test('кнопка «Назад» возвращает на обзор', async ({ page }) => {
  await page.goto('/');
  await openStage(page, 0);

  await page.getByRole('button', { name: 'Назад к обзору процесса' }).click();

  await expect(page.locator('.react-flow__node-stage')).toHaveCount(4);
  await expect(page.locator('.react-flow__node-step')).toHaveCount(0);
});
