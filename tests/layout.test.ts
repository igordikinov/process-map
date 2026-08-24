import { describe, expect, it } from 'vitest';
import { ProcessMapSchema, validateIntegrity, type Stage } from '../src/data/schema.ts';
import {
  NODE_SIZE,
  countOverlappingPairs,
  countStageOverlaps,
  layoutStage,
  rectOf,
} from '../scripts/layout.ts';
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
        expect(
          Number.isFinite(node.position.x),
          `${node.id}: x = ${node.position.x}`,
        ).toBe(true);
        expect(
          Number.isFinite(node.position.y),
          `${node.id}: y = ${node.position.y}`,
        ).toBe(true);
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

  it('координаты в файле совпадают с пересчётом (npm run layout идемпотентен)', () => {
    for (const stage of map.stages) {
      const first = layoutStage(stage);
      const second = layoutStage(stage);
      for (const node of stage.nodes) {
        const placement = first.get(node.id);
        expect(placement, `${node.id} не получил координат`).toBeDefined();
        expect(second.get(node.id)).toEqual(placement);
        expect(placement).toEqual(node.position);
      }
    }
  });

  it('содержание документа не изменилось: схема и ссылочная целостность в порядке', () => {
    expect(validateIntegrity(map)).toEqual([]);
    const totalNodes = map.stages.reduce((sum, stage) => sum + stage.nodes.length, 0);
    expect(totalNodes).toBeGreaterThanOrEqual(40);
  });
});
