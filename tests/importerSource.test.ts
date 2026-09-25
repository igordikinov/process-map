// Разборщик исходника импортёра (tests/helpers/importerSource.ts, process-map-n6h)
// на СИНТЕТИЧЕСКОМ исходнике двух карт.
//
// ЗАЧЕМ СИНТЕТИКА. Отбор записей по ключу map нечем проверить на настоящем
// импортёре: сегодня все записи всех четырёх таблиц — карты snp, и фильтр,
// который ничего не отбирает, на нём неотличим от фильтра, который отбирает
// правильно. Первые записи другой карты придут следующими задачами — и тогда
// выяснять, работает ли фильтр, будет поздно: без него
// tests/snp/importPreserve.test.ts сверит запись чужой карты с данными SNP и
// покраснеет по причине, не имеющей отношения к правке. Две карты в синтетике
// делают фильтр различимым уже сейчас.
//
// Синтетика повторяет устройство настоящих таблиц — аннотация типа, склейка
// строк в why, кортеж из одного элемента с запятой, кортеж пар, комментарий со
// скобками и кавычками внутри записи, висячие запятые, — иначе тест доказывал
// бы разбор не того формата. Записи другой карты стоят в таблицах и перед
// записями snp, и после: фильтр «первые N» так не пройдёт.
//
// Сверх настоящего формата в ней две ловушки для разбора. Подпись группы SNP
// записана строкой в скобках группировки `("Группа " "SNP")` — в поле, которое
// читатель ЧИТАЕТ. В настоящем импортёре так записаны why всех четырёх таблиц и
// source у STAGE_INPUT_ENRICHMENT, и значения ни того, ни другого читатели не
// берут — разбор лишь обязан через них пройти. source читается только у
// OWNER_DECISION_EDGES (readOwnerDecisionEdges), но там это id узла одной
// строкой, без скобок. Значит, ЗНАЧЕНИЕ склейки в скобках на настоящем
// импортёре не сверяет никто — это делает ловушка. А в функции self_test ПЕРЕД
// таблицами лежит литерал с именем таблицы — объявлением верхнего уровня он не
// является.
import { describe, expect, it } from 'vitest';
import {
  DECISION_TABLES,
  readDecisionBlock,
  readDecisionTable,
  readGroupSplit,
  readImporterSource,
  readInputEnrichment,
  readOwnerDecisionEdges,
  readOwnerExternalIo,
  readPythonString,
  readPythonTuple,
} from './helpers/importerSource.ts';

const EDGES = `OWNER_DECISION_EDGES: tuple[dict, ...] = (
    {
        "map": "snp",
        "task": "process-map-e1",
        "stage": 3,
        "source": "snp-istochnik",
        "targets": (
            "snp-priemnik-1",
            "snp-priemnik-2",
        ),
        "kind": "process",
        "why": (
            "решение по SNP, "
            "записанное в две строки"
        ),
    },
    {
        "map": "inplan",
        "task": "process-map-e2",
        "stage": 2,
        "source": "inplan-istochnik",
        "targets": ("inplan-priemnik",),
        "kind": "process",
        "why": "решение по In.Plan",
    },
)
`;

const ENRICHMENT = `STAGE_INPUT_ENRICHMENT: tuple[dict, ...] = (
    {
        "map": "inplan",
        "task": "process-map-n1",
        "stage": 1,
        "add": (),
        "expand": (("Коротко", "Длинно (In.Plan)"),),
        "why": "решение по In.Plan",
    },
    {
        "map": "snp",
        "task": "process-map-n2",
        "stage": 4,
        "sid": 164,
        "source": (
            "слайд 2, текстбокс [164] — «мастер-данные» этапа 4"
        ),
        "add": ("Новая строка SNP",),
        # Слева — формулировка слайда 6 (она попадает в модель), справа — "слайда 2".
        "expand": (
            ("ОСГ", "Остаточный срок годности (ОСГ)"),
            ("Аллокация", "Резервы (аллокация)"),
        ),
        "why": "решение по SNP",
    },
)
`;

