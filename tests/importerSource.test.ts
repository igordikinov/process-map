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
        "label": "Группа SNP",
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

${EDGES}
${ENRICHMENT}
${EXTERNAL_IO}
${GROUP_SPLIT}

def self_test() -> None:
    # Похожий литерал в функции — не объявление верхнего уровня.
    fake = (
        {"map": "snp", "task": "self-test", "stage": 1},
    )
`;

/** Синтетика с заменённым фрагментом: чтобы испортить одну таблицу, не трогая остальные. */
function withReplaced(fragment: string, replacement: string): string {
  expect(SOURCE, 'фрагмент для замены не найден — тест испортил бы не то').toContain(fragment);
  return SOURCE.replace(fragment, replacement);
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

  it('запись, где map стоит не первым, отвергается с именем таблицы и задачи', () => {
    expect(() => readDecisionTable(mapSecond, 'OWNER_DECISION_EXTERNAL_IO')).toThrow(
      /OWNER_DECISION_EXTERNAL_IO, запись 3, process-map-x3 \(строка \d+ scripts\/import-pptx\.py\): первым ключом записи обязан быть "map", а стоит "task"/,
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
      /STAGE_GROUP_SPLIT, строка \d+ scripts\/import-pptx\.py: значение не разобрано/,
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
});

// Тот же разбор на НАСТОЯЩЕМ импортёре: синтетика доказывает поведение, но не
// то, что формат scripts/import-pptx.py ему по-прежнему соответствует.
describe('scripts/import-pptx.py разбирается целиком', () => {
  const source = readImporterSource();

  it.each(DECISION_TABLES)('%s: все записи разобраны, у каждой map первым', (table) => {
    expect(readDecisionTable(source, table).length).toBeGreaterThan(0);
  });

  it('строковые константы карт читаются', () => {
    expect(readPythonString(source, 'MAP_ID')).toBe('snp');
    expect(readPythonString(source, 'MAP_ID_MRP')).toBe('mrp');
    expect(readPythonString(source, 'MAP_DATA_FINGERPRINT')).toMatch(/^[0-9a-f]{64}$/);
  });
});
