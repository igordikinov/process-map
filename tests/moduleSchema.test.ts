// Модули: механика ModuleSchema и новые инварианты validateIntegrity
// (задача process-map-9mn.9, эпик M8 — трёхуровневая карта).
//
// ПОЧЕМУ ОТДЕЛЬНЫЙ ФАЙЛ, А НЕ tests/data.test.ts. Тот файл гоняет схему по
// ДВУХУРОВНЕВОЙ фикстуре, и все его проверки остаются верными ровно потому, что
// поле modules необязательное. Трёхуровневой карте нужна своя сборка, и
// смешивать их в одном файле значило бы к каждому тесту дописывать, про какую
// из двух карт он.
//
// Сборка эта — общая и лежит в tests/fixtures/three-level-process.ts
// (задача process-map-9mn.11): на ней же будет стоять src/data/modules.ts.
// Локальный сборщик, живший здесь до 9mn.11, уехал туда и переписан — почему
// именно переписан, а не перенесён, написано в шапке фикстуры.
//
// Реальные карты на диске этот файл не читает — это делает
// tests/mapContract.test.ts (SPEC §7: механика схемы отдельно от данных).
import { describe, expect, it } from 'vitest';
import {
  ModuleSchema,
  ProcessMapSchema,
  SystemCodeSchema,
  validateIntegrity,
} from '../src/data/schema.ts';
import { buildSampleProcessMap } from './fixtures/sample-process.ts';
import {
  buildThreeLevelProcessMap,
  parseThreeLevelProcessMap,
  IO_SYSTEM_CODES,
  MODULE_DEMAND,
  MODULE_EDGE_LABEL,
  MODULE_IDS,
  MODULE_PRODUCTION,
  MODULE_STAGE_IDS,
  MODULE_SUPPLY,
  SYSTEM_OUTSIDE_IO,
  SYSTEM_OUTSIDE_IO_2,
  type ThreeLevelProcessMap,
} from './fixtures/three-level-process.ts';

/** Коды систем, реально разложенные фикстурой по stage.inputs/outputs. */
function systemCodesInExternalIO(map: ThreeLevelProcessMap): Set<string> {
  return new Set(
    map.stages.flatMap((stage) => [...stage.inputs, ...stage.outputs]).map((io) => io.system),
  );
}

