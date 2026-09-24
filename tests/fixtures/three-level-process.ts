// Программная фабрика минимальной валидной ТРЁХУРОВНЕВОЙ карты:
// модули → фазы → шаги (эпик M8, задача process-map-9mn.11).
//
// ЗАЧЕМ ОТДЕЛЬНЫЙ ДОКУМЕНТ, А НЕ НАДСТРОЙКА НАД sample-process.ts. Локальный
// сборщик buildThreeLevelMap() в tests/moduleSchema.test.ts надстройкой и был:
// брал двухуровневую фикстуру, дописывал modules и вычищал обзорное ребро,
// ставшее кросс-модульным. Для одного файла это было дёшево, для общей
// фикстуры — нет:
//
//  1. Главное требование этой фикстуры (блок SYSTEM_OUTSIDE_IO ниже) стало бы
//     заложником чужого файла: множество кодов, попадающих в ExternalIO, задаёт
//     sample-process.ts, на котором стоит весь остальной корпус. Расширение его
//     SYSTEM_CODES до BI/EPM молча лишило бы здешние тесты различающей силы —
//     ровно тот дефект, который уже случился в 9mn.9.
//  2. Четыре этапа двухуровневой фикстуры дают потолок «2 модуля × 2 фазы».
//     На таком потолке слепы проверки уровня 1 (stagesOfModule, moduleOfStage,
//     overviewEdgesOf — задача process-map-9mn.10): модуль, вернувший СВОИ
//     фазы, неотличим от модуля, вернувшего ВСЕ.
//  3. Надстройка обязана была УДАЛЯТЬ ребро базы, чтобы стать валидной.
//     Фикстура, которая чинит себя вычитанием, ломается от любой правки базы —
//     и ломается молча, потому что filter по несуществующему id не падает.
//
// Двухуровневая фикстура при этом никуда не делась и остаётся отдельным
// документом: тесты «карта без modules остаётся валидной» берут именно её.
//
// ФИКСТУРА ВОЗВРАЩАЕТСЯ СВЕЖЕЙ на каждый вызов и целиком состоит из
// собственных объектов и массивов: её потребители портят карту точечно
// (push в stageIds, подмена number, добавление ребра), и общая ссылка
// протащила бы порчу из теста в тест.
import {
  ProcessMapSchema,
  type Edge,
  type ExternalIO,
  type Group,
  type Module,
  type ProcessMap,
  type ProcessNode,
  type ScreenLink,
  type Stage,
  type SystemCode,
} from '../../src/data/schema.ts';

/*
 * КОДЫ СИСТЕМ: ЧТО ВНУТРИ ExternalIO, А ЧТО СНАРУЖИ.
 *
 * Это не оформление, а несущая конструкция фикстуры (требование из ревью
 * 9mn.9). Концы moduleEdges сверяются с ПЕРЕЧИСЛЕНИЕМ SystemCodeSchema, а не с
 * кодами, реально встреченными в ExternalIO, — см. комментарий в
 * validateIntegrity. Код из пересечения двух множеств не отличает одну
 * реализацию от другой: на 'ERP' подмена проверки на `systemCodes.has(...)`
 * оставляла все девятнадцать тестов зелёными.
 *
 * Поэтому у фикстуры два непересекающихся списка:
 *  - IO_SYSTEM_CODES — коды, которые она раскладывает по stage.inputs/outputs;
 *  - SYSTEM_OUTSIDE_IO / SYSTEM_OUTSIDE_IO_2 — коды перечисления, которых в её
 *    ExternalIO НЕТ НИ ОДНОГО.
 *
 * 'ERP' оставлен внутри намеренно: это тот самый код, за который брался
 * прошлый тест по привычке. Пусть привычка краснеет.
 *
 * Сами коды «снаружи» стоят концами рёбер уровня 1 в самой фикстуре (BI —
 * источником, EPM — приёмником), поэтому проверка `validateIntegrity(map) ===
 * []` на базовой фикстуре УЖЕ является различающей: при сверке с множеством
 * встреченных кодов она краснеет, не дожидаясь отдельного теста.
 */
export const IO_SYSTEM_CODES: readonly SystemCode[] = ['DP', 'PS', 'ERP'];
export const SYSTEM_OUTSIDE_IO: SystemCode = 'BI';
export const SYSTEM_OUTSIDE_IO_2: SystemCode = 'EPM';

export const MODULE_DEMAND = 'demand-planning';
export const MODULE_SUPPLY = 'supply-planning';
export const MODULE_PRODUCTION = 'production-planning';

/**
 * Подпись ребра модуль → модуль. Артефакт между модулями живёт именно в
 * Edge.label, а не в ExternalIO (ExternalIO требует system из закрытого
 * перечисления, а артефакт системой не является) — см. ProcessMapSchema.
 */
