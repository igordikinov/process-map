// Тесты тулбара (SPEC §4.6, задача process-map-jl8).
//
// Клик по кнопкам тулбара юнит-тестом (fireEvent) достаточен только для
// проверки, что store/зум-хуки вызываются правильно: jsdom не делает
// hit-testing, поэтому «клик прошёл» тут ничего не доказывает про реальный
// браузер, если тулбар лежит поверх полотна React Flow. Настоящий клик мышью
// проверяется в e2e/toolbar.spec.ts (см. CLAUDE.md «Ловушки»).
import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import { Toolbar } from '../src/components/Toolbar';
import {
  getMergedProcessMap,
  loadBaseProcessMap,
  readStoredOverrides,
  setNodeOverride,
} from '../src/data/loader';
import type { ProcessMap } from '../src/data/schema';
import { refreshProcessMap } from '../src/hooks/useProcessMap';
import { ru } from '../src/i18n/ru';
import { createInitialState, useProcessStore } from '../src/store/useProcessStore';
import { serializeProcessMap } from '../src/utils/processTransfer';

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

  // ── Двухшаговый сброс и строка сообщения (process-map-ygd) ──────────────
  //
  // Настоящий клик мышью и перекрытие элементов здесь не проверяются (jsdom
  // не делает hit-testing) — это e2e/json-transfer.spec.ts. Здесь: что именно
  // происходит с хранилищем, фокусом и ARIA-ролями.

  /** Включает режим «Редактор»: кнопки редактора рендерятся только в нём. */
  function renderEditor(): void {
    renderToolbar();
    fireEvent.click(screen.getByRole('button', { name: ru.toolbar.modeEdit }));
  }

  function resetButton(): HTMLElement {
    return screen.getByRole('button', { name: ru.toolbar.resetOverrides });
  }

  /** Кладёт правку в localStorage и перечитывает карту, как это делает форма. */
  function seedOverride(): string {
    const nodeId = getMergedProcessMap().stages[0]?.nodes[0]?.id ?? '';
    setNodeOverride(nodeId, { title: 'Экран', url: 'https://example.com/a' });
    refreshProcessMap();
    return nodeId;
  }

  /**
   * Текст файла полной карты (именно её ждёт импорт, см. processTransfer.ts),
   * где первым `count` узлам первого этапа проставлены ссылки.
   */
  function mapFileWithScreens(count: number): string {
    const map = structuredClone(loadBaseProcessMap()) as ProcessMap;
    const nodes = map.stages[0]?.nodes ?? [];
    for (let index = 0; index < count; index += 1) {
      const node = nodes[index];
      if (node !== undefined) {
        node.screen = { title: `Экран ${index}`, url: `https://example.com/${index}` };
      }
    }
    return serializeProcessMap(map);
  }

  /**
   * Скармливает текст скрытому <input type="file"> и дожидается строки ответа.
   * Разбор асинхронный (file.text()), поэтому ждать нужно именно появления
   * живой области: её наличие и есть признак, что импорт завершился. Отдельно
   * проверяется, что область ровно одна — двух одновременных ответов быть не
   * должно.
   */
  async function importText(text: string, fileName = 'process.json'): Promise<HTMLElement> {
    const input = document.querySelector('input[type="file"]');
    expect(input).not.toBeNull();
    const file = new File([text], fileName, { type: 'application/json' });
    fireEvent.change(input as HTMLInputElement, { target: { files: [file] } });

    return waitFor(() => {
      const messages = document.querySelectorAll('[role="alert"], [role="status"]');
      expect(messages.length).toBe(1);
      return messages[0] as HTMLElement;
    });
  }

  it('успешный импорт показывает «Применено ссылок: N» и объявляет его (role=status)', async () => {
    const text = mapFileWithScreens(2);
    renderEditor();

    const message = await importText(text);

    expect(message).toHaveTextContent(ru.toolbar.importApplied(2));
    // Живая область: без роли сообщение бы нарисовалось, но не прозвучало.
    expect(message).toHaveAttribute('role', 'status');
    expect(Object.keys(readStoredOverrides()).length).toBe(2);
  });

  it('файл без расхождений даёт отдельное сообщение, а не «Применено ссылок: 0»', async () => {
    const text = mapFileWithScreens(0);
    renderEditor();

    const message = await importText(text);

    expect(message).toHaveTextContent(ru.toolbar.importNoChanges);
    expect(screen.queryByText(ru.toolbar.importApplied(0))).toBeNull();
  });

  it('битый JSON показывает ошибку с role=alert и не трогает правки', async () => {
    const nodeId = seedOverride();
    renderEditor();

    const message = await importText('{ это совсем не json', 'broken.json');

    expect(message).toHaveTextContent(ru.toolbar.importError);
    expect(message).toHaveAttribute('role', 'alert');
    expect(readStoredOverrides()).toEqual({
      [nodeId]: { screen: { title: 'Экран', url: 'https://example.com/a' } },
    });
  });

  it('чужой валидный JSON (файл overrides) отвергается тем же сообщением', async () => {
    const nodeId = seedOverride();
    renderEditor();

    const message = await importText(
      JSON.stringify({ 'chuzhoy-uzel': { screen: null } }),
      'overrides.json',
    );

    expect(message).toHaveTextContent(ru.toolbar.importError);
    expect(message).toHaveAttribute('role', 'alert');
    expect(Object.keys(readStoredOverrides())).toEqual([nodeId]);
  });

  it('сообщение живёт до следующего действия и снимается им', async () => {
    renderEditor();
    await importText('{ это совсем не json', 'broken.json');
    expect(screen.getByText(ru.toolbar.importError)).toBeInTheDocument();

    fireEvent.click(resetButton());

    expect(screen.queryByText(ru.toolbar.importError)).toBeNull();
  });

  it('первый клик по «Сбросить правки» ничего не удаляет, а спрашивает', () => {
    const nodeId = seedOverride();
    renderEditor();

    fireEvent.click(resetButton());

    // Правка на месте — сброса не произошло.
    expect(Object.keys(readStoredOverrides())).toEqual([nodeId]);
    // Вместо кнопки — вопрос и две кнопки ответа.
    expect(screen.queryByRole('button', { name: ru.toolbar.resetOverrides })).toBeNull();
    expect(screen.getByRole('group', { name: ru.toolbar.resetConfirm })).toBeInTheDocument();
    expect(screen.getByText(ru.toolbar.resetConfirm)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: ru.toolbar.resetConfirmAccept }),
    ).toBeInTheDocument();
  });

  it('подтверждение достижимо клавиатурой: фокус на «Удалить» сразу, «Отмена» следующая', () => {
    seedOverride();
    renderEditor();

    fireEvent.click(resetButton());

    const accept = screen.getByRole('button', { name: ru.toolbar.resetConfirmAccept });
    const cancel = screen.getByRole('button', { name: ru.toolbar.resetConfirmCancel });
    // Ноль Tab'ов до подтверждения: иначе фокус остался бы на <body>.
    expect(document.activeElement).toBe(accept);
    // Один Tab до «Отмена»: она следующий фокусируемый элемент в DOM.
    expect(accept.compareDocumentPosition(cancel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(accept.nextElementSibling).toBe(cancel);
  });

  it('«Отмена» возвращает исходный вид и не удаляет правки', () => {
    const nodeId = seedOverride();
    renderEditor();
    fireEvent.click(resetButton());

    fireEvent.click(screen.getByRole('button', { name: ru.toolbar.resetConfirmCancel }));

    expect(Object.keys(readStoredOverrides())).toEqual([nodeId]);
    expect(screen.queryByRole('group', { name: ru.toolbar.resetConfirm })).toBeNull();
    // Фокус вернулся на исходную кнопку, а не потерялся на <body>.
    expect(document.activeElement).toBe(resetButton());
  });

  it('потеря фокуса возвращает исходный вид и не удаляет правки', () => {
    const nodeId = seedOverride();
    renderEditor();
    fireEvent.click(resetButton());

    const accept = screen.getByRole('button', { name: ru.toolbar.resetConfirmAccept });
    fireEvent.focusOut(accept, { relatedTarget: document.body });

    expect(screen.queryByRole('group', { name: ru.toolbar.resetConfirm })).toBeNull();
    expect(resetButton()).toBeInTheDocument();
    expect(Object.keys(readStoredOverrides())).toEqual([nodeId]);
  });

  it('переход между «Удалить» и «Отмена» подтверждение не снимает', () => {
    seedOverride();
    renderEditor();
    fireEvent.click(resetButton());

    const accept = screen.getByRole('button', { name: ru.toolbar.resetConfirmAccept });
    const cancel = screen.getByRole('button', { name: ru.toolbar.resetConfirmCancel });
    fireEvent.focusOut(accept, { relatedTarget: cancel });

    expect(screen.getByRole('group', { name: ru.toolbar.resetConfirm })).toBeInTheDocument();
  });

  it('второй клик — «Удалить» — очищает overrides и обновляет карту', () => {
    const nodeId = seedOverride();
    renderEditor();

    fireEvent.click(resetButton());
    fireEvent.click(screen.getByRole('button', { name: ru.toolbar.resetConfirmAccept }));

    expect(readStoredOverrides()).toEqual({});
    // Карта перечитана через commitOverrides — иначе открытые экраны остались
    // бы с удалённой правкой.
    expect(
      getMergedProcessMap().stages[0]?.nodes.find((node) => node.id === nodeId)?.screen,
    ).toBeUndefined();
    // И кнопка вернулась в исходный вид.
    expect(resetButton()).toBeInTheDocument();
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
