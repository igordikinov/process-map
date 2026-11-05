import { readFile } from 'node:fs/promises';
import type { FrameLocator, Page } from '@playwright/test';
import { expect, test } from '../fixtures';

async function enterStage(page: Page | FrameLocator) {
  await expect(
    page.locator('.react-flow__node-module, .react-flow__node-stage').first(),
  ).toBeVisible();
  if (await page.locator('.react-flow__node-module').count())
    await page.locator('.react-flow__node-module button').first().click();
  await page.locator('.react-flow__node-stage button').first().click();
  await page.locator('.react-flow__node-step').first().waitFor();
}
async function start(page: Page) {
  await page.goto('/');
  await enterStage(page);
  await page.getByRole('button', { name: 'Редактор', exact: true }).click();
}
async function add(page: Page | FrameLocator, label: string, type = 'step', parent?: string) {
  await page.getByRole('button', { name: 'Добавить блок', exact: true }).first().click();
  const panel = page.getByRole('dialog');
  await panel.getByLabel('Тип блока', { exact: true }).selectOption(type);
  await panel.getByLabel('Название', { exact: true }).fill(label);
  if (type === 'detail')
    await panel.getByLabel('Родительский блок', { exact: true }).selectOption({ label: parent! });
  await panel.getByRole('button', { name: 'Добавить', exact: true }).click();
  await expect(page.getByRole('dialog').getByLabel('Название', { exact: true })).toHaveValue(
    label.trim(),
  );
  const card = page
    .locator(`.react-flow__node-${type}`)
    .filter({ has: page.locator('button').filter({ hasText: label.trim() }) })
    .first();
  return (await card.getAttribute('data-id'))!;
}
async function exportMap(page: Page) {
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Экспорт JSON', exact: true }).click();
  const download = await downloading;
  return JSON.parse(await readFile((await download.path())!, 'utf8'));
}
async function inputJson(page: Page, map: unknown) {
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles({
    name: 'edited.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(map)),
  });
}
function nodeById(map: Awaited<ReturnType<typeof exportMap>>, id: string) {
  return map.stages
    .flatMap(
      (stage: {
        nodes: { id: string; label: string; position: { x: number; y: number }; group?: string }[];
      }) => stage.nodes,
    )
    .find((node: { id: string }) => node.id === id);
}

test('редактор: восемь типов, подробность и изменение свойств', async ({ page }) => {
  test.setTimeout(90000);
  await start(page);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const parent = await add(page, 'Шаг редактора');
  for (const type of [
    'data',
    'integration',
    'warning',
    'gateway',
    'event',
    'subprocess',
    'detail',
  ]) {
    await add(page, `Блок ${type}`, type, 'Шаг редактора');
  }
  const map = await exportMap(page);
  const stage = map.stages.find((item: { nodes: { id: string }[] }) =>
    item.nodes.some((node) => node.id === parent),
  );
  expect(stage.nodes.filter((node: { id: string }) => node.id.startsWith('node-'))).toHaveLength(8);
  const detail = stage.nodes.find((node: { label: string }) => node.label === 'Блок detail');
  expect(stage.edges.find((edge: { target: string }) => edge.target === detail.id)).toMatchObject({
    source: parent,
    kind: 'data',
  });
  const body = page.getByRole('dialog').getByLabel('Название', { exact: true });
  await body.fill('Подробность после правки');
  await page.getByRole('dialog').getByRole('button', { name: 'Применить', exact: true }).click();
  expect(nodeById(await exportMap(page), detail.id).label).toBe('Подробность после правки');
  expect(errors).toEqual([]);
});