describe('фикстура трёхуровневой карты', () => {
  // Свойства САМОЙ фикстуры. Они здесь не ради полноты: на каждом из них стоит
  // либо тест ниже, либо задача process-map-9mn.10, и молчаливая потеря любого
  // из них обессмысливает проверки, которые продолжают зеленеть.

  it('разбирается и целостна', () => {
    // Позитивная опора для всех негативных тестов ниже: если краснеет она,
    // красное в остальных ничего не доказывает.
    //
    // Она же — СТОРОЖ ГЛАВНОГО ТРЕБОВАНИЯ. Фикстура опирается рёбрами уровня 1
    // на коды систем, которых нет в её ExternalIO (см. тест ниже), поэтому
    // сверка концов moduleEdges с множеством встреченных кодов вместо
    // перечисления краснеет ПРЯМО ЗДЕСЬ, не дожидаясь отдельной проверки.
    const map = buildThreeLevelProcessMap();
    expect(() => ProcessMapSchema.parse(map)).not.toThrow();
    expect(validateIntegrity(ProcessMapSchema.parse(map))).toEqual([]);
  });

  it('опирается на коды систем, которых нет в её ExternalIO', () => {
    // Требование из ревью 9mn.9, и оно несущее. Концы moduleEdges сверяются с
    // ПЕРЕЧИСЛЕНИЕМ SystemCodeSchema, а не с кодами из ExternalIO. Код из
    // пересечения двух множеств не отличает одну реализацию от другой: с 'ERP'
    // подмена проверки на `systemCodes.has` оставляла зелёными все девятнадцать
    // тестов. Поэтому фикстура обязана ставить концами рёбер уровня 1 коды,
    // которых в её собственных свимлейнах нет.
    //
    // Проверяются обе стороны ребра: система источником и система приёмником.
    const map = parseThreeLevelProcessMap();
    const codesInIO = systemCodesInExternalIO(map);

    expect(
      map.moduleEdges.some((edge) => edge.source === SYSTEM_OUTSIDE_IO),
      'источник',
    ).toBe(true);
    expect(
      map.moduleEdges.some((edge) => edge.target === SYSTEM_OUTSIDE_IO_2),
      'приёмник',
    ).toBe(true);
    expect(codesInIO.has(SYSTEM_OUTSIDE_IO), SYSTEM_OUTSIDE_IO).toBe(false);
    expect(codesInIO.has(SYSTEM_OUTSIDE_IO_2), SYSTEM_OUTSIDE_IO_2).toBe(false);
  });

  it('коды «снаружи» — настоящие члены перечисления, а не выдуманные строки', () => {
    // Иначе положительные тесты про «код системы законный конец ребра модулей»
    // зеленели бы по неверной причине, а отрицательные краснели бы не на том:
    // 'ZZ' не проходит ни по одной реализации, и подменить им константу —
    // значит выключить проверку, не уронив ни одного теста.
    expect(SystemCodeSchema.safeParse(SYSTEM_OUTSIDE_IO).success, SYSTEM_OUTSIDE_IO).toBe(true);
    expect(SystemCodeSchema.safeParse(SYSTEM_OUTSIDE_IO_2).success, SYSTEM_OUTSIDE_IO_2).toBe(true);
  });

  it('объявленный список кодов ExternalIO совпадает с разложенным по этапам', () => {
    // Сторож объявления: свимлейн с новым кодом, добавленный мимо
    // IO_SYSTEM_CODES, сделал бы «снаружи» пустым понятием — и заметить это
    // было бы нечем, потому что все существующие тесты остались бы зелёными.
    const map = parseThreeLevelProcessMap();
    expect([...systemCodesInExternalIO(map)].sort()).toEqual([...IO_SYSTEM_CODES].sort());
  });

  it('различает уровни: модули с разным числом фаз, у фаз есть узлы', () => {
    // При двух модулях по две фазы «фазы модуля B» и «фазы, кроме модуля A» —
    // одно множество, и ошибка выбора модуля неотличима от правильного ответа
    // (stagesOfModule, задача process-map-9mn.10).
    const map = parseThreeLevelProcessMap();
    const counts = map.modules.map((module) => module.stageIds.length);

    expect(map.modules.length, 'модулей больше одного').toBeGreaterThan(1);
    expect(Math.min(...counts), 'у каждого модуля больше одной фазы').toBeGreaterThan(1);
    expect(new Set(counts).size, 'числа фаз различаются').toBeGreaterThan(1);
    expect(
      map.stages.every((stage) => stage.nodes.length > 0),
      'у фаз есть узлы',
    ).toBe(true);
  });

  it('объявленный состав модулей совпадает с построенным', () => {
    // MODULE_STAGE_IDS — то, с чем задача process-map-9mn.10 будет сверять
    // stagesOfModule. Если объявление разойдётся с картой, сверять будет не с
    // чем, а тест той задачи станет тавтологией.
    const map = parseThreeLevelProcessMap();
    expect(map.modules.map((module) => module.id)).toEqual([...MODULE_IDS]);
    for (const module of map.modules) {
      expect(module.stageIds, module.id).toEqual([...(MODULE_STAGE_IDS[module.id] ?? [])]);
    }
  });

  it('у каждого модуля есть собственные обзорные рёбра', () => {
    // Иначе overviewEdgesOf(map, moduleId) нечем отличить от «вернул пусто».
    const map = parseThreeLevelProcessMap();
    const moduleOfStage = new Map(
      map.modules.flatMap((module) => module.stageIds.map((id) => [id, module.id] as const)),
    );
    const withEdges = new Set(
      map.overviewEdges
        .map((edge) => moduleOfStage.get(edge.source) ?? moduleOfStage.get(edge.target))
        .filter((moduleId): moduleId is string => moduleId !== undefined),
    );
    expect([...withEdges].sort()).toEqual([...MODULE_IDS].sort());
  });
});

