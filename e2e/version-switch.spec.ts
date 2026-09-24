// Переключатель версий карты в настоящем браузере (process-map-0c5.10).
//
// ЧТО ЗДЕСЬ ЕСТЬ ТАКОГО, ЧЕГО НЕТ В ЮНИТ-ТЕСТАХ. Механика переключения покрыта
// в tests/versions.test.tsx и tests/versionSwitcher.test.tsx, и повторять её
// незачем. В браузер вынесено ровно то, что в jsdom не проверяется вовсе:
//
//  · КЛИК ДОХОДИТ. jsdom не делает hit-testing, поэтому «кнопка есть в DOM» там
//    не значит «по ней можно попасть». Шапка и тулбар лежат поверх полотна
//    React Flow, и это штатная ловушка проекта: перекрытый элемент остаётся
//    `toBeVisible()`. Проверка идёт через document.elementFromPoint.
//  · ГЕОМЕТРИЯ. В jsdom нет layout: ни ширина кнопок, ни то, что они помещаются
//    в 1024 px, ни высота шапки 44 px там не существуют.
//  · ОБЕ ВЕРСИИ РЕАЛЬНО В БАНДЛЕ. Юнит-тест берёт их через тот же алиас, что и
//    сборка; здесь страница грузится как у читателя.
//  · ЧИСТАЯ КОНСОЛЬ. Error boundary в приложении нет ни одного: непойманное
//    исключение размонтирует корень и даёт белый экран.
//
// Спек лежит в корне e2e/, значит гоняется только в проекте snp — у карты mrp
// второй версии не объявлено, и переключателя там нет вовсе.
import type { Page } from '@playwright/test';
import { overridesKey } from './helpers';
import { expect, test } from './fixtures';

const VIEWPORT = { width: 1280, height: 720 };
const NARROW = { width: 1024, height: 600 };

/*
 * Подписи и id дублируются строками, а не импортируются из src/ — правило
 * корпуса: e2e проверяет то, что видит пользователь, и переименование ключа в
 * i18n не должно проходить незамеченным.
 */
const DEFAULT_VERSION = { id: 'snp', label: 'Основные этапы', stages: 4 };
const ALT_VERSION = { id: 'inplan-model', label: 'Полная модель', stages: 10 };
const VERSION_GROUP = 'Версия карты';

/** Кнопка версии внутри группы переключателя, а не любая кнопка с таким текстом. */
function versionButton(page: Page, label: string) {
  return page.getByRole('group', { name: VERSION_GROUP }).getByRole('button', { name: label });
}

/**
 * Клик настоящей мышью с hit-тестом — приём из e2e/json-transfer.spec.ts.
 * `toBeVisible()` здесь не доказывает ничего: шапка лежит поверх полотна.
 */
async function clickVersion(page: Page, label: string): Promise<void> {
  const button = versionButton(page, label);
  await expect(button).toBeVisible();
  const box = await button.boundingBox();
  expect(box, `кнопка «${label}» без геометрии`).not.toBeNull();
  const x = (box?.x ?? 0) + (box?.width ?? 0) / 2;
  const y = (box?.y ?? 0) + (box?.height ?? 0) / 2;

  const hits = await page.evaluate(
    ({ x, y, label }) =>
      document.elementFromPoint(x, y)?.closest('button')?.textContent?.trim() === label,
    { x, y, label },
  );
  expect(hits, `клик по «${label}» перекрыт другим элементом`).toBe(true);

  await page.mouse.click(x, y);
  await expect(button).toHaveAttribute('aria-pressed', 'true');
}

const STAGE_CARD = '.react-flow__node-stage';
const STEP_CARD = '.react-flow__node-step';

/**
 * Открывает приложение и ждёт, пока полотно нарисуется.
 *
 * Селектор ожидания — параметр, а не константа: адрес с `?stage=` открывает
 * приложение СРАЗУ на уровне 2, где карточек обзора нет вовсе, и ожидание
 * `.react-flow__node-stage` там висит до таймаута. Ошибка была в этом хелпере,
 * а не в приложении.
 */
