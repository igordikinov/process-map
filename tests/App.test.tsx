// Smoke-тест монтирования приложения: App рендерит обзор уровня 1 вместе с
// полотном React Flow. Полифиллы окружения для React Flow (ResizeObserver,
// getBoundingClientRect, DOMMatrixReadOnly) — в tests/setup.ts.
// Содержательные проверки обзора — в tests/overview.test.tsx.
import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import App from '../src/App';
import { loadBaseProcessMap } from '../src/data/loader';
import { ru } from '../src/i18n/ru';
import { createInitialState, useProcessStore } from '../src/store/useProcessStore';

describe('App', () => {
  beforeEach(() => {
    useProcessStore.setState(createInitialState());
  });

  it('рендерит обзор: шапку и полотно', () => {
    const map = loadBaseProcessMap();
    render(<App />);

    expect(screen.getByRole('heading', { name: map.title })).toBeInTheDocument();
    expect(screen.getByLabelText(ru.overview.canvasLabel)).toBeInTheDocument();
  });

  it('рендерит карточки всех этапов на полотне', () => {
    const map = loadBaseProcessMap();
    render(<App />);

    for (const stage of map.stages) {
      expect(
        screen.getByRole('button', { name: ru.stageNode.ariaLabel(stage.number, stage.title) }),
      ).toBeInTheDocument();
    }
  });

  // Регрессия: React Flow ставит обёртке узла pointer-events: none, если все
  // флаги интерактивности выключены. jsdom не делает hit-testing, поэтому
  // fireEvent.click «сработал бы» и с мёртвой карточкой — проверяем сам стиль
  // обёртки. Реальный клик мышью покрыт e2e/overview.spec.ts.
  it('обёртки карточек этапов принимают события мыши', () => {
    const map = loadBaseProcessMap();
    const { container } = render(<App />);

    for (const stage of map.stages) {
      const wrapper = container.querySelector<HTMLElement>(`[data-id="${stage.id}"]`);
      expect(wrapper).not.toBeNull();
      expect(wrapper?.style.pointerEvents).toBe('all');
    }
  });

  it('клик по карточке этапа на полотне переводит store на этот этап', () => {
    const map = loadBaseProcessMap();
    const stage = map.stages[1];
    expect(stage).toBeDefined();
    render(<App />);

    expect(useProcessStore.getState().currentStageId).toBeNull();
    fireEvent.click(
      screen.getByRole('button', {
        name: ru.stageNode.ariaLabel(stage?.number ?? 1, stage?.title ?? ''),
      }),
    );
    expect(useProcessStore.getState().currentStageId).toBe(stage?.id);
  });

  // Клавиатура: до первой карточки должен быть один Tab, а не проход по
  // обёрткам узлов и <g> рёбер (nodesFocusable/edgesFocusable = false).
  it('фокусируемых элементов на полотне ровно столько, сколько карточек', () => {
    const map = loadBaseProcessMap();
    const { container } = render(<App />);

    const focusable = container.querySelectorAll('.react-flow [tabindex]:not([tabindex="-1"])');
    expect(focusable).toHaveLength(0);
    expect(container.querySelectorAll('.react-flow button')).toHaveLength(map.stages.length);
  });
});
