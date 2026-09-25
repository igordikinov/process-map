// Экран модуля — уровень 2 трёхуровневой карты — и крошки на три звена
// (задача process-map-9mn.17).
//
// ТРЁХУРОВНЕВАЯ СТРАНИЦА ИЗ ФИКСТУР (tests/fixtures/pageMocks.ts): по
// умолчанию — трёхуровневая фикстура, второй версией — двухуровневая. App,
// versions.ts, loader.ts и store работают по-настоящему; подменены только два
// JSON-модуля.
//
// Граф экрана модуля как чистая функция — tests/levelTwoGraph.test.ts. Здесь —
// то, чего граф не видит: что экран передаёт ему вид модуля, какая у экрана
// шапка, и куда ведут звенья крошек и «Назад».
//
// Что НЕ проверяется здесь и почему: настоящий клик мышью. jsdom не делает
// hit-testing, и fireEvent.click «сработал бы» и по кнопке, закрытой чужим
// слоем. Здесь проверяются обработчики; клик мышью — e2e задачи
// process-map-9mn.21.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import App from '../src/App';
import { Breadcrumbs } from '../src/components/Breadcrumbs';
import { FLOW_LANE_ID, systemNodeId } from '../src/components/Overview/overviewGraph';
import { clearImportedMap } from '../src/data/activeMap';
import { loadBaseProcessMap } from '../src/data/loader';
import { levelTwoView } from '../src/data/modules';
import type { Module, Stage } from '../src/data/schema';
import { resetSelectedVersion } from '../src/data/versions';
import { refreshProcessMap } from '../src/hooks/useProcessMap';
import { ru } from '../src/i18n/ru';
import { createInitialState, useProcessStore } from '../src/store/useProcessStore';
import { countStageNodes } from '../src/utils/stageNodes';
import { THREE_LEVEL_PAGE_ALT_ID } from './fixtures/pageMocks';
import { buildSampleProcessMap } from './fixtures/sample-process';
import {
  MODULE_STAGE_IDS,
  MODULE_SUPPLY,
  buildThreeLevelProcessMap,
  type ThreeLevelProcessMap,
} from './fixtures/three-level-process';

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

function supplyOf(map: ThreeLevelProcessMap): Module {
  const module = map.modules.find((candidate) => candidate.id === MODULE_SUPPLY);
  if (module === undefined) {
    throw new Error('В трёхуровневой фикстуре нет модуля SNP');
  }
  return module;
}

const SUPPLY = supplyOf(THREE);

function stageOf(map: { stages: readonly Stage[] }, id: string): Stage {
  const stage = map.stages.find((candidate) => candidate.id === id);
  if (stage === undefined) {
    throw new Error(`В фикстуре нет этапа ${id}`);
  }
  return stage;
}

/** Второй этап модуля SNP — «Этап 2 из 3» при сквозном номере 4. */
const STAGE_4 = stageOf(THREE, 'stage-4');

function counterOf(stage: Stage): string {
  const counts = countStageNodes(stage);
  return ru.breadcrumbs.counter(counts.steps, counts.inputs, counts.outputs);
}

/** Шапка экрана — единственный <header> в отрисованном. */
function headerIn(container: HTMLElement): HTMLElement {
  const header = container.querySelector('header');
  if (header === null) {
    throw new Error('Шапки нет');
  }
  return header;
}

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

async function click(element: HTMLElement) {
  await act(async () => {
    fireEvent.click(element);
  });
}

beforeEach(() => {
  localStorage.clear();
  useProcessStore.setState(createInitialState());
  clearImportedMap();
  resetSelectedVersion();
  refreshProcessMap();
  window.history.replaceState({}, '', '/');
});

afterEach(() => {
  // Размонтировать ДО сброса карты — довод в tests/modulesOverview.test.tsx.
  cleanup();
  clearImportedMap();
  resetSelectedVersion();
  refreshProcessMap();
});

it('страница из фикстур собралась: по умолчанию трёхуровневая карта', () => {
  // Отвались подмена — тесты ниже смотрели бы на snp, где модулей нет.
  expect(loadBaseProcessMap().id).toBe(THREE.id);
});

