// e2e компактного режима (SPEC §7, §4.5, артборд A4) и стартового вида
// уровня 2 (задачи process-map-5l3 и process-map-c18).
//
// Почему именно браузер:
//   · порог компактного режима — высота КОНТЕЙНЕРА, измеренная
//     ResizeObserver'ом; в jsdom layout не считается вовсе, и ни 44 px шапки,
//     ни 228×200 карточки там не проверить;
//   · «карточка шага попала в первый кадр» — это про реальный transform
//     полотна и реальные размеры узлов, а не про числа в чистой функции
//     (её проверяет tests/stageGraph.test.ts).
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

/** Артборд A4. Высота 600 < config.compactHeight (640). */
const COMPACT = { width: 1024, height: 600 };
/** Артборд A1. */
const FULL = { width: 1280, height: 720 };

/** SPEC §4.5 / src/theme/sizes.ts. */
const HEADER_HEIGHT = 52;
const HEADER_HEIGHT_COMPACT = 44;
const STAGE_CARD_COMPACT = { width: 228, height: 200 };

/** Собственный (нетрансформированный) размер элемента: полотно масштабируется. */
async function layoutSize(page: Page, selector: string): Promise<{ w: number; h: number }> {
  return page.evaluate((css) => {
    const el = document.querySelector(css);
    if (el === null) {
      throw new Error(`нет элемента ${css}`);
    }
    return { w: (el as HTMLElement).offsetWidth, h: (el as HTMLElement).offsetHeight };
  }, selector);
}

/**
 * Сколько карточек шага целиком видно в кадре.
 *
 * Клип по bbox `.react-flow`, а не по viewport страницы: полотно
 * панорамируется и масштабируется, и getBoundingClientRect узла отдаёт
 * координаты уже с учётом transform — но узел, уехавший за край полотна,
 * остаётся в DOM и «видимым» по меркам toBeVisible().
 *
 * Фильтр по aria-label «Шаг: …» — второй сторож поверх класса: до
 * process-map-73m `.react-flow__node-step` носили и интеграции, а задача
 * process-map-c18 ровно про то, что интеграции — не процесс.
 */
async function fullyVisibleSteps(page: Page): Promise<number> {
  return page.evaluate(() => {
    const canvas = document.querySelector('.react-flow');
    if (canvas === null) {
      return -1;
    }
    const frame = canvas.getBoundingClientRect();
    return [
      ...document.querySelectorAll('.react-flow__node-step:has(button[aria-label^="Шаг: "])'),
    ].filter((node) => {
      const rect = node.getBoundingClientRect();
      return (
        rect.width > 0 &&
        rect.left >= frame.left - 0.5 &&
        rect.top >= frame.top - 0.5 &&
        rect.right <= frame.right + 0.5 &&
        rect.bottom <= frame.bottom + 0.5
      );
    }).length;
  });
}

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
  // Ждём именно карточку ШАГА: до process-map-73m этот класс носили и
  // интеграции (см. fullyVisibleSteps выше), и ожидание по голому классу
  // завершалось на узле, который процессом не является.
  await page.waitForSelector('.react-flow__node-step button[aria-label^="Шаг: "]');
}

// ─────────────────────────── обзор, компактный режим ───────────────────────────

