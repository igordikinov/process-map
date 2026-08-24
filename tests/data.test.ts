import { describe, expect, it } from 'vitest';
import { ProcessMapSchema, validateIntegrity, type ProcessMap, type ProcessNode } from '../src/data/schema.ts';
import { buildSampleProcessMap } from './fixtures/sample-process.ts';
import processJson from '../src/data/process.json';
import requiredNodeIds from './fixtures/required-nodes.json';

// Источник данных для позитивных тестов схемы/целостности — реальный
// src/data/process.json, сгенерированный scripts/import-pptx.py из презентации
// (задача process-map-np4). Фикстура buildSampleProcessMap остаётся для
// негативных кейсов, где документ намеренно портится.
function loadProcessMap(): unknown {
  return processJson;
}

describe('ProcessMapSchema', () => {
  it('парсит валидные данные без ошибок', () => {
    expect(() => ProcessMapSchema.parse(loadProcessMap())).not.toThrow();
  });

  it('содержит не менее 40 узлов суммарно по всем этапам', () => {
    const map = ProcessMapSchema.parse(loadProcessMap());
    const totalNodes = map.stages.reduce((sum, stage) => sum + stage.nodes.length, 0);
    expect(totalNodes).toBeGreaterThanOrEqual(40);
  });

  it('не содержит проблем ссылочной целостности', () => {
    const map = ProcessMapSchema.parse(loadProcessMap());
    expect(validateIntegrity(map)).toEqual([]);
  });

  it('id узлов уникальны глобально по всему документу', () => {
    const map = ProcessMapSchema.parse(loadProcessMap());
    const ids = map.stages.flatMap((stage) => stage.nodes.map((node) => node.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('содержит все обязательные id узлов из tests/fixtures/required-nodes.json', () => {
    const map = ProcessMapSchema.parse(loadProcessMap());
    const present = new Set(map.stages.flatMap((stage) => stage.nodes.map((node) => node.id)));
    expect(requiredNodeIds.length).toBeGreaterThanOrEqual(40);
    const missing = requiredNodeIds.filter((id) => !present.has(id));
    expect(missing).toEqual([]);
  });

  it('отвергает узел без обязательного position', () => {
    const map = buildSampleProcessMap();
    const stage = map.stages[0];
    const node = stage?.nodes[0];
    expect(stage && node).toBeTruthy();
    const withoutPosition: Partial<ProcessNode> = { ...(node as ProcessNode) };
    delete withoutPosition.position;
    stage!.nodes[0] = withoutPosition as unknown as ProcessNode;
    expect(() => ProcessMapSchema.parse(map)).toThrow();
  });

  it('отвергает keyOutputs из более чем 3 элементов', () => {
    const map = buildSampleProcessMap();
    const stage = map.stages[0];
    expect(stage).toBeTruthy();
    stage!.keyOutputs = ['A', 'B', 'C', 'D'];
    expect(() => ProcessMapSchema.parse(map)).toThrow();
  });

  it('validateIntegrity находит ребро с несуществующим target', () => {
    const map: ProcessMap = ProcessMapSchema.parse(buildSampleProcessMap());
    const stage = map.stages[0];
    expect(stage).toBeTruthy();
    stage!.edges.push({
      id: 'broken-edge',
      source: stage!.nodes[0]!.id,
      target: 'does-not-exist',
      kind: 'process',
    });
    const problems = validateIntegrity(map);
    expect(problems.length).toBeGreaterThan(0);
    expect(problems.some((p) => p.includes('does-not-exist'))).toBe(true);
  });

  it('validateIntegrity находит ребро этапа, ссылающееся на узел чужого этапа', () => {
    const map: ProcessMap = ProcessMapSchema.parse(buildSampleProcessMap());
    const [first, second] = map.stages;
    expect(first).toBeTruthy();
    expect(second).toBeTruthy();
    const foreignNodeId = second!.nodes[0]!.id;
    first!.edges.push({
      id: 'cross-stage-edge',
      source: first!.nodes[0]!.id,
      target: foreignNodeId,
      kind: 'process',
    });
    const problems = validateIntegrity(map);
    expect(problems.some((p) => p.includes(foreignNodeId))).toBe(true);
  });

  it('validateIntegrity находит дублирующийся id ребра', () => {
    const map: ProcessMap = ProcessMapSchema.parse(buildSampleProcessMap());
    const stage = map.stages[0];
    expect(stage).toBeTruthy();
    const existing = stage!.edges[0];
    expect(existing).toBeTruthy();
    stage!.edges.push({ ...existing! });
    const problems = validateIntegrity(map);
    expect(problems.some((p) => p.includes('Дублирующийся id ребра'))).toBe(true);
  });
});