// ───────────────────────────── крошки как компонент ─────────────────────────────

describe('Breadcrumbs: экран модуля (3 уровня, уровень 2)', () => {
  function renderModuleCrumbs() {
    useProcessStore.getState().navigateToModule(MODULE_SUPPLY);
    return render(
      <Breadcrumbs
        stages={levelTwoView(THREE, MODULE_SUPPLY).stages}
        rootLabel={THREE.moduleLabel}
        module={SUPPLY}
      />,
    );
  }

  it('«{корень документа} › {код · название}», бейдж «Модуль N», счётчик «N этапов»', () => {
    const { container } = renderModuleCrumbs();

    // Текст шапки целиком — порядок звеньев входит в проверку. Корень —
    // map.moduleLabel документа, среднее звено — shortTitle (решение
    // 9mn.31, п. 3), бейдж — module.number, а не позиция модуля в списке.
    expect(headerIn(container).textContent).toBe(
      `${THREE.moduleLabel}›${SUPPLY.shortTitle}` +
        `${ru.breadcrumbs.moduleBadge(SUPPLY.number)}` +
        `${ru.breadcrumbs.stagesCounter(MODULE_STAGE_IDS[MODULE_SUPPLY]?.length ?? -1)}`,
    );
    // «Модуль SNP» — подпись рамки на полотне, не звено крошек.
    expect(screen.queryByText(SUPPLY.label)).toBeNull();
  });

  it('корень — кнопка, модуль — активное звено; «Назад» — «Назад ко всем модулям»', () => {
    renderModuleCrumbs();

    expect(screen.getByRole('button', { name: THREE.moduleLabel })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: SUPPLY.shortTitle })).toBeNull();
    expect(
      screen.getByRole('button', { name: ru.breadcrumbs.backToAllModules }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: ru.breadcrumbs.backAriaLabel })).toBeNull();
  });

  it('клик по корню — на экран модулей', () => {
    renderModuleCrumbs();
    fireEvent.click(screen.getByRole('button', { name: THREE.moduleLabel }));

    expect(useProcessStore.getState()).toMatchObject({
      currentModuleId: null,
      currentStageId: null,
    });
  });

  it('«Назад» — на один уровень вверх, то есть на экран модулей', () => {
    renderModuleCrumbs();
    fireEvent.click(screen.getByRole('button', { name: ru.breadcrumbs.backToAllModules }));

    expect(useProcessStore.getState()).toMatchObject({
      currentModuleId: null,
      currentStageId: null,
    });
  });
});

