// e2e редактора ссылки на экран (SPEC §4.4, §7, задача process-map-0sb).
//
// Главный сценарий задачи прямо назван в SPEC §7: «редактор: сохранить ссылку,
// перезагрузить, ссылка на месте». Он проверяется только здесь — юнит-тестом
// перезагрузку страницы не сыграть, а именно она отделяет «показали в панели»
// от «записали в localStorage в правильном формате».
//
// Вторая причина, по которой этот файл существует: jsdom не делает
// hit-testing (CLAUDE.md «Ловушки»). Форма живёт внутри панели ПОВЕРХ полотна
// React Flow, поэтому её поля и кнопки проверяются настоящей мышью и
// document.elementFromPoint, а не fireEvent.
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

const VIEWPORT = { width: 1280, height: 720 };

/** Ключ и формат overrides — SPEC §3, src/data/schema.ts. */
const OVERRIDES_KEY = 'inplan-process-map:overrides:v1';

/**
 * Карточка ШАГА. До process-map-73m этот класс носили и интеграции, а сценарий
 * SPEC §7 («редактор: сохранить ссылку, перезагрузить») должен идти по шагу
 * процесса, а не по тому, что первым попало в DOM.
 * Фильтр по aria-label оставлен вторым, независимым сторожем: класс приходит
 * из stageGraph.ts, подпись — из i18n, и поломка одного не отключает оба.
 */
const STEP_CARD = '.react-flow__node-step button[aria-label^="Шаг: "]';

const LINK = {
  title: 'Планирование поставок › Объёмный план',
  url: 'https://example.com/plan',
};

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
  await page.waitForSelector(STEP_CARD);
  // Стартовый вьюпорт ставится в useEffect после измерения полотна.
  await page.waitForFunction(() => {
    const viewport = document.querySelector('.react-flow__viewport') as HTMLElement | null;
    return Number(/scale\(([^)]+)\)/.exec(viewport?.style.transform ?? '')?.[1] ?? '0') > 0.5;
  });
}

/** Настоящий клик мышью по центру карточки узла. */
async function clickNode(page: Page, nodeId: string): Promise<void> {
  // .first(): при заданной screen у карточки появляется вторая кнопка —
  // иконка link-external (SPEC §4.2). Нужна именно карточка, она идёт первой.
  const card = page.locator(`[data-id="${nodeId}"] button`).first();
  const box = await card.boundingBox();
  expect(box, `узел ${nodeId} не найден на экране`).not.toBeNull();
  await page.mouse.click(
    (box?.x ?? 0) + (box?.width ?? 0) / 2,
    (box?.y ?? 0) + (box?.height ?? 0) / 2,
  );
}

/**
 * Открывает панель узла, только если она ещё не открыта.
 *
 * Нужен именно после page.reload(): если панель была открыта ДО перезагрузки,
 * deep-link (?stage=&node=…, SPEC §4.7, process-map-0y2) сам восстанавливает
 * её при монтировании. Безусловный повторный clickNode() в этот момент попал
 * бы не по карточке, а по затемнению — scrim перекрывает ВСЁ полотно целиком
 * (см. e2e/node-drawer.spec.ts: клик по (200,400) закрывает панель, хотя это
 * далеко от самой панели) — и закрыл бы уже открытую панель вместо того,
 * чтобы оставить её открытой.
 */
async function ensureDrawerOpen(page: Page, nodeId: string): Promise<void> {
  if (await page.getByRole('dialog').isVisible()) {
    return;
  }
  await clickNode(page, nodeId);
  await expect(page.getByRole('dialog')).toBeVisible();
}

/** Включает режим «Редактор» (SPEC §4.4) настоящим кликом по тулбару. */
async function enterEditMode(page: Page): Promise<void> {
  const button = page.getByRole('button', { name: 'Редактор', exact: true });
  await button.click();
  await expect(button).toHaveAttribute('aria-pressed', 'true');
}

/** id первой карточки ШАГА на полотне уровня 2 (не интеграции, не данных). */
async function firstStepId(page: Page): Promise<string> {
  const stepId = await page
    .locator(STEP_CARD)
    .first()
    .evaluate((el) => el.closest('.react-flow__node')?.getAttribute('data-id') ?? null);
  expect(stepId, 'на полотне нет ни одной карточки шага').not.toBeNull();
  return stepId ?? '';
}

