// Сквозной сценарий SPEC §7 и стыки экранов между собой (задача process-map-3yr).
//
// Зачем отдельный файл. Остальные e2e проверяют по одному переходу каждый:
// overview.spec.ts — обзор, stage-detail.spec.ts — уровень 2, node-drawer.spec.ts —
// панель, toolbar.spec.ts — тулбар. Каждый из них стартует с чистой страницы,
// поэтому ни один не проходит путь целиком и ни один не видит состояний, которые
// возникают ТОЛЬКО при наложении экранов друг на друга: открытая панель + тулбар,
// открытая панель + смена уровня. Именно там ломалось (см. отчёт задачи: панель
// целиком накрывала тулбар).
//
// Открытие ссылки (window.open) здесь НЕ проверяется: utils/url.ts::openScreen —
// задача process-map-lfj (M3, SPEC §4.8), кнопка «Открыть в модуле» пока
// заглушка. Проверяется то, что уже обязано работать: кнопка активна при
// наличии ссылки и физически доступна мышью и с клавиатуры.
import { expect, test, type Page } from '@playwright/test';

const VIEWPORT = { width: 1280, height: 720 };

/** Ключ и формат overrides — SPEC §3, src/data/schema.ts. */
const OVERRIDES_KEY = 'inplan-process-map:overrides:v1';

/** Ссылка, которую подкладываем узлу штатным путём (в process.json screen пуст). */
const SCREEN_LINK = {
  title: 'Планирование поставок › Объёмный план',
  url: 'https://example.com/plan',
};

/** Индекс этапа 2 в обзоре — сценарий SPEC §7 идёт именно через него. */
const STAGE_2_INDEX = 1;

/** Ждёт стартовый вьюпорт уровня 2: он ставится в useEffect после измерения полотна. */
async function waitForStartViewport(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const viewport = document.querySelector('.react-flow__viewport') as HTMLElement | null;
    return Number(/scale\(([^)]+)\)/.exec(viewport?.style.transform ?? '')?.[1] ?? '0') > 0.5;
  });
}

/** Настоящий клик мышью по центру локатора. */
async function clickCenter(page: Page, locator: ReturnType<Page['locator']>): Promise<void> {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.click(
    (box?.x ?? 0) + (box?.width ?? 0) / 2,
    (box?.y ?? 0) + (box?.height ?? 0) / 2,
  );
}

/** Переход обзор → детализация настоящим кликом мыши по карточке этапа. */
async function openStage(page: Page, index: number): Promise<void> {
  await page.waitForSelector('.react-flow__node-stage');
  await clickCenter(page, page.locator('.react-flow__node-stage button').nth(index));
  await page.waitForSelector('.react-flow__node-step');
  await waitForStartViewport(page);
}

/** Масштаб вьюпорта React Flow из transform контейнера .react-flow__viewport. */
async function viewportZoom(page: Page): Promise<number> {
  return page.evaluate(() => {
    const viewport = document.querySelector('.react-flow__viewport') as HTMLElement | null;
    return Number(/scale\(([^)]+)\)/.exec(viewport?.style.transform ?? '')?.[1] ?? '0');
  });
}

/**
 * Что реально лежит в точке — так проверяется доступность кнопки мышью.
 * `toBeVisible()` этого не показывает: перекрытый элемент остаётся «видимым».
 */
async function labelAtCenter(
  page: Page,
  locator: ReturnType<Page['locator']>,
): Promise<string | null> {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  return page.evaluate(
    ({ x, y }) =>
      document.elementFromPoint(x, y)?.closest('button')?.getAttribute('aria-label') ?? null,
    { x: (box?.x ?? 0) + (box?.width ?? 0) / 2, y: (box?.y ?? 0) + (box?.height ?? 0) / 2 },
  );
}

/**
 * Открывает этап 2 один раз, чтобы узнать id первого шага, и подкладывает ему
 * ссылку через overrides — тем же путём, каким её положит редактор M3
 * (SPEC §4.4, накладывает src/data/loader.ts). addInitScript ставит запись ДО
 * загрузки приложения, поэтому после возврата страница чистая: сквозной путь
 * ниже идёт подряд, без перезагрузок посередине.
 */
async function seedScreenLinkOnFirstStep(page: Page): Promise<string> {
  await page.goto('/');
  await openStage(page, STAGE_2_INDEX);
  const stepId = await page.locator('.react-flow__node-step').first().getAttribute('data-id');
  expect(stepId, 'у этапа 2 не нашлось ни одного узла-шага').not.toBeNull();

  await page.addInitScript(
    ({ key, id, screen }) => {
      window.localStorage.setItem(key, JSON.stringify({ [id]: { screen } }));
    },
    { key: OVERRIDES_KEY, id: stepId ?? '', screen: SCREEN_LINK },
  );
  return stepId ?? '';
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize(VIEWPORT);
});

