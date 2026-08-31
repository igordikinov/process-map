// Тесты обзора уровня 1 (SPEC §4.1).
//
// Стратегия рендера: React Flow в jsdom требует ResizeObserver, DOMMatrix и
// ненулевого getBoundingClientRect. Поэтому основные проверки идут по чистым
// компонентам (OverviewHeader, StageCard) и по чистой функции сборки графа
// buildOverviewGraph — это покрывает больше, чем осмотр DOM полотна, и не
// зависит от версии jsdom. Факт монтирования полотна проверяется одним
// smoke-тестом с минимальными моками окружения.
import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { OverviewHeader } from '../src/components/Overview/OverviewHeader';
import {
  buildOverviewGraph,
  FLOW_LANE_ID,
  LANE_OUT_ID,
  systemNodeId,
} from '../src/components/Overview/overviewGraph';
import { StageCard } from '../src/components/nodes/StageNode/StageCard';
import { loadBaseProcessMap } from '../src/data/loader';
import { formatIsoDate } from '../src/utils/format';
import type { Stage } from '../src/data/schema';
import { ru } from '../src/i18n/ru';
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

describe('OverviewHeader', () => {
  it('рендерит заголовок, бейдж с числом этапов и дату обновления', () => {
    render(
      <OverviewHeader
        title={map.title}
        stagesCount={map.stages.length}
        updatedAt={map.updatedAt}
      />,
    );

    expect(screen.getByRole('heading', { name: map.title })).toBeInTheDocument();
    expect(screen.getByText('4 этапа')).toBeInTheDocument();
    // Значение из данных, а не литерал: раньше здесь стояло «Обновлено
    // 24.08.2026», и тест ломался бы при любом обновлении карты. Само
    // форматирование сторожит tests/format.test.ts — без него эта правка была
    // бы потерей покрытия: formatIsoDate больше ничем не закреплён.
    expect(
      screen.getByText(ru.overview.updatedAt(formatIsoDate(map.updatedAt))),
    ).toBeInTheDocument();
  });

  // App больше не рендерит <h1>{ru.appTitle}</h1> (его место занял заголовок из
  // данных), поэтому ключ проверяется здесь напрямую: он остаётся именем
  // приложения в <title> и понадобится Breadcrumbs в M2.
  it('сохраняет ключ appTitle', () => {
    expect(ru.appTitle).toBe('In.Plan Process Map');
  });

  it('склоняет «этап» по числу', () => {
    expect(ru.overview.stagesBadge(1)).toBe('1 этап');
    expect(ru.overview.stagesBadge(4)).toBe('4 этапа');
    expect(ru.overview.stagesBadge(11)).toBe('11 этапов');
  });
});

