// Deep-link трёхуровневой карты: `?module=` рядом с `?stage=`/`?node=`
// (эпик M8, задача process-map-9mn.18).
//
// ТРЁХУРОВНЕВАЯ СТРАНИЦА ИЗ ФИКСТУР (tests/fixtures/pageMocks.ts): по
// умолчанию — трёхуровневая фикстура (модули → этапы → шаги), второй версией —
// двухуровневая. useDeepLink, versions.ts, loader.ts, store и App работают
// по-настоящему; подменены только два JSON-модуля. Сценарии на НАСТОЯЩЕЙ карте
// snp (двухуровневой) остаются в tests/useDeepLink.test.tsx — там же сторож
// «`?module=` на двухуровневой карте игнорируется и стирается».
//
// АДРЕС СРАВНИВАЕТСЯ ЦЕЛИКОМ (window.location.search), а не по params.get().
// Порядок параметров — часть требования (version, module, stage, node), и
// посторонний параметр в адресе — тоже дефект; ни то, ни другое проверкой по
// одному ключу не ловится.
//
// ОЖИДАНИЯ — ИЗ ОБЪЯВЛЕННОГО СОСТАВА (MODULE_STAGE_IDS), а не из moduleOfStage:
// владельца этапа тест берёт мимо проверяемого кода, иначе ошибка в поиске
// владельца переехала бы и в ожидание.
//
// Что НЕ проверяется здесь и почему: настоящий клик мышью (jsdom не делает
// hit-testing — проверяются обработчики, как в tests/levelTwo.test.tsx) и
// длина истории браузера (jsdom её не растит правдоподобно — это
// e2e/deep-link.spec.ts). Здесь — что код приложения ни разу не зовёт pushState.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import App from '../src/App';
import { clearImportedMap } from '../src/data/activeMap';
import { loadBaseProcessMap } from '../src/data/loader';
import { applyImportedMap } from '../src/data/mapSwitch';
import type { Module, Stage } from '../src/data/schema';
import { resetSelectedVersion } from '../src/data/versions';
import { useDeepLink } from '../src/hooks/useDeepLink';
import { refreshProcessMap } from '../src/hooks/useProcessMap';
import { ru } from '../src/i18n/ru';
import { createInitialState, useProcessStore } from '../src/store/useProcessStore';
import { THREE_LEVEL_PAGE_ALT_ID } from './fixtures/pageMocks';
import { buildSampleProcessMap } from './fixtures/sample-process';
import {
  MODULE_DEMAND,
  MODULE_PRODUCTION,
  MODULE_STAGE_IDS,
  MODULE_SUPPLY,
  buildThreeLevelProcessMap,
  parseThreeLevelProcessMap,
} from './fixtures/three-level-process';

// Порядок и форма — дословно из шапки tests/fixtures/pageMocks.ts.
vi.mock('@map/process.json', async () =>
  (await import('./fixtures/pageMocks')).threeLevelDefaultVersionModule(),
);
vi.mock('@map-alt/process.json', async () =>
  (await import('./fixtures/pageMocks')).twoLevelAltVersionModule(),
);

/** Ожидания считаются из самих фикстур — свежих, не тронутых приложением. */
const THREE = buildThreeLevelProcessMap();
const TWO = buildSampleProcessMap();

function stageNumbered(number: number): Stage {
  const stage = THREE.stages.find((candidate) => candidate.number === number);
  if (stage === undefined) {
    throw new Error(`В трёхуровневой фикстуре нет этапа ${number}`);
  }
  return stage;
}

function moduleWithId(id: string): Module {
  const module = THREE.modules.find((candidate) => candidate.id === id);
  if (module === undefined) {
    throw new Error(`В трёхуровневой фикстуре нет модуля ${id}`);
  }
  return module;
}

/**
 * Объявленный состав модуля — с проверкой, а не через `?? []`: переименуй
 * кто-нибудь ключ фикстуры, и цикл по пустому составу прошёл бы молча, ничего
 * не проверив.
 */
