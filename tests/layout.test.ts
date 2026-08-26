import { describe, expect, it } from 'vitest';
import { ProcessMapSchema, validateIntegrity, type Stage } from '../src/data/schema.ts';
import {
  NODE_SIZE,
  countOverlappingPairs,
  countStageOverlaps,
  countWithoutSlidePosition,
  layoutStage,
  rectOf,
  slidePositionOf,
} from '../scripts/layout.ts';
import { splitStageDataNodes } from '../src/utils/stageNodes.ts';
import processJson from '../src/data/process.json';

// Координаты в src/data/process.json расставляет `npm run layout`
// (scripts/layout.ts, задача process-map-350). Тест проверяет результат
// на реальных данных: раскладка не должна давать наложенных карточек и
// не должна менять содержание документа.
//
// Размеры узлов берутся из scripts/layout.ts (NODE_SIZE), который согласован
// с app-токенами src/theme/tokens.css — единый источник истины.

const map = ProcessMapSchema.parse(processJson);

/**
 * Допустимое число пересекающихся пар узлов внутри этапа.
 * Ноль достигается на текущих данных для всех четырёх этапов, поэтому порог
 * жёсткий: любое пересечение — регрессия раскладки.
 */
const MAX_OVERLAPS_PER_STAGE = 0;

function dataNodesOf(stage: Stage) {
  return stage.nodes.filter((node) => node.type === 'data');
}

describe('раскладка process.json', () => {
  it('у всех узлов есть position с конечными числами', () => {
    for (const stage of map.stages) {
      for (const node of stage.nodes) {
        expect(Number.isFinite(node.position.x), `${node.id}: x = ${node.position.x}`).toBe(true);
        expect(Number.isFinite(node.position.y), `${node.id}: y = ${node.position.y}`).toBe(true);
        expect(Number.isInteger(node.position.x)).toBe(true);
        expect(Number.isInteger(node.position.y)).toBe(true);
      }
    }
  });

  it.each(map.stages.map((stage) => [stage.number, stage] as const))(
    'этап %i: узлы не пересекаются',
    (_number, stage) => {
      expect(countStageOverlaps(stage)).toBeLessThanOrEqual(MAX_OVERLAPS_PER_STAGE);
    },
  );

  it('data-узлы стоят вертикальными колонками по краям этапа (SPEC §4.2)', () => {
    for (const stage of map.stages) {
      const data = dataNodesOf(stage);
      if (data.length === 0) {
        continue;
      }
      const columns = new Set(data.map((node) => node.position.x));
      // Колонок не больше двух: входы слева и выходы справа.
      expect(columns.size, `этап ${stage.number}`).toBeLessThanOrEqual(2);

      const flow = stage.nodes.filter((node) => node.type !== 'data');
      const flowLeft = Math.min(...flow.map((node) => node.position.x));
      const flowRight = Math.max(
        ...flow.map((node) => node.position.x + NODE_SIZE[node.type].width),
      );
      for (const column of columns) {
        const isLeftColumn = column + NODE_SIZE.data.width <= flowLeft;
        const isRightColumn = column >= flowRight;
        expect(isLeftColumn || isRightColumn, `этап ${stage.number}, колонка x=${column}`).toBe(
          true,
        );
      }
    }
  });

  it('узлы одной группы лежат компактно: в bbox группы нет чужих узлов', () => {
    for (const stage of map.stages) {
      for (const group of stage.groups) {
        const members = stage.nodes.filter((node) => node.group === group.id);
        if (members.length === 0) {
          continue;
        }
        const rects = members.map(rectOf);
        const box = {
          x: Math.min(...rects.map((rect) => rect.x)),
          y: Math.min(...rects.map((rect) => rect.y)),
          width: 0,
          height: 0,
        };
        box.width = Math.max(...rects.map((rect) => rect.x + rect.width)) - box.x;
        box.height = Math.max(...rects.map((rect) => rect.y + rect.height)) - box.y;

        const intruders = stage.nodes
          .filter((node) => node.group !== group.id)
          .map(rectOf)
          .filter((rect) => countOverlappingPairs([box, rect]) === 1);
        expect(intruders, `этап ${stage.number}, группа ${group.id}`).toHaveLength(0);
      }
    }
  });

  it('координаты в файле совпадают с пересчётом (конвейер доведён до конца)', () => {
    for (const stage of map.stages) {
      const first = layoutStage(stage);
      const second = layoutStage(stage);
      for (const node of stage.nodes) {
        const placement = first.get(node.id);
        expect(placement, `${node.id} не получил координат`).toBeDefined();
        expect(second.get(node.id)).toEqual(placement);
        expect(
          placement,
          `${node.id}: координаты файла не совпадают с раскладкой по исходной геометрии слайда. ` +
            'Похоже, прогнан только импорт (scripts/import-pptx.py) — в файле сырая ' +
            'геометрия презентации, на которой карточки накладываются. ' +
            'Конвейер целиком: npm run data',
        ).toEqual(node.position);
      }
    }
  });

  it('содержание документа не изменилось: схема и ссылочная целостность в порядке', () => {
    expect(validateIntegrity(map)).toEqual([]);
    const totalNodes = map.stages.reduce((sum, stage) => sum + stage.nodes.length, 0);
    expect(totalNodes).toBeGreaterThanOrEqual(40);
  });
});

