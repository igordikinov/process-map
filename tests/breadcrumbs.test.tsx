// Тесты Breadcrumbs (SPEC §4.2, задача process-map-mpg).
import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Breadcrumbs } from '../src/components/Breadcrumbs';
import { loadBaseProcessMap } from '../src/data/loader';
import type { Stage } from '../src/data/schema';
import { ru } from '../src/i18n/ru';
import { createInitialState, useProcessStore } from '../src/store/useProcessStore';
import { countStageNodes } from '../src/utils/stageNodes';

const map = loadBaseProcessMap();

function stageAt(index: number): Stage {
  const stage = map.stages[index];
  if (stage === undefined) {
    throw new Error(`В process.json нет этапа с индексом ${index}`);
  }
  return stage;
}

beforeEach(() => {
  useProcessStore.setState(createInitialState());
});

describe('Breadcrumbs', () => {
  it('ничего не рендерит на уровне 1 (currentStageId === null)', () => {
    const { container } = render(<Breadcrumbs stages={map.stages} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('ничего не рендерит, если currentStageId не найден среди stages', () => {
    useProcessStore.getState().navigateToStage('несуществующий-этап');
    const { container } = render(<Breadcrumbs stages={map.stages} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('показывает название этапа, корень крошек и бейдж номера', () => {
    const stage = stageAt(1);
    useProcessStore.getState().navigateToStage(stage.id);

    render(<Breadcrumbs stages={map.stages} />);

    expect(screen.getByText(ru.breadcrumbs.root)).toBeInTheDocument();
    expect(screen.getByText(stage.title)).toBeInTheDocument();
    expect(screen.getByText(`Этап ${stage.number}`)).toBeInTheDocument();
  });

  it('считает счётчик «N шагов · M входов · K выходов» на реальных данных по всем этапам', () => {
    for (const stage of map.stages) {
      useProcessStore.getState().navigateToStage(stage.id);
      const { unmount } = render(<Breadcrumbs stages={map.stages} />);

      // Независимый от countStageNodes пересчёт: тип узла напрямую из данных,
      // чтобы тест не был тавтологией с тестируемой функцией.
      const steps = stage.nodes.filter((node) => node.type !== 'data').length;
      const dataNodes = stage.nodes.filter((node) => node.type === 'data');
      expect(steps + dataNodes.length).toBe(stage.nodes.length);

      const counts = countStageNodes(stage);
      expect(counts.steps).toBe(steps);
      expect(counts.inputs + counts.outputs).toBe(dataNodes.length);

      expect(
        screen.getByText(ru.breadcrumbs.counter(counts.steps, counts.inputs, counts.outputs)),
      ).toBeInTheDocument();

      unmount();
    }
  });

  it('склоняет счётчик правильно для 1, 2 и 5 (шаг/шага/шагов)', () => {
    const base = stageAt(0);
    const makeStage = (stepsCount: number): Stage => {
      const nodes = [];
      for (let i = 0; i < stepsCount; i += 1) {
        nodes.push({
          id: `fixture-step-${i}`,
          type: 'step' as const,
          label: `Шаг ${i}`,
          position: { x: 100 + i, y: 0 },
        });
      }
      // Одна пара data-узлов слева/справа от потока — не влияет на склонение
      // «шагов», но проверяет, что вход/выход не путаются с шагами.
      nodes.push({
        id: 'fixture-input',
        type: 'data' as const,
        label: 'Вход',
        position: { x: 0, y: 0 },
      });
      nodes.push({
        id: 'fixture-output',
        type: 'data' as const,
        label: 'Выход',
        position: { x: 500, y: 0 },
      });
      return { ...base, id: 'fixture-stage', nodes, groups: [], edges: [] };
    };

    const cases: Array<[number, string]> = [
      [1, '1 шаг · 1 вход · 1 выход'],
      [2, '2 шага · 1 вход · 1 выход'],
      [5, '5 шагов · 1 вход · 1 выход'],
    ];

    for (const [stepsCount, expected] of cases) {
      const stage = makeStage(stepsCount);
      useProcessStore.getState().navigateToStage(stage.id);
      const { unmount } = render(<Breadcrumbs stages={[stage]} />);
      expect(screen.getByText(expected)).toBeInTheDocument();
      unmount();
    }
  });

  it('кнопка «Назад» вызывает back() и возвращает на уровень 1', () => {
    const stage = stageAt(0);
    useProcessStore.getState().navigateToStage(stage.id);
    render(<Breadcrumbs stages={map.stages} />);

    expect(useProcessStore.getState().currentStageId).toBe(stage.id);
    fireEvent.click(screen.getByRole('button', { name: ru.breadcrumbs.backAriaLabel }));
    expect(useProcessStore.getState().currentStageId).toBeNull();
  });
});
