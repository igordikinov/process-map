// Экран модулей — корень трёхуровневой карты (задача process-map-9mn.16).
//
// ТРЁХУРОВНЕВАЯ СТРАНИЦА ИЗ ФИКСТУР (tests/fixtures/pageMocks.ts): по
// умолчанию — трёхуровневая фикстура, второй версией — двухуровневая. Так будет
// устроен корень после эпика M8 («Процессы» и «Полная модель» на одном
// адресе). Подменены только два JSON-модуля; App, versions.ts, loader.ts и
// store работают по-настоящему.
//
// Что НЕ проверяется здесь и почему:
//   · настоящий клик мышью по карточке — jsdom не делает hit-testing, и
//     fireEvent.click «сработал бы» и с мёртвой карточкой. Здесь проверяются
//     обработчик и стиль обёртки (pointer-events), а клик мышью — e2e задачи
//     process-map-9mn.21;
//   · содержимое экрана модуля — его сторожит tests/levelTwo.test.tsx
//     (process-map-9mn.17). Здесь проверяется только, что экран сменился;
//   · рёбра и их подписи на полотне — в jsdom React Flow рёбер не рисует
//     вовсе: хэндлы узлов не измерены (layout нет), и ребру не к чему
//     крепиться. Подписи проверены на графе (tests/modulesGraph.test.ts), их
//     перенос — на самом компоненте ребра (tests/artifactEdge.test.tsx).
//     САМИ хэндлы при этом рисуются (разметка без геометрии), и их сторона
//     проверяется здесь — по атрибутам, которые React Flow ставит без layout.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import App from '../src/App';
import { Legend } from '../src/components/Legend';
import { MODULE_HANDLE } from '../src/components/nodes/ModuleNode';
import { clearImportedMap, setImportedMap } from '../src/data/activeMap';
import { loadBaseProcessMap } from '../src/data/loader';
import { ProcessMapSchema } from '../src/data/schema';
import { listVersions, resetSelectedVersion } from '../src/data/versions';
import { refreshProcessMap } from '../src/hooks/useProcessMap';
import { ru } from '../src/i18n/ru';
import { createInitialState, useProcessStore } from '../src/store/useProcessStore';
import { MODULE_NODE_SIZE, MODULE_NODE_SIZE_COMPACT } from '../src/theme/sizes';
import { THREE_LEVEL_PAGE_ALT_ID, THREE_LEVEL_PAGE_DEFAULT_ID } from './fixtures/pageMocks';
import { buildSampleProcessMap } from './fixtures/sample-process';
import { LANE_FPA, MODULE_SUPPLY, buildThreeLevelProcessMap } from './fixtures/three-level-process';

// Порядок и форма — дословно из шапки tests/fixtures/pageMocks.ts.
vi.mock('@map/process.json', async () =>
  (await import('./fixtures/pageMocks')).threeLevelDefaultVersionModule(),
);
vi.mock('@map-alt/process.json', async () =>
  (await import('./fixtures/pageMocks')).twoLevelAltVersionModule(),
);

/** Ожидания считаются из самих фикстур — свежих, не тронутых приложением. */
const THREE = buildThreeLevelProcessMap();
const TWO = buildSampleProcessMap();

async function renderApp() {
  let result: ReturnType<typeof render> | undefined;
  await act(async () => {
    result = render(<App />);
  });
  if (result === undefined) {
    throw new Error('App не отрендерился');
  }
  return result;
}

function versionGroup(): HTMLElement {
  return screen.getByRole('group', { name: ru.overview.versionGroup });
}

/*
 * ПОДПИСИ ВЕРСИЙ — ЗАГОЛОВКИ ФИКСТУР: подписей владельца у id фикстур нет, и
 * кнопка подписывается заголовком карты. Первый тест закрепляет это явно.
 */
const THREE_LABEL = THREE.title;
const TWO_LABEL = TWO.title;

