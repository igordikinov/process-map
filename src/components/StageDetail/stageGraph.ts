// Сборка узлов и рёбер уровня 2 (SPEC §4.2). Чистая функция без React —
// поэтому полностью покрывается unit-тестами без рендера полотна
// (по образцу Overview/overviewGraph.ts).
//
// Координаты узлов здесь НЕ считаются: `position` у ProcessNode обязателен по
// схеме и уже посчитан scripts/layout.ts (dagre). Функция только
//   · переводит абсолютные координаты в координаты относительно контейнера,
//   · строит сами контейнеры (группы и колонки),
//   · выбирает хэндлы рёбер.
import type { Edge as FlowEdge } from '@xyflow/react';
import type { ProcessNode, Stage } from '../../data/schema';
import { ru } from '../../i18n/ru';
import { DATA_NODE_SIZE, STEP_NODE_SIZE, type NodeSize } from '../../theme/sizes';
import { splitStageDataNodes } from '../../utils/stageNodes';
import type { DataNodeType } from '../nodes/DataNode';
import type { GroupNodeType } from '../nodes/GroupNode';
import { STEP_HANDLE, type StepCardVariant, type StepNodeType } from '../nodes/StepNode';
import type { WarningNodeType } from '../nodes/WarningNode';

export type StageDetailNode = GroupNodeType | StepNodeType | WarningNodeType | DataNodeType;

// ───────────────────────────── геометрия ─────────────────────────────

/**
 * React Flow ставит обёртке узла `pointer-events: none`, когда выключены все
 * флаги интерактивности (isSelectable || isDraggable || onClick || ...).
 * У нас выключены все — узлы не перетаскиваются и не выделяются (CLAUDE.md,
 * v1), — из-за чего до карточки не доходил бы ни клик, ни hover, ни title.
 * `node.style` разворачивается ПОСЛЕ вычисленного pointerEvents
 * (@xyflow/react: NodeWrapper), поэтому это корректный способ вернуть события
 * мыши, не включая перетаскивание. Регрессия из M1 — см. tests/App.test.ts.
 */
const INTERACTIVE_NODE_STYLE = { pointerEvents: 'all' } as const;

/**
 * Паддинги dashed-контейнера группы.
 *
 * По макету A2 они 16 / 48 / 28 (лево-право / верх / низ). Верх+низ = 76, но
 * scripts/layout.ts оставляет между соседними по вертикали группами ровно
 * 64 px (dagre nodesep 32 + половины карточек), и на этапах 2 и 3 рамки при
 * макетных паддингах накладываются друг на друга на 12 px. Поэтому по
 * вертикали 40 + 20 = 60 ≤ 64: заголовок (11px/14px) помещается, рамки не
 * пересекаются. Сторож — tests/stageGraph.test.ts, проверка непересечения
 * контейнеров на реальных данных всех этапов.
 */
export const GROUP_PADDING = { x: 16, top: 40, bottom: 20 } as const;

/** Высота заголовка колонки над её первой карточкой (макет A2: 108 − 84). */
export const COLUMN_TITLE_HEIGHT = 24;

/** Точечная сетка полотна — та же, что на уровне 1 (SPEC §4.1). */
export const GRID_GAP = 16;
export const GRID_DOT_SIZE = 1;
/**
 * Границы РУЧНОГО зума (колесо, тулбар M3). Нижняя граница меньше, чем на
 * уровне 1 (там 0.3): раскладки этапов до 3942 px шириной, и пользователь
 * вправе отдалить их целиком, чтобы увидеть форму процесса. К СТАРТОВОМУ виду
 * это отношения не имеет — см. START_ZOOM_MIN.
 */
export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 2;

// ──────────────────── стартовый вид (задача process-map-l8a) ────────────────────
//
// Раньше экран открывался через fitView. На реальных данных это давало масштаб
// 0.31…0.53, то есть подпись шага 13px рисовалась в 4.1…6.9 px — нечитаемо;
// вдобавок fitView центрирует раскладку, и этап 1 (3528×296) открывался тонкой
// полоской посреди пустого поля, а не с начала потока.
//
// Теперь стартовый вид считается сам: масштаб — читаемый, привязка — левый
// верхний угол раскладки.