function declaredStagesOf(moduleId: string): readonly string[] {
  const stageIds = MODULE_STAGE_IDS[moduleId];
  if (stageIds === undefined || stageIds.length === 0) {
    throw new Error(`В фикстуре не объявлен состав модуля ${moduleId}`);
  }
  return stageIds;
}

/** Владелец этапа по ОБЪЯВЛЕННОМУ составу модулей — см. шапку файла. */
function declaredOwnerOf(stage: Stage): string {
  const owner = Object.entries(MODULE_STAGE_IDS).find(([, stageIds]) =>
    stageIds.includes(stage.id),
  );
  if (owner === undefined) {
    throw new Error(`Этап ${stage.id} не объявлен ни в одном модуле фикстуры`);
  }
  return owner[0];
}

/** Первый шаг этапа — узел типа 'step', у которого есть панель. */
function firstStepOf(stage: Stage): Stage['nodes'][number] {
  const step = stage.nodes.find((node) => node.type === 'step');
  if (step === undefined) {
    throw new Error(`У этапа ${stage.id} нет ни одного шага`);
  }
  return step;
}

/*
 * Этап 3 — ПЕРВЫЙ этап модуля SNP, а не третий: номер в адресе сквозной по
 * документу. Прочитай его кто-нибудь как позицию внутри модуля — открылся бы
 * этап 3 первого модуля, которого нет (у DP их два), или этап другого модуля.
 */
const STAGE_3 = stageNumbered(3);
const STAGE_4 = stageNumbered(4);
const STAGE_5 = stageNumbered(5);
const STAGE_5_STEP = firstStepOf(STAGE_5);
const SUPPLY = moduleWithId(MODULE_SUPPLY);

function setUrl(search: string): void {
  // replaceState, а не pushState: тест «pushState не вызывается ни разу»
  // подменяет pushState, и подготовка адреса не должна с ним пересекаться.
  window.history.replaceState({}, '', `/${search}`);
}

function search(): string {
  return window.location.search;
}

async function renderApp(): Promise<void> {
  await act(async () => {
    render(<App />);
  });
}

async function click(element: HTMLElement): Promise<void> {
  await act(async () => {
    fireEvent.click(element);
  });
}

async function storeAction(action: () => void): Promise<void> {
  await act(async () => {
    action();
  });
}

/** Экраны по подписи полотна — какой уровень сейчас на экране. */
const rootCanvas = () => screen.queryByRole('region', { name: ru.overview.allModulesCanvasLabel });
const moduleCanvas = () => screen.queryByRole('region', { name: ru.overview.moduleCanvasLabel });
const stageCanvas = () =>
  screen.queryByRole('region', { name: ru.stageDetail.moduleStageCanvasLabel });

beforeEach(() => {
  localStorage.clear();
  useProcessStore.setState(createInitialState());
  clearImportedMap();
  resetSelectedVersion();
  refreshProcessMap();
  setUrl('');
});

afterEach(() => {
  // Размонтировать ДО сброса карты — довод в tests/modulesOverview.test.tsx.
  cleanup();
  vi.restoreAllMocks();
  clearImportedMap();
  resetSelectedVersion();
  refreshProcessMap();
  setUrl('');
});

/*
 * СТОРОЖ СТРАНИЦЫ. Отвались подмена @map — первой версией встала бы настоящая
 * snp, где модулей нет, и тесты ниже краснели бы, называя не ту причину.
 */
it('страница из фикстур собралась: по умолчанию трёхуровневая карта', () => {
  expect(loadBaseProcessMap().id).toBe(THREE.id);
  expect(declaredOwnerOf(STAGE_3)).toBe(MODULE_SUPPLY);
  expect(STAGE_5_STEP.id).toBe('stage-5-step-1');
});

