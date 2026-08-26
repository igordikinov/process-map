// Единственный источник правила «вход или выход» — src/utils/stageNodes.ts.
// Его читают раскладка (scripts/layout.ts), счётчик в крошках и экран
// детализации, поэтому у правила должен быть собственный тест, а не только
// косвенная проверка через графы.
//
// Проверяется ровно то, ради чего задача process-map-24p затевалась:
// направление задаёт поле `direction`, а НЕ координата. Тесты строят узлы, у
// которых поле и геометрия противоречат друг другу, — иначе обе ветки
// неотличимы (в реальном process.json они совпадают, потому что раскладка сама
// расставляет колонки по этому же правилу).
import { describe, expect, it } from 'vitest';
import type { ProcessNode, Stage } from '../src/data/schema.ts';
import { countStageNodes, splitStageDataNodes } from '../src/utils/stageNodes.ts';

function node(id: string, x: number, extra: Partial<ProcessNode> = {}): ProcessNode {
  return { id, type: 'data', label: id, position: { x, y: 0 }, ...extra };
}

/** Этап с потоком из двух шагов: середина области шагов — x = 100. */
function stageWith(...data: ProcessNode[]): Stage {
  return {
    id: 'stage-1',
    number: 1,
    title: 'Этап 1',
    shortTitle: 'Этап 1',
    keyOutputs: [],
    groups: [],
    nodes: [
      node('flow-left', 0, { type: 'step' }),
      node('flow-right', 200, { type: 'step' }),
      ...data,
    ],
    edges: [],
    inputs: [],
    outputs: [],
  };
}

describe('splitStageDataNodes', () => {
  it('direction главнее геометрии: узел слева с direction=out попадает в выходы', () => {
    const stage = stageWith(node('left-but-out', 0, { direction: 'out' }));
    const split = splitStageDataNodes(stage);
    expect(split.outputs.map((n) => n.id)).toEqual(['left-but-out']);
    expect(split.inputs).toEqual([]);
  });

  it('direction главнее геометрии: узел справа с direction=in попадает во входы', () => {
    const stage = stageWith(node('right-but-in', 1000, { direction: 'in' }));
    const split = splitStageDataNodes(stage);
    expect(split.inputs.map((n) => n.id)).toEqual(['right-but-in']);
    expect(split.outputs).toEqual([]);
  });

  it('без direction работает прежнее геометрическое правило (старые документы)', () => {
    // Совместимость: документ, собранный до появления поля, или экспорт
    // стороннего инструмента (SPEC §4.7) обязан раскладываться как раньше.
    const stage = stageWith(node('legacy-left', 10), node('legacy-right', 190));
    const split = splitStageDataNodes(stage);
    expect(split.inputs.map((n) => n.id)).toEqual(['legacy-left']);
    expect(split.outputs.map((n) => n.id)).toEqual(['legacy-right']);
  });

  it('фолбэк применяется поузлово: соседний direction на него не влияет', () => {
    const stage = stageWith(
      node('legacy-left', 10),
      node('left-but-out', 20, { direction: 'out' }),
      node('legacy-right', 190),
    );
    const split = splitStageDataNodes(stage);
    expect(split.inputs.map((n) => n.id)).toEqual(['legacy-left']);
    expect(split.outputs.map((n) => n.id)).toEqual(['left-but-out', 'legacy-right']);
  });

  it('без узлов потока делить нечем: узлы без direction уходят во входы', () => {
    const stage: Stage = { ...stageWith(), nodes: [node('a', 0), node('b', 500)] };
    const split = splitStageDataNodes(stage);
    expect(split.inputs.map((n) => n.id)).toEqual(['a', 'b']);
    expect(split.outputs).toEqual([]);
  });

  it('без узлов потока direction всё равно соблюдается', () => {
    const stage: Stage = {
      ...stageWith(),
      nodes: [node('a', 0, { direction: 'out' }), node('b', 500, { direction: 'in' })],
    };
    const split = splitStageDataNodes(stage);
    expect(split.inputs.map((n) => n.id)).toEqual(['b']);
    expect(split.outputs.map((n) => n.id)).toEqual(['a']);
  });

  it('countStageNodes считает поток как «всё, что не попало в колонки»', () => {
    const counts = countStageNodes(
      stageWith(node('in-1', 0, { direction: 'in' }), node('out-1', 0, { direction: 'out' })),
    );
    expect(counts).toEqual({ steps: 2, inputs: 1, outputs: 1 });
  });
});
