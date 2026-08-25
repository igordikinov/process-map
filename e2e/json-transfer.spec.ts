// e2e экспорта/импорта JSON и «Сбросить правки» (SPEC §4.4, §7,
// задача process-map-6q0).
//
// Почему это проверяется именно здесь, а не юнит-тестом: скачивание файла
// (Blob-URL + <a download>) и настоящий выбор файла в <input type="file">
// в jsdom не воспроизводятся, а hit-testing jsdom не делает вовсе — кнопки
// тулбара уже один раз оказались полностью накрыты боковой панелью
// (CLAUDE.md «Ловушки»). Поэтому: настоящая мышь, document.elementFromPoint,
// перехват download и реальный setInputFiles.
//
// Контракт формата и round-trip на уровне функций — tests/loader.test.ts.
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

const VIEWPORT = { width: 1280, height: 720 };

/** Ключ overrides — SPEC §3, src/data/schema.ts. */
const OVERRIDES_KEY = 'inplan-process-map:overrides:v1';

/** Файл-источник истины: playwright запускается из корня репозитория. */
const PROCESS_JSON = 'src/data/process.json';

/** Карточка шага уровня 2 — см. комментарий в openStage ниже. */
const STEP_CARD = '.react-flow__node-step button[aria-label^="Шаг: "]';

const LINK = {
  title: 'Планирование поставок › Объёмный план',
  url: 'https://example.com/plan',
};

interface ScreenLink {
  title: string;
  url: string;
}
interface ProcessNodeLike {
  id: string;
  type: string;
  position: { x: number; y: number };
  screen?: ScreenLink;
}
interface ProcessMapLike {
  stages: { id: string; nodes: ProcessNodeLike[] }[];
}

function readProcessJson(): { text: string; map: ProcessMapLike } {
  const text = readFileSync(PROCESS_JSON, 'utf8');
  return { text, map: JSON.parse(text) as ProcessMapLike };
}

/**
 * id узла, на который ставится ссылка в импортируемом файле.
 *
 * Именно ПЕРВАЯ КАРТОЧКА ШАГА (минимальная по x, y, id), а не `nodes[0]`:
 * с задачи process-map-c18 стартовый вид этапа привязан к ней, а колонка
 * входов и узлы-интеграций остаются слева за кадром. Кликнуть настоящей мышью
 * по узлу за краем полотна нельзя — а весь смысл этого файла в настоящей мыши.
 */
function stepIds(map: ProcessMapLike, count: number): string[] {
  const steps = (map.stages[0]?.nodes ?? [])
    .filter((node) => node.type === 'step')
    .sort(
      (a, b) =>
        a.position.x - b.position.x ||
        a.position.y - b.position.y ||
        a.id.localeCompare(b.id, 'en'),
    );
  const ids = steps.slice(0, count).map((node) => node.id);
  expect(ids.length, 'в process.json не хватает карточек шага').toBe(count);
  return ids;
}

function firstNodeId(map: ProcessMapLike): string {
  return stepIds(map, 1)[0] ?? '';
}

/** Включает режим «Редактор» (SPEC §4.4) настоящим кликом. */
async function enterEditMode(page: Page): Promise<void> {
  const button = page.getByRole('button', { name: 'Редактор', exact: true });
  await button.click();
  await expect(button).toHaveAttribute('aria-pressed', 'true');
}

/**
 * Кликает реальной мышью по центру кнопки и убеждается, что в эту точку
 * попадает именно она, а не полотно/панель поверх неё.
 */
async function mouseClickButton(page: Page, name: string): Promise<void> {
  const button = page.getByRole('button', { name, exact: true });
  await expect(button).toBeVisible();
  const box = await button.boundingBox();
  expect(box, `кнопка «${name}» без геометрии`).not.toBeNull();
  const x = (box?.x ?? 0) + (box?.width ?? 0) / 2;
  const y = (box?.y ?? 0) + (box?.height ?? 0) / 2;

  const hitsButton = await page.evaluate(
    ({ x, y, name }) => {
      const el = document.elementFromPoint(x, y);
      return el?.closest('button')?.textContent?.trim() === name;
    },
    { x, y, name },
  );
  expect(hitsButton, `клик по «${name}» перекрыт другим элементом`).toBe(true);

  await page.mouse.click(x, y);
}

