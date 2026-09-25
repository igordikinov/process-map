import { describe, expect, it } from 'vitest';
import {
  ProcessMapSchema,
  validateIntegrity,
  type Edge,
  type ProcessMap,
  type ProcessNode,
  type Stage,
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

  // ─────────────── код системы NRM (карта inplan, process-map-9mn.32) ───────────────

  it('принимает код системы NRM в ExternalIO и у узла', () => {
    // Внешняя система модуля DP на карте inplan (решение владельца
    // process-map-9mn.31, п. 6). Закрытое перечисление без него отвергло бы
    // весь документ, а не одну строку.
    const map = buildSampleProcessMap();
    const stage = map.stages[0]!;
    stage.inputs[0]!.system = 'NRM';
    stage.nodes[0]!.system = 'NRM';
    const parsed = ProcessMapSchema.parse(map);
    expect(parsed.stages[0]?.inputs[0]?.system).toBe('NRM');
    expect(parsed.stages[0]?.nodes[0]?.system).toBe('NRM');
  });
});

// ──────────── обзорное ребро «система → система» (process-map-9ow) ────────────

describe('validateIntegrity: хотя бы один конец обзорного ребра — этап', () => {
  // Каждый конец по отдельности законен (коды систем взяты из ExternalIO
  // фикстуры), поэтому до 9ow такое ребро проезжало молча: проверки «source —
  // этап или система» и «target — этап или система» его не видят.
  it('находит обзорное ребро «система → система»', () => {
    const map: ProcessMap = ProcessMapSchema.parse(buildSampleProcessMap());
    const codesInIO = new Set(
      map.stages.flatMap((stage) => [...stage.inputs, ...stage.outputs]).map((io) => io.system),
    );
    expect(codesInIO.has('DP') && codesInIO.has('PS'), 'оба кода есть в ExternalIO').toBe(true);

    map.overviewEdges.push({
      id: 'system-to-system',
      source: 'DP',
      target: 'PS',
      kind: 'integration',
    });
    const problems = validateIntegrity(map);
    // Ровно одна строка про это ребро, и именно эта: проверки концов по
    // отдельности его не отвергают, так что красным здесь горит только 9ow.
    expect(problems.filter((problem) => problem.includes('system-to-system'))).toEqual([
      'Ребро обзора "system-to-system": ни один конец не является этапом ("DP" → "PS")',
    ]);
  });

  it('рёбра «система → этап» и «этап → система» остаются законными', () => {
    const map: ProcessMap = ProcessMapSchema.parse(buildSampleProcessMap());
    expect(map.overviewEdges.some((edge) => edge.source === 'DP')).toBe(true);
    expect(map.overviewEdges.some((edge) => edge.target === 'PS')).toBe(true);
    expect(validateIntegrity(map)).toEqual([]);
  });
});

// ──────────────── подробность под шагом (NodeType 'detail', 9mn.32) ────────────────

/*
 * Этап 1 двухуровневой фикстуры с одной ЗАКОННОЙ подробностью: ребро «шаг →
 * подробность» вида 'data'. Каждый тест ниже портит ровно одно свойство, и
 * каждое — своим сообщением: иначе выключенная ветка проверки пряталась бы за
 * соседней, сработавшей на той же порче.
 *
 * Узлы фикстуры: node-1 — шаг, node-2 — данные, node-3 — шаг (sample-process.ts).
 */
const DETAIL_ID = 'stage-1-detail';
const DETAIL_EDGE_ID = 'stage-1-edge-detail';
const STEP_ID = 'stage-1-node-1';
const SECOND_STEP_ID = 'stage-1-node-3';
const DATA_ID = 'stage-1-node-2';

function mapWithDetail(): { map: ProcessMap; stage: Stage } {
  const map: ProcessMap = ProcessMapSchema.parse(buildSampleProcessMap());
  const stage = map.stages[0]!;
  expect(stage.nodes.find((node) => node.id === STEP_ID)?.type, 'шаг').toBe('step');
  expect(stage.nodes.find((node) => node.id === SECOND_STEP_ID)?.type, 'второй шаг').toBe('step');
  expect(stage.nodes.find((node) => node.id === DATA_ID)?.type, 'данные').toBe('data');
  stage.nodes.push({
    id: DETAIL_ID,
    type: 'detail',
    label: 'Первый абзац\nВторой абзац',
    position: { x: 120, y: 160 },
  });
  stage.edges.push({ id: DETAIL_EDGE_ID, source: STEP_ID, target: DETAIL_ID, kind: 'data' });
  return { map, stage };
}

function detailEdge(stage: Stage): Edge {
  const edge = stage.edges.find((candidate) => candidate.id === DETAIL_EDGE_ID);
  if (edge === undefined) {
    throw new Error('ребро подробности пропало из фикстуры');
  }
  return edge;
}

