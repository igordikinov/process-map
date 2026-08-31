// e2e тулбара и легенды (SPEC §4.6, задача process-map-jl8).
//
// Смысл этих проверок — именно настоящий браузер: jsdom не делает
// hit-testing, поэтому «клик прошёл» юнит-тестом (tests/toolbar.test.tsx)
// ничего не доказывает про реальный клик мышью, если тулбар лежит поверх
// полотна React Flow (см. CLAUDE.md «Ловушки»). Здесь клик идёт реальной
// мышью по координатам, попадание проверяется через document.elementFromPoint,
// как в остальных e2e файлах проекта.
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

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

/** Оба размера окна из SPEC (обычный и компактный §4.5, задача process-map-jl8). */
const VIEWPORT_SIZES = [
  { name: '1280x720', width: 1280, height: 720 },
  { name: '1024x600', width: 1024, height: 600 },
] as const;

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

/**
 * Легенда — своя строка ПОД полотном (Legend.module.css), а не абсолютная
 * панель поверх него, поэтому пересечение проверяется со ВСЕМИ узлами
 * полотна любого типа (`.react-flow__node`) — карточки, контейнеры групп,
 * заголовки колонок, а не один селектор (см. ревью координатора: узкая
 * проверка по `.react-flow__node-data` пропустила перекрытие контейнера
 * группы и карточки шага, которых в выборку не попало).
 *
 * getBoundingClientRect() узла — это его ГЕОМЕТРИЯ (с учётом transform
 * панорамирования/зума), а не то, что реально нарисовано: `.react-flow`
 * сам вырезает своё содержимое `overflow:hidden`, поэтому длинная колонка
 * или широкая группа геометрически продолжается далеко за пределы видимой
 * области (это и поймал первый прогон — ложные срабатывания на узлах,
 * которые физически некуда красить, они обрезаны). Поэтому каждый rect
 * обрезается по рамке самого `.react-flow` ПЕРЕД сравнением с легендой —
 * так проверяется то, что видит пользователь, а не сырая геометрия DOM.
 */