/**
 * Тексты обратной связи — ru.toolbar (process-map-ygd). Дублируются здесь
 * строками, а не импортом из src: e2e проверяет то, что видит пользователь,
 * и переименование ключа в i18n не должно проходить незамеченным.
 */
const MSG = {
  importError: 'Это не файл карты процесса. Правки не изменены',
  importNoChanges: 'Файл принят, расхождений нет',
  importApplied: (count: number): string => `Применено ссылок: ${count}`,
  resetConfirm: 'Удалить все правки?',
  resetAccept: 'Удалить',
  resetCancel: 'Отмена',
};

/**
 * Строка сообщения импорта: ошибка объявляется как `alert`, успех — как
 * `status`. Проверяется не только текст, но и то, что в эту точку экрана
 * попадает именно она: тулбар лежит поверх полотна React Flow, и перекрытый
 * элемент остаётся `toBeVisible()` (CLAUDE.md «Ловушки»).
 */
async function expectMessage(page: Page, role: 'alert' | 'status', text: string): Promise<void> {
  const message = page.getByRole(role);
  await expect(message).toHaveText(text);
  const box = await message.boundingBox();
  expect(box, 'строка сообщения без геометрии').not.toBeNull();
  const onTop = await page.evaluate(
    ({ x, y }) => document.elementFromPoint(x, y)?.textContent?.trim() ?? '',
    { x: (box?.x ?? 0) + (box?.width ?? 0) / 2, y: (box?.y ?? 0) + (box?.height ?? 0) / 2 },
  );
  expect(onTop, 'строка сообщения перекрыта').toBe(text);
}

/**
 * Двухшаговый сброс целиком: взвести и подтвердить. Раньше «Сбросить правки»
 * стирал overrides с первого клика — теперь одного клика недостаточно, и все
 * старые сценарии ходят через этот хелпер.
 */
async function resetViaUi(page: Page): Promise<void> {
  await mouseClickButton(page, 'Сбросить правки');
  await expect(page.getByRole('group', { name: MSG.resetConfirm })).toBeVisible();
  await mouseClickButton(page, MSG.resetAccept);
}

async function storedOverrides(page: Page): Promise<unknown> {
  return page.evaluate((key) => {
    const raw = window.localStorage.getItem(key);
    return raw === null ? null : (JSON.parse(raw) as unknown);
  }, OVERRIDES_KEY);
}

async function setOverride(page: Page, nodeId: string, screen: ScreenLink): Promise<void> {
  await page.evaluate(
    ({ key, nodeId, screen }) => {
      window.localStorage.setItem(key, JSON.stringify({ [nodeId]: { screen } }));
    },
    { key: OVERRIDES_KEY, nodeId, screen },
  );
  await page.reload();
  await page.waitForSelector('.react-flow__node-stage');
}

/** Скачивает файл кнопкой «Экспорт JSON» и отдаёт его содержимое. */
async function exportJson(page: Page): Promise<{ fileName: string; text: string }> {
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    mouseClickButton(page, 'Экспорт JSON'),
  ]);
  const path = await download.path();
  expect(path).not.toBeNull();
  return { fileName: download.suggestedFilename(), text: readFileSync(path ?? '', 'utf8') };
}

/** Кладёт текст во временный файл и скармливает его скрытому file input. */
async function importJson(page: Page, fileName: string, text: string): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), 'pm-import-'));
  const filePath = join(dir, fileName);
  writeFileSync(filePath, text, 'utf8');
  await page.locator('input[type="file"]').setInputFiles(filePath);
}

