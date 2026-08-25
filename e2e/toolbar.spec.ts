// e2e тулбара и легенды (SPEC §4.6, задача process-map-jl8).
//
// Смысл этих проверок — именно настоящий браузер: jsdom не делает
// hit-testing, поэтому «клик прошёл» юнит-тестом (tests/toolbar.test.tsx)
// ничего не доказывает про реальный клик мышью, если тулбар лежит поверх
// полотна React Flow (см. CLAUDE.md «Ловушки»). Здесь клик идёт реальной
// мышью по координатам, попадание проверяется через document.elementFromPoint,
// как в остальных e2e файлах проекта.
import { expect, test, type Page } from '@playwright/test';

const VIEWPORT = { width: 1280, height: 720 };

/** Масштаб вьюпорта React Flow из transform контейнера .react-flow__viewport. */
async function viewportZoom(page: Page): Promise<number> {
  return page.evaluate(() => {
    const viewport = document.querySelector('.react-flow__viewport') as HTMLElement | null;
    return Number(/scale\(([^)]+)\)/.exec(viewport?.style.transform ?? '')?.[1] ?? '0');
  });
}

/** Кликает реальной мышью по центру локатора и возвращает попадание в DOM. */
async function mouseClickCenter(
  page: Page,
  locator: ReturnType<Page['locator']>,
): Promise<{ isPane: boolean }> {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  const x = (box?.x ?? 0) + (box?.width ?? 0) / 2;
  const y = (box?.y ?? 0) + (box?.height ?? 0) / 2;

  const hit = await page.evaluate(
    ({ x, y }) => {
      const el = document.elementFromPoint(x, y);
      return { isPane: el?.classList.contains('react-flow__pane') ?? false };
    },
    { x, y },
  );
  await page.mouse.click(x, y);
  return hit;
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize(VIEWPORT);
});

