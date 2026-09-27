// Подписи-артефакты рёбер уровня 1 не ложатся на карточки модулей и не
// подходят к полосе FP&A ближе прежнего (задача process-map-9mn.19).
//
// ДЕФЕКТ, КОТОРЫЙ ЗДЕСЬ СТЕРЕЖЁТСЯ. Ребро, ведомое СНИЗУ карточек (обратная
// связь соседей, связь через модуль), кладёт подпись на свой горизонтальный
// отрезок. При offset smoothstep по умолчанию (20) отрезок шёл так близко к
// карточкам, что трёхстрочная подпись заходила на низ карточки-цели или
// промежуточной на 2 px (шапка artifactGeometry.ts). Починка — отступ пути;
// этот файл проверяет, что она держится, и в обычном, и в компактном режиме.
//
// КАК СЧИТАЕТСЯ ПРЯМОУГОЛЬНИК ПОДПИСИ — тем же путём, что на полотне, и ни
// шагом больше:
//   1. Концы ребра — точки хэндлов, как их отдаёт React Flow в EdgeProps.
//      getHandlePosition в @xyflow/system берёт ВНЕШНИЙ край хэндла по его
//      стороне (у нижнего — низ, у левого — левый край), а хэндл на этом
//      экране — квадрат 1×1 px (Overview.module.css), поставленный серединой
//      на рамку карточки (translate(±50%) в стилях React Flow). Поэтому точка
//      хэндла лежит на HANDLE_HALF = 0.5 px снаружи рамки, по середине стороны.
//      Координаты узла-ребёнка (карточки систем в свимлейне) — относительно
//      родителя, и к ним прибавляется позиция свимлейна.
//   2. Точка подписи — artifactEdgePath, та самая функция, которой рисует
//      ребро (getSmoothStepPath с отступом ARTIFACT_EDGE_OFFSET). Своей копии
//      формулы getPoints здесь нет: она разошлась бы с библиотекой молча.
//   3. Подпись центрирована на этой точке (translate(-50%, -50%) в
//      EdgeLabel.tsx). Размер — худший случай бюджета: ширина
//      EDGE_LABEL_WRAP_MAX_WIDTH (max-width переносимой подписи, подложка
//      входит в неё — box-sizing border-box), высота ARTIFACT_LABEL_MAX_HEIGHT
//      (EDGE_LABEL_WRAP_MAX_LINES строк по EDGE_LABEL_LINE_HEIGHT; вертикальной
//      подложки у подписи нет — это сторожит последний describe файла).
//
// Чего здесь НЕТ: настоящей вёрстки. jsdom не считает layout, и число строк
// у конкретного текста он не скажет. Поэтому проверяется бюджет — «подпись
// в три строки на всю ширину не ложится на карточки», — а что известные
// артефакты в него укладываются, остаётся замеру в браузере.
import { readFileSync } from 'node:fs';
import { Position, type Edge as FlowEdge } from '@xyflow/react';
import { describe, expect, it } from 'vitest';
import {
  buildModulesGraph,
  type ModulesNode,
} from '../src/components/ModulesOverview/modulesGraph';
import {
  ARTIFACT_EDGE_OFFSET,
  ARTIFACT_LABEL_MAX_HEIGHT,
  artifactEdgePath,
} from '../src/components/edges/ArtifactEdge';
import type { MapWithModules } from '../src/data/modules';
import { validateIntegrity } from '../src/data/schema';
import {
  EDGE_LABEL_LINE_HEIGHT,
  EDGE_LABEL_WRAP_MAX_LINES,
  EDGE_LABEL_WRAP_MAX_WIDTH,
} from '../src/theme/sizes';
import {
  LANE_FPA,
  MODULE_DEMAND,
  MODULE_PRODUCTION,
  parseThreeLevelProcessMap,
} from './fixtures/three-level-process';

/** Полхэндла: хэндл 1 px стоит серединой на рамке — шапка файла, шаг 1. */
const HANDLE_HALF = 0.5;

/**
 * Просвет между подписью и полосой FP&A, ниже которого опускаться нельзя: столько
 * было до process-map-9mn.19, и задача обязалась его не отнимать.
 */
const MIN_BAND_CLEARANCE = 13.5;

