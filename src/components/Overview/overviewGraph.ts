// Сборка узлов и рёбер уровня 1 (SPEC §4.1). Чистая функция без React —
// поэтому полностью покрывается unit-тестами без рендера полотна.
//
// Координаты здесь считаются, а не берутся из данных: поле `position` по схеме
// (src/data/schema.ts) есть только у ProcessNode уровня 2, у Stage и ExternalIO
// его нет, а схема в M1 заморожена. Поэтому геометрия обзора — ВРЕМЕННО
// константы в компоненте; после расширения схемы (отдельная задача bd) их место
// в process.json рядом с координатами уровня 2, а scripts/layout.ts должен
// считать и их.
//
// Значения констант — из макета design/Supply Planning Process Map.dc.html,
// артборд A1 1280×720 (он задаёт расположение явно, поэтому dagre-числа из
// process-map-350 здесь не используются).
import type { Edge as FlowEdge, Node as FlowNode } from '@xyflow/react';
import type { ExternalIO, ProcessMap, SystemCode } from '../../data/schema';
import { ru } from '../../i18n/ru';
import { IO_NODE_SIZE, STAGE_NODE_SIZE, STAGE_NODE_SIZE_COMPACT } from '../../theme/sizes';
import { STAGE_HANDLE, type StageNodeType } from '../nodes/StageNode';
import { SYSTEM_HANDLE, type IntegrationNodeType } from '../nodes/IntegrationNode';
import type { LaneNodeType } from '../nodes/LaneNode';
import type { SystemsBadgeNodeType } from '../nodes/SystemsBadge';

export type OverviewNode =
  | LaneNodeType
  | IntegrationNodeType
  | StageNodeType
  | SystemsBadgeNodeType;

// ───────────────────────────── геометрия макета ─────────────────────────────

/** Ширина/высота карточки этапа — из src/theme/sizes.ts (SPEC §4.1). */
const STAGE_WIDTH = STAGE_NODE_SIZE.width;
/** Зазор между карточками этапов (макет: left 48/352/656/960 → 352 − 48 − 274). */
const STAGE_GAP = 30;
/** Шаг между карточками этапов: 274 + 30 = 304. */
const STAGE_STEP = STAGE_WIDTH + STAGE_GAP;
const STAGE_X0 = 48;
const STAGE_Y = 200;

const LANE_X = 20;
const LANE_IN_Y = 64;
const LANE_IN_HEIGHT = 92;
const LANE_OUT_Y = 474;
const LANE_OUT_HEIGHT = 96;
/** Отступ от правого края последней карточки до края свимлейна (макет: 1260 − 1234). */
const LANE_RIGHT_GAP = 26;
/** Горизонтальный отступ карточек систем внутри свимлейна (макет: 60 − 20). */
const LANE_PADDING_X = 40;

const IO_WIDTH = IO_NODE_SIZE.width;
const IO_HEIGHT = IO_NODE_SIZE.height;
/** Смещение карточки системы от верха свимлейна (макет: 88 − 64 = 498 − 474). */
const IO_OFFSET_Y = 24;

export const LANE_IN_ID = 'lane-in';
export const LANE_OUT_ID = 'lane-out';

// ───────────────── геометрия компактного режима (SPEC §4.5, A4) ─────────────────
//
// Отдельные константы, а не «те же с коэффициентом»: артборд A4 задаёт свою
// раскладку явно (1024×600, шапка 44), и карточка этапа там не просто меньше —
// у неё другой шаг по горизонтали и другой порядок блоков по вертикали.

/** Карточка этапа в компактном режиме — src/theme/sizes.ts (SPEC §4.5). */
const STAGE_WIDTH_COMPACT = STAGE_NODE_SIZE_COMPACT.width;
const STAGE_HEIGHT_COMPACT = STAGE_NODE_SIZE_COMPACT.height;
/** Зазор между карточками (макет A4: left 20/272/524/776 → 272 − 20 − 228). */
const STAGE_GAP_COMPACT = 24;
const STAGE_STEP_COMPACT = STAGE_WIDTH_COMPACT + STAGE_GAP_COMPACT;
const STAGE_X0_COMPACT = 20;
const STAGE_Y_COMPACT = 96;

/** Строка-бейдж вместо свимлейнов (макет A4: left 20, top 16). */
const SYSTEMS_BADGE_X = STAGE_X0_COMPACT;
const SYSTEMS_BADGE_Y = 16;
export const SYSTEMS_BADGE_ID = 'systems-badge';