for (const size of [
  { width: 1280, height: 720 },
  { width: 1024, height: 600 },
]) {
  test(`перемещение, история, перезагрузка и полный JSON ${size.width}`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(60000);
    await page.setViewportSize(size);
    await start(page);
    const id = await add(page, 'Подвижный блок');
    const before = nodeById(await exportMap(page), id);
    const card = page.locator(`[data-id="${id}"] button`).first();
    const box = (await card.boundingBox())!;
    await page.mouse.move(box.x + 30, box.y + 20);
    await page.mouse.down();
    await page.mouse.move(box.x + 94, box.y + 52, { steps: 10 });
    await page.mouse.up();
    const moved = nodeById(await exportMap(page), id);
    expect(moved.position).not.toEqual(before.position);
    expect(Math.abs(moved.position.x % 16)).toBe(0);
    expect(Math.abs(moved.position.y % 16)).toBe(0);
    await page.getByRole('button', { name: 'Отменить действие', exact: true }).click();
    expect(nodeById(await exportMap(page), id).position).toEqual(before.position);
    await page.getByRole('button', { name: 'Повторить действие', exact: true }).click();
    expect(nodeById(await exportMap(page), id).position).toEqual(moved.position);
    const panel = page.getByRole('dialog');
    await panel.getByLabel('Название', { exact: true }).fill('Переименованный блок');
    await panel.getByRole('button', { name: 'Применить', exact: true }).click();
    const exported = await exportMap(page);
    await page.screenshot({ path: testInfo.outputPath('stage-editor.png') });
    await page.reload();
    await expect(page.locator(`[data-id="${id}"]`)).toContainText('Переименованный блок');
    expect(await page.locator('.react-flow__node.draggable').count()).toBe(0);
    await page.getByRole('button', { name: 'Редактор', exact: true }).click();
    await page.getByRole('button', { name: 'Сбросить правки', exact: true }).click();
    await page
      .getByLabel('Удалить все правки?', { exact: true })
      .getByRole('button', { name: 'Удалить', exact: true })
      .click();
    await expect(page.locator(`[data-id="${id}"]`)).toHaveCount(0);
    await inputJson(page, exported);
    await expect(page.locator(`[data-id="${id}"]`)).toContainText('Переименованный блок');
    expect(nodeById(await exportMap(page), id).position).toEqual(moved.position);
  });
}

test('группы, выбор связи и каскадное удаление с отменой', async ({ page }) => {
  test.setTimeout(90000);
  await start(page);
  await page.getByRole('button', { name: 'Добавить группу', exact: true }).click();
  let panel = page.getByRole('dialog');
  await panel.getByLabel('Название', { exact: true }).fill('Группа редактора');
  await panel.getByRole('button', { name: 'Применить', exact: true }).click();
  await expect(
    page.locator('.pm-group-handle').filter({ hasText: 'Группа редактора' }),
  ).toBeVisible();
  const first = await add(page, 'Первый блок');
  panel = page.getByRole('dialog');
  await panel.getByLabel('Группа', { exact: true }).selectOption({ label: 'Группа редактора' });
  await panel.getByRole('button', { name: 'Применить', exact: true }).click();
  const detail = await add(page, 'Подробность блока', 'detail', 'Первый блок');
  await add(page, 'Второй блок');
  await page.getByRole('button', { name: 'Добавить связь', exact: true }).click();
  panel = page.getByRole('dialog');
  await panel.getByLabel('Начало связи', { exact: true }).selectOption({ label: 'Первый блок' });
  await panel.getByLabel('Конец связи', { exact: true }).selectOption({ label: 'Второй блок' });
  await panel.getByLabel('Подпись связи', { exact: true }).fill('Новая связь');
  await panel.getByRole('button', { name: 'Добавить', exact: true }).click();
  const linked = await exportMap(page);
  const stage = linked.stages.find((item: { nodes: { id: string }[] }) =>
    item.nodes.some((node) => node.id === first),
  );
  const edge = stage.edges.find((item: { label: string }) => item.label === 'Новая связь');
  expect(edge.source).toBe(first);
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Закрыть свойства', exact: true })
    .click();
  await page.locator(`[data-id="${first}"] button`).first().click();
  await page.getByRole('dialog').getByRole('button', { name: 'Удалить', exact: true }).click();
  await expect(page.getByRole('alertdialog')).toContainText('Удалить блоков: 2, связей: 2');
  await page.getByRole('alertdialog').getByRole('button', { name: 'Удалить', exact: true }).click();
  const removed = await exportMap(page);
  expect(nodeById(removed, first)).toBeUndefined();
  expect(nodeById(removed, detail)).toBeUndefined();
  await page.getByRole('button', { name: 'Отменить действие', exact: true }).click();
  expect(nodeById(await exportMap(page), first)).toBeDefined();
  // Удаление рамки сохраняет блоки и их координаты.
  const group = stage.groups.find((item: { label: string }) => item.label === 'Группа редактора');
  const header = page.locator('.pm-group-handle').filter({ hasText: 'Группа редактора' });
  await header.click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Удалить рамку', exact: true })
    .click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Удалить', exact: true }).click();
  const ungrouped = await exportMap(page);
  expect(nodeById(ungrouped, first).group).toBeUndefined();
  expect(nodeById(ungrouped, first).position).toEqual(nodeById(linked, first).position);
  expect(
    ungrouped.stages
      .find((item: { id: string }) => item.id === stage.id)
      .groups.some((item: { id: string }) => item.id === group.id),
  ).toBe(false);
});

