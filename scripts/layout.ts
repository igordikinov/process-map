// scripts/layout.ts
// Пересчитывает стартовые координаты узлов src/data/process.json через @dagrejs/dagre.
//
// Запуск (из корня репозитория):
//
//     npm run layout       # только раскладка
//     npm run data         # весь конвейер: import-pptx.py → layout.ts
//
// ЭТО ВТОРАЯ ПОЛОВИНА КОНВЕЙЕРА. Первая — scripts/import-pptx.py: она кладёт в
// `position` сырую геометрию слайда, на которой карточки накладываются. Порядок
// «импорт → раскладка» обязателен, поэтому обе половины склеены в `npm run data`.
//
// ЧЕМ СИДИРУЕТСЯ РАСКЛАДКА (задача process-map-cxn). Исходный порядок узлов и
// деление data-узлов на колонки входов/выходов берутся из `node.slidePosition` —
// геометрии слайда, которую пишет импортёр и которую этот скрипт НЕ трогает.
// Раньше сидировался `position` — то самое поле, которое скрипт перезаписывает,
// то есть после первого прогона раскладка опиралась на результат собственной
// прошлой работы, а геометрия презентации была потеряна. Если slidePosition в
// файле нет (старый файл, экспорт из стороннего инструмента), скрипт
// откатывается на `position` и печатает об этом предупреждение.
//
// Скрипт меняет в JSON ТОЛЬКО поле position у узлов: содержание (id, label,
// рёбра, группы, типы) берётся из презентации и здесь не трогается.
// Прогон детерминирован — повторный запуск даёт побайтово тот же файл:
// узлы и рёбра сортируются перед добавлением в граф, координаты округляются
// до целых, случайности нет.
//
// Раскладка считается отдельно для двух независимых графов:
//   · уровень 2 (SPEC §4.2) — по одному графу на этап: шаги/интеграции/
//     предупреждения через dagre (rankdir LR), data-узлы — колонками входов
//     слева и выходов справа;
//   · уровень 1 (SPEC §4.1) — 4 карточки этапов + внешние системы по
//     overviewEdges. В схеме (src/data/schema.ts) у Stage нет поля position,
//     поэтому координаты обзора НЕ записываются, а только печатаются в отчёте.
//
// dagre используется только здесь, в рантайм-бандл не попадает (SPEC §1).

import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type * as DagreModule from '@dagrejs/dagre';
import {
  ProcessMapSchema,
  type NodeType,
  type ProcessMap,
  type ProcessNode,
  type Stage,
} from '../src/data/schema.ts';
import {
  DATA_NODE_SIZE,
  STAGE_NODE_SIZE as STAGE_SIZE,
  STEP_NODE_SIZE,
  type NodeSize,
} from '../src/theme/sizes.ts';
import { splitStageDataNodes as splitDataNodes } from '../src/utils/stageNodes.ts';

// @dagrejs/dagre — CommonJS-пакет: `module.exports = { graphlib, layout, ... }`.
// Через ESM-импорт Node видит только `graphlib` (cjs-module-lexer не распознаёт
// остальные ключи), поэтому модуль подключается через createRequire и типизируется
// его же .d.ts — без `any` и без новых зависимостей.
const dagre = createRequire(import.meta.url)('@dagrejs/dagre') as typeof DagreModule;
const { graphlib } = dagre;
const dagreLayout = dagre.layout;

// --------------------------------------------------------------------------------------
// Константы раскладки
// --------------------------------------------------------------------------------------

// Путь считается лениво: модуль импортируется ещё и тестом (tests/layout.test.ts)
// ради общих констант и метрики, а там import.meta.url — не file:-URL.
function jsonPath(): string {
  return fileURLToPath(new URL('../src/data/process.json', import.meta.url));
}

export type Size = NodeSize;

/**
 * Размеры узлов — из src/theme/sizes.ts, единственного источника истины
 * (он же сверяется с токенами --pm-*-node-* в tests/sizes.test.ts).
 * IntegrationNode и WarningNode отдельных размеров в SPEC не имеют и рисуются
 * карточкой шага, поэтому используют размер StepNode.
 */
export const NODE_SIZE: Record<NodeType, Size> = {
  step: STEP_NODE_SIZE,
  integration: STEP_NODE_SIZE,
  warning: STEP_NODE_SIZE,
  data: DATA_NODE_SIZE,
};

