// Тесты подписки на карту процесса (src/hooks/useProcessMap.ts, задача
// process-map-0sb).
//
// Зачем модуль существует: ProcessMap намеренно не лежит в zustand-store,
// поэтому запись override сама по себе никого не будит. Здесь проверяется
// ровно этот контракт — «записал через commitOverrides → подписчики увидели»
// и «без правок ссылка на карту стабильна» (нестабильная ссылка дала бы
// бесконечный ререндер в useSyncExternalStore).
import { beforeEach, describe, expect, it } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { readStoredOverrides, setNodeOverride } from '../src/data/loader';
import type { ProcessMap } from '../src/data/schema';
import { commitOverrides, refreshProcessMap, useProcessMap } from '../src/hooks/useProcessMap';

const NODE_ID = 'dezagregaciya-prognoza-po-produktu';
const LINK = { title: 'Объёмный план', url: 'https://example.com/plan' };

function findNode(map: ProcessMap, nodeId: string) {
  for (const stage of map.stages) {
    const found = stage.nodes.find((node) => node.id === nodeId);
    if (found !== undefined) {
      return found;
    }
  }
  return undefined;
}

/** Сколько раз компонент отрисовался и что он видит в карте. */
let renderCount = 0;
const seen: (ProcessMap | undefined)[] = [];

function Probe() {
  const map = useProcessMap();
  renderCount += 1;
  seen.push(map);
  const node = findNode(map, NODE_ID);
  return <span data-testid="screen">{node?.screen?.url ?? 'нет ссылки'}</span>;
}

beforeEach(() => {
  localStorage.clear();
  refreshProcessMap();
  renderCount = 0;
  seen.length = 0;
});

describe('useProcessMap', () => {
  it('отдаёт карту с наложенными overrides', () => {
    setNodeOverride(NODE_ID, LINK);
    refreshProcessMap();

    render(<Probe />);

    expect(screen.getByTestId('screen')).toHaveTextContent(LINK.url);
  });

  it('ссылка на карту стабильна, пока правок нет', () => {
    const { rerender } = render(<Probe />);
    rerender(<Probe />);

    expect(renderCount).toBeGreaterThan(1);
    expect(seen[0]).toBe(seen[seen.length - 1]);
  });

  it('commitOverrides будит подписчиков и отдаёт результат записи', () => {
    render(<Probe />);
    expect(screen.getByTestId('screen')).toHaveTextContent('нет ссылки');

    let written: ReturnType<typeof setNodeOverride> | undefined;
    act(() => {
      written = commitOverrides(() => setNodeOverride(NODE_ID, LINK));
    });

    // 1. Подписчик перерисовался с новой картой — без перезагрузки страницы.
    expect(screen.getByTestId('screen')).toHaveTextContent(LINK.url);
    // 2. Возвращается ровно то, что вернула сама запись (loader.ts).
    expect(written?.[NODE_ID]?.screen).toEqual(LINK);
    // 3. Карта действительно ПЕРЕЧИТАНА, а не подправлена в памяти:
    //    в хранилище лежит то же самое.
    expect(readStoredOverrides()[NODE_ID]?.screen).toEqual(LINK);
  });

  it('удаление ссылки (screen: null) тоже доезжает до подписчиков', () => {
    setNodeOverride(NODE_ID, LINK);
    refreshProcessMap();
    render(<Probe />);
    expect(screen.getByTestId('screen')).toHaveTextContent(LINK.url);

    act(() => {
      commitOverrides(() => setNodeOverride(NODE_ID, null));
    });

    expect(screen.getByTestId('screen')).toHaveTextContent('нет ссылки');
  });

  it('подписка снимается при размонтировании: обновление не роняет тест', () => {
    const { unmount } = render(<Probe />);
    unmount();
    const before = renderCount;

    act(() => {
      commitOverrides(() => setNodeOverride(NODE_ID, LINK));
    });

    expect(renderCount).toBe(before);
  });
});
