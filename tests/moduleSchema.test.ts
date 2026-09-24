// Модули: механика ModuleSchema и новые инварианты validateIntegrity
// (задача process-map-9mn.9, эпик M8 — трёхуровневая карта).
//
// ПОЧЕМУ ОТДЕЛЬНЫЙ ФАЙЛ, А НЕ tests/data.test.ts. Тот файл гоняет схему по
// ДВУХУРОВНЕВОЙ фикстуре, и все его проверки остаются верными ровно потому, что
// поле modules необязательное. Трёхуровневой карте нужна своя сборка, и
// смешивать их в одном файле значило бы к каждому тесту дописывать, про какую
// из двух карт он. Общая фикстура трёхуровневой карты появится задачей
// process-map-9mn.11 — тогда локальный сборщик ниже уедет туда; здесь он
// минимальный, чтобы не предвосхищать её форму.
//
// Реальные карты на диске этот файл не читает — это делает
// tests/mapContract.test.ts (SPEC §7: механика схемы отдельно от данных).
import { describe, expect, it } from 'vitest';
import {
  ModuleSchema,
  ProcessMapSchema,
  validateIntegrity,
  type Module,
  type ProcessMap,
} from '../src/data/schema.ts';
import { buildSampleProcessMap } from './fixtures/sample-process.ts';

const MODULE_A = 'demand-planning';
const MODULE_B = 'supply-planning';

/*
 * Коды систем для рёбер уровня 1 берутся ВНЕ множества, которое двухуровневая
 * фикстура раскладывает по ExternalIO (SYSTEM_CODES = DP, PS, IO, ERP в
 * tests/fixtures/sample-process.ts). Это не придирка к красоте: концы
 * moduleEdges сверяются с ПЕРЕЧИСЛЕНИЕМ SystemCodeSchema, а не с кодами,
 * встреченными в ExternalIO, — и код из пересечения двух множеств не отличает
 * одну реализацию от другой. С 'ERP' подмена проверки на `systemCodes.has`
 * оставляла все тесты зелёными; с 'BI' и 'EPM' — краснеет. Сторожит это
 * отдельный тест ниже, а не только комментарий.
 */
const SYSTEM_OUTSIDE_IO = 'BI';
const SYSTEM_OUTSIDE_IO_2 = 'EPM';

/**
 * Трёхуровневая карта из двухуровневой фикстуры: четыре этапа режутся на два
 * модуля по два. Обзорное ребро stage-2 → stage-3 при этом удаляется — в
 * двухуровневой карте оно законно, а здесь пересекает границу модулей, и на
 * уровне 1 его выражает module-edge-1.
 */
function buildThreeLevelMap(): ProcessMap {
  const map = buildSampleProcessMap();
  map.modules = [
    {
      id: MODULE_A,
      number: 1,
      title: 'Планирование спроса',
      shortTitle: 'DP · Планирование спроса',
      label: 'Модуль DP',
      keyOutputs: ['Согласованный прогноз'],
      stageIds: ['stage-1', 'stage-2'],
    },
    {
      id: MODULE_B,
      number: 2,
      title: 'Планирование сети поставок',
      shortTitle: 'SNP · Планирование сети поставок',
      label: 'Модуль SNP',
      keyOutputs: [],
      stageIds: ['stage-3', 'stage-4'],
    },
  ];
  map.moduleEdges = [
    {
      id: 'module-edge-1',
      source: MODULE_A,
      target: MODULE_B,
      kind: 'process',
      label: 'Итоговый неограниченный прогноз',
    },
    { id: 'module-edge-2', source: SYSTEM_OUTSIDE_IO, target: MODULE_A, kind: 'integration' },
  ];
  map.overviewEdges = map.overviewEdges.filter((edge) => edge.id !== 'overview-edge-2');
  return map;
}