describe('?stage= — сквозной номер этапа, модуль из документа', () => {
  /*
   * ГЛАВНЫЙ СЦЕНАРИЙ ССЫЛКИ ИЗ ВИКИ: автор даёт номер этапа и ничего больше.
   * Открывается ровно один этап, адрес дописывает владельца — самовосстановление
   * по образцу `?node=` без stage (e2e/deep-link.spec.ts).
   */
  it.each([
    [3, MODULE_SUPPLY],
    [7, MODULE_PRODUCTION],
  ])('?stage=%i — уровень 3 этого этапа, адрес ?module=%s&stage=…', async (number, owner) => {
    const stage = stageNumbered(number);
    expect(declaredOwnerOf(stage)).toBe(owner);
    setUrl(`?stage=${number}`);

    await renderApp();

    expect(useProcessStore.getState()).toMatchObject({
      currentModuleId: owner,
      currentStageId: stage.id,
      selectedNodeId: null,
    });
    expect(stageCanvas()).toBeInTheDocument();
    expect(screen.getByText(stage.title)).toBeInTheDocument();
    expect(search()).toBe(`?module=${owner}&stage=${number}`);
  });

  /*
   * «НАЗАД» ПОСЛЕ ССЫЛКИ — НА ЭКРАН МОДУЛЯ-ВЛАДЕЛЬЦА. back() знает только поля
   * store, поэтому экран модуля он найдёт, только если useDeepLink передал
   * владельца вторым аргументом navigateToStage. Без него первый же шаг вверх
   * вёл бы на корень — мимо экрана, на котором этап нарисован.
   */
  it('после ссылки на уровень 3 back() ведёт на экран модуля-владельца, а не на корень', async () => {
    setUrl(`?stage=${STAGE_4.number}`);
    await renderApp();

    await storeAction(() => useProcessStore.getState().back());

    expect(useProcessStore.getState()).toMatchObject({
      currentModuleId: MODULE_SUPPLY,
      currentStageId: null,
    });
    expect(moduleCanvas()).toBeInTheDocument();
    expect(search()).toBe(`?module=${MODULE_SUPPLY}`);

    // Второй шаг — корень, и адрес пустеет целиком.
    await storeAction(() => useProcessStore.getState().back());
    expect(rootCanvas()).toBeInTheDocument();
    expect(search()).toBe('');
  });
});

describe('?module= — экран модуля', () => {
  it('?module=<id> открывает уровень 2 этого модуля', async () => {
    setUrl(`?module=${MODULE_SUPPLY}`);

    await renderApp();

    expect(useProcessStore.getState()).toMatchObject({
      currentModuleId: MODULE_SUPPLY,
      currentStageId: null,
    });
    expect(moduleCanvas()).toBeInTheDocument();
    // Карточки — этапы именно этого модуля: свои есть, ЧУЖИХ НЕТ. Одного «свои
    // есть» мало: экран, открытый без фильтра по модулю, показал бы все этапы
    // документа — и свои среди них тоже.
    const own = declaredStagesOf(MODULE_SUPPLY);
    for (const stage of THREE.stages) {
      const card = screen.queryByRole('button', {
        name: ru.stageNode.ariaLabel(stage.number, stage.title),
      });
      if (own.includes(stage.id)) {
        expect(card, `карточка своего этапа ${stage.number}`).toBeInTheDocument();
      } else {
        expect(card, `карточка чужого этапа ${stage.number}`).toBeNull();
      }
    }
    expect(search()).toBe(`?module=${MODULE_SUPPLY}`);
  });

  /*
   * НЕИЗВЕСТНЫЙ МОДУЛЬ — корень, и параметр СТИРАЕТСЯ: то же правило, что у
   * `?stage=99`. Id сравнивается точно, с учётом регистра — как `?node=`, и
   * потому, что у реальной карты id модулей совпадают с кодами систем с
   * точностью до регистра (dp и DP).
   */
  it.each([
    ['несуществующий id', 'nope'],
    ['пустое значение', ''],
    ['id в другом регистре', MODULE_PRODUCTION.toUpperCase()],
  ])('?module= — %s: остаётся уровень 1, параметр стёрт', async (_case, value) => {
    setUrl(`?module=${value}`);

    await renderApp();

    expect(useProcessStore.getState()).toMatchObject({
      currentModuleId: null,
      currentStageId: null,
    });
    expect(rootCanvas()).toBeInTheDocument();
    expect(search()).toBe('');
  });

  /*
   * ЭТАП УКАЗАН, НО НЕ НАЙДЕН — модуль не отменяется: открывается экран модуля,
   * ближайшее к просьбе, что документ может показать. Модуль читается, когда
   * этап не РАЗРЕШИЛСЯ, а не только когда параметра stage нет.
   */
  it('?module=<id>&stage=99 — уровень 2 модуля, битый stage стёрт', async () => {
    setUrl(`?module=${MODULE_SUPPLY}&stage=99`);

    await renderApp();

    expect(useProcessStore.getState()).toMatchObject({
      currentModuleId: MODULE_SUPPLY,
      currentStageId: null,
    });
    expect(moduleCanvas()).toBeInTheDocument();
    expect(search()).toBe(`?module=${MODULE_SUPPLY}`);
  });
});