const EXTERNAL_IO = `OWNER_DECISION_EXTERNAL_IO: tuple[dict, ...] = (
    {
        "map": "inplan",
        "task": "process-map-x1",
        "stage": 2,
        "system": "DP",
        "label": "Выход In.Plan",
        "direction": "out",
        "why": "решение по In.Plan",
    },
    {
        "map": "snp",
        "task": "process-map-x2",
        "stage": 1,
        "system": "ERP",
        "label": "Вход SNP",
        "direction": "in",
        "why": "решение по SNP",
    },
    {
        "map": "inplan",
        "task": "process-map-x3",
        "stage": 3,
        "system": "BI",
        "label": "Второй выход In.Plan",
        "direction": "out",
        "why": "решение по In.Plan",
    },
)
`;

const GROUP_SPLIT = `STAGE_GROUP_SPLIT: tuple[dict, ...] = (
    {
        "map": "snp",
        "task": "process-map-g1",
        "stage": 4,
        "label": ("Группа " "SNP"),
        "nodes": (
            "Узел SNP 1",
            "Узел SNP 2",
        ),
        "why": "решение по SNP",
    },
    {
        "map": "inplan",
        "task": "process-map-g2",
        "stage": 5,
        "label": "Группа In.Plan",
        "nodes": ("Узел In.Plan",),
        "why": "решение по In.Plan",
    },
)
`;

const SOURCE = `# Синтетический исходник: устройство как у scripts/import-pptx.py.
MAP_ID = "snp"
MAP_ID_MRP = "mrp"

SYSTEM_CODES = ("DP", "ERP", "BI")

NODE_KEY_ORDER = (
    "id",
    # Комментарий со "словом в кавычках" и (скобками) — прежняя регулярка
    # кортежа обрывалась на первой скобке и брала слово в кавычках элементом.
    "type",
    "label",
)

def self_test() -> None:
    # Литерал с ИМЕНЕМ таблицы, но в функции — не объявление верхнего уровня.
    # Стоит ПЕРЕД настоящей таблицей нарочно: разбор, потерявший привязку к
    # первой колонке, начал бы таблицу отсюда и дочитал бы до «)» настоящей.
    OWNER_DECISION_EDGES = (
        {"map": "snp", "task": "self-test", "stage": 1},
    )

${EDGES}
${ENRICHMENT}
${EXTERNAL_IO}
${GROUP_SPLIT}
`;

/** Синтетика с заменённым фрагментом: чтобы испортить одну таблицу, не трогая остальные. */
function withReplaced(fragment: string, replacement: string): string {
  expect(SOURCE, 'фрагмент для замены не найден — тест испортил бы не то').toContain(fragment);
  return SOURCE.replace(fragment, replacement);
}

/**
 * Номер строки (с единицы) первой строки `source`, содержащей `needle`. Считается
 * независимо от разборщика — разбиением на строки, а не смещением, — чтобы
 * сверять номера из его сообщений, а не повторять его арифметику.
 */
function lineNumberOf(source: string, needle: string): number {
  const index = source.split('\n').findIndex((line) => line.includes(needle));
  expect(index, `«${needle}» в синтетике не найдено`).toBeGreaterThanOrEqual(0);
  return index + 1;
}

