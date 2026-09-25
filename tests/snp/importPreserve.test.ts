import { describe, expect, it } from 'vitest';
import type { MapId } from '../../scripts/mapTarget.ts';
import {
  ProcessNodeSchema,
  ProcessMapSchema,
  StageSchema,
  SystemCodeSchema,
} from '../../src/data/schema.ts';
import { ru } from '../../src/i18n/ru.ts';
import processJson from '../../src/data/snp/process.json';
import {
  DECISION_TABLES,
  readDecisionTable,
  readGroupSplit,
  readImporterSource,
  readInputEnrichment,
  readOwnerDecisionEdges,
  readOwnerExternalIo,
  readPythonTuple,
} from '../helpers/importerSource.ts';

// Контракт между scripts/import-pptx.py и src/data/schema.ts (задача process-map-2dj).
//
// ЗАЧЕМ ЭТОТ ФАЙЛ
// ---------------
// Импортёр пересобирает src/data/snp/process.json из презентации С НУЛЯ. Полей,
// которых в презентации нет (ссылка на экран In.Plan `screen`, `owner`),
// он породить не может — их проставляет человек. Значит перегенерация обязана
// переносить их из предыдущего файла, иначе она их стирает. Ради ссылок карта
// и встроена в вики, поэтому цена молчаливой потери — вся ценность карты.
//
// Перенос реализован в Python (carry_over_manual_fields), и его СЕМАНТИКУ
// проверяет самопроверка самого скрипта:
//
//     python scripts/import-pptx.py --self-test
//
// Здесь, из vitest, проверяется то, что можно проверить без Python и что
// самопроверка проверить не может — согласованность с zod-схемой:
//   1) список переносимых полей не потерял `screen`/`owner`;
//   2) переносимые поля в схеме необязательные (перенос «ничего» валиден);
//   3) порядок ключей в импортёре совпадает с порядком ключей схемы — от этого
//      зависит побайтовое совпадение файла с экспортом из приложения
//      (src/utils/processTransfer.ts::serializeProcessMap прогоняет карту через
//      zod, который пересобирает объекты в порядке схемы);
//   4) реальный process.json этому порядку соответствует.
//
// Что здесь НЕ покрыто (покрыто --self-test): сам перенос по id, различение
// `screen: null` и отсутствия ключа, отчёт о потерянных узлах, идемпотентность.
//
// Исходник импортёра разбирает tests/helpers/importerSource.ts — один разборщик
// на все таблицы (process-map-n6h); его собственные тесты, на синтетическом
// исходнике двух карт, — tests/importerSource.test.ts.
const importerSource = readImporterSource();

/**
 * Карта, чьи решения владельца сверяются здесь с src/data/snp/process.json.
 *
 * Таблицы решений общие для всех карт, а запись относится к одной (ключ map,
 * process-map-9mn.13). Сверять запись другой карты с данными SNP — значит
 * гарантированно покраснеть: её этапа и её узлов в этом файле нет. Записи
 * других карт проверяют тесты их карт.
 */
const THIS_MAP = 'snp' satisfies MapId;

const nodeKeyOrder = readPythonTuple(importerSource, 'NODE_KEY_ORDER');
const stageKeyOrder = readPythonTuple(importerSource, 'STAGE_KEY_ORDER');
const preservedNodeFields = readPythonTuple(importerSource, 'PRESERVED_NODE_FIELDS');
const preservedStageFields = readPythonTuple(importerSource, 'PRESERVED_STAGE_FIELDS');

const map = ProcessMapSchema.parse(processJson);

/** Ключи объекта в порядке, объявленном в схеме. */
function schemaKeys(shape: Record<string, unknown>): string[] {
  return Object.keys(shape);
}

