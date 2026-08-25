// Тесты экрана детализации уровня 2 (SPEC §4.2, задача process-map-1ts).
// Полифиллы окружения React Flow — в tests/setup.ts.
//
// Важно: jsdom не делает hit-testing, поэтому «клик прошёл» здесь ничего не
// доказывает про реальный браузер. Настоящий клик мышью и
// document.elementFromPoint — в e2e/stage-detail.spec.ts; здесь проверяется
// сам стиль обёртки (pointerEvents), как в tests/App.test.tsx.
import { beforeEach, describe, expect, it } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
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

  // Стык двух задач M2: toggle тулбара (process-map-jl8) и панель узла
  // (process-map-lo7). Каждая проверена по отдельности, а вместе давали
  // висящую панель: карточка узла-интеграции уходила с полотна, панель с его
  // описанием оставалась. Теперь StageDetail отдаёт NodeDrawer только
  // отрисованные узлы. Геометрия (тулбар из-под панели) — в e2e/journey.spec.ts.
  it('панель не переживает исчезновение своего узла из-за toggle интеграций', () => {
    const stage = map.stages.find((candidate) =>
      candidate.nodes.some((node) => node.type === 'integration'),
    );
    expect(stage, 'в process.json нет ни одного узла-интеграции').toBeDefined();
    if (stage === undefined) {
      return;
    }
    const integration = firstOfType(stage, 'integration');

    useProcessStore.getState().navigateToStage(stage.id);
    const { container } = render(<App />);
    fireEvent.click(
      screen.getByRole('button', { name: ru.stepNode.ariaLabelIntegration(integration.label) }),
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    act(() => {
      useProcessStore.getState().toggleIntegrations();
    });

    expect(container.querySelector(`[data-id="${integration.id}"]`)).toBeNull();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    // Затемнение уходит вместе с панелью — иначе полотно осталось бы
    // приглушённым без видимой причины.
    expect(container.querySelector('[data-testid="drawer-scrim"]')).toBeNull();

    // Toggle обратим целиком: вернулся узел — вернулась и панель.
    act(() => {
      useProcessStore.getState().toggleIntegrations();
    });
    expect(container.querySelector(`[data-id="${integration.id}"]`)).not.toBeNull();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('панель обычного шага переживает toggle интеграций', () => {
    const stage = stageAt(1);
    const step = firstOfType(stage, 'step');
    useProcessStore.getState().navigateToStage(stage.id);
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: ru.stepNode.ariaLabel(step.label) }));
    const title = screen.getByRole('dialog').querySelector('h2')?.textContent;
    expect(title).toBe(step.label);

    act(() => {
      useProcessStore.getState().toggleIntegrations();
    });

    expect(screen.getByRole('dialog').querySelector('h2')?.textContent).toBe(step.label);
    expect(useProcessStore.getState().selectedNodeId).toBe(step.id);
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

  // Прежняя версия этой проверки кликала по кнопке ссылки и убеждалась, что
  // selectedNodeId остался null. Она была пустой: кнопка ссылки — СОСЕД
  // карточки, а не её потомок (см. комментарий в StepCard.tsx), поэтому её клик
  // не дошёл бы до onClick карточки и вовсе без stopPropagation — тест прошёл
  // бы и после удаления обоих обработчиков. Проверять надо ровно то, что делает
  // код: событие не уходит ВВЕРХ, к обёртке узла React Flow (она и слушает
  // pointer-события). Поэтому карточка рендерится внутри родителя со
  // счётчиками, и клик по ссылке сравнивается с кликом по самой карточке.
  it('клик по кнопке ссылки не всплывает к обёртке узла (stopPropagation)', () => {
    const screenLink = { title: 'Объёмный план', url: 'https://example.com/plan' };
    const seen = { click: 0, pointerDown: 0 };
    render(
      <div
        data-testid="node-wrapper"
        onClick={() => {
          seen.click += 1;
        }}
        onPointerDown={() => {
          seen.pointerDown += 1;
        }}
      >
        <StepCard node={{ ...baseNode, screen: screenLink }} variant="step" />
      </div>,
    );

    const link = screen.getByRole('button', { name: ru.stepNode.openScreen(screenLink.title) });
    fireEvent.pointerDown(link);
    fireEvent.click(link);

    expect(seen, 'событие с кнопки ссылки дошло до обёртки узла').toEqual({
      click: 0,
      pointerDown: 0,
    });
    // Само открытие ссылки — заглушка до process-map-lfj (utils/url.ts).
    expect(useProcessStore.getState().selectedNodeId).toBeNull();

    // Контроль того, что счётчики вообще работают: клик по самой карточке
    // всплывает как обычно и при этом выбирает узел.
    fireEvent.click(screen.getByRole('button', { name: ru.stepNode.ariaLabel(baseNode.label) }));
    expect(seen.click).toBe(1);
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