/** Кегль подписи шага в макете A2 (токен --pm-font-size-13). */
const STEP_LABEL_FONT_PX = 13;

/**
 * Нижняя граница читаемого кегля — 12 px, самый мелкий кегль ОСНОВНОГО текста в
 * дизайн-системе In.Plan (--scp-font-body-s / --scp-font-sizes-12). Меньше 12
 * в шкале есть только «эйбры» (--pm-font-size-10-5/11), и то для капса
 * заголовков, а не для читаемых подписей.
 */
const MIN_READABLE_FONT_PX = 12;

/**
 * Минимальный стартовый масштаб = 12/13 ≈ 0.923: подпись шага не мельче 12 px
 * ни на одном этапе и ни при какой высоте контейнера (в том числе в компактном
 * режиме SPEC §4.5, где полотно 1024×548).
 *
 * Порог выведен из шкалы кеглей, а не подобран на глаз: любое другое число
 * пришлось бы обосновывать отдельно.
 */
export const START_ZOOM_MIN = MIN_READABLE_FONT_PX / STEP_LABEL_FONT_PX;

/**
 * Стартовый масштаб не увеличивается выше 1: карточки не должны быть КРУПНЕЕ
 * макета A2, даже если раскладка целиком влезает в полотно.
 */
export const START_ZOOM_MAX = 1;

/** Отступ раскладки от краёв полотна в стартовом виде, px экрана. */
export const START_PADDING = 24;

export interface Viewport {
  x: number;
  y: number;
  zoom: number;
}

export interface ContainerSize {
  width: number;
  height: number;
}

/**
 * Стартовый вьюпорт полотна.
 *
 * Масштаб: сколько влезает целиком, но не мельче START_ZOOM_MIN и не крупнее
 * START_ZOOM_MAX.
 *
 * Смещение — гибрид, по осям по-разному:
 *   · X — ВСЕГДА привязка к левому краю раскладки. По горизонтали ни один этап
 *     в полотно не влезает (2152…3942 px при читаемом масштабе), и начало
 *     потока важнее его центра: пользователь должен увидеть первый шаг, а не
 *     середину.
 *   · Y — центрирование, когда раскладка влезает по высоте целиком, иначе
 *     привязка к верху. Этап 1 — полоса 296 px при 668 доступных: прижатая к
 *     верху полоса с пустотой в 372 px снизу читается как поломка вёрстки.
 *
 * Координаты левого верхнего угла раскладки бывают отрицательными (рамка группы
 * уходит выше и левее карточек, заголовок колонки — выше), поэтому смещение
 * считается от bounds.x/bounds.y, а не от нуля.
 */
export function initialViewport(bounds: Box, container: ContainerSize): Viewport {
  // Полотно ещё не измерено (первый кадр, jsdom) — считать нечего, отдаём
  // читаемый масштаб без сдвига.
  if (container.width <= 0 || container.height <= 0 || bounds.width <= 0 || bounds.height <= 0) {
    return { x: START_PADDING, y: START_PADDING, zoom: START_ZOOM_MAX };
  }

  const fit = Math.min(
    (container.width - START_PADDING * 2) / bounds.width,
    (container.height - START_PADDING * 2) / bounds.height,
  );
  const zoom = Math.min(START_ZOOM_MAX, Math.max(START_ZOOM_MIN, fit));

  const scaledHeight = bounds.height * zoom;
  const fitsVertically = scaledHeight <= container.height - START_PADDING * 2;
  const topOffset = fitsVertically ? (container.height - scaledHeight) / 2 : START_PADDING;

  return {
    x: START_PADDING - bounds.x * zoom,
    y: topOffset - bounds.y * zoom,
    zoom,
  };
}

/** id контейнера группы — с префиксом, чтобы не столкнуться с id узлов. */
export function groupContainerId(groupId: string): string {
  return `group:${groupId}`;
}

/** id контейнера колонки данных. */
export const COLUMN_IN_ID = 'column:in';
export const COLUMN_OUT_ID = 'column:out';

function sizeOf(node: ProcessNode): NodeSize {
  return node.type === 'data' ? DATA_NODE_SIZE : STEP_NODE_SIZE;
}