// Конвейер данных: import-pptx.py (геометрия слайда) → layout.ts (dagre).
// Задачи process-map-3b9 (порядок шагов) и process-map-cxn (чем сидируется
// раскладка). Проверяется не «раскладка красивая», а то, ОТКУДА она берёт вход:
// из `slidePosition` — неизменяемой геометрии презентации, а не из `position`,
// которое сама же и перезаписывает.
describe('конвейер данных: slidePosition как исходная геометрия', () => {
  it('исходная геометрия слайда сохранена у всех узлов', () => {
    for (const stage of map.stages) {
      expect(
        countWithoutSlidePosition(stage),
        `этап ${stage.number}: узлы без slidePosition — геометрия презентации потеряна, ` +
          'перегенерируйте данные: npm run data',
      ).toBe(0);
    }
  });

  it('slidePosition отличается от position: position уже пересчитан dagre', () => {
    // Если бы `npm run layout` не отработал, position совпадал бы со слайдом
    // у ВСЕХ узлов — то есть файл остался бы на сырой геометрии.
    // Читается ИМЕННО поле файла, а не slidePositionOf: проверяется состояние
    // данных, а не поведение скрипта (иначе тест ловил бы фолбэк вместо
    // незавершённого конвейера).
    const moved = map.stages
      .flatMap((stage) => stage.nodes)
      .filter(
        (node) =>
          node.slidePosition !== undefined &&
          (node.slidePosition.x !== node.position.x || node.slidePosition.y !== node.position.y),
      );
    expect(moved.length, 'ни один узел не сдвинут — раскладка не прогонялась').toBeGreaterThan(0);
  });

  it('раскладка сидируется slidePosition, а не текущим position', () => {
    // Мутация: position каждого узла заменяется на зеркальный и смещённый —
    // на таком входе прежняя (сидированная position) раскладка дала бы другой
    // порядок ранга́ и другое деление data-узлов на входы/выходы.
    for (const stage of map.stages) {
      const mutated: Stage = {
        ...stage,
        nodes: stage.nodes.map((node) => ({
          ...node,
          position: { x: -node.position.x, y: 10_000 - node.position.y },
        })),
      };
      const expected = layoutStage(stage);
      const actual = layoutStage(mutated);
      for (const node of stage.nodes) {
        expect(
          actual.get(node.id),
          `этап ${stage.number}, узел ${node.id}: раскладка зависит от position`,
        ).toEqual(expected.get(node.id));
      }
    }
  });

  it('без slidePosition раскладка откатывается на position (старые документы)', () => {
    // Совместимость: карта, собранная до появления поля (или пришедшая
    // экспортом из приложения стороннего инструмента), раскладывается как
    // раньше — по position.
    for (const stage of map.stages) {
      const legacy: Stage = {
        ...stage,
        nodes: stage.nodes.map((node) => {
          const legacyNode = { ...node, position: slidePositionOf(node) };
          delete legacyNode.slidePosition;
          return legacyNode;
        }),
      };
      expect(countWithoutSlidePosition(legacy)).toBe(stage.nodes.length);
      const expected = layoutStage(stage);
      for (const node of stage.nodes) {
        expect(layoutStage(legacy).get(node.id), `${node.id}`).toEqual(expected.get(node.id));
      }
    }
  });

  it('колонки, выбранные раскладкой, совпадают с тем, как их видит приложение', () => {
    // Раскладка делит data-узлы по геометрии слайда, а StageDetail и счётчик в
    // Breadcrumbs — по записанному position. Обе классификации обязаны
    // совпадать, иначе узел, положенный в колонку входов, показывался бы в
    // выходах. Это и есть условие, при котором сдвиг сида безопасен.
    for (const stage of map.stages) {
      const bySlide = splitStageDataNodes({
        ...stage,
        nodes: stage.nodes.map((node) => ({ ...node, position: slidePositionOf(node) })),
      });
      const byPosition = splitStageDataNodes(stage);
      expect(
        byPosition.inputs.map((node) => node.id).sort(),
        `этап ${stage.number}: входы`,
      ).toEqual(bySlide.inputs.map((node) => node.id).sort());
      expect(
        byPosition.outputs.map((node) => node.id).sort(),
        `этап ${stage.number}: выходы`,
      ).toEqual(bySlide.outputs.map((node) => node.id).sort());
    }
  });
});
