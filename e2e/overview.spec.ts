// e2e обзора уровня 1 (SPEC §7, §4.1).
//
// Смысл этих проверок — именно настоящий браузер: jsdom не делает hit-testing,
// поэтому дефект «React Flow глушит pointer-events у обёртки узла» юнит-тестом
// не ловится. Здесь клик идёт реальной мышью по координатам.
import { expect, test } from './fixtures';

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
  await expect(page.locator('.react-flow__node-flowLane')).toHaveCount(1);
  await expect(page.locator('.react-flow__node-system')).toHaveCount(8);
  await expect(page.locator('.react-flow__edge')).toHaveCount(9);
});

// Соседние блоки обзора подписаны, а сам процесс оставался безымянным
// (process-map-sni). Рамка вокруг потока этапов — третий контейнер того же
// стиля; проверяем и подпись, и то, что карточки этапов реально внутри неё.
test('поток этапов обведён рамкой «Модуль SNP», карточки внутри неё', async ({ page }) => {
  const frame = page.locator('.react-flow__node-flowLane');
  await expect(frame).toHaveCount(1);
  await expect(frame).toHaveText('Модуль SNP');

  const frameBox = await frame.boundingBox();
  expect(frameBox).not.toBeNull();

  const cards = page.locator('.react-flow__node-stage');
  await expect(cards).toHaveCount(4);
  for (let index = 0; index < 4; index += 1) {
    const box = await cards.nth(index).boundingBox();
    expect(box, `у карточки ${index} нет геометрии`).not.toBeNull();
    expect(box?.x ?? 0).toBeGreaterThanOrEqual(frameBox?.x ?? 0);
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(
      (frameBox?.x ?? 0) + (frameBox?.width ?? 0),
    );
    expect(box?.y ?? 0).toBeGreaterThan(frameBox?.y ?? 0);
    expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThan(
      (frameBox?.y ?? 0) + (frameBox?.height ?? 0),
    );
  }
});

// В данных label входа ERP дословно равен коду системы («ERP» — весь текст
// бокса [49] слайда 2), и карточка рисовалась на проде как «ERP ERP»
// (process-map-2od). Проверка идёт в браузере, а не юнит-тестом: IntegrationNode
// содержит <Handle>, которому нужен контекст React Flow.
test('карточка входа ERP показывает код один раз, соседние подписи целы', async ({ page }) => {
  // Дубля нет: подпись, повторяющая код, не рисуется.
  await expect(page.locator('[data-id="io-in-ERP"]')).toHaveText('ERP');

  // Контроль в другую сторону — осмысленные подписи никуда не делись, иначе
  // «дубля нет» было бы истинно и у карточки вообще без текста.
  await expect(page.locator('[data-id="io-in-DP"]')).toContainText(
    'Передача неограниченного плана спроса',
  );
});

// Полотно встроено в In.Plan, и в правом нижнем углу висела ссылка-attribution
// React Flow — посторонний бренд на демо клиентам (process-map-4hv). Убрана
// штатным proOptions.hideAttribution; проверка сторожит именно её отсутствие,
// потому что проп легко потерять при следующей правке пропов <ReactFlow>.
test('ссылка-attribution React Flow на полотне не отрисована', async ({ page }) => {
  await expect(page.locator('.react-flow__attribution')).toHaveCount(0);
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
  // Фильтр по aria-label — второй сторож поверх класса: до process-map-73m
  // `.react-flow__node-step` носили и интеграции, поэтому «виден хоть один
  // .react-flow__node-step» ещё не значило «виден процесс».
  await expect(
    page.locator('.react-flow__node-step button[aria-label^="Шаг: "]').first(),
  ).toBeVisible();
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