describe('ModuleSchema', () => {
  it('фикстура трёхуровневой карты разбирается и целостна', () => {
    // Позитивная опора для всех негативных тестов ниже: если краснеет она,
    // красное в остальных ничего не доказывает.
    const map = buildThreeLevelMap();
    expect(() => ProcessMapSchema.parse(map)).not.toThrow();
    expect(validateIntegrity(ProcessMapSchema.parse(map))).toEqual([]);
  });

  it('карта без modules остаётся валидной: поле необязательное', () => {
    // Ровно это оставляет три существующих process.json (snp, mrp,
    // inplan-model) валидными без единой правки.
    const map = buildSampleProcessMap();
    expect(map.modules).toBeUndefined();
    expect(() => ProcessMapSchema.parse(map)).not.toThrow();
    expect(validateIntegrity(ProcessMapSchema.parse(map))).toEqual([]);
  });

  it('не дописывает отсутствующие modules и moduleEdges в разобранную карту', () => {
    // То же ключевое свойство, что у необязательных полей узла: zod не
    // добавляет отсутствующие ключи, поэтому расширение схемы не меняет ни
    // байта в экспорте двухуровневых карт (serializeProcessMap нормализует
    // порядок ключей по схеме) и не трогает их отпечаток.
    const parsed = ProcessMapSchema.parse(buildSampleProcessMap());
    expect('modules' in parsed).toBe(false);
    expect('moduleEdges' in parsed).toBe(false);
  });

  it('отвергает пустой список модулей: «модулей нет» выражается отсутствием поля', () => {
    // Иначе у документа два разных способа сказать одно и то же и два места,
    // где их надо различать.
    const map = buildThreeLevelMap();
    map.modules = [];
    expect(() => ProcessMapSchema.parse(map)).toThrow();
  });

  it('принимает единственный модуль: уровень 1 с одной карточкой законен', () => {
    const map = buildThreeLevelMap();
    map.modules = [
      { ...(map.modules![0] as Module), stageIds: ['stage-1', 'stage-2', 'stage-3', 'stage-4'] },
    ];
    map.moduleEdges = [];
    const parsed = ProcessMapSchema.parse(map);
    expect(validateIntegrity(parsed)).toEqual([]);
  });

  it('отвергает модуль без единой фазы', () => {
    const map = buildThreeLevelMap();
    map.modules![0]!.stageIds = [];
    expect(() => ProcessMapSchema.parse(map)).toThrow();
  });

  it('отвергает id модуля вне kebab-case: он попадает в ?module=<id>', () => {
    const map = buildThreeLevelMap();
    map.modules![0]!.id = 'Планирование спроса';
    expect(() => ProcessMapSchema.parse(map)).toThrow();
  });

  it('отвергает keyOutputs модуля из более чем четырёх пунктов, но принимает пустой', () => {
    // Верхняя граница как у этапа; нижней нет — у MRP на слайде обзора
    // выходного артефакта нет вовсе (process-map-9mn.5).
    const module = buildThreeLevelMap().modules![0]!;
    expect(() => ModuleSchema.parse({ ...module, keyOutputs: [] }), 'пусто').not.toThrow();
    expect(
      () => ModuleSchema.parse({ ...module, keyOutputs: ['A', 'B', 'C', 'D'] }),
      'четыре',
    ).not.toThrow();
    expect(
      () => ModuleSchema.parse({ ...module, keyOutputs: ['A', 'B', 'C', 'D', 'E'] }),
      'пять',
    ).toThrow();
  });

  it('сохраняет label ребра модулей: артефакт между модулями живёт именно там', () => {
    // Артефакт со слайда 1 — это Edge.label, а не ExternalIO, и
    // SystemCodeSchema под него не расширяется. Если бы zod вычищал label,
    // подпись связи уровня 1 исчезла бы при экспорте.
    const parsed = ProcessMapSchema.parse(buildThreeLevelMap());
    expect(parsed.moduleEdges?.[0]?.label).toBe('Итоговый неограниченный прогноз');
  });
});

