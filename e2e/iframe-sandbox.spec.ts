// Встраивание в iframe с разными атрибутами sandbox (README «Условие 2»).
//
// ЗАЧЕМ ЭТОТ ФАЙЛ. Приложение живёт в iframe на странице вики In.Plan, но все
// остальные спеки гоняют его верхним документом. Значит требование README —
// «либо без sandbox, либо allow-popups + allow-scripts + allow-same-origin» —
// до сих пор было обещанием, которое ничем не проверялось; ограничение так и
// записано в закрытии process-map-6ap. Здесь оно становится проверяемым.
//
// ПОЧЕМУ ИМПОРТ НЕ ИЗ './fixtures'. Авто-fixture там зовёт interceptWindowOpen,
// который ПОДМЕНЯЕТ window.open заглушкой, возвращающей null, а addInitScript
// доходит и до дочерних фреймов. Подмена замаскировала бы ровно то, ради чего
// спек написан: настоящую блокировку всплывающего окна флагом sandbox. Если
// кто-то будет «унифицировать импорты» — компиляция не сломается, сломается
// предмет теста. Сначала прочитать этот абзац.
import { expect, test, type FrameLocator, type Page } from '@playwright/test';

// ─────────────────────────────── фикстуры ───────────────────────────────
//
// Источник — src/data/process.json, задача process-map-lqa. Это единственная
// настоящая ссылка на экран во всей карте, и она же единственная фикстура,
// работающая во ВСЕХ сценариях ниже: посеять свою через localStorage нельзя —
// при sandbox без allow-same-origin хранилище недоступно (loader.ts глушит
// ошибку), и посев молча не сработал бы.
const TARGET_NODE = 'zapusk-algoritma-optimizator-evristika';
const NODE_LABEL = 'Запуск алгоритма (оптимизатор/эвристика)';
const SCREEN_URL = 'https://front-prod.k8s.demo5.in-plan.ru/snp-process-map';
const OPEN_IN_MODULE = 'Открыть в модуле';

/**
 * Хозяин и фрейм на ОДНОМ origin — и это не упрощение, а вынужденно.
 *
 * В проде они на разных доменах (SPEC §6), и первая версия спека это
 * воспроизводила: хозяин по 127.0.0.1:5173, фрейм по localhost:5173 — тот же
 * сервер, разные origin. Chromium такой фрейм не грузит вовсе:
 * ERR_BLOCKED_BY_LOCAL_NETWORK_ACCESS_CHECKS — запрос со страницы на 127.0.0.1
 * к localhost считается обращением в локальную сеть и блокируется до всякого
 * sandbox. Обходить это флагами запуска браузера значило бы менять поведение
 * самого браузера ради теста.
 *
 * На предмет спека это не влияет: `allow-same-origin` тем и работает, что при
 * его ОТСУТСТВИИ фрейму навязывается opaque origin — независимо от того,
 * совпадали origin изначально или нет. То есть все четыре сценария ниже
 * воспроизводятся и на одном origin. Не воспроизводится только кросс-доменность
 * сама по себе — но её ось (доступ к top.document) из кода удалена в
 * process-map-6ap и больше ни на что не влияет.
 */
const APP_ORIGIN = 'http://localhost:5173';
const HOST_ORIGIN = APP_ORIGIN;
const HOST_PATH = '/__e2e-sandbox-host.html';

/** Свои хосты — всё остальное уходит в карантин, см. beforeEach. */
const OWN_HOSTS = new Set(['localhost', '127.0.0.1']);

declare global {
  interface Window {
    __openAttempts?: [string, string][];
  }
}

/**
 * Разметка страницы-хозяина. `sandbox === null` — атрибута нет вовсе.
 *
 * Ссылка #control нужна отрицательному сценарию: см. комментарий там.
 */
function hostHtml(sandbox: string | null): string {
  const attr = sandbox === null ? '' : ` sandbox="${sandbox}"`;
  const src = `${APP_ORIGIN}/?stage=2&node=${TARGET_NODE}`;
  return `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><title>iframe host</title>
<style>html,body{margin:0;background:#fff}iframe{display:block;border:0;width:1280px;height:720px}</style>
</head><body>
<a id="control" href="about:blank" target="_blank">control</a>
<iframe id="map" title="Карта процесса" src="${src}"${attr}></iframe>
</body></html>`;
}

/**
 * Поднимает хозяина с нужным sandbox и отдаёт локатор фрейма.
 *
 * Путь выдуманный и на диске не существует. Расширение .html намеренно:
 * SPA-fallback vite не переписывает пути с точкой, поэтому при потере маршрута
 * тест получит честный 404, а не вторую копию приложения, притворившуюся
 * хозяином, — то есть упадёт понятно, а не загадочно.
 */