beforeEach(() => {
  localStorage.clear();
  useProcessStore.setState(createInitialState());
  clearImportedMap();
  resetSelectedVersion();
  refreshProcessMap();
  window.history.replaceState({}, '', '/');
});

afterEach(() => {
  // Размонтировать ДО сброса карты: иначе refreshProcessMap() будит ещё
  // смонтированное полотно вне act(), и каждый тест сыплет предупреждениями
  // React. Автоочистка Testing Library идёт позже этого хука.
  cleanup();
  clearImportedMap();
  resetSelectedVersion();
  refreshProcessMap();
});

describe('страница из фикстур собралась', () => {
  it('по умолчанию трёхуровневая фикстура, второй версией двухуровневая', () => {
    // Сторож самой страницы: отвались подмена — тесты ниже смотрели бы на snp.
    expect(listVersions().map((version) => version.id)).toEqual([
      THREE_LEVEL_PAGE_DEFAULT_ID,
      THREE_LEVEL_PAGE_ALT_ID,
    ]);
    expect(loadBaseProcessMap().id).toBe(THREE.id);
    expect(ru.overview.versionLabels[THREE_LEVEL_PAGE_DEFAULT_ID]).toBeUndefined();
    expect(ru.overview.versionLabels[THREE_LEVEL_PAGE_ALT_ID]).toBeUndefined();
  });

  it('у версии с модулями в списке есть число модулей, у двухуровневой — нет', () => {
    const [three, two] = listVersions();
    expect(three).toMatchObject({ stages: THREE.stages.length, modules: THREE.modules.length });
    expect(two?.modules).toBeUndefined();
    expect(two?.stages).toBe(TWO.stages.length);
  });
});