async function assertLegendDoesNotOverlapCanvas(page: Page): Promise<void> {
  const legend = page.getByRole('group', { name: 'Условные обозначения' });
  await expect(legend).toBeVisible();
  const legendBox = await legend.boundingBox();
  expect(legendBox).not.toBeNull();
  if (legendBox === null) {
    return;
  }

  const canvasBox = await page.locator('.react-flow').boundingBox();
  expect(canvasBox).not.toBeNull();
  if (canvasBox === null) {
    return;
  }

  const nodeBoxes = await page.locator('.react-flow__node').evaluateAll((nodes) =>
    nodes.map((node) => {
      const rect = node.getBoundingClientRect();
      return {
        id: node.getAttribute('data-id'),
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
      };
    }),
  );
  expect(nodeBoxes.length).toBeGreaterThan(0);

  const clipToCanvas = (rect: Rect): Rect | null => {
    const x0 = Math.max(rect.x, canvasBox.x);
    const y0 = Math.max(rect.y, canvasBox.y);
    const x1 = Math.min(rect.x + rect.width, canvasBox.x + canvasBox.width);
    const y1 = Math.min(rect.y + rect.height, canvasBox.y + canvasBox.height);
    // Полностью вне рамки .react-flow — обрезано целиком, красить нечего.
    return x1 > x0 && y1 > y0 ? { x: x0, y: y0, width: x1 - x0, height: y1 - y0 } : null;
  };

  const overlapping = nodeBoxes
    .map((box) => ({ id: box.id, visible: clipToCanvas(box) }))
    .filter(
      (entry): entry is { id: string | null; visible: Rect } =>
        entry.visible !== null && rectsOverlap(entry.visible, legendBox),
    );

  expect(overlapping, `узлы полотна под легендой: ${JSON.stringify(overlapping)}`).toHaveLength(0);
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

  test('легенда показывает то, что реально есть на обзоре, а не типы узлов уровня 2', async ({
    page,
  }) => {
    // Ревью координатора: макет по ошибке показывал «Шаг/Данные/Предупреждение»
    // и на обзоре, где узлов этих типов нет вовсе.
    await page.goto('/');
    await page.waitForSelector('.react-flow__node-stage');

    const legend = page.getByRole('group', { name: 'Условные обозначения' });
    await expect(legend.getByText('Процесс')).toBeVisible();
    await expect(legend.getByText('Интеграция')).toBeVisible();
    await expect(legend.getByText('Система')).toBeVisible();
    await expect(legend.getByText('Шаг')).toHaveCount(0);
    await expect(legend.getByText('Данные')).toHaveCount(0);
    await expect(legend.getByText('Предупреждение')).toHaveCount(0);

    // Пункт «Интеграция»/«Система» пропадает вместе с самими интеграциями.
    await mouseClickCenter(page, page.getByRole('switch', { name: 'Показать интеграции' }));
    await expect(legend.getByText('Процесс')).toBeVisible();
    await expect(legend.getByText('Интеграция')).toHaveCount(0);
    await expect(legend.getByText('Система')).toHaveCount(0);
  });

  for (const size of VIEWPORT_SIZES) {
    test(`легенда не перекрывает ни один узел полотна (${size.name})`, async ({ page }) => {
      await page.setViewportSize(size);
      await page.goto('/');
      await page.waitForSelector('.react-flow__node-stage');
      await assertLegendDoesNotOverlapCanvas(page);
    });
  }

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
    // Седьмое ребро объявлено владельцем: ERP → этап 1 (process-map-vjz.5).
    await expect(page.locator('.react-flow__edge-integration')).toHaveCount(7);

    const toggle = page.getByRole('switch', { name: 'Показать интеграции' });
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
    await mouseClickCenter(page, toggle);

    await expect(toggle).toHaveAttribute('aria-checked', 'false');
    await expect(page.locator('.react-flow__node-lane')).toHaveCount(0);
    await expect(page.locator('.react-flow__node-system')).toHaveCount(0);
    await expect(page.locator('.react-flow__edge-integration')).toHaveCount(0);
    // Этапы, рамка потока и процессные рёбра остаются: рамка описывает сам
    // процесс, а не интеграции, поэтому тумблер её не касается (process-map-sni).
    await expect(page.locator('.react-flow__node-stage')).toHaveCount(4);
    await expect(page.locator('.react-flow__node-flowLane')).toHaveCount(1);
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
      // ?? null: опциональная цепочка добавляет undefined на случай, когда
      // activeElement пуст, но для теста это то же самое, что элемент без
      // подписи, — оба означают «подписи нет».
      labels.push(
        await page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? null),
      );
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
    await page.mouse.click(
      (box?.x ?? 0) + (box?.width ?? 0) / 2,
      (box?.y ?? 0) + (box?.height ?? 0) / 2,
    );
    // Карточка ШАГА. Фильтр по aria-label — второй сторож поверх класса: до
    // process-map-73m `.react-flow__node-step` носили и интеграции.
    await page.waitForSelector('.react-flow__node-step button[aria-label^="Шаг: "]');
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

    const integrationCards = page.locator(
      '.react-flow__node-integration button[aria-label^="Интеграция:"]',
    );
    const before = await integrationCards.count();
    expect(before).toBeGreaterThan(0);

    await mouseClickCenter(page, page.getByRole('switch', { name: 'Показать интеграции' }));
    await expect(integrationCards).toHaveCount(0);

    await mouseClickCenter(page, page.getByRole('switch', { name: 'Показать интеграции' }));
    await expect(integrationCards).toHaveCount(before);
  });

  test('легенда показывает типы узлов, «Интеграция» пропадает вместе с интеграциями', async ({
    page,
  }) => {
    await page.goto('/');
    await openStage(page, 1);

    const legend = page.getByRole('group', { name: 'Условные обозначения' });
    await expect(legend.getByText('Шаг')).toBeVisible();
    await expect(legend.getByText('Данные')).toBeVisible();
    await expect(legend.getByText('Интеграция')).toBeVisible();
    await expect(legend.getByText('Предупреждение')).toBeVisible();
    // Пункты уровня 1 здесь не показываются.
    await expect(legend.getByText('Процесс')).toHaveCount(0);
    await expect(legend.getByText('Система')).toHaveCount(0);

    await mouseClickCenter(page, page.getByRole('switch', { name: 'Показать интеграции' }));
    await expect(legend.getByText('Интеграция')).toHaveCount(0);
    // Типы узлов, не связанные с интеграциями, остаются.
    await expect(legend.getByText('Шаг')).toBeVisible();
    await expect(legend.getByText('Данные')).toBeVisible();
    await expect(legend.getByText('Предупреждение')).toBeVisible();
  });

  // Ревью координатора (два круга): сначала легенда слева снизу (как в
  // макете) перекрывала колонку входов (этап 4: 16 карточек до самого низа
  // полотна); после переноса в правый нижний угол — перекрывала контейнер
  // группы и карточку шага на том же этапе 4, потому что проверка смотрела
  // только на `.react-flow__node-data`. Оба раза причина одна: легенда
  // ПЛАВАЛА поверх панорамируемого/масштабируемого полотна, а свободного
  // угла на реальных данных не существует (посчитано отдельно: ни один из
  // левый-низ/право-низ/лево-верх углов не свободен ни на одном из этапов
  // 2/3/4 ни при 1280×720, ни при 1024×600 — см. отчёт задачи).
  //
  // Поэтому легенда теперь НЕ элемент полотна: это отдельная строка под
  // .canvas (см. Legend.module.css, .legendStrip в StageDetail.module.css).
  // Здесь это проверяется на всех 4 этапах и в обоих размерах окна, по ВСЕМ
  // узлам полотна (не только data), а не по одному стечению обстоятельств.
  for (const stageIndex of [0, 1, 2, 3]) {
    for (const size of VIEWPORT_SIZES) {
      test(`легенда не перекрывает ни один узел полотна: этап ${stageIndex + 1} (${size.name})`, async ({
        page,
      }) => {
        await page.setViewportSize(size);
        await page.goto('/');
        await openStage(page, stageIndex);
        await assertLegendDoesNotOverlapCanvas(page);
      });
    }
  }

  // Честный ответ на «а что после панорамирования» (см. задание к ревью):
  // легенда — строка ПОД .canvas, а не панель НАД ним, а сам React Flow
  // клиппует своё содержимое собственным overflow:hidden (см. комментарий
  // в Legend.module.css). Поэтому пан/зум ВНУТРИ полотна не может визуально
  // вынести содержимое за его нижнюю границу — гарантия структурная, не
  // «пока не потрогали». Проверяется явно: тащим полотно мышью далеко вверх
  // (открывая содержимое снизу раскладки) и пересчитываем то же пересечение.
  test('легенда не перекрывается и после панорамирования мышью (этап 4)', async ({ page }) => {
    await page.goto('/');
    await openStage(page, 3);

    const pane = page.locator('.react-flow__pane');
    const box = await pane.boundingBox();
    expect(box).not.toBeNull();
    if (box === null) {
      return;
    }
    const startX = box.x + box.width / 2;
    const startY = box.y + box.height / 2;
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    // Большой перенос вверх и в стороны — заведомо избыточный пан, чтобы
    // раскладка сдвинулась максимально далеко от исходного положения.
    await page.mouse.move(startX - 400, startY - 500, { steps: 15 });
    await page.mouse.up();
    await page.waitForTimeout(200);

    await assertLegendDoesNotOverlapCanvas(page);
  });
});
