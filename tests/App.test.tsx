// Smoke-тест монтирования приложения: App рендерит обзор уровня 1 вместе с
// полотном React Flow. Полифиллы окружения для React Flow (ResizeObserver,
// getBoundingClientRect, DOMMatrixReadOnly) — в tests/setup.ts.
// Содержательные проверки обзора — в tests/overview.test.tsx.
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from '../src/App';
import { loadBaseProcessMap } from '../src/data/loader';
import { ru } from '../src/i18n/ru';

describe('App', () => {
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
});