async function openStage(page: Page, index: number): Promise<void> {
  await page.waitForSelector('.react-flow__node-stage');
  const card = page.locator('.react-flow__node-stage button').nth(index);
  const box = await card.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.click(
    (box?.x ?? 0) + (box?.width ?? 0) / 2,
    (box?.y ?? 0) + (box?.height ?? 0) / 2,
  );
  // Карточка ШАГА, а не любой `.react-flow__node-step`: тем же классом рисуются
  // узлы интеграций и предупреждений (общий StepCard в StepNode.tsx).
  await page.waitForSelector(STEP_CARD);
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize(VIEWPORT);
});

test.describe('Тулбар редактора: три кнопки SPEC §4.4', () => {
  test('в просмотре кнопок нет, в редакторе есть, и клики доходят до них', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.react-flow__node-stage');

    for (const name of ['Экспорт JSON', 'Импорт JSON', 'Сбросить правки']) {
      await expect(page.getByRole('button', { name, exact: true })).toHaveCount(0);
    }

    await enterEditMode(page);

    // Видимы и не перекрыты полотном (главная ловушка проекта).
    for (const name of ['Экспорт JSON', 'Импорт JSON', 'Сбросить правки']) {
      const button = page.getByRole('button', { name, exact: true });
      await expect(button).toBeVisible();
      const box = await button.boundingBox();
      const hits = await page.evaluate(
        ({ x, y, name }) =>
          document
            .elementFromPoint(x, y)
            ?.closest('button')
            ?.textContent?.trim() === name,
        {
          x: (box?.x ?? 0) + (box?.width ?? 0) / 2,
          y: (box?.y ?? 0) + (box?.height ?? 0) / 2,
          name,
        },
      );
      expect(hits, `кнопка «${name}» перекрыта`).toBe(true);
    }
  });

  test('на 1024×600 с открытой панелью узла тулбар не уезжает за экран', async ({ page }) => {
    // Регрессия, найденная при реализации process-map-6q0: три кнопки
    // редактора удлиняют строку тулбара, и при сдвиге на ширину панели
    // (Toolbar.module.css .shifted) он вылезал левым краем за границу экрана
    // (x ≈ −206) — переключатель «Просмотр / Редактор» становился недоступен.
    // Лечится переносом строки; здесь проверяется результат.
    await page.setViewportSize({ width: 1024, height: 600 });
    await page.goto('/');
    await page.waitForSelector('.react-flow__node-stage');
    await enterEditMode(page);
    await openStage(page, 0);
    await page.locator(STEP_CARD).first().click();
    await expect(page.getByRole('dialog')).toBeVisible();

    for (const name of ['Просмотр', 'Редактор', 'Экспорт JSON', 'Импорт JSON', 'Сбросить правки']) {
      const box = await page.getByRole('button', { name, exact: true }).boundingBox();
      expect(box, `кнопка «${name}» без геометрии`).not.toBeNull();
      expect(box?.x ?? -1, `кнопка «${name}» уехала за левый край`).toBeGreaterThanOrEqual(0);
      expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(1024);
    }

    // И «Сбросить правки» после переноса строки по-прежнему кликается мышью…
    await mouseClickButton(page, 'Сбросить правки');
    // …а взведённое подтверждение (оно длиннее самой кнопки) тулбар не разносит.
    await expect(page.getByRole('group', { name: MSG.resetConfirm })).toBeVisible();
    for (const name of ['Просмотр', 'Редактор', MSG.resetAccept, MSG.resetCancel]) {
      const box = await page.getByRole('button', { name, exact: true }).boundingBox();
      expect(box, `кнопка «${name}» без геометрии`).not.toBeNull();
      expect(box?.x ?? -1, `кнопка «${name}» уехала за левый край`).toBeGreaterThanOrEqual(0);
      expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(1024);
    }
  });

  test('строка сообщения на 1024×600 не разносит тулбар за края экрана', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 600 });
    await page.goto('/');
    await page.waitForSelector('.react-flow__node-stage');
    await enterEditMode(page);

    // Самый длинный из текстов владельца.
    await importJson(page, 'broken.json', '{ это совсем не json');
    await expectMessage(page, 'alert', MSG.importError);

    const box = await page.getByRole('alert').boundingBox();
    expect(box?.x ?? -1).toBeGreaterThanOrEqual(0);
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(1024);
    // Полоса горизонтальной прокрутки от сообщения не появляется.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);

    for (const name of ['Просмотр', 'Редактор', 'Экспорт JSON', 'Импорт JSON', 'Сбросить правки']) {
      const button = await page.getByRole('button', { name, exact: true }).boundingBox();
      expect(button?.x ?? -1, `кнопка «${name}» уехала за левый край`).toBeGreaterThanOrEqual(0);
      expect((button?.x ?? 0) + (button?.width ?? 0)).toBeLessThanOrEqual(1024);
    }
  });
});