test.describe('компактный режим 1024×600 (артборд A4)', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(COMPACT);
    await page.goto('/');
    await page.waitForSelector('.react-flow__node-stage');
  });

  test('шапка 44 px и без даты обновления', async ({ page }) => {
    const header = await layoutSize(page, 'header');
    expect(header.h).toBe(HEADER_HEIGHT_COMPACT);

    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByText('4 этапа')).toBeVisible();
    await expect(page.getByText(/^Обновлено /)).toHaveCount(0);
  });

  test('карточки этапов 228×200 и ровно с двумя ключевыми выходами', async ({ page }) => {
    const cards = page.locator('.react-flow__node-stage button');
    await expect(cards).toHaveCount(4);

    const sizes = await page.evaluate(() =>
      [...document.querySelectorAll('.react-flow__node-stage button')].map((el) => ({
        w: (el as HTMLElement).offsetWidth,
        h: (el as HTMLElement).offsetHeight,
        outputs: el.querySelectorAll('li').length,
      })),
    );

    expect(sizes).toHaveLength(4);
    for (const card of sizes) {
      expect({ w: card.w, h: card.h }).toEqual({
        w: STAGE_CARD_COMPACT.width,
        h: STAGE_CARD_COMPACT.height,
      });
      expect(card.outputs).toBeLessThanOrEqual(2);
    }
    // У этапа 2 в данных три выхода — компактная карточка обязана показать два.
    expect(sizes[1]?.outputs).toBe(2);
  });

  test('свимлейнов нет, вместо них строка-бейдж внешних систем', async ({ page }) => {
    await expect(page.locator('.react-flow__node-lane')).toHaveCount(0);
    // Рамка вокруг потока этапов в компактном режиме тоже снята (process-map-sni).
    await expect(page.locator('.react-flow__node-flowLane')).toHaveCount(0);

    const badge = page.getByRole('group', { name: 'Внешние системы процесса' });
    await expect(badge).toBeVisible();
    await expect(badge).toContainText('Внешние системы');
    for (const code of ['DP', 'IO', 'PS', 'ERP', 'MRP']) {
      await expect(badge.getByText(code, { exact: true })).toBeVisible();
    }
  });

  test('легенда свёрнута в кнопку-иконку и раскрывается по клику', async ({ page }) => {
    const toggle = page.getByRole('button', { name: 'Показать условные обозначения' });
    await expect(toggle).toBeVisible();
    await expect(page.getByText('Процесс', { exact: true })).toHaveCount(0);

    await toggle.click();
    await expect(page.getByText('Процесс', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Скрыть условные обозначения' })).toBeVisible();
  });

  test('свёрнутая легенда остаётся вне полотна и не перекрывает его', async ({ page }) => {
    const overlap = await page.evaluate(() => {
      const canvas = document.querySelector('.react-flow')?.getBoundingClientRect();
      const legend = document
        .querySelector('[aria-label="Условные обозначения"]')
        ?.getBoundingClientRect();
      if (canvas === undefined || legend === undefined) {
        return null;
      }
      return legend.top >= canvas.bottom - 0.5;
    });
    expect(overlap).toBe(true);
  });

  test('карточки этапов остаются кликабельными: клик уводит на детализацию', async ({ page }) => {
    await openStage(page, 1);
    await expect(page.locator('.react-flow__node-stage')).toHaveCount(0);
    await expect(page.getByText('E2E-процесс')).toBeVisible();
  });

  test('шапка уровня 2 тоже 44 px', async ({ page }) => {
    await openStage(page, 0);
    const header = await layoutSize(page, 'header');
    expect(header.h).toBe(HEADER_HEIGHT_COMPACT);
  });
});

// ───────── переключение режима на живой странице (SPEC §4.5) ─────────
//
// Все проверки выше ставят размер окна ДО page.goto, поэтому компактный режим
// у них определяется одним синхронным измерением при монтировании
// (useFrameSize делает его до подписки). Из-за этого они проходили бы и на
// хуке, который вовсе не вызывает observer.observe(): наблюдения никто не
// проверял — ровно та дыра, что уже находилась в process-map-5l3 на уровне
// юнит-теста. Здесь размер меняется ПОСЛЕ загрузки, без reload, поэтому
// переключить раскладку может только настоящий ResizeObserver.
//
// Вторая половина проверки — «fitView вызывается заново» из SPEC §4.5
// (src/components/Overview/RefitViewport.tsx). Компактная раскладка другого
// размера и с другим составом узлов; без повторного fitView вид остаётся
// подогнанным под прежний режим и часть карточек этапов уходит за край
// полотна. Поэтому проверяется, что после переключения ВСЕ 4 карточки видны
// целиком.

/** Масштаб полотна из transform контейнера .react-flow__viewport. */
async function viewportZoom(page: Page): Promise<number> {
  return page.evaluate(() => {
    const viewport = document.querySelector('.react-flow__viewport') as HTMLElement | null;
    return Number(/scale\(([^)]+)\)/.exec(viewport?.style.transform ?? '')?.[1] ?? '0');
  });
}

/** Весь transform целиком: смена режима обязана его переписать. */
async function viewportTransform(page: Page): Promise<string | null> {
  return page.evaluate(
    () =>
      (document.querySelector('.react-flow__viewport') as HTMLElement | null)?.style.transform ??
      null,
  );
}

/** Сколько карточек этапов целиком помещается в рамку полотна. */
async function fullyVisibleStages(page: Page): Promise<number> {
  return page.evaluate(() => {
    const canvas = document.querySelector('.react-flow');
    if (canvas === null) {
      return -1;
    }
    const frame = canvas.getBoundingClientRect();
    return [...document.querySelectorAll('.react-flow__node-stage')].filter((node) => {
      const rect = node.getBoundingClientRect();
      return (
        rect.width > 0 &&
        rect.left >= frame.left - 0.5 &&
        rect.top >= frame.top - 0.5 &&
        rect.right <= frame.right + 0.5 &&
        rect.bottom <= frame.bottom + 0.5
      );
    }).length;
  });
}