describe('import-pptx.py: контракт переноса ручных полей', () => {
  it('переносит ссылку на экран и ответственного — поля, которых нет в презентации', () => {
    expect(preservedNodeFields).toContain('screen');
    expect(preservedNodeFields).toContain('owner');
    expect(preservedStageFields).toContain('screen');
  });

  it('direction переносимым полем НЕ объявлен: его строит импортёр, а не человек', () => {
    // Задача process-map-24p: направление data-узла читается из презентации
    // (по происхождению фигуры), поэтому переносить его из предыдущего файла
    // нельзя — перенос означал бы, что импортёр тянет из старого JSON то, что
    // обязан вывести сам, и правка презентации перестала бы доезжать.
    expect(preservedNodeFields).not.toContain('direction');
    expect(nodeKeyOrder).toContain('direction');
  });

  it('все переносимые поля существуют в схеме и объявлены необязательными', () => {
    const nodeShape = ProcessNodeSchema.shape as Record<string, { isOptional(): boolean }>;
    for (const name of preservedNodeFields) {
      expect(schemaKeys(nodeShape), `ProcessNodeSchema.${name}`).toContain(name);
      expect(nodeShape[name]!.isOptional(), `ProcessNodeSchema.${name} должен быть optional`).toBe(
        true,
      );
    }
    const stageShape = StageSchema.shape as Record<string, { isOptional(): boolean }>;
    for (const name of preservedStageFields) {
      expect(schemaKeys(stageShape), `StageSchema.${name}`).toContain(name);
      expect(stageShape[name]!.isOptional(), `StageSchema.${name} должен быть optional`).toBe(true);
    }
  });

  it('порядок ключей импортёра совпадает с порядком ключей zod-схемы', () => {
    expect(nodeKeyOrder).toEqual(schemaKeys(ProcessNodeSchema.shape));
    expect(stageKeyOrder).toEqual(schemaKeys(StageSchema.shape));
  });

  it('ключи реального process.json лежат в этом же порядке', () => {
    const nodeIndex = new Map(nodeKeyOrder.map((key, index) => [key, index]));
    const stageIndex = new Map(stageKeyOrder.map((key, index) => [key, index]));

    for (const [index, stage] of map.stages.entries()) {
      const rawStage = (processJson as { stages: Record<string, unknown>[] }).stages[index]!;
      const stageKeys = Object.keys(rawStage);
      expect(
        stageKeys.filter((key) => !stageIndex.has(key)),
        `этап ${stage.id}`,
      ).toEqual([]);
      const stagePositions = stageKeys.map((key) => stageIndex.get(key)!);
      expect(
        [...stagePositions].sort((a, b) => a - b),
        `этап ${stage.id}`,
      ).toEqual(stagePositions);

      const rawNodes = rawStage['nodes'] as Record<string, unknown>[];
      for (const rawNode of rawNodes) {
        const keys = Object.keys(rawNode);
        const label = `узел ${String(rawNode['id'])}`;
        expect(
          keys.filter((key) => !nodeIndex.has(key)),
          label,
        ).toEqual([]);
        const positions = keys.map((key) => nodeIndex.get(key)!);
        expect(
          [...positions].sort((a, b) => a - b),
          label,
        ).toEqual(positions);
      }
    }
  });
});

// Рёбра по решению владельца процесса (задача process-map-7bz).
//
// ЗАЧЕМ ЭТОТ БЛОК. Дописать такое ребро прямо в process.json нельзя: импортёр
// пересобирает файл с нуля, и следующий `npm run data` его сотрёт — тот же
// дефект, что чинила process-map-2dj для ссылок на экраны. Поэтому решение
// живёт объявлением в scripts/import-pptx.py, а тест сторожит связь между
// объявлением и файлом в ОБЕ стороны:
//   · объявлено, но в JSON нет — значит, объявление перестало применяться;
//   · в JSON есть, а объявления нет — значит, ребро дописали руками, и оно
//     не переживёт следующей перегенерации.
//
// ТАБЛИЦЫ РАЗБИРАЮТСЯ ВНУТРИ it, А НЕ В ТЕЛЕ describe — здесь и во всех блоках
// решений ниже. Разборщик на пропавшей или испорченной таблице бросает
// исключение (process-map-n6h), а исключение при сборе файла унесло бы с собой
// все остальные проверки этого файла, и стало бы непонятно, какое именно
// условие нарушено. Внутри it оно роняет ИМЕНОВАННУЮ проверку.
describe('import-pptx.py: рёбра по решению владельца процесса', () => {
  const decisions = () => readOwnerDecisionEdges(importerSource, THIS_MAP);

  it('объявление не потеряно и называет задачу-основание', () => {
    const declared = decisions();
    expect(
      declared.length,
      'в OWNER_DECISION_EDGES (scripts/import-pptx.py) нет записей карты snp — ' +
        'решения владельца процесса не переживут следующий npm run data',
    ).toBeGreaterThan(0);
    for (const decision of declared) {
      expect(decision.task, 'источник решения').toMatch(/^process-map-/);
      expect(decision.targets.length).toBeGreaterThan(0);
    }
  });

  it('каждое объявленное ребро есть в process.json и его концы — узлы того же этапа', () => {
    for (const decision of decisions()) {
      const stage = map.stages.find((candidate) => candidate.number === decision.stage);
      expect(stage, `этап ${decision.stage}`).toBeDefined();
      const nodeIds = new Set(stage!.nodes.map((node) => node.id));
      const edgeIds = new Set(stage!.edges.map((edge) => edge.id));

      expect(nodeIds.has(decision.source), `${decision.source}: узел-источник`).toBe(true);
      for (const target of decision.targets) {
        expect(nodeIds.has(target), `${target}: узел-приёмник`).toBe(true);
        expect(
          edgeIds.has(`e-${decision.source}--${target}`),
          `${decision.task}: ребро ${decision.source} → ${target} не доехало в process.json`,
        ).toBe(true);
      }
    }
  });

  it('группа «Публикация планов» связана целиком — решение 7bz применено', () => {
    const stage = map.stages.find((candidate) => candidate.number === 3);
    expect(stage).toBeDefined();
    const group = stage!.nodes.filter((node) => node.group === 'publikaciya-planov');
    expect(group.length).toBe(4);
    const targets = new Set(stage!.edges.map((edge) => edge.target));
    expect(group.filter((node) => !targets.has(node.id)).map((node) => node.id)).toEqual([]);
  });
});