/** Карточка систем под этапом (макет A4: top 316 = 96 + 200 + 20). */
const IO_COMPACT_GAP_Y = 20;
const IO_COMPACT_Y = STAGE_Y_COMPACT + STAGE_HEIGHT_COMPACT + IO_COMPACT_GAP_Y;
/**
 * Ширина карточки систем в компактном режиме равна ширине карточки этапа —
 * они стоят строго друг под другом (макет A4). Высота остаётся прежней,
 * IO_NODE_SIZE (в макете A4 она 44 против 40 — на 4 px больше; своего числа
 * ради этого не заводим, см. src/theme/sizes.ts).
 */
const IO_SIZE_COMPACT = { width: STAGE_WIDTH_COMPACT, height: IO_NODE_SIZE.height };

/** id карточки систем этапа в компактном режиме. */
export function stageSystemsNodeId(stageId: string): string {
  return `io-compact-${stageId}`;
}

/** id свёрнутого интеграционного ребра «этап → его системы». */
export function stageSystemsEdgeId(stageId: string): string {
  return `ov-compact-${stageId}`;
}

/**
 * Точечная сетка полотна — SPEC §4.1 задаёт gap=16 явно.
 * Размер точки в макете задан градиентом `radial-gradient(#dfdfe0 1px, ...)`,
 * то есть РАДИУСОМ 1px = диаметр 2px, а `size` у <Background> React Flow —
 * это диаметр (r = size / 2). При size=1 точка выходила вдвое мельче макета и
 * на #dfdfe0 почти пропадала (process-map-30v).
 */
export const GRID_GAP = 16;
export const GRID_DOT_SIZE = 2;
/** Отступ fitView, чтобы свимлейны не упирались в края полотна. */
export const FIT_VIEW_PADDING = 0.06;
export const MIN_ZOOM = 0.3;
export const MAX_ZOOM = 2;

/**
 * React Flow ставит обёртке узла `pointer-events: none`, когда выключены все
 * флаги интерактивности (isSelectable || isDraggable || onClick || onMouseEnter
 * || onMouseMove || onMouseLeave). У нас выключены все — узлы не перетаскиваются
 * и не выделяются (CLAUDE.md, v1), — из-за чего до карточки этапа не доходил ни
 * клик (SPEC §4.1 «Клик по StageNode → navigate»), ни hover, ни title-подсказка.
 *
 * `node.style` разворачивается ПОСЛЕ вычисленного pointerEvents
 * (@xyflow/react/dist/esm/index.js: NodeWrapper), поэтому это корректный способ
 * вернуть события мыши, не включая перетаскивание и выделение.
 */
const INTERACTIVE_NODE_STYLE = { pointerEvents: 'all' } as const;

/** id узла внешней системы. Направление в id обязательно: одна и та же система
 *  может быть и входом, и выходом (DP, PS, ERP в текущих данных). */
export function systemNodeId(direction: 'in' | 'out', system: SystemCode): string {
  return `io-${direction}-${system}`;
}

// ───────────────────────────── вспомогательное ─────────────────────────────

/**
 * Схлопывает ExternalIO всех этапов в одну карточку на систему.
 * У одного этапа может быть несколько записей с одной системой (в текущих
 * данных у этапа 2 дважды IO) — в карточке показываем первую подпись,
 * полный список уходит в title.
 */
function collectSystems(ios: ExternalIO[]): { system: SystemCode; label: string; full: string }[] {
  const order: SystemCode[] = [];
  const labels = new Map<SystemCode, string[]>();

  for (const io of ios) {
    const existing = labels.get(io.system);
    if (existing === undefined) {
      order.push(io.system);
      labels.set(io.system, [io.label]);
    } else if (!existing.includes(io.label)) {
      existing.push(io.label);
    }
  }

  return order.map((system) => {
    const list = labels.get(system) ?? [];
    return { system, label: list[0] ?? system, full: list.join(' · ') };
  });
}

/**
 * Равномерно раскладывает n карточек по ширине свимлейна.
 * При n = 4 и laneWidth = 1240 даёт 40/360/680/1000 (абсолютные 60/380/700/1020) —
 * ровно как в макете.
 */
function spreadX(count: number, laneWidth: number): number[] {
  const usable = laneWidth - LANE_PADDING_X * 2;
  if (count <= 0) {
    return [];
  }
  if (count === 1) {
    return [Math.round((laneWidth - IO_WIDTH) / 2)];
  }
  const step = (usable - IO_WIDTH) / (count - 1);
  return Array.from({ length: count }, (_, index) => Math.round(LANE_PADDING_X + index * step));
}

// ───────────────────────────── сборка графа ─────────────────────────────

export interface OverviewGraph {
  nodes: OverviewNode[];
  edges: FlowEdge[];
}

