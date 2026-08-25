// Тесты тулбара (SPEC §4.6, задача process-map-jl8).
//
// Клик по кнопкам тулбара юнит-тестом (fireEvent) достаточен только для
// проверки, что store/зум-хуки вызываются правильно: jsdom не делает
// hit-testing, поэтому «клик прошёл» тут ничего не доказывает про реальный
// браузер, если тулбар лежит поверх полотна React Flow. Настоящий клик мышью
// проверяется в e2e/toolbar.spec.ts (см. CLAUDE.md «Ловушки»).
import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import { Toolbar } from '../src/components/Toolbar';
import { ru } from '../src/i18n/ru';
import { createInitialState, useProcessStore } from '../src/store/useProcessStore';

beforeEach(() => {
  useProcessStore.setState(createInitialState());
});

function renderToolbar() {
  return render(
    <ReactFlowProvider>
      <Toolbar fitViewOptions={{ padding: 0.1 }} />
    </ReactFlowProvider>,
  );
}

describe('Toolbar', () => {
  it('показывает переключатель интеграций, включённый по умолчанию (store)', () => {
    renderToolbar();

    const toggle = screen.getByRole('switch', { name: ru.toolbar.showIntegrations });
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText(ru.toolbar.showIntegrations)).toBeInTheDocument();
  });

  it('клик по переключателю вызывает toggleIntegrations в store', () => {
    renderToolbar();

    expect(useProcessStore.getState().showIntegrations).toBe(true);
    fireEvent.click(screen.getByRole('switch', { name: ru.toolbar.showIntegrations }));
    expect(useProcessStore.getState().showIntegrations).toBe(false);

    fireEvent.click(screen.getByRole('switch', { name: ru.toolbar.showIntegrations }));
    expect(useProcessStore.getState().showIntegrations).toBe(true);
  });

  it('переключатель отражает aria-checked текущего состояния store', () => {
    useProcessStore.getState().toggleIntegrations();
    renderToolbar();

    expect(screen.getByRole('switch', { name: ru.toolbar.showIntegrations })).toHaveAttribute(
      'aria-checked',
      'false',
    );
  });

  it('рендерит кнопки зума и процент масштаба, доступные по aria-label', () => {
    renderToolbar();

    expect(screen.getByRole('button', { name: ru.toolbar.zoomOut })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: ru.toolbar.zoomIn })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: ru.toolbar.fitView })).toBeInTheDocument();
    // Вьюпорт по умолчанию (ReactFlowProvider без явного defaultViewport) — zoom 1.
    expect(screen.getByText(ru.toolbar.zoomPercent(100))).toBeInTheDocument();
  });

  it('клики по зум-кнопкам и fit не падают без смонтированного полотна', () => {
    renderToolbar();

    // panZoom ещё не создан (нет реального <ReactFlow>) — хуки должны просто
    // не сработать, а не бросить исключение. Поведение при смонтированном
    // полотне проверяет e2e/toolbar.spec.ts.
    expect(() => {
      fireEvent.click(screen.getByRole('button', { name: ru.toolbar.zoomOut }));
      fireEvent.click(screen.getByRole('button', { name: ru.toolbar.zoomIn }));
      fireEvent.click(screen.getByRole('button', { name: ru.toolbar.fitView }));
    }).not.toThrow();
  });

  it('все кнопки — <button type="button">, достижимы клавиатурой (нет tabIndex=-1)', () => {
    renderToolbar();

    const buttons = [
      screen.getByRole('switch', { name: ru.toolbar.showIntegrations }),
      screen.getByRole('button', { name: ru.toolbar.zoomOut }),
      screen.getByRole('button', { name: ru.toolbar.zoomIn }),
      screen.getByRole('button', { name: ru.toolbar.fitView }),
    ];
    for (const button of buttons) {
      expect(button.tagName).toBe('BUTTON');
      expect(button).toHaveAttribute('type', 'button');
      expect(button).not.toHaveAttribute('tabindex', '-1');
    }
  });
});