// Внешняя система, которую автоматика взять не могла (OWNER_DECISION_EXTERNAL_IO,
// process-map-vjz.5): ExternalIO собирается, только когда в тексте нашлись И
// код системы, И направление, а во фразе «Управление транзакционными данными»
// нет ни того, ни другого — код назвал владелец. Тест сторожит, что объявление
// не потерялось и доехало в данные: импортёр пересобирает process.json с нуля,
// и правка прямо в JSON не пережила бы следующий npm run data.
//
// Именно в эту таблицу следующими придут записи карты In.Plan — отбор по
// THIS_MAP здесь не формальность.
describe('import-pptx.py: внешние системы по решению владельца', () => {
  const declared = () => readOwnerExternalIo(importerSource, THIS_MAP);

  it('объявление не потеряно и называет задачу-основание', () => {
    const entries = declared();
    expect(
      entries.length,
      'в OWNER_DECISION_EXTERNAL_IO (scripts/import-pptx.py) нет записей карты snp — ' +
        'названный владельцем источник данных не переживёт следующий npm run data',
    ).toBeGreaterThan(0);
    for (const entry of entries) {
      expect(entry.task, 'источник решения').toMatch(/^process-map-/);
      expect(['in', 'out']).toContain(entry.direction);
    }
  });

  it('код системы объявлен в схеме — иначе zod отверг бы карту', () => {
    // Прямая связка Python ↔ TypeScript: код, названный владельцем, обязан
    // существовать в SystemCode. Без этой проверки рассинхрон всплыл бы уже
    // падением разбора process.json, то есть позже и невнятнее.
    for (const entry of declared()) {
      expect(SystemCodeSchema.options as readonly string[]).toContain(entry.system);
    }
  });

  it('объявленная система доехала в process.json своим этапом и направлением', () => {
    for (const entry of declared()) {
      const stage = map.stages.find((candidate) => candidate.number === entry.stage);
      expect(stage, `этап ${entry.stage}`).toBeDefined();
      const bucket = entry.direction === 'in' ? stage!.inputs : stage!.outputs;
      const found = bucket.find((io) => io.label === entry.label);
      expect(found, `${entry.task}: «${entry.label}» не доехало в process.json`).toBeDefined();
      expect(found!.system).toBe(entry.system);
    }
  });
});

// Входы, взятые со слайда ОБЗОРА вместо слайда детализации
// (STAGE_INPUT_ENRICHMENT, process-map-qjl). Причина отдельного объявления та
// же, что у рёбер выше: импортёр пересобирает process.json с нуля, и правка
// подписи прямо в JSON не пережила бы следующий npm run data.
// Тест сторожит связь в ОБЕ стороны: объявленное обязано быть в JSON, а
// заменённая короткая формулировка — из JSON исчезнуть. Без второй половины
// проверка осталась бы зелёной, даже если бы замена перестала применяться и в
// файле лежали ОБА варианта строки.
describe('import-pptx.py: входы по слайду обзора', () => {
  const enrichments = () => readInputEnrichment(importerSource, THIS_MAP);

  it('объявление не потеряно и называет задачу-основание', () => {
    const entries = enrichments();
    expect(
      entries.length,
      'в STAGE_INPUT_ENRICHMENT (scripts/import-pptx.py) нет записей карты snp — ' +
        'решения владельца по формулировкам не переживут следующий npm run data',
    ).toBeGreaterThan(0);
    for (const entry of entries) {
      expect(entry.task, 'источник решения').toMatch(/^process-map-/);
      expect(entry.add.length + entry.expand.length).toBeGreaterThan(0);
    }
  });

  it('добавленные строки доехали в process.json входами своего этапа', () => {
    for (const entry of enrichments()) {
      const stage = map.stages.find((candidate) => candidate.number === entry.stage);
      expect(stage, `этап ${entry.stage}`).toBeDefined();
      const inputs = stage!.nodes.filter((node) => node.type === 'data' && node.direction === 'in');
      const labels = new Set(inputs.map((node) => node.label));
      for (const extra of entry.add) {
        expect(
          labels.has(extra),
          `${entry.task}: «${extra}» не доехало в process.json входом этапа ${entry.stage}`,
        ).toBe(true);
      }
    }
  });

  it('переформулированные строки заменены, а не продублированы', () => {
    for (const entry of enrichments()) {
      const stage = map.stages.find((candidate) => candidate.number === entry.stage);
      expect(stage, `этап ${entry.stage}`).toBeDefined();
      const labels = new Set(stage!.nodes.map((node) => node.label));
      for (const { short, full } of entry.expand) {
        expect(labels.has(full), `${entry.task}: «${full}» не доехало в process.json`).toBe(true);
        expect(
          labels.has(short),
          `${entry.task}: «${short}» осталось в process.json — замена не применилась`,
        ).toBe(false);
      }
    }
  });
});

