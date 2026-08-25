// Тесты легенды (SPEC §4.6, задача process-map-jl8).
//
// Состав пунктов зависит от уровня (currentStageId в store) и от toggle
// showIntegrations — ревью координатора: макет по ошибке показывал одни и те
// же 4 типа узлов на обзоре, где узлов этих типов вообще нет. Компонент
// больше не «чистый»: читает store, поэтому тесты сбрасывают его состояние.
import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Legend } from '../src/components/Legend';
import { ru } from '../src/i18n/ru';
import { createInitialState, useProcessStore } from '../src/store/useProcessStore';

beforeEach(() => {
  useProcessStore.setState(createInitialState());
});

describe('Legend: уровень 1 (обзор, currentStageId === null)', () => {
  it('показывает процесс/интеграцию/систему — то, что реально есть на обзоре', () => {
    render(<Legend />);

    const group = screen.getByRole('group', { name: ru.legend.ariaLabel });
    expect(group).toBeInTheDocument();
    expect(screen.getByText(ru.legend.process)).toBeInTheDocument();
    expect(screen.getByText(ru.legend.integration)).toBeInTheDocument();
    expect(screen.getByText(ru.legend.system)).toBeInTheDocument();
  });

  it('не показывает типы узлов уровня 2 — на обзоре их не бывает', () => {
    render(<Legend />);

    expect(screen.queryByText(ru.legend.step)).not.toBeInTheDocument();
    expect(screen.queryByText(ru.legend.data)).not.toBeInTheDocument();
    expect(screen.queryByText(ru.legend.warning)).not.toBeInTheDocument();
  });

  it('выключенный toggle убирает «Интеграция» и «Система» — на полотне их больше нет', () => {
    useProcessStore.getState().toggleIntegrations();
    render(<Legend />);

    expect(screen.getByText(ru.legend.process)).toBeInTheDocument();
    expect(screen.queryByText(ru.legend.integration)).not.toBeInTheDocument();
    expect(screen.queryByText(ru.legend.system)).not.toBeInTheDocument();
  });
});

describe('Legend: уровень 2 (детализация, currentStageId задан)', () => {
  beforeEach(() => {
    useProcessStore.getState().navigateToStage('stage-1-obogaschenie-prognoza-zakazami');
  });

  it('показывает 4 типа узлов, как в макете A2', () => {
    render(<Legend />);

    expect(screen.getByText(ru.legend.step)).toBeInTheDocument();
    expect(screen.getByText(ru.legend.data)).toBeInTheDocument();
    expect(screen.getByText(ru.legend.integration)).toBeInTheDocument();
    expect(screen.getByText(ru.legend.warning)).toBeInTheDocument();
  });

  it('не показывает пункты уровня 1 (процесс/система)', () => {
    render(<Legend />);

    expect(screen.queryByText(ru.legend.process)).not.toBeInTheDocument();
    expect(screen.queryByText(ru.legend.system)).not.toBeInTheDocument();
  });

  it('выключенный toggle убирает только «Интеграция», типы узлов остаются', () => {
    useProcessStore.getState().toggleIntegrations();
    render(<Legend />);

    expect(screen.queryByText(ru.legend.integration)).not.toBeInTheDocument();
    expect(screen.getByText(ru.legend.step)).toBeInTheDocument();
    expect(screen.getByText(ru.legend.data)).toBeInTheDocument();
    expect(screen.getByText(ru.legend.warning)).toBeInTheDocument();
  });
});

describe('Legend: общее', () => {
  it('не содержит фокусируемых элементов — легенда не интерактивна', () => {
    const { container } = render(<Legend />);
    expect(container.querySelectorAll('button, a, [tabindex]')).toHaveLength(0);
  });
});
