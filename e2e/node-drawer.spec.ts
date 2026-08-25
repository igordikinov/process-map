// e2e боковой панели узла (SPEC §4.3, задача process-map-lo7).
//
// Почему именно браузер: jsdom не делает hit-testing, поэтому клик по
// затемнению полотна и попадание по кнопкам футера юнит-тестом не проверяются
// (fireEvent «сработает» и по перекрытому элементу). Здесь клик идёт настоящей
// мышью по координатам, а перекрытие проверяется document.elementFromPoint.
import { expect, test, type Page } from '@playwright/test';

const VIEWPORT = { width: 1280, height: 720 };

/** Ключ и формат overrides — SPEC §3, src/data/schema.ts. */
const OVERRIDES_KEY = 'inplan-process-map:overrides:v1';

/** Ширина панели — SPEC §4.3 и токен --pm-drawer-width. */
const DRAWER_WIDTH = 360;

/** Узел этапа 1 с многострочным описанием (9 строк списка) — см. process.json. */
const NODE_WITH_DESCRIPTION = 'dezagregaciya-prognoza-po-produktu';

async function openStage(page: Page, index: number): Promise<void> {
  await page.waitForSelector('.react-flow__node-stage');
  const card = page.locator('.react-flow__node-stage button').nth(index);
  const box = await card.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.click(
    (box?.x ?? 0) + (box?.width ?? 0) / 2,
    (box?.y ?? 0) + (box?.height ?? 0) / 2,
  );
  await waitForStageDetailReady(page);
}

/**
 * Ждёт готовности полотна уровня 2, когда карточек уровня 1 на экране уже нет
 * (используется вместо openStage()). Актуально после page.reload(): deep-link
 * (?stage=…, SPEC §4.7, process-map-0y2) сам восстанавливает открытый этап —
 * приложение открывается сразу на уровне 2, а не на обзоре, поэтому кликать
 * по несуществующей карточке .react-flow__node-stage нельзя.
 */
async function waitForStageDetailReady(page: Page): Promise<void> {
  await page.waitForSelector('.react-flow__node-step');
  // Стартовый вьюпорт ставится в useEffect после измерения полотна.
  await page.waitForFunction(() => {
    const viewport = document.querySelector('.react-flow__viewport') as HTMLElement | null;
    return Number(/scale\(([^)]+)\)/.exec(viewport?.style.transform ?? '')?.[1] ?? '0') > 0.5;
  });
}

/** Настоящий клик мышью по центру карточки узла. */
async function clickNode(page: Page, selector: string): Promise<void> {
  // .first(): при заданной screen у карточки появляется вторая кнопка —
  // иконка link-external (SPEC §4.2). Нужна именно карточка, она идёт первой.
  const card = page.locator(selector).first();
  const box = await card.boundingBox();
  expect(box, `узел ${selector} не найден на экране`).not.toBeNull();
  await page.mouse.click(
    (box?.x ?? 0) + (box?.width ?? 0) / 2,
    (box?.y ?? 0) + (box?.height ?? 0) / 2,
  );
}

/** Открывает панель на первом шаге этапа 1 и возвращает его data-id. */
async function openFirstStepDrawer(page: Page): Promise<string> {
  await openStage(page, 0);
  const stepId = await page.locator('.react-flow__node-step').first().getAttribute('data-id');
  expect(stepId).not.toBeNull();
  await clickNode(page, `[data-id="${stepId ?? ''}"] button`);
  await expect(page.getByRole('dialog')).toBeVisible();
  return stepId ?? '';
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize(VIEWPORT);
});

test('клик по узлу открывает панель 360 справа и затемняет полотно', async ({ page }) => {
  await page.goto('/');
  await openFirstStepDrawer(page);

  const dialog = page.getByRole('dialog');
  const box = await dialog.boundingBox();
  expect(Math.round(box?.width ?? 0)).toBe(DRAWER_WIDTH);
  // Панель прижата к правому краю и начинается под шапкой крошек (52px).
  expect(Math.round((box?.x ?? 0) + (box?.width ?? 0))).toBe(VIEWPORT.width);
  expect(Math.round(box?.y ?? 0)).toBe(52);

  // Точка на полотне слева перекрыта затемнением, а не отдаёт события узлам.
  const covered = await page.evaluate(() => {
    const element = document.elementFromPoint(200, 400);
    return element?.getAttribute('data-testid') ?? null;
  });
  expect(covered).toBe('drawer-scrim');
});

