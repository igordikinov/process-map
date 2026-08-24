// Тесты сборки графа уровня 2 (SPEC §4.2, задача process-map-1ts).
// Проверки идут по РЕАЛЬНЫМ данным всех четырёх этапов: этапы устроены
// по-разному (12/30/39/22 узла, 2/2/5/1 группы), и синтетическая фикстура
// не поймала бы ни накладку контейнеров, ни обратное ребро.
import { describe, expect, it } from 'vitest';
import {
  buildStageGraph,
  COLUMN_IN_ID,
  COLUMN_OUT_ID,
  COLUMN_TITLE_HEIGHT,
  groupContainerId,
  GROUP_PADDING,
} from '../src/components/StageDetail';
import { loadBaseProcessMap } from '../src/data/loader';
import type { ProcessNode, Stage } from '../src/data/schema';
import { ru } from '../src/i18n/ru';
import { DATA_NODE_SIZE, STEP_NODE_SIZE } from '../src/theme/sizes';
import { countStageNodes, splitStageDataNodes } from '../src/utils/stageNodes';

const map = loadBaseProcessMap();

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

function sizeOf(node: ProcessNode): { width: number; height: number } {
  return node.type === 'data' ? DATA_NODE_SIZE : STEP_NODE_SIZE;
}

/** Абсолютный прямоугольник узла графа с учётом родителя-контейнера. */
function absoluteRects(stage: Stage): Map<string, Rect> {
  const { nodes } = buildStageGraph(stage);
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const rects = new Map<string, Rect>();

  for (const node of nodes) {
    let x = node.position.x;
    let y = node.position.y;
    const parentId = 'parentId' in node ? node.parentId : undefined;
    if (parentId !== undefined) {
      const parent = byId.get(parentId);
      expect(parent, `родитель ${parentId} не найден`).toBeDefined();
      x += parent?.position.x ?? 0;
      y += parent?.position.y ?? 0;
    }
    const styleWidth = typeof node.style?.width === 'number' ? node.style.width : undefined;
    const styleHeight = typeof node.style?.height === 'number' ? node.style.height : undefined;
    rects.set(node.id, {
      x,
      y,
      width: node.width ?? styleWidth ?? 0,
      height: node.height ?? styleHeight ?? 0,
    });
  }
  return rects;
}

function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