describe('validateIntegrity: подробность висит ровно на одном узле потока', () => {
  it('законная подробность не даёт проблем, а её текст переживает разбор', () => {
    // Позитивная опора для всех негативных тестов ниже: краснеет она — красное
    // в остальных ничего не доказывает.
    const { map } = mapWithDetail();
    expect(validateIntegrity(map)).toEqual([]);
    const reparsed = ProcessMapSchema.parse(map);
    expect(reparsed.stages[0]?.nodes.find((node) => node.id === DETAIL_ID)?.label).toBe(
      'Первый абзац\nВторой абзац',
    );
  });

  // Правило — «источник НЕ 'data' и НЕ 'detail'», а не «источник — 'step'».
  // Опора выше вешает подробность только на шаг, и ужесточение до «только
  // шаг» проходило весь корпус (проверено мутацией), хотя отвергло бы законные
  // данные: на слайдах L2 подробность бывает и под интеграцией («Передача в
  // NRM …»). Поэтому каждый прочий тип узла потока — своим случаем.
  it.each(['integration', 'warning', 'gateway', 'event', 'subprocess'] as const)(
    'подробность под узлом потока типа %s законна',
    (type) => {
      const { map, stage } = mapWithDetail();
      const source = stage.nodes.find((node) => node.id === STEP_ID);
      if (source === undefined) {
        throw new Error('шаг пропал из фикстуры');
      }
      source.type = type;
      // Через схему: перетипированный узел обязан остаться валидным узлом, иначе
      // пустой список проблем ничего бы не доказывал.
      expect(validateIntegrity(ProcessMapSchema.parse(map))).toEqual([]);
    },
  );

  it('находит подробность без входящего ребра', () => {
    const { map, stage } = mapWithDetail();
    stage.edges = stage.edges.filter((edge) => edge.id !== DETAIL_EDGE_ID);
    expect(validateIntegrity(map)).toEqual([
      'Подробность "stage-1-detail" (этап "stage-1") не привязана ни к одному узлу: входящих рёбер нет',
    ]);
  });

  it('находит подробность с двумя входящими рёбрами', () => {
    // Оба ребра по отдельности законны — от шага и вида 'data', — поэтому
    // сработать может только проверка числа.
    const { map, stage } = mapWithDetail();
    stage.edges.push({
      id: 'stage-1-edge-detail-2',
      source: SECOND_STEP_ID,
      target: DETAIL_ID,
      kind: 'data',
    });
    expect(validateIntegrity(map)).toEqual([
      'Подробность "stage-1-detail" (этап "stage-1") привязана сразу к нескольким узлам: ' +
        'входящих рёбер 2 ("stage-1-edge-detail", "stage-1-edge-detail-2")',
    ]);
  });

  it('находит входящее ребро не вида data', () => {
    const { map, stage } = mapWithDetail();
    detailEdge(stage).kind = 'process';
    expect(validateIntegrity(map)).toEqual([
      'Подробность "stage-1-detail" (этап "stage-1"): входящее ребро "stage-1-edge-detail" ' +
        'вида "process", а не "data"',
    ]);
  });

  it('находит подробность, привязанную к узлу данных', () => {
    const { map, stage } = mapWithDetail();
    detailEdge(stage).source = DATA_ID;
    expect(validateIntegrity(map)).toEqual([
      'Подробность "stage-1-detail" (этап "stage-1"): входящее ребро "stage-1-edge-detail" ' +
        'идёт от узла "stage-1-node-2" типа "data" — подробность крепится к узлу потока',
    ]);
  });

  it('находит подробность, привязанную к другой подробности', () => {
    // Вторая подробность сама законна (висит на шаге), и её исходящее ребро —
    // отдельная ошибка со своим сообщением. Тест требует обе строки, чтобы
    // ветка «источник — подробность» не зеленела за счёт соседней.
    const { map, stage } = mapWithDetail();
    stage.nodes.push({
      id: 'stage-1-detail-2',
      type: 'detail',
      label: 'Другая подробность',
      position: { x: 360, y: 160 },
    });
    stage.edges.push({
      id: 'stage-1-edge-detail-2',
      source: SECOND_STEP_ID,
      target: 'stage-1-detail-2',
      kind: 'data',
    });
    detailEdge(stage).source = 'stage-1-detail-2';
    const problems = validateIntegrity(map);
    expect(problems).toContain(
      'Подробность "stage-1-detail" (этап "stage-1"): входящее ребро "stage-1-edge-detail" ' +
        'идёт от узла "stage-1-detail-2" типа "detail" — подробность крепится к узлу потока',
    );
    expect(problems).toContain(
      'Подробность "stage-1-detail-2" (этап "stage-1"): исходящее ребро "stage-1-edge-detail" ' +
        '— у подробности исходящих не бывает',
    );
    expect(problems).toHaveLength(2);
  });

  it('находит исходящее ребро подробности', () => {
    const { map, stage } = mapWithDetail();
    stage.edges.push({
      id: 'stage-1-edge-from-detail',
      source: DETAIL_ID,
      target: SECOND_STEP_ID,
      kind: 'process',
    });
    expect(validateIntegrity(map)).toEqual([
      'Подробность "stage-1-detail" (этап "stage-1"): исходящее ребро "stage-1-edge-from-detail" ' +
        '— у подробности исходящих не бывает',
    ]);
  });
});