test('Esc закрывает панель', async ({ page }) => {
  await page.goto('/');
  await openFirstStepDrawer(page);

  await page.keyboard.press('Escape');

  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('клик мышью по затемнённому полотну закрывает панель', async ({ page }) => {
  await page.goto('/');
  await openFirstStepDrawer(page);

  await page.mouse.click(200, 400);

  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('кнопка «Закрыть» закрывает панель и возвращает фокус на карточку узла', async ({ page }) => {
  await page.goto('/');
  const stepId = await openFirstStepDrawer(page);

  await page.getByRole('button', { name: 'Закрыть' }).click();

  await expect(page.getByRole('dialog')).toHaveCount(0);
  const focusedNodeId = await page.evaluate(
    () => document.activeElement?.closest('.react-flow__node')?.getAttribute('data-id') ?? null,
  );
  expect(focusedNodeId).toBe(stepId);
});

test('фокус уходит в панель при открытии, Tab не выходит за её пределы', async ({ page }) => {
  await page.goto('/');
  await openFirstStepDrawer(page);

  // При открытии фокус на самой панели — скринридер читает имя диалога.
  expect(await page.evaluate(() => document.activeElement?.getAttribute('role') ?? null)).toBe(
    'dialog',
  );

  // Первый Tab — на первый элемент панели, кнопку «Закрыть».
  await page.keyboard.press('Tab');
  expect(
    await page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? null),
  ).toBe('Закрыть');

  // Сколько бы ни было Tab, фокус остаётся внутри панели.
  for (let index = 0; index < 6; index += 1) {
    await page.keyboard.press('Tab');
    const insideDialog = await page.evaluate(
      () => document.activeElement?.closest('[role="dialog"]') !== null,
    );
    expect(insideDialog, `Tab №${index + 2} вывел фокус из панели`).toBe(true);
  }
});

test('узел без ссылки: «Ссылка не задана», «Открыть в модуле» заблокирована', async ({ page }) => {
  await page.goto('/');
  await openFirstStepDrawer(page);

  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Экран в системе')).toBeVisible();
  await expect(dialog.getByText('Ссылка не задана')).toBeVisible();
  // Action «Добавить» — только в редакторе (SPEC §4.3), режим по умолчанию «Просмотр».
  await expect(dialog.getByRole('button', { name: 'Добавить' })).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'Открыть в модуле' })).toBeDisabled();
});

test('узел со ссылкой (overrides): заголовок и url в панели, кнопка модуля активна', async ({
  page,
}) => {
  await page.goto('/');
  await openStage(page, 0);

  // Ссылок в process.json нет ни у одного узла — подкладываем штатным путём,
  // через overrides в localStorage (их накладывает src/data/loader.ts).
  const stepId = await page.locator('.react-flow__node-step').first().getAttribute('data-id');
  await page.evaluate(
    ({ key, id }) => {
      window.localStorage.setItem(
        key,
        JSON.stringify({
          [id]: {
            screen: {
              title: 'Планирование поставок › Объёмный план',
              url: 'https://example.com/plan',
            },
          },
        }),
      );
    },
    { key: OVERRIDES_KEY, id: stepId ?? '' },
  );
  await page.reload();
  await waitForStageDetailReady(page);
  await clickNode(page, `[data-id="${stepId ?? ''}"] button`);

  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Планирование поставок › Объёмный план')).toBeVisible();
  await expect(dialog.getByText('https://example.com/plan')).toBeVisible();
  await expect(dialog.getByText('Ссылка не задана')).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'Открыть в модуле' })).toBeEnabled();

  await page.evaluate((key) => {
    window.localStorage.removeItem(key);
  }, OVERRIDES_KEY);
});

test('многострочное описание выводится абзацами', async ({ page }) => {
  await page.goto('/');
  await openStage(page, 0);
  await clickNode(page, `[data-id="${NODE_WITH_DESCRIPTION}"] button`);

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  // 9 строк описания из process.json — 9 отдельных абзацев.
  await expect(dialog.locator('p')).toHaveCount(9);
});