describe('таблицы решений: отбор по ключу map', () => {
  it('рёбра: карта получает только свои записи', () => {
    expect(readOwnerDecisionEdges(SOURCE, 'snp')).toEqual([
      {
        map: 'snp',
        task: 'process-map-e1',
        stage: 3,
        source: 'snp-istochnik',
        targets: ['snp-priemnik-1', 'snp-priemnik-2'],
      },
    ]);
    expect(readOwnerDecisionEdges(SOURCE, 'inplan')).toEqual([
      {
        map: 'inplan',
        task: 'process-map-e2',
        stage: 2,
        source: 'inplan-istochnik',
        targets: ['inplan-priemnik'],
      },
    ]);
  });

  it('входы со слайда обзора: карта получает только свои записи', () => {
    expect(readInputEnrichment(SOURCE, 'snp')).toEqual([
      {
        map: 'snp',
        task: 'process-map-n2',
        stage: 4,
        add: ['Новая строка SNP'],
        expand: [
          { short: 'ОСГ', full: 'Остаточный срок годности (ОСГ)' },
          { short: 'Аллокация', full: 'Резервы (аллокация)' },
        ],
      },
    ]);
    expect(readInputEnrichment(SOURCE, 'inplan')).toEqual([
      {
        map: 'inplan',
        task: 'process-map-n1',
        stage: 1,
        add: [],
        expand: [{ short: 'Коротко', full: 'Длинно (In.Plan)' }],
      },
    ]);
  });

  it('внешние системы: карта получает только свои записи', () => {
    // Именно в эту таблицу следующими придут записи карты In.Plan.
    expect(readOwnerExternalIo(SOURCE, 'snp')).toEqual([
      {
        map: 'snp',
        task: 'process-map-x2',
        stage: 1,
        system: 'ERP',
        label: 'Вход SNP',
        direction: 'in',
      },
    ]);
    expect(readOwnerExternalIo(SOURCE, 'inplan').map((entry) => entry.task)).toEqual([
      'process-map-x1',
      'process-map-x3',
    ]);
  });

  it('деление групп: карта получает только свои записи', () => {
    expect(readGroupSplit(SOURCE, 'snp')).toEqual([
      {
        map: 'snp',
        task: 'process-map-g1',
        stage: 4,
        label: 'Группа SNP',
        nodes: ['Узел SNP 1', 'Узел SNP 2'],
      },
    ]);
    expect(readGroupSplit(SOURCE, 'inplan').map((entry) => entry.task)).toEqual(['process-map-g2']);
  });

  it('карта без решений в таблице получает пустой список, а не чужие записи', () => {
    // Пустой ОТБОР — законный ответ: у карты может не быть решений этого рода.
    // Решать, нормально ли это, — «не потеряно»-проверкам её собственных тестов.
    expect(readOwnerDecisionEdges(SOURCE, 'mrp')).toEqual([]);
    expect(readInputEnrichment(SOURCE, 'mrp')).toEqual([]);
    expect(readOwnerExternalIo(SOURCE, 'mrp')).toEqual([]);
    expect(readGroupSplit(SOURCE, 'mrp')).toEqual([]);
  });

  it('readDecisionTable отдаёт записи ВСЕХ карт в порядке объявления', () => {
    expect(readDecisionTable(SOURCE, 'OWNER_DECISION_EXTERNAL_IO').map((r) => r.map)).toEqual([
      'inplan',
      'snp',
      'inplan',
    ]);
  });

  it('форма записей чужой карты не мешает читать свою', () => {
    // Карта In.Plan собирается не из презентации, и её записи вправе нести
    // другой набор ключей — здесь без stage. Поля читаются ПОСЛЕ отбора, поэтому
    // SNP этого не замечает, а сама In.Plan получает внятную ошибку с ключом.
    const source = withReplaced(
      `        "task": "process-map-x1",
        "stage": 2,`,
      `        "task": "process-map-x1",
        "node": "inplan-uzel",`,
    );
    expect(readOwnerExternalIo(source, 'snp').map((entry) => entry.task)).toEqual([
      'process-map-x2',
    ]);
    expect(() => readOwnerExternalIo(source, 'inplan')).toThrow(
      /OWNER_DECISION_EXTERNAL_IO, запись 1, process-map-x1 .*нет ключа "stage"/,
    );
  });
});

