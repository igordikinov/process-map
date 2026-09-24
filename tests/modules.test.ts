// Механика src/data/modules.ts: сколько у карты уровней, что показывает
// уровень 2 и какой экран адресует состояние (задача process-map-9mn.10).
//
// ПОЧЕМУ ЗДЕСЬ, А НЕ В tests/data.test.ts. Тот файл объявлен как «механика на
// синтетической фикстуре, реальную карту НЕ читает намеренно» (SPEC §7), и
// стоит на ДВУХУРОВНЕВОЙ фикстуре. Механика уровня 1 требует трёхуровневой
// карты и собственных её вариантов, поэтому живёт отдельным файлом — как
// tests/moduleSchema.test.ts для схемы.
//
// Реальные карты с диска этот файл не читает. Проверка «объявленное число
// уровней совпадает с hasModules» стоит в tests/mapContract.test.ts, где карты
// и обнаруживаются: это факт про данные, а не про механику.
//
// ПОЧЕМУ ВАРИАНТЫ ФИКСТУРЫ ЖИВУТ ЗДЕСЬ, А НЕ В tests/fixtures/. Общая фикстура
// (tests/fixtures/three-level-process.ts) — канонический ПРАВИЛЬНЫЙ документ,
// её читают как образец. Варианты ниже нарочно неудобны: у одного модуля
// stageIds в обратном порядке, у другого состав чересполосный. Экспортировать
// их значило бы пригласить чужой тест схватить неудобную форму по ошибке.
//
// ЗАЧЕМ ВАРИАНТЫ ВООБЩЕ. Общая фикстура НЕ РАЗЛИЧАЕТ главную функцию, и это
// измерено мутацией, а не выведено рассуждением: составы модулей идут подряд
// ({1,2} {3,4,5} {6,7}), поэтому «этапы по диапазону номеров», «срез
// документа», «все, кроме чужих» и «свои в порядке документа» дают на ней тот
// же ответ, что правильная реализация. Убивают их только два свойства,
// которых у канонической фикстуры нет:
//   - ОБРАТНЫЙ ПОРЯДОК stageIds — убивает всё, что возвращает порядок
//     документа, включая самую правдоподобную ошибку
//     map.stages.filter((s) => mine.has(s.id)): множество она даёт верное;
//   - ЧЕРЕСПОЛОСНОЕ ВЛАДЕНИЕ — убивает всё, что ищет модуль по диапазону
//     номеров или сканирует документ подряд.
// Ни один из двух не заменяет другого: «все, кроме чужих» на любой целостной
// карте тождественно «мои» как множество и ловится только порядком, а
// диапазонные реализации порядком не ловятся вовсе.
import { describe, expect, it } from 'vitest';
import {
  currentScreen,
  hasModules,
  moduleById,
  moduleOfStage,
  overviewEdgesOf,
  stagesOfModule,
  type MapScreen,
} from '../src/data/modules.ts';
import {
  ProcessMapSchema,
  validateIntegrity,
  type Module,
  type ProcessMap,
} from '../src/data/schema.ts';
import { buildSampleProcessMap } from './fixtures/sample-process.ts';
import {
  buildThreeLevelProcessMap,
  parseThreeLevelProcessMap,
  MODULE_DEMAND,
  MODULE_IDS,
  MODULE_PRODUCTION,
  MODULE_STAGE_IDS,
  MODULE_SUPPLY,
  type ThreeLevelProcessMap,
} from './fixtures/three-level-process.ts';

/**
 * Вариант фикстуры: свежая карта → правка → схема → целостность.
 *
 * БРОСАЕТ, а не возвращает список проблем. Вариант, не прошедший
 * validateIntegrity, — это не «не оправдавшееся ожидание», а сломанная
 * предпосылка, на которой бессмысленны все тесты вокруг: они продолжали бы
 * зеленеть на карте, которую сам проект считает битой. Именно такой сторож
 * поймал первую редакцию чересполосного варианта, где обзорные рёбра остались
 * кросс-модульными.
 */
function buildVariant(name: string, edit: (map: ThreeLevelProcessMap) => void): ProcessMap {
  const draft = buildThreeLevelProcessMap();
  edit(draft);
  const map = ProcessMapSchema.parse(draft);
  const problems = validateIntegrity(map);
  if (problems.length > 0) {
    throw new Error(
      `Вариант фикстуры «${name}» не прошёл проверку целостности:\n  ${problems.join('\n  ')}`,
    );
  }
  return map;
}

