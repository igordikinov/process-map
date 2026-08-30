// e2e deep-link ?stage=&node= (SPEC §4.7, задача process-map-0y2).
//
// Смысл проверок именно в браузере, а не в юнит-тестах: настоящая адресная
// строка (page.goto с query), настоящий history API браузера (history.length
// нельзя ни подделать, ни осмысленно проверить в jsdom — jsdom не эмулирует
// полноценную навигацию по history так, чтобы длина росла реалистично) и
// настоящий цикл монтирования приложения (в отличие от повторных render()
// в одном jsdom-окне юнит-тестов, где window.location приходится вручную
// сбрасывать между тестами — см. tests/useDeepLink.test.tsx).
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

const VIEWPORT = { width: 1280, height: 720 };

// Фикстуры из process.json — стабильные id (SPEC §3: «id стабильны, по ним
// работают deep-link»).
const STAGE_2_NUMBER = 2;
const STAGE_2_NODE = 'raschet-potrebnosti-na-kazhdoy-lokacii-netting';
/**
 * Заголовок панели этого узла (label из process.json).
 *
 * Проверять только «панель открыта» мало: приложение обязано открыть панель
 * ИМЕННО запрошенного узла. Без этой проверки тест проходил бы и на реализации,
 * которая выбирает первый попавшийся узел этапа, — а порядок
 * navigateToStage → selectNode (см. useDeepLink.ts) ловится тогда лишь наполовину.
 */
const STAGE_2_NODE_LABEL = 'Расчет потребности на каждой локации (неттинг)';

/** Панель открыта ровно на узле STAGE_2_NODE: заголовок и подсветка карточки. */
async function expectDrawerOnStage2Node(page: Page): Promise<void> {
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('heading', { level: 2 })).toHaveText(STAGE_2_NODE_LABEL);
  await expect(page.locator(`[data-id="${STAGE_2_NODE}"] button[aria-current="true"]`)).toHaveCount(
    1,
  );
}

const STAGE_1_NUMBER = 1;

async function waitForOverview(page: Page): Promise<void> {
  await expect(page.locator('.react-flow__node-stage')).toHaveCount(4);
}

async function waitForStageDetail(page: Page): Promise<void> {
  await page.waitForSelector('.react-flow__node-step, .react-flow__node-data');
  await expect(page.locator('.react-flow__node-stage')).toHaveCount(0);
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize(VIEWPORT);
});

test('?stage=2 открывает сразу уровень 2 нужного этапа', async ({ page }) => {
  await page.goto(`/?stage=${STAGE_2_NUMBER}`);
  await waitForStageDetail(page);

  await expect(page.getByRole('button', { name: 'Назад к обзору процесса' })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('?stage=2&node=<id> открывает уровень 2 с открытым Drawer на узле', async ({ page }) => {
  await page.goto(`/?stage=${STAGE_2_NUMBER}&node=${STAGE_2_NODE}`);
  await waitForStageDetail(page);

  await expectDrawerOnStage2Node(page);
});

test.describe('устойчивость', () => {
  test('?stage=99 (несуществующий этап): открывается обзор, без падения', async ({ page }) => {
    await page.goto('/?stage=99');
    await waitForOverview(page);

    // URL нормализован: несуществующий deep-link не должен оставаться в адресе.
    expect(new URL(page.url()).search).toBe('');
  });

  test('?stage=abc (не число): открывается обзор, без падения', async ({ page }) => {
    await page.goto('/?stage=abc');
    await waitForOverview(page);
    expect(new URL(page.url()).search).toBe('');
  });

  test('?node=не-существует: открывается обзор, без падения', async ({ page }) => {
    await page.goto(
      '/?node=%D0%BD%D0%B5-%D1%81%D1%83%D1%89%D0%B5%D1%81%D1%82%D0%B2%D1%83%D0%B5%D1%82',
    );
    await waitForOverview(page);
    expect(new URL(page.url()).search).toBe('');
  });

  test('?node=<id> без stage: этап находится по узлу, Drawer открыт', async ({ page }) => {
    await page.goto(`/?node=${STAGE_2_NODE}`);
    await waitForStageDetail(page);

    await expectDrawerOnStage2Node(page);
    // URL синхронизирован обратно: node сам восстановил недостающий stage.
    const params = new URL(page.url()).searchParams;
    expect(params.get('stage')).toBe(String(STAGE_2_NUMBER));
    expect(params.get('node')).toBe(STAGE_2_NODE);
  });

  test('узел из другого этапа, чем stage: побеждает этап узла', async ({ page }) => {
    // Узел принадлежит этапу 2, но в query указан этап 1 — рассинхрон.
    await page.goto(`/?stage=${STAGE_1_NUMBER}&node=${STAGE_2_NODE}`);
    await waitForStageDetail(page);

    await expectDrawerOnStage2Node(page);
    const params = new URL(page.url()).searchParams;
    // Открылся именно этап узла (2), а не этап 1 из query.
    expect(params.get('stage')).toBe(String(STAGE_2_NUMBER));
  });

  test('?stage=&node= (пустые значения): открывается обзор, без падения', async ({ page }) => {
    await page.goto('/?stage=&node=');
    await waitForOverview(page);
    expect(new URL(page.url()).search).toBe('');
  });
});

test('история браузера не растёт при навигации внутри приложения', async ({ page }) => {
  await page.goto('/');
  await waitForOverview(page);

  const baseline = await page.evaluate(() => window.history.length);

  // Этап → шаг → Drawer → закрыть → назад к обзору: несколько навигаций
  // подряд, каждая из которых в App пишет URL через useDeepLink.
  const card = page.locator('.react-flow__node-stage button').nth(1);
  await card.click();
  await waitForStageDetail(page);

  // Именно карточка ШАГА (aria-label «Шаг: …»), а не первый попавшийся узел:
  // с задачи process-map-c18 стартовый вид привязан к первой карточке шага, и
  // колонка входных данных остаётся слева за кадром — кликнуть по ней нельзя.
  await page.locator('.react-flow__node-step button[aria-label^="Шаг: "]').first().click();
  await expect(page.getByRole('dialog')).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await page.getByRole('button', { name: 'Назад к обзору процесса' }).click();
  await waitForOverview(page);

  const afterNavigation = await page.evaluate(() => window.history.length);

  // SPEC §4.7: replaceState, не pushState — история родительской страницы
  // (в проде — вики, встраивающей приложение через iframe, SPEC §6) не растёт.
  expect(afterNavigation).toBe(baseline);

  // Прямая проверка «назад» браузера: после всей внутренней навигации кнопка
  // «назад» должна уводить туда, откуда пришли ДО открытия приложения (а не
  // на промежуточный внутренний экран) — история не засорена внутренними шагами.
  await page.goBack({ waitUntil: 'commit' }).catch(() => {
    // Нет предыдущей записи в истории вкладки — это тоже ожидаемо и
    // подтверждает отсутствие лишних записей от внутренней навигации.
  });
});

test('deep-link сразу на уровень 2 не создаёт лишней записи истории', async ({ page }) => {
  await page.goto(`/?stage=${STAGE_2_NUMBER}&node=${STAGE_2_NODE}`);
  await waitForStageDetail(page);

  const afterLoad = await page.evaluate(() => window.history.length);

  await page.getByRole('button', { name: 'Закрыть' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Назад к обзору процесса' }).click();
  await waitForOverview(page);

  const afterBack = await page.evaluate(() => window.history.length);
  expect(afterBack).toBe(afterLoad);
});
