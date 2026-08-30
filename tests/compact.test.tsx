// Компактный режим — SPEC §4.5, артборд A4 (задача process-map-5l3).
//
// Что здесь проверяется и почему именно так:
//   · правило порога — чистой функцией isCompactHeight, без рендера;
//   · сам механизм (ResizeObserver + getBoundingClientRect контейнера) —
//     отдельным тестом хука, с УПРАВЛЯЕМЫМ ResizeObserver и подменой размера
//     на КОНКРЕТНОМ элементе. Глобальный мок геометрии из tests/setup.ts
//     намеренно сужен до `.react-flow` (иначе порог 640 был бы непроверяем:
//     любой элемент отдавал бы 668) — расширять его обратно нельзя, поэтому
//     размер задаётся точечно и умирает вместе с размонтированным узлом;
//   · раскладка компактного обзора — чистой функцией buildOverviewGraph;
//   · состав карточек и легенды — рендером самих компонентов.
// Геометрия в браузере (высота шапки, размеры карточек, попадание шагов в
// кадр) проверяется в e2e/compact.spec.ts: jsdom не считает layout.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { Breadcrumbs } from '../src/components/Breadcrumbs';
import { Legend } from '../src/components/Legend';
import { OverviewHeader } from '../src/components/Overview/OverviewHeader';
import {
  buildOverviewGraph,
  FLOW_LANE_ID,
  LANE_IN_ID,
  LANE_OUT_ID,
  stageSystemsEdgeId,
  stageSystemsNodeId,
  SYSTEMS_BADGE_ID,
} from '../src/components/Overview/overviewGraph';
import { StageCard } from '../src/components/nodes/StageNode/StageCard';
import { config } from '../src/config';
import { loadBaseProcessMap } from '../src/data/loader';
import type { Stage } from '../src/data/schema';
import { isCompactHeight, useFrameSize } from '../src/hooks/useFrameSize';
import { ru } from '../src/i18n/ru';
import { STAGE_NODE_SIZE, STAGE_NODE_SIZE_COMPACT } from '../src/theme/sizes';
import { createInitialState, useProcessStore } from '../src/store/useProcessStore';

const map = loadBaseProcessMap();

function stageAt(index: number): Stage {
  const stage = map.stages[index];
  if (stage === undefined) {
    throw new Error(`В process.json нет этапа с индексом ${index}`);
  }
  return stage;
}

beforeEach(() => {
  useProcessStore.setState(createInitialState());
});

// ───────────────────────────── порог ─────────────────────────────

describe('isCompactHeight (SPEC §4.5)', () => {
  it('порог — ровно config.compactHeight, граница не включена', () => {
    expect(config.compactHeight).toBe(640);
    expect(isCompactHeight(config.compactHeight - 1)).toBe(true);
    expect(isCompactHeight(config.compactHeight)).toBe(false);
    expect(isCompactHeight(config.compactHeight + 1)).toBe(false);
  });

  it('высота артборда A4 (600) компактная, высота A1 (720) — нет', () => {
    expect(isCompactHeight(600)).toBe(true);
    expect(isCompactHeight(720)).toBe(false);
  });

  it('неизмеренный контейнер (0) НЕ считается низким фреймом', () => {
    // Иначе приложение стартовало бы компактным на любом экране и
    // перерисовывалось бы после первого колбэка ResizeObserver.
    expect(isCompactHeight(0)).toBe(false);
    expect(isCompactHeight(-1)).toBe(false);
  });
});

// ───────────────────────── механизм измерения ─────────────────────────

/** ResizeObserver, чей колбэк дёргает тест, а не движок вёрстки. */
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

  /**
   * Сообщить наблюдателю, что размер изменился.
   *
   * Молчит, если наблюдать не за чем: иначе тест «600 → компактный режим»
   * проходил бы и на хуке, который вообще не вызывает observe() — колбэк-то
   * всё равно дёрнули бы вручную. Проверено мутацией: без этой строки
   * удаление observe() из useFrameSize ловит только соседний тест.
   */
  emit(): void {
    if (this.targets.size === 0) {
      return;
    }
    this.callback(
      [...this.targets].map(
        (target) =>
          ({ target, contentRect: target.getBoundingClientRect() }) as ResizeObserverEntry,
      ),
      this,
    );
  }
}