describe('корень трёхуровневой карты — экран модулей', () => {
  it('карточки модулей, бейдж «N модулей», переключатель версий', async () => {
    const { container } = await renderApp();

    expect(screen.getByRole('heading', { name: THREE.title })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: ru.overview.allModulesCanvasLabel })).toBeVisible();
    for (const module of THREE.modules) {
      expect(
        screen.getByRole('button', { name: ru.moduleNode.ariaLabel(module.number, module.title) }),
      ).toBeInTheDocument();
    }
    expect(screen.getByText(ru.overview.modulesBadge(THREE.modules.length))).toBeInTheDocument();
    // Не «7 этапов»: этапов на этом экране нет.
    expect(screen.queryByText(ru.overview.stagesBadge(THREE.stages.length))).toBeNull();

    expect(
      within(versionGroup())
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual([THREE_LABEL, TWO_LABEL]);

    // Свой тип узла: карточки модулей не считаются этапами
    // (e2e/deep-link.spec.ts::waitForOverview ждёт .react-flow__node-stage).
    expect(container.querySelectorAll('.react-flow__node-module')).toHaveLength(
      THREE.modules.length,
    );
    expect(container.querySelectorAll('.react-flow__node-stage')).toHaveLength(0);
  });

  it('фокусируемых элементов на полотне ровно столько, сколько карточек модулей', async () => {
    const { container } = await renderApp();

    // Обёртки узлов и рёбер в Tab не стоят (nodesFocusable/edgesFocusable),
    // полоса FP&A — тоже: у неё нет действия.
    expect(container.querySelectorAll('.react-flow [tabindex]:not([tabindex="-1"])')).toHaveLength(
      0,
    );
    expect(container.querySelectorAll('.react-flow button')).toHaveLength(THREE.modules.length);
  });

  it('обёртки карточек принимают события мыши, обёртка полосы — нет', async () => {
    // jsdom не делает hit-testing, поэтому проверяется сам стиль обёртки:
    // React Flow 12 пишет pointer-events: none узлу без флагов интерактивности.
    const { container } = await renderApp();

    for (const module of THREE.modules) {
      const wrapper = container.querySelector<HTMLElement>(`[data-id="${module.id}"]`);
      expect(wrapper, module.id).not.toBeNull();
      expect(wrapper?.style.pointerEvents).toBe('all');
    }

    const band = container.querySelector<HTMLElement>(`[data-id="${LANE_FPA}"]`);
    expect(band).not.toBeNull();
    expect(band?.style.pointerEvents).toBe('none');
    expect(band?.hasAttribute('tabindex')).toBe(false);
    expect(band?.getAttribute('role')).toBe('group');
    expect(band?.getAttribute('aria-label')).toBe(ru.lane.ariaLabel(THREE.lanes[0]?.title ?? ''));
    expect(band?.querySelector('button')).toBeNull();
  });

  /*
   * СТОРОНА КАЖДОГО ХЭНДЛА. Граф (modulesGraph.ts) выбирает хэндл по id, а
   * куда этот id выведен на карточке, решает ModuleNode.tsx — и граф об этом
   * не знает. Переставь выход 'right' на Position.Bottom, и каждая связь с
   * соседом справа молча выходила бы снизу, а все тесты графа оставались бы
   * зелёными (ревью 9mn.16). Рёбра в jsdom не рисуются, но разметку хэндлов
   * React Flow ставит без layout: data-handleid, data-handlepos и класс
   * source/target.
   */
  it('хэндлы карточки модуля — на своих сторонах и своего направления', async () => {
    const { container } = await renderApp();
    const expected = [
      { id: MODULE_HANDLE.left, position: 'left', type: 'target' },
      { id: MODULE_HANDLE.top, position: 'top', type: 'target' },
      { id: MODULE_HANDLE.right, position: 'right', type: 'source' },
      { id: MODULE_HANDLE.bottom, position: 'bottom', type: 'source' },
    ] as const;

    for (const module of THREE.modules) {
      const wrapper = container.querySelector<HTMLElement>(`[data-id="${module.id}"]`);
      expect(wrapper, module.id).not.toBeNull();
      expect(wrapper?.querySelectorAll('.react-flow__handle'), module.id).toHaveLength(
        expected.length,
      );
      for (const { id, position, type } of expected) {
        const handle = wrapper?.querySelector<HTMLElement>(
          `.react-flow__handle[data-handleid="${id}"]`,
        );
        expect(handle, `${module.id}: хэндл ${id}`).not.toBeNull();
        expect(handle?.dataset.handlepos, `${module.id}: сторона хэндла ${id}`).toBe(position);
        expect(handle, `${module.id}: направление хэндла ${id}`).toHaveClass(type);
      }
    }
  });

  /*
   * ТУМБЛЕР ИНТЕГРАЦИЙ НА САМОМ ЭКРАНЕ (SPEC §4.6). Граф проверяет, что сборка
   * с showIntegrations=false убирает системы (tests/modulesGraph.test.ts), но
   * не то, что экран передаёт в сборку значение тумблера. Экран, звавший
   * buildModulesGraph(map, true, …), проходил все тесты: ESLint замечал только
   * «лишнюю зависимость» useMemo предупреждением, а npm run check на
   * предупреждениях не падает (ревью 9mn.16).
   */
  it('тумблер интеграций убирает с полотна системы и свимлейны, карточки и полоса остаются', async () => {
    const { container } = await renderApp();
    // Предпосылка: у фикстуры есть концы-системы (BI, EPM), иначе убирать нечего.
    expect(container.querySelectorAll('.react-flow__node-system').length).toBeGreaterThan(0);
    expect(container.querySelectorAll('.react-flow__node-lane').length).toBeGreaterThan(0);

    await act(async () => {
      useProcessStore.getState().toggleIntegrations();
    });

    expect(container.querySelectorAll('.react-flow__node-system')).toHaveLength(0);
    expect(container.querySelectorAll('.react-flow__node-lane')).toHaveLength(0);
    expect(container.querySelectorAll('.react-flow__node-module')).toHaveLength(
      THREE.modules.length,
    );
    expect(container.querySelector(`[data-id="${LANE_FPA}"]`)).not.toBeNull();
  });

  it('клик по карточке ведёт на экран этапов этого модуля', async () => {
    await renderApp();
    const supply = THREE.modules.find((module) => module.id === MODULE_SUPPLY);
    expect(supply).toBeDefined();

    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', {
          name: ru.moduleNode.ariaLabel(supply?.number ?? 0, supply?.title ?? ''),
        }),
      );
    });

    expect(useProcessStore.getState().currentModuleId).toBe(MODULE_SUPPLY);
    // Экран сменился: полотна модулей больше нет, есть полотно этапов модуля —
    // «уровень 2», а не «уровень 1» двухуровневой карты (process-map-9mn.17).
    expect(screen.queryByRole('region', { name: ru.overview.allModulesCanvasLabel })).toBeNull();
    expect(screen.getByRole('region', { name: ru.overview.moduleCanvasLabel })).toBeInTheDocument();
  });
});