describe('Breadcrumbs: экран этапа (3 уровня, уровень 3)', () => {
  function renderStageCrumbs(module: Module = SUPPLY, map: ThreeLevelProcessMap = THREE) {
    return render(<Breadcrumbs stages={map.stages} rootLabel={map.moduleLabel} module={module} />);
  }

  it('три звена, бейдж «Этап k из n» — позиция в модуле, а не сквозной номер', () => {
    useProcessStore.getState().navigateToStage(STAGE_4.id, MODULE_SUPPLY);
    const { container } = renderStageCrumbs();

    // stage-4 — второй этап модуля SNP: «Этап 2 из 3», не «Этап 4».
    expect(STAGE_4.number).toBe(4);
    expect(headerIn(container).textContent).toBe(
      `${THREE.moduleLabel}›${SUPPLY.shortTitle}›${STAGE_4.title}` +
        `${ru.breadcrumbs.stageOfModuleBadge(2, 3)}${counterOf(STAGE_4)}`,
    );
    expect(screen.queryByText(ru.breadcrumbs.stageBadge(STAGE_4.number))).toBeNull();
  });

  /*
   * ОБРАТНЫЙ ПОРЯДОК stageIds. Модуль {5, 4, 3} валиден (moduleBlockProblems,
   * 9mn.24), и первой слева на экране модуля стоит карточка этапа 5 — значит,
   * ей «Этап 1 из 3». На прямом порядке k и stage.number − 2 совпадают с
   * точностью до сдвига, и только обратный порядок отличает позицию от номера
   * по существу.
   */
  it.each([
    ['stage-5', 1],
    ['stage-4', 2],
    ['stage-3', 3],
  ])('обратный порядок stageIds: %s — «Этап %i из 3»', (stageId, position) => {
    const reversed = buildThreeLevelProcessMap();
    const module = supplyOf(reversed);
    module.stageIds.reverse();
    useProcessStore.getState().navigateToStage(stageId, MODULE_SUPPLY);
    renderStageCrumbs(module, reversed);

    expect(screen.getByText(ru.breadcrumbs.stageOfModuleBadge(position, 3))).toBeInTheDocument();
  });

  it('корень и модуль — кнопки; «Назад» — «Назад к этапам модуля»', () => {
    useProcessStore.getState().navigateToStage(STAGE_4.id, MODULE_SUPPLY);
    renderStageCrumbs();

    expect(screen.getByRole('button', { name: THREE.moduleLabel })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: SUPPLY.shortTitle })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: ru.breadcrumbs.backToModuleStages }),
    ).toBeInTheDocument();
    // Ни одного <a>: ссылка растила бы историю вики (CrumbLink в Breadcrumbs.tsx).
    expect(document.querySelector('header a')).toBeNull();
  });

  it('клик по корню — на экран модулей', () => {
    useProcessStore.getState().navigateToStage(STAGE_4.id, MODULE_SUPPLY);
    renderStageCrumbs();
    fireEvent.click(screen.getByRole('button', { name: THREE.moduleLabel }));

    expect(useProcessStore.getState()).toMatchObject({
      currentModuleId: null,
      currentStageId: null,
    });
  });

  it('клик по звену модуля — на экран этапов этого модуля', () => {
    useProcessStore.getState().navigateToStage(STAGE_4.id, MODULE_SUPPLY);
    renderStageCrumbs();
    fireEvent.click(screen.getByRole('button', { name: SUPPLY.shortTitle }));

    expect(useProcessStore.getState()).toMatchObject({
      currentModuleId: MODULE_SUPPLY,
      currentStageId: null,
    });
  });

  it('«Назад» — на экран этапов модуля', () => {
    useProcessStore.getState().navigateToStage(STAGE_4.id, MODULE_SUPPLY);
    renderStageCrumbs();
    fireEvent.click(screen.getByRole('button', { name: ru.breadcrumbs.backToModuleStages }));

    expect(useProcessStore.getState()).toMatchObject({
      currentModuleId: MODULE_SUPPLY,
      currentStageId: null,
    });
  });

  /*
   * ЭТАП БЕЗ МОДУЛЯ В STORE (deep-link ?stage=N без ?module=). store владельца
   * не знает, и голый back() увёл бы на корень — подпись «Назад к этапам
   * модуля» стала бы неправдой. Крошки знают владельца из документа.
   */
  it('«Назад» ведёт к этапам модуля-владельца и тогда, когда модуля нет в store', () => {
    useProcessStore.getState().navigateToStage(STAGE_4.id);
    expect(useProcessStore.getState().currentModuleId).toBeNull();
    renderStageCrumbs();
    fireEvent.click(screen.getByRole('button', { name: ru.breadcrumbs.backToModuleStages }));

    expect(useProcessStore.getState()).toMatchObject({
      currentModuleId: MODULE_SUPPLY,
      currentStageId: null,
    });
  });
});