export const STAGE_NODE_SIZE: Size = STAGE_SIZE;

/** Внешняя система обзора — свимлейн-бейдж; размера в SPEC нет, значение номинальное. */
const SYSTEM_NODE_SIZE: Size = { width: 160, height: 56 };

/** Зазор между ранга́ми (по оси потока, X при rankdir=LR). */
const RANK_SEP = 32;
/** Зазор между узлами одного ранга. */
const NODE_SEP = 32;
/** Зазор между рёбрами одного ранга. */
const EDGE_SEP = 16;
/** Вертикальный шаг колонок data-узлов. */
const DATA_ROW_GAP = 16;
/** Горизонтальный отступ колонки data-узлов от потока шагов. */
const DATA_COLUMN_GAP = 96;

// --------------------------------------------------------------------------------------
// Геометрия и метрика пересечений
// --------------------------------------------------------------------------------------

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function rectOf(node: ProcessNode): Rect {
  const size = NODE_SIZE[node.type];
  return { x: node.position.x, y: node.position.y, width: size.width, height: size.height };
}

function overlaps(a: Rect, b: Rect): boolean {
  return (
    a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
  );
}

/** Число пар прямоугольников с ненулевой площадью пересечения — главная метрика раскладки. */
export function countOverlappingPairs(rects: readonly Rect[]): number {
  let count = 0;
  for (let i = 0; i < rects.length; i += 1) {
    for (let j = i + 1; j < rects.length; j += 1) {
      const a = rects[i];
      const b = rects[j];
      if (a !== undefined && b !== undefined && overlaps(a, b)) {
        count += 1;
      }
    }
  }
  return count;
}

export function countStageOverlaps(stage: Stage): number {
  return countOverlappingPairs(stage.nodes.map(rectOf));
}

function boundsOf(rects: readonly Rect[]): { width: number; height: number } {
  if (rects.length === 0) {
    return { width: 0, height: 0 };
  }
  let maxX = 0;
  let maxY = 0;
  for (const rect of rects) {
    maxX = Math.max(maxX, rect.x + rect.width);
    maxY = Math.max(maxY, rect.y + rect.height);
  }
  return { width: maxX, height: maxY };
}

// --------------------------------------------------------------------------------------
// Раскладка этапа (уровень 2)
// --------------------------------------------------------------------------------------

export interface Placement {
  x: number;
  y: number;
}

/**
 * Разделение data-узлов на входы и выходы.
 *
 * Правило геометрическое и опирается на исходную геометрию слайда: data-узел
 * считается ВХОДОМ, если его исходный x левее горизонтального центра области
 * шагов этапа (центр между самым левым и самым правым не-data узлом), и
 * ВЫХОДОМ в противном случае. Это ровно то, как устроены слайды детализации:
 * перечни-источники стоят в левом поле, блоки результатов — справа от потока.
 * SPEC §4.2: колонка DataNode входов слева, выходов справа.
 */
// Правило разделения data-узлов на колонки входов и выходов живёт в
// src/utils/stageNodes.ts — там же, откуда его берут экран StageDetail и
// счётчик в Breadcrumbs. Скрипт импортирует ту же функцию, чтобы раскладка
// не могла разойтись с тем, что нарисовано и посчитано в приложении.
// Обратное направление (приложение импортирует из scripts/) невозможно:
// этот файл тянет @dagrejs/dagre, а SPEC §1 требует держать dagre вне
// рантайм-бандла.

/**
 * Исходная геометрия узла — координаты фигуры на слайде презентации.
 *
 * Это ЕДИНСТВЕННЫЙ вход раскладки по геометрии. `position` здесь — запасной
 * вариант для документов, собранных до появления slidePosition: раскладка на
 * них работает как раньше (сидируется собственным прошлым результатом), и
 * скрипт об этом предупреждает — см. countWithoutSlidePosition.
 */
export function slidePositionOf(node: ProcessNode): { x: number; y: number } {
  return node.slidePosition ?? node.position;
}

/** Число узлов, потерявших исходную геометрию слайда (нужно только для отчёта). */
export function countWithoutSlidePosition(stage: Stage): number {
  return stage.nodes.filter((node) => node.slidePosition === undefined).length;
}

/**
 * Копия этапа, у которой `position` = исходная геометрия слайда.
 *
 * Нужна, чтобы отдать этап в splitStageDataNodes (src/utils/stageNodes.ts) —
 * единственный источник правила «левее середины — вход» — не заводя второй
 * копии правила и не добавляя в него параметр ради одного вызова из скрипта.
 * Всё остальное (id, тип, группа) копируется как есть.
 */