/**
 * Подменяет размер ОДНОГО элемента. Не прототип: подмена живёт на самом узле и
 * исчезает вместе с ним при размонтировании — расширять глобальный мок из
 * tests/setup.ts запрещено, см. комментарий в его шапке.
 */
function setElementHeight(element: HTMLElement, width: number, height: number): void {
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

function FrameProbe() {
  const { ref, height, compact } = useFrameSize();
  return (
    <div
      ref={ref}
      data-testid="frame"
      data-height={String(height)}
      data-compact={String(compact)}
    />
  );
}

describe('useFrameSize: триггер — высота контейнера, а не окна', () => {
  const originalResizeObserver = globalThis.ResizeObserver;

  beforeEach(() => {
    ControllableResizeObserver.instances = [];
    globalThis.ResizeObserver = ControllableResizeObserver as unknown as typeof ResizeObserver;
  });

  afterEach(() => {
    globalThis.ResizeObserver = originalResizeObserver;
  });

  it('наблюдает именно тот узел, на который повешен ref', () => {
    render(<FrameProbe />);
    const frame = screen.getByTestId('frame');

    const observed = ControllableResizeObserver.instances.flatMap((instance) => [
      ...instance.targets,
    ]);
    expect(observed).toContain(frame);
  });

  it('высота контейнера 600 включает компактный режим, 720 — выключает', () => {
    render(<FrameProbe />);
    const frame = screen.getByTestId('frame');

    // jsdom не считает layout: без подмены высота нулевая — и это НЕ компактный
    // режим (иначе тест проходил бы, ничего не измерив).
    expect(frame.dataset.height).toBe('0');
    expect(frame.dataset.compact).toBe('false');

    setElementHeight(frame, 1024, 600);
    act(() => {
      for (const instance of ControllableResizeObserver.instances) {
        instance.emit();
      }
    });
    expect(frame.dataset.height).toBe('600');
    expect(frame.dataset.compact).toBe('true');

    setElementHeight(frame, 1280, 720);
    act(() => {
      for (const instance of ControllableResizeObserver.instances) {
        instance.emit();
      }
    });
    expect(frame.dataset.height).toBe('720');
    expect(frame.dataset.compact).toBe('false');
  });

  it('окно ни при чём: window.innerHeight большое, а контейнер низкий', () => {
    // Приложение живёт в iframe (SPEC §6): высоту врезки задаёт хост.
    expect(window.innerHeight).toBeGreaterThanOrEqual(config.compactHeight);

    render(<FrameProbe />);
    const frame = screen.getByTestId('frame');
    setElementHeight(frame, 1024, 480);
    act(() => {
      for (const instance of ControllableResizeObserver.instances) {
        instance.emit();
      }
    });

    expect(frame.dataset.compact).toBe('true');
  });
});

// ───────────────────── раскладка компактного обзора ─────────────────────

describe('buildOverviewGraph: компактный режим (SPEC §4.5)', () => {
  it('свимлейнов нет, вместо них одна строка-бейдж', () => {
    const { nodes } = buildOverviewGraph(map, true, true);

    expect(nodes.filter((node) => node.type === 'lane')).toHaveLength(0);
    expect(nodes.some((node) => node.id === LANE_IN_ID)).toBe(false);
    expect(nodes.some((node) => node.id === LANE_OUT_ID)).toBe(false);
    // Рамка вокруг потока этапов (process-map-sni) в компактном режиме тоже не
    // рисуется: 200 px высоты карточки и так впритык, лишняя вертикаль на
    // отступы и заголовок рамки взяться неоткуда.
    expect(nodes.filter((node) => node.type === 'flowLane')).toHaveLength(0);
    expect(nodes.some((node) => node.id === FLOW_LANE_ID)).toBe(false);

    const badges = nodes.filter((node) => node.type === 'systemsBadge');
    expect(badges).toHaveLength(1);
    expect(badges[0]?.id).toBe(SYSTEMS_BADGE_ID);
  });

  it('строка-бейдж перечисляет все системы из данных, без повторов', () => {
    const badge = buildOverviewGraph(map, true, true).nodes.find(
      (node) => node.type === 'systemsBadge',
    );
    expect(badge).toBeDefined();
    const systems = (badge?.data as { systems: string[] }).systems;

    const expected = [
      ...new Set(
        map.stages.flatMap((stage) => [...stage.inputs, ...stage.outputs]).map((io) => io.system),
      ),
    ];
    expect(systems).toEqual(expected);
    expect(new Set(systems).size).toBe(systems.length);
  });

  it('карточки этапов 228×200 вместо 274×210', () => {
    const compact = buildOverviewGraph(map, true, true).nodes.filter(
      (node) => node.type === 'stage',
    );
    expect(compact).toHaveLength(4);
    for (const node of compact) {
      expect({ width: node.width, height: node.height }).toEqual(STAGE_NODE_SIZE_COMPACT);
      expect(node.data.compact).toBe(true);
    }

    // Обычный режим не задет.
    const full = buildOverviewGraph(map, true).nodes.filter((node) => node.type === 'stage');
    for (const node of full) {
      expect({ width: node.width, height: node.height }).toEqual(STAGE_NODE_SIZE);
    }
  });

  it('интеграции сведены в одну карточку и одно ребро на этап', () => {
    const { nodes, edges } = buildOverviewGraph(map, true, true);

    for (const stage of map.stages) {
      const card = nodes.find((node) => node.id === stageSystemsNodeId(stage.id));
      expect(card, `Этап ${stage.number} без карточки систем`).toBeDefined();

      const own = [...stage.inputs, ...stage.outputs].map((io) => io.system);
      const codes = (card?.data as { codes: string[] }).codes;
      expect(codes).toEqual([...new Set(own)]);

      expect(edges.filter((edge) => edge.id === stageSystemsEdgeId(stage.id))).toHaveLength(1);
    }

    expect(edges.filter((edge) => edge.type === 'integration')).toHaveLength(map.stages.length);
    // Процессные рёбра этап→этап компактный режим не трогает.
    expect(edges.filter((edge) => edge.type === 'process')).toHaveLength(3);
  });

  it('карточки этапов не накладываются и стоят над своими карточками систем', () => {
    const { nodes } = buildOverviewGraph(map, true, true);
    const stages = nodes.filter((node) => node.type === 'stage');

    for (let index = 1; index < stages.length; index += 1) {
      const previous = stages[index - 1];
      const current = stages[index];
      const gap =
        (current?.position.x ?? 0) - ((previous?.position.x ?? 0) + STAGE_NODE_SIZE_COMPACT.width);
      expect(gap).toBeGreaterThan(0);
    }

    for (const stage of stages) {
      const card = nodes.find((node) => node.id === stageSystemsNodeId(stage.id));
      expect(card?.position.x).toBe(stage.position.x);
      expect(card?.position.y ?? 0).toBeGreaterThan(
        stage.position.y + STAGE_NODE_SIZE_COMPACT.height,
      );
    }
  });

  it('выключенный toggle убирает и строку-бейдж, и карточки систем', () => {
    const { nodes, edges } = buildOverviewGraph(map, false, true);

    expect(nodes).toHaveLength(4);
    expect(nodes.every((node) => node.type === 'stage')).toBe(true);
    expect(edges.every((edge) => edge.type === 'process')).toBe(true);
  });

  it('у каждого ребра оба конца существуют', () => {
    const { nodes, edges } = buildOverviewGraph(map, true, true);
    const ids = new Set(nodes.map((node) => node.id));
    for (const edge of edges) {
      expect(ids.has(edge.source), `нет источника ${edge.source}`).toBe(true);
      expect(ids.has(edge.target), `нет приёмника ${edge.target}`).toBe(true);
    }
  });
});

// ───────────────────────── содержимое карточек ─────────────────────────

describe('StageCard: компактный режим', () => {
  it('показывает ДВА ключевых выхода, сколько бы их ни было в данных', () => {
    const stage = stageAt(1);
    // Лимит схемы подняли до четырёх (process-map-24i), поэтому число здесь не
    // прибито: важно, что компактная карточка показывает ровно два, а остальные
    // не отрисованы вовсе.
    expect(stage.keyOutputs.length).toBeGreaterThan(2);

    render(<StageCard stage={stage} compact />);
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    for (const hidden of stage.keyOutputs.slice(2)) {
      expect(screen.queryByText(hidden)).not.toBeInTheDocument();
    }
  });

  it('лишние выходы не «спрятаны стилями», а не отрисованы', () => {
    // Скрытый классом пункт остался бы в дереве доступности.
    const stage = stageAt(1);
    const { container } = render(<StageCard stage={stage} compact />);
    for (const hidden of stage.keyOutputs.slice(2)) {
      expect(container.textContent).not.toContain(hidden);
    }
  });

  it('без «эйбра» и подписи «Этап» (артборд A4)', () => {
    render(<StageCard stage={stageAt(0)} compact />);
    expect(screen.queryByText(ru.stageNode.keyOutputs)).not.toBeInTheDocument();
    expect(screen.queryByText(ru.stageNode.caption)).not.toBeInTheDocument();
  });

  it('счётчик предупреждений остаётся доступен подписью иконки', () => {
    const stage = stageAt(2);
    expect(stage.warningsCount).toBe(5);

    render(<StageCard stage={stage} compact />);
    // Текстом на экране числа нет — но оно есть у иконки, а значит и у
    // скринридера.
    expect(screen.getByAltText(ru.stageNode.warnings(5))).toBeInTheDocument();
  });

  it('обычный режим не задет: все выходы и «эйбр» на месте', () => {
    const stage = stageAt(1);
    render(<StageCard stage={stage} />);
    expect(screen.getAllByRole('listitem')).toHaveLength(stage.keyOutputs.length);
    expect(screen.getByText(ru.stageNode.keyOutputs)).toBeInTheDocument();
  });
});

describe('OverviewHeader: компактный режим', () => {
  it('дата обновления снимается (артборд A4), заголовок и бейдж остаются', () => {
    render(<OverviewHeader title={map.title} stagesCount={4} updatedAt={map.updatedAt} compact />);

    expect(screen.getByRole('heading', { name: map.title })).toBeInTheDocument();
    expect(screen.getByText('4 этапа')).toBeInTheDocument();
    expect(screen.queryByText(/^Обновлено /)).not.toBeInTheDocument();
  });
});

describe('Breadcrumbs: компактный режим', () => {
  it('крошки, бейдж и счётчик остаются — сжимается только высота', () => {
    const stage = stageAt(1);
    useProcessStore.getState().navigateToStage(stage.id);
    render(<Breadcrumbs stages={map.stages} compact />);

    expect(screen.getByText(ru.breadcrumbs.root)).toBeInTheDocument();
    expect(screen.getByText(stage.title)).toBeInTheDocument();
    expect(screen.getByText(ru.breadcrumbs.stageBadge(stage.number))).toBeInTheDocument();
    expect(screen.getByRole('button', { name: ru.breadcrumbs.backAriaLabel })).toBeInTheDocument();
  });
});

// ───────────────────────────── легенда ─────────────────────────────

describe('Legend: компактный режим сворачивает панель в кнопку-иконку', () => {
  it('по умолчанию виден только переключатель, пунктов нет', () => {
    render(<Legend compact />);

    const toggle = screen.getByRole('button', { name: ru.legend.expand });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText(ru.legend.process)).not.toBeInTheDocument();
  });

  it('клик раскрывает список и меняет подпись кнопки', () => {
    render(<Legend compact />);

    fireEvent.click(screen.getByRole('button', { name: ru.legend.expand }));

    expect(screen.getByText(ru.legend.process)).toBeInTheDocument();
    const toggle = screen.getByRole('button', { name: ru.legend.collapse });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');

    fireEvent.click(toggle);
    expect(screen.queryByText(ru.legend.process)).not.toBeInTheDocument();
  });

  it('состав пунктов тот же, что в обычном режиме (уровень 2)', () => {
    useProcessStore.getState().navigateToStage(stageAt(0).id);
    render(<Legend compact />);
    fireEvent.click(screen.getByRole('button', { name: ru.legend.expand }));

    expect(screen.getByText(ru.legend.step)).toBeInTheDocument();
    expect(screen.getByText(ru.legend.data)).toBeInTheDocument();
    expect(screen.getByText(ru.legend.warning)).toBeInTheDocument();
  });

  it('обычный режим по-прежнему без интерактивных элементов', () => {
    const { container } = render(<Legend />);
    expect(container.querySelectorAll('button, a, [tabindex]')).toHaveLength(0);
  });
});
