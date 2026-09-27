// Пересчёт вида при переходах между экранами трёхуровневой карты (задача
// process-map-9mn.19).
//
// СКРЫТЫЙ ДЕФЕКТ, РАДИ КОТОРОГО ФАЙЛ. Ключ RefitViewport собирался из режима и
// id карты — `compact + map.id`. Уровни 1 и 2 трёхуровневой карты — обзоры
// ОДНОЙ карты в одном режиме, и два модуля на уровне 2 — тоже: такой ключ их
// не различал. Модуль к ключу экрана этапов добавила process-map-9mn.17, но
// тестом это не закреплялось, а экрана в ключе не было вовсе. Сегодня переход
// с уровня на уровень подгоняет вид лишь потому, что экраны — разные
// компоненты и RefitViewport монтируется заново; смена модуля при
// смонтированном экране этапов вида не подгоняла бы вовсе, выпади модуль из
// ключа. Ключ теперь собирает fitKeyOf (RefitViewportKey.ts) из экрана,
// режима, карты и модуля, и каждая часть здесь под своей проверкой.
//
// СТРАНИЦА ИЗ ФИКСТУР — трёхуровневая (tests/fixtures/pageMocks.ts): по
// умолчанию трёхуровневая фикстура, второй версией — двухуровневая. Подменены
// только два JSON-модуля; App, store и оба экрана работают по-настоящему.
//
// НАБЛЮДАЕМОЕ — вызов fitView из useReactFlow (его зовёт только
// RefitViewport; собственная подгонка <ReactFlow fitView> при монтировании
// идёт через внутренний store библиотеки и сюда не попадает) и setViewport
// (его зовёт только StartViewport уровня шагов). В jsdom нет layout, и
// смотреть на transform полотна бессмысленно — «как именно подогналось»
// проверяет e2e, а «сколько раз и на что» решается здесь, в проводке ключа
// (довод дословно из tests/refitViewport.test.tsx).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';

const fitView = vi.fn();
const setViewport = vi.fn();

vi.mock('@xyflow/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@xyflow/react')>();
  return {
    ...actual,
    useReactFlow: () => ({ ...actual.useReactFlow(), fitView, setViewport }),
  };
});

// Порядок и форма — дословно из шапки tests/fixtures/pageMocks.ts.
vi.mock('@map/process.json', async () =>
  (await import('./fixtures/pageMocks')).threeLevelDefaultVersionModule(),
);
vi.mock('@map-alt/process.json', async () =>
  (await import('./fixtures/pageMocks')).twoLevelAltVersionModule(),
);

const { default: App } = await import('../src/App');
const { fitKeyOf } = await import('../src/components/Overview/RefitViewportKey');
const { clearImportedMap } = await import('../src/data/activeMap');
const { loadBaseProcessMap } = await import('../src/data/loader');
const { resetSelectedVersion } = await import('../src/data/versions');
const { refreshProcessMap } = await import('../src/hooks/useProcessMap');
const { ru } = await import('../src/i18n/ru');
const { createInitialState, useProcessStore } = await import('../src/store/useProcessStore');
const { THREE_LEVEL_PAGE_DEFAULT_ID } = await import('./fixtures/pageMocks');
const { MODULE_DEMAND, MODULE_PRODUCTION, MODULE_STAGE_IDS, MODULE_SUPPLY } =
  await import('./fixtures/three-level-process');

async function renderApp() {
  let result: ReturnType<typeof render> | undefined;
  await act(async () => {
    result = render(<App />);
  });
  if (result === undefined) {
    throw new Error('App не отрендерился');
  }
  return result;
}

/** Действие со store под act — переход между экранами, как из интерфейса. */
async function go(action: () => void) {
  await act(async () => {
    action();
  });
}

function stagesOf(moduleId: string): readonly string[] {
  const ids = MODULE_STAGE_IDS[moduleId];
  if (ids === undefined || ids.length === 0) {
    throw new Error(`У модуля ${moduleId} в фикстуре нет этапов`);
  }
  return ids;
}

function stageAt(moduleId: string, index: number): string {
  const id = stagesOf(moduleId)[index];
  if (id === undefined) {
    throw new Error(`У модуля ${moduleId} нет этапа с индексом ${index}`);
  }
  return id;
}

beforeEach(() => {
  localStorage.clear();
  useProcessStore.setState(createInitialState());
  clearImportedMap();
  resetSelectedVersion();
  refreshProcessMap();
  window.history.replaceState({}, '', '/');
  fitView.mockClear();
  setViewport.mockClear();
});