describe('старшинство: узел > этап > модуль', () => {
  /*
   * МОДУЛЬ, ПРОТИВОРЕЧАЩИЙ ЭТАПУ, проигрывает: этап определяет владельца
   * однозначно, модуль этапа — нет. Открывается этап, в адресе и в store —
   * настоящий владелец (B), а не модуль из ссылки (A). Проверка store здесь
   * не лишняя: адрес модуль берёт из документа сам, и модуль из ссылки,
   * протёкший в store, увидел бы только «Назад».
   */
  it('?module=<A>&stage=<этап модуля B> — побеждает этап, модуль нормализован на B', async () => {
    expect(declaredOwnerOf(STAGE_4)).toBe(MODULE_SUPPLY);
    setUrl(`?module=${MODULE_DEMAND}&stage=${STAGE_4.number}`);

    await renderApp();

    expect(useProcessStore.getState()).toMatchObject({
      currentModuleId: MODULE_SUPPLY,
      currentStageId: STAGE_4.id,
    });
    expect(stageCanvas()).toBeInTheDocument();
    expect(search()).toBe(`?module=${MODULE_SUPPLY}&stage=${STAGE_4.number}`);

    await storeAction(() => useProcessStore.getState().back());
    expect(useProcessStore.getState().currentModuleId).toBe(MODULE_SUPPLY);
  });

  /*
   * УЗЕЛ ИЗ ДРУГОГО ЭТАПА И ДРУГОГО МОДУЛЯ — побеждает узел: его этап и его
   * модуль, панель открыта именно на нём.
   */
  it('?node=<узел этапа 5> — уровень 3, панель открыта, адрес с модулем и этапом', async () => {
    setUrl(`?node=${STAGE_5_STEP.id}`);

    await renderApp();

    expect(useProcessStore.getState()).toMatchObject({
      currentModuleId: MODULE_SUPPLY,
      currentStageId: STAGE_5.id,
      selectedNodeId: STAGE_5_STEP.id,
    });
    expect(stageCanvas()).toBeInTheDocument();
    expect(screen.getByRole('dialog').querySelector('h2')?.textContent).toBe(STAGE_5_STEP.label);
    expect(search()).toBe(
      `?module=${MODULE_SUPPLY}&stage=${STAGE_5.number}&node=${STAGE_5_STEP.id}`,
    );
  });

  it('?module=<A>&stage=<этап A>&node=<узел модуля B> — побеждает узел', async () => {
    setUrl(`?module=${MODULE_DEMAND}&stage=1&node=${STAGE_5_STEP.id}`);

    await renderApp();

    expect(useProcessStore.getState()).toMatchObject({
      currentModuleId: MODULE_SUPPLY,
      currentStageId: STAGE_5.id,
      selectedNodeId: STAGE_5_STEP.id,
    });
    expect(search()).toBe(
      `?module=${MODULE_SUPPLY}&stage=${STAGE_5.number}&node=${STAGE_5_STEP.id}`,
    );
  });
});