function moduleOf(map: ThreeLevelProcessMap, moduleId: string): Module {
  const module = map.modules.find((candidate) => candidate.id === moduleId);
  if (module === undefined) {
    throw new Error(`В фикстуре нет модуля "${moduleId}"`);
  }
  return module;
}

function rewireOverviewEdge(
  map: ThreeLevelProcessMap,
  edgeId: string,
  source: string,
  target: string,
): void {
  const edge = map.overviewEdges.find((candidate) => candidate.id === edgeId);
  if (edge === undefined) {
    throw new Error(`В фикстуре нет обзорного ребра "${edgeId}"`);
  }
  edge.source = source;
  edge.target = target;
}

/** Каноническая трёхуровневая карта: три модуля, составы {1,2} {3,4,5} {6,7}. */
const baseMap: ProcessMap = parseThreeLevelProcessMap();

/** Двухуровневая карта: modules у неё нет вовсе. */
const twoLevelMap: ProcessMap = ProcessMapSchema.parse(buildSampleProcessMap());

/**
 * Обратный порядок stageIds у модуля SNP: {5,4,3} вместо {3,4,5}.
 *
 * Схема и validateIntegrity такой документ пропускают — порядок ссылок они не
 * проверяют, и это законная сегодня форма (расхождение stageIds с порядком
 * номеров разбирает задача process-map-wuv). Здесь он служит различителем:
 * любая реализация, отдающая этапы в порядке map.stages, краснеет.
 *
 * Модуль из ТРЁХ этапов, а не из двух: на двух «обратный порядок» неотличим от
 * поворота, а indexOf в бейдже «Этап k из n» на трёх даёт три разных ответа.
 */
const reversedOrderMap: ProcessMap = buildVariant(
  'обратный порядок stageIds у модуля SNP',
  (map) => {
    const module = moduleOf(map, MODULE_SUPPLY);
    module.stageIds = [...module.stageIds].reverse();
  },
);

const REVERSED_SUPPLY_STAGE_IDS = ['stage-5', 'stage-4', 'stage-3'];

/**
 * Чересполосное владение: DP заявляет 1 и 3, SNP — 2, 4, 5.
 *
 * ОБЗОРНЫЕ РЁБРА ПЕРЕВЯЗАНЫ, и без этого вариант был бы невалидным: ребро
 * stage-1 → stage-2 после передела становится кросс-модульным, а такое ребро
 * validateIntegrity запрещает поимённо («соединяет этапы разных модулей»).
 * Перевязка — часть варианта, а не косметика: тесты обязаны стоять на карте,
 * которую проект считает правильной.
 */
const INTERLEAVED_DEMAND_STAGE_IDS = ['stage-1', 'stage-3'];
const INTERLEAVED_SUPPLY_STAGE_IDS = ['stage-2', 'stage-4', 'stage-5'];
const interleavedMap: ProcessMap = buildVariant('чересполосное владение этапами', (map) => {
  moduleOf(map, MODULE_DEMAND).stageIds = [...INTERLEAVED_DEMAND_STAGE_IDS];
  moduleOf(map, MODULE_SUPPLY).stageIds = [...INTERLEAVED_SUPPLY_STAGE_IDS];
  rewireOverviewEdge(map, 'overview-edge-1', 'stage-1', 'stage-3');
  rewireOverviewEdge(map, 'overview-edge-2', 'stage-2', 'stage-4');
});

/**
 * Единственный модуль, забравший все этапы, и НИ ОДНОГО ребра уровня 1.
 *
 * moduleEdges именно ОТСУТСТВУЮТ, а не пусты: с пустым массивом подмена
 * hasModules на «map.moduleEdges !== undefined» выживает, с отсутствующим —
 * краснеет. Карта из одного модуля рисует одну карточку, и связывать ей нечего,
 * так что форма эта не выдуманная.
 */
const singleModuleMap: ProcessMap = buildVariant(
  'единственный модуль без связей уровня 1',
  (map) => {
    map.modules = [{ ...moduleOf(map, MODULE_DEMAND), stageIds: map.stages.map((s) => s.id) }];
    const withOptionalFields: ProcessMap = map;
    delete withOptionalFields.moduleEdges;
  },
);

/**
 * Карта с ПУСТЫМ списком модулей, собранная руками — мимо схемы.
 *
 * Схема такую отвергает (.min(1)), но ТИП ProcessMap её допускает, а карты в
 * этом проекте собираются в коде: черновик в src/data/bpmn/adapter.ts, фикстуры
 * тестов. Здесь краснеет hasModules без проверки длины.
 */