describe('validateIntegrity: модули', () => {
  it('находит ссылку модуля на несуществующий этап', () => {
    const map = ProcessMapSchema.parse(buildThreeLevelMap());
    map.modules![0]!.stageIds.push('stage-99');
    const problems = validateIntegrity(map);
    expect(problems.some((problem) => problem.includes('stage-99'))).toBe(true);
  });

  it('находит этап, заявленный сразу двумя модулями', () => {
    const map = ProcessMapSchema.parse(buildThreeLevelMap());
    map.modules![1]!.stageIds.push('stage-1');
    const problems = validateIntegrity(map);
    expect(problems.some((problem) => problem.includes('двумя модулями'))).toBe(true);
    expect(problems.some((problem) => problem.includes('stage-1'))).toBe(true);
  });

  it('различает повтор этапа ВНУТРИ одного модуля', () => {
    // Диагноз обязан отличаться от «заявлен двумя модулями»: иначе читатель
    // пойдёт искать второй модуль, которого нет.
    const map = ProcessMapSchema.parse(buildThreeLevelMap());
    map.modules![0]!.stageIds.push('stage-1');
    const problems = validateIntegrity(map);
    expect(problems.some((problem) => problem.includes('заявляет этап "stage-1" дважды'))).toBe(
      true,
    );
    expect(problems.some((problem) => problem.includes('двумя модулями'))).toBe(false);
  });

  it('находит дублирующийся id модуля', () => {
    // Проверка живёт здесь, а не в tests/mapContract.test.ts, потому что карту
    // приносит не только диск: загруженную пользователем модель BPMN разбирает
    // src/data/bpmn/adapter.ts, и весь её контроль — схема плюс эта функция.
    const map = ProcessMapSchema.parse(buildThreeLevelMap());
    map.modules![1]!.id = MODULE_A;
    const problems = validateIntegrity(map);
    expect(problems.some((problem) => problem.includes('Дублирующийся id модуля'))).toBe(true);
  });

  it('находит дублирующийся номер модуля', () => {
    const map = ProcessMapSchema.parse(buildThreeLevelMap());
    map.modules![1]!.number = map.modules![0]!.number;
    const problems = validateIntegrity(map);
    expect(problems.some((problem) => problem.includes('Дублирующийся номер модуля'))).toBe(true);
  });

  it('дыра в номерах модулей законна: проверяется уникальность, а не сплошность', () => {
    // Карта берёт пять модулей презентации из восьми (process-map-9mn: без TPM
    // и DRP/TLB) и имеет право сохранить исходную нумерацию.
    const map = ProcessMapSchema.parse(buildThreeLevelMap());
    map.modules![1]!.number = 7;
    expect(validateIntegrity(map)).toEqual([]);
  });

  it('находит этап-сироту: не заявлен ни одним модулем', () => {
    // Схема такое пропустит по построению: stageIds — ссылки, и ничто в типе
    // не требует, чтобы они покрыли весь stages. Этап при этом исчез бы с
    // экранов целиком.
    const map = ProcessMapSchema.parse(buildThreeLevelMap());
    map.modules![1]!.stageIds = ['stage-3'];
    const problems = validateIntegrity(map);
    expect(problems.some((problem) => problem.includes('stage-4'))).toBe(true);
    expect(problems.some((problem) => problem.includes('не заявлен ни одним модулем'))).toBe(true);
  });

  it('находит обзорное ребро между этапами разных модулей', () => {
    const map = ProcessMapSchema.parse(buildThreeLevelMap());
    map.overviewEdges.push({
      id: 'cross-module-edge',
      source: 'stage-2',
      target: 'stage-3',
      kind: 'process',
    });
    const problems = validateIntegrity(map);
    expect(problems.some((problem) => problem.includes('разных модулей'))).toBe(true);
  });

  it('обзорное ребро «система → этап» остаётся законным при модулях', () => {
    // Конец-система ничьему модулю не принадлежит, и сравнивать его модуль не с
    // чем: свимлейны уровня 1 — это внешние системы, а не узлы графа.
    const map = ProcessMapSchema.parse(buildThreeLevelMap());
    expect(map.overviewEdges.some((edge) => edge.source === 'DP')).toBe(true);
    expect(validateIntegrity(map)).toEqual([]);
  });

  it('у двухуровневой карты проверка «этапы одного модуля» молчит', () => {
    // Фикстура без модулей содержит ребро stage-2 → stage-3 — именно то, что в
    // трёхуровневой карте является ошибкой. Проверка обязана включаться
    // наличием modules, иначе задача сломала бы все существующие карты.
    const map = ProcessMapSchema.parse(buildSampleProcessMap());
    expect(map.overviewEdges.some((edge) => edge.id === 'overview-edge-2')).toBe(true);
    expect(validateIntegrity(map)).toEqual([]);
  });

  it('находит конец ребра модулей, который не является ни модулем, ни системой', () => {
    // Этап — законный конец обзорного ребра, но не ребра уровня 1: этапов на
    // уровне 1 нет.
    const map = ProcessMapSchema.parse(buildThreeLevelMap());
    map.moduleEdges!.push({
      id: 'broken-module-edge',
      source: MODULE_A,
      target: 'stage-1',
      kind: 'process',
    });
    const problems = validateIntegrity(map);
    expect(problems.some((problem) => problem.includes('broken-module-edge'))).toBe(true);
  });

  it('коды систем в тестах взяты вне ExternalIO фикстуры: иначе проверка слепа', () => {
    // Сторож предыдущего дефекта: код, встреченный в ExternalIO, проходит и по
    // перечислению, и по множеству кодов карты, поэтому тестом на нём нельзя
    // отличить одну реализацию от другой. Если кто-то заменит константы на
    // 'ERP' или 'DP', покраснеет здесь, а не тихо развалится вся проверка.
    const map = buildThreeLevelMap();
    const codesInIO = new Set(
      map.stages.flatMap((stage) => [...stage.inputs, ...stage.outputs]).map((io) => io.system),
    );
    expect(codesInIO.has(SYSTEM_OUTSIDE_IO), SYSTEM_OUTSIDE_IO).toBe(false);
    expect(codesInIO.has(SYSTEM_OUTSIDE_IO_2), SYSTEM_OUTSIDE_IO_2).toBe(false);
  });

  it('принимает код системы концом ребра модулей', () => {
    const map = ProcessMapSchema.parse(buildThreeLevelMap());
    map.moduleEdges!.push({
      id: 'module-edge-system',
      source: MODULE_B,
      target: SYSTEM_OUTSIDE_IO_2,
      kind: 'integration',
    });
    expect(validateIntegrity(map)).toEqual([]);
  });

  it('находит ребро модулей, у которого ни один конец не модуль', () => {
    // Связь «система → система» на уровне 1 не соединяет ничего из
    // нарисованного: экран рисует модули, а системы существуют на нём только
    // как то, с чем модуль обменивается.
    const map = ProcessMapSchema.parse(buildThreeLevelMap());
    map.moduleEdges!.push({
      id: 'system-to-system',
      source: SYSTEM_OUTSIDE_IO,
      target: SYSTEM_OUTSIDE_IO_2,
      kind: 'integration',
    });
    const problems = validateIntegrity(map);
    expect(problems.some((problem) => problem.includes('system-to-system'))).toBe(true);
    expect(problems.some((problem) => problem.includes('ни один конец не является модулем'))).toBe(
      true,
    );
  });

  it('рёбра модулей в карте без модулей отказывают поимённо, а не молча не рисуются', () => {
    // Оба ребра обязаны быть названы, и по разным причинам: у первого концы не
    // существуют как модули, у второго они законны по отдельности (две
    // системы), но такое ребро на уровне 1 не соединяет ничего из
    // нарисованного. Без второй строки двухуровневый документ с рёбрами уровня
    // 1 частично проезжал бы молча.
    const map = ProcessMapSchema.parse(buildSampleProcessMap());
    map.moduleEdges = [
      { id: 'module-edge-orphan', source: MODULE_A, target: MODULE_B, kind: 'process' },
      {
        id: 'module-edge-systems',
        source: SYSTEM_OUTSIDE_IO,
        target: SYSTEM_OUTSIDE_IO_2,
        kind: 'integration',
      },
    ];
    const problems = validateIntegrity(map);
    expect(problems.some((problem) => problem.includes('module-edge-orphan'))).toBe(true);
    expect(problems.some((problem) => problem.includes('module-edge-systems'))).toBe(true);
  });

  it('id рёбер уникальны и между уровнями', () => {
    // React Flow рисует уровни на разных экранах, но id рёбер в документе
    // глобальны: совпадение id ребра уровня 1 с id обзорного ребра — ошибка
    // того же класса, что и совпадение внутри одного уровня.
    const map = ProcessMapSchema.parse(buildThreeLevelMap());
    const existing = map.overviewEdges[0]!;
    map.moduleEdges!.push({ ...existing, source: MODULE_A, target: MODULE_B });
    const problems = validateIntegrity(map);
    expect(problems.some((problem) => problem.includes('Дублирующийся id ребра'))).toBe(true);
  });
});