// Деление узлов этапа на группы, которого на слайде детализации нет
// (STAGE_GROUP_SPLIT, process-map-028). Причина отдельного объявления та же,
// что у рёбер и входов выше: импортёр пересобирает process.json с нуля. Тест
// сторожит связь в ОБЕ стороны — объявленные узлы обязаны лежать в новой
// группе, а сама группа обязана существовать у этапа.
describe('import-pptx.py: деление группы по решению владельца', () => {
  const splits = () => readGroupSplit(importerSource, THIS_MAP);

  it('объявление не потеряно и называет задачу-основание', () => {
    const entries = splits();
    expect(
      entries.length,
      'в STAGE_GROUP_SPLIT (scripts/import-pptx.py) нет записей карты snp — ' +
        'деление групп не переживёт следующий npm run data',
    ).toBeGreaterThan(0);
    for (const split of entries) {
      expect(split.task, 'источник решения').toMatch(/^process-map-/);
      expect(split.nodes.length).toBeGreaterThan(0);
    }
  });

  it('новая группа есть у этапа, и объявленные узлы лежат именно в ней', () => {
    for (const split of splits()) {
      const stage = map.stages.find((candidate) => candidate.number === split.stage);
      expect(stage, `этап ${split.stage}`).toBeDefined();

      const group = stage!.groups.find((candidate) => candidate.label === split.label);
      expect(
        group,
        `${split.task}: группа «${split.label}» не доехала в process.json`,
      ).toBeDefined();

      const byLabel = new Map(stage!.nodes.map((node) => [node.label, node]));
      for (const label of split.nodes) {
        const node = byLabel.get(label);
        expect(node, `${split.task}: узла «${label}» нет на этапе ${split.stage}`).toBeDefined();
        expect(
          node!.group,
          `${split.task}: «${label}» остался в прежней группе — деление не применилось`,
        ).toBe(group!.id);
      }
    }
  });
});

// Правило 7v1: узел, назвавший внешнюю систему и направление, стоит на границе
// с ней — значит это интеграция, даже если в презентации у него обычная заливка
// шага. Серый цвет A6A6A6 есть только у входящих интеграций слайдов 3-4;
// исходящие слайда 5 нарисованы как обычные шаги, поэтому опознать их можно
// только по коду системы.
describe('import-pptx.py: интеграции по коду системы (process-map-7v1)', () => {
  const withSystem = map.stages.flatMap((stage) =>
    stage.nodes.filter((node) => node.system !== undefined),
  );

  it('узлы с кодом системы вообще есть — иначе правило проверять не на чем', () => {
    expect(withSystem.length).toBeGreaterThan(0);
  });

  it('каждый узел с кодом системы — интеграция, ни одного шага', () => {
    const steps = withSystem.filter((node) => node.type === 'step');
    expect(
      steps.map((node) => node.label),
      'узел назвал внешнюю систему, но остался шагом — правило 7v1 перестало применяться',
    ).toEqual([]);
  });
});

