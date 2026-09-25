// Карточка модуля — уровень 1 трёхуровневой карты (задача process-map-9mn.16).
//
// Чистый компонент без React Flow, по образцу тестов StageCard в
// tests/overview.test.tsx. Подписи сверяются через ru.*, а их тексты владельца —
// в tests/ru-three-levels.test.ts: здесь проверяется, что карточка показывает
// ДАННЫЕ модуля и ведёт куда надо, а не орфография строк.
import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { ModuleCard } from '../src/components/nodes/ModuleNode';
import type { Module } from '../src/data/schema';
import { ru } from '../src/i18n/ru';
import { createInitialState, useProcessStore } from '../src/store/useProcessStore';
import {
  MODULE_DEMAND,
  MODULE_PRODUCTION,
  parseThreeLevelProcessMap,
} from './fixtures/three-level-process';

function moduleById(id: string): Module {
  const module = parseThreeLevelProcessMap().modules.find((candidate) => candidate.id === id);
  if (module === undefined) {
    throw new Error(`В фикстуре нет модуля "${id}"`);
  }
  return module;
}

beforeEach(() => {
  useProcessStore.setState(createInitialState());
});

describe('ModuleCard', () => {
  it('показывает номер, подпись «Модуль» и короткое название', () => {
    const module = moduleById(MODULE_DEMAND);
    // Предпосылка: поля различаются, иначе проверка «в карточке короткое» пуста.
    expect(module.shortTitle).not.toBe(module.title);
    render(<ModuleCard module={module} />);

    const card = screen.getByRole('button');
    expect(within(card).getByText(String(module.number))).toBeInTheDocument();
    expect(within(card).getByText(ru.moduleNode.caption)).toBeInTheDocument();
    const title = within(card).getByText(module.shortTitle);
    // Полное название — в подсказке, а не в карточке.
    expect(title).toHaveAttribute('title', module.title);
    expect(within(card).queryByText(module.title)).toBeNull();
  });

  it('номер — module.number, а не позиция: у модуля «mrp» он 4 при третьем месте', () => {
    const module = moduleById(MODULE_PRODUCTION);
    expect(module.number).toBe(4);
    render(<ModuleCard module={module} />);
    expect(screen.getByText('4')).toBeInTheDocument();
  });

  it('aria-label кнопки — номер и ПОЛНОЕ название модуля', () => {
    const module = moduleById(MODULE_DEMAND);
    render(<ModuleCard module={module} />);
    expect(
      screen.getByRole('button', { name: ru.moduleNode.ariaLabel(module.number, module.title) }),
    ).toBeInTheDocument();
  });

  it('клик переводит store на экран этапов этого модуля', () => {
    const module = moduleById(MODULE_DEMAND);
    // Состояние «открыт этап» — чтобы проверить заодно, что этап сброшен:
    // иначе currentScreen() увёл бы на уровень шагов чужого модуля.
    useProcessStore.setState({ currentStageId: 'stage-5', selectedNodeId: 'x' });
    render(<ModuleCard module={module} />);

    fireEvent.click(screen.getByRole('button'));

    const state = useProcessStore.getState();
    expect(state.currentModuleId).toBe(module.id);
    expect(state.currentStageId).toBeNull();
    expect(state.selectedNodeId).toBeNull();
  });

  it('показывает «Ключевые выходы» со всеми строками модуля', () => {
    const module = moduleById(MODULE_DEMAND);
    expect(module.keyOutputs.length).toBeGreaterThan(1);
    render(<ModuleCard module={module} />);

    expect(screen.getByText(ru.moduleNode.keyOutputs)).toBeInTheDocument();
    expect(screen.getAllByRole('listitem').map((item) => item.textContent)).toEqual(
      module.keyOutputs.map((output) => `—${output}`),
    );
  });

  it('без ключевых выходов нет и заголовка над пустым списком', () => {
    // У модуля PP в фикстуре выходов нет (как у MRP на слайде обзора).
    const module = moduleById(MODULE_PRODUCTION);
    expect(module.keyOutputs).toEqual([]);
    render(<ModuleCard module={module} />);

    expect(screen.queryByText(ru.moduleNode.keyOutputs)).toBeNull();
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
  });

  it('компактный режим: два выхода и без подписи «Модуль»', () => {
    const module: Module = {
      ...moduleById(MODULE_DEMAND),
      keyOutputs: ['Первый', 'Второй', 'Третий'],
    };
    render(<ModuleCard module={module} compact />);

    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.queryByText(ru.moduleNode.caption)).toBeNull();
    // Номер и название остаются — по ним карточку и опознают.
    expect(screen.getByText(String(module.number))).toBeInTheDocument();
    expect(screen.getByText(module.shortTitle)).toBeInTheDocument();
  });

  it('строки «Открыть в In.Plan» нет даже при module.screen (отложено за M8)', () => {
    const module = parseThreeLevelProcessMap().modules.find((m) => m.screen !== undefined);
    expect(module, 'в фикстуре нужен модуль со ссылкой на экран').toBeDefined();
    render(<ModuleCard module={module as Module} />);
    expect(screen.queryByText(ru.stageNode.openInInplan)).toBeNull();
  });
});