async function openHost(page: Page, sandbox: string | null): Promise<FrameLocator> {
  await page.route(/\/__e2e-sandbox-host\.html(?:[?#]|$)/, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'text/html; charset=utf-8',
      body: hostHtml(sandbox),
    }),
  );
  await page.goto(`${HOST_ORIGIN}${HOST_PATH}`);
  return page.frameLocator('#map');
}

/**
 * Готовность приложения ВНУТРИ фрейма и кнопка, по которой есть смысл кликать.
 *
 * До кнопки идём deep-link'ом (`?stage=&node=` в src фрейма), а не кликом по
 * полотну: узел лежит далеко справа, и кликать по нему пришлось бы через
 * панорамирование. Deep-link сам открывает уровень 2 с раскрытой панелью — это
 * уже закреплено в e2e/deep-link.spec.ts.
 */
async function readyOpenButton(frame: FrameLocator) {
  const dialog = frame.getByRole('dialog');
  await expect(dialog).toBeVisible();
  // Заголовок панели — доказательство, что deep-link разобран и открыт ИМЕННО
  // тот узел. Без этой проверки диагностика при чужом dev-сервере на 5173
  // свелась бы к таймауту в пустоту.
  await expect(dialog.getByRole('heading', { level: 2 })).toHaveText(NODE_LABEL);

  const button = dialog.getByRole('button', { name: OPEN_IN_MODULE });
  // ОБЯЗАТЕЛЬНО. Без screen у узла кнопка disabled, клик — no-op, попапа нет, и
  // отрицательный сценарий позеленел бы по неверной причине. Если владелец
  // перенесёт ссылку на другой узел, это должно краснеть, а не молчать.
  await expect(button).toBeEnabled();
  return button;
}

/** Что приложение во фрейме пыталось открыть: пары [url, target]. */
async function openAttempts(frame: FrameLocator): Promise<[string, string][]> {
  return frame.locator('body').evaluate(() => window.__openAttempts ?? []);
}

/** Куда ушли запросы за пределы своих хостов. Заполняется карантином. */
let external: string[];

test.beforeEach(async ({ page, context }) => {
  // Хозяин должен быть больше фрейма, иначе iframe обрежется и клик заспорит с
  // actionability. 720 > config.compactHeight (640) — фрейм в обычном режиме.
  await page.setViewportSize({ width: 1440, height: 900 });
  external = [];

  // КАРАНТИН. Ссылка узла ведёт на стенд владельца, и запросы туда из тестов
  // недопустимы. page.route на попап НЕ распространяется — попап это отдельная
  // Page, поэтому маршрут ставится на контекст.
  //
  // fulfill, а не abort: при abort итоговый url попапа зависит от того, как
  // браузер отработал сбой навигации, а при fulfill он детерминирован, и на
  // него можно опираться в утверждении.
  //
  // route.continue() в этом файле запрещён: одна такая строка отправит запрос
  // владельцу. Предикат по хосту, а не по адресу, — чтобы опечатка в
  // SCREEN_URL не открыла дыру наружу.
  await context.route(
    (url) => !OWN_HOSTS.has(url.hostname),
    async (route) => {
      external.push(route.request().url());
      await route.fulfill({
        status: 200,
        contentType: 'text/html; charset=utf-8',
        body: '<!doctype html><meta charset="utf-8"><title>e2e stub</title>',
      });
    },
  );

  // ЗАГОЛОВОК ПРОДА, КОТОРОГО НЕТ У DEV-СЕРВЕРА.
  //
  // При sandbox без allow-same-origin фрейм получает opaque origin, и его
  // модульные скрипты запрашиваются с CORS. GitHub Pages отвечает
  // `Access-Control-Allow-Origin: *` (проверено curl'ом на боевом бандле), а
  // vite dev — нет, и приложение во фрейме не грузится вовсе: «Access to script
  // … from origin 'null' has been blocked by CORS policy».
  //
  // То есть без этой строки сценарий без allow-same-origin падал бы не из-за
  // продукта, а из-за стенда теста. Здесь мы приводим локальный сервер к
  // поведению прода, а не ослабляем проверку: сам sandbox, попапы и opaque
  // origin остаются настоящими.
  await context.route(
    (url) => OWN_HOSTS.has(url.hostname),
    async (route) => {
      const response = await route.fetch();
      await route.fulfill({
        response,
        headers: { ...response.headers(), 'access-control-allow-origin': '*' },
      });
    },
  );

  // Регистратор попыток. В отличие от e2e/helpers.ts::interceptWindowOpen он НЕ
  // подменяет поведение: настоящий window.open вызывается, его отказ остаётся
  // настоящим отказом. Нужен затем, чтобы отрицательный сценарий отличал
  // «браузер заблокировал» от «клик не дошёл до кода».
  await page.addInitScript(() => {
    const native = window.open.bind(window);
    window.__openAttempts = [];
    window.open = (url?: string | URL, target?: string): Window | null => {
      window.__openAttempts?.push([String(url), String(target)]);
      return native(url as string, target);
    };
  });
});