test.describe('Экспорт JSON', () => {
  test('скачивает process.json, побайтово равный файлу репозитория (правок нет)', async ({
    page,
  }) => {
    await page.goto('/');
    await page.waitForSelector('.react-flow__node-stage');
    await enterEditMode(page);

    const { fileName, text } = await exportJson(page);

    expect(fileName).toBe('process.json');
    // Тот же формат, что у scripts/import-pptx.py и scripts/layout.ts:
    // отступ 2, кириллица без экранирования, завершающий LF.
    expect(text).toBe(readProcessJson().text);
    expect(text.endsWith('\n')).toBe(true);
    expect(text).not.toContain('\r');
  });

  test('скачивает ПОЛНУЮ слитую карту с правкой, а не overrides (SPEC §3)', async ({ page }) => {
    const nodeId = firstNodeId(readProcessJson().map);
    await page.goto('/');
    await setOverride(page, nodeId, LINK);
    await enterEditMode(page);

    const { text } = await exportJson(page);
    const exported = JSON.parse(text) as ProcessMapLike;

    // Это карта целиком…
    expect(exported.stages.length).toBe(readProcessJson().map.stages.length);
    // …с влитой правкой у нужного узла.
    const node = exported.stages.flatMap((stage) => stage.nodes).find((n) => n.id === nodeId);
    expect(node?.screen).toEqual(LINK);
  });
});

