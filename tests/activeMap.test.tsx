// Активная карта: подмена, возврат и изоляция правок (process-map-70e.8).
//
// Главное, что здесь проверяется, — НЕ то, что подмена работает, а то, что она
// НЕ ЗАДЕВАЕТ встроенную карту: её правки лежат в своём ключе, и «Сбросить
// правки» на загруженной карте не должно стирать чужой черновик.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import App from '../src/App';
import { clearImportedMap, isImportedActive } from '../src/data/activeMap';
import {
  loadBaseProcessMap,
  loadProcessMap,
  OVERRIDES_KEY,
  resetOverrides,
  setNodeOverride,
} from '../src/data/loader';
import { applyImportedMap, revertToBuiltinMap } from '../src/data/mapSwitch';
import { ProcessMapSchema, type ProcessMap } from '../src/data/schema.ts';
import { refreshProcessMap } from '../src/hooks/useProcessMap';
import { createInitialState, useProcessStore } from '../src/store/useProcessStore';
import { buildSampleProcessMap } from './fixtures/sample-process.ts';
import {
  MODULE_STAGE_IDS,
  MODULE_SUPPLY,
  parseThreeLevelProcessMap,
} from './fixtures/three-level-process.ts';

/** Карта, «пришедшая из файла»: свой id, свои узлы. */
function importedMap(id = 'process-model-l0'): ProcessMap {
  return ProcessMapSchema.parse({ ...buildSampleProcessMap(), id, title: 'Загруженная модель' });
}

/**
 * Встать на уровень шагов АКТИВНОЙ трёхуровневой карты так, как это сделал бы
 * интерфейс: модуль → этап без второго аргумента → карточка узла.
 *
 * Предусловие проверяется здесь же: тест «после подмены модуль сброшен»
 * ничего не доказывал бы, если бы модуль не был выбран и до неё.
 */
function enterStepsLevelOfThreeLevelMap(): void {
  const stageId = MODULE_STAGE_IDS[MODULE_SUPPLY]?.[0] as string;
  const nodeId = loadBaseProcessMap().stages.find((stage) => stage.id === stageId)?.nodes[0]?.id;
  expect(nodeId, 'трёхуровневая карта не стала активной').toBeDefined();

  const store = useProcessStore.getState();
  store.navigateToModule(MODULE_SUPPLY);
  store.navigateToStage(stageId);
  store.selectNode(nodeId as string);

  expect(useProcessStore.getState()).toMatchObject({
    currentModuleId: MODULE_SUPPLY,
    currentStageId: stageId,
    selectedNodeId: nodeId,
  });
}

/** Корень карты: ни модуля, ни этапа, ни открытой карточки. */
function expectRoot(): void {
  expect(useProcessStore.getState()).toMatchObject({
    currentModuleId: null,
    currentStageId: null,
    selectedNodeId: null,
  });
}

const IMPORTED_KEY = 'inplan-process-map:process-model-l0:overrides:v1';
const IMPORTED_NAMESPACED_KEY = 'inplan-process-map:imported:process-model-l0:overrides:v1';

beforeEach(() => {
  localStorage.clear();
  useProcessStore.setState(createInitialState());
  clearImportedMap();
  refreshProcessMap();
});

afterEach(() => {
  clearImportedMap();
  refreshProcessMap();
});

describe('подмена карты', () => {
  it('по умолчанию показывается встроенная', () => {
    expect(isImportedActive()).toBe(false);
    expect(loadBaseProcessMap().id).not.toBe('process-model-l0');
  });

  it('после подмены отдаётся загруженная, после возврата — снова встроенная', () => {
    const builtinId = loadBaseProcessMap().id;
    applyImportedMap(importedMap());
    expect(isImportedActive()).toBe(true);
    expect(loadBaseProcessMap().id).toBe('process-model-l0');

    revertToBuiltinMap();
    expect(isImportedActive()).toBe(false);
    expect(loadBaseProcessMap().id).toBe(builtinId);
  });
});