describe('защита «модуль не найден»', () => {
  it('неизвестный currentModuleId при монтировании возвращает на корень', async () => {
    useProcessStore.setState({ currentModuleId: 'no-such-module' });
    await renderApp();

    expect(useProcessStore.getState().currentModuleId).toBeNull();
    expect(screen.getByRole('region', { name: ru.overview.allModulesCanvasLabel })).toBeVisible();
  });

  it('модуль, пропавший уже на экране этапов, тоже возвращает на корень', async () => {
    await renderApp();
    await act(async () => {
      useProcessStore.getState().navigateToModule(MODULE_SUPPLY);
    });
    expect(screen.getByRole('region', { name: ru.overview.moduleCanvasLabel })).toBeInTheDocument();

    await act(async () => {
      useProcessStore.setState({ currentModuleId: 'ghost' });
    });

    expect(useProcessStore.getState().currentModuleId).toBeNull();
    expect(screen.getByRole('region', { name: ru.overview.allModulesCanvasLabel })).toBeVisible();
  });

  it('известный модуль защита не трогает', async () => {
    await renderApp();
    await act(async () => {
      useProcessStore.getState().navigateToModule(MODULE_SUPPLY);
    });
    expect(useProcessStore.getState().currentModuleId).toBe(MODULE_SUPPLY);
  });

  /*
   * ЗАЩИТА СТОИТ ТОЛЬКО НА ЭКРАНЕ 'stages'. Этап без модуля — законное
   * состояние (комментарий к navigateToStage в useProcessStore.ts: «этап
   * задан, модуль нет»): в него ведёт deep-link ?stage=N, useDeepLink зовёт
   * navigateToStage(stageId) без модуля.
   * Защита, расширенная на всякий экран кроме корня (`screen !== 'modules'`),
   * выбрасывала бы такого читателя на корень — и ни один тест выше этого не
   * замечал (ревью 9mn.16).
   */
  it('deep-link ?stage=N без модуля защита не трогает: открыт этап, модуль не задан', async () => {
    const stage = THREE.stages.find((candidate) => candidate.number === 2);
    expect(stage).toBeDefined();
    window.history.replaceState({}, '', '/?stage=2');

    const { container } = await renderApp();

    expect(useProcessStore.getState().currentStageId).toBe(stage?.id);
    expect(useProcessStore.getState().currentModuleId).toBeNull();
    // Экран шагов именно этого этапа, а не корень: узел этапа 2 на полотне.
    // По id узла, а не по подписи полотна — подпись экрана шагов трёхуровневой
    // карты ещё поменяется (ru.stageDetail.moduleStageCanvasLabel).
    expect(container.querySelector(`[data-id="${stage?.nodes[0]?.id ?? ''}"]`)).not.toBeNull();
    expect(screen.queryByRole('region', { name: ru.overview.allModulesCanvasLabel })).toBeNull();
  });
});

/**
 * ResizeObserver, чей колбэк дёргает тест, — урезанная копия прецедента из
 * tests/compact.test.tsx (там же — почему размер задаётся точечно на узле, а
 * не расширением глобального мока tests/setup.ts). Своя копия, а не импорт:
 * тот файл — тест, а не помощник, и его правка не должна задевать этот.
 */
