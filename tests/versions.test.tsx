// Две версии карты в одном бандле и переключение между ними (process-map-0c5.6).
//
// ГЛАВНОЕ, ЧТО ЗДЕСЬ ПРОВЕРЯЕТСЯ, — не то, что переключение работает, а то, что
// версии НЕ ЗАДЕВАЮТ ДРУГ ДРУГА: правки каждой лежат в своём ключе, и
// «Сбросить правки» на одной не стирает черновик другой. Это тот же инвариант,
// ради которого SPEC §3 когда-то развёл ключи по картам, — только теперь карты
// живут на одном адресе, и проверить его стало важнее.
//
// СТРАНИЦА ИЗ ФИКСТУР (process-map-9mn.34). Механика версий не должна зависеть
// от того, у какой карты в этой сборке есть вторая версия: у страницы юнит-тестов
// (snp) она сегодня есть, после process-map-9mn.20 её не будет. Поэтому данные
// обеих версий подменены фикстурами (tests/fixtures/pageMocks.ts), а versions.ts,
// loader.ts, store и App работают по-настоящему. Что вторая версия реально
// попадает в бандл страницы по умолчанию, сторожит tests/mapRegistry.test.ts —
// это вопрос конфигурации сборки, а не механики.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import App from '../src/App';
import { clearImportedMap, setImportedMap } from '../src/data/activeMap';
import {
  loadBaseProcessMap,
  OVERRIDES_KEY,
  resetOverrides,
  setNodeOverride,
} from '../src/data/loader';
import { overridesStorageKey, ProcessMapSchema } from '../src/data/schema';
import {
  DEFAULT_VERSION_ID,
  getSelectedVersionId,
  hasVersion,
  listVersions,
  resetSelectedVersion,
} from '../src/data/versions';
import { selectVersion } from '../src/data/versionSwitch';
import { refreshProcessMap } from '../src/hooks/useProcessMap';
import { ru } from '../src/i18n/ru';
import { createInitialState, useProcessStore } from '../src/store/useProcessStore';
import {
  FIXTURE_ALT_ID,
  FIXTURE_DEFAULT_ID,
  fixtureAltVersion,
  fixtureDefaultVersion,
} from './fixtures/pageMocks';
import { buildSampleProcessMap } from './fixtures/sample-process';

// Порядок и форма — дословно из шапки tests/fixtures/pageMocks.ts.
vi.mock('@map/process.json', async () =>
  (await import('./fixtures/pageMocks')).defaultVersionModule(),
);
vi.mock('@map-alt/process.json', async () =>
  (await import('./fixtures/pageMocks')).altVersionModule(),
);

/*
 * Вторая версия называется КОНСТАНТОЙ, а не ищется в listVersions(). Поиск
 * «первой версии, не равной умолчанию» нашёл бы что угодно — в том числе
 * настоящую карту, если подмена @map-alt однажды отвалится, — и тесты
 * продолжили бы зеленеть на чужих данных.
 */
const ALT = FIXTURE_ALT_ID;

beforeEach(() => {
  localStorage.clear();
  useProcessStore.setState(createInitialState());
  clearImportedMap();
  resetSelectedVersion();
  refreshProcessMap();
});

afterEach(() => {
  clearImportedMap();
  resetSelectedVersion();
  refreshProcessMap();
});

