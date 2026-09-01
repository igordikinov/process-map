// Тесты состояния UI (SPEC.md §4.1, §4.4, §4.6).
import { beforeEach, describe, expect, it } from 'vitest';
import { OVERRIDES_KEY } from '../src/data/loader';
import { createInitialState, useProcessStore } from '../src/store/useProcessStore';

const get = () => useProcessStore.getState();

describe('useProcessStore', () => {
  beforeEach(() => {
    useProcessStore.setState(createInitialState());
  });

  it('начальное состояние: обзор, Drawer закрыт, режим просмотра, интеграции видны', () => {
    expect(get().currentStageId).toBeNull();
    expect(get().selectedNodeId).toBeNull();
    expect(get().mode).toBe('view');
    expect(get().showIntegrations).toBe(true);
  });

  it('режим всегда view при инициализации и не персистится', () => {
    get().setMode('edit');
    // Пересоздание начального состояния имитирует перезагрузку страницы.
    useProcessStore.setState(createInitialState());

    expect(get().mode).toBe('view');
    expect(localStorage.getItem(OVERRIDES_KEY)).toBeNull();
  });

  it('navigateToStage переводит на уровень 2', () => {
    get().navigateToStage('stage-2');

    expect(get().currentStageId).toBe('stage-2');
    expect(get().selectedNodeId).toBeNull();
  });

  it('navigateToStage закрывает Drawer, открытый на другом этапе', () => {
    get().navigateToStage('stage-2');
    get().selectNode('stage-2-node-1');
    get().navigateToStage('stage-3');

    expect(get().currentStageId).toBe('stage-3');
    expect(get().selectedNodeId).toBeNull();
  });

  it('deep-link: navigateToStage → selectNode даёт уровень 2 с открытым Drawer', () => {
    get().navigateToStage('stage-2');
    get().selectNode('stage-2-node-1');

    expect(get().currentStageId).toBe('stage-2');
    expect(get().selectedNodeId).toBe('stage-2-node-1');
  });

  it('back возвращает на обзор и закрывает Drawer', () => {
    get().navigateToStage('stage-2');
    get().selectNode('stage-2-node-1');
    get().back();

    expect(get().currentStageId).toBeNull();
    expect(get().selectedNodeId).toBeNull();
  });

  it('selectNode не меняет уровень, closeDrawer не меняет уровень', () => {
    get().navigateToStage('stage-1');
    get().selectNode('stage-1-node-1');
    expect(get().currentStageId).toBe('stage-1');

    get().closeDrawer();
    expect(get().selectedNodeId).toBeNull();
    expect(get().currentStageId).toBe('stage-1');
  });

  it('toggleIntegrations переключает флаг туда и обратно', () => {
    get().toggleIntegrations();
    expect(get().showIntegrations).toBe(false);

    get().toggleIntegrations();
    expect(get().showIntegrations).toBe(true);
  });

  it('setMode не закрывает Drawer и не меняет уровень', () => {
    get().navigateToStage('stage-2');
    get().selectNode('stage-2-node-1');

    get().setMode('edit');
    expect(get().mode).toBe('edit');
    expect(get().selectedNodeId).toBe('stage-2-node-1');
    expect(get().currentStageId).toBe('stage-2');

    get().setMode('view');
    expect(get().selectedNodeId).toBe('stage-2-node-1');
  });

  it('toggleIntegrations не сбрасывает выбранный узел', () => {
    get().navigateToStage('stage-2');
    get().selectNode('stage-2-node-1');
    get().toggleIntegrations();

    expect(get().selectedNodeId).toBe('stage-2-node-1');
  });
});