const emptyModulesMap: ProcessMap = { ...twoLevelMap, modules: [] };

describe('hasModules: сколько у карты уровней', () => {
  it('трёхуровневая карта: да', () => {
    expect(hasModules(baseMap)).toBe(true);
  });

  it('двухуровневая карта: нет', () => {
    expect(hasModules(twoLevelMap)).toBe(false);
  });

  it('единственный модуль — трёхуровневая карта, даже без связей уровня 1', () => {
    // Один модуль — это уровень 1 с одной карточкой. Пропускать его нельзя:
    // документ терял бы и обретал целый экран от добавления второго модуля.
    expect(singleModuleMap.moduleEdges, 'вариант обязан быть без moduleEdges').toBeUndefined();
    expect(hasModules(singleModuleMap)).toBe(true);
  });

  it('пустой список модулей — двухуровневая карта', () => {
    expect(hasModules(emptyModulesMap)).toBe(false);
  });

  it('ответ не зависит от id карты', () => {
    // Прямой сторож запрета «map.id === "..."» (SPEC §3): признак живёт в
    // modules, и подмена id его не меняет ни в ту, ни в другую сторону.
    const threeLevelAsSnp = buildVariant('трёхуровневая карта с id snp', (map) => {
      map.id = 'snp';
    });
    const twoLevelAsInplan: ProcessMap = ProcessMapSchema.parse({
      ...buildSampleProcessMap(),
      id: 'inplan',
    });
    expect(hasModules(threeLevelAsSnp), 'id snp, но модули есть').toBe(true);
    expect(hasModules(twoLevelAsInplan), 'id inplan, но модулей нет').toBe(false);
  });

  it('сужает тип: после проверки modules читаются без восклицательного знака', () => {
    // Компилируемость этого блока и есть проверка: без предиката map.modules
    // здесь имел бы тип Module[] | undefined.
    const map: ProcessMap = baseMap;
    if (!hasModules(map)) {
      throw new Error('фикстура обязана быть трёхуровневой');
    }
    expect(map.modules.map((module) => module.id)).toEqual([...MODULE_IDS]);
  });
});

describe('moduleById', () => {
  it.each([...MODULE_IDS])('находит модуль "%s"', (moduleId) => {
    expect(moduleById(baseMap, moduleId)?.id).toBe(moduleId);
  });

  it('неизвестный id — undefined: это и есть признак «модуль не найден»', () => {
    // На нём стоит вторая защита экрана уровня 2 (process-map-9mn.16), а не на
    // пустом результате stagesOfModule: пустым он бывает и у существующего
    // модуля с висящими stageIds.
    expect(moduleById(baseMap, 'no-such-module')).toBeUndefined();
  });

  it('null — undefined: на уровне 1 ни один модуль не выбран', () => {
    expect(moduleById(baseMap, null)).toBeUndefined();
  });

  it('двухуровневая карта — undefined при любом id', () => {
    expect(moduleById(twoLevelMap, MODULE_DEMAND)).toBeUndefined();
    expect(moduleById(twoLevelMap, null)).toBeUndefined();
  });
});

describe('moduleOfStage', () => {
  it('находит владельца каждого этапа', () => {
    // Сравнение с ОБЪЯВЛЕННЫМ составом фикстуры, а не с вычисленным из карты:
    // иначе тест повторил бы реализацию и согласился бы с ней в любом случае.
    const owners = baseMap.stages.map((stage) => [stage.id, moduleOfStage(baseMap, stage.id)?.id]);
    expect(owners).toEqual([
      ['stage-1', MODULE_DEMAND],
      ['stage-2', MODULE_DEMAND],
      ['stage-3', MODULE_SUPPLY],
      ['stage-4', MODULE_SUPPLY],
      ['stage-5', MODULE_SUPPLY],
      ['stage-6', MODULE_PRODUCTION],
      ['stage-7', MODULE_PRODUCTION],
    ]);
  });

  it('чересполосный состав: владелец берётся из stageIds, а не из соседства номеров', () => {
    // На канонической фикстуре «модуль по диапазону номеров» неотличим от
    // правильного ответа, здесь — краснеет.
    expect(moduleOfStage(interleavedMap, 'stage-1')?.id, 'stage-1').toBe(MODULE_DEMAND);
    expect(moduleOfStage(interleavedMap, 'stage-2')?.id, 'stage-2').toBe(MODULE_SUPPLY);
    expect(moduleOfStage(interleavedMap, 'stage-3')?.id, 'stage-3').toBe(MODULE_DEMAND);
    expect(moduleOfStage(interleavedMap, 'stage-4')?.id, 'stage-4').toBe(MODULE_SUPPLY);
  });

  it('неизвестный этап — undefined', () => {
    expect(moduleOfStage(baseMap, 'stage-42')).toBeUndefined();
  });

  it('двухуровневая карта — undefined у существующего этапа', () => {
    expect(moduleOfStage(twoLevelMap, twoLevelMap.stages[0]!.id)).toBeUndefined();
  });
});