/** Открывает панель первого шага этапа 1 и возвращает его data-id. */
async function openFirstStep(page: Page): Promise<string> {
  await openStage(page, 0);
  const stepId = await firstStepId(page);
  await clickNode(page, stepId);
  await expect(page.getByRole('dialog')).toBeVisible();
  return stepId;
}

/** Что лежит в overrides сейчас (сырое значение: null и «нет записи» различаются). */
async function storedOverrides(page: Page): Promise<unknown> {
  return page.evaluate((key) => {
    const raw = window.localStorage.getItem(key);
    return raw === null ? null : (JSON.parse(raw) as unknown);
  }, OVERRIDES_KEY);
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize(VIEWPORT);
});

test('сохранённая ссылка переживает перезагрузку страницы (SPEC §7)', async ({ page }) => {
  await page.goto('/');
  await enterEditMode(page);
  const stepId = await openFirstStep(page);

  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Добавить' }).click();
  await dialog.getByLabel('Название экрана').fill(LINK.title);
  await dialog.getByLabel('URL', { exact: true }).fill(LINK.url);
  await dialog.getByRole('button', { name: 'Сохранить' }).click();

  // Форма закрылась, ссылка видна сразу — без перезагрузки (реактивность).
  await expect(dialog.getByLabel('Название экрана')).toHaveCount(0);
  await expect(dialog.getByText(LINK.title)).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Открыть в модуле' })).toBeEnabled();

  // ── главная проверка задачи: перезагрузка ───────────────────────────────
  await page.reload();
  await waitForStageDetailReady(page);
  await ensureDrawerOpen(page, stepId);

  const reloaded = page.getByRole('dialog');
  await expect(reloaded.getByText(LINK.title)).toBeVisible();
  await expect(reloaded.getByText(LINK.url)).toBeVisible();
  await expect(reloaded.getByText('Ссылка не задана')).toHaveCount(0);
  await expect(reloaded.getByRole('button', { name: 'Открыть в модуле' })).toBeEnabled();

  // И запись в хранилище — ровно в формате SPEC §3.
  expect(await storedOverrides(page)).toEqual({ [stepId]: { screen: LINK } });
});

test('ссылка появляется на карточке шага иконкой link-external без перезагрузки', async ({
  page,
}) => {
  await page.goto('/');
  await enterEditMode(page);
  const stepId = await openFirstStep(page);

  const card = page.locator(`[data-id="${stepId}"]`);
  // До сохранения у карточки одна кнопка — она сама (SPEC §4.2).
  await expect(card.locator('button')).toHaveCount(1);

  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Добавить' }).click();
  await dialog.getByLabel('Название экрана').fill(LINK.title);
  await dialog.getByLabel('URL', { exact: true }).fill(LINK.url);
  await dialog.getByRole('button', { name: 'Сохранить' }).click();

  // Полотно перерисовалось от той же записи в localStorage: два источника
  // истины разъехались бы именно здесь.
  await expect(card.locator('button')).toHaveCount(2);
  await expect(
    card.getByRole('button', { name: `Открыть экран в In.Plan: ${LINK.title}` }),
  ).toBeVisible();
});

test('удалённая ссылка не возвращается после перезагрузки', async ({ page }) => {
  await page.goto('/');
  await openStage(page, 0);
  const stepId = await firstStepId(page);

  // Ссылка уже есть — кладём её штатным путём, через overrides.
  await page.evaluate(
    ({ key, id, link }) => {
      window.localStorage.setItem(key, JSON.stringify({ [id]: { screen: link } }));
    },
    { key: OVERRIDES_KEY, id: stepId, link: LINK },
  );
  await page.reload();
  await enterEditMode(page);
  await waitForStageDetailReady(page);
  await ensureDrawerOpen(page, stepId);

  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText(LINK.title)).toBeVisible();
  await dialog.getByRole('button', { name: 'Изменить' }).click();
  await dialog.getByRole('button', { name: 'Удалить ссылку' }).click();
  await expect(dialog.getByText('Ссылка не задана')).toBeVisible();

  // В хранилище остаётся ЗАПИСЬ со screen: null — это «пользователь удалил
  // ссылку», а не «правок нет» (три состояния override, SPEC §3 и loader.ts).
  expect(await storedOverrides(page)).toEqual({ [stepId]: { screen: null } });

  await page.reload();
  await waitForStageDetailReady(page);
  await ensureDrawerOpen(page, stepId);

  const reloaded = page.getByRole('dialog');
  await expect(reloaded.getByText('Ссылка не задана')).toBeVisible();
  await expect(reloaded.getByText(LINK.title)).toHaveCount(0);
  await expect(reloaded.getByRole('button', { name: 'Открыть в модуле' })).toBeDisabled();
  // Запись после перезагрузки не «схлопнулась» в отсутствие записи.
  expect(await storedOverrides(page)).toEqual({ [stepId]: { screen: null } });
});