describe('таблицы решений: ключ map — первый ключ каждой записи', () => {
  // Правило структурное и касается ВСЕХ записей таблицы: испорчена здесь запись
  // ЧУЖОЙ карты, а читается SNP — и чтение обязано упасть. Иначе нарушение в
  // записи, которую никто из читающих не отбирает, не увидел бы никто.
  const mapSecond = withReplaced(
    `        "map": "inplan",
        "task": "process-map-x3",`,
    `        "task": "process-map-x3",
        "map": "inplan",`,
  );

  it('запись, где map стоит не первым, отвергается с именем таблицы, задачи и строкой', () => {
    // Номер строки — точный, а не «какое-то число»: сообщение отправляет читать
    // импортёр в определённое место, и сдвиг на единицу отправил бы не туда.
    // «{» записи — строкой выше её "task".
    const recordLine = lineNumberOf(mapSecond, '"task": "process-map-x3"') - 1;
    expect(() => readDecisionTable(mapSecond, 'OWNER_DECISION_EXTERNAL_IO')).toThrow(
      `OWNER_DECISION_EXTERNAL_IO, запись 3, process-map-x3 (строка ${recordLine} ` +
        'scripts/import-pptx.py): первым ключом записи обязан быть "map", а стоит "task"',
    );
  });

  it('чтение СВОЕЙ карты тоже отвергает таблицу с такой записью', () => {
    expect(() => readOwnerExternalIo(mapSecond, 'snp')).toThrow(/первым ключом записи/);
  });

  it('запись вовсе без map отвергается тем же правилом', () => {
    const noMap = withReplaced(
      `        "map": "inplan",
        "task": "process-map-g2",
`,
      `        "task": "process-map-g2",
`,
    );
    expect(() => readGroupSplit(noMap, 'snp')).toThrow(
      /STAGE_GROUP_SPLIT, запись 2, process-map-g2 .*первым ключом записи обязан быть "map", а стоит "task"/,
    );
  });

  it('map не строкой — тоже ошибка, а не запись «ничьей» карты', () => {
    const noneMap = withReplaced(
      `        "map": "inplan",
        "task": "process-map-e2",`,
      `        "map": None,
        "task": "process-map-e2",`,
    );
    expect(() => readOwnerDecisionEdges(noneMap, 'snp')).toThrow(
      /OWNER_DECISION_EDGES, запись 2, process-map-e2 .*"map" обязано быть непустой строкой/,
    );
  });

  it('пустое имя карты — ошибка, а не запись карты по имени ""', () => {
    // Опечатка или недописанная правка. Прими её разбор, запись ушла бы из
    // проверок ВСЕХ карт — тихо укоротившийся список, ровно то, от чего эта
    // задача уходит; «не потеряно»-проверки заметили бы это, только когда
    // пропали бы все записи карты в таблице.
    const emptyMap = withReplaced(
      `        "map": "inplan",
        "task": "process-map-e2",`,
      `        "map": "",
        "task": "process-map-e2",`,
    );
    expect(() => readOwnerDecisionEdges(emptyMap, 'snp')).toThrow(
      /OWNER_DECISION_EDGES, запись 2, process-map-e2 .*"map" обязано быть непустой строкой/,
    );
  });
});

