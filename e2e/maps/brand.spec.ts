import { expect, test } from '../fixtures';
import { firstStepWithoutLink } from '../helpers';

for (const size of [
  { width: 1280, height: 720 },
  { width: 1024, height: 600 },
]) {
  test(`фирменный стиль и локальные шрифты ${size.width}×${size.height}`, async ({
    page,
  }, testInfo) => {
    const externalRequests: string[] = [];
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('**/*', async (route) => {
      const url = new URL(route.request().url());
      if (url.hostname === 'localhost' || url.protocol === 'data:') {
        await route.continue();
      } else {
        externalRequests.push(url.href);
        await route.abort();
      }
    });
    await page.setViewportSize(size);
    await page.goto('/');
    const overviewCard = page
      .locator('.react-flow__node-module button, .react-flow__node-stage button')
      .first();
    await expect(overviewCard).toBeVisible();
    await page.evaluate(() => document.fonts.ready);

    await expect(page.locator('body')).toHaveCSS('color', 'rgb(4, 20, 58)');
    await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(244, 246, 250)');
    await expect(overviewCard).toHaveCSS('font-family', /Manrope/);
    await expect(overviewCard).toHaveCSS('background-color', 'rgb(227, 233, 255)');
    const fonts = await page.evaluate(() => ({
      loaded: [...document.fonts]
        .filter((font) => font.status === 'loaded')
        .map((font) => font.family),
      urls: performance
        .getEntriesByType('resource')
        .map((resource) => resource.name)
        .filter((url) => url.includes('.woff2')),
    }));
    expect(fonts.loaded).toContain('Manrope');
    expect(fonts.urls.some((url) => url.includes('manrope-cyrillic'))).toBe(true);
    expect(fonts.urls.some((url) => url.includes('open-sans'))).toBe(false);
    await page.screenshot({ path: testInfo.outputPath('brand-overview.png') });

    if (testInfo.project.name === 'inplan') {
      await page.locator('.react-flow__node-module button').first().click();
    }
    await page.locator('.react-flow__node-stage button').first().click();
    expect(
      await page.getByRole('banner').evaluate((header) => header.scrollWidth <= header.clientWidth),
    ).toBe(true);
    await page.getByRole('button', { name: 'Редактор', exact: true }).click();
    const stepId = await firstStepWithoutLink(page);
    await page.locator(`[data-id="${stepId}"] button`).first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveCSS('font-family', /Manrope/);
    const open = dialog.getByRole('button', { name: 'Открыть в модуле' });
    await expect(open).toBeDisabled();
    await expect(open).toHaveCSS('background-color', 'rgb(244, 246, 250)');
    await expect(open).toHaveCSS('color', 'rgb(191, 191, 193)');

    await dialog.getByRole('button', { name: 'Добавить', exact: true }).click();
    await dialog.getByLabel('Название экрана').fill('Планирование поставок');
    const url = dialog.getByLabel('URL', { exact: true });
    await url.fill('javascript:alert(1)');
    const save = dialog.getByRole('button', { name: 'Сохранить', exact: true });
    await expect(save).toHaveCSS('background-color', 'rgb(66, 100, 245)');
    await save.click();
    await url.focus();
    await expect(url).toHaveAttribute('aria-invalid', 'true');
    await expect(url).toHaveCSS('border-top-color', 'rgb(238, 68, 68)');
    await expect(url).toHaveCSS('box-shadow', /rgb\(238, 68, 68\)/);
    await url.fill('https://example.com/plan');
    await url.focus();
    await expect(url).toHaveCSS('border-top-color', 'rgb(71, 105, 255)');
    await page.keyboard.press('Tab');
    const linkForm = dialog.getByRole('form', { name: 'Ссылка на экран' });
    await expect(linkForm.getByRole('button', { name: 'Отмена', exact: true })).toBeFocused();
    await expect(linkForm.getByRole('button', { name: 'Отмена', exact: true })).toHaveCSS(
      'outline-color',
      'rgb(71, 105, 255)',
    );
    await page.screenshot({ path: testInfo.outputPath('brand-editor.png') });

    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    expect(externalRequests).toEqual([]);
    expect(errors).toEqual([]);
  });
}