describe('StageCard', () => {
  it('рендерит все 4 карточки этапов с номерами и названиями', () => {
    render(
      <>
        {map.stages.map((stage) => (
          <StageCard key={stage.id} stage={stage} />
        ))}
      </>,
    );

    const cards = screen.getAllByRole('button');
    expect(cards).toHaveLength(4);

    map.stages.forEach((stage, index) => {
      const card = cards[index];
      expect(card).toBeDefined();
      expect(within(card as HTMLElement).getByText(String(stage.number))).toBeInTheDocument();
      // В карточке короткое название (process-map-vjz.1); полное остаётся в
      // подсказке и в aria-label — они проверяются отдельным тестом ниже.
      expect(within(card as HTMLElement).getByText(stage.shortTitle)).toBeInTheDocument();
    });
  });

  it('карточка показывает короткое название, а полное отдаёт в подсказку и aria-label', () => {
    // Этап 3 — тот, у которого поля различаются: title «Анализ и корректировка
    // результатов /Сценарное планирование», shortTitle «Анализ и корректировка
    // результатов». На этапах 1 и 2 оба поля совпадают, и тест был бы пустым.
    const stage = stageAt(2);
    expect(stage.shortTitle, 'нужен этап, где короткое название отличается').not.toBe(stage.title);

    render(<StageCard stage={stage} />);

    const title = screen.getByText(stage.shortTitle);
    expect(title).toHaveAttribute('title', stage.title);
    expect(screen.queryByText(stage.title)).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: ru.stageNode.ariaLabel(stage.number, stage.title) }),
    ).toBeInTheDocument();
  });

  it('показывает блок «Ключевые выходы» со всеми строками этапа', () => {
    const stage = stageAt(1);
    render(<StageCard stage={stage} />);

    expect(screen.getByText(ru.stageNode.keyOutputs)).toBeInTheDocument();
    expect(stage.keyOutputs.length).toBeGreaterThan(0);
    for (const output of stage.keyOutputs) {
      expect(screen.getByText(output)).toBeInTheDocument();
    }
    expect(screen.getAllByRole('listitem')).toHaveLength(stage.keyOutputs.length);
  });

  it('не показывает строку «Открыть в In.Plan», если у этапа нет screen', () => {
    const stage = stageAt(0);
    expect(stage.screen).toBeUndefined();

    render(<StageCard stage={stage} />);
    expect(screen.queryByText(ru.stageNode.openInInplan)).not.toBeInTheDocument();
  });

  it('показывает строку «Открыть в In.Plan», если screen задан', () => {
    const stage: Stage = {
      ...stageAt(0),
      screen: { title: 'Планирование поставок › Объёмный план', url: 'https://example.com/plan' },
    };

    render(<StageCard stage={stage} />);
    expect(screen.getByText(ru.stageNode.openInInplan)).toBeInTheDocument();
  });

  it('показывает счётчик предупреждений вместо подписи «Этап»', () => {
    const stage = stageAt(2);
    expect(stage.warningsCount).toBe(5);

    render(<StageCard stage={stage} />);
    expect(screen.getByText('5 предупреждений')).toBeInTheDocument();
    expect(screen.queryByText(ru.stageNode.caption)).not.toBeInTheDocument();
  });

  it('клик по карточке вызывает navigateToStage', () => {
    const stage = stageAt(1);
    render(<StageCard stage={stage} />);

    expect(useProcessStore.getState().currentStageId).toBeNull();
    fireEvent.click(screen.getByRole('button'));
    expect(useProcessStore.getState().currentStageId).toBe(stage.id);
  });

  it('активная карточка помечается aria-current и подписью «Выбранный этап»', () => {
    const stage = stageAt(0);
    useProcessStore.getState().navigateToStage(stage.id);

    render(<StageCard stage={stage} />);
    expect(screen.getByRole('button')).toHaveAttribute('aria-current', 'step');
    expect(screen.getByText(ru.stageNode.captionActive)).toBeInTheDocument();
  });
});