test.describe('Импорт JSON', () => {
  test('round-trip: экспорт → сброс → импорт возвращает ту же карту и те же overrides', async ({
    page,
  }) => {
    const nodeId = firstNodeId(readProcessJson().map);
    await page.goto('/');
    await setOverride(page, nodeId, LINK);
    await enterEditMode(page);

    const exported = await exportJson(page);

    // Стираем правки — как будто пользователь открыл карту в другом браузере.
    await resetViaUi(page);
    expect(await storedOverrides(page)).toBeNull();

    await importJson(page, exported.fileName, exported.text);

    // Правка восстановлена в хранилище ровно в формате SPEC §3…
    await expect
      .poll(() => storedOverrides(page))
      .toEqual({ [nodeId]: { screen: LINK } });

    // …и повторный экспорт даёт байт в байт тот же файл.
    const again = await exportJson(page);
    expect(again.text).toBe(exported.text);
  });

  test('импортированная ссылка видна в панели узла без перезагрузки', async ({ page }) => {
    const { text, map } = readProcessJson();
    const nodeId = firstNodeId(map);
    // Файл полной карты, в котором ссылка проставлена вручную.
    const edited = JSON.parse(text) as ProcessMapLike;
    const target = edited.stages[0]?.nodes.find((node) => node.id === nodeId);
    expect(target).toBeDefined();
    if (target !== undefined) {
      target.screen = LINK;
    }

    await page.goto('/');
    await page.waitForSelector('.react-flow__node-stage');
    await enterEditMode(page);
    await importJson(page, 'process.json', `${JSON.stringify(edited, null, 2)}\n`);

    await expect
      .poll(() => storedOverrides(page))
      .toEqual({ [nodeId]: { screen: LINK } });

    // Никакой перезагрузки: переходим на уровень 2 и открываем узел.
    await openStage(page, 0);
    const card = page.locator(`[data-id="${nodeId}"] button`).first();
    await card.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText(LINK.title)).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Открыть в модуле' })).toBeEnabled();
  });

  // ── Обратная связь импорта (process-map-ygd) ─────────────────────────────
  //
  // До этой задачи отказ уходил в console.warn, и снаружи успешный импорт
  // файла, совпадающего с базовым, был НЕОТЛИЧИМ от отвергнутого — оба ничего
  // не меняли на экране. Ровно эту неразличимость и проверяют три теста ниже:
  // каждому исходу — своя видимая строка.

  test('валидная карта с N ссылками: «Применено ссылок: N» и ссылки на карточках', async ({
    page,
  }) => {
    const { text, map } = readProcessJson();
    const ids = stepIds(map, 2);
    const edited = JSON.parse(text) as ProcessMapLike;
    for (const [index, id] of ids.entries()) {
      const target = edited.stages[0]?.nodes.find((node) => node.id === id);
      expect(target).toBeDefined();
      if (target !== undefined) {
        target.screen = { title: `${LINK.title} ${index}`, url: `${LINK.url}/${index}` };
      }
    }

    await page.goto('/');
    await page.waitForSelector('.react-flow__node-stage');
    await enterEditMode(page);
    await importJson(page, 'process.json', `${JSON.stringify(edited, null, 2)}\n`);

    await expectMessage(page, 'status', MSG.importApplied(ids.length));

    // Число в строке — не украшение: столько же записей легло в хранилище.
    expect(Object.keys((await storedOverrides(page)) as object)).toHaveLength(ids.length);

    // И ссылки действительно появились на карточках (иконка link-external).
    await openStage(page, 0);
    for (const id of ids) {
      await expect(
        page.locator(`[data-id="${id}"] button[aria-label^="Открыть экран в In.Plan: "]`),
      ).toHaveCount(1);
    }
  });

  test('файл без расхождений: «Файл принят, расхождений нет», а не «Применено ссылок: 0»', async ({
    page,
  }) => {
    const { text } = readProcessJson();

    await page.goto('/');
    await page.waitForSelector('.react-flow__node-stage');
    await enterEditMode(page);
    // Ровно тот файл, который лежит в репозитории: принят, но менять нечего.
    await importJson(page, 'process.json', text);

    await expectMessage(page, 'status', MSG.importNoChanges);
    await expect(page.getByText(MSG.importApplied(0))).toHaveCount(0);
  });

  test('сообщение живёт до следующего действия', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.react-flow__node-stage');
    await enterEditMode(page);

    await importJson(page, 'broken.json', '{ это совсем не json');
    await expectMessage(page, 'alert', MSG.importError);

    // Следующее действие — клик по «Сбросить правки»: строка исчезает.
    await mouseClickButton(page, 'Сбросить правки');
    await expect(page.getByRole('alert')).toHaveCount(0);
  });

  test('битый JSON не роняет приложение и не трогает правки', async ({ page }) => {
    const nodeId = firstNodeId(readProcessJson().map);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));

    await page.goto('/');
    await setOverride(page, nodeId, LINK);
    await enterEditMode(page);

    await importJson(page, 'broken.json', '{ это совсем не json');

    // Приложение живо, тулбар на месте, правки прежние.
    await expect(page.getByRole('button', { name: 'Импорт JSON', exact: true })).toBeVisible();
    await expect(page.locator('.react-flow__node-stage').first()).toBeVisible();
    expect(errors).toEqual([]);
    expect(await storedOverrides(page)).toEqual({ [nodeId]: { screen: LINK } });

    // И отказ теперь ВИДЕН, а не только в консоли.
    await expectMessage(page, 'alert', MSG.importError);
  });

  test('чужая валидная JSON-форма (файл overrides) отвергается', async ({ page }) => {
    const nodeId = firstNodeId(readProcessJson().map);
    await page.goto('/');
    await setOverride(page, nodeId, LINK);
    await enterEditMode(page);

    // Именно overrides, а не карта: импорт ждёт полную карту (см.
    // src/utils/processTransfer.ts).
    await importJson(page, 'overrides.json', JSON.stringify({ 'chuzhoy-uzel': { screen: null } }));

    await expect(page.locator('.react-flow__node-stage').first()).toBeVisible();
    expect(await storedOverrides(page)).toEqual({ [nodeId]: { screen: LINK } });
    // Тот же текст, что у битого JSON: владелец различает эти случаи только
    // в реализации, а не в интерфейсе.
    await expectMessage(page, 'alert', MSG.importError);
  });
});