// ───────────────────────── сквозной сценарий SPEC §7 ─────────────────────────

test('обзор → этап 2 → шаг → Drawer → «Открыть в модуле»', async ({ page }) => {
  const stepId = await seedScreenLinkOnFirstStep(page);

  // 1. Обзор (SPEC §4.1): шапка, 4 карточки этапов, уровня 2 на экране нет.
  await page.goto('/');
  await page.waitForSelector('.react-flow__node-stage');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByText('4 этапа')).toBeVisible();
  await expect(page.locator('.react-flow__node-stage')).toHaveCount(4);
  await expect(page.getByRole('dialog')).toHaveCount(0);

  // 2. Этап 2 (SPEC §4.2): переход настоящим кликом мыши по карточке.
  const stageCard = page.locator('.react-flow__node-stage button').nth(STAGE_2_INDEX);
  await expect(stageCard).toHaveAttribute('aria-label', /^Этап 2: /);
  await clickCenter(page, stageCard);
  await page.waitForSelector('.react-flow__node-step');
  await waitForStartViewport(page);
  await expect(page.getByText('E2E-процесс')).toBeVisible();
  await expect(page.getByText('Этап 2', { exact: true })).toBeVisible();
  await expect(page.locator('.react-flow__node-stage')).toHaveCount(0);

  // 3. Шаг: карточка выбирается настоящим кликом, а не fireEvent.
  const stepCard = page.locator(`[data-id="${stepId}"] button`).first();
  const stepLabel = await stepCard.locator('span').first().textContent();
  await expect(stepCard).not.toHaveAttribute('aria-current', 'true');
  await clickCenter(page, stepCard);
  await expect(stepCard).toHaveAttribute('aria-current', 'true');

  // 4. Drawer (SPEC §4.3): панель 360 справа, имя = label узла, полотно затемнено.
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('heading', { level: 2 })).toHaveText(stepLabel ?? '');
  const dialogBox = await dialog.boundingBox();
  expect(Math.round(dialogBox?.width ?? 0)).toBe(360);
  expect(
    await page.evaluate(
      () => document.elementFromPoint(200, 400)?.getAttribute('data-testid') ?? null,
    ),
  ).toBe('drawer-scrim');

  // 5. «Экран в системе» показывает подложенную ссылку (SPEC §4.3).
  await expect(dialog.getByText(SCREEN_LINK.title)).toBeVisible();
  await expect(dialog.getByText(SCREEN_LINK.url)).toBeVisible();
  await expect(dialog.getByText('Ссылка не задана')).toHaveCount(0);

  // 6. «Открыть в модуле»: активна и физически доступна — мышью (в её точке
  //    лежит она сама, а не другой слой) и с клавиатуры (Tab-ловушка панели её
  //    достигает). Само открытие ссылки — process-map-lfj (M3, SPEC §4.8).
  const openInModule = dialog.getByRole('button', { name: 'Открыть в модуле' });
  await expect(openInModule).toBeEnabled();
  await expect(openInModule).toHaveAttribute('title', 'Открыть в модуле');
  await openInModule.focus();
  expect(await page.evaluate(() => document.activeElement?.textContent ?? null)).toBe(
    'Открыть в модуле',
  );
  await clickCenter(page, openInModule);
  // Заглушка не должна ни ронять приложение, ни закрывать панель.
  await expect(dialog).toBeVisible();
  await expect(stepCard).toHaveAttribute('aria-current', 'true');
});

// ──────────────── стыки: открытая панель + остальной интерфейс ────────────────