describe('таблицы решений: объявление только верхнего уровня', () => {
  it('литерал с именем таблицы внутри функции не считается объявлением', () => {
    // В SOURCE перед настоящей OWNER_DECISION_EDGES стоит одноимённый литерал
    // в self_test (с отступом). Разбор, принявший его за таблицу, прочитал бы
    // запись self-test — или, дочитав до «)» настоящей таблицы, упал бы.
    expect(readOwnerDecisionEdges(SOURCE, 'snp').map((entry) => entry.task)).toEqual([
      'process-map-e1',
    ]);
  });

  it('таблица с именем-суффиксом не считается второй таблицей', () => {
    // Зеркало проверки «имя-префикс» ниже: INPLAN_STAGE_GROUP_SPLIT —
    // правдоподобное имя таблицы другой карты, и оканчивается оно именем
    // настоящей. Без привязки к началу строки разбор нашёл бы в нём
    // STAGE_GROUP_SPLIT: второе объявление (ложная тревога) или — пропади
    // настоящая таблица — тихое чтение чужой.
    const suffixed = `${SOURCE}
INPLAN_STAGE_GROUP_SPLIT: tuple[dict, ...] = (
    {
        "map": "inplan",
        "task": "process-map-g9",
        "stage": 1,
        "label": "Чужая группа",
        "nodes": ("Чужой узел",),
    },
)
`;
    expect(readGroupSplit(suffixed, 'snp').map((entry) => entry.task)).toEqual(['process-map-g1']);
    expect(readGroupSplit(suffixed, 'inplan').map((entry) => entry.task)).toEqual([
      'process-map-g2',
    ]);
  });
});

describe('python-литерал: скобки, запятые и строки', () => {
  it('строка в скобках без запятой — строка, а не кортеж из одной строки', () => {
    // `("Группа " "SNP")` — скобки группировки вокруг склейки двух литералов.
    // Кортежем из одного элемента это было бы только с запятой.
    expect(readGroupSplit(SOURCE, 'snp').map((entry) => entry.label)).toEqual(['Группа SNP']);
  });

  it('кортеж из одного элемента без запятой — строка, и читатель кортежа её отвергает', () => {
    // Для Python ("inplan-priemnik") — строка, и импортёр перебрал бы её
    // ПОСИМВОЛЬНО: пятнадцать «приёмников» из одной буквы. Разбор, прочитавший
    // её как кортеж из одного id, остался бы зелёным.
    const noComma = withReplaced(
      '"targets": ("inplan-priemnik",),',
      '"targets": ("inplan-priemnik"),',
    );
    expect(() => readOwnerDecisionEdges(noComma, 'inplan')).toThrow(
      /OWNER_DECISION_EDGES, запись 2, process-map-e2 .*"targets" обязан быть кортежем строк/,
    );
  });

  it('таблица из одной записи без висячей запятой — исключение: для Python это словарь', () => {
    // Сегодня во всех четырёх настоящих таблицах ровно по одной записи, так что
    // это не теоретический случай: стёртая запятая после «}» — и импортёр
    // перебирает КЛЮЧИ словаря, падая в decisions_for.
    const single = `STAGE_GROUP_SPLIT: tuple[dict, ...] = (
    {
        "map": "snp",
        "task": "process-map-g1",
        "stage": 4,
        "label": "Группа SNP",
        "nodes": ("Узел SNP 1",),
    }
)
`;
    expect(() => readGroupSplit(withReplaced(GROUP_SPLIT, single), 'snp')).toThrow(
      /STAGE_GROUP_SPLIT .*таблица из одной записи без запятой — для Python это словарь/,
    );
    // С висячей запятой та же запись — законный кортеж из одной записи.
    const singleWithComma = single.replace('    }\n)', '    },\n)');
    expect(readGroupSplit(withReplaced(GROUP_SPLIT, singleWithComma), 'snp')).toEqual([
      {
        map: 'snp',
        task: 'process-map-g1',
        stage: 4,
        label: 'Группа SNP',
        nodes: ['Узел SNP 1'],
      },
    ]);
  });

  it('повторённый ключ записи — исключение, а не молча последнее значение', () => {
    const twice = withReplaced(
      '"stage": 5,',
      `"stage": 5,
        "stage": 6,`,
    );
    expect(() => readGroupSplit(twice, 'snp')).toThrow(
      /STAGE_GROUP_SPLIT, .*ключ «stage» повторён/,
    );
  });
});

