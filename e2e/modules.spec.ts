import { expect, test } from './fixtures';

test('модуль → этап → шаг; два возврата до корня', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.react-flow__node-module')).toHaveCount(5);
  await page.locator('.react-flow__node-module button').first().click();
  await expect(page.locator('.react-flow__node-stage')).toHaveCount(4);
  await expect(page).toHaveURL(/module=dp/);
  await page.locator('.react-flow__node-stage button').first().click();
  await expect(page.locator('.react-flow__node-step')).toHaveCount(1);
  await page.locator('.react-flow__node-step button').first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Назад к этапам модуля' }).click();
  await expect(page.locator('.react-flow__node-stage')).toHaveCount(4);
  await page.getByRole('button', { name: 'Назад ко всем модулям' }).click();
  await expect(page.locator('.react-flow__node-module')).toHaveCount(5);
  expect(new URL(page.url()).search).toBe('');
});

test('история браузера не заполняется переходами трёх уровней', async ({ page }) => {
  await page.route('**/previous-page', (route) =>
    route.fulfill({
      body: '<h1>Предыдущая страница</h1>',
      contentType: 'text/html; charset=utf-8',
    }),
  );
  await page.goto('/previous-page');
  await page.goto('/');
  await page.locator('.react-flow__node-module button').first().click();
  await page.locator('.react-flow__node-stage button').first().click();
  await page.locator('.react-flow__node-step button').first().click();
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'Предыдущая страница' })).toBeVisible();
});

test('deep-link разрешает хозяина этапа и сохраняется при перезагрузке', async ({ page }) => {
  await page.goto('/?module=dp&stage=17');
  await expect(page).toHaveURL(/module=mrp/);
  await expect(page.locator('.react-flow__node-detail')).toHaveCount(3);
  await page.reload();
  await expect(page.locator('.react-flow__node-detail')).toHaveCount(3);
  await page.getByRole('button', { name: 'Назад к этапам модуля' }).click();
  await expect(page.locator('.react-flow__node-stage')).toHaveCount(4);
  await expect(page).toHaveURL(/module=mrp/);
});

for (const size of [
  { width: 1440, height: 900 },
  { width: 1024, height: 600 },
]) {
  test(`подробность MRP целиком в карточке ${size.width}×${size.height}`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize(size);
    await page.goto('/?stage=17');
    const card = page
      .locator('.react-flow__node-detail button')
      .filter({ hasText: 'Параметры закупки:' });
    await expect(card).toHaveCount(1);
    await page.evaluate(() => document.fonts.ready);
    const metrics = await card.evaluate((el) => {
      const text = el.querySelector('span')!;
      const a = el.getBoundingClientRect(),
        b = text.getBoundingClientRect();
      return {
        scroll: el.scrollHeight,
        client: el.clientHeight,
        fits: b.bottom <= a.bottom && b.top >= a.top && b.left >= a.left && b.right <= a.right,
        text: text.textContent,
      };
    });
    expect(metrics.scroll).toBeLessThanOrEqual(metrics.client);
    expect(metrics.fits).toBe(true);
    expect(metrics.text?.split('\n')).toHaveLength(7);
    await page.getByRole('button', { name: 'Уместить в экран', exact: true }).click();
    await page.screenshot({ path: testInfo.outputPath('mrp-details.png'), fullPage: true });
  });
}

test('компактный уровень модулей: размеры и переход между разными модулями', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1024, height: 600 });
  await page.goto('/');
  await expect(page.locator('.react-flow__node-module')).toHaveCount(5);
  await expect
    .poll(async () => Math.round((await page.locator('header').boundingBox())!.height))
    .toBe(44);
  const size = await page
    .locator('.react-flow__node-module button')
    .first()
    .evaluate((el) => ({
      width: (el as HTMLElement).offsetWidth,
      height: (el as HTMLElement).offsetHeight,
    }));
  expect(size).toEqual({ width: 228, height: 200 });
  for (const index of [0, 4]) {
    await page.locator('.react-flow__node-module button').nth(index).click();
    await expect(page.locator('.react-flow__node-stage')).toHaveCount(4);
    await page.getByRole('button', { name: 'Назад ко всем модулям' }).click();
    await expect(page.locator('.react-flow__node-module')).toHaveCount(5);
  }
  await page.screenshot({ path: testInfo.outputPath('modules-compact.png'), fullPage: true });
});