/** Компактные узлы вместо свимлейнов: строка-бейдж + карточка систем этапа. */
function pushCompactSystems(map: ProcessMap, nodes: OverviewNode[]): Set<string> {
  // Порядок кодов — порядок появления в данных (collectSystems), а не
  // алфавит и не список из SPEC §4.5: состав систем задаёт process.json.
  const all = collectSystems(map.stages.flatMap((stage) => [...stage.inputs, ...stage.outputs]));
  if (all.length === 0) {
    return new Set();
  }

  nodes.push({
    id: SYSTEMS_BADGE_ID,
    type: 'systemsBadge',
    position: { x: SYSTEMS_BADGE_X, y: SYSTEMS_BADGE_Y },
    data: { systems: all.map((item) => item.system) },
    // Ширина не задаётся: строка меряется по содержимому (число систем берётся
    // из данных). React Flow измеряет такой узел сам — см. SystemsBadge.tsx.
    draggable: false,
    selectable: false,
    connectable: false,
    focusable: false,
  });

  // Карточка систем под каждым этапом (макет A4). Свёрнутый вид сводит вход и
  // выход этапа в одну карточку, поэтому направления у неё нет: пунктир идёт
  // от этапа вниз к его системам — так же, как в артборде A4.
  const withSystems = new Set<string>();
  map.stages.forEach((stage, index) => {
    const items = collectSystems([...stage.inputs, ...stage.outputs]);
    if (items.length === 0) {
      return;
    }
    withSystems.add(stage.id);
    const first = items[0] as { system: SystemCode; label: string; full: string };
    nodes.push({
      id: stageSystemsNodeId(stage.id),
      type: 'system',
      position: { x: STAGE_X0_COMPACT + index * STAGE_STEP_COMPACT, y: IO_COMPACT_Y },
      data: {
        system: first.system,
        codes: items.map((item) => item.system),
        label: first.label,
        fullLabel: items.map((item) => `${item.system}: ${item.full}`).join(' · '),
        direction: 'out',
        compact: true,
      },
      width: IO_SIZE_COMPACT.width,
      height: IO_SIZE_COMPACT.height,
      style: INTERACTIVE_NODE_STYLE,
      draggable: false,
      selectable: false,
      connectable: false,
      focusable: false,
    });
  });

  return withSystems;
}

/**
 * @param map      слитая карта из loadProcessMap()
 * @param showIntegrations toggle из store (SPEC §4.6): false убирает свимлейны,
 *                         узлы систем и интеграционные рёбра.
 * @param compact  SPEC §4.5: высота контейнера < config.compactHeight. Свимлейны
 *                 заменяются строкой-бейджем, карточки этапов — компактными
 *                 (228×200), интеграции сворачиваются в одну карточку систем на
 *                 этап. Значение по умолчанию сохраняет прежнее поведение для
 *                 всех существующих вызовов.
 */