export const MODULE_EDGE_LABEL = 'Итоговый неограниченный прогноз';

interface StageSpec {
  readonly number: number;
  readonly title: string;
  readonly shortTitle: string;
  readonly keyOutputs: readonly string[];
  readonly warningsCount?: number;
  readonly inputs: readonly { readonly system: SystemCode; readonly label: string }[];
  readonly outputs: readonly { readonly system: SystemCode; readonly label: string }[];
}

interface ModuleSpec {
  readonly id: string;
  readonly number: number;
  readonly title: string;
  readonly shortTitle: string;
  readonly label: string;
  readonly keyOutputs: readonly string[];
  readonly screen?: ScreenLink;
  readonly stageNumbers: readonly number[];
}

/*
 * МОДУЛИ. Три, а не два, и с РАЗНЫМ числом фаз (2 / 3 / 2) — оба отличия
 * рабочие, а не декоративные: при двух модулях по две фазы «фазы модуля B» и
 * «фазы, кроме модуля A» — одно и то же множество, и ошибка выбора модуля
 * неотличима от правильного ответа; третий модуль даёт середину, у которой есть
 * и предшественник, и последователь.
 *
 * НОМЕРА 1, 2, 4 — С ДЫРОЙ, И ЭТО ЗАКОННО. Карта берёт пять модулей презентации
 * из восьми (эпик process-map-9mn: без TPM и DRP/TLB) и сохраняет исходную
 * нумерацию. validateIntegrity проверяет УНИКАЛЬНОСТЬ номеров, а не их
 * сплошность, в отличие от номеров этапов; дыра в базовой фикстуре закрепляет
 * это свойство положительно, а не комментарием. Сплошные номера здесь были бы
 * утверждением «сплошность обязательна», сделанным молча.
 *
 * keyOutputs: 2 / 1 / 0. Пустой список у последнего — тоже закреплённое
 * свойство: у MRP на слайде обзора выходного артефакта нет вовсе
 * (process-map-9mn.5), и нижней границы у поля нет.
 */
const MODULE_LAYOUT: readonly ModuleSpec[] = [
  {
    id: MODULE_DEMAND,
    number: 1,
    title: 'Планирование спроса',
    shortTitle: 'DP · Планирование спроса',
    label: 'Модуль DP',
    keyOutputs: ['Согласованный прогноз', 'Профиль сезонности'],
    stageNumbers: [1, 2],
  },
  {
    id: MODULE_SUPPLY,
    number: 2,
    title: 'Планирование сети поставок',
    shortTitle: 'SNP · Планирование сети поставок',
    label: 'Модуль SNP',
    keyOutputs: ['Согласованный план поставок'],
    screen: { title: 'Планирование поставок', url: 'https://example.test/snp' },
    stageNumbers: [3, 4, 5],
  },
  {
    id: MODULE_PRODUCTION,
    number: 4,
    title: 'Планирование производства',
    shortTitle: 'PP · Планирование производства',
    label: 'Модуль PP',
    keyOutputs: [],
    stageNumbers: [6, 7],
  },
];

/*
 * ФАЗЫ. Номера СКВОЗНЫЕ 1..7 через все модули — ровно так, как требует решение
 * «ссылки, а не вложение» (ModuleSchema): ?stage=N адресует этап во всём
 * документе, а не внутри модуля.
 *
 * У этапа 6 внешних входов и выходов НЕТ НИ ОДНОГО. Это не пропуск: пустые
 * inputs/outputs законны схемой, и потребитель, молча предположивший «у каждой
 * фазы есть свимлейн», должен спотыкаться о фикстуру, а не о реальные данные.
 */
const STAGE_LAYOUT: readonly StageSpec[] = [
  {
    number: 1,
    title: 'Этап 1: сбор истории продаж',
    shortTitle: 'История продаж',
    keyOutputs: ['Очищенная история'],
    inputs: [{ system: 'DP', label: 'История отгрузок' }],
    outputs: [],
  },
  {
    number: 2,
    title: 'Этап 2: согласование прогноза',
    shortTitle: 'Согласование прогноза',
    keyOutputs: ['Согласованный прогноз'],
    inputs: [],
    outputs: [{ system: 'DP', label: 'Согласованный прогноз' }],
  },
  {
    number: 3,
    title: 'Этап 3: неограниченный план',
    shortTitle: 'Неограниченный план',
    keyOutputs: ['Неограниченный план поставок'],
    inputs: [{ system: 'ERP', label: 'Остатки и заказы' }],
    outputs: [],
  },
  {
    number: 4,
    title: 'Этап 4: проверка ограничений',
    shortTitle: 'Проверка ограничений',
    keyOutputs: ['Список дефицитов', 'Список перегрузов'],
    warningsCount: 1,
    inputs: [{ system: 'ERP', label: 'Мощности площадок' }],
    outputs: [{ system: 'PS', label: 'Ограничения поставок' }],
  },
  {
    number: 5,
    title: 'Этап 5: согласованный план поставок',
    shortTitle: 'План поставок',
    keyOutputs: ['Согласованный план поставок'],
    inputs: [],
    outputs: [{ system: 'PS', label: 'План поставок' }],
  },
  {
    number: 6,
    title: 'Этап 6: объёмный план производства',
    shortTitle: 'Объёмный план',
    keyOutputs: ['Объёмный план производства'],
    inputs: [],
    outputs: [],
  },
  {
    number: 7,
    title: 'Этап 7: выпуск заказов в производство',
    shortTitle: 'Выпуск заказов',
    keyOutputs: ['Производственные заказы'],
    inputs: [{ system: 'PS', label: 'План поставок' }],
    outputs: [{ system: 'ERP', label: 'Производственные заказы' }],
  },
];