describe('таблицы решений: промах — исключение, а не пустой список', () => {
  it('ненайденная таблица названа в исключении', () => {
    expect(() => readDecisionBlock(SOURCE, 'OWNER_DECISION_NOWHERE')).toThrow(
      /не найдена таблица OWNER_DECISION_NOWHERE/,
    );
  });

  it('типизированный читатель на исходнике без таблицы падает, а не отдаёт []', () => {
    const without = withReplaced(EXTERNAL_IO, '');
    expect(() => readOwnerExternalIo(without, 'snp')).toThrow(
      /не найдена таблица OWNER_DECISION_EXTERNAL_IO/,
    );
  });

  it('имя таблицы не совпадает с именем-префиксом', () => {
    // OWNER_DECISION_EDGES_INPLAN — правдоподобное имя будущей таблицы; без
    // границы слова разбор OWNER_DECISION_EDGES мог бы найти её.
    const renamed = withReplaced(
      'OWNER_DECISION_EDGES: tuple',
      'OWNER_DECISION_EDGES_INPLAN: tuple',
    );
    expect(() => readDecisionBlock(renamed, 'OWNER_DECISION_EDGES')).toThrow(
      /не найдена таблица OWNER_DECISION_EDGES/,
    );
  });

  it('найденная, но пустая таблица — исключение, как в самопроверке импортёра', () => {
    const empty = withReplaced(
      GROUP_SPLIT,
      `STAGE_GROUP_SPLIT: tuple[dict, ...] = (
    # все решения сняты
)
`,
    );
    expect(() => readGroupSplit(empty, 'snp')).toThrow(/STAGE_GROUP_SPLIT .*записей в ней нет/);
  });

  it('таблица, объявленная дважды, — исключение: Python взял бы последнюю, разбор — первую', () => {
    const twice = `${SOURCE}\n${GROUP_SPLIT}`;
    expect(() => readGroupSplit(twice, 'snp')).toThrow(/STAGE_GROUP_SPLIT .*объявлена 2 раза/);
  });

  it('CRLF-копия исходника даёт исключение с диагнозом, а не «таблица пуста»', () => {
    const crlf = SOURCE.replaceAll('\n', '\r\n');
    expect(() => readDecisionBlock(crlf, 'OWNER_DECISION_EDGES')).toThrow(/CRLF/);
  });

  it('нераспознанное значение в записи — исключение со строкой, а не пропуск записи', () => {
    // Прежние регулярки на запись такую запись молча не находили, и список
    // становился короче без единого сообщения.
    const call = withReplaced('"stage": 5,', '"stage": int("5"),');
    expect(() => readGroupSplit(call, 'snp')).toThrow(
      `STAGE_GROUP_SPLIT, строка ${lineNumberOf(call, 'int("5")')} scripts/import-pptx.py: ` +
        'значение не разобрано',
    );
  });
});