afterEach(() => {
  // Размонтировать ДО сброса карты — довод в tests/modulesOverview.test.tsx.
  cleanup();
  clearImportedMap();
  resetSelectedVersion();
  refreshProcessMap();
});

describe('ключ пересчёта вида различает экраны', () => {
  const base = {
    screen: 'stages',
    compact: false,
    mapId: THREE_LEVEL_PAGE_DEFAULT_ID,
    moduleId: null,
  } as const;

  /*
   * Мутация «экран выпал из ключа» переживает тест переходов 1 ↔ 2 ниже:
   * экраны там монтируются заново, и вид подгоняется при любом ключе. Ловит
   * её эта проверка — ключ обязан различать экраны сам, а не держаться на
   * устройстве App.
   */
  it('уровни 1 и 2 одной карты в одном режиме — разные ключи', () => {
    expect(fitKeyOf({ ...base, screen: 'modules' })).not.toBe(fitKeyOf(base));
  });

  it('два модуля — разные ключи; модуль и его отсутствие — тоже', () => {
    const demand = fitKeyOf({ ...base, moduleId: MODULE_DEMAND });
    const supply = fitKeyOf({ ...base, moduleId: MODULE_SUPPLY });
    expect(demand).not.toBe(supply);
    expect(demand).not.toBe(fitKeyOf(base));
  });

  it('режим и карта по-прежнему в ключе', () => {
    expect(fitKeyOf({ ...base, compact: true })).not.toBe(fitKeyOf(base));
    expect(fitKeyOf({ ...base, mapId: 'other-map' })).not.toBe(fitKeyOf(base));
  });

  it('одинаковые части — один ключ: иначе вид дёргался бы на каждый рендер', () => {
    expect(fitKeyOf({ ...base, moduleId: MODULE_SUPPLY })).toBe(
      fitKeyOf({ ...base, moduleId: MODULE_SUPPLY }),
    );
  });

  it('двоеточие в id не склеивает разные части в один ключ', () => {
    // id — данные документа; при склейке через «:» карта «a:b» без модуля и
    // карта «a» с модулем «b» дали бы одну строку.
    expect(fitKeyOf({ ...base, mapId: 'a:b', moduleId: null })).not.toBe(
      fitKeyOf({ ...base, mapId: 'a', moduleId: 'b' }),
    );
  });
});

describe('экран этапов: смена модуля при смонтированном экране', () => {
  it('страница из фикстур собралась: трёхуровневая карта по умолчанию', () => {
    expect(loadBaseProcessMap().id).toBe(THREE_LEVEL_PAGE_DEFAULT_ID);
    // Предпосылка теста ниже: у модулей разное число этапов, то есть
    // полотна действительно разного габарита.
    expect(stagesOf(MODULE_DEMAND).length).not.toBe(stagesOf(MODULE_SUPPLY).length);
  });

  it('другой модуль на уровне 2 — вид подгоняется заново, экран не перемонтирован', async () => {
    const { container } = await renderApp();
    await go(() => useProcessStore.getState().navigateToModule(MODULE_DEMAND));
    const canvas = screen.getByRole('region', { name: ru.overview.moduleCanvasLabel });
    expect(container.querySelectorAll('.react-flow__node-stage')).toHaveLength(
      stagesOf(MODULE_DEMAND).length,
    );
    fitView.mockClear();

    // Прямо в store, минуя экран модулей: интерфейс сегодня ведёт с модуля на
    // модуль через него (и экран этапов монтируется заново), а проверяется
    // ключ — то, что не должно держаться на выбранном интерфейсом маршруте.
    await go(() => useProcessStore.setState({ currentModuleId: MODULE_SUPPLY }));

    // Предпосылки: экран тот же (иначе подгонку дал бы новый монтаж, а не
    // ключ), а полотно — уже другого модуля.
    expect(
      screen.getByRole('region', { name: ru.overview.moduleCanvasLabel }),
      'экран этапов перемонтирован — тест проверял бы монтаж, а не ключ',
    ).toBe(canvas);
    expect(container.querySelectorAll('.react-flow__node-stage')).toHaveLength(
      stagesOf(MODULE_SUPPLY).length,
    );

    expect(
      fitView,
      'смена модуля не подогнала вид: полотно другого габарита осталось в прежнем кадре',
    ).toHaveBeenCalledTimes(1);
  });

  it('тот же модуль повторно не подгоняет вид — одна подгонка на ключ', async () => {
    await renderApp();
    await go(() => useProcessStore.getState().navigateToModule(MODULE_SUPPLY));
    fitView.mockClear();

    await go(() => useProcessStore.setState({ currentModuleId: MODULE_SUPPLY }));
    // Тумблер интеграций пересобирает полотно, но в ключ не входит (FitKeyParts).
    await go(() => useProcessStore.getState().toggleIntegrations());

    expect(fitView).not.toHaveBeenCalled();
  });
});