function stageId(stageNumber: number): string {
  return `stage-${stageNumber}`;
}

/**
 * Фаза: группа, четыре узла и цепочка рёбер между ними.
 *
 * Четыре, а не один: экран детализации должен получать содержательный граф —
 * вход, два шага и выход, — иначе на фикстуре нечем отличить «узлы этапа» от
 * «узлов документа», а колонки входов/выходов (direction) остались бы пустыми.
 * У этапа 4 второй шаг — 'warning', и warningsCount этапа согласован с ним.
 */
function buildStage(spec: StageSpec): Stage {
  const id = stageId(spec.number);
  const groups: Group[] = [{ id: `${id}-group`, label: `Группа этапа ${spec.number}` }];

  const input: ProcessNode = {
    id: `${id}-input`,
    type: 'data',
    label: `Вход ${spec.number}`,
    direction: 'in',
    position: { x: 0, y: spec.number * 100 },
  };

  const first: ProcessNode = {
    id: `${id}-step-1`,
    type: 'step',
    label: `Шаг ${spec.number}.1`,
    description: `Описание шага ${spec.number}.1`,
    group: `${id}-group`,
    system: 'DP',
    owner: 'Планировщик',
    inputs: ['Прогноз'],
    outputs: ['План'],
    screen: { title: `Экран шага ${spec.number}.1`, url: 'https://example.test/step' },
    position: { x: 160, y: spec.number * 100 },
  };

  const second: ProcessNode = {
    id: `${id}-step-2`,
    type: spec.warningsCount === undefined ? 'step' : 'warning',
    label: `Шаг ${spec.number}.2`,
    group: `${id}-group`,
    position: { x: 320, y: spec.number * 100 },
  };

  const output: ProcessNode = {
    id: `${id}-output`,
    type: 'data',
    label: `Выход ${spec.number}`,
    direction: 'out',
    position: { x: 480, y: spec.number * 100 },
  };

  const nodes: ProcessNode[] = [input, first, second, output];
  const edges: Edge[] = nodes.slice(0, -1).map((node, index) => ({
    id: `${id}-edge-${index + 1}`,
    source: node.id,
    target: nodes[index + 1]!.id,
    kind: 'process',
  }));

  const externalIO = (
    io: readonly { readonly system: SystemCode; readonly label: string }[],
    direction: 'in' | 'out',
  ): ExternalIO[] =>
    io.map((entry) => ({
      system: entry.system,
      label: entry.label,
      stage: spec.number,
      direction,
    }));

  const stage: Stage = {
    id,
    number: spec.number,
    title: spec.title,
    shortTitle: spec.shortTitle,
    keyOutputs: [...spec.keyOutputs],
    groups,
    nodes,
    edges,
    inputs: externalIO(spec.inputs, 'in'),
    outputs: externalIO(spec.outputs, 'out'),
  };
  if (spec.warningsCount !== undefined) {
    stage.warningsCount = spec.warningsCount;
  }
  return stage;
}

/**
 * Карта с гарантированно непустыми modules/moduleEdges.
 *
 * В самой схеме оба поля необязательные («отсутствие и означает двухуровневую
 * карту»), и потребителю фикстуры пришлось бы ставить `!` на каждое обращение к
 * тому, что фикстура обещает всегда. Сужение стоит одной строкой здесь вместо
 * десятков восклицательных знаков в тестах — и, в отличие от них, обещание
 * проверяется компилятором в самой фабрике.
 */
export type ThreeLevelProcessMap = ProcessMap & {
  modules: Module[];
  moduleEdges: Edge[];
};

/** Фазы каждого модуля — ОБЪЯВЛЕННЫЙ состав, а не вычисленный из карты. */
export const MODULE_STAGE_IDS: Readonly<Record<string, readonly string[]>> = Object.fromEntries(
  MODULE_LAYOUT.map((spec) => [spec.id, spec.stageNumbers.map(stageId)]),
);