test('уменьшение окна БЕЗ перезагрузки включает компактный режим и пересчитывает вид', async ({
  page,
}) => {
  await page.setViewportSize(FULL);
  await page.goto('/');
  await page.waitForSelector('.react-flow__node-stage');

  // Исходное состояние — обычный режим (артборд A1).
  expect((await layoutSize(page, 'header')).h).toBe(HEADER_HEIGHT);
  await expect(page.locator('.react-flow__node-lane')).toHaveCount(2);
  await expect(page.locator('.react-flow__node-flowLane')).toHaveCount(1);
  await expect(page.getByRole('group', { name: 'Внешние системы процесса' })).toHaveCount(0);

  const transformBefore = await viewportTransform(page);
  await page.setViewportSize(COMPACT);

  // Раскладка переключилась сама, без reload: сработал ResizeObserver.
  await expect.poll(async () => (await layoutSize(page, 'header')).h).toBe(HEADER_HEIGHT_COMPACT);
  await expect(page.locator('.react-flow__node-lane')).toHaveCount(0);
  await expect(page.locator('.react-flow__node-flowLane')).toHaveCount(0);
  await expect(page.getByRole('group', { name: 'Внешние системы процесса' })).toBeVisible();
  const compactCard = await page.evaluate(() => {
    const el = document.querySelector('.react-flow__node-stage button');
    return { w: (el as HTMLElement).offsetWidth, h: (el as HTMLElement).offsetHeight };
  });
  expect(compactCard).toEqual({ w: STAGE_CARD_COMPACT.width, h: STAGE_CARD_COMPACT.height });

  // И вид пересчитан под новую раскладку (SPEC §4.5: «fitView вызывается заново»).
  //
  // Проверяется не «все карточки видны» — это выполнялось и БЕЗ повторного
  // fitView (проверено мутацией: с убранным RefitViewport транзформ полотна
  // оставался байт в байт прежним, а карточки всё равно помещались в кадр).
  // Проверяется то, что действительно отличает пересчитанный вид от
  // непересчитанного:
  //   1) transform полотна изменился — прежний остался бы дословно тем же;
  //   2) вид УЖЕ подогнан: ручное «Уместить в экран» не меняет масштаб.
  //      Без повторного fitView масштаб здесь 0.974 (подогнан под раскладку
  //      обычного режима), а кнопка ставит 0.984 — разница видна сразу.
  await expect
    .poll(async () => viewportTransform(page), { timeout: 5000 })
    .not.toBe(transformBefore);
  await expect.poll(async () => fullyVisibleStages(page), { timeout: 5000 }).toBe(4);

  const zoomAfterSwitch = await viewportZoom(page);
  await page.getByRole('button', { name: 'Уместить в экран' }).click();
  await page.waitForTimeout(400);
  expect(Math.abs((await viewportZoom(page)) - zoomAfterSwitch)).toBeLessThan(0.002);

  // Возврат к прежнему размеру так же обратим — и тоже без перезагрузки.
  await page.setViewportSize(FULL);
  await expect.poll(async () => (await layoutSize(page, 'header')).h).toBe(HEADER_HEIGHT);
  await expect(page.locator('.react-flow__node-lane')).toHaveCount(2);
  await expect.poll(async () => fullyVisibleStages(page), { timeout: 5000 }).toBe(4);
});

// ───────────────────── обычный режим не задет компактным ─────────────────────

test.describe('обычный режим 1280×720 (артборд A1)', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(FULL);
    await page.goto('/');
    await page.waitForSelector('.react-flow__node-stage');
  });

  test('шапка 52 px, свимлейны на месте, строки-бейджа нет', async ({ page }) => {
    const header = await layoutSize(page, 'header');
    expect(header.h).toBe(HEADER_HEIGHT);

    await expect(page.locator('.react-flow__node-lane')).toHaveCount(2);
    await expect(page.getByRole('group', { name: 'Внешние системы процесса' })).toHaveCount(0);
    await expect(page.getByText(/^Обновлено /)).toBeVisible();
  });

  test('легенда развёрнута, кнопки-переключателя нет', async ({ page }) => {
    await expect(page.getByText('Процесс', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Показать условные обозначения' })).toHaveCount(
      0,
    );
  });
});

// ───────────── стартовый вид уровня 2: карточки шагов в первом кадре ─────────────

for (const [name, viewport] of [
  ['1280×720', FULL],
  ['1024×600', COMPACT],
] as const) {
  for (const index of [0, 1, 2, 3]) {
    test(`${name}: этап ${index + 1} открывается на карточках шагов`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto('/');
      await openStage(page, index);

      // Стартовый вид ставится после измерения полотна — ждём, пока он
      // применится (до этого вьюпорт нулевой и в кадре может быть пусто).
      await expect
        .poll(async () => fullyVisibleSteps(page), { timeout: 5000 })
        .toBeGreaterThanOrEqual(2);
    });
  }
}
