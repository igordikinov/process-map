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

  // ────────────────── расширение под BPMN (process-map-70e.4) ──────────────────

  it('принимает типы узлов gateway, event и subprocess', () => {
    const map = buildSampleProcessMap();
    const node = map.stages[0]?.nodes[0];
    expect(node).toBeTruthy();
    for (const type of ['gateway', 'event', 'subprocess'] as const) {
      node!.type = type;
      expect(() => ProcessMapSchema.parse(map), type).not.toThrow();
    }
  });

  it('сохраняет уточнение вида шлюза и события', () => {
    const map = buildSampleProcessMap();
    const node = map.stages[0]?.nodes[0];
    expect(node).toBeTruthy();
    node!.type = 'gateway';
    node!.gatewayKind = 'exclusive';
    expect(ProcessMapSchema.parse(map).stages[0]?.nodes[0]?.gatewayKind).toBe('exclusive');

    node!.type = 'event';
    node!.gatewayKind = undefined;
    node!.eventKind = 'start';
    node!.eventDefinition = 'link';
    const parsed = ProcessMapSchema.parse(map).stages[0]?.nodes[0];
    expect(parsed?.eventKind).toBe('start');
    expect(parsed?.eventDefinition).toBe('link');
  });

  it('отвергает вид шлюза, которого нет в перечислении', () => {
    // Перечисление закрытое намеренно: разбор BPMN обязан сводить элементы
    // Camunda к известным значениям, а не изобретать новые в рантайме.
    const map = buildSampleProcessMap();
    const node = map.stages[0]?.nodes[0];
    (node as unknown as { gatewayKind: string }).gatewayKind = 'выдуманный';
    expect(() => ProcessMapSchema.parse(map)).toThrow();
  });

  /*
   * КЛЮЧЕВОЕ СВОЙСТВО, на котором держится совместимость: zod не добавляет
   * отсутствующие необязательные ключи в результат разбора. Именно поэтому
   * расширение схемы тремя полями не меняет ни байта в экспорте карт snp и mrp
   * и не трогает их отпечаток (tests/mapFingerprint.test.ts).
   */
  it('не дописывает отсутствующие уточнения в разобранный узел', () => {
    const parsed = ProcessMapSchema.parse(buildSampleProcessMap());
    const node = parsed.stages[0]?.nodes[0];
    expect(node).toBeTruthy();
    expect('gatewayKind' in node!).toBe(false);
    expect('eventKind' in node!).toBe(false);
    expect('eventDefinition' in node!).toBe(false);
  });

  it('число этапов больше не ограничено четырьмя, но номер обязан быть целым от 1', () => {
    // Этапы карты BPMN приходят из модулей файла: в модели владельца их 12,
    // из них непустых 10. Жёсткое 1|2|3|4 отвергало бы такой файл.
    const map = buildSampleProcessMap();
    const stage = map.stages[0];
    expect(stage).toBeTruthy();
    stage!.number = 12;
    expect(() => ProcessMapSchema.parse(map), 'двенадцатый этап').not.toThrow();
    stage!.number = 0;
    expect(() => ProcessMapSchema.parse(map), 'нулевого этапа не бывает').toThrow();
    stage!.number = 1.5;
    expect(() => ProcessMapSchema.parse(map), 'номер целый').toThrow();
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