describe('реестр версий', () => {
  /*
   * Сторож самой страницы из фикстур. Отвались любая из двух подмен — список
   * перестанет совпадать: без @map первой встанет настоящая карта, без @map-alt
   * второй — настоящая вторая версия (или её не будет вовсе). Сравнивается
   * СОСТАВ, а не длина: у настоящей страницы тоже бывает две версии.
   *
   * Заголовок и число этапов считает versions.ts из данных версии — они же
   * стоят в шапке, и разъехаться им негде.
   */
  it('на странице ровно две версии фикстур, первая — по умолчанию', () => {
    expect(
      listVersions(),
      'страница из фикстур не собралась: проверьте оба vi.mock в начале файла',
    ).toEqual([
      { id: FIXTURE_DEFAULT_ID, title: fixtureDefaultVersion().title, stages: 4 },
      { id: FIXTURE_ALT_ID, title: fixtureAltVersion().title, stages: 7 },
    ]);
    expect(DEFAULT_VERSION_ID).toBe(FIXTURE_DEFAULT_ID);
    expect(getSelectedVersionId()).toBe(FIXTURE_DEFAULT_ID);
  });

  /*
   * Вторая версия страницы из фикстур — БЕЗ модулей, и это предпосылка, а не
   * деталь фикстуры (почему — fixtureAltVersion в tests/fixtures/pageMocks.ts).
   * Трёхуровневая фикстура, из которой она собрана, модули имеет; перестань
   * pageMocks их вырезать — карта по мере эпика M8 начнёт открываться экраном
   * модулей, и тесты обзора в этом и соседних файлах молча стали бы проверять
   * другой экран. Проверка списка выше этого не видит: заголовок и число
   * этапов от модулей не зависят.
   */
  it('вторая версия фикстур — без модулей', () => {
    const why =
      'pageMocks.fixtureAltVersion() обязан вырезать modules и moduleEdges: тесты механики ' +
      'версий смотрят на обзор этапов, а карта с модулями открывается другим экраном.';
    expect(fixtureAltVersion().modules, why).toBeUndefined();
    expect(fixtureAltVersion().moduleEdges, why).toBeUndefined();
  });

  /*
   * Встроенная вторая версия — НЕ загруженный файл, и отличие видно в двух
   * местах: на экране нет бейджа подмены, а правки ложатся в обычный ключ
   * версии, а не в пространство имён загруженных файлов (`imported:`).
   * Страница из фикстур этого различия не стирает — ради него она собрана
   * подменой JSON, а не через applyImportedMap(), который показал бы фикстуру
   * чужим файлом.
   *
   * Бейдж судится на настоящем App после переключения: выбор версии, который
   * однажды пойдёт через подмену карты (или шапка, принявшая «не версию по
   * умолчанию» за загруженный файл), сказал бы читателю вики «чужой файл»
   * о карте проекта.
   */
  it('версии этой страницы — встроенные, а не загруженные', async () => {
    await act(async () => {
      render(<App />);
    });

    await act(async () => {
      selectVersion(ALT);
    });

    // Без этой строки отсутствие бейджа ничего бы не доказывало: переключение,
    // которое не сработало вовсе, тоже оставило бы шапку без бейджа.
    expect(screen.getByRole('heading', { name: fixtureAltVersion().title })).toBeInTheDocument();
    expect(
      screen.queryByText(ru.toolbar.importedBadge),
      'встроенная версия показана с бейджем «Загруженная схема»',
    ).toBeNull();

    setNodeOverride(loadBaseProcessMap().stages[0]?.nodes[0]?.id as string, {
      title: 'Экран модели',
      url: 'https://example.com/b',
    });
    // Сначала — ключ загруженного файла: это и есть вопрос теста, и при
    // дефекте падать надо на нём, с его сообщением, а не строкой ниже.
    expect(
      localStorage.getItem(`inplan-process-map:imported:${ALT}:overrides:v1`),
      'правки встроенной версии легли в ключ загруженного файла',
    ).toBeNull();
    // И правка вообще записалась — иначе пустой ключ выше ничего не доказывал бы.
    expect(localStorage.getItem(overridesStorageKey(ALT))).not.toBeNull();
  });
});