async function openApp(page: Page, search = '', waitFor: string = STAGE_CARD): Promise<void> {
  await page.setViewportSize(VIEWPORT);
  await page.goto(`/${search}`);
  await page.waitForSelector(waitFor);
}

test.describe('переключатель версий', () => {
  test('виден читателю в режиме просмотра и по нему можно попасть мышью', async ({ page }) => {
    await openApp(page);

    // Режим редактора НЕ включается: контрол предназначен читателю вики.
    await expect(page.getByRole('button', { name: 'Экспорт JSON' })).toHaveCount(0);

    const group = page.getByRole('group', { name: VERSION_GROUP });
    await expect(group.getByRole('button')).toHaveCount(2);
    await expect(versionButton(page, DEFAULT_VERSION.label)).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(versionButton(page, ALT_VERSION.label)).toHaveAttribute('aria-pressed', 'false');

    await clickVersion(page, ALT_VERSION.label);
  });

  test('переключение меняет заголовок, число этапов, полотно и подпись рамки', async ({ page }) => {
    await openApp(page);
    const heading = page.getByRole('heading', { level: 1 });
    const before = await heading.textContent();
    await expect(page.locator(STAGE_CARD)).toHaveCount(DEFAULT_VERSION.stages);

    await clickVersion(page, ALT_VERSION.label);

    /*
     * Карточки полотна — главная проверка. Мутация «не звать refreshProcessMap»
     * сменила бы шапку и оставила полотно прежним: снаружи это выглядит как
     * работающее переключение, поэтому одного заголовка мало.
     */
    await expect(page.locator(STAGE_CARD)).toHaveCount(ALT_VERSION.stages);
    await expect(heading).not.toHaveText(before ?? '');
    await expect(page.getByText(`${ALT_VERSION.stages} этапов`, { exact: true })).toBeVisible();
    // Подпись рамки вокруг потока этапов берётся из данных версии.
    await expect(page.getByText('Все модули In.Plan').first()).toBeVisible();
  });

  /*
   * НА УРОВНЕ 2 ПЕРЕКЛЮЧАТЕЛЯ НЕТ, и это решение, а не упущение: там нет шапки
   * вовсе, только крошки. Контрол, который выкидывает пользователя из того
   * места, где он стоит (этапы у версий разные, и переключение обязано вернуть
   * на обзор), читался бы как ошибка.
   *
   * Проверка нужна именно здесь: юнит-тест на отсутствие элемента слишком
   * дёшев, чтобы что-то доказать, а в браузере это ещё и подтверждает, что
   * шапка со всеми её контролами действительно не рендерится на уровне 2.
   */
  test('на уровне 2 переключателя нет, а после возврата адрес чистится', async ({ page }) => {
    await openApp(page, '?stage=2', STEP_CARD);
    expect(new URL(page.url()).searchParams.get('stage')).toBe('2');

    await expect(page.getByRole('group', { name: VERSION_GROUP })).toHaveCount(0);

    await page.getByRole('button', { name: 'Назад к обзору процесса' }).click();
    await page.waitForSelector(STAGE_CARD);
    await clickVersion(page, ALT_VERSION.label);

    await expect(page.locator(STAGE_CARD)).toHaveCount(ALT_VERSION.stages);
    const params = new URL(page.url()).searchParams;
    expect(params.get('stage'), 'номер этапа прежней версии остался в адресе').toBeNull();
    expect(params.get('version')).toBe(ALT_VERSION.id);
  });
});