// ───────────────────────── разрешённые конфигурации ─────────────────────────

test('без sandbox: «Открыть в модуле» открывает экран в новой вкладке', async ({
  page,
  context,
}) => {
  const frame = await openHost(page, null);
  const button = await readyOpenButton(frame);

  const [popup] = await Promise.all([context.waitForEvent('page'), button.click()]);

  await expect.poll(() => popup.url()).toBe(SCREEN_URL);
  expect(await openAttempts(frame)).toEqual([[SCREEN_URL, '_blank']]);
  // Сетевой свидетель: доказывает и адрес, и что карантин в этот момент работал.
  expect(external).toEqual([SCREEN_URL]);
  await popup.close();
});

test('sandbox по README: allow-popups + allow-scripts + allow-same-origin — экран открывается', async ({
  page,
  context,
}) => {
  const frame = await openHost(page, 'allow-scripts allow-same-origin allow-popups');
  const button = await readyOpenButton(frame);

  const [popup] = await Promise.all([context.waitForEvent('page'), button.click()]);

  await expect.poll(() => popup.url()).toBe(SCREEN_URL);
  expect(external).toEqual([SCREEN_URL]);
  await popup.close();
});

test('sandbox без allow-same-origin: карта работает, экран открывается', async ({
  page,
  context,
}) => {
  // Здесь у фрейма opaque origin (window.origin === 'null'). Проверяется, что
  // карта в этой конфигурации ПОДНИМАЕТСЯ и работает — README «Условие 2»
  // обещает потерю одного лишь localStorage, и это оказалось правдой.
  //
  // Первая редакция плана утверждала обратное: будто здесь падает всё
  // приложение из-за незащищённого replaceState. Мутация это опровергла —
  // снятие защиты оставляет сценарий зелёным, — и зонд показал почему:
  // replaceState смотрит на URL документа, а он настоящий http-адрес.
  // Защита в useDeepLink оставлена как защита в глубину, но обоснование там
  // переписано.
  const frame = await openHost(page, 'allow-scripts allow-popups');
  const button = await readyOpenButton(frame);

  const [popup] = await Promise.all([context.waitForEvent('page'), button.click()]);

  await expect.poll(() => popup.url()).toBe(SCREEN_URL);
  await popup.close();
});

// ─────────────────────── запрещённая конфигурация ───────────────────────

test('sandbox без allow-popups: экран НЕ открывается, но попытка была', async ({
  page,
  context,
}) => {
  const frame = await openHost(page, 'allow-scripts allow-same-origin');
  const button = await readyOpenButton(frame);

  await button.click();

  // Клик ДОШЁЛ до кода: openScreen позвал настоящий window.open ровно один раз
  // и с той целью. Без этой проверки «вкладки нет» означало бы что угодно.
  await expect.poll(() => openAttempts(frame)).toEqual([[SCREEN_URL, '_blank']]);

  // Контрольный попап вместо ожидания «ничего не произошло за N миллисекунд».
  // Он открывается из САМОГО хозяина, у которого sandbox нет, настоящим кликом
  // (то есть с user activation, и блокировщик всплывающих окон ни при чём).
  // События создания страниц приходят по одному каналу в порядке возникновения:
  // раз пришло событие контрольного, событие заблокированного — если бы оно
  // было — пришло бы раньше.
  const [control] = await Promise.all([
    context.waitForEvent('page'),
    page.locator('#control').click(),
  ]);

  // Хозяин и контрольный — и больше ничего. Сравниваем ЧИСЛО страниц, а не
  // адреса: у только что созданного попапа url() ещё может быть about:blank, и
  // проверка по адресу дала бы ложно-зелёное.
  expect(context.pages()).toHaveLength(2);
  // Сетевое подтверждение блокировки, полученное вторым, независимым способом.
  expect(external).toEqual([]);
  await control.close();
});