describe('buildStageGraph', () => {
  it.each(map.stages.map((stage) => [stage.number, stage] as const))(
    'этап %i: каждый узел данных попадает в граф ровно один раз и сохраняет координаты',
    (_number, stage) => {
      const { nodes } = buildStageGraph(stage);
      const rects = absoluteRects(stage);

      for (const node of stage.nodes) {
        const rect = rects.get(node.id);
        expect(rect, `узла ${node.id} нет в графе`).toBeDefined();
        // Позиция ребёнка контейнера хранится относительно родителя — сумма
        // обязана давать ровно то, что посчитал scripts/layout.ts.
        expect(rect?.x).toBe(node.position.x);
        expect(rect?.y).toBe(node.position.y);
        expect(rect?.width).toBe(sizeOf(node).width);
        expect(rect?.height).toBe(sizeOf(node).height);
      }

      const ids = nodes.map((node) => node.id);
      expect(new Set(ids).size).toBe(ids.length);
    },
  );

  it.each(map.stages.map((stage) => [stage.number, stage] as const))(
    'этап %i: тип узла React Flow соответствует ProcessNode.type',
    (_number, stage) => {
      const { nodes } = buildStageGraph(stage);
      const byId = new Map(nodes.map((node) => [node.id, node]));

      for (const node of stage.nodes) {
        const flowNode = byId.get(node.id);
        // integration рисуется карточкой шага (variant), собственного типа
        // узла у него нет — см. комментарий в stageGraph.ts.
        const expected =
          node.type === 'data' ? 'data' : node.type === 'warning' ? 'warning' : 'step';
        expect(flowNode?.type).toBe(expected);
        if (node.type === 'integration') {
          expect(flowNode?.data).toMatchObject({ variant: 'integration' });
        }
      }
    },
  );

  it.each(map.stages.map((stage) => [stage.number, stage] as const))(
    'этап %i: контейнеры групп идут раньше своих детей и содержат их целиком',
    (_number, stage) => {
      const { nodes } = buildStageGraph(stage);
      const index = new Map(nodes.map((node, position) => [node.id, position]));
      const rects = absoluteRects(stage);

      const usedGroups = new Set(
        stage.nodes
          .filter((node) => node.type !== 'data')
          .map((node) => node.group)
          .filter((group): group is string => group !== undefined),
      );

      for (const group of stage.groups) {
        const containerId = groupContainerId(group.id);
        if (!usedGroups.has(group.id)) {
          expect(index.has(containerId)).toBe(false);
          continue;
        }
        expect(index.has(containerId)).toBe(true);
        const container = rects.get(containerId);
        expect(container).toBeDefined();

        for (const node of stage.nodes.filter((candidate) => candidate.group === group.id)) {
          expect(index.get(containerId)).toBeLessThan(index.get(node.id) ?? -1);
          const rect = rects.get(node.id);
          expect(rect).toBeDefined();
          expect(rect?.x).toBeGreaterThanOrEqual(container?.x ?? 0);
          expect(rect?.y).toBeGreaterThanOrEqual(container?.y ?? 0);
          expect((rect?.x ?? 0) + (rect?.width ?? 0)).toBeLessThanOrEqual(
            (container?.x ?? 0) + (container?.width ?? 0),
          );
          expect((rect?.y ?? 0) + (rect?.height ?? 0)).toBeLessThanOrEqual(
            (container?.y ?? 0) + (container?.height ?? 0),
          );
        }
      }
    },
  );

  // Сторож паддинга GROUP_PADDING: макетные 48/28 давали накладку рамок на
  // 12 px, потому что scripts/layout.ts оставляет между группами 64 px.
  it.each(map.stages.map((stage) => [stage.number, stage] as const))(
    'этап %i: dashed-контейнеры не накладываются друг на друга и на узлы вне групп',
    (_number, stage) => {
      const rects = absoluteRects(stage);
      const containerIds = stage.groups
        .map((group) => groupContainerId(group.id))
        .filter((id) => rects.has(id));

      for (let i = 0; i < containerIds.length; i += 1) {
        for (let j = i + 1; j < containerIds.length; j += 1) {
          const a = rects.get(containerIds[i] ?? '');
          const b = rects.get(containerIds[j] ?? '');
          expect(a).toBeDefined();
          expect(b).toBeDefined();
          expect(
            a !== undefined && b !== undefined && overlaps(a, b),
            `${containerIds[i]} накладывается на ${containerIds[j]}`,
          ).toBe(false);
        }
      }

      const outsiders = stage.nodes.filter(
        (node) => node.type !== 'data' && node.group === undefined,
      );
      for (const node of outsiders) {
        const rect = rects.get(node.id);
        for (const containerId of containerIds) {
          const container = rects.get(containerId);
          expect(
            rect !== undefined && container !== undefined && overlaps(rect, container),
            `узел ${node.id} вне групп попал внутрь ${containerId}`,
          ).toBe(false);
        }
      }

      expect(GROUP_PADDING.top + GROUP_PADDING.bottom).toBeLessThanOrEqual(64);
    },
  );

  it.each(map.stages.map((stage) => [stage.number, stage] as const))(
    'этап %i: колонки входов/выходов совпадают со splitStageDataNodes и счётчиком крошек',
    (_number, stage) => {
      const { nodes } = buildStageGraph(stage);
      const split = splitStageDataNodes(stage);
      const counts = countStageNodes(stage);

      const childrenOf = (parentId: string): string[] =>
        nodes
          .filter((node) => ('parentId' in node ? node.parentId : undefined) === parentId)
          .map((node) => node.id);

      expect(childrenOf(COLUMN_IN_ID).sort()).toEqual(split.inputs.map((n) => n.id).sort());
      expect(childrenOf(COLUMN_OUT_ID).sort()).toEqual(split.outputs.map((n) => n.id).sort());
      expect(childrenOf(COLUMN_IN_ID)).toHaveLength(counts.inputs);
      expect(childrenOf(COLUMN_OUT_ID)).toHaveLength(counts.outputs);

      const byId = new Map(nodes.map((node) => [node.id, node]));
      // Пустая колонка контейнера не получает (у этапов 1, 2 и 4 нет выходов).
      expect(byId.has(COLUMN_IN_ID)).toBe(split.inputs.length > 0);
      expect(byId.has(COLUMN_OUT_ID)).toBe(split.outputs.length > 0);

      if (split.inputs.length > 0) {
        expect(byId.get(COLUMN_IN_ID)?.data).toMatchObject({
          title: ru.stageDetail.inputsColumn,
          kind: 'column',
        });
        // Заголовок колонки живёт над её первой карточкой.
        const rects = absoluteRects(stage);
        const container = rects.get(COLUMN_IN_ID);
        const firstY = Math.min(...split.inputs.map((node) => node.position.y));
        expect(container?.y).toBe(firstY - COLUMN_TITLE_HEIGHT);
      }
    },
  );

  it.each(map.stages.map((stage) => [stage.number, stage] as const))(
    'этап %i: рёбра переносятся целиком, оба конца существуют',
    (_number, stage) => {
      const { nodes, edges } = buildStageGraph(stage);
      const ids = new Set(nodes.map((node) => node.id));

      expect(edges).toHaveLength(stage.edges.length);
      for (const edge of edges) {
        expect(ids.has(edge.source)).toBe(true);
        expect(ids.has(edge.target)).toBe(true);
        expect(['process', 'integration']).toContain(edge.type);
      }
    },
  );

  it('обратное ребро (target левее source) идёт снизу вверх, прямое — справа налево', () => {
    const stage = map.stages.find((candidate) => candidate.number === 2);
    expect(stage).toBeDefined();
    if (stage === undefined) {
      return;
    }
    const byId = new Map(stage.nodes.map((node) => [node.id, node]));
    const { edges } = buildStageGraph(stage);

    let backward = 0;
    for (const edge of edges) {
      const source = byId.get(edge.source);
      const target = byId.get(edge.target);
      if (source === undefined || target === undefined) {
        continue;
      }
      if (target.position.x >= source.position.x) {
        expect(edge.sourceHandle).toBe('right');
        expect(edge.targetHandle).toBe('left');
      } else {
        backward += 1;
        expect(edge.sourceHandle).toBe('bottom');
        expect(edge.targetHandle).toBe('top');
      }
    }
    // В данных этапа 2 такое ребро ровно одно — если их станет больше,
    // стоит вернуться к выбору хэндлов.
    expect(backward).toBe(1);
  });

  // Осознанное состояние данных, а не баг: в презентации у группы
  // «Публикация планов» связей нет (задача process-map-7bz).
  it('этап 3: узлы группы publikaciya-planov без рёбер всё равно попадают на полотно', () => {
    const stage = map.stages.find((candidate) => candidate.number === 3);
    expect(stage).toBeDefined();
    if (stage === undefined) {
      return;
    }
    const { nodes, edges } = buildStageGraph(stage);
    const ids = new Set(nodes.map((node) => node.id));
    const endpoints = new Set(edges.flatMap((edge) => [edge.source, edge.target]));

    const orphans = stage.nodes.filter(
      (node) => node.group === 'publikaciya-planov' && !endpoints.has(node.id),
    );
    expect(orphans.length).toBeGreaterThan(0);
    for (const node of orphans) {
      expect(ids.has(node.id)).toBe(true);
    }
    expect(ids.has(groupContainerId('publikaciya-planov'))).toBe(true);
  });

  it.each(map.stages.map((stage) => [stage.number, stage] as const))(
    'этап %i: узлы принимают события мыши, контейнеры — нет',
    (_number, stage) => {
      const { nodes } = buildStageGraph(stage);
      const dataIds = new Set(stage.nodes.map((node) => node.id));

      for (const node of nodes) {
        if (dataIds.has(node.id)) {
          // Регрессия M1: без pointerEvents карточка не кликается в браузере.
          expect(node.style?.pointerEvents).toBe('all');
        } else {
          expect(node.style?.pointerEvents).toBeUndefined();
        }
        expect(node.draggable).toBe(false);
        expect(node.connectable).toBe(false);
        expect(node.focusable).toBe(false);
      }
    },
  );
});