interface Rect {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

function nodeById(nodes: readonly ModulesNode[], id: string): ModulesNode {
  const node = nodes.find((candidate) => candidate.id === id);
  if (node === undefined) {
    throw new Error(`На полотне нет узла "${id}"`);
  }
  return node;
}

/** Размер узла: у карточек — width/height, у полос и свимлейнов — style. */
function sizeOf(node: ModulesNode): { width: number; height: number } {
  const width = node.width ?? Number(node.style?.width);
  const height = node.height ?? Number(node.style?.height);
  if (!Number.isFinite(width) || !Number.isFinite(height)) {
    throw new Error(`У узла "${node.id}" нет размера`);
  }
  return { width, height };
}

/** Прямоугольник узла в координатах полотна (с позицией родителя). */
function rectOf(nodes: readonly ModulesNode[], node: ModulesNode): Rect {
  const parent = node.parentId === undefined ? undefined : nodeById(nodes, node.parentId);
  const left = node.position.x + (parent?.position.x ?? 0);
  const top = node.position.y + (parent?.position.y ?? 0);
  const { width, height } = sizeOf(node);
  return { left, top, right: left + width, bottom: top + height };
}

/** Точка хэндла так, как её отдаёт React Flow, — шапка файла, шаг 1. */
function handlePoint(
  rect: Rect,
  handle: string | null | undefined,
): { x: number; y: number; position: Position } {
  const midX = (rect.left + rect.right) / 2;
  const midY = (rect.top + rect.bottom) / 2;
  switch (handle) {
    case 'right':
      return { x: rect.right + HANDLE_HALF, y: midY, position: Position.Right };
    case 'left':
      return { x: rect.left - HANDLE_HALF, y: midY, position: Position.Left };
    case 'bottom':
      return { x: midX, y: rect.bottom + HANDLE_HALF, position: Position.Bottom };
    case 'top':
      return { x: midX, y: rect.top - HANDLE_HALF, position: Position.Top };
    default:
      throw new Error(`Неизвестный хэндл "${String(handle)}"`);
  }
}

function endsOf(nodes: readonly ModulesNode[], edge: FlowEdge) {
  const source = handlePoint(rectOf(nodes, nodeById(nodes, edge.source)), edge.sourceHandle);
  const target = handlePoint(rectOf(nodes, nodeById(nodes, edge.target)), edge.targetHandle);
  return { source, target };
}

/** Прямоугольник подписи ребра — шапка файла, шаги 2 и 3. */
function labelRectOf(nodes: readonly ModulesNode[], edge: FlowEdge): Rect {
  const { source, target } = endsOf(nodes, edge);
  const { labelX, labelY } = artifactEdgePath({
    sourceX: source.x,
    sourceY: source.y,
    sourcePosition: source.position,
    targetX: target.x,
    targetY: target.y,
    targetPosition: target.position,
  });
  return {
    left: labelX - EDGE_LABEL_WRAP_MAX_WIDTH / 2,
    right: labelX + EDGE_LABEL_WRAP_MAX_WIDTH / 2,
    top: labelY - ARTIFACT_LABEL_MAX_HEIGHT / 2,
    bottom: labelY + ARTIFACT_LABEL_MAX_HEIGHT / 2,
  };
}

/** Пересекаются ли два прямоугольника (касание краями — не пересечение). */
function overlaps(a: Rect, b: Rect): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

// ───────────────────────────── варианты карты ─────────────────────────────

/** Модули в ОБРАТНОМ порядке массива: обе связи фикстуры становятся обратными. */
function reversed(): MapWithModules {
  const map = parseThreeLevelProcessMap();
  return { ...map, modules: [...map.modules].reverse() };
}

/** Связь через модуль: demand → production при supply между ними. */
function withSkip(map: MapWithModules): MapWithModules {
  return {
    ...map,
    moduleEdges: [
      ...(map.moduleEdges ?? []),
      {
        id: 'module-edge-skip',
        source: MODULE_DEMAND,
        target: MODULE_PRODUCTION,
        kind: 'process',
        label: 'Итоговый неограниченный прогноз',
      },
    ],
  };
}

/**
 * Какие рёбра где лежат. Предпосылки проверяются в тесте «варианты покрывают
 * оба вида рёбер снизу», а не предполагаются: вариант, в котором ни одно
 * ребро не ведётся снизу, проверял бы только прямые связи соседей.
 */
const VARIANTS: readonly (readonly [string, () => MapWithModules])[] = [
  ['фикстура: прямые связи соседей', () => parseThreeLevelProcessMap()],
  ['переставленный массив: обратные связи соседей', reversed],
  ['связь через модуль вперёд', () => withSkip(parseThreeLevelProcessMap())],
  ['связь через модуль назад', () => withSkip(reversed())],
];

const MODES: readonly (readonly [string, boolean])[] = [
  ['обычный режим', false],
  ['компактный режим', true],
];

function moduleEdgesOf(edges: readonly FlowEdge[]): FlowEdge[] {
  return edges.filter((edge) => edge.type === 'artifact');
}

describe('подписи связей модулей не ложатся на карточки', () => {
  it('варианты карты валидны и покрывают оба вида рёбер снизу', () => {
    for (const [name, build] of VARIANTS) {
      expect(validateIntegrity(build()), name).toEqual([]);
    }
    // Обратная связь соседей и связь через модуль (вперёд и назад) — все три
    // ведутся снизу; без них проверка ниже видела бы только прямые связи.
    const fromBelow = (map: MapWithModules) =>
      moduleEdgesOf(buildModulesGraph(map, true).edges).filter(
        (edge) => edge.sourceHandle === 'bottom',
      ).length;
    expect(fromBelow(reversed())).toBe(2);
    expect(fromBelow(withSkip(parseThreeLevelProcessMap()))).toBe(1);
    expect(fromBelow(withSkip(reversed()))).toBe(3);
  });

  for (const [mode, compact] of MODES) {
    for (const [name, build] of VARIANTS) {
      it(`${mode}, ${name}: подпись не пересекает ни одну карточку модуля`, () => {
        const { nodes, edges } = buildModulesGraph(build(), true, compact);
        const cards = nodes.filter((node) => node.type === 'module');
        // Все рёбра уровня 1, и связи с системами тоже: их подпись — тот же
        // артефакт того же бюджета, и путь от свимлейна к карточке тоже
        // несёт отступ ARTIFACT_EDGE_OFFSET. К полосе FP&A (тест ниже) они
        // не проверяются: путь к свимлейну выхода проходит сквозь полосу по
        // построению (свимлейн — под ней).
        const all = edges.filter(
          (edge) => edge.type === 'artifact' || edge.type === 'artifactIntegration',
        );
        expect(all.length, 'предпосылка: рёбра уровня 1 на полотне есть').toBeGreaterThan(0);
        for (const edge of all) {
          const label = labelRectOf(nodes, edge);
          for (const card of cards) {
            const rect = rectOf(nodes, card);
            expect(
              overlaps(label, rect),
              `подпись ${edge.id} ложится на карточку ${card.id}: ` +
                `подпись ${JSON.stringify(label)}, карточка ${JSON.stringify(rect)}`,
            ).toBe(false);
          }
        }
      });

      it(`${mode}, ${name}: до полосы FP&A не меньше прежнего`, () => {
        const { nodes, edges } = buildModulesGraph(build(), true, compact);
        const band = rectOf(nodes, nodeById(nodes, LANE_FPA));
        for (const edge of moduleEdgesOf(edges)) {
          const label = labelRectOf(nodes, edge);
          expect(
            band.top - label.bottom,
            `подпись ${edge.id} подошла к полосе FP&A ближе ${MIN_BAND_CLEARANCE} px`,
          ).toBeGreaterThanOrEqual(MIN_BAND_CLEARANCE);
        }
      });
    }
  }

  /*
   * Отступ пути не бесплатен: «выступ» у каждого хэндла длиной
   * ARTIFACT_EDGE_OFFSET. Если промежуток между хэндлами меньше двух
   * выступов, getPoints разворачивает путь петлёй. Сторожатся оба места, где
   * этот промежуток задан раскладкой, — зазор между соседями и путь от
   * свимлейна входа к верху карточки, — чтобы рост бюджета строк не сломал их
   * молча.
   */
  it('промежутки между хэндлами шире двух отступов пути', () => {
    for (const [, compact] of MODES) {
      const { nodes, edges } = buildModulesGraph(parseThreeLevelProcessMap(), true, compact);
      for (const edge of edges) {
        const { source, target } = endsOf(nodes, edge);
        const along =
          source.position === Position.Right ? target.x - source.x : target.y - source.y;
        // Обратные связи и связи через модуль ведутся снизу на левый хэндл —
        // у них промежутка «вдоль» нет, и петли не бывает по построению.
        if (source.position === Position.Bottom && target.position === Position.Left) {
          continue;
        }
        expect(along, `${edge.id} в режиме compact=${String(compact)}`).toBeGreaterThan(
          2 * ARTIFACT_EDGE_OFFSET,
        );
      }
    }
  });
});

/*
 * Бюджет высоты подписи держится на двух фактах вёрстки EdgeLabel, которые
 * раскладка сама не видит: строка подписи — токен --pm-line-height-15 (его
 * числовое значение сторожит tests/sizes.test.ts через SIZE_TOKENS), и
 * вертикальной подложки нет. Уйди подпись на другой токен или получи
 * padding сверху — прямоугольник выше перестал бы описывать настоящую
 * подпись, а тесты остались бы зелёными.
 */
describe('высота подписи — ровно строки', () => {
  const css = readFileSync('src/components/edges/EdgeLabel/EdgeLabel.module.css', 'utf8');

  function block(selector: string): string {
    const match = new RegExp(`\\${selector}\\s*\\{([^}]*)\\}`).exec(css);
    if (match?.[1] === undefined) {
      throw new Error(`В EdgeLabel.module.css нет блока ${selector}`);
    }
    return match[1];
  }

  it('строка подписи — --pm-line-height-15, и бюджет считается от неё', () => {
    expect(block('.label')).toMatch(/line-height:\s*var\(--pm-line-height-15\)/);
    expect(block('.wrap')).not.toMatch(/line-height/);
    expect(ARTIFACT_LABEL_MAX_HEIGHT).toBe(EDGE_LABEL_WRAP_MAX_LINES * EDGE_LABEL_LINE_HEIGHT);
  });

  it('по вертикали у подложки отступов нет', () => {
    // padding: 0 <горизонталь> — первое значение и есть вертикаль.
    expect(block('.label')).toMatch(/padding:\s*0\s+var\(--pm-edge-label-padding-x\)/);
    expect(block('.wrap')).not.toMatch(/padding/);
  });
});