describe('ModuleSchema', () => {
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
    const map = buildThreeLevelProcessMap();
    map.modules = [];
    expect(() => ProcessMapSchema.parse(map)).toThrow();
  });

  it('принимает единственный модуль: уровень 1 с одной карточкой законен', () => {
    const map = buildThreeLevelProcessMap();
    map.modules = [{ ...map.modules[0]!, stageIds: map.stages.map((stage) => stage.id) }];
    // Рёбра уровня 1 ссылались на исчезнувшие модули: без этой строки тест
    // краснел бы не там, где смотрит.
    map.moduleEdges = [];
    const parsed = ProcessMapSchema.parse(map);
    expect(validateIntegrity(parsed)).toEqual([]);
  });

  it('отвергает модуль без единой фазы', () => {
    const map = buildThreeLevelProcessMap();
    map.modules[0]!.stageIds = [];
    expect(() => ProcessMapSchema.parse(map)).toThrow();
  });

  it('отвергает id модуля вне kebab-case: он попадает в ?module=<id>', () => {
    const map = buildThreeLevelProcessMap();
    map.modules[0]!.id = 'Планирование спроса';
    expect(() => ProcessMapSchema.parse(map)).toThrow();
  });

  it('отвергает keyOutputs модуля из более чем четырёх пунктов, но принимает пустой', () => {
    // Верхняя граница как у этапа; нижней нет — у MRP на слайде обзора
    // выходного артефакта нет вовсе (process-map-9mn.5).
    const module = buildThreeLevelProcessMap().modules[0]!;
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

  it('принимает модуль с пустым keyOutputs прямо в карте', () => {
    // Фикстура закрепляет это положительно: у последнего модуля выходов нет, и
    // карта остаётся целостной. Проверка `.max(4)` выше про верхнюю границу
    // ничего не говорит о том, что бывает с документом целиком.
    const map = parseThreeLevelProcessMap();
    expect(map.modules.some((module) => module.keyOutputs.length === 0)).toBe(true);
    expect(validateIntegrity(map)).toEqual([]);
  });

  it('сохраняет label ребра модулей: артефакт между модулями живёт именно там', () => {
    // Артефакт со слайда 1 — это Edge.label, а не ExternalIO, и
    // SystemCodeSchema под него не расширяется. Если бы zod вычищал label,
    // подпись связи уровня 1 исчезла бы при экспорте.
    const map = parseThreeLevelProcessMap();
    expect(map.moduleEdges[0]?.label).toBe(MODULE_EDGE_LABEL);
  });

  it('сохраняет screen модуля и не выдумывает его отсутствующим', () => {
    // Ссылка на экран у карточки уровня 1 — необязательное поле, и оба его
    // состояния должны переживать разбор: иначе «Открыть в модуле» либо
    // исчезнет у того, у кого ссылка есть, либо появится у того, у кого её нет.
    const map = parseThreeLevelProcessMap();
    const withScreen = map.modules.filter((module) => module.screen !== undefined);
    expect(withScreen.length, 'модуль со ссылкой').toBeGreaterThan(0);
    expect(withScreen.length, 'модуль без ссылки').toBeLessThan(map.modules.length);
  });
});