// Заголовок перечня — не артефакт процесса (process-map-t9j). Признак заголовка
// («первый абзац оканчивается двоеточием») живёт в импортёре одной функцией
// block_items_start и применяется в двух местах: при выборе keyOutputs и при
// создании узлов-выходов. Раньше он применялся только в первом, и заголовок
// «Опубликованные планы:» уезжал в данные отдельной карточкой.
describe('import-pptx.py: заголовок блока не становится узлом', () => {
  it('ни одна подпись узла не оканчивается двоеточием', () => {
    const offenders = map.stages.flatMap((stage) =>
      stage.nodes.filter((node) => node.label.trimEnd().endsWith(':')).map((node) => node.id),
    );
    expect(
      offenders,
      'подпись с двоеточием на конце — это заголовок перечня со слайда, а не узел процесса',
    ).toEqual([]);
  });

  it('признак заголовка вынесен в общую функцию, а не продублирован', () => {
    // Дубль правила и был причиной дефекта: выбор keyOutputs его знал, создание
    // узлов — нет. Тест сторожит, что мест объявления ровно одно, а применений
    // больше одного.
    const declarations = [...importerSource.matchAll(/^def block_items_start\(/gm)];
    const usages = [...importerSource.matchAll(/block_items_start\(/g)];
    expect(declarations).toHaveLength(1);
    expect(
      usages.length,
      'функция объявлена, но вызывается меньше двух раз — правило снова живёт в одном месте',
    ).toBeGreaterThanOrEqual(3);
  });
});

// Коды внешних систем объявлены дважды: союзом в схеме (TypeScript) и кортежем
// в импортёре (Python). Прямой сверки между ними не было ни одной — рассинхрон
// всплыл бы только после того, как новый код уже попал в process.json и уронил
// ProcessMapSchema.parse. Этот тест ловит его раньше и без Python (process-map-32r).
describe('import-pptx.py: коды систем согласованы со схемой', () => {
  const fromPython = readPythonTuple(importerSource, 'SYSTEM_CODES');
  const fromSchema = [...SystemCodeSchema.options];

  it('списки совпадают по составу', () => {
    expect([...fromPython].sort(), 'SYSTEM_CODES в импортёре разошёлся с SystemCodeSchema').toEqual(
      [...fromSchema].sort(),
    );
  });

  it('ни один код не является префиксом другого', () => {
    // SYSTEM_RE собирается альтернацией из этого списка, а она жадная слева
    // направо: код-префикс другого кода начал бы перехватывать чужие тексты,
    // и порядок в кортеже стал бы значимым.
    const conflicts = fromSchema.flatMap((code) =>
      fromSchema
        .filter((other) => other !== code && other.startsWith(code))
        .map((other) => `${code} → ${other}`),
    );
    expect(conflicts).toEqual([]);
  });

  it('у каждого кода есть запись в словаре расшифровок', () => {
    // Дублирует satisfies Record<SystemCode, string> в ru.ts, но на другом
    // уровне: satisfies ловит забытую запись на tsc, а этот тест назовёт код.
    const missing = fromSchema.filter((code) => ru.systems[code] === undefined);
    expect(missing, 'код есть в союзе, но не в ru.systems').toEqual([]);
  });
});

// Ключ `map` в таблицах решений владельца (process-map-9mn.13).
//
// Решение владельца относится к ОДНОЙ карте. Пока карта была одна, таблицы
// применялись безусловно, и это не проявлялось. Третья карта пойдёт тем же
// профилем разбора, что и SNP, и тогда запись без ключа либо остановит её
// сборку («этапа 3 нет в презентации»), либо — хуже — применится к ней молча,
// совпав номером этапа.
//
// Правило проверяется у ВСЕХ записей таблицы, какой бы карте они ни относились,
// — и проверяет его сам разбор, а не этот блок: readDecisionTable разбирает
// каждую запись (словарь, map ПЕРВЫМ ключом и непустой строкой) ДО отбора по
// карте, и все читатели блоков выше идут через него. Значит, запись чужой карты
// без ключа уронила бы и их — но под именами «рёбра», «входы», «группы», по
// которым не понять, какое правило нарушено. Этот блок нужен, чтобы то же
// исключение пришло под проверкой, названной по правилу и по таблице.
// Раньше здесь сравнивалось число вхождений "map": и "task": (process-map-9mn.13);
// теперь запись разбирается целиком (process-map-n6h). Первым — потому что так
// же требует самопроверка импортёра, а она в CI не запускается.
//
// На настоящем импортёре таблицы проверяются только здесь; поведение разбора на
// нарушениях — синтетикой в tests/importerSource.test.ts.
describe('import-pptx.py: решения владельца привязаны к карте', () => {
  it.each(DECISION_TABLES)('%s: у каждой записи ключ map стоит первым', (table) => {
    // Нарушение — исключение readDecisionTable с именем таблицы, задачей и
    // строкой импортёра; пустая таблица — тоже исключение. Проверять длину
    // результата отдельно незачем: пустым он вернуться не может.
    expect(() => readDecisionTable(importerSource, table)).not.toThrow();
  });
});