describe('stagesOfModule', () => {
  it.each([...MODULE_IDS])('модуль "%s" отдаёт свои этапы в порядке stageIds', (moduleId) => {
    expect(stagesOfModule(baseMap, moduleId).map((stage) => stage.id)).toEqual([
      ...MODULE_STAGE_IDS[moduleId]!,
    ]);
  });

  it('обратный порядок stageIds сохраняется: порядок документа не подставляется', () => {
    expect(stagesOfModule(reversedOrderMap, MODULE_SUPPLY).map((stage) => stage.id)).toEqual(
      REVERSED_SUPPLY_STAGE_IDS,
    );
  });

  it('обратный порядок не сортируется по stage.number: молчаливой починки данных нет', () => {
    // Сортировка разошлась бы с indexOf в бейдже «Этап k из n», который смотрит
    // в stageIds, и оба экрана продолжали бы выглядеть рабочими.
    expect(stagesOfModule(reversedOrderMap, MODULE_SUPPLY).map((stage) => stage.number)).toEqual([
      5, 4, 3,
    ]);
  });

  it('чересполосный состав: отдаются заявленные этапы, а не диапазон и не срез', () => {
    expect(
      stagesOfModule(interleavedMap, MODULE_DEMAND).map((stage) => stage.id),
      MODULE_DEMAND,
    ).toEqual(INTERLEAVED_DEMAND_STAGE_IDS);
    expect(
      stagesOfModule(interleavedMap, MODULE_SUPPLY).map((stage) => stage.id),
      MODULE_SUPPLY,
    ).toEqual(INTERLEAVED_SUPPLY_STAGE_IDS);
  });

  it('позиция этапа внутри модуля считается по stageIds: бейдж «Этап k из n»', () => {
    // Форма вызова — дословно та, какой её возьмёт process-map-9mn.17:
    // k = module.stageIds.indexOf(stage.id) + 1. Индекс в результате
    // stagesOfModule и k в бейдже обязаны быть одним и тем же числом, иначе
    // карточка и её подпись разойдутся.
    const stages = stagesOfModule(reversedOrderMap, MODULE_SUPPLY);
    const module = moduleById(reversedOrderMap, MODULE_SUPPLY);
    expect(module).toBeDefined();
    expect(
      stages.map((stage) => `Этап ${module!.stageIds.indexOf(stage.id) + 1} из ${stages.length}`),
    ).toEqual(['Этап 1 из 3', 'Этап 2 из 3', 'Этап 3 из 3']);
    // И это ДРУГИЕ числа, чем сквозные номера этапов: номер остаётся адресом
    // (?stage=N), а не подписью.
    expect(stages.map((stage) => stage.number)).toEqual([5, 4, 3]);
  });

  it('неизвестный модуль — пусто, а не все этапы карты', () => {
    expect(stagesOfModule(baseMap, 'no-such-module')).toEqual([]);
  });

  it('null на трёхуровневой карте — пусто: экран у этого состояния другой', () => {
    expect(stagesOfModule(baseMap, null)).toEqual([]);
    expect(currentScreen(baseMap, { currentModuleId: null, currentStageId: null })).toBe('modules');
  });

  it('двухуровневая карта — map.stages ТОЙ ЖЕ ССЫЛКОЙ, при любом moduleId', () => {
    // Две разные вещи в одном тесте намеренно: обе про одну строку кода —
    // ранний выход по hasModules ДО поиска модуля.
    //
    // 1. Ссылка: результат уходит в useMemo построения графа (Overview.tsx),
    //    новый массив пересобирал бы граф на каждый рендер.
    // 2. Мусорный moduleId: залипшее от прошлой карты значение или ?module= в
    //    адресе иначе оставили бы обзор двухуровневой карты пустым полотном.
    expect(stagesOfModule(twoLevelMap, null), 'null').toBe(twoLevelMap.stages);
    expect(stagesOfModule(twoLevelMap, MODULE_DEMAND), 'чужой модуль').toBe(twoLevelMap.stages);
    expect(stagesOfModule(emptyModulesMap, MODULE_DEMAND), 'modules: []').toBe(
      emptyModulesMap.stages,
    );
  });
});