describe('переключение версии', () => {
  it('отдаёт карту выбранной версии, а возврат — прежнюю', () => {
    const defaultStages = loadBaseProcessMap().stages.length;

    expect(selectVersion(ALT)).toBe(true);
    expect(loadBaseProcessMap().id).toBe(ALT);
    expect(loadBaseProcessMap().stages.length).not.toBe(defaultStages);

    expect(selectVersion(DEFAULT_VERSION_ID)).toBe(true);
    expect(loadBaseProcessMap().id).toBe(DEFAULT_VERSION_ID);
    expect(loadBaseProcessMap().stages.length).toBe(defaultStages);
  });

  /*
   * Значение приходит в том числе из адреса (`?v=`), а битый параметр по
   * действующему правилу оставляет экран на месте. Молчаливый откат на вторую
   * версию был бы тем же дефектом, что «неизвестный MAP роняет сборку»
   * предотвращает на сборке.
   */
  it('неизвестный id ничего не меняет и говорит об этом', () => {
    expect(selectVersion('версии-такой-нет')).toBe(false);
    expect(getSelectedVersionId()).toBe(DEFAULT_VERSION_ID);
    expect(hasVersion('версии-такой-нет')).toBe(false);
  });

  /*
   * РЕГРЕССИЯ, РАДИ КОТОРОЙ ПОРЯДОК В selectVersion ИМЕННО ТАКОЙ.
   * `currentStageId` — id этапа ТЕКУЩЕЙ версии; в настоящей другой версии
   * такого этапа нет, и StageDetail вернул бы пустой экран, из которого не
   * выйти: крошки с кнопкой «Назад» рендерятся ниже этого return.
   *
   * У фикстур id этапов совпадают (`stage-2` есть в обеих), и это не ослабляет
   * проверку: судится сброс уровня, а не то, нашёлся ли этап. Наоборот, без
   * сброса здесь открылся бы ЧУЖОЙ этап 2 — дефект, который на экране выглядел
   * бы рабочим.
   */
  it('переключение с уровня 2 возвращает на обзор', () => {
    const stageId = loadBaseProcessMap().stages[1]?.id;
    expect(stageId).toBeDefined();
    useProcessStore.setState({ currentStageId: stageId as string });

    selectVersion(ALT);

    expect(useProcessStore.getState().currentStageId).toBeNull();
  });

  /*
   * ТО ЖЕ С УРОВНЯ 3 (process-map-9mn.12). Переключение начинается С УРОВНЯ
   * ШАГОВ намеренно: с уровня 2 (модуль выбран, этапа нет) оставленный в
   * selectVersion back() снял бы модуль, и тест зеленел бы. С уровня шагов
   * back() снимает только этап, и currentModuleId остался бы указывать на
   * модуль прежней версии.
   *
   * Трёхуровневой версии у страницы из фикстур нет, и это решение, а не
   * пробел (см. «вторая версия фикстур — без модулей» выше). Для store это
   * неважно: карту он не знает, уровень 3 для него — пара скаляров, и судится
   * здесь сброс store, а не экран. Id модуля выдуман намеренно: модулей нет
   * ни у одной версии страницы, и id из трёхуровневой фикстуры намекал бы на
   * связь с ней, которой нет.
   */
  it('переключение с уровня шагов сбрасывает и модуль', () => {
    const stageId = loadBaseProcessMap().stages[1]?.id as string;
    useProcessStore.getState().navigateToModule('модуль-прежней-версии');
    useProcessStore.getState().navigateToStage(stageId);
    expect(useProcessStore.getState().currentModuleId).toBe('модуль-прежней-версии');

    selectVersion(ALT);

    expect(useProcessStore.getState().currentModuleId).toBeNull();
    expect(useProcessStore.getState().currentStageId).toBeNull();
  });

  /*
   * ТО ЖЕ, НО НА НАСТОЯЩЕМ ЭКРАНЕ. Проверка выше судит по состоянию store, а
   * пользователю важен экран: пустой уровень 2 без крошек — это тупик, из
   * которого выходят только перезагрузкой.
   *
   * Порядок «back() до подмены» в selectVersion этим тестом НЕ проверяется и
   * проверен быть не может: React 18 батчит обновления, промежуточный рендер с
   * чужим currentStageId в jsdom не наблюдается, и мутация «поменять строки
   * местами» его переживает. Порядок остаётся защитой в глубину — ровно как в
   * mapSwitch.ts, где рядом стоит вторая защита в самом StageDetail.
   *
   * Зато САМО отсутствие back() на странице из фикстур этот тест ловит (мутация
   * проверена): `stage-2` есть и во второй версии, вторая защита StageDetail не
   * срабатывает, и на экране остаётся этап 2 чужой версии без заголовка карты.
   */
  it('после переключения с уровня 2 на экране обзор новой версии, а не пустота', async () => {
    const stageId = loadBaseProcessMap().stages[1]?.id as string;
    useProcessStore.setState({ currentStageId: stageId });
    await act(async () => {
      render(<App />);
    });

    await act(async () => {
      selectVersion(ALT);
    });

    expect(screen.getByRole('heading', { name: fixtureAltVersion().title })).toBeInTheDocument();
  });

  it('переключение снимает загруженную пользователем схему', () => {
    setImportedMap(ProcessMapSchema.parse({ ...buildSampleProcessMap(), id: 'files-map' }));
    refreshProcessMap();
    expect(loadBaseProcessMap().id).toBe('files-map');

    selectVersion(ALT);

    expect(loadBaseProcessMap().id).toBe(ALT);
  });
});

