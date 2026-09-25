// Программная фабрика минимальной валидной ТРЁХУРОВНЕВОЙ карты:
// модули → этапы → шаги (эпик M8, задача process-map-9mn.11).
//
// ЗАЧЕМ ОТДЕЛЬНЫЙ ДОКУМЕНТ, А НЕ НАДСТРОЙКА НАД sample-process.ts. Локальный
// сборщик buildThreeLevelMap() в tests/moduleSchema.test.ts надстройкой и был:
// брал двухуровневую фикстуру, дописывал modules и вычищал обзорное ребро,
// ставшее кросс-модульным. Отдельный документ разумнее по двум причинам:
//
//  1. Надстройка, режущая этапы базы на модули, обязана УДАЛЯТЬ рёбра базы:
//     цепочка stage-1 → … → stage-4 при любом разрезе пересекает границу
//     модулей, а такое ребро — ошибка данных. Удаляла она по id —
//     filter((edge) => edge.id !== 'overview-edge-2'), — то есть держалась за
//     id чужого файла, и что станет с ней от правки sample-process.ts, зависит
//     от самой правки. Ребро stage-2 → stage-3 переименовали — filter не
//     вырезает ничего, ребро остаётся, и тест «фикстура трёхуровневой карты
//     разбирается и целостна» краснеет, называя ребро по имени; громко, но
//     диагноз указывает на разрез надстройки, а не на правку в базе. Ребро
//     убрали — вычитать нечего, ломаться нечему. Молча
//     — только когда id 'overview-edge-2' достаётся другому ребру: filter
//     вырезает его, и пропажу заметит разве что тест, случайно опиравшийся
//     именно на это ребро.
//  2. Всё, что делает карту трёхуровневой, собрано в одном месте и читается
//     целиком: состав модулей, раскладка кодов по ExternalIO, этап без внешних
//     входов и выходов, подробность, полоса, id 'mrp'. У надстройки часть
//     этого жила бы в формулах sample-process.ts (коды систем по номеру этапа,
//     одиннадцать узлов на этап), подобранных под двухуровневый корпус, и
//     читать пришлось бы оба файла сразу.
//
// ЧЕГО ЭТОТ ВЫБОР НЕ ОЗНАЧАЕТ. Прежняя шапка обосновывала его ещё двумя
// доводами, и оба оказались фактически неверны (process-map-9mn.30).
//
// Не означает, что общая фикстура неуправляемо теряет различающую силу и
// поэтому свойству нужен свой документ. Урок 9mn.9 другой. На ревью 9mn.9 тест
// «принимает код системы концом ребра модулей» брал 'ERP', который в ExternalIO
// фикстуры ЕСТЬ, и зеленел при обеих реализациях — сверке с перечислением и
// сверке с встреченными кодами. Лечится это выбором данных, на которых
// реализации расходятся, и СТОРОЖЕМ, который считает свойство из самой карты:
// такой сторож появился ещё в 9mn.9 («коды систем в тестах взяты вне
// ExternalIO фикстуры», коммит 605c475; в версии 4b3d3e3 он на месте) и
// покраснел бы и на надстройке, расширь кто-нибудь SYSTEM_CODES двухуровневой
// фикстуры до BI/EPM. Здесь он же — «опирается на коды систем, которых нет в
// её ExternalIO» в tests/moduleSchema.test.ts. Потеряла фикстура различающее
// свойство — нужен сторож рядом с ней, а не новый документ.
//
// Не означает и того, что на четырёх этапах трёхуровневая карта невыразима:
// stageIds допускает один этап (.min(1)), и разбиение 1 / 1 / 2 даёт три
// модуля, средний со входом и выходом, разные числа этапов при молчащем
// validateIntegrity. Семь этапов — наименьшее число, при котором выполняются
// сразу три требования к фикстуре:
//  - у каждого из трёх модулей своя цепочка этап → этап, то есть не меньше
//    двух этапов у каждого: на модуле без цепочки проверка overviewEdgesOf не
//    отличает правильный фильтр от отбрасывающего рёбра с обоими своими
//    концами;
//  - числа этапов у модулей НЕ ВСЕ ОДИНАКОВЫЕ (шапка MODULE_LAYOUT ниже; тест «различает
//    уровни» в tests/moduleSchema.test.ts);
//  - один из модулей состоит из трёх этапов: на нём стоит вариант «обратный
//    порядок» в tests/modules.test.ts — на двух этапах обратный порядок
//    неотличим от поворота.
// Первое требование обязательно; каждое из двух других вместе с ним уже даёт
// 2 + 2 + 3. Поэтому 2 / 2 / 2 не годится, даже если одно из них однажды
// отпадёт: второе останется и потребует того же.
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
  type Lane,
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
/*
 * id 'mrp', а НЕ 'production-planning', — РЕГИСТРОВАЯ КОЛЛИЗИЯ НАМЕРЕННО
 * (process-map-9mn.23, 9mn.32). У реальной карты inplan модули зовут dp,
 * meio, snp, ps, mrp, и три из пяти отличаются от кодов систем DP, PS, MRP
 * только регистром. Пока id фикстуры не могли столкнуться с кодом системы ни
 * при каком сравнении, весь код уровня 1 проверялся на данных, где приведение
 * регистра или сравнение без его учёта проходят все тесты, а на реальной карте
 * конец 'MRP' тихо уехал бы к свимлейну внешней системы.
 *
 * Базовая фикстура при этом ВАЛИДНА: 'MRP' не стоит ни концом её moduleEdges,
 * ни в её ExternalIO (IO_SYSTEM_CODES выше его не содержит) — коллизию
 * добавляют сами тесты, которые её проверяют. Подписи модуля (PP ·
 * Планирование производства) не тронуты: по ним его называют тесты
 * tests/modules.test.ts, а предмет коллизии — только id.
 */