describe('константы верхнего уровня', () => {
  it('кортеж строк читается мимо комментариев со скобками и кавычками', () => {
    expect(readPythonTuple(SOURCE, 'NODE_KEY_ORDER')).toEqual(['id', 'type', 'label']);
    expect(readPythonTuple(SOURCE, 'SYSTEM_CODES')).toEqual(['DP', 'ERP', 'BI']);
  });

  it('строковая константа читается по точному имени, а не по префиксу', () => {
    expect(readPythonString(SOURCE, 'MAP_ID')).toBe('snp');
    expect(readPythonString(SOURCE, 'MAP_ID_MRP')).toBe('mrp');
  });

  it('промах и неверный тип — исключение с именем константы', () => {
    expect(() => readPythonTuple(SOURCE, 'NOWHERE_KEY_ORDER')).toThrow(
      /не найдена константа NOWHERE_KEY_ORDER/,
    );
    expect(() => readPythonTuple(SOURCE, 'MAP_ID')).toThrow(/MAP_ID .*не кортеж строк/);
    expect(() => readPythonString(SOURCE, 'SYSTEM_CODES')).toThrow(/SYSTEM_CODES .*не строка/);
  });

  it('выражение, начинающееся с литерала, — исключение, а не литерал без хвоста', () => {
    // Python вычислил бы всё выражение; разбор, отрезавший хвост, сверял бы
    // тесты с тем, чего в импортёре нет.
    expect(() =>
      readPythonTuple('SYSTEM_CODES = ("DP", "ERP") + EXTRA_CODES\n', 'SYSTEM_CODES'),
    ).toThrow(/SYSTEM_CODES, строка 1 .*это выражение, а не литерал/);
    expect(() => readPythonString('MAP_ID = "snp" if X else "mrp"\n', 'MAP_ID')).toThrow(
      /MAP_ID, строка 1 .*это выражение, а не литерал/,
    );
  });

  it('комментарий после значения допустим', () => {
    expect(readPythonString('MAP_ID = "snp"  # карта по умолчанию\n', 'MAP_ID')).toBe('snp');
    expect(readPythonTuple('CODES = (\n    "DP",\n)  # коды\nOTHER = 1\n', 'CODES')).toEqual([
      'DP',
    ]);
  });

  it('перевод строки вне скобок завершает значение, внутри скобок — нет', () => {
    // `"snp"` и `"other"` на соседних строках — два оператора Python, а не
    // склейка "snpother"; в скобках те же две строки — одна склеенная строка.
    expect(readPythonString('MAP_ID = "snp"\n"other"\n', 'MAP_ID')).toBe('snp');
    expect(readPythonString('MAP_ID = (\n    "sn"\n    "p"\n)\n', 'MAP_ID')).toBe('snp');
  });
});

// Тот же разбор на НАСТОЯЩЕМ импортёре: синтетика доказывает поведение, но не
// то, что формат scripts/import-pptx.py ему по-прежнему соответствует.
describe('scripts/import-pptx.py разбирается целиком', () => {
  const source = readImporterSource();

  // Структурные правила таблиц решений владельца (process-map-9mn.13): запись —
  // словарь, ключ map стоит ПЕРВЫМ и назван непустой строкой, таблица не пуста
  // и остаётся кортежем.
  //
  // Решение владельца относится к ОДНОЙ карте. Пока карта была одна, таблицы
  // применялись безусловно, и это не проявлялось. Третья карта пойдёт тем же
  // профилем разбора, что и SNP, и тогда запись без ключа либо остановит её
  // сборку («этапа 3 нет в презентации»), либо — хуже — применится к ней молча,
  // совпав номером этапа. Первым — потому что так же требует самопроверка
  // импортёра, а она в CI не запускается. Раньше вместо разбора сравнивалось
  // число вхождений "map": и "task":; теперь запись разбирается целиком
  // (process-map-n6h).
  //
  // Правила касаются ВСЕХ записей ВСЕХ карт, поэтому живут здесь, а не в тестах
  // одной карты: tests/snp/ сверяет с данными только записи SNP. Проверяет их
  // сам разбор: readDecisionTable разбирает каждую запись ДО отбора по карте, и
  // все типизированные читатели идут через него. Запись чужой карты без ключа
  // уронила бы поэтому и тесты карт — но под именами «рёбра», «входы», «группы»,
  // по которым не понять, какое правило нарушено. Здесь то же исключение
  // приходит под проверкой, названной по правилу и по таблице.
  it.each(DECISION_TABLES)('%s: все записи разобраны, у каждой ключ map стоит первым', (table) => {
    // Нарушение — исключение readDecisionTable с именем таблицы, задачей и
    // строкой импортёра; пустая таблица — тоже исключение. Проверять длину
    // результата отдельно незачем: пустым он вернуться не может.
    expect(() => readDecisionTable(source, table)).not.toThrow();
  });

  it('строковые константы карт читаются', () => {
    expect(readPythonString(source, 'MAP_ID')).toBe('snp');
    expect(readPythonString(source, 'MAP_ID_MRP')).toBe('mrp');
    expect(readPythonString(source, 'MAP_DATA_FINGERPRINT')).toMatch(/^[0-9a-f]{64}$/);
  });
});
