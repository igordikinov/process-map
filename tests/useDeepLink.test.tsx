// Тесты deep-link ?stage=&node= (SPEC §4.7, задача process-map-0y2).
//
// Проверяется через <App/> целиком, а не хук в изоляции: useDeepLink читает
// window.location.search и дёргает store при монтировании — смысл в сквозном
// поведении «URL → экран», а не в вызовах хука самих по себе.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import App from '../src/App';
import { loadBaseProcessMap } from '../src/data/loader';
import { ru } from '../src/i18n/ru';
import { createInitialState, useProcessStore } from '../src/store/useProcessStore';

const map = loadBaseProcessMap();

/** Этап 2 и его первый узел — фикстуры для большинства сценариев. */
const stage2 = map.stages.find((stage) => stage.number === 2);
if (stage2 === undefined) {
  throw new Error('В process.json нет этапа с number === 2');
}
const stage2FirstNode = stage2.nodes[0];
if (stage2FirstNode === undefined) {
  throw new Error(`У этапа ${stage2.id} нет узлов`);
}

/** Узел этапа, отличного от stage2 — для сценария «узел из другого этапа». */
const stage1 = map.stages.find((stage) => stage.number === 1);
if (stage1 === undefined) {
  throw new Error('В process.json нет этапа с number === 1');
}
const stage1FirstNode = stage1.nodes[0];
if (stage1FirstNode === undefined) {
  throw new Error(`У этапа ${stage1.id} нет узлов`);
}

function setUrl(search: string): void {
  window.history.pushState({}, '', `/${search}`);
}

beforeEach(() => {
  useProcessStore.setState(createInitialState());
  setUrl('');
});

afterEach(() => {
  setUrl('');
});

describe('useDeepLink — открытие по URL', () => {
  it('?stage=2 открывает уровень 2 нужного этапа', () => {
    setUrl(`?stage=${stage2.number}`);
    render(<App />);

    expect(useProcessStore.getState().currentStageId).toBe(stage2.id);
    expect(useProcessStore.getState().selectedNodeId).toBeNull();
    expect(screen.getByText(stage2.title)).toBeInTheDocument();
  });

  it('?stage=2&node=<id> открывает уровень 2 и Drawer на этом узле', () => {
    setUrl(`?stage=${stage2.number}&node=${stage2FirstNode.id}`);
    render(<App />);

    expect(useProcessStore.getState().currentStageId).toBe(stage2.id);
    expect(useProcessStore.getState().selectedNodeId).toBe(stage2FirstNode.id);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});

describe('useDeepLink — устойчивость', () => {
  it('?stage=99 (несуществующий этап): остаётся уровень 1, без падения', () => {
    setUrl('?stage=99');
    render(<App />);

    expect(useProcessStore.getState().currentStageId).toBeNull();
    expect(screen.getByLabelText(ru.overview.canvasLabel)).toBeInTheDocument();
  });

  it('?stage=abc (не число): остаётся уровень 1, без падения', () => {
    setUrl('?stage=abc');
    render(<App />);

    expect(useProcessStore.getState().currentStageId).toBeNull();
    expect(screen.getByLabelText(ru.overview.canvasLabel)).toBeInTheDocument();
  });

  it('?node=не-существует: остаётся уровень 1, без падения', () => {
    setUrl('?node=не-существует');
    render(<App />);

    expect(useProcessStore.getState().currentStageId).toBeNull();
    expect(useProcessStore.getState().selectedNodeId).toBeNull();
  });

  it('?node=<id> без stage: этап находится по узлу, Drawer открыт', () => {
    setUrl(`?node=${stage2FirstNode.id}`);
    render(<App />);

    expect(useProcessStore.getState().currentStageId).toBe(stage2.id);
    expect(useProcessStore.getState().selectedNodeId).toBe(stage2FirstNode.id);
  });

  it('узел из другого этапа, чем stage: побеждает реальный этап узла', () => {
    // stage=1, но node принадлежит stage2 — данные рассинхронизированы
    // (устаревшая ссылка/ошибка при формировании URL).
    setUrl(`?stage=${stage1.number}&node=${stage2FirstNode.id}`);
    render(<App />);

    expect(useProcessStore.getState().currentStageId).toBe(stage2.id);
    expect(useProcessStore.getState().selectedNodeId).toBe(stage2FirstNode.id);
  });

  it('?stage=&node= (пустые значения): остаётся уровень 1, без падения', () => {
    setUrl('?stage=&node=');
    render(<App />);

    expect(useProcessStore.getState().currentStageId).toBeNull();
    expect(useProcessStore.getState().selectedNodeId).toBeNull();
  });
});

describe('useDeepLink — синхронизация URL', () => {
  it('после открытия по deep-link URL нормализован (лишние узлы стёрты для уровня 1)', () => {
    setUrl('?stage=99&node=не-существует');
    render(<App />);

    const params = new URLSearchParams(window.location.search);
    expect(params.get('stage')).toBeNull();
    expect(params.get('node')).toBeNull();
  });

  it('URL после deep-link ?stage=2&node=<id> содержит ровно эти значения', () => {
    setUrl(`?stage=${stage2.number}&node=${stage2FirstNode.id}`);
    render(<App />);

    const params = new URLSearchParams(window.location.search);
    expect(params.get('stage')).toBe(String(stage2.number));
    expect(params.get('node')).toBe(stage2FirstNode.id);
  });

  it('навигация внутри приложения обновляет URL', () => {
    render(<App />);
    expect(new URLSearchParams(window.location.search).get('stage')).toBeNull();

    // Прямой вызов action'а стора — не событие React, поэтому обёрнут в
    // act(), чтобы эффект useDeepLink синхронно отработал до assert.
    act(() => {
      useProcessStore.getState().navigateToStage(stage2.id);
    });

    const params = new URLSearchParams(window.location.search);
    expect(params.get('stage')).toBe(String(stage2.number));
    expect(params.get('node')).toBeNull();
  });

  it('back() убирает stage/node из URL', () => {
    setUrl(`?stage=${stage2.number}&node=${stage2FirstNode.id}`);
    render(<App />);

    act(() => {
      useProcessStore.getState().back();
    });

    const params = new URLSearchParams(window.location.search);
    expect(params.get('stage')).toBeNull();
    expect(params.get('node')).toBeNull();
  });

  // SPEC §4.7: replaceState, НЕ pushState — иначе история родительской вики
  // растёт при каждой навигации внутри iframe.
  it('URL обновляется через replaceState, pushState не вызывается ни разу', () => {
    // setUrl — тестовая утилита, использует pushState для подготовки адреса
    // ДО рендера. Спаим только после неё, чтобы считать исключительно вызовы
    // из кода приложения (useDeepLink), а не из подготовки теста.
    setUrl(`?stage=${stage1.number}`);
    const replaceSpy = vi.spyOn(window.history, 'replaceState');
    const pushSpy = vi.spyOn(window.history, 'pushState');

    render(<App />);

    act(() => {
      useProcessStore.getState().navigateToStage(stage2.id);
    });
    act(() => {
      useProcessStore.getState().selectNode(stage2FirstNode.id);
    });
    act(() => {
      useProcessStore.getState().closeDrawer();
    });
    act(() => {
      useProcessStore.getState().back();
    });

    expect(replaceSpy).toHaveBeenCalled();
    expect(pushSpy).not.toHaveBeenCalled();

    replaceSpy.mockRestore();
    pushSpy.mockRestore();
  });
});