describe('переходы между уровнями 1 и 2 подгоняют вид', () => {
  it('корень → модуль → корень → другой модуль: каждый переход — одна подгонка', async () => {
    await renderApp();
    expect(screen.getByRole('region', { name: ru.overview.allModulesCanvasLabel })).toBeVisible();

    for (const moduleId of [MODULE_SUPPLY, MODULE_PRODUCTION]) {
      fitView.mockClear();
      await go(() => useProcessStore.getState().navigateToModule(moduleId));
      expect(screen.getByRole('region', { name: ru.overview.moduleCanvasLabel })).toBeVisible();
      expect(fitView, `вход на уровень 2 модуля ${moduleId}`).toHaveBeenCalledTimes(1);

      fitView.mockClear();
      await go(() => useProcessStore.getState().back());
      expect(screen.getByRole('region', { name: ru.overview.allModulesCanvasLabel })).toBeVisible();
      expect(fitView, `возврат на уровень 1 из модуля ${moduleId}`).toHaveBeenCalledTimes(1);
    }
  });
});

/*
 * УРОВЕНЬ ШАГОВ — StartViewport, «проверить так же» (трекер 9mn.19).
 *
 * Там не RefitViewport и не ключ, а <ReactFlowProvider key={stage.id}> в
 * StageDetail.tsx: смена этапа размонтирует провайдер вместе со
 * StartViewport, и новый этап получает свой стартовый вид. Этого хватает, и
 * дефекта здесь нет: содержимое экрана шагов — функция этапа (плюс режим,
 * который StartViewport слушает сам); модуль экрана — владелец этапа по
 * документу (moduleOfStage), а этап заявлен ровно одним модулем
 * (validateIntegrity); карта под открытым этапом не меняется — подмена карты
 * и смена версии сначала сбрасывают уровень на корень (mapSwitch.ts,
 * versionSwitch.ts). Тест закрепляет это поведение: мутация «убрать key у
 * провайдера» оставляет StartViewport смонтированным, его флаг «уже
 * применено для этого режима» глотает новый этап, и тест краснеет.
 */
describe('уровень шагов: другой этап — новый стартовый вид', () => {
  it('этап того же модуля и этап другого модуля — по одному стартовому виду', async () => {
    await renderApp();
    await go(() =>
      useProcessStore.getState().navigateToStage(stageAt(MODULE_SUPPLY, 0), MODULE_SUPPLY),
    );
    const canvas = screen.getByRole('region', { name: ru.stageDetail.moduleStageCanvasLabel });
    expect(setViewport, 'первый этап получил стартовый вид').toHaveBeenCalledTimes(1);

    const next: readonly (readonly [string, string])[] = [
      [MODULE_SUPPLY, stageAt(MODULE_SUPPLY, 1)],
      [MODULE_PRODUCTION, stageAt(MODULE_PRODUCTION, 0)],
    ];
    for (const [moduleId, stageId] of next) {
      setViewport.mockClear();
      await go(() =>
        useProcessStore.setState({ currentModuleId: moduleId, currentStageId: stageId }),
      );

      // Экран шагов не перемонтирован: стартовый вид дал провайдер с новым
      // ключом, а не новый экран.
      expect(screen.getByRole('region', { name: ru.stageDetail.moduleStageCanvasLabel })).toBe(
        canvas,
      );
      expect(firstNodeOf(stageId), `на полотне этап ${stageId}`).not.toBeNull();
      expect(setViewport, `этап ${stageId} модуля ${moduleId}`).toHaveBeenCalledTimes(1);
    }
  });
});

/** Узел первого шага этапа на полотне — признак, что показан именно этот этап. */
function firstNodeOf(stageId: string): Element | null {
  const stage = loadBaseProcessMap().stages.find((candidate) => candidate.id === stageId);
  const firstNode = stage?.nodes[0];
  if (firstNode === undefined) {
    throw new Error(`У этапа ${stageId} нет узлов`);
  }
  return document.querySelector(`[data-id="${firstNode.id}"]`);
}