function seedStage(stage: Stage): Stage {
  return {
    ...stage,
    nodes: stage.nodes.map((node) => ({ ...node, position: slidePositionOf(node) })),
  };
}

/** Порядок узлов внутри ранга сидируется исходной геометрией слайда: сверху вниз, слева направо. */
function bySlideOrder(a: ProcessNode, b: ProcessNode): number {
  const first = slidePositionOf(a);
  const second = slidePositionOf(b);
  if (first.y !== second.y) {
    return first.y - second.y;
  }
  if (first.x !== second.x) {
    return first.x - second.x;
  }
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Раскладка потока шагов этапа.
 *
 * Граф компаундный (`compound: true`): каждая группа этапа становится кластером
 * dagre, а её узлы — детьми кластера. Благодаря этому dagre держит узлы одной
 * группы в смежных ранга́х и рядах, и dashed-контейнер группы (SPEC §4.2)
 * получается компактным прямоугольником, а не размазанным по всей раскладке.
 */
function layoutFlow(stage: Stage): Map<string, Placement> {
  const flow = [...stage.nodes.filter((node) => node.type !== 'data')].sort(bySlideOrder);
  const placements = new Map<string, Placement>();
  if (flow.length === 0) {
    return placements;
  }

  const graph = new graphlib.Graph({ compound: true, multigraph: false, directed: true });
  graph.setGraph({
    rankdir: 'LR',
    ranksep: RANK_SEP,
    nodesep: NODE_SEP,
    edgesep: EDGE_SEP,
    marginx: 0,
    marginy: 0,
  });
  graph.setDefaultEdgeLabel(() => ({}));

  const flowIds = new Set(flow.map((node) => node.id));
  const usedGroups = new Set(
    flow.map((node) => node.group).filter((group): group is string => group !== undefined),
  );
  for (const group of stage.groups) {
    if (usedGroups.has(group.id)) {
      graph.setNode(`cluster:${group.id}`, {});
    }
  }

  for (const node of flow) {
    const size = NODE_SIZE[node.type];
    graph.setNode(node.id, { width: size.width, height: size.height });
    if (node.group !== undefined && usedGroups.has(node.group)) {
      graph.setParent(node.id, `cluster:${node.group}`);
    }
  }

  const edges = [...stage.edges].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (const edge of edges) {
    if (flowIds.has(edge.source) && flowIds.has(edge.target) && edge.source !== edge.target) {
      graph.setEdge(edge.source, edge.target, {});
    }
  }

  dagreLayout(graph);

  // dagre отдаёт координаты ЦЕНТРА узла — переводим в левый верхний угол
  // (React Flow позиционирует узел по нему).
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  for (const node of flow) {
    const laid = graph.node(node.id);
    const size = NODE_SIZE[node.type];
    const x = laid.x - size.width / 2;
    const y = laid.y - size.height / 2;
    placements.set(node.id, { x, y });
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
  }
  for (const [id, placement] of placements) {
    placements.set(id, { x: placement.x - minX, y: placement.y - minY });
  }
  return placements;
}

function stackColumn(nodes: readonly ProcessNode[]): number {
  return nodes.length === 0
    ? 0
    : nodes.length * NODE_SIZE.data.height + (nodes.length - 1) * DATA_ROW_GAP;
}

/**
 * Полная раскладка этапа: поток шагов посередине, колонка входов слева,
 * колонка выходов справа. Колонки центрируются по высоте относительно самого
 * высокого блока, порядок внутри колонки — исходный (сверху вниз).
 */
export function layoutStage(stage: Stage): Map<string, Placement> {
  const flowPlacements = layoutFlow(stage);
  const flow = stage.nodes.filter((node) => node.type !== 'data');
  const flowRects: Rect[] = flow.map((node) => {
    const placement = flowPlacements.get(node.id) ?? { x: 0, y: 0 };
    const size = NODE_SIZE[node.type];
    return { x: placement.x, y: placement.y, width: size.width, height: size.height };
  });
  const flowBounds = boundsOf(flowRects);

  // Деление на колонки считается по геометрии СЛАЙДА, а не по текущим
  // координатам файла: иначе после первого прогона решение принималось бы по
  // результату этого же прогона (data-узел, положенный в левую колонку,
  // навсегда оставался бы входом). Правило — общее с приложением,
  // src/utils/stageNodes.ts.
  const { inputs, outputs } = splitDataNodes(seedStage(stage));
  const sortedInputs = [...inputs].sort(bySlideOrder);
  const sortedOutputs = [...outputs].sort(bySlideOrder);

  const inputsHeight = stackColumn(sortedInputs);
  const outputsHeight = stackColumn(sortedOutputs);
  const totalHeight = Math.max(flowBounds.height, inputsHeight, outputsHeight);

  const inputsX = 0;
  const flowX = sortedInputs.length > 0 ? NODE_SIZE.data.width + DATA_COLUMN_GAP : 0;
  const outputsX = flowX + flowBounds.width + DATA_COLUMN_GAP;

  const result = new Map<string, Placement>();

  const flowTop = (totalHeight - flowBounds.height) / 2;
  for (const node of flow) {
    const placement = flowPlacements.get(node.id) ?? { x: 0, y: 0 };
    result.set(node.id, {
      x: Math.round(flowX + placement.x),
      y: Math.round(flowTop + placement.y),
    });
  }

  const placeColumn = (nodes: readonly ProcessNode[], x: number, height: number): void => {
    const top = (totalHeight - height) / 2;
    nodes.forEach((node, index) => {
      result.set(node.id, {
        x: Math.round(x),
        y: Math.round(top + index * (NODE_SIZE.data.height + DATA_ROW_GAP)),
      });
    });
  };
  placeColumn(sortedInputs, inputsX, inputsHeight);
  placeColumn(sortedOutputs, outputsX, outputsHeight);

  return result;
}

// --------------------------------------------------------------------------------------
// Раскладка обзора (уровень 1)
// --------------------------------------------------------------------------------------

interface OverviewPlacement {
  id: string;
  kind: 'stage' | 'system';
  x: number;
  y: number;
  width: number;
  height: number;
}

function layoutOverview(map: ProcessMap): OverviewPlacement[] {
  const stageIds = new Set(map.stages.map((stage) => stage.id));
  const systemIds: string[] = [];
  for (const edge of map.overviewEdges) {
    for (const endpoint of [edge.source, edge.target]) {
      if (!stageIds.has(endpoint) && !systemIds.includes(endpoint)) {
        systemIds.push(endpoint);
      }
    }
  }
  systemIds.sort();

  const graph = new graphlib.Graph({ multigraph: false, directed: true });
  graph.setGraph({
    rankdir: 'LR',
    ranksep: RANK_SEP,
    nodesep: NODE_SEP,
    edgesep: EDGE_SEP,
    marginx: 0,
    marginy: 0,
  });
  graph.setDefaultEdgeLabel(() => ({}));

  const sizes = new Map<string, Size>();
  for (const stage of map.stages) {
    sizes.set(stage.id, STAGE_NODE_SIZE);
    graph.setNode(stage.id, { ...STAGE_NODE_SIZE });
  }
  for (const system of systemIds) {
    sizes.set(system, SYSTEM_NODE_SIZE);
    graph.setNode(system, { ...SYSTEM_NODE_SIZE });
  }
  for (const edge of [...map.overviewEdges].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))) {
    if (edge.source !== edge.target) {
      graph.setEdge(edge.source, edge.target, {});
    }
  }

  dagreLayout(graph);

  const raw: OverviewPlacement[] = [];
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  for (const id of [...map.stages.map((stage) => stage.id), ...systemIds]) {
    const size = sizes.get(id) ?? SYSTEM_NODE_SIZE;
    const laid = graph.node(id);
    const x = laid.x - size.width / 2;
    const y = laid.y - size.height / 2;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    raw.push({
      id,
      kind: stageIds.has(id) ? 'stage' : 'system',
      x,
      y,
      width: size.width,
      height: size.height,
    });
  }
  return raw.map((item) => ({
    ...item,
    x: Math.round(item.x - minX),
    y: Math.round(item.y - minY),
  }));
}