describe('изоляция правок', () => {
  /*
   * ГЛАВНЫЙ ТЕСТ ЗАДАЧИ. Ключ загруженной карты живёт в своём пространстве
   * имён. Иначе файл, чей id после слагификации совпал бы с id встроенной
   * карты, писал бы правки в её ключ — и «Сбросить правки» стёрло бы чужой
   * черновик, ровно тот сценарий, ради которого SPEC §3 разводил ключи по картам.
   */
  it('правки загруженной карты пишутся в своё пространство имён', () => {
    applyImportedMap(importedMap());
    const nodeId = loadBaseProcessMap().stages[0]?.nodes[0]?.id;
    expect(nodeId).toBeDefined();
    setNodeOverride(nodeId as string, { title: 'Экран', url: 'https://example.com' });

    expect(localStorage.getItem(IMPORTED_NAMESPACED_KEY)).not.toBeNull();
    // Ни ключ встроенной карты, ни ключ «как будто это обычная карта» не тронуты.
    expect(localStorage.getItem(OVERRIDES_KEY)).toBeNull();
    expect(localStorage.getItem(IMPORTED_KEY)).toBeNull();
  });

  it('правки встроенной карты остаются на месте, пока показана загруженная', () => {
    const builtinNode = loadBaseProcessMap().stages[0]?.nodes[0]?.id as string;
    setNodeOverride(builtinNode, { title: 'Встроенный', url: 'https://example.com/a' });
    const before = localStorage.getItem(OVERRIDES_KEY);
    expect(before).not.toBeNull();

    applyImportedMap(importedMap());
    const importedNode = loadBaseProcessMap().stages[0]?.nodes[0]?.id as string;
    setNodeOverride(importedNode, { title: 'Загруженный', url: 'https://example.com/b' });

    expect(localStorage.getItem(OVERRIDES_KEY)).toBe(before);
  });

  it('«Сбросить правки» на загруженной карте не трогает ключ встроенной', () => {
    const builtinNode = loadBaseProcessMap().stages[0]?.nodes[0]?.id as string;
    setNodeOverride(builtinNode, { title: 'Встроенный', url: 'https://example.com/a' });
    const before = localStorage.getItem(OVERRIDES_KEY);

    applyImportedMap(importedMap());
    setNodeOverride(loadBaseProcessMap().stages[0]?.nodes[0]?.id as string, {
      title: 'Загруженный',
      url: 'https://example.com/b',
    });
    resetOverrides();

    expect(localStorage.getItem(IMPORTED_NAMESPACED_KEY)).toBeNull();
    expect(localStorage.getItem(OVERRIDES_KEY)).toBe(before);
  });

  it('правки загруженной карты переживают возврат к встроенной', () => {
    applyImportedMap(importedMap());
    const nodeId = loadBaseProcessMap().stages[0]?.nodes[0]?.id as string;
    setNodeOverride(nodeId, { title: 'Экран', url: 'https://example.com' });

    revertToBuiltinMap();
    applyImportedMap(importedMap());
    expect(loadProcessMap().stages[0]?.nodes[0]?.screen?.title).toBe('Экран');
  });
});

describe('тупик уровня 2', () => {
  /*
   * РЕГРЕССИЯ, РАДИ КОТОРОЙ ЗАДАЧА И ЗАВОДИЛАСЬ. `currentStageId` — это id
   * этапа ТЕКУЩЕЙ карты; в новой такого этапа нет, и StageDetail возвращал
   * пустой экран, из которого нельзя выйти: крошки с кнопкой «Назад»
   * рендерятся ниже этого return.
   */
  it('подмена карты с уровня 2 возвращает на обзор', () => {
    const stageId = loadBaseProcessMap().stages[1]?.id;
    expect(stageId).toBeDefined();
    useProcessStore.setState({ currentStageId: stageId as string });

    applyImportedMap(importedMap());
    expect(useProcessStore.getState().currentStageId).toBeNull();
  });

  it('возврат к встроенной карте тоже сбрасывает уровень', () => {
    applyImportedMap(importedMap());
    const stageId = loadBaseProcessMap().stages[0]?.id as string;
    useProcessStore.setState({ currentStageId: stageId });

    revertToBuiltinMap();
    expect(useProcessStore.getState().currentStageId).toBeNull();
  });

  /*
   * ТО ЖЕ С УРОВНЯ 3 (process-map-9mn.12). Подмена начинается С УРОВНЯ ШАГОВ
   * трёхуровневой карты намеренно: с уровня 2 (этапы модуля, этапа нет)
   * оставленный в mapSwitch.ts back() снял бы модуль и тест зеленел бы.
   * С уровня шагов back() снимает только этап, и currentModuleId остался бы
   * указывать на модуль карты, которой на экране уже нет.
   */
  it('подмена карты с уровня шагов трёхуровневой карты сбрасывает и модуль', () => {
    applyImportedMap(parseThreeLevelProcessMap());
    enterStepsLevelOfThreeLevelMap();

    applyImportedMap(importedMap());

    expectRoot();
  });

  it('возврат к встроенной карте с уровня шагов сбрасывает и модуль', () => {
    applyImportedMap(parseThreeLevelProcessMap());
    enterStepsLevelOfThreeLevelMap();

    revertToBuiltinMap();

    expectRoot();
  });

  /*
   * Вторая защита, независимая от первой: даже если уровень остался с чужим id
   * (причины могут появиться те, о которых мы сегодня не знаем), экран сам
   * возвращается на обзор, а не оставляет пустоту.
   */
  it('неизвестный этап не оставляет пустой экран', async () => {
    useProcessStore.setState({ currentStageId: 'stage-которого-нет' });
    await act(async () => {
      render(<App />);
    });
    expect(useProcessStore.getState().currentStageId).toBeNull();
    // На экране обзор, а не пустота: заголовок карты на месте.
    expect(screen.getByText(loadBaseProcessMap().title)).toBeInTheDocument();
  });

  /*
   * Вторая защита с УРОВНЯ ШАГОВ (process-map-9mn.12): этап неизвестен, и
   * модуль при нём, скорее всего, от той же чужой карты. Защита уводит на
   * корень одним прыжком (resetLevel), а не на уровень вверх: back() снял бы
   * только этап и оставил бы экран этапов модуля, которого тоже нет.
   */
  it('неизвестный этап на уровне шагов уводит на корень, а не к этапам модуля', async () => {
    useProcessStore.setState({
      currentModuleId: 'модуль-которого-нет',
      currentStageId: 'stage-которого-нет',
    });
    await act(async () => {
      render(<App />);
    });

    expectRoot();
  });
});