class ControllableResizeObserver implements ResizeObserver {
  static instances: ControllableResizeObserver[] = [];
  private readonly callback: ResizeObserverCallback;
  readonly targets = new Set<Element>();

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
    ControllableResizeObserver.instances.push(this);
  }

  observe(target: Element): void {
    this.targets.add(target);
  }

  unobserve(target: Element): void {
    this.targets.delete(target);
  }

  disconnect(): void {
    this.targets.clear();
  }

  /** Сообщить о новом размере одного наблюдаемого элемента. */
  emit(target: Element): void {
    this.callback(
      [{ target, contentRect: target.getBoundingClientRect() } as ResizeObserverEntry],
      this,
    );
  }
}

/** Размер ОДНОГО элемента, не прототипа, — довод в шапке tests/compact.test.tsx. */
function setElementSize(element: HTMLElement, width: number, height: number): void {
  element.getBoundingClientRect = () =>
    ({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: width,
      bottom: height,
      width,
      height,
      toJSON: () => ({}),
    }) as DOMRect;
}

/*
 * КОМПАКТНЫЙ РЕЖИМ ЭКРАНА (SPEC §4.5). Доводка компактного уровня 1 — задача
 * process-map-9mn.19; здесь экран обязан лишь рисоваться. Но «рисоваться» —
 * это ещё и «получить режим»: граф проверен с compact=true отдельно
 * (tests/modulesGraph.test.ts), а экран, звавший сборку с жёстким false,
 * проходил все тесты (ревью 9mn.16). Поэтому фрейм опускается ниже порога
 * настоящим путём — через useFrameSize, — и проверяется, что режим доехал и до
 * карточек, и до шапки с легендой.
 */
describe('компактный режим экрана модулей', () => {
  const originalResizeObserver = globalThis.ResizeObserver;

  beforeEach(() => {
    ControllableResizeObserver.instances = [];
    globalThis.ResizeObserver = ControllableResizeObserver as unknown as typeof ResizeObserver;
  });

  afterEach(() => {
    globalThis.ResizeObserver = originalResizeObserver;
  });

  it('низкий фрейм: карточки модулей компактные, бейдж модулей на месте, легенда свёрнута', async () => {
    const { container } = await renderApp();
    const root = screen.getByRole('region', {
      name: ru.overview.allModulesCanvasLabel,
    }).parentElement;
    if (root === null) {
      throw new Error('У полотна модулей нет корневого элемента экрана');
    }
    const wrapperOf = (id: string) => container.querySelector<HTMLElement>(`[data-id="${id}"]`);
    // До подмены — обычный режим: иначе тест прошёл бы, ничего не переключив.
    expect(wrapperOf(MODULE_SUPPLY)?.style.width).toBe(`${MODULE_NODE_SIZE.width}px`);

    // Наблюдатель корня экрана — тот, что завёл useFrameSize; колбэки React
    // Flow (полотно, узлы) не дёргаются.
    const observers = ControllableResizeObserver.instances.filter((instance) =>
      instance.targets.has(root),
    );
    expect(observers.length, 'useFrameSize обязан наблюдать корень экрана').toBeGreaterThan(0);
    setElementSize(root, 1024, 600);
    act(() => {
      for (const observer of observers) {
        observer.emit(root);
      }
    });

    for (const module of THREE.modules) {
      const card = screen.getByRole('button', {
        name: ru.moduleNode.ariaLabel(module.number, module.title),
      });
      // Компактная карточка — без подписи «Модуль» (ModuleCard).
      expect(within(card).queryByText(ru.moduleNode.caption), module.id).toBeNull();
      expect(wrapperOf(module.id)?.style.width, module.id).toBe(
        `${MODULE_NODE_SIZE_COMPACT.width}px`,
      );
      expect(wrapperOf(module.id)?.style.height, module.id).toBe(
        `${MODULE_NODE_SIZE_COMPACT.height}px`,
      );
    }
    expect(screen.getByText(ru.overview.modulesBadge(THREE.modules.length))).toBeInTheDocument();
    // Легенда свёрнута в кнопку — режим доехал и до неё.
    expect(screen.getByRole('button', { name: ru.legend.expand })).toBeInTheDocument();
  });
});