describe('overviewEdgesOf', () => {
  /** Рёбра обзора по модулям — объявленные, а не вычисленные из карты. */
  const EXPECTED_EDGE_IDS: Readonly<Record<string, readonly string[]>> = {
    [MODULE_DEMAND]: ['overview-edge-1', 'overview-edge-5'],
    [MODULE_SUPPLY]: ['overview-edge-2', 'overview-edge-3', 'overview-edge-6', 'overview-edge-7'],
    [MODULE_PRODUCTION]: ['overview-edge-4'],
  };

  it.each([...MODULE_IDS])('модуль "%s" получает рёбра, касающиеся его этапов', (moduleId) => {
    expect(overviewEdgesOf(baseMap, moduleId).map((edge) => edge.id)).toEqual([
      ...EXPECTED_EDGE_IDS[moduleId]!,
    ]);
  });

  it('интеграционное ребро, где СИСТЕМА ИСТОЧНИК, остаётся на экране модуля', () => {
    // Проверка отдельная от «системы приёмником» ниже, и обе обязаны падать по
    // отдельности: реализация filter((e) => own.has(e.target)) выбросила бы
    // ровно эти рёбра, и на экране модуля пропала бы входящая стрелка от
    // системы — экран при этом выглядел бы рабочим.
    expect(
      overviewEdgesOf(baseMap, MODULE_DEMAND).map((edge) => edge.id),
      'DP ← DP',
    ).toContain('overview-edge-5');
    expect(
      overviewEdgesOf(baseMap, MODULE_SUPPLY).map((edge) => edge.id),
      'SNP ← ERP',
    ).toContain('overview-edge-7');
  });

  it('интеграционное ребро, где СИСТЕМА ПРИЁМНИК, остаётся на экране модуля', () => {
    // Зеркало предыдущей: её одну оставляет зелёной односторонняя реализация
    // filter((e) => own.has(e.source)), самая правдоподобная из неверных.
    expect(
      overviewEdgesOf(baseMap, MODULE_SUPPLY).map((edge) => edge.id),
      'SNP → PS',
    ).toContain('overview-edge-6');
  });

  it('кросс-модульных рёбер на экране модуля нет ни одного', () => {
    for (const moduleId of MODULE_IDS) {
      const own = new Set(MODULE_STAGE_IDS[moduleId]!);
      const foreignStages = new Set(
        baseMap.stages.map((stage) => stage.id).filter((id) => !own.has(id)),
      );
      for (const edge of overviewEdgesOf(baseMap, moduleId)) {
        expect(foreignStages.has(edge.source), `${edge.id}: source — чужой этап`).toBe(false);
        expect(foreignStages.has(edge.target), `${edge.id}: target — чужой этап`).toBe(false);
      }
    }
  });

  it('неизвестный модуль — пусто, а не все рёбра карты', () => {
    expect(overviewEdgesOf(baseMap, 'no-such-module')).toEqual([]);
    expect(overviewEdgesOf(baseMap, null)).toEqual([]);
  });

  it('двухуровневая карта — map.overviewEdges ТОЙ ЖЕ ССЫЛКОЙ, при любом moduleId', () => {
    expect(overviewEdgesOf(twoLevelMap, null), 'null').toBe(twoLevelMap.overviewEdges);
    expect(overviewEdgesOf(twoLevelMap, MODULE_DEMAND), 'чужой модуль').toBe(
      twoLevelMap.overviewEdges,
    );
  });
});

describe('уровень 2 целиком: этапы и рёбра берутся парой', () => {
  // Форма вызова — та, какой её возьмёт buildOverviewGraph (process-map-9mn.17):
  // {stages, overviewEdges} одного модуля. Проверяется то, что не видно ни в
  // одной из двух функций по отдельности: результаты согласованы между собой.
  it.each([...MODULE_IDS])('модуль "%s": у каждого ребра конец на экране', (moduleId) => {
    const stages = stagesOfModule(baseMap, moduleId);
    const edges = overviewEdgesOf(baseMap, moduleId);
    const visible = new Set(stages.map((stage) => stage.id));

    expect(stages.length, 'модуль без этапов — тупик на экране').toBeGreaterThan(0);
    expect(edges.length, 'модуль без рёбер: нечем отличить от «вернул пусто»').toBeGreaterThan(0);
    for (const edge of edges) {
      expect(
        visible.has(edge.source) || visible.has(edge.target),
        `${edge.id}: ни один конец не нарисован на экране модуля`,
      ).toBe(true);
    }
  });
});