/** Модули в порядке документа. */
export const MODULE_IDS: readonly string[] = MODULE_LAYOUT.map((spec) => spec.id);

export function buildThreeLevelProcessMap(): ThreeLevelProcessMap {
  const stages: Stage[] = STAGE_LAYOUT.map(buildStage);

  const modules: Module[] = MODULE_LAYOUT.map((spec) => {
    const module: Module = {
      id: spec.id,
      number: spec.number,
      title: spec.title,
      shortTitle: spec.shortTitle,
      label: spec.label,
      keyOutputs: [...spec.keyOutputs],
      stageIds: spec.stageNumbers.map(stageId),
    };
    if (spec.screen !== undefined) {
      module.screen = { ...spec.screen };
    }
    return module;
  });

  /*
   * Обзорные рёбра — ТОЛЬКО ВНУТРИ модулей. Кросс-модульного ребра в базовой
   * фикстуре нет ни одного, и это не забывчивость: такое ребро — ошибка
   * данных (ему место в moduleEdges), и тест на него добавляет ребро сам.
   * Внутримодульные цепочки при этом есть у КАЖДОГО модуля — иначе
   * overviewEdgesOf(map, moduleId) нечем отличить от «вернул пусто».
   */
  const overviewEdges: Edge[] = [
    { id: 'overview-edge-1', source: 'stage-1', target: 'stage-2', kind: 'process' },
    { id: 'overview-edge-2', source: 'stage-3', target: 'stage-4', kind: 'process' },
    { id: 'overview-edge-3', source: 'stage-4', target: 'stage-5', kind: 'process' },
    { id: 'overview-edge-4', source: 'stage-6', target: 'stage-7', kind: 'process' },
    { id: 'overview-edge-5', source: 'DP', target: 'stage-1', kind: 'integration' },
    { id: 'overview-edge-6', source: 'stage-5', target: 'PS', kind: 'integration' },
    { id: 'overview-edge-7', source: 'ERP', target: 'stage-4', kind: 'integration' },
  ];

  /*
   * Связи уровня 1. Два ребра модуль → модуль (у среднего модуля есть и вход, и
   * выход) и два ребра с системой — причём система стоит РАЗНЫМИ концами: BI
   * источником, EPM приёмником. Обе ветки isValidModuleEndpoint (source и
   * target) оказываются под положительной проверкой, и обе — на кодах, которых
   * в ExternalIO этой карты нет.
   */
  const moduleEdges: Edge[] = [
    {
      id: 'module-edge-1',
      source: MODULE_DEMAND,
      target: MODULE_SUPPLY,
      kind: 'process',
      label: MODULE_EDGE_LABEL,
    },
    {
      id: 'module-edge-2',
      source: MODULE_SUPPLY,
      target: MODULE_PRODUCTION,
      kind: 'process',
      label: 'Страховые и целевые запасы',
    },
    {
      id: 'module-edge-3',
      source: SYSTEM_OUTSIDE_IO,
      target: MODULE_DEMAND,
      kind: 'integration',
      label: 'Витрина продаж',
    },
    {
      id: 'module-edge-4',
      source: MODULE_PRODUCTION,
      target: SYSTEM_OUTSIDE_IO_2,
      kind: 'integration',
      label: 'Плановая себестоимость',
    },
  ];

  return {
    version: '1.0.0-fixture-3l',
    id: 'fixture-three-level',
    updatedAt: '2026-09-24',
    title: 'Карта процессов In.Plan (трёхуровневая фикстура)',
    moduleLabel: 'Все процессы In.Plan',
    modules,
    moduleEdges,
    stages,
    overviewEdges,
  };
}

/**
 * Та же карта, ПРОПУЩЕННАЯ ЧЕРЕЗ СХЕМУ, — то, что получает приложение:
 * parseProcessMap отдаёт результат zod, а не объект из файла.
 *
 * Проверка перед сужением не декоративная: zod возвращает НОВЫЙ объект, и если
 * схема однажды перестанет пропускать modules насквозь (переименование поля,
 * .strip вместо passthrough в чужой правке), сужение молча соврало бы, а
 * потребитель упал бы с «cannot read property of undefined» где-то через
 * три функции от причины. Здесь же он падает с внятным текстом.
 *
 * Бросает, а не возвращает null: карта, не прошедшая схему, — не «нет
 * результата», а сломанная фикстура, и на ней бессмысленны ВСЕ тесты вокруг.
 */
export function parseThreeLevelProcessMap(): ThreeLevelProcessMap {
  const parsed = ProcessMapSchema.parse(buildThreeLevelProcessMap());
  if (parsed.modules === undefined || parsed.moduleEdges === undefined) {
    throw new Error('Трёхуровневая фикстура обязана приносить modules и moduleEdges');
  }
  return parsed as ThreeLevelProcessMap;
}