describe('validateIntegrity: модули', () => {
  it('находит ссылку модуля на несуществующий этап', () => {
    const map = parseThreeLevelProcessMap();
    map.modules[0]!.stageIds.push('stage-99');
    const problems = validateIntegrity(map);
    expect(problems.some((problem) => problem.includes('stage-99'))).toBe(true);
  });

  it('находит этап, заявленный сразу двумя модулями', () => {
    const map = parseThreeLevelProcessMap();
    map.modules[1]!.stageIds.push('stage-1');
    const problems = validateIntegrity(map);
    expect(problems.some((problem) => problem.includes('двумя модулями'))).toBe(true);
    expect(problems.some((problem) => problem.includes('stage-1'))).toBe(true);
  });

  it('различает повтор этапа ВНУТРИ одного модуля', () => {
    // Диагноз обязан отличаться от «заявлен двумя модулями»: иначе читатель
    // пойдёт искать второй модуль, которого нет.
    const map = parseThreeLevelProcessMap();
    map.modules[0]!.stageIds.push('stage-1');
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
    const map = parseThreeLevelProcessMap();
    map.modules[1]!.id = MODULE_DEMAND;
    const problems = validateIntegrity(map);
    expect(problems.some((problem) => problem.includes('Дублирующийся id модуля'))).toBe(true);
  });

  it('находит дублирующийся номер модуля', () => {
    const map = parseThreeLevelProcessMap();
    map.modules[1]!.number = map.modules[0]!.number;
    const problems = validateIntegrity(map);
    expect(problems.some((problem) => problem.includes('Дублирующийся номер модуля'))).toBe(true);
  });

  it('дыра в номерах модулей законна: проверяется уникальность, а не сплошность', () => {
    // Карта берёт пять модулей презентации из восьми (process-map-9mn: без TPM
    // и DRP/TLB) и имеет право сохранить исходную нумерацию.
    //
    // Дыра есть в САМОЙ фикстуре, а не подстраивается тестом: иначе базовая
    // карта тихо утверждала бы обратное — «номера модулей идут подряд», — и
    // проверка сплошности, добавленная по ошибке, прошла бы весь корпус.
    const map = parseThreeLevelProcessMap();
    const numbers = map.modules.map((module) => module.number);
    const span = Math.max(...numbers) - Math.min(...numbers) + 1;
    expect(span, 'номера не подряд').toBeGreaterThan(numbers.length);
    expect(new Set(numbers).size, 'и при этом уникальны').toBe(numbers.length);
    expect(validateIntegrity(map)).toEqual([]);
  });

  it('находит этап-сироту: не заявлен ни одним модулем', () => {
    // Схема такое пропустит по построению: stageIds — ссылки, и ничто в типе
    // не требует, чтобы они покрыли весь stages. Этап при этом исчез бы с
    // экранов целиком.
    const map = parseThreeLevelProcessMap();
    const orphaned = map.modules[1]!.stageIds.slice(1);
    map.modules[1]!.stageIds = map.modules[1]!.stageIds.slice(0, 1);
    const problems = validateIntegrity(map);
    for (const stageId of orphaned) {
      expect(
        problems.some(
          (problem) => problem.includes(stageId) && problem.includes('не заявлен ни одним модулем'),
        ),
        stageId,
      ).toBe(true);
    }
  });

  it('находит обзорное ребро между этапами разных модулей', () => {
    const map = parseThreeLevelProcessMap();
    const [first, second] = map.modules;
    map.overviewEdges.push({
      id: 'cross-module-edge',
      source: first!.stageIds[first!.stageIds.length - 1]!,
      target: second!.stageIds[0]!,
      kind: 'process',
    });
    const problems = validateIntegrity(map);
    expect(problems.some((problem) => problem.includes('разных модулей'))).toBe(true);
  });

  it('обзорное ребро «система → этап» остаётся законным при модулях', () => {
    // Конец-система ничьему модулю не принадлежит, и сравнивать его модуль не с
    // чем: свимлейны уровня 1 — это внешние системы, а не узлы графа.
    const map = parseThreeLevelProcessMap();
    const codesInIO = systemCodesInExternalIO(map);
    expect(
      map.overviewEdges.some((edge) => codesInIO.has(edge.source) || codesInIO.has(edge.target)),
    ).toBe(true);
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

  // Оба конца ребра уровня 1 проверяются ОТДЕЛЬНЫМИ тестами, и это не
  // симметрия ради симметрии: пока тест был один и портил только target,
  // выключение проверки source не роняло ни одного теста из тридцати трёх —
  // ребро «этап → модуль» проезжало молча. Мутация подтвердила (задача
  // process-map-9mn.11). Этап — законный конец ОБЗОРНОГО ребра, но не ребра
  // уровня 1: этапов на уровне 1 нет.
  //
  // Второй конец в каждом тесте — настоящий модуль, иначе сработала бы ещё и
  // проверка «ни один конец не является модулем», и тест зеленел бы от неё.
  it('находит негодный target ребра модулей', () => {
    const map = parseThreeLevelProcessMap();
    map.moduleEdges.push({
      id: 'broken-module-edge-target',
      source: MODULE_DEMAND,
      target: 'stage-1',
      kind: 'process',
    });
    const problems = validateIntegrity(map);
    expect(
      problems.some(
        (problem) =>
          problem.includes('broken-module-edge-target') && problem.includes('target "stage-1"'),
      ),
    ).toBe(true);
  });

  it('находит негодный source ребра модулей', () => {
    const map = parseThreeLevelProcessMap();
    map.moduleEdges.push({
      id: 'broken-module-edge-source',
      source: 'stage-1',
      target: MODULE_DEMAND,
      kind: 'process',
    });
    const problems = validateIntegrity(map);
    expect(
      problems.some(
        (problem) =>
          problem.includes('broken-module-edge-source') && problem.includes('source "stage-1"'),
      ),
    ).toBe(true);
  });

  it('принимает код системы концом ребра модулей', () => {
    // Код берётся ВНЕ ExternalIO фикстуры — см. сторож в блоке про фикстуру.
    const map = parseThreeLevelProcessMap();
    map.moduleEdges.push({
      id: 'module-edge-system',
      source: MODULE_SUPPLY,
      target: SYSTEM_OUTSIDE_IO_2,
      kind: 'integration',
    });
    expect(validateIntegrity(map)).toEqual([]);
  });

  it('находит ребро модулей, у которого ни один конец не модуль', () => {
    // Связь «система → система» на уровне 1 не соединяет ничего из
    // нарисованного: экран рисует модули, а системы существуют на нём только
    // как то, с чем модуль обменивается.
    const map = parseThreeLevelProcessMap();
    map.moduleEdges.push({
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
      {
        id: 'module-edge-orphan',
        source: MODULE_DEMAND,
        target: MODULE_PRODUCTION,
        kind: 'process',
      },
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
    const map = parseThreeLevelProcessMap();
    const existing = map.overviewEdges[0]!;
    map.moduleEdges.push({ ...existing, source: MODULE_DEMAND, target: MODULE_SUPPLY });
    const problems = validateIntegrity(map);
    expect(problems.some((problem) => problem.includes('Дублирующийся id ребра'))).toBe(true);
  });

  it('находит дублирующийся id узла между фазами РАЗНЫХ модулей', () => {
    // Уникальность id узлов глобальна, и модули её не ослабляют: два шага под
    // одним id в разных модулях — это один и тот же узел React Flow на двух
    // экранах и один и тот же ключ overrides.
    const map = parseThreeLevelProcessMap();
    const [firstModule, secondModule] = map.modules;
    const donor = map.stages.find((stage) => stage.id === firstModule!.stageIds[0])!;
    const acceptor = map.stages.find((stage) => stage.id === secondModule!.stageIds[0])!;
    acceptor.nodes.push({ ...donor.nodes[0]!, id: donor.nodes[0]!.id });
    const problems = validateIntegrity(map);
    expect(problems.some((problem) => problem.includes('Дублирующийся id узла'))).toBe(true);
  });
});