test.describe('Тулбар и легенда, уровень 1 (обзор)', () => {
  test('тулбар и легенда видны, клики по кнопкам доходят до них, а не до полотна', async ({
    page,
  }) => {
    await page.goto('/');
    await page.waitForSelector('.react-flow__node-stage');

    await expect(page.getByRole('switch', { name: 'Показать интеграции' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Уменьшить' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Увеличить' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Уместить в экран' })).toBeVisible();
    await expect(page.getByRole('group', { name: 'Условные обозначения' })).toBeVisible();

    const fitButton = page.getByRole('button', { name: 'Уместить в экран' });
    const hit = await mouseClickCenter(page, fitButton);
    expect(hit.isPane).toBe(false);
  });

  test('плюс/минус реально меняют масштаб полотна, процент в тулбаре синхронен', async ({
    page,
  }) => {
    await page.goto('/');
    await page.waitForSelector('.react-flow__node-stage');

    const before = await viewportZoom(page);
    await mouseClickCenter(page, page.getByRole('button', { name: 'Увеличить' }));
    await page.waitForTimeout(250);
    const afterZoomIn = await viewportZoom(page);
    expect(afterZoomIn).toBeGreaterThan(before);
    await expect(page.getByText(`${Math.round(afterZoomIn * 100)}%`)).toBeVisible();

    await mouseClickCenter(page, page.getByRole('button', { name: 'Уменьшить' }));
    await mouseClickCenter(page, page.getByRole('button', { name: 'Уменьшить' }));
    await page.waitForTimeout(250);
    const afterZoomOut = await viewportZoom(page);
    expect(afterZoomOut).toBeLessThan(afterZoomIn);
  });

  test('toggle «Показать интеграции» реальным кликом прячет и возвращает свимлейны/системы', async ({
    page,
  }) => {
    await page.goto('/');
    await page.waitForSelector('.react-flow__node-stage');

    await expect(page.locator('.react-flow__node-lane')).toHaveCount(2);
    await expect(page.locator('.react-flow__node-system')).toHaveCount(8);
    await expect(page.locator('.react-flow__edge-integration')).toHaveCount(6);

    const toggle = page.getByRole('switch', { name: 'Показать интеграции' });
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
    await mouseClickCenter(page, toggle);

    await expect(toggle).toHaveAttribute('aria-checked', 'false');
    await expect(page.locator('.react-flow__node-lane')).toHaveCount(0);
    await expect(page.locator('.react-flow__node-system')).toHaveCount(0);
    await expect(page.locator('.react-flow__edge-integration')).toHaveCount(0);
    // Этапы и процессные рёбра остаются.
    await expect(page.locator('.react-flow__node-stage')).toHaveCount(4);
    await expect(page.locator('.react-flow__edge-process')).toHaveCount(3);

    await mouseClickCenter(page, toggle);
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
    await expect(page.locator('.react-flow__node-lane')).toHaveCount(2);
    await expect(page.locator('.react-flow__node-system')).toHaveCount(8);
  });

  test('кнопки тулбара достижимы Tab, не ломая переход к первой карточке этапа', async ({
    page,
  }) => {
    await page.goto('/');
    await page.waitForSelector('.react-flow__node-stage');
    await page.locator('body').click({ position: { x: 2, y: 2 } });

    // Первый Tab по-прежнему уходит на карточку этапа 1 (регрессия M1/M2,
    // e2e/overview.spec.ts) — тулбар в DOM идёт ПОСЛЕ полотна.
    await page.keyboard.press('Tab');
    const first = await page.evaluate(() => document.activeElement?.getAttribute('aria-label'));
    expect(first).toMatch(/^Этап 1: /);

    // Дальше по Tab рано или поздно доходим до переключателя интеграций —
    // кнопки тулбара не выпадают из обхода клавиатурой.
    const labels: (string | null)[] = [];
    for (let i = 0; i < 10; i += 1) {
      await page.keyboard.press('Tab');
      labels.push(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')));
      if (labels[labels.length - 1] === 'Показать интеграции') {
        break;
      }
    }
    expect(labels).toContain('Показать интеграции');
  });
});

test.describe('Тулбар, уровень 2 (детализация)', () => {
  async function openStage(page: Page, index: number): Promise<void> {
    await page.waitForSelector('.react-flow__node-stage');
    const card = page.locator('.react-flow__node-stage button').nth(index);
    const box = await card.boundingBox();
    await page.mouse.click((box?.x ?? 0) + (box?.width ?? 0) / 2, (box?.y ?? 0) + (box?.height ?? 0) / 2);
    await page.waitForSelector('.react-flow__node-step');
    await page.waitForFunction(() => {
      const viewport = document.querySelector('.react-flow__viewport') as HTMLElement | null;
      return Number(/scale\(([^)]+)\)/.exec(viewport?.style.transform ?? '')?.[1] ?? '0') > 0.5;
    });
  }

  test('кнопка fit не уводит масштаб ниже читаемого порога (process-map-l8a)', async ({ page }) => {
    // Порог 12/13 ≈ 0.923 — тот же, что у стартового вида (см. stageGraph.ts,
    // START_ZOOM_MIN). Кнопка «Уместить в экран» обязана его уважать, иначе
    // отменяла бы задачу process-map-l8a.
    const START_ZOOM_MIN = 12 / 13;

    await page.goto('/');
    await openStage(page, 1);

    // Отдаляем схему колесом далеко за порог — ручной зум им не ограничен.
    await page.evaluate(() => {
      const pane = document.querySelector('.react-flow__pane') as HTMLElement;
      for (let i = 0; i < 40; i += 1) {
        pane.dispatchEvent(
          new WheelEvent('wheel', {
            deltaY: 120,
            ctrlKey: true,
            clientX: 640,
            clientY: 400,
            bubbles: true,
            cancelable: true,
          }),
        );
      }
    });
    await page.waitForTimeout(300);
    expect(await viewportZoom(page)).toBeLessThan(START_ZOOM_MIN);

    await mouseClickCenter(page, page.getByRole('button', { name: 'Уместить в экран' }));
    await page.waitForTimeout(300);

    const afterFit = await viewportZoom(page);
    expect(afterFit).toBeGreaterThanOrEqual(START_ZOOM_MIN - 0.001);
    expect(afterFit).toBeLessThanOrEqual(1);
  });

  test('toggle «Показать интеграции» прячет узлы-интеграции и их рёбра на полотне шага', async ({
    page,
  }) => {
    await page.goto('/');
    // Этап 2 содержит узлы типа integration (см. tests/stageGraph-integrations.test.ts).
    await openStage(page, 1);

    const integrationCards = page.locator('.react-flow__node-step button[aria-label^="Интеграция:"]');
    const before = await integrationCards.count();
    expect(before).toBeGreaterThan(0);

    await mouseClickCenter(page, page.getByRole('switch', { name: 'Показать интеграции' }));
    await expect(integrationCards).toHaveCount(0);

    await mouseClickCenter(page, page.getByRole('switch', { name: 'Показать интеграции' }));
    await expect(integrationCards).toHaveCount(before);
  });
});
