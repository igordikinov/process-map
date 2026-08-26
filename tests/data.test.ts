import { describe, expect, it } from 'vitest';
import {
  ProcessMapSchema,
  validateIntegrity,
  type ProcessMap,
  type ProcessNode,
} from '../src/data/schema.ts';
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

  it('принимает узел без slidePosition: поле необязательное', () => {
    // Совместимость: файлы, собранные до появления поля, и экспорт стороннего
    // инструмента остаются валидными (SPEC §3).
    const map = buildSampleProcessMap();
    const node = map.stages[0]?.nodes[0];
    expect(node).toBeTruthy();
    expect(node!.slidePosition).toBeUndefined();
    expect(() => ProcessMapSchema.parse(map)).not.toThrow();
  });

  it('отвергает slidePosition неверной формы', () => {
    const map = buildSampleProcessMap();
    const node = map.stages[0]?.nodes[0];
    expect(node).toBeTruthy();
    node!.slidePosition = { x: 1, y: 'верх' } as unknown as { x: number; y: number };
    expect(() => ProcessMapSchema.parse(map)).toThrow();
  });

  it('сохраняет slidePosition при разборе: поле не вычищается схемой', () => {
    // Если бы zod его отбрасывал, экспорт из приложения перестал бы совпадать с
    // src/data/process.json побайтово (см. tests/loader.test.ts).
    const map = buildSampleProcessMap();
    const node = map.stages[0]?.nodes[0];
    expect(node).toBeTruthy();
    node!.slidePosition = { x: 12, y: 34 };
    const parsed = ProcessMapSchema.parse(map);
    expect(parsed.stages[0]?.nodes[0]?.slidePosition).toEqual({ x: 12, y: 34 });
  });

  // --- direction у data-узлов (SPEC §3, задача process-map-24p) ----------------

  it('у каждого data-узла проставлено direction, и только у data-узлов', () => {
    // Импортёр знает направление точно (по происхождению фигуры), поэтому
    // «поле опционально» относится к чужим документам, а не к нашему файлу:
    // здесь оно обязано стоять у всех 100% data-узлов. Если проставлять его
    // перестанут, splitStageDataNodes молча откатится на геометрию и вернёт
    // ноль выходов у этапов 1 и 2 — ровно тот дефект, который чинил 24p.
    const map = ProcessMapSchema.parse(loadProcessMap());
    const nodes = map.stages.flatMap((stage) => stage.nodes);
    const data = nodes.filter((node) => node.type === 'data');

    expect(data.length).toBeGreaterThan(0);
    expect(data.filter((node) => node.direction === undefined).map((node) => node.id)).toEqual([]);
    expect(
      nodes.filter((node) => node.type !== 'data' && node.direction !== undefined).map((n) => n.id),
    ).toEqual([]);
  });

  it('у каждого этапа есть и входы, и выходы', () => {
    // Регрессия 24p: у этапов 1 и 2 геометрическое правило давало ноль выходов
    // при 2–3 ключевых выходах на карточке обзора — экран противоречил сам себе.
    const map = ProcessMapSchema.parse(loadProcessMap());
    for (const stage of map.stages) {
      const data = stage.nodes.filter((node) => node.type === 'data');
      expect(
        data.filter((node) => node.direction === 'in').length,
        `этап ${stage.number}: входы`,
      ).toBeGreaterThan(0);
      expect(
        data.filter((node) => node.direction === 'out').length,
        `этап ${stage.number}: выходы`,
      ).toBeGreaterThan(0);
    }
  });

  it('принимает узел без direction: поле необязательное', () => {
    const map = buildSampleProcessMap();
    const node = map.stages[0]?.nodes[0];
    expect(node).toBeTruthy();
    expect(node!.direction).toBeUndefined();
    expect(() => ProcessMapSchema.parse(map)).not.toThrow();
  });

  it('отвергает direction вне in|out', () => {
    const map = buildSampleProcessMap();
    const node = map.stages[0]?.nodes[0];
    expect(node).toBeTruthy();
    node!.direction = 'left' as unknown as 'in';
    expect(() => ProcessMapSchema.parse(map)).toThrow();
  });

  it('сохраняет direction при разборе: поле не вычищается схемой', () => {
    // Как и slidePosition: если бы zod его отбрасывал, экспорт из приложения
    // перестал бы совпадать с src/data/process.json побайтово.
    const map = buildSampleProcessMap();
    const node = map.stages[0]?.nodes[0];
    expect(node).toBeTruthy();
    node!.direction = 'out';
    const parsed = ProcessMapSchema.parse(map);
    expect(parsed.stages[0]?.nodes[0]?.direction).toBe('out');
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