test.describe('открытая панель не отменяет остальной интерфейс', () => {
  /**
   * Открывает панель на первом ОБЫЧНОМ шаге этапа 2 и возвращает его data-id.
   *
   * Именно «Шаг:», а не первый `.react-flow__node-step`: этим же типом узла
   * React Flow рисует и интеграции (см. StepNode.tsx), и на этапе 2 первым в
   * DOM идёт как раз интеграция. Узел-интеграция исчезает с полотна вместе с
   * toggle — для проверок «панель пережила действие тулбара» нужен узел,
   * который никуда не девается. Случай интеграции проверяется отдельно ниже.
   */
  async function openDrawerOnFirstStep(page: Page): Promise<string> {
    await page.goto('/');
    await openStage(page, STAGE_2_INDEX);

    // Берётся первая карточка, ЦЕЛИКОМ видимая на полотне: клик идёт настоящей
    // мышью по координатам, а раскладка этапа 2 — 3942×1088, и в окне 1024×600
    // большинство карточек лежит за краем полотна (React Flow клиппует своё
    // содержимое overflow:hidden), включая все обычные шаги.
    // Интеграции исключены намеренно: они исчезают вместе с toggle, а этим
    // проверкам нужен узел, который переживает действия тулбара (случай
    // интеграции — отдельный тест ниже).
    const stepId = await page.evaluate(() => {
      const canvas = document.querySelector('.react-flow')?.getBoundingClientRect();
      if (canvas === undefined) {
        return null;
      }
      for (const button of document.querySelectorAll('.react-flow__node button[aria-label]')) {
        if (button.getAttribute('aria-label')?.startsWith('Интеграция:') === true) {
          continue;
        }
        const rect = button.getBoundingClientRect();
        if (
          rect.left >= canvas.left &&
          rect.right <= canvas.right &&
          rect.top >= canvas.top &&
          rect.bottom <= canvas.bottom
        ) {
          return button.closest('.react-flow__node')?.getAttribute('data-id') ?? null;
        }
      }
      return null;
    });
    expect(stepId, 'на полотне этапа 2 не видно ни одной не-интеграционной карточки').not.toBeNull();

    await clickCenter(page, page.locator(`[data-id="${stepId ?? ''}"] button`).first());
    await expect(page.getByRole('dialog')).toBeVisible();
    return stepId ?? '';
  }

  // Дефект, найденный этой задачей: панель (360 справа, z-index 5, в DOM позже
  // тулбара) накрывала тулбар целиком — на 1280×720 он занимает x 923…1259,
  // панель 920…1280. Ни одна кнопка SPEC §4.6 при открытой панели не была
  // доступна: мышью перекрыты, с клавиатуры Tab заперт внутри диалога.
  // Оба размера окна из SPEC — обычный и компактный (§4.5): в узком окне
  // сдвинутому тулбару остаётся меньше места, и он мог бы уехать за левый край.
  for (const size of [
    { name: '1280x720', width: 1280, height: 720 },
    { name: '1024x600', width: 1024, height: 600 },
  ] as const) {
    test(`кнопки тулбара доступны мышью, пока панель открыта (${size.name})`, async ({ page }) => {
      await page.setViewportSize(size);
      await openDrawerOnFirstStep(page);

      const dialogBox = await page.getByRole('dialog').boundingBox();
      expect(dialogBox).not.toBeNull();

      for (const name of ['Показать интеграции', 'Уменьшить', 'Увеличить', 'Уместить в экран']) {
        const control = page.getByRole(name === 'Показать интеграции' ? 'switch' : 'button', {
          name,
        });
        const box = await control.boundingBox();
        expect(box, `кнопка «${name}» не отрисована`).not.toBeNull();
        // Кнопка целиком левее панели — её не за что перекрыть, — и не уехала
        // за левый край окна.
        expect(box?.x ?? -1, `кнопка «${name}» вышла за левый край окна`).toBeGreaterThanOrEqual(0);
        expect(
          (box?.x ?? 0) + (box?.width ?? 0),
          `кнопка «${name}» заходит под панель`,
        ).toBeLessThanOrEqual(dialogBox?.x ?? 0);
        // И в её точке лежит именно она, а не затемнение или панель.
        expect(
          await labelAtCenter(page, control),
          `в точке кнопки «${name}» лежит другой слой`,
        ).toBe(name);
      }
    });
  }

  test('зум тулбаром при открытой панели работает и панель не закрывает', async ({ page }) => {
    const stepId = await openDrawerOnFirstStep(page);
    const dialog = page.getByRole('dialog');

    const before = await viewportZoom(page);
    await clickCenter(page, page.getByRole('button', { name: 'Увеличить' }));
    await page.waitForTimeout(300);
    const afterZoomIn = await viewportZoom(page);
    expect(afterZoomIn).toBeGreaterThan(before);
    await expect(page.getByText(`${Math.round(afterZoomIn * 100)}%`)).toBeVisible();

    await clickCenter(page, page.getByRole('button', { name: 'Уменьшить' }));
    await page.waitForTimeout(300);
    expect(await viewportZoom(page)).toBeLessThan(afterZoomIn);

    // Панель — не элемент полотна: зум её не двигает и не закрывает,
    // выбранный узел остаётся выбранным.
    await expect(dialog).toBeVisible();
    expect(Math.round((await dialog.boundingBox())?.width ?? 0)).toBe(360);
    await expect(page.locator(`[data-id="${stepId}"] button[aria-current="true"]`)).toHaveCount(1);
  });

  test('toggle «Показать интеграции» при открытой панели прячет интеграции, панель остаётся', async ({
    page,
  }) => {
    const stepId = await openDrawerOnFirstStep(page);
    const dialog = page.getByRole('dialog');
    const title = await dialog.getByRole('heading', { level: 2 }).textContent();

    // Этап 2 — единственный с несколькими узлами-интеграциями (см. process.json).
    const integrationCards = page.locator(
      '.react-flow__node-step button[aria-label^="Интеграция:"]',
    );
    const before = await integrationCards.count();
    expect(before).toBeGreaterThan(0);

    const toggle = page.getByRole('switch', { name: 'Показать интеграции' });
    await clickCenter(page, toggle);
    await expect(toggle).toHaveAttribute('aria-checked', 'false');
    await expect(integrationCards).toHaveCount(0);

    // Пересборка графа не должна ронять панель и терять подсветку узла
    // (store: toggleIntegrations не трогает selectedNodeId).
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('heading', { level: 2 })).toHaveText(title ?? '');
    await expect(page.locator(`[data-id="${stepId}"] button[aria-current="true"]`)).toHaveCount(1);

    await clickCenter(page, toggle);
    await expect(integrationCards).toHaveCount(before);
    await expect(dialog).toBeVisible();
  });

  // Дефект, найденный этой задачей (он же уронил тест выше, когда тот брал
  // первый `.react-flow__node-step` — им на этапе 2 оказалась интеграция):
  // toggle убирал карточку узла-интеграции с полотна, а панель с его описанием
  // оставалась висеть — без подсветки узла, поверх пустого затемнения, и с
  // некуда-возвращать фокусом при закрытии. Теперь панель получает только
  // отрисованные узлы (StageDetail.tsx) и уходит вместе со своим узлом.
  test('панель узла-интеграции уходит вместе с ним и возвращается вместе с ним', async ({
    page,
  }) => {
    await page.goto('/');
    await openStage(page, STAGE_2_INDEX);

    const integrationCard = page
      .locator('.react-flow__node-step button[aria-label^="Интеграция:"]')
      .first();
    await expect(integrationCard).toBeVisible();
    const nodeId = await integrationCard.evaluate(
      (el) => el.closest('.react-flow__node')?.getAttribute('data-id') ?? null,
    );
    await clickCenter(page, integrationCard);

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    const title = await dialog.getByRole('heading', { level: 2 }).textContent();

    const toggle = page.getByRole('switch', { name: 'Показать интеграции' });
    await clickCenter(page, toggle);

    await expect(page.locator(`[data-id="${nodeId}"]`)).toHaveCount(0);
    await expect(dialog).toHaveCount(0);
    // Затемнения тоже быть не должно — иначе полотно осталось бы приглушённым
    // без единой причины на экране.
    await expect(page.locator('[data-testid="drawer-scrim"]')).toHaveCount(0);

    // Toggle обратим целиком: узел вернулся — вернулась и его панель.
    await clickCenter(page, toggle);
    await expect(page.locator(`[data-id="${nodeId}"]`)).toHaveCount(1);
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('heading', { level: 2 })).toHaveText(title ?? '');
  });

  test('«Назад» при открытой панели уводит на обзор, и панель не всплывает снова', async ({
    page,
  }) => {
    await openDrawerOnFirstStep(page);

    // Крошки лежат ВЫШЕ .canvas, поэтому затемнение до них не достаёт и кнопка
    // остаётся кликабельной — проверяется настоящим кликом, а не .click() по DOM.
    const back = page.getByRole('button', { name: 'Назад к обзору процесса' });
    expect(await labelAtCenter(page, back)).toBe('Назад к обзору процесса');
    await clickCenter(page, back);

    await expect(page.locator('.react-flow__node-stage')).toHaveCount(4);
    await expect(page.getByRole('dialog')).toHaveCount(0);

    // store.back() сбрасывает selectedNodeId — повторный вход в этап 2 не должен
    // открывать панель «по памяти» (проверено в store.test.ts, здесь — на экране).
    await openStage(page, STAGE_2_INDEX);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.locator('[aria-current="true"]')).toHaveCount(0);
  });

  test('смена этапа при открытой панели: панель не переезжает на новый этап', async ({ page }) => {
    await openDrawerOnFirstStep(page);

    await clickCenter(page, page.getByRole('button', { name: 'Назад к обзору процесса' }));
    await page.waitForSelector('.react-flow__node-stage');
    await openStage(page, 2);

    await expect(page.getByText('Этап 3', { exact: true })).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    // Тулбар вернулся в правый верхний угол — сдвиг снимается вместе с панелью.
    const toolbarBox = await page.getByRole('button', { name: 'Уместить в экран' }).boundingBox();
    expect((toolbarBox?.x ?? 0) + (toolbarBox?.width ?? 0)).toBeGreaterThan(VIEWPORT.width - 40);
  });
});