describe('переключатель версий на корне трёхуровневой карты', () => {
  it('вторая версия открывается своим корнем — обзором этапов', async () => {
    const { container } = await renderApp();

    await act(async () => {
      fireEvent.click(within(versionGroup()).getByRole('button', { name: TWO_LABEL }));
    });

    expect(loadBaseProcessMap().id).toBe(THREE_LEVEL_PAGE_ALT_ID);
    expect(screen.getByRole('heading', { name: TWO.title })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: ru.overview.canvasLabel })).toBeInTheDocument();
    expect(screen.getByText(ru.overview.stagesBadge(TWO.stages.length))).toBeInTheDocument();
    expect(container.querySelectorAll('.react-flow__node-stage')).toHaveLength(TWO.stages.length);
    expect(container.querySelectorAll('.react-flow__node-module')).toHaveLength(0);
    // Переключатель остаётся и на корне двухуровневой версии — путь назад есть.
    expect(within(versionGroup()).getAllByRole('button')).toHaveLength(2);
  });

  it('и возвращается обратно на экран модулей', async () => {
    await renderApp();
    await act(async () => {
      fireEvent.click(within(versionGroup()).getByRole('button', { name: TWO_LABEL }));
    });
    await act(async () => {
      fireEvent.click(within(versionGroup()).getByRole('button', { name: THREE_LABEL }));
    });

    expect(screen.getByRole('region', { name: ru.overview.allModulesCanvasLabel })).toBeVisible();
  });

  it('подсказка считает модули у трёхуровневой версии и этапы у двухуровневой', async () => {
    await renderApp();

    expect(within(versionGroup()).getByRole('button', { name: THREE_LABEL })).toHaveAttribute(
      'title',
      ru.overview.versionHint(THREE_LABEL, ru.overview.modulesCount(THREE.modules.length)),
    );
    expect(within(versionGroup()).getByRole('button', { name: TWO_LABEL })).toHaveAttribute(
      'title',
      ru.overview.versionHint(TWO_LABEL, ru.overview.stagesCount(TWO.stages.length)),
    );
  });

  it('живая область называет число модулей активной трёхуровневой версии', async () => {
    await renderApp();

    expect(screen.getByRole('status')).toHaveTextContent(
      ru.overview.versionAnnouncement(THREE_LABEL, ru.overview.modulesCount(THREE.modules.length)),
    );
  });
});