export const MODULE_PRODUCTION = 'mrp';

/**
 * Код системы, совпадающий с MODULE_PRODUCTION без учёта регистра. Тесты
 * 9mn.23 ставят его концом ребра уровня 1 или системой ExternalIO; константа
 * здесь, рядом с id модуля, чтобы пара не разъехалась.
 */
export const SYSTEM_COLLIDING_WITH_MODULE: SystemCode = 'MRP';

/**
 * Полоса уровня 1 (LaneSchema): та самая FP&A с решения владельца
 * process-map-9mn.31, п. 5. Одна — больше фикстуре не нужно: проверки полос
 * (уникальность, совпадение с модулем) тесты делают, дописывая свою.
 */
export const LANE_FPA = 'fpa';

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
  /** Текст подробности под первым шагом этапа; абзацы через \n. */
  readonly detail?: string;
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
 * МОДУЛИ. Три, а не два, и с РАЗНЫМ числом этапов (2 / 3 / 2) — оба отличия
 * рабочие, а не декоративные: при двух модулях по два этапа «этапы модуля B» и
 * «этапы, кроме модуля A» — одно и то же множество, и ошибка выбора модуля
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
 * ЭТАПЫ. Номера СКВОЗНЫЕ 1..7 через все модули — ровно так, как требует решение
 * «ссылки, а не вложение» (ModuleSchema): ?stage=N адресует этап во всём
 * документе, а не внутри модуля.
 *
 * У этапа 6 внешних входов и выходов НЕТ НИ ОДНОГО. Это не пропуск: пустые
 * inputs/outputs законны схемой, и потребитель, молча предположивший «у каждого
 * этапа есть свимлейн», должен спотыкаться о фикстуру, а не о реальные данные.
 * Сторож — «у этапа 6 нет ни одного внешнего входа и выхода» в
 * tests/moduleSchema.test.ts: сам по себе пустой этап ни один другой тест не
 * требует, и лишний свимлейн здесь проехал бы молча.
 *
 * ПОДРОБНОСТЬ (NodeType 'detail', process-map-9mn.32) — ровно одна, под первым
 * шагом этапа 3, и текст её из двух абзацев: одна — потому что у остальных
 * этапов её отсутствие тоже закреплено (потребитель, решивший «у каждого шага
 * есть подробность», споткнётся), два абзаца — потому что склейка через \n и
 * есть форма, которую пишет импортёр.
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
    detail: 'Расчёт потребности по всем узлам сети\nБез учёта ограничений мощностей',
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
 * Этап: группа, четыре узла и цепочка рёбер между ними.
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

  // Подробность дописывается ПОСЛЕ цепочки: иначе цепочка протянула бы ребро
  // «выход → подробность», а у подробности входящее ребро ровно одно, от
  // узла потока и вида 'data' (validateIntegrity).
  if (spec.detail !== undefined) {
    const detail: ProcessNode = {
      id: `${first.id}-detail`,
      type: 'detail',
      label: spec.detail,
      position: { x: 160, y: spec.number * 100 + 60 },
    };
    nodes.push(detail);
    edges.push({ id: `${id}-edge-detail`, source: first.id, target: detail.id, kind: 'data' });
  }

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
 * Карта с гарантированно непустыми modules/moduleEdges/lanes.
 *
 * В самой схеме все три поля необязательные («отсутствие и означает двухуровневую
 * карту»), и потребителю фикстуры пришлось бы ставить `!` на каждое обращение к
 * тому, что фикстура обещает всегда. Сужение стоит одной строкой здесь вместо
 * десятков восклицательных знаков в тестах — и, в отличие от них, обещание
 * проверяется компилятором в самой фабрике.
 */