describe('Breadcrumbs: двухуровневая карта — побайтово прежняя форма', () => {
  it('корень — <span>, единственная кнопка — «Назад к обзору процесса»', () => {
    const stage = TWO.stages[1];
    if (stage === undefined) {
      throw new Error('В двухуровневой фикстуре нет второго этапа');
    }
    useProcessStore.getState().navigateToStage(stage.id);
    const { container } = render(<Breadcrumbs stages={TWO.stages} rootLabel={TWO.moduleLabel} />);

    expect(screen.getByText(TWO.moduleLabel).tagName).toBe('SPAN');
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(1);
    expect(buttons[0]).toHaveAccessibleName(ru.breadcrumbs.backAriaLabel);
    expect(buttons[0]).toHaveAttribute('title', ru.breadcrumbs.backAriaLabel);

    // Строение шапки: кнопка, крошки, распорка, счётчик; в крошках — четыре
    // <span> (корень, разделитель, этап, бейдж).
    const header = headerIn(container);
    expect([...header.children].map((child) => child.tagName)).toEqual([
      'BUTTON',
      'DIV',
      'DIV',
      'SPAN',
    ]);
    expect([...(header.children[1]?.children ?? [])].map((child) => child.tagName)).toEqual([
      'SPAN',
      'SPAN',
      'SPAN',
      'SPAN',
    ]);
    expect(header.textContent).toBe(
      `${TWO.moduleLabel}›${stage.title}${ru.breadcrumbs.stageBadge(stage.number)}${counterOf(stage)}`,
    );
  });

  it('на корне двухуровневой карты крошек нет вовсе', () => {
    const { container } = render(<Breadcrumbs stages={TWO.stages} rootLabel={TWO.moduleLabel} />);
    expect(container).toBeEmptyDOMElement();
  });
});

// ───────────────────────────── экран модуля в App ─────────────────────────────

describe('экран модуля в приложении', () => {
  async function openSupply() {
    const result = await renderApp();
    await act(async () => {
      useProcessStore.getState().navigateToModule(MODULE_SUPPLY);
    });
    return result;
  }

  it('полотно уровня 2: только этапы модуля, в порядке stageIds', async () => {
    const { container } = await openSupply();

    expect(screen.getByRole('region', { name: ru.overview.moduleCanvasLabel })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: ru.overview.canvasLabel })).toBeNull();
    expect(
      [...container.querySelectorAll<HTMLElement>('.react-flow__node-stage')].map(
        (node) => node.dataset.id,
      ),
    ).toEqual(MODULE_STAGE_IDS[MODULE_SUPPLY]);
  });

  it('рамка потока подписана «Модуль SNP» (module.label), а не подписью документа', async () => {
    const { container } = await openSupply();
    const frame = container.querySelector(`[data-id="${FLOW_LANE_ID}"]`);

    expect(frame?.textContent).toBe(SUPPLY.label);
  });

  it('системы — только этапов модуля: DP модуля спроса на экране SNP нет', async () => {
    const { container } = await openSupply();
    const has = (id: string) => container.querySelector(`[data-id="${id}"]`) !== null;

    expect(has(systemNodeId('in', 'ERP'))).toBe(true);
    expect(has(systemNodeId('out', 'PS'))).toBe(true);
    expect(has(systemNodeId('in', 'DP'))).toBe(false);
    expect(has(systemNodeId('out', 'DP'))).toBe(false);
    expect(container.querySelectorAll('.react-flow__node-system')).toHaveLength(2);
  });

  it('шапка — крошки, а не шапка корня: ни переключателя версий, ни заголовка карты', async () => {
    const { container } = await openSupply();

    expect(screen.queryByRole('group', { name: ru.overview.versionGroup })).toBeNull();
    expect(screen.queryByRole('heading', { name: THREE.title })).toBeNull();
    expect(headerIn(container).textContent).toBe(
      `${THREE.moduleLabel}›${SUPPLY.shortTitle}` +
        `${ru.breadcrumbs.moduleBadge(SUPPLY.number)}${ru.breadcrumbs.stagesCounter(3)}`,
    );
  });

  it('клик по корню крошек — экран модулей', async () => {
    await openSupply();
    await click(screen.getByRole('button', { name: THREE.moduleLabel }));

    expect(screen.getByRole('region', { name: ru.overview.allModulesCanvasLabel })).toBeVisible();
    expect(useProcessStore.getState().currentModuleId).toBeNull();
  });

  it('«Назад» с экрана модуля — экран модулей', async () => {
    await openSupply();
    await click(screen.getByRole('button', { name: ru.breadcrumbs.backToAllModules }));

    expect(screen.getByRole('region', { name: ru.overview.allModulesCanvasLabel })).toBeVisible();
  });
});