describe('изоляция правок между версиями', () => {
  /*
   * ГЛАВНЫЙ ТЕСТ ЗАДАЧИ. Обе версии раздаются с ОДНОГО адреса, а localStorage
   * общий на origin: с единым ключом правка, сделанная на одной версии,
   * подмешивалась бы к другой, где узла с таким id нет вовсе, — или, хуже,
   * случайно совпала бы.
   */
  it('правки версий лежат в разных ключах', () => {
    const defaultNode = loadBaseProcessMap().stages[0]?.nodes[0]?.id as string;
    setNodeOverride(defaultNode, { title: 'Экран умолчания', url: 'https://example.com/a' });

    selectVersion(ALT);
    const altNode = loadBaseProcessMap().stages[0]?.nodes[0]?.id as string;
    setNodeOverride(altNode, { title: 'Экран модели', url: 'https://example.com/b' });

    expect(localStorage.getItem(OVERRIDES_KEY)).not.toBeNull();
    expect(localStorage.getItem(`inplan-process-map:${ALT}:overrides:v1`)).not.toBeNull();
    // Что ключ загруженного файла при этом не задет, судит «версии этой
    // страницы — встроенные, а не загруженные» выше: это вопрос «встроенная
    // или чужой файл», а не «одна версия или другая».
  });

  it('«Сбросить правки» на одной версии не трогает ключ другой', () => {
    setNodeOverride(loadBaseProcessMap().stages[0]?.nodes[0]?.id as string, {
      title: 'Экран умолчания',
      url: 'https://example.com/a',
    });
    const before = localStorage.getItem(OVERRIDES_KEY);
    expect(before).not.toBeNull();

    selectVersion(ALT);
    setNodeOverride(loadBaseProcessMap().stages[0]?.nodes[0]?.id as string, {
      title: 'Экран модели',
      url: 'https://example.com/b',
    });
    resetOverrides();

    expect(localStorage.getItem(`inplan-process-map:${ALT}:overrides:v1`)).toBeNull();
    expect(localStorage.getItem(OVERRIDES_KEY)).toBe(before);
  });

  it('правки версии переживают уход на другую и возврат', () => {
    selectVersion(ALT);
    const nodeId = loadBaseProcessMap().stages[0]?.nodes[0]?.id as string;
    setNodeOverride(nodeId, { title: 'Экран модели', url: 'https://example.com/b' });

    selectVersion(DEFAULT_VERSION_ID);
    selectVersion(ALT);

    expect(loadBaseProcessMap().stages[0]?.nodes[0]?.id).toBe(nodeId);
    expect(localStorage.getItem(`inplan-process-map:${ALT}:overrides:v1`)).not.toBeNull();
  });
});