export type ThreeLevelProcessMap = ProcessMap & {
  modules: Module[];
  moduleEdges: Edge[];
  lanes: Lane[];
};

/**
 * Этапы каждого модуля — ОБЪЯВЛЕННЫЙ состав, а не вычисленный из карты.
 *
 * «Объявленный» значит «взятый мимо проверяемого кода»: ожидание для
 * stagesOfModule не выводится ни из карты, ни из самой функции. Вторым
 * НЕЗАВИСИМЫМ источником это не является — и карта, и эта константа собраны из
 * одного MODULE_LAYOUT. Поэтому сверяются они не друг с другом, а обе с
 * литералом, написанным руками (tests/moduleSchema.test.ts).
 */
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
   *
   * На этих рёбрах держится различающая сила overviewEdgesOf (задача
   * process-map-9mn.10), и держится она на ФОРМЕ рёбер, а не на их id:
   *  - цепочка этап → этап внутри КАЖДОГО модуля: на модуле без неё проверка
   *    не отличает правильный фильтр от отбрасывающего рёбра с обоими своими
   *    концами;
   *  - система ИСТОЧНИКОМ (overview-edge-5 у DP, overview-edge-7 у SNP): свой
   *    этап только в target, и их выбрасывает односторонний
   *    filter((e) => own.has(e.source));
   *  - система ПРИЁМНИКОМ (overview-edge-6 у SNP) — зеркально, против
   *    filter((e) => own.has(e.target)).
   * Тесты tests/modules.test.ts ищут эти рёбра по id, поэтому ребро,
   * развёрнутое с сохранением id, они пропускают — вместе с односторонним
   * мутантом (проверено мутацией, process-map-9mn.29). Форму сторожат тесты
   * фикстуры в tests/moduleSchema.test.ts.
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
   * выход — сторож в tests/moduleSchema.test.ts, иначе module-edge-2 ничем не
   * защищён) и два ребра с системой — причём система стоит РАЗНЫМИ концами: BI
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
    lanes: [{ id: LANE_FPA, title: 'FP&A · Финансовое планирование и анализ' }],
    stages,
    overviewEdges,
  };
}

/**
 * Та же карта, ПРОПУЩЕННАЯ ЧЕРЕЗ СХЕМУ, — то, что получает приложение:
 * parseProcessMap отдаёт результат zod, а не объект из файла.
 *
 * Проверка перед сужением — исполняемая половина `as ThreeLevelProcessMap`:
 * приведение типа компилятор не проверяет, а zod возвращает НОВЫЙ объект, не
 * тот, что собрала фабрика. От чего она НЕ защищает: переименование поля ловит
 * tsc (проверка называет все три поля по имени), а passthrough в
 * ProcessMapSchema нет и не было — z.object вычищает только НЕОБЪЯВЛЕННЫЕ
 * ключи, объявленные доезжают. Защищает она от разбора, который отдаёт карту
 * без поля при зелёном tsc: схема научилась превращать негодное значение в
 * отсутствие вместо исключения (.catch(undefined) у поля — выходной тип
 * остаётся `T | undefined`, и компилятор разницы не видит). Без проверки
 * потребитель упал бы с «cannot read properties of undefined» где-то через три
 * функции от причины; с ней — здесь и с внятным текстом (проверено мутацией
 * .min(5).optional().catch(undefined) у modules, process-map-9mn.30).
 *
 * Бросает, а не возвращает null: карта, не прошедшая схему, — не «нет
 * результата», а сломанная фикстура, и на ней бессмысленны ВСЕ тесты вокруг.
 */
export function parseThreeLevelProcessMap(): ThreeLevelProcessMap {
  const parsed = ProcessMapSchema.parse(buildThreeLevelProcessMap());
  if (
    parsed.modules === undefined ||
    parsed.moduleEdges === undefined ||
    parsed.lanes === undefined
  ) {
    throw new Error('Трёхуровневая фикстура обязана приносить modules, moduleEdges и lanes');
  }
  return parsed as ThreeLevelProcessMap;
}