describe('экран этапа трёхуровневой карты в приложении', () => {
  /** Уровень 3 настоящим путём: модуль → клик по карточке этапа. */
  async function openStage4() {
    const result = await renderApp();
    await act(async () => {
      useProcessStore.getState().navigateToModule(MODULE_SUPPLY);
    });
    await click(
      screen.getByRole('button', { name: ru.stageNode.ariaLabel(STAGE_4.number, STAGE_4.title) }),
    );
    return result;
  }

  it('подпись полотна — уровень 3, крошки на три звена с «Этап k из n»', async () => {
    const { container } = await openStage4();

    expect(
      screen.getByRole('region', { name: ru.stageDetail.moduleStageCanvasLabel }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: ru.stageDetail.canvasLabel })).toBeNull();
    expect(headerIn(container).textContent).toBe(
      `${THREE.moduleLabel}›${SUPPLY.shortTitle}›${STAGE_4.title}` +
        `${ru.breadcrumbs.stageOfModuleBadge(2, 3)}${counterOf(STAGE_4)}`,
    );
  });

  it('клик по звену модуля — экран этапов этого модуля', async () => {
    await openStage4();
    await click(screen.getByRole('button', { name: SUPPLY.shortTitle }));

    expect(screen.getByRole('region', { name: ru.overview.moduleCanvasLabel })).toBeInTheDocument();
    expect(useProcessStore.getState()).toMatchObject({
      currentModuleId: MODULE_SUPPLY,
      currentStageId: null,
    });
  });

  it('«Назад» — экран этапов модуля, а не корень', async () => {
    await openStage4();
    await click(screen.getByRole('button', { name: ru.breadcrumbs.backToModuleStages }));

    expect(screen.getByRole('region', { name: ru.overview.moduleCanvasLabel })).toBeInTheDocument();
    expect(useProcessStore.getState().currentModuleId).toBe(MODULE_SUPPLY);
  });

  it('клик по корню — экран модулей', async () => {
    await openStage4();
    await click(screen.getByRole('button', { name: THREE.moduleLabel }));

    expect(screen.getByRole('region', { name: ru.overview.allModulesCanvasLabel })).toBeVisible();
  });
});

describe('двухуровневая версия на той же странице — всё прежнее', () => {
  async function openTwoLevel() {
    const result = await renderApp();
    await click(
      within(screen.getByRole('group', { name: ru.overview.versionGroup })).getByRole('button', {
        name: TWO.title,
      }),
    );
    expect(loadBaseProcessMap().id).toBe(THREE_LEVEL_PAGE_ALT_ID);
    return result;
  }

  it('корень — обзор с шапкой и переключателем версий, подпись полотна «уровень 1»', async () => {
    const { container } = await openTwoLevel();

    expect(screen.getByRole('region', { name: ru.overview.canvasLabel })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: TWO.title })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: ru.overview.versionGroup })).toBeInTheDocument();
    const frame = container.querySelector(`[data-id="${FLOW_LANE_ID}"]`);
    expect(frame?.textContent).toBe(TWO.moduleLabel);
  });

  it('экран этапа: корень крошек — <span>, «Назад к обзору процесса»', async () => {
    await openTwoLevel();
    const stage = TWO.stages[1];
    if (stage === undefined) {
      throw new Error('В двухуровневой фикстуре нет второго этапа');
    }
    await click(
      screen.getByRole('button', { name: ru.stageNode.ariaLabel(stage.number, stage.title) }),
    );

    expect(screen.getByRole('region', { name: ru.stageDetail.canvasLabel })).toBeInTheDocument();
    const root = screen.getByText(TWO.moduleLabel);
    expect(root.tagName).toBe('SPAN');
    expect(screen.getByText(ru.breadcrumbs.stageBadge(stage.number))).toBeInTheDocument();
    await click(screen.getByRole('button', { name: ru.breadcrumbs.backAriaLabel }));
    expect(screen.getByRole('region', { name: ru.overview.canvasLabel })).toBeInTheDocument();
  });
});