test.describe('версия в адресе', () => {
  /*
   * ГЛАВНЫЙ СЦЕНАРИЙ АДРЕСА. Седьмого этапа у карты по умолчанию нет вовсе —
   * значит этот адрес открывается правильно ТОЛЬКО если версия разобрана до
   * номера этапа. При обратном порядке экран остался бы на обзоре, выглядя
   * при этом совершенно рабочим.
   */
  test('?version=…&stage=7 открывает седьмой этап именно той версии', async ({ page }) => {
    await openApp(page, `?version=${ALT_VERSION.id}&stage=7`, STEP_CARD);

    await expect(page.locator(STEP_CARD).first()).toBeVisible();
    await expect(page.getByText('Этап 7', { exact: true })).toBeVisible();
    await expect(page.getByText('Все модули In.Plan')).toBeVisible();
  });

  test('неизвестная версия оставляет карту по умолчанию', async ({ page }) => {
    await openApp(page, '?version=версии-такой-нет');

    await expect(page.locator(STAGE_CARD)).toHaveCount(DEFAULT_VERSION.stages);
    await expect(versionButton(page, DEFAULT_VERSION.label)).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  /*
   * Адрес карты по умолчанию обязан остаться пустым: иначе каждая ссылка из
   * вики обросла бы параметром, который ничего не меняет.
   */
  test('адрес версии по умолчанию не обрастает параметром', async ({ page }) => {
    await openApp(page, `?version=${ALT_VERSION.id}`);
    expect(new URL(page.url()).searchParams.get('version')).toBe(ALT_VERSION.id);

    await clickVersion(page, DEFAULT_VERSION.label);

    expect(new URL(page.url()).searchParams.get('version')).toBeNull();
  });
});

test('правки версий лежат в разных ключах localStorage', async ({ page }) => {
  await openApp(page);
  await page.evaluate(
    ({ key }) => {
      window.localStorage.setItem(key, JSON.stringify({ 'какой-то-узел': { screen: null } }));
    },
    { key: overridesKey(DEFAULT_VERSION.id) },
  );

  await clickVersion(page, ALT_VERSION.label);

  const keys = await page.evaluate(() => Object.keys(window.localStorage));
  expect(keys).toContain(overridesKey(DEFAULT_VERSION.id));
  /*
   * Ключ второй версии на этом шаге ещё не создан — правок в неё не вносили, а
   * чтение хранилища ключей не заводит. Важно другое: показ второй версии НЕ
   * трогает чужой ключ. Раньше карты жили на разных адресах, и такой сценарий
   * был невозможен физически.
   */
  expect(keys).not.toContain(overridesKey(ALT_VERSION.id));
});

test.describe('узкий экран 1024×600', () => {
  test('шапка 44 px, обе кнопки версии целиком в кадре', async ({ page }) => {
    await page.setViewportSize(NARROW);
    await page.goto('/');
    await page.waitForSelector(STAGE_CARD);

    const header = await page.locator('header').boundingBox();
    expect(Math.round(header?.height ?? 0)).toBe(44);

    for (const label of [DEFAULT_VERSION.label, ALT_VERSION.label]) {
      const box = await versionButton(page, label).boundingBox();
      expect(box, `кнопка «${label}» без геометрии`).not.toBeNull();
      expect(box?.x ?? -1, `кнопка «${label}» уехала за левый край`).toBeGreaterThanOrEqual(0);
      expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(NARROW.width);
    }

    // Горизонтальной прокрутки от переключателя не появляется.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test('переключение на узком экране доходит и меняет полотно', async ({ page }) => {
    await page.setViewportSize(NARROW);
    await page.goto('/');
    await page.waitForSelector(STAGE_CARD);

    await clickVersion(page, ALT_VERSION.label);

    await expect(page.locator(STAGE_CARD)).toHaveCount(ALT_VERSION.stages);
  });
});

/*
 * ЧИСТАЯ КОНСОЛЬ — часть критерия приёмки проекта, и на карте из модели она не
 * формальность: 454 узла и 224 связи, а error boundary в приложении нет ни
 * одного — непойманное исключение размонтирует корень и даст белый экран.
 * Отдельно сторожится предупреждение о повторяющихся ключах React: оно уже
 * ловилось на дублях ключевых выходов (process-map-xsk).
 */
test('переключение не даёт ни ошибок страницы, ни жалоб React на ключи', async ({ page }) => {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text());
    }
  });

  await openApp(page);
  await clickVersion(page, ALT_VERSION.label);
  await expect(page.locator(STAGE_CARD)).toHaveCount(ALT_VERSION.stages);
  await clickVersion(page, DEFAULT_VERSION.label);
  await expect(page.locator(STAGE_CARD)).toHaveCount(DEFAULT_VERSION.stages);

  expect(pageErrors).toEqual([]);
  expect(consoleErrors.filter((text) => text.includes('same key'))).toEqual([]);
});