test('неприменённая форма, клавиатура и отказ хранилища', async ({ page }) => {
  test.setTimeout(60000);
  await start(page);
  const id = await add(page, 'Сохраняемый блок');
  await page.getByRole('dialog').getByLabel('Название', { exact: true }).fill('Ещё не применено');
  await page.getByRole('button', { name: 'Просмотр', exact: true }).click();
  const confirm = page.getByRole('alertdialog');
  await expect(confirm).toBeVisible();
  await confirm.getByRole('button', { name: 'Остаться', exact: true }).click();
  await expect(page.getByRole('dialog').getByLabel('Название', { exact: true })).toHaveValue(
    'Ещё не применено',
  );
  await page.getByRole('button', { name: 'Просмотр', exact: true }).click();
  await confirm.getByRole('button', { name: 'Отбросить изменения', exact: true }).click();
  await page.getByRole('button', { name: 'Редактор', exact: true }).click();
  await expect(page.getByRole('dialog').getByLabel('Название', { exact: true })).toHaveValue(
    'Сохраняемый блок',
  );
  await page.getByRole('dialog').getByRole('button', { name: 'Закрыть', exact: true }).click();
  await page.locator('body').click({ position: { x: 4, y: 4 } });
  await page.keyboard.press('Control+z');
  expect(nodeById(await exportMap(page), id)).toBeUndefined();
  await page.locator('body').click({ position: { x: 4, y: 4 } });
  await page.keyboard.press('Control+Shift+z');
  await expect(page.locator(`[data-id="${id}"]`)).toBeAttached();
  expect(nodeById(await exportMap(page), id)).toBeDefined();
  await page.evaluate(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException('Quota', 'QuotaExceededError');
    };
  });
  const unsaved = await add(page, 'В памяти');
  await expect(
    page.getByText('Правки сохранены только в памяти. Выгрузите JSON перед закрытием страницы.'),
  ).toBeVisible();
  expect(nodeById(await exportMap(page), unsaved)).toBeDefined();
});

test('загруженный JSON восстанавливается только по явному действию', async ({ page }) => {
  test.setTimeout(60000);
  await start(page);
  const original = await exportMap(page);
  const uploaded = { ...original, id: 'uploaded-editor', title: 'Загруженная карта' };
  await inputJson(page, uploaded);
  await page.getByRole('button', { name: 'Открыть как отдельную карту', exact: true }).click();
  await enterStage(page);
  const id = await add(page, 'Блок загруженной карты');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Загруженная карта', exact: true })).toHaveCount(
    0,
  );
  await page.getByRole('button', { name: 'Редактор', exact: true }).click();
  await page.getByRole('button', { name: 'Восстановить загруженную схему', exact: true }).click();
  await enterStage(page);
  expect(nodeById(await exportMap(page), id).label).toBe('Блок загруженной карты');
});

test('точки подключения, группа с содержимым, масштаб и длинная подробность', async ({ page }) => {
  test.setTimeout(90000);
  await start(page);
  const first = await add(page, 'Источник новой связи');
  const second = await add(page, 'Получатель новой связи');
  await page.getByRole('dialog').getByRole('button', { name: 'Закрыть', exact: true }).click();
  const source = page.locator(`[data-id="${first}"] .react-flow__handle-right.source`);
  const target = page.locator(`[data-id="${second}"] .react-flow__handle-left.target`);
  await source.dragTo(target);
  await expect(page.getByRole('dialog').getByLabel('Начало связи', { exact: true })).toHaveValue(
    first,
  );
  await page.getByRole('dialog').getByLabel('Подпись связи', { exact: true }).fill('Перетягивание');
  await page.getByRole('dialog').getByRole('button', { name: 'Применить', exact: true }).click();
  let map = await exportMap(page);
  const stage = map.stages.find((item: { nodes: { id: string }[] }) =>
    item.nodes.some((node) => node.id === first),
  );
  expect(
    stage.edges.find((edge: { label: string }) => edge.label === 'Перетягивание'),
  ).toMatchObject({ source: first, target: second, kind: 'process' });
  await page.getByRole('button', { name: 'Добавить группу', exact: true }).click();
  const panel = page.getByRole('dialog');
  await panel.getByLabel('Название', { exact: true }).fill('Подвижная рамка');
  await panel.getByRole('button', { name: 'Применить', exact: true }).click();
  await panel.getByRole('button', { name: 'Закрыть свойства', exact: true }).click();
  await page.locator(`[data-id="${first}"] button`).first().click();
  await panel.getByLabel('Группа', { exact: true }).selectOption({ label: 'Подвижная рамка' });
  await panel.getByRole('button', { name: 'Применить', exact: true }).click();
  await panel.getByRole('button', { name: 'Закрыть', exact: true }).click();
  const header = page.locator('.pm-group-handle').filter({ hasText: 'Подвижная рамка' });
  const before = nodeById(await exportMap(page), first).position;
  const box = (await header.boundingBox())!;
  await page.mouse.move(box.x + 40, box.y + 8);
  await page.mouse.down();
  await page.mouse.move(box.x + 104, box.y + 40, { steps: 10 });
  await page.mouse.up();
  expect(nodeById(await exportMap(page), first).position).not.toEqual(before);
  await page.getByRole('button', { name: 'Уменьшить', exact: true }).click();
  const card = page.locator(`[data-id="${second}"] button`).first();
  const scaled = (await card.boundingBox())!;
  await page.mouse.move(scaled.x + 25, scaled.y + 15);
  await page.mouse.down();
  await page.mouse.move(scaled.x + 73, scaled.y + 47, { steps: 10 });
  await page.mouse.up();
  map = await exportMap(page);
  expect(Math.abs(nodeById(map, second).position.x % 16)).toBe(0);
  const long = 'Подробное описание операции и её результата. '.repeat(45);
  const detail = await add(page, long, 'detail', 'Источник новой связи');
  const node = page.locator(`[data-id="${detail}"]`);
  await expect
    .poll(() => node.evaluate((element) => element.getBoundingClientRect().height))
    .toBeGreaterThan(170);
  expect(
    await node
      .locator('button')
      .evaluate((element) => element.scrollHeight <= element.clientHeight + 1),
  ).toBe(true);
});