test('режим не персистится: после перезагрузки снова «Просмотр» (SPEC §4.4)', async ({ page }) => {
  await page.goto('/');
  await enterEditMode(page);

  await page.reload();

  await expect(page.getByRole('button', { name: 'Просмотр', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByRole('button', { name: 'Редактор', exact: true })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  // Хранилище чистое: режим нигде не записан.
  expect(await storedOverrides(page)).toBeNull();
});

test('поля и кнопки формы доступны настоящей мышью, а не только «видимы»', async ({ page }) => {
  await page.goto('/');
  await enterEditMode(page);
  await openFirstStep(page);

  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Добавить' }).click();

  // Перекрытый элемент остаётся toBeVisible() — поэтому проверяем, что в
  // точке поля лежит именно поле, и печатаем настоящей клавиатурой после
  // клика мышью (без .fill(), который ставит значение программно).
  const input = dialog.getByLabel('Название экрана');
  const box = await input.boundingBox();
  expect(box).not.toBeNull();
  const point = {
    x: (box?.x ?? 0) + (box?.width ?? 0) / 2,
    y: (box?.y ?? 0) + (box?.height ?? 0) / 2,
  };
  const tagAtPoint = await page.evaluate(
    ({ x, y }) => document.elementFromPoint(x, y)?.tagName ?? null,
    point,
  );
  expect(tagAtPoint).toBe('INPUT');

  await page.mouse.click(point.x, point.y);
  await page.keyboard.type('Объёмный план');
  await expect(input).toHaveValue('Объёмный план');

  // Кнопка «Сохранить» тоже не перекрыта.
  const saveBox = await dialog.getByRole('button', { name: 'Сохранить' }).boundingBox();
  const saveTag = await page.evaluate(
    ({ x, y }) => document.elementFromPoint(x, y)?.textContent ?? null,
    {
      x: (saveBox?.x ?? 0) + (saveBox?.width ?? 0) / 2,
      y: (saveBox?.y ?? 0) + (saveBox?.height ?? 0) / 2,
    },
  );
  expect(saveTag).toBe('Сохранить');
});

test('невалидный URL: клик по «Сохранить» не пишет override и показывает ошибку', async ({
  page,
}) => {
  await page.goto('/');
  await enterEditMode(page);
  await openFirstStep(page);

  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Добавить' }).click();
  await dialog.getByLabel('Название экрана').fill('Объёмный план');
  await dialog.getByLabel('URL', { exact: true }).fill('inplan/plan');
  await dialog.getByRole('button', { name: 'Сохранить' }).click();

  await expect(dialog.getByText('Введите корректный URL')).toBeVisible();
  // Форма не закрылась, в хранилище пусто.
  await expect(dialog.getByLabel('URL', { exact: true })).toBeVisible();
  expect(await storedOverrides(page)).toBeNull();

  // http: — предупреждение, а не ошибка: сохранение проходит (SPEC §4.4).
  await dialog.getByLabel('URL', { exact: true }).fill('http://inplan.local/plan');
  await expect(dialog.getByText('Ссылка без шифрования (http). Рекомендуется https')).toBeVisible();
  await dialog.getByRole('button', { name: 'Сохранить' }).click();
  await expect(dialog.getByText('http://inplan.local/plan')).toBeVisible();
});

test('«Отмена» закрывает форму и ничего не записывает', async ({ page }) => {
  await page.goto('/');
  await enterEditMode(page);
  await openFirstStep(page);

  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Добавить' }).click();
  await dialog.getByLabel('Название экрана').fill(LINK.title);
  await dialog.getByLabel('URL', { exact: true }).fill(LINK.url);
  await dialog.getByRole('button', { name: 'Отмена' }).click();

  await expect(dialog.getByText('Ссылка не задана')).toBeVisible();
  expect(await storedOverrides(page)).toBeNull();
});