// --------------------------------------------------------------------------------------
// Запись и отчёт
// --------------------------------------------------------------------------------------

/**
 * Формат записи повторяет scripts/import-pptx.py (json.dumps ensure_ascii=False,
 * indent=2, перевод строки в конце, LF): иначе прогоны импорта и раскладки
 * бесконечно переписывали бы файл друг за другом.
 */
function serialize(map: ProcessMap): string {
  return `${JSON.stringify(map, null, 2)}\n`;
}

/**
 * Полный прогон раскладки: читает src/data/process.json, пересчитывает
 * координаты, печатает отчёт и записывает файл. Экспортируется ради
 * scripts/data.ts (конвейер `npm run data`), который вызывает её в том же
 * процессе после импорта.
 */
export function runLayout(): number {
  const path = jsonPath();
  const original = readFileSync(path, 'utf8');
  const raw = JSON.parse(original) as ProcessMap;
  ProcessMapSchema.parse(raw);

  const before = raw.stages.map((stage) => ({
    number: stage.number,
    overlaps: countStageOverlaps(stage),
  }));

  const lines: string[] = [];
  lines.push('='.repeat(78));
  lines.push('ОТЧЁТ  scripts/layout.ts  (dagre → position)');
  lines.push('='.repeat(78));

  for (const stage of raw.stages) {
    const placements = layoutStage(stage);
    for (const node of stage.nodes) {
      const placement = placements.get(node.id);
      if (placement === undefined) {
        throw new Error(`Узел "${node.id}" не получил координат`);
      }
      node.position = { x: placement.x, y: placement.y };
    }
  }

  for (const stage of raw.stages) {
    const rects = stage.nodes.map(rectOf);
    const bounds = boundsOf(rects);
    const { inputs, outputs } = splitDataNodes(stage);
    const flowCount = stage.nodes.length - inputs.length - outputs.length;
    const wasOverlaps = before.find((item) => item.number === stage.number)?.overlaps ?? 0;
    lines.push('');
    lines.push(`--- этап ${stage.number} «${stage.shortTitle}» ${'-'.repeat(30)}`);
    lines.push(`  habitat:              ${bounds.width}×${bounds.height} px`);
    lines.push(
      `  узлов:                ${stage.nodes.length} ` +
        `(поток ${flowCount}, входов ${inputs.length}, выходов ${outputs.length})`,
    );
    lines.push(`  групп:                ${stage.groups.length}`);
    lines.push(`  рёбер:                ${stage.edges.length}`);
    lines.push(
      `  пересечений узлов:    ${countOverlappingPairs(rects)} (было ${wasOverlaps})`,
    );
    const orphans = countWithoutSlidePosition(stage);
    if (orphans > 0) {
      lines.push(
        `  БЕЗ slidePosition:    ${orphans} — исходная геометрия слайда утрачена,` +
          ` раскладка сидирована собственным прошлым результатом;` +
          ` восстанавливается перегенерацией: npm run data`,
      );
    }
  }

  const overview = layoutOverview(raw);
  const overviewBounds = boundsOf(overview);
  lines.push('');
  lines.push(`--- обзор (уровень 1) ${'-'.repeat(43)}`);
  lines.push(`  habitat:              ${overviewBounds.width}×${overviewBounds.height} px`);
  lines.push(
    `  узлов:                ${overview.length} ` +
      `(этапов ${overview.filter((item) => item.kind === 'stage').length}, ` +
      `систем ${overview.filter((item) => item.kind === 'system').length})`,
  );
  lines.push(`  рёбер:                ${raw.overviewEdges.length}`);
  lines.push(`  пересечений узлов:    ${countOverlappingPairs(overview)}`);
  lines.push('  координаты (в схеме Stage поля position нет — в JSON не пишутся):');
  for (const item of overview) {
    lines.push(`    ${item.kind === 'stage' ? 'этап  ' : 'система'} ${item.id}: x=${item.x} y=${item.y}`);
  }

  const updated = serialize(raw);
  const changed = updated !== original;
  writeFileSync(path, updated, { encoding: 'utf8' });

  lines.push('');
  lines.push('='.repeat(78));
  lines.push(`  ${changed ? 'записано' : 'без изменений'}: src/data/process.json`);
  lines.push('='.repeat(78));

  console.log(lines.join('\n'));
  return 0;
}

// Модуль импортируется тестом (tests/layout.test.ts) ради общих констант
// размеров и метрики пересечений, поэтому запись файла выполняется только при
// прямом запуске `npm run layout`.
function isDirectRun(): boolean {
  const entry = process.argv[1];
  if (entry === undefined) {
    return false;
  }
  try {
    return resolve(entry) === resolve(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isDirectRun()) {
  process.exitCode = runLayout();
}
