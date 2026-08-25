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
import { getMergedProcessMap, readStoredOverrides, setNodeOverride } from '../src/data/loader';
import { refreshProcessMap } from '../src/hooks/useProcessMap';
import { ru } from '../src/i18n/ru';
import { createInitialState, useProcessStore } from '../src/store/useProcessStore';

beforeEach(() => {
  useProcessStore.setState(createInitialState());
  localStorage.clear();
  refreshProcessMap();
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

  // Переключатель «Просмотр / Редактор» — SPEC §4.4, задача process-map-0sb.
  it('режим по умолчанию — «Просмотр», и это видно по aria-pressed', () => {
    renderToolbar();

    expect(useProcessStore.getState().mode).toBe('view');
    expect(screen.getByRole('button', { name: ru.toolbar.modeView })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: ru.toolbar.modeEdit })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('клик по «Редактор» и обратно переключает mode в store', () => {
    renderToolbar();

    fireEvent.click(screen.getByRole('button', { name: ru.toolbar.modeEdit }));
    expect(useProcessStore.getState().mode).toBe('edit');
    expect(screen.getByRole('button', { name: ru.toolbar.modeEdit })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    fireEvent.click(screen.getByRole('button', { name: ru.toolbar.modeView }));
    expect(useProcessStore.getState().mode).toBe('view');
  });

  it('режим не персистится: в localStorage после переключения пусто (SPEC §4.4)', () => {
    renderToolbar();

    fireEvent.click(screen.getByRole('button', { name: ru.toolbar.modeEdit }));

    // Ни своего ключа, ни записи в ключе overrides — режим живёт только в памяти.
    expect(localStorage.length).toBe(0);
  });

  // ── Кнопки редактора: экспорт/импорт/сброс (SPEC §4.4, process-map-6q0) ──
  //
  // Настоящее скачивание файла и выбор файла в <input type="file"> в jsdom не
  // воспроизводятся — их проверяет e2e/json-transfer.spec.ts. Здесь только
  // видимость по режиму и сброс, который никакого браузерного API не требует.
  const EDITOR_BUTTONS = [
    ru.toolbar.exportJson,
    ru.toolbar.importJson,
    ru.toolbar.resetOverrides,
  ] as const;

  it('в режиме «Просмотр» кнопок экспорта/импорта/сброса нет', () => {
    renderToolbar();

    for (const name of EDITOR_BUTTONS) {
      expect(screen.queryByRole('button', { name })).toBeNull();
    }
    // И скрытого file input тоже нет: в просмотре импортировать нечего.
    expect(document.querySelector('input[type="file"]')).toBeNull();
  });

  it('в режиме «Редактор» появляются все три кнопки SPEC §4.4', () => {
    renderToolbar();
    fireEvent.click(screen.getByRole('button', { name: ru.toolbar.modeEdit }));

    for (const name of EDITOR_BUTTONS) {
      const button = screen.getByRole('button', { name });
      expect(button).toBeInTheDocument();
      expect(button).toHaveAttribute('type', 'button');
      expect(button).not.toHaveAttribute('tabindex', '-1');
    }
  });

  it('возврат в «Просмотр» снова убирает кнопки редактора', () => {
    renderToolbar();
    fireEvent.click(screen.getByRole('button', { name: ru.toolbar.modeEdit }));
    expect(screen.getByRole('button', { name: ru.toolbar.exportJson })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: ru.toolbar.modeView }));

    expect(screen.queryByRole('button', { name: ru.toolbar.exportJson })).toBeNull();
  });

  it('скрытый file input не попадает в обход Tab и не читается скринридером', () => {
    renderToolbar();
    fireEvent.click(screen.getByRole('button', { name: ru.toolbar.modeEdit }));

    const input = document.querySelector('input[type="file"]');
    expect(input).not.toBeNull();
    expect(input).toHaveAttribute('tabindex', '-1');
    expect(input).toHaveAttribute('aria-hidden', 'true');
  });

  it('«Сбросить правки» очищает overrides и обновляет карту (без подтверждения)', () => {
    const nodeId = getMergedProcessMap().stages[0]?.nodes[0]?.id ?? '';
    setNodeOverride(nodeId, { title: 'Экран', url: 'https://example.com/a' });
    refreshProcessMap();

    renderToolbar();
    fireEvent.click(screen.getByRole('button', { name: ru.toolbar.modeEdit }));
    fireEvent.click(screen.getByRole('button', { name: ru.toolbar.resetOverrides }));

    expect(readStoredOverrides()).toEqual({});
    // Карта перечитана через commitOverrides — иначе открытые экраны остались
    // бы с удалённой правкой.
    expect(
      getMergedProcessMap().stages[0]?.nodes.find((node) => node.id === nodeId)?.screen,
    ).toBeUndefined();
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
      screen.getByRole('button', { name: ru.toolbar.modeView }),
      screen.getByRole('button', { name: ru.toolbar.modeEdit }),
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