/** Прямоугольник в координатах раскладки (не экрана). */
export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

function boundingBox(nodes: readonly ProcessNode[]): Box {
  const x0 = Math.min(...nodes.map((node) => node.position.x));
  const y0 = Math.min(...nodes.map((node) => node.position.y));
  const x1 = Math.max(...nodes.map((node) => node.position.x + sizeOf(node).width));
  const y1 = Math.max(...nodes.map((node) => node.position.y + sizeOf(node).height));
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

// ───────────────────────────── сборка ─────────────────────────────

export interface StageGraph {
  nodes: StageDetailNode[];
  edges: FlowEdge[];
  /**
   * Габарит всей раскладки в координатах графа, включая dashed-рамки групп и
   * заголовки колонок (они уходят выше и левее самих карточек, поэтому
   * bounds.x/y бывают отрицательными). Нужен для стартового вьюпорта —
   * см. initialViewport.
   */
  bounds: Box;
}

/** Тип узла React Flow по ProcessNode.type. `integration` рисуется карточкой шага. */
function flowNodeOf(node: ProcessNode, parentId: string | undefined, origin: Box | undefined) {
  const size = sizeOf(node);
  const position =
    origin === undefined
      ? { ...node.position }
      : { x: node.position.x - origin.x, y: node.position.y - origin.y };

  const common = {
    id: node.id,
    position,
    width: size.width,
    height: size.height,
    style: INTERACTIVE_NODE_STYLE,
    draggable: false,
    selectable: false,
    connectable: false,
    // Фокус несёт <button> внутри карточки: иначе до первого узла десятки Tab.
    focusable: false,
    ...(parentId === undefined ? {} : { parentId, extent: 'parent' as const }),
  };

  if (node.type === 'data') {
    return { ...common, type: 'data' as const, data: { node } } satisfies DataNodeType;
  }
  if (node.type === 'warning') {
    return { ...common, type: 'warning' as const, data: { node } } satisfies WarningNodeType;
  }
  const variant: StepCardVariant = node.type === 'integration' ? 'integration' : 'step';
  return { ...common, type: 'step' as const, data: { node, variant } } satisfies StepNodeType;
}

function containerNode(
  id: string,
  box: Box,
  title: string,
  kind: 'group' | 'column',
): GroupNodeType {
  return {
    id,
    type: 'groupBox',
    position: { x: box.x, y: box.y },
    data: { title, kind },
    style: { width: box.width, height: box.height },
    draggable: false,
    selectable: false,
    connectable: false,
    focusable: false,
  };
}

/**
 * Узлы и рёбра одного этапа.
 *
 * Порядок массива значим: React Flow требует, чтобы родительский узел шёл
 * раньше своих детей.
 */
export function buildStageGraph(stage: Stage): StageGraph {
  const containers: GroupNodeType[] = [];
  const children: StageDetailNode[] = [];
  const loose: StageDetailNode[] = [];

  // ── группы шагов ──
  const byGroup = new Map<string, ProcessNode[]>();
  for (const node of stage.nodes) {
    if (node.type === 'data' || node.group === undefined) {
      continue;
    }
    const bucket = byGroup.get(node.group);
    if (bucket === undefined) {
      byGroup.set(node.group, [node]);
    } else {
      bucket.push(node);
    }
  }

  const groupOrigin = new Map<string, Box>();
  for (const group of stage.groups) {
    const members = byGroup.get(group.id);
    // Группа без узлов контейнера не получает: пустая dashed-рамка на полотне
    // не значит ничего.
    if (members === undefined || members.length === 0) {
      continue;
    }
    const bbox = boundingBox(members);
    const box: Box = {
      x: bbox.x - GROUP_PADDING.x,
      y: bbox.y - GROUP_PADDING.top,
      width: bbox.width + GROUP_PADDING.x * 2,
      height: bbox.height + GROUP_PADDING.top + GROUP_PADDING.bottom,
    };
    groupOrigin.set(group.id, box);
    containers.push(containerNode(groupContainerId(group.id), box, group.label, 'group'));
  }

  // ── колонки входов и выходов ──
  // splitStageDataNodes — ЕДИНСТВЕННЫЙ источник правила (src/utils/stageNodes.ts):
  // его же используют scripts/layout.ts и счётчик в Breadcrumbs, поэтому
  // колонки на экране не могут разойтись с числами в шапке.
  const split = splitStageDataNodes(stage);
  const columnOrigin = new Map<'in' | 'out', Box>();
  const columns: { direction: 'in' | 'out'; id: string; title: string; nodes: ProcessNode[] }[] = [
    { direction: 'in', id: COLUMN_IN_ID, title: ru.stageDetail.inputsColumn, nodes: split.inputs },
    {
      direction: 'out',
      id: COLUMN_OUT_ID,
      title: ru.stageDetail.outputsColumn,
      nodes: split.outputs,
    },
  ];

  for (const column of columns) {
    if (column.nodes.length === 0) {
      continue;
    }
    const bbox = boundingBox(column.nodes);
    const box: Box = {
      x: bbox.x,
      y: bbox.y - COLUMN_TITLE_HEIGHT,
      width: bbox.width,
      height: bbox.height + COLUMN_TITLE_HEIGHT,
    };
    columnOrigin.set(column.direction, box);
    containers.push(containerNode(column.id, box, column.title, 'column'));
  }

  const inputIds = new Set(split.inputs.map((node) => node.id));

  // ── сами узлы ──
  for (const node of stage.nodes) {
    if (node.type === 'data') {
      const direction = inputIds.has(node.id) ? 'in' : 'out';
      const origin = columnOrigin.get(direction);
      const parentId =
        origin === undefined ? undefined : direction === 'in' ? COLUMN_IN_ID : COLUMN_OUT_ID;
      children.push(flowNodeOf(node, parentId, origin));
      continue;
    }
    const origin = node.group === undefined ? undefined : groupOrigin.get(node.group);
    if (origin === undefined) {
      loose.push(flowNodeOf(node, undefined, undefined));
    } else {
      children.push(flowNodeOf(node, groupContainerId(node.group ?? ''), origin));
    }
  }

  // ── рёбра ──
  const nodeById = new Map(stage.nodes.map((node) => [node.id, node]));
  const edges: FlowEdge[] = [];
  for (const edge of stage.edges) {
    const source = nodeById.get(edge.source);
    const target = nodeById.get(edge.target);
    if (source === undefined || target === undefined) {
      continue;
    }
    // Раскладка идёт слева направо, поэтому основная пара хэндлов right → left.
    // Обратное ребро (target левее source) пускаем снизу вверх, иначе smoothstep
    // рисует петлю поверх карточек. В текущих данных такое ребро одно (этап 2).
    const forward = target.position.x >= source.position.x;
    edges.push({
      id: edge.id,
      type: edge.kind === 'integration' ? 'integration' : 'process',
      source: edge.source,
      target: edge.target,
      sourceHandle: forward ? STEP_HANDLE.right : STEP_HANDLE.bottom,
      targetHandle: forward ? STEP_HANDLE.left : STEP_HANDLE.top,
      ...(edge.label === undefined ? {} : { label: edge.label }),
    });
  }

  // ── габарит раскладки ──
  // Считается по УЖЕ построенным прямоугольникам: узлы + контейнеры. Контейнеры
  // обязательны — dashed-рамка группы уходит на GROUP_PADDING левее и выше
  // своих карточек, а заголовок колонки на COLUMN_TITLE_HEIGHT выше, и без них
  // стартовый вид срезал бы рамку у края полотна.
  const rects: Box[] = [
    ...stage.nodes.map((node) => ({
      x: node.position.x,
      y: node.position.y,
      ...sizeOf(node),
    })),
    ...[...groupOrigin.values(), ...columnOrigin.values()],
  ];
  const bounds: Box =
    rects.length === 0
      ? { x: 0, y: 0, width: 0, height: 0 }
      : (() => {
          const x0 = Math.min(...rects.map((rect) => rect.x));
          const y0 = Math.min(...rects.map((rect) => rect.y));
          const x1 = Math.max(...rects.map((rect) => rect.x + rect.width));
          const y1 = Math.max(...rects.map((rect) => rect.y + rect.height));
          return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
        })();

  return { nodes: [...containers, ...children, ...loose], edges, bounds };
}
