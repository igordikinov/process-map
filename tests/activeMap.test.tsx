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

/** Карта, «пришедшая из файла»: свой id, свои узлы. */
function importedMap(id = 'process-model-l0'): ProcessMap {
  return ProcessMapSchema.parse({ ...buildSampleProcessMap(), id, title: 'Загруженная модель' });
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
});