test.describe('Сбросить правки: двухшаговая кнопка', () => {
  // window.confirm здесь запрещён: в <iframe> с sandbox без allow-modals
  // браузер подавляет его МОЛЧА, и сброс прошёл бы без вопроса (тот же класс
  // тихого отказа, что у _top-навигации, process-map-6ap). Поэтому вопрос —
  // обычные кнопки в тулбаре, и проверяются они настоящей мышью.

  test('первый клик не удаляет, а спрашивает; «Отмена» возвращает исходный вид', async ({
    page,
  }) => {
    const nodeId = firstNodeId(readProcessJson().map);
    await page.goto('/');
    await setOverride(page, nodeId, LINK);
    await enterEditMode(page);

    await mouseClickButton(page, 'Сбросить правки');

    // Вопрос на экране, исходной кнопки нет, хранилище НЕ тронуто.
    const confirm = page.getByRole('group', { name: MSG.resetConfirm });
    await expect(confirm).toBeVisible();
    await expect(page.getByText(MSG.resetConfirm)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Сбросить правки', exact: true })).toHaveCount(0);
    expect(await storedOverrides(page)).toEqual({ [nodeId]: { screen: LINK } });

    // Подтверждение достижимо клавиатурой: фокус уже на «Удалить», ноль Tab'ов.
    await expect(page.getByRole('button', { name: MSG.resetAccept, exact: true })).toBeFocused();
    // Один Tab — и фокус на «Отмена».
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: MSG.resetCancel, exact: true })).toBeFocused();

    // «Отмена» возвращает исходный вид и ничего не удаляет.
    await mouseClickButton(page, MSG.resetCancel);
    await expect(confirm).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Сбросить правки', exact: true })).toBeVisible();
    expect(await storedOverrides(page)).toEqual({ [nodeId]: { screen: LINK } });
  });

  test('потеря фокуса возвращает исходный вид и ничего не удаляет', async ({ page }) => {
    const nodeId = firstNodeId(readProcessJson().map);
    await page.goto('/');
    await setOverride(page, nodeId, LINK);
    await enterEditMode(page);

    await mouseClickButton(page, 'Сбросить правки');
    await expect(page.getByRole('group', { name: MSG.resetConfirm })).toBeVisible();

    // Уводим фокус наружу — Shift+Tab с «Удалить» на «Импорт JSON».
    await page.keyboard.press('Shift+Tab');

    await expect(page.getByRole('group', { name: MSG.resetConfirm })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Сбросить правки', exact: true })).toBeVisible();
    expect(await storedOverrides(page)).toEqual({ [nodeId]: { screen: LINK } });
  });

  test('«Удалить» стирает overrides и возвращает карту к process.json без перезагрузки', async ({
    page,
  }) => {
    const nodeId = firstNodeId(readProcessJson().map);
    await page.goto('/');
    await setOverride(page, nodeId, LINK);
    await enterEditMode(page);

    // До сброса ссылка на месте.
    await openStage(page, 0);
    await page.locator(`[data-id="${nodeId}"] button`).first().click();
    await expect(page.getByRole('dialog').getByText(LINK.title)).toBeVisible();
    await page.keyboard.press('Escape');

    await resetViaUi(page);

    // Ключ удалён целиком (resetOverrides), а не переписан пустым объектом.
    expect(await storedOverrides(page)).toBeNull();

    // И панель узла уже показывает «Ссылка не задана» — без reload.
    await page.locator(`[data-id="${nodeId}"] button`).first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('Ссылка не задана')).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Открыть в модуле' })).toBeDisabled();
  });
});
