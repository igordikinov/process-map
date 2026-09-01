import { describe, expect, it } from 'vitest';
import {
  ProcessMapSchema,
  validateIntegrity,
  type ProcessMap,
  type ProcessNode,
} from '../src/data/schema.ts';
import { buildSampleProcessMap } from './fixtures/sample-process.ts';

// Механика схемы на синтетической фикстуре: что zod принимает, что отвергает и
// что сохраняет при разборе. Реальную карту этот файл НЕ читает намеренно
// (process-map-3wh.3) — проверки на настоящих данных живут в
// tests/mapContract.test.ts (общие для всех карт) и tests/snp/content.test.ts
// (только про SNP). Так тест схемы не падает от правки презентации, а правка
// презентации не диагностируется как поломка схемы.

describe('ProcessMapSchema', () => {
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
    // src/data/snp/process.json побайтово (см. tests/loader.test.ts).
    const map = buildSampleProcessMap();
    const node = map.stages[0]?.nodes[0];
    expect(node).toBeTruthy();
    node!.slidePosition = { x: 12, y: 34 };
    const parsed = ProcessMapSchema.parse(map);
    expect(parsed.stages[0]?.nodes[0]?.slidePosition).toEqual({ x: 12, y: 34 });
  });

  // --- direction у data-узлов (SPEC §3, задача process-map-24p) ----------------

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
    // перестал бы совпадать с src/data/snp/process.json побайтово.
    const map = buildSampleProcessMap();
    const node = map.stages[0]?.nodes[0];
    expect(node).toBeTruthy();
    node!.direction = 'out';
    const parsed = ProcessMapSchema.parse(map);
    expect(parsed.stages[0]?.nodes[0]?.direction).toBe('out');
  });

  it('отвергает keyOutputs из более чем 4 элементов', () => {
    // Лимит поднят с трёх до четырёх (process-map-24i): презентация перечисляет
    // у этапа 3 ровно четыре опубликованных плана, и третий пункт срезался.
    const map = buildSampleProcessMap();
    const stage = map.stages[0];
    expect(stage).toBeTruthy();
    stage!.keyOutputs = ['A', 'B', 'C', 'D'];
    expect(() => ProcessMapSchema.parse(map), 'четыре — ещё допустимо').not.toThrow();
    stage!.keyOutputs = ['A', 'B', 'C', 'D', 'E'];
    expect(() => ProcessMapSchema.parse(map), 'пять — уже нет').toThrow();
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