describe('легенда экрана модулей', () => {
  it('процесс, интеграция и система — у фикстуры есть и связи модулей, и концы-системы', async () => {
    await renderApp();
    const legend = screen.getByRole('group', { name: ru.legend.ariaLabel });

    expect(within(legend).getByText(ru.legend.process)).toBeInTheDocument();
    expect(within(legend).getByText(ru.legend.integration)).toBeInTheDocument();
    expect(within(legend).getByText(ru.legend.system)).toBeInTheDocument();
    // Типы узлов уровня шагов на экране модулей не встречаются.
    expect(within(legend).queryByText(ru.legend.step)).toBeNull();
  });

  it('выключенный тумблер интеграций оставляет только «Процесс»', async () => {
    useProcessStore.getState().toggleIntegrations();
    render(<Legend />);
    const legend = screen.getByRole('group', { name: ru.legend.ariaLabel });

    expect(within(legend).getByText(ru.legend.process)).toBeInTheDocument();
    expect(within(legend).queryByText(ru.legend.integration)).toBeNull();
    expect(within(legend).queryByText(ru.legend.system)).toBeNull();
  });

  /*
   * На фикстуре состав легенды экрана модулей совпадает с составом обзора
   * этапов (все три пункта), и тест выше не отличил бы «экран модулей узнан»
   * от «экран модулей принят за обзор этапов». Различает карта БЕЗ концов-систем
   * — такой будет настоящая inplan: на её уровне 1 свимлейнов нет, и легенда
   * обязана их не обещать, а на экране этапов модуля — прежняя.
   */
  it('без концов-систем экран модулей не обещает свимлейнов, экран этапов — прежний', async () => {
    const withoutSystems = buildThreeLevelProcessMap();
    withoutSystems.moduleEdges = withoutSystems.moduleEdges.filter(
      (edge) => edge.kind === 'process',
    );
    setImportedMap(ProcessMapSchema.parse({ ...withoutSystems, id: 'files-three-level' }));
    refreshProcessMap();

    const { unmount } = render(<Legend />);
    let legend = screen.getByRole('group', { name: ru.legend.ariaLabel });
    expect(within(legend).getByText(ru.legend.process)).toBeInTheDocument();
    expect(within(legend).queryByText(ru.legend.integration)).toBeNull();
    expect(within(legend).queryByText(ru.legend.system)).toBeNull();
    unmount();

    useProcessStore.getState().navigateToModule(MODULE_SUPPLY);
    render(<Legend />);
    legend = screen.getByRole('group', { name: ru.legend.ariaLabel });
    expect(within(legend).getByText(ru.legend.process)).toBeInTheDocument();
    expect(within(legend).getByText(ru.legend.integration)).toBeInTheDocument();
    expect(within(legend).getByText(ru.legend.system)).toBeInTheDocument();
  });

  /*
   * «Процесс» — только при связи МОДУЛЬ → МОДУЛЬ, а не при любой связи уровня
   * 1. Тест ниже (карта без связей вовсе) этого не различает: на нём оба
   * признака ложны. Различает карта, у которой связи уровня 1 есть, но все — с
   * системами: линии процесса на её полотне нет ни одной (ревью 9mn.16).
   */
  it('связи уровня 1 только с системами: «Процесс» не обещан, свимлейны — да', async () => {
    const systemsOnly = buildThreeLevelProcessMap();
    const moduleIds = new Set(systemsOnly.modules.map((module) => module.id));
    systemsOnly.moduleEdges = systemsOnly.moduleEdges.filter(
      (edge) => !moduleIds.has(edge.source) || !moduleIds.has(edge.target),
    );
    // Предпосылка: связи остались, и ни одна не соединяет два модуля.
    expect(systemsOnly.moduleEdges.length).toBeGreaterThan(0);
    setImportedMap(ProcessMapSchema.parse({ ...systemsOnly, id: 'files-systems-only' }));
    refreshProcessMap();

    render(<Legend />);
    const legend = screen.getByRole('group', { name: ru.legend.ariaLabel });
    expect(within(legend).queryByText(ru.legend.process)).toBeNull();
    expect(within(legend).getByText(ru.legend.integration)).toBeInTheDocument();
    expect(within(legend).getByText(ru.legend.system)).toBeInTheDocument();
  });

  it('карта из одного модуля без связей не обещает и линии процесса', async () => {
    const single = buildThreeLevelProcessMap();
    // Один модуль со всеми этапами: validateIntegrity такой документ принимает
    // (одна карточка на уровне 1 — законный случай, шапка hasModules).
    const [first] = single.modules;
    if (first === undefined) {
      throw new Error('В фикстуре нет модулей');
    }
    single.modules = [{ ...first, stageIds: single.stages.map((stage) => stage.id) }];
    delete (single as { moduleEdges?: unknown }).moduleEdges;
    delete (single as { lanes?: unknown }).lanes;
    setImportedMap(ProcessMapSchema.parse({ ...single, id: 'files-single-module' }));
    refreshProcessMap();

    render(<Legend />);
    const legend = screen.getByRole('group', { name: ru.legend.ariaLabel });
    expect(within(legend).queryByText(ru.legend.process)).toBeNull();
    expect(within(legend).queryByText(ru.legend.system)).toBeNull();
  });
});
