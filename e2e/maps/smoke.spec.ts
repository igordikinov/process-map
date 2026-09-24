// Смоук карты: единственный спек, который гоняется для КАЖДОЙ карты
// (задача process-map-3wh.3).
//
// ЗАЧЕМ ОН ОДИН. Остальные десять спеков — про механику интерфейса, и второй
// прогон их для другой карты не добавляет сигнала, зато добавляет времени и
// новый класс падений: они содержат подписи и id узлов SNP дословно. Поэтому
// они лежат вне e2e/maps/ и гоняются только для карты по умолчанию, а сюда
// вынесено то, что обязано работать на любой карте.
//
// ВСЁ, ЧТО ЗАВИСИТ ОТ КАРТЫ, берётся из e2e/maps/expected.ts по имени проекта
// Playwright. Литералов вроде «Модуль SNP» здесь быть не должно.
import { expect, test } from '../fixtures';
import { expectationsFor } from './expected';

const VIEWPORT = { width: 1280, height: 720 };

test.beforeEach(async ({ page }) => {
  await page.setViewportSize(VIEWPORT);
  await page.goto('/');
  await page.waitForSelector('.react-flow__node-stage');
});

test('обзор: шапка, четыре карточки этапов, дата', async ({ page }) => {
  // Здесь же ловится дефект относительных путей к ассетам (base: './'): при
  // нерабочем base бандл не загрузился бы и полотно осталось бы пустым.
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  /*
   * Бейдж, а НЕ любой текст «4 этапа» (process-map-0c5.10): с появлением
   * переключателя версий в шапке живёт живая область скринридера со строкой
   * «Карта: Основные этапы, 4 этапа». Она 1×1 px с clip-path, но bounding box
   * у неё непустой, поэтому Playwright считает её видимой, и getByText без
   * уточнения резолвился в два элемента.
   */
  await expect(page.getByText('4 этапа', { exact: true })).toBeVisible();
  await expect(page.getByText(/^Обновлено /)).toBeVisible();
  await expect(page.locator('.react-flow__node-stage')).toHaveCount(4);
});

test('заголовок вкладки — заголовок этой карты', async ({ page }, testInfo) => {
  // Подставляется плагином сборки (vite.config.ts) из данных карты. Без этой
  // проверки промах подстановки был бы невидим: сборка осталась бы зелёной, а
  // на странице второй карты стоял бы заголовок первой.
  await expect(page).toHaveTitle(expectationsFor(testInfo.project.name).pageTitle);
});

test('поток этапов обведён рамкой с подписью своего модуля', async ({ page }, testInfo) => {
  const frame = page.locator('.react-flow__node-flowLane');
  await expect(frame).toHaveCount(1);
  await expect(frame).toHaveText(expectationsFor(testInfo.project.name).moduleLabel);
});

test('переход на уровень 2 и возврат кнопкой «Назад»', async ({ page }, testInfo) => {
  const expectations = expectationsFor(testInfo.project.name);
  const card = page.locator('.react-flow__node-stage button').first();
  await expect(card).toHaveAttribute('aria-label', /^Этап \d: /);

  // Настоящий клик мышью по центру, а не click() по локатору: React Flow
  // глушит pointer-events у обёртки узла, и синтетический клик доказывал бы
  // меньше (тот же приём в e2e/journey.spec.ts).
  const box = await card.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.click(
    (box?.x ?? 0) + (box?.width ?? 0) / 2,
    (box?.y ?? 0) + (box?.height ?? 0) / 2,
  );

  await page.waitForSelector('.react-flow__node-step');
  await expect(page.locator('.react-flow__node-stage')).toHaveCount(0);

  /*
   * Корень крошек — <span>, а не ссылка: назад ведёт отдельная кнопка слева
   * (Breadcrumbs.tsx).
   *
   * И он РАЗНЫЙ У РАЗНЫХ КАРТ (process-map-0c5.12). Раньше здесь стоял литерал
   * «E2E-процесс» с пометкой «подпись корня одинакова для всех карт» — она и
   * была дефектом: на карте MRP эта строка врала, а тест её же и закреплял.
   * Теперь ожидание берётся из таблицы карты, то есть в проекте mrp проверка
   * требует «Модуль MRP» и мутация «вернуть константу» её краснит.
   */
  await expect(page.getByText(expectations.moduleLabel)).toBeVisible();
  await page.getByRole('button', { name: 'Назад к обзору процесса' }).click();
  await expect(page.locator('.react-flow__node-stage')).toHaveCount(4);
});