describe('currentScreen', () => {
  interface ScreenCase {
    readonly map: ProcessMap;
    readonly mapName: string;
    readonly currentModuleId: string | null;
    readonly currentStageId: string | null;
    readonly screen: MapScreen;
  }

  // Таблица ЦЕЛИКОМ: три формы карты × четыре состояния. Две клетки выглядят
  // невозможными, и выбрасывать их нельзя — каждая держит мутанта, которого не
  // держит никто другой:
  //   - «3 уровня, модуль не задан, этап задан → steps» единственная убивает
  //     «модуль проверяется раньше этапа» и «steps требует и модуль, и этап».
  //     Состояние достижимо из deep-link ?stage=7 без ?module=.
  //   - «2 уровня, модуль задан, этап не задан → stages» единственная убивает
  //     «посторонний currentModuleId создаёт экран модулей». Состояние
  //     возникает от ?module=dp на двухуровневой карте.
  const cases: readonly ScreenCase[] = [
    {
      map: twoLevelMap,
      mapName: '2 уровня',
      currentModuleId: null,
      currentStageId: null,
      screen: 'stages',
    },
    {
      map: twoLevelMap,
      mapName: '2 уровня',
      currentModuleId: null,
      currentStageId: 'stage-2',
      screen: 'steps',
    },
    {
      map: twoLevelMap,
      mapName: '2 уровня',
      currentModuleId: MODULE_DEMAND,
      currentStageId: null,
      screen: 'stages',
    },
    {
      map: twoLevelMap,
      mapName: '2 уровня',
      currentModuleId: MODULE_DEMAND,
      currentStageId: 'stage-2',
      screen: 'steps',
    },
    {
      map: baseMap,
      mapName: '3 уровня',
      currentModuleId: null,
      currentStageId: null,
      screen: 'modules',
    },
    {
      map: baseMap,
      mapName: '3 уровня',
      currentModuleId: null,
      currentStageId: 'stage-3',
      screen: 'steps',
    },
    {
      map: baseMap,
      mapName: '3 уровня',
      currentModuleId: MODULE_SUPPLY,
      currentStageId: null,
      screen: 'stages',
    },
    {
      map: baseMap,
      mapName: '3 уровня',
      currentModuleId: MODULE_SUPPLY,
      currentStageId: 'stage-3',
      screen: 'steps',
    },
    {
      map: singleModuleMap,
      mapName: '3 уровня, один модуль',
      currentModuleId: null,
      currentStageId: null,
      screen: 'modules',
    },
    {
      map: singleModuleMap,
      mapName: '3 уровня, один модуль',
      currentModuleId: null,
      currentStageId: 'stage-1',
      screen: 'steps',
    },
    {
      map: singleModuleMap,
      mapName: '3 уровня, один модуль',
      currentModuleId: MODULE_DEMAND,
      currentStageId: null,
      screen: 'stages',
    },
    {
      map: singleModuleMap,
      mapName: '3 уровня, один модуль',
      currentModuleId: MODULE_DEMAND,
      currentStageId: 'stage-1',
      screen: 'steps',
    },
  ];

  it.each(cases)(
    '$mapName: модуль $currentModuleId, этап $currentStageId → $screen',
    ({ map, currentModuleId, currentStageId, screen }) => {
      expect(currentScreen(map, { currentModuleId, currentStageId })).toBe(screen);
    },
  );

  it('не проверяет существование модуля и этапа: отвечает про уровень, а не про валидность', () => {
    // Так же устроен сегодняшний App.tsx. Возврат из тупика живёт эффектом в
    // самом экране (StageDetail.tsx), потому что смена состояния во время
    // рендера — это рендер во время рендера.
    expect(
      currentScreen(baseMap, { currentModuleId: 'no-such-module', currentStageId: null }),
      'несуществующий модуль',
    ).toBe('stages');
    expect(
      currentScreen(baseMap, { currentModuleId: MODULE_SUPPLY, currentStageId: 'stage-42' }),
      'несуществующий этап',
    ).toBe('steps');
  });
});
