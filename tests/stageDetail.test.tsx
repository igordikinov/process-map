// Тесты экрана детализации уровня 2 (SPEC §4.2, задача process-map-1ts).
// Полифиллы окружения React Flow — в tests/setup.ts.
//
// Важно: jsdom не делает hit-testing, поэтому «клик прошёл» здесь ничего не
// доказывает про реальный браузер. Настоящий клик мышью и
// document.elementFromPoint — в e2e/stage-detail.spec.ts; здесь проверяется
// сам стиль обёртки (pointerEvents), как в tests/App.test.tsx.
import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import App from '../src/App';
import { StepCard } from '../src/components/nodes/StepNode';
import { loadBaseProcessMap } from '../src/data/loader';
import type { ProcessNode, Stage } from '../src/data/schema';
import { ru } from '../src/i18n/ru';
import { createInitialState, useProcessStore } from '../src/store/useProcessStore';

const map = loadBaseProcessMap();

function stageAt(index: number): Stage {
  const stage = map.stages[index];
  if (stage === undefined) {
    throw new Error(`В process.json нет этапа с индексом ${index}`);
  }
  return stage;
}

function firstOfType(stage: Stage, type: ProcessNode['type']): ProcessNode {
  const node = stage.nodes.find((candidate) => candidate.type === type);
  if (node === undefined) {
    throw new Error(`У этапа ${stage.number} нет узла типа ${type}`);
  }
  return node;
}

beforeEach(() => {
  useProcessStore.setState(createInitialState());
});

describe('StageDetail', () => {
  it('App показывает обзор при currentStageId === null и детализацию иначе', () => {
    const { unmount } = render(<App />);
    expect(screen.getByLabelText(ru.overview.canvasLabel)).toBeInTheDocument();
    unmount();

    const stage = stageAt(0);
    useProcessStore.getState().navigateToStage(stage.id);
    render(<App />);

    expect(screen.queryByLabelText(ru.overview.canvasLabel)).not.toBeInTheDocument();
    expect(screen.getByLabelText(ru.stageDetail.canvasLabel)).toBeInTheDocument();
    // Шапка уровня 2 — смонтированный Breadcrumbs (SPEC §4.2).
    expect(screen.getByText(ru.breadcrumbs.root)).toBeInTheDocument();
    expect(screen.getByText(stage.title)).toBeInTheDocument();
  });

  it.each(map.stages.map((stage) => [stage.number, stage.id] as const))(
    'этап %i: все узлы и контейнеры отрисованы, обёртки принимают события мыши',
    (_number, stageId) => {
      const stage = map.stages.find((candidate) => candidate.id === stageId);
      expect(stage).toBeDefined();
      useProcessStore.getState().navigateToStage(stageId);
      const { container } = render(<App />);

      for (const node of stage?.nodes ?? []) {
        const wrapper = container.querySelector<HTMLElement>(`[data-id="${node.id}"]`);
        expect(wrapper, `узел ${node.id} не отрисован`).not.toBeNull();
        // Регрессия M1: React Flow ставит pointer-events: none обёртке узла,
        // если выключены все флаги интерактивности.
        expect(wrapper?.style.pointerEvents).toBe('all');
      }

      // Группы этапа, у которых есть узлы, получили dashed-контейнер.
      const usedGroups = new Set(
        (stage?.nodes ?? [])
          .map((node) => node.group)
          .filter((group): group is string => group !== undefined),
      );
      for (const groupId of usedGroups) {
        expect(container.querySelector(`[data-id="group:${groupId}"]`)).not.toBeNull();
      }
    },
  );

  it('на полотне нет собственных фокусируемых элементов React Flow', () => {
    const stage = stageAt(0);
    useProcessStore.getState().navigateToStage(stage.id);
    const { container } = render(<App />);

    expect(container.querySelectorAll('.react-flow [tabindex]:not([tabindex="-1"])')).toHaveLength(
      0,
    );
    // Кнопок ровно столько, сколько узлов: карточка каждого узла — <button>,
    // кнопка ссылки появляется только при node.screen (в данных их нет).
    expect(container.querySelectorAll('.react-flow button')).toHaveLength(stage.nodes.length);
  });

  it('клик по карточке шага выбирает узел (Drawer — process-map-lo7)', () => {
    const stage = stageAt(0);
    const step = firstOfType(stage, 'step');
    useProcessStore.getState().navigateToStage(stage.id);
    render(<App />);

    expect(useProcessStore.getState().selectedNodeId).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: ru.stepNode.ariaLabel(step.label) }));
    expect(useProcessStore.getState().selectedNodeId).toBe(step.id);
  });

  it('клик по карточке данных выбирает узел', () => {
    const stage = stageAt(0);
    const data = firstOfType(stage, 'data');
    useProcessStore.getState().navigateToStage(stage.id);
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: ru.dataNode.ariaLabel(data.label) }));
    expect(useProcessStore.getState().selectedNodeId).toBe(data.id);
  });

  it('узел-предупреждение рисуется своим типом и тоже выбирается', () => {
    const stage = map.stages.find((candidate) =>
      candidate.nodes.some((node) => node.type === 'warning'),
    );
    expect(stage).toBeDefined();
    if (stage === undefined) {
      return;
    }
    const warning = firstOfType(stage, 'warning');
    useProcessStore.getState().navigateToStage(stage.id);
    const { container } = render(<App />);

    expect(
      container.querySelector(`.react-flow__node-warning[data-id="${warning.id}"]`),
    ).not.toBeNull();
    fireEvent.click(
      screen.getByRole('button', { name: ru.stepNode.ariaLabelWarning(warning.label) }),
    );
    expect(useProcessStore.getState().selectedNodeId).toBe(warning.id);
  });
});

describe('StepCard', () => {
  const baseNode: ProcessNode = {
    id: 'test-node',
    type: 'step',
    label: 'Тестовый шаг',
    position: { x: 0, y: 0 },
  };

  it('без node.screen иконки link-external нет (SPEC §4.2)', () => {
    render(<StepCard node={baseNode} variant="step" />);
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });

  it('с node.screen кнопка ссылки есть, а её клик НЕ открывает Drawer (stopPropagation)', () => {
    const screenLink = { title: 'Объёмный план', url: 'https://example.com/plan' };
    render(<StepCard node={{ ...baseNode, screen: screenLink }} variant="step" />);

    const link = screen.getByRole('button', { name: ru.stepNode.openScreen(screenLink.title) });
    fireEvent.click(link);

    // Само открытие ссылки — заглушка до process-map-lfj (utils/url.ts).
    expect(useProcessStore.getState().selectedNodeId).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: ru.stepNode.ariaLabel(baseNode.label) }));
    expect(useProcessStore.getState().selectedNodeId).toBe(baseNode.id);
  });

  it('многострочное description сохраняет переносы в подсказке', () => {
    const description = 'Причина A -> Действие A\nПричина B -> Действие B';
    render(<StepCard node={{ ...baseNode, description }} variant="step" />);

    const card = screen.getByRole('button', { name: ru.stepNode.ariaLabel(baseNode.label) });
    expect(card.getAttribute('title')).toContain('\n');
    expect(card.getAttribute('title')).toContain(description);
  });
});