describe('запись адреса', () => {
  /*
   * КЛИКИ ПО УРОВНЯМ ПЕРЕПИСЫВАЮТ АДРЕС НА КАЖДОМ: корень — пусто, экран
   * модуля — module, уровень шагов — module+stage(+node). И обратно тем же
   * путём. Клики — обработчиками (fireEvent), см. шапку файла.
   */
  it('навигация кликами: 1 — пусто, 2 — module, 3 — module+stage, панель — +node', async () => {
    await renderApp();
    expect(rootCanvas()).toBeInTheDocument();
    expect(search()).toBe('');

    await click(
      screen.getByRole('button', { name: ru.moduleNode.ariaLabel(SUPPLY.number, SUPPLY.title) }),
    );
    expect(moduleCanvas()).toBeInTheDocument();
    expect(search()).toBe(`?module=${MODULE_SUPPLY}`);

    await click(
      screen.getByRole('button', { name: ru.stageNode.ariaLabel(STAGE_4.number, STAGE_4.title) }),
    );
    expect(stageCanvas()).toBeInTheDocument();
    expect(search()).toBe(`?module=${MODULE_SUPPLY}&stage=${STAGE_4.number}`);

    const step = firstStepOf(STAGE_4);
    await click(screen.getByRole('button', { name: ru.stepNode.ariaLabel(step.label) }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(search()).toBe(`?module=${MODULE_SUPPLY}&stage=${STAGE_4.number}&node=${step.id}`);

    await click(screen.getByRole('button', { name: ru.breadcrumbs.backToModuleStages }));
    expect(moduleCanvas()).toBeInTheDocument();
    expect(search()).toBe(`?module=${MODULE_SUPPLY}`);

    await click(screen.getByRole('button', { name: ru.breadcrumbs.backToAllModules }));
    expect(rootCanvas()).toBeInTheDocument();
    expect(search()).toBe('');
  });

  /*
   * МОДУЛЬ В АДРЕСЕ — ИЗ ДОКУМЕНТА, а не из store. Store законно может держать
   * модуль, который этапу не хозяин: второй аргумент navigateToStage вызывающий
   * передаёт сам, и store его не проверяет (карту он не знает). Адрес, где
   * module противоречит stage, — ссылка, которая при открытии самоисправится
   * (этап старше), то есть адрес врал бы ровно до перезагрузки.
   */
  it('модуль в store не хозяин этапа — в адрес пишется владелец по документу', async () => {
    await renderApp();

    await storeAction(() => useProcessStore.getState().navigateToStage(STAGE_4.id, MODULE_DEMAND));

    // Предпосылка: store действительно расходится с документом.
    expect(useProcessStore.getState().currentModuleId).toBe(MODULE_DEMAND);
    expect(search()).toBe(`?module=${MODULE_SUPPLY}&stage=${STAGE_4.number}`);
  });

  /*
   * ЭТАП-ПРИЗРАК: этап задан, но в документе его нет, а модуль в store есть и
   * существует. Адрес пустеет целиком — ни stage, ни node, НИ MODULE: это тупик,
   * деталям которого в ссылке не место (moduleForAddress в useDeepLink.ts).
   *
   * ХУК БЕЗ App — и это не упрощение, а единственный способ увидеть ветку. В App
   * StageDetail уводит с тупика своим эффектом раньше эффекта App, и до записи
   * адреса тупик не доживает; без ветки адрес там всё равно вышел бы пустым.
   * Здесь StageDetail нет, и без ветки в адрес ушёл бы модуль из store.
   */
  it('этап-призрак: адрес пустеет целиком, модуль из store не пишется', () => {
    renderHook(() => useDeepLink());

    // Сначала настоящий уровень 3 — чтобы пустой адрес ниже был записью, а не
    // тем, что осталось от подготовки.
    act(() => {
      useProcessStore.getState().navigateToStage(STAGE_4.id, MODULE_SUPPLY);
    });
    expect(search()).toBe(`?module=${MODULE_SUPPLY}&stage=${STAGE_4.number}`);

    act(() => {
      useProcessStore.getState().navigateToStage('этапа-такого-нет', MODULE_SUPPLY);
    });

    expect(useProcessStore.getState().currentModuleId).toBe(MODULE_SUPPLY);
    expect(search()).toBe('');
  });

  /*
   * ПОРЯДОК ПАРАМЕТРОВ: version, module, stage, node — независимо от того, в
   * каком порядке их набрал автор ссылки (version впереди module — следующий
   * тест). Чужие параметры хоста остаются как были, впереди своих, — В ТОМ
   * ЧИСЛЕ ПОВТОРЯЮЩИЕСЯ: `from` здесь дважды. Прежняя запись (set()/delete()
   * на месте) чужих ключей не касалась и повторы сохраняла; сборка адреса
   * заново через set() вместо append() схлопнула бы их в один `from=bot`, и
   * хост, читающий getAll('from'), потерял бы значение.
   */
  it('свои параметры — в порядке module, stage, node; чужие — впереди, как были', async () => {
    setUrl(
      `?node=${STAGE_5_STEP.id}&from=wiki&stage=${STAGE_5.number}&from=bot&module=${MODULE_SUPPLY}`,
    );

    await renderApp();

    expect(search()).toBe(
      `?from=wiki&from=bot&module=${MODULE_SUPPLY}&stage=${STAGE_5.number}&node=${STAGE_5_STEP.id}`,
    );
  });

  /*
   * VERSION ВПЕРЕДИ MODULE. На этой странице версия не по умолчанию —
   * двухуровневая, и естественным путём version и module в одном адресе не
   * встречаются. Встречаются они, когда поверх такой версии лежит загруженная
   * трёхуровневая схема: версия пишется по ВЫБРАННОЙ версии (шапка записи в
   * useDeepLink.ts), модуль — по документу на экране. Путь редкий, но
   * настоящий (выбрать вторую версию, затем «Загрузить» в режиме редактора), и
   * другого способа свести оба параметра на одной странице из фикстур нет:
   * подмена JSON-модулей одна на файл.
   */
  it('version впереди module: ?version=…&module=…&stage=…', async () => {
    setUrl(`?version=${THREE_LEVEL_PAGE_ALT_ID}`);
    await renderApp();
    await storeAction(() => applyImportedMap(parseThreeLevelProcessMap()));

    await storeAction(() => useProcessStore.getState().navigateToStage(STAGE_4.id, MODULE_SUPPLY));

    // Предпосылка: выбрана версия не по умолчанию, а на экране — карта с модулями.
    expect(stageCanvas()).toBeInTheDocument();
    expect(search()).toBe(
      `?version=${THREE_LEVEL_PAGE_ALT_ID}&module=${MODULE_SUPPLY}&stage=${STAGE_4.number}`,
    );
  });

  /*
   * SPEC §4.7: replaceState, НЕ pushState — история родительской вики не
   * растёт. Шпион ставится ПОСЛЕ подготовки адреса, считаются только вызовы
   * приложения. Пройдены все переходы, которые пишут module: ссылка на
   * уровень 3, «Назад» на экран модуля, корень, клик по модулю, клик по этапу.
   */
  it('адрес пишется через replaceState, pushState не вызывается ни разу', async () => {
    setUrl(`?stage=${STAGE_3.number}`);
    const replaceSpy = vi.spyOn(window.history, 'replaceState');
    const pushSpy = vi.spyOn(window.history, 'pushState');

    await renderApp();
    await storeAction(() => useProcessStore.getState().back());
    await storeAction(() => useProcessStore.getState().back());
    await click(
      screen.getByRole('button', { name: ru.moduleNode.ariaLabel(SUPPLY.number, SUPPLY.title) }),
    );
    await click(
      screen.getByRole('button', { name: ru.stageNode.ariaLabel(STAGE_4.number, STAGE_4.title) }),
    );

    expect(search()).toBe(`?module=${MODULE_SUPPLY}&stage=${STAGE_4.number}`);
    expect(replaceSpy).toHaveBeenCalled();
    expect(pushSpy).not.toHaveBeenCalled();
  });
});

describe('модуль и версия', () => {
  /*
   * МОДУЛЬ ИЩЕТСЯ В ТОЙ ВЕРСИИ, ЧТО НАЗВАНА В АДРЕСЕ. Вторая версия этой
   * страницы двухуровневая, и `?module=` в ней не значит ничего: модуль не
   * выбирается (в store его нет), в адресе остаётся одна версия. Ищи
   * useDeepLink модуль в карте из замыкания (версия по умолчанию, с модулями) —
   * нашёл бы, и store держал бы модуль чужой версии.
   */
  it('?version=<двухуровневая>&module=<id> — модуль игнорируется и стирается', async () => {
    setUrl(`?version=${THREE_LEVEL_PAGE_ALT_ID}&module=${MODULE_SUPPLY}`);

    await renderApp();

    expect(loadBaseProcessMap().id).toBe(THREE_LEVEL_PAGE_ALT_ID);
    expect(useProcessStore.getState().currentModuleId).toBeNull();
    expect(screen.getByRole('heading', { name: TWO.title })).toBeInTheDocument();
    expect(search()).toBe(`?version=${THREE_LEVEL_PAGE_ALT_ID}`);
  });

  /*
   * ВЛАДЕЛЕЦ ЭТАПА — ТОЖЕ ИЗ ВЕРСИИ, НАЗВАННОЙ В АДРЕСЕ. id этапов у двух
   * фикстур совпадают по форме (stage-N), поэтому владелец, найденный в карте
   * из замыкания (версия по умолчанию), нашёлся бы — модуль DP, — и store
   * двухуровневой карты получил бы модуль чужой версии. Предпосылка
   * проверяется явно: разойдись id фикстур, тест перестал бы что-либо
   * различать молча.
   *
   * Заодно — порядок: версия впереди этапа, хотя в ссылке набрана после.
   *
   * И ТАК ЖЕ — АДРЕС С ПЕРВОЙ ЖЕ ЗАПИСИ, а не с последней. На первом проходе
   * useDeepLink карта из замыкания ещё прежняя (версия по умолчанию, с
   * модулями), и адрес, собранный по ней, получил бы module трёхуровневой
   * версии; следующий проход его исправил бы, и итоговый адрес этого не
   * показал бы. Поэтому сверяется КАЖДЫЙ вызов replaceState.
   */
  it('?version=<двухуровневая>&stage=2 — этап этой версии, без модуля, версия впереди', async () => {
    setUrl(`?stage=2&version=${THREE_LEVEL_PAGE_ALT_ID}`);
    const replaceSpy = vi.spyOn(window.history, 'replaceState');

    await renderApp();

    const stage = TWO.stages.find((candidate) => candidate.number === 2);
    expect(
      THREE.stages.some((candidate) => candidate.id === stage?.id),
      'предпосылка: id этапа двухуровневой версии есть и в трёхуровневой',
    ).toBe(true);
    expect(useProcessStore.getState()).toMatchObject({
      currentModuleId: null,
      currentStageId: stage?.id,
    });
    const expected = `?version=${THREE_LEVEL_PAGE_ALT_ID}&stage=2`;
    expect(search()).toBe(expected);
    expect(replaceSpy).toHaveBeenCalled();
    expect(replaceSpy.mock.calls.map((call) => call[2])).toEqual(
      replaceSpy.mock.calls.map(() => `/${expected}`),
    );
  });
});