describe('buildOverviewGraph', () => {
  it('строит свимлейны, узлы систем и 4 карточки этапов', () => {
    const { nodes } = buildOverviewGraph(map, true);

    expect(nodes.filter((node) => node.type === 'lane')).toHaveLength(2);
    expect(nodes.filter((node) => node.type === 'stage')).toHaveLength(4);

    // Уникальные системы: вход DP/IO/PS/ERP, выход DP/PS/MRP/ERP.
    expect(nodes.filter((node) => node.type === 'system')).toHaveLength(8);
    expect(nodes.some((node) => node.id === systemNodeId('in', 'DP'))).toBe(true);
    expect(nodes.some((node) => node.id === systemNodeId('out', 'MRP'))).toBe(true);

    // Родитель обязан идти раньше своих детей.
    const laneIndex = nodes.findIndex((node) => node.id === 'lane-in');
    const childIndex = nodes.findIndex((node) => node.id === systemNodeId('in', 'DP'));
    expect(laneIndex).toBeLessThan(childIndex);
  });

  it('ни один узел не перетаскивается и не соединяется', () => {
    const { nodes } = buildOverviewGraph(map, true);
    for (const node of nodes) {
      expect(node.draggable).toBe(false);
      expect(node.connectable).toBe(false);
    }
  });

  it('переводит overviewEdges в process- и integration-рёбра с валидными концами', () => {
    const { nodes, edges } = buildOverviewGraph(map, true);
    const ids = new Set(nodes.map((node) => node.id));

    expect(edges.filter((edge) => edge.type === 'process')).toHaveLength(3);
    // Шесть рёбер прочитаны с линий слайда 2, седьмое объявлено владельцем:
    // ERP → этап 1 (process-map-vjz.5). Линии для него на слайде нет — её
    // отсутствие и есть причина, по которой автоматика систему не нашла.
    expect(edges.filter((edge) => edge.type === 'integration')).toHaveLength(7);
    for (const edge of edges) {
      expect(ids.has(edge.source)).toBe(true);
      expect(ids.has(edge.target)).toBe(true);
    }
  });

  it('при выключенных интеграциях остаются этапы, рамка потока и процессные рёбра', () => {
    const { nodes, edges } = buildOverviewGraph(map, false);

    // Рамка потока (process-map-sni) не зависит от тумблера «Показать
    // интеграции»: она описывает сам процесс, а не интеграции. Свимлейнов и
    // узлов систем при этом не остаётся.
    expect(nodes).toHaveLength(5);
    expect(nodes.filter((node) => node.type === 'stage')).toHaveLength(4);
    expect(nodes.filter((node) => node.type === 'flowLane')).toHaveLength(1);
    expect(nodes.filter((node) => node.type === 'lane')).toHaveLength(0);
    expect(nodes.filter((node) => node.type === 'system')).toHaveLength(0);
    expect(edges).toHaveLength(3);
    expect(edges.every((edge) => edge.type === 'process')).toBe(true);
  });

  it('рамка потока лежит в массиве раньше карточек этапов и охватывает их', () => {
    const { nodes } = buildOverviewGraph(map, true);

    const frameIndex = nodes.findIndex((node) => node.id === FLOW_LANE_ID);
    const firstStageIndex = nodes.findIndex((node) => node.type === 'stage');
    expect(frameIndex).toBeGreaterThanOrEqual(0);
    // React Flow рисует узлы в порядке массива: рамка обязана быть ПОД
    // карточками, иначе её полупрозрачный фон ляжет поверх них.
    expect(frameIndex).toBeLessThan(firstStageIndex);

    const frame = nodes[frameIndex];
    const style = frame?.style as { width: number; height: number } | undefined;
    expect(style).toBeDefined();

    const top = frame?.position.y ?? 0;
    const bottom = top + (style?.height ?? 0);
    const left = frame?.position.x ?? 0;
    const right = left + (style?.width ?? 0);

    // Каждая карточка этапа целиком внутри рамки.
    const stages = nodes.filter((node) => node.type === 'stage');
    expect(stages).toHaveLength(4);
    for (const stage of stages) {
      expect(stage.position.x).toBeGreaterThanOrEqual(left);
      expect(stage.position.x + (stage.width ?? 0)).toBeLessThanOrEqual(right);
      expect(stage.position.y).toBeGreaterThan(top);
      expect(stage.position.y + (stage.height ?? 0)).toBeLessThan(bottom);
    }

    // И рамка не налезает на свимлейны: вход кончается на 156, выход с 474.
    const laneOut = nodes.find((node) => node.id === LANE_OUT_ID);
    expect(bottom).toBeLessThan(laneOut?.position.y ?? 0);
  });

  it('в компактном режиме рамки потока нет (SPEC §4.5)', () => {
    const { nodes } = buildOverviewGraph(map, true, true);

    expect(nodes.filter((node) => node.type === 'flowLane')).toHaveLength(0);
    expect(nodes.some((node) => node.id === FLOW_LANE_ID)).toBe(false);
  });

  it('рамка потока подписана строкой из ru.ts', () => {
    const { nodes } = buildOverviewGraph(map, true);
    const frame = nodes.find((node) => node.id === FLOW_LANE_ID);

    expect(frame?.data).toEqual({ title: ru.overview.laneFlow });
  });

  it('карточки этапов не накладываются друг на друга', () => {
    const stages = buildOverviewGraph(map, true).nodes.filter((node) => node.type === 'stage');
    for (let index = 1; index < stages.length; index += 1) {
      const previous = stages[index - 1];
      const current = stages[index];
      expect(previous).toBeDefined();
      expect(current).toBeDefined();
      const gap = (current?.position.x ?? 0) - ((previous?.position.x ?? 0) + 274);
      expect(gap).toBeGreaterThan(0);
    }
  });
});