export function buildOverviewGraph(
  map: ProcessMap,
  showIntegrations: boolean,
  compact = false,
): OverviewGraph {
  const stageSize = compact ? STAGE_NODE_SIZE_COMPACT : STAGE_NODE_SIZE;
  const stageX0 = compact ? STAGE_X0_COMPACT : STAGE_X0;
  const stageY = compact ? STAGE_Y_COMPACT : STAGE_Y;
  const stageStep = compact ? STAGE_STEP_COMPACT : STAGE_STEP;

  const stageCount = map.stages.length;
  const contentRight = stageCount > 0 ? STAGE_X0 + (stageCount - 1) * STAGE_STEP + STAGE_WIDTH : 0;
  const laneWidth = Math.max(contentRight + LANE_RIGHT_GAP - LANE_X, IO_WIDTH + LANE_PADDING_X * 2);

  const nodes: OverviewNode[] = [];
  /** Этапы, у которых в компактном режиме есть карточка систем. */
  let compactSystemStages: Set<string> = new Set();

  if (showIntegrations && compact) {
    compactSystemStages = pushCompactSystems(map, nodes);
  }

  if (showIntegrations && !compact) {
    const inputs = collectSystems(map.stages.flatMap((stage) => stage.inputs));
    const outputs = collectSystems(map.stages.flatMap((stage) => stage.outputs));

    const lanes = [
      {
        id: LANE_IN_ID,
        title: ru.overview.laneIn,
        y: LANE_IN_Y,
        height: LANE_IN_HEIGHT,
        items: inputs,
        direction: 'in' as const,
      },
      {
        id: LANE_OUT_ID,
        title: ru.overview.laneOut,
        y: LANE_OUT_Y,
        height: LANE_OUT_HEIGHT,
        items: outputs,
        direction: 'out' as const,
      },
    ];

    for (const lane of lanes) {
      if (lane.items.length === 0) {
        continue;
      }
      // Родительский узел обязан идти в массиве раньше своих детей.
      nodes.push({
        id: lane.id,
        type: 'lane',
        position: { x: LANE_X, y: lane.y },
        data: { title: lane.title },
        style: { width: laneWidth, height: lane.height },
        draggable: false,
        selectable: false,
        connectable: false,
        focusable: false,
      });

      const xs = spreadX(lane.items.length, laneWidth);
      lane.items.forEach((item, index) => {
        nodes.push({
          id: systemNodeId(lane.direction, item.system),
          type: 'system',
          // Координаты ребёнка group-узла — относительно родителя.
          position: { x: xs[index] ?? LANE_PADDING_X, y: IO_OFFSET_Y },
          parentId: lane.id,
          extent: 'parent',
          data: {
            system: item.system,
            label: item.label,
            fullLabel: item.full,
            direction: lane.direction,
          },
          width: IO_WIDTH,
          height: IO_HEIGHT,
          // Подписи систем в данных длиннее макетных и обрезаются, полный текст
          // лежит в title — без pointer-events подсказка недостижима мышью.
          style: INTERACTIVE_NODE_STYLE,
          draggable: false,
          selectable: false,
          connectable: false,
          focusable: false,
        });
      });
    }
  }

  map.stages.forEach((stage, index) => {
    nodes.push({
      id: stage.id,
      type: 'stage',
      position: { x: stageX0 + index * stageStep, y: stageY },
      data: { stage, compact },
      width: stageSize.width,
      height: stageSize.height,
      style: INTERACTIVE_NODE_STYLE,
      draggable: false,
      selectable: false,
      connectable: false,
      // Фокус несёт сам <button> внутри карточки, дублировать его обёрткой
      // React Flow не нужно — иначе до карточки два Tab вместо одного.
      focusable: false,
    });
  });

  const nodeIds = new Set(nodes.map((node) => node.id));
  const stageIds = new Set(map.stages.map((stage) => stage.id));
  const edges: FlowEdge[] = [];

  for (const edge of map.overviewEdges) {
    if (edge.kind === 'process') {
      if (!stageIds.has(edge.source) || !stageIds.has(edge.target)) {
        continue;
      }
      edges.push({
        id: edge.id,
        type: 'process',
        source: edge.source,
        target: edge.target,
        sourceHandle: STAGE_HANDLE.right,
        targetHandle: STAGE_HANDLE.left,
        ...(edge.label === undefined ? {} : { label: edge.label }),
      });
      continue;
    }

    if (!showIntegrations || compact) {
      // В компактном режиме отдельных узлов систем нет — интеграции этапа
      // сведены в одну карточку под ним, и рёбра к ней строятся ниже, по
      // одному на этап. Иначе четыре ребра к одной карточке легли бы друг на
      // друга и превратились в одну линию с четырьмя стрелками.
      continue;
    }

    // Один конец интеграционного ребра — код системы, а не id узла (SPEC §3):
    // источник-система живёт во входном свимлейне, приёмник-система — в выходном.
    const sourceId = stageIds.has(edge.source)
      ? edge.source
      : systemNodeId('in', edge.source as SystemCode);
    const targetId = stageIds.has(edge.target)
      ? edge.target
      : systemNodeId('out', edge.target as SystemCode);
    if (!nodeIds.has(sourceId) || !nodeIds.has(targetId)) {
      continue;
    }

    edges.push({
      id: edge.id,
      type: 'integration',
      source: sourceId,
      target: targetId,
      sourceHandle: stageIds.has(edge.source) ? STAGE_HANDLE.bottom : SYSTEM_HANDLE.bottom,
      targetHandle: stageIds.has(edge.target) ? STAGE_HANDLE.top : SYSTEM_HANDLE.top,
      ...(edge.label === undefined ? {} : { label: edge.label }),
    });
  }

  // Свёрнутые интеграции компактного режима: ровно одно пунктирное ребро
  // «этап → его карточка систем» (макет A4). Направление здесь не про поток
  // данных — карточка объединяет и вход, и выход этапа, — а про принадлежность:
  // вот системы ЭТОГО этапа.
  for (const stage of map.stages) {
    if (!compactSystemStages.has(stage.id)) {
      continue;
    }
    edges.push({
      id: stageSystemsEdgeId(stage.id),
      type: 'integration',
      source: stage.id,
      target: stageSystemsNodeId(stage.id),
      sourceHandle: STAGE_HANDLE.bottom,
      targetHandle: SYSTEM_HANDLE.top,
    });
  }

  return { nodes, edges };
}

/** Служебное: типы узлов, зарегистрированные в ReactFlow (см. Overview.tsx). */
export type OverviewFlowNode = FlowNode;