test('пустой этап, несовместимый черновик и выгрузка восстановления', async ({ page }) => {
  test.setTimeout(60000);
  await start(page);
  const map = await exportMap(page);
  const stageNumber = Number(new URL(page.url()).searchParams.get('stage'));
  const empty = {
    ...map,
    stages: map.stages.map((stage: { id: string; number: number }) =>
      stage.number === stageNumber ? { ...stage, nodes: [], edges: [], groups: [] } : stage,
    ),
  };
  await inputJson(page, empty);
  await expect(page.getByText('В этапе пока нет блоков.')).toBeVisible();
  await page.getByRole('button', { name: 'Добавить группу', exact: true }).click();
  const group = page
    .locator('.react-flow__node-groupBox')
    .filter({ has: page.locator('.pm-group-handle') });
  await expect(group).toBeVisible();
  const id = await add(page, 'Черновик для восстановления');
  const edited = await exportMap(page);
  await page.evaluate(() => {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)!;
      if (key.endsWith(':draft:v2')) {
        const draft = JSON.parse(localStorage.getItem(key)!);
        draft.fingerprint = 'old-build';
        localStorage.setItem(key, JSON.stringify(draft));
      }
    }
  });
  await page.reload();
  await expect(
    page.getByRole('button', { name: 'Выгрузить несовместимый черновик', exact: true }),
  ).toBeVisible();
  await expect(page.locator(`[data-id="${id}"]`)).toHaveCount(0);
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Выгрузить несовместимый черновик', exact: true }).click();
  const file = await downloading;
  expect(JSON.parse(await readFile((await file.path())!, 'utf8'))).toEqual(edited);
  await page.getByRole('button', { name: 'Сбросить несовместимый черновик', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Выгрузить несовместимый черновик', exact: true }),
  ).toHaveCount(0);
});

test('редактор внутри iframe без доступа к хранилищу и без allow-modals', async ({
  page,
  baseURL,
}) => {
  test.setTimeout(60000);
  await page.setViewportSize({ width: 1024, height: 600 });
  // Pages разрешает CORS для opaque origin; у Vite dev этого заголовка нет.
  await page.route(
    (url) => url.origin === baseURL,
    async (route) => {
      const response = await route.fetch();
      await route.fulfill({
        response,
        headers: { ...response.headers(), 'access-control-allow-origin': '*' },
      });
    },
  );
  await page.route('**/__editor-frame.html', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: `<html><body style="margin:0"><iframe id="map" title="Карта" sandbox="allow-scripts allow-downloads" src="${baseURL}/" style="width:100vw;height:100vh;border:0"></iframe></body></html>`,
    }),
  );
  await page.goto('/__editor-frame.html');
  const frame = page.frameLocator('#map');
  await enterStage(frame);
  await frame.getByRole('button', { name: 'Редактор', exact: true }).click();
  const id = await add(frame, 'Блок во фрейме');
  await expect(
    frame.getByText('Правки сохранены только в памяти. Выгрузите JSON перед закрытием страницы.'),
  ).toBeVisible();
  await frame.getByRole('dialog').getByLabel('Название', { exact: true }).fill('Неприменённое');
  await frame.getByRole('button', { name: 'Просмотр', exact: true }).click();
  await frame
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Применить', exact: true })
    .click();
  await expect(frame.locator(`[data-id="${id}"]`)).toContainText('Неприменённое');
});
