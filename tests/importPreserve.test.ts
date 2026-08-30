import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ProcessNodeSchema,
  ProcessMapSchema,
  StageSchema,
  SystemCodeSchema,
} from '../src/data/schema.ts';
import { ru } from '../src/i18n/ru.ts';
import processJson from '../src/data/process.json';

// Контракт между scripts/import-pptx.py и src/data/schema.ts (задача process-map-2dj).
//
// ЗАЧЕМ ЭТОТ ФАЙЛ
// ---------------
// Импортёр пересобирает src/data/process.json из презентации С НУЛЯ. Полей,
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

// import.meta.url под vitest+jsdom — не file:-URL (см. scripts/layout.ts::jsonPath),
// поэтому путь берётся от корня прогона. Отсутствие файла уронит тест на
// readFileSync — это и есть нужное поведение, молча пропускать нечего.
const IMPORTER_PATH = resolve(process.cwd(), 'scripts', 'import-pptx.py');
const importerSource = readFileSync(IMPORTER_PATH, 'utf8');

/** Читает python-кортеж строковых констант верхнего уровня по имени. */
function readPythonTuple(name: string): string[] {
  const match = new RegExp(`^${name}\\s*=\\s*\\(([^)]*)\\)`, 'm').exec(importerSource);
  if (match === null) {
    throw new Error(`В scripts/import-pptx.py не найдена константа ${name}`);
  }
  return [...match[1]!.matchAll(/"([^"]+)"/g)].map((item) => item[1]!);
}

interface OwnerDecision {
  task: string;
  stage: number;
  source: string;
  targets: string[];
}

/**
 * Читает OWNER_DECISION_EDGES из scripts/import-pptx.py — объявление рёбер,
 * которых в презентации НЕТ (задача process-map-7bz). Разбор регуляркой, а не
 * запуском Python: тест обязан работать там, где интерпретатора нет.
 */
function readOwnerDecisionEdges(): OwnerDecision[] {
  // Разбор ограничен объявлением верхнего уровня: похожие литералы в других
  // местах файла (например, фикстура самопроверки) сюда попасть не должны.
  const block = /^OWNER_DECISION_EDGES[^\n]*=\s*\(\n([\s\S]*?)\n\)\n/m.exec(importerSource);
  // Пустой список вместо исключения — намеренно: «объявление исчезло» должно
  // ронять ИМЕНОВАННУЮ проверку ниже, а не сборку файла. Падение на этапе
  // сбора унесло бы вместе с собой и остальные тесты этого файла, и стало бы
  // непонятно, какое именно условие нарушено.
  if (block === null) {
    return [];
  }
  const pattern =
    /"task":\s*"([^"]+)",\s*"stage":\s*(\d+),\s*"source":\s*"([^"]+)",\s*"targets":\s*\(([\s\S]*?)\)/g;
  return [...block[1]!.matchAll(pattern)].map((match) => ({
    task: match[1]!,
    stage: Number(match[2]!),
    source: match[3]!,
    targets: [...match[4]!.matchAll(/"([^"]+)"/g)].map((item) => item[1]!),
  }));
}

const nodeKeyOrder = readPythonTuple('NODE_KEY_ORDER');
const stageKeyOrder = readPythonTuple('STAGE_KEY_ORDER');
const preservedNodeFields = readPythonTuple('PRESERVED_NODE_FIELDS');
const preservedStageFields = readPythonTuple('PRESERVED_STAGE_FIELDS');

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
describe('import-pptx.py: рёбра по решению владельца процесса', () => {
  const decisions = readOwnerDecisionEdges();

  it('объявление не потеряно и называет задачу-основание', () => {
    expect(
      decisions.length,
      'OWNER_DECISION_EDGES в scripts/import-pptx.py пуст или не найден — ' +
        'решения владельца процесса не переживут следующий npm run data',
    ).toBeGreaterThan(0);
    for (const decision of decisions) {
      expect(decision.task, 'источник решения').toMatch(/^process-map-/);
      expect(decision.targets.length).toBeGreaterThan(0);
    }
  });

  it('каждое объявленное ребро есть в process.json и его концы — узлы того же этапа', () => {
    for (const decision of decisions) {
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

/**
 * Читает STAGE_INPUT_ENRICHMENT из scripts/import-pptx.py — входы этапа, взятые
 * со слайда ОБЗОРА вместо слайда детализации (задача process-map-qjl). Разбор
 * регуляркой по той же причине, что и у OWNER_DECISION_EDGES: интерпретатора
 * Python в CI нет.
 */
function readInputEnrichment(): InputEnrichment[] {
  const block = /^STAGE_INPUT_ENRICHMENT[^\n]*=\s*\(\n([\s\S]*?)\n\)\n/m.exec(importerSource);
  // Пустой список вместо исключения — как и выше: «объявление исчезло» обязано
  // ронять именованную проверку, а не сбор файла целиком.
  if (block === null) {
    return [];
  }
  const entries =
    /"task":\s*"([^"]+)",[\s\S]*?"stage":\s*(\d+),[\s\S]*?"add":\s*\(([\s\S]*?)\),\s*(?:#[^\n]*\n\s*)*"expand":\s*\(([\s\S]*?)\n\s*\),/g;
  return [...block[1]!.matchAll(entries)].map((match) => ({
    task: match[1]!,
    stage: Number(match[2]!),
    add: [...match[3]!.matchAll(/"([^"]+)"/g)].map((item) => item[1]!),
    expand: [...match[4]!.matchAll(/\(\s*"([^"]+)",\s*"([^"]+)",?\s*\)/g)].map((item) => ({
      short: item[1]!,
      full: item[2]!,
    })),
  }));
}

interface InputEnrichment {
  task: string;
  stage: number;
  add: string[];
  expand: { short: string; full: string }[];
}

// Входы, взятые со слайда обзора (process-map-qjl). Причина отдельного
// объявления та же, что у рёбер выше: импортёр пересобирает process.json с
// нуля, и правка подписи прямо в JSON не пережила бы следующий npm run data.
// Тест сторожит связь в ОБЕ стороны: объявленное обязано быть в JSON, а
// заменённая короткая формулировка — из JSON исчезнуть. Без второй половины
// проверка осталась бы зелёной, даже если бы замена перестала применяться и в
// файле лежали ОБА варианта строки.
describe('import-pptx.py: входы по слайду обзора', () => {
  const enrichments = readInputEnrichment();

  it('объявление не потеряно и называет задачу-основание', () => {
    expect(
      enrichments.length,
      'STAGE_INPUT_ENRICHMENT в scripts/import-pptx.py пуст или не найден — ' +
        'решения владельца по формулировкам не переживут следующий npm run data',
    ).toBeGreaterThan(0);
    for (const entry of enrichments) {
      expect(entry.task, 'источник решения').toMatch(/^process-map-/);
      expect(entry.add.length + entry.expand.length).toBeGreaterThan(0);
    }
  });

  it('добавленные строки доехали в process.json входами своего этапа', () => {
    for (const entry of enrichments) {
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
    for (const entry of enrichments) {
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

/**
 * Читает STAGE_GROUP_SPLIT из scripts/import-pptx.py — деление узлов этапа на
 * группы, которого на слайде детализации нет (задача process-map-028).
 */
function readGroupSplit(): GroupSplit[] {
  const block = /^STAGE_GROUP_SPLIT[^\n]*=\s*\(\n([\s\S]*?)\n\)\n/m.exec(importerSource);
  if (block === null) {
    return [];
  }
  const entries =
    /"task":\s*"([^"]+)",\s*"stage":\s*(\d+),\s*"label":\s*"([^"]+)",\s*"nodes":\s*\(([\s\S]*?)\),/g;
  return [...block[1]!.matchAll(entries)].map((match) => ({
    task: match[1]!,
    stage: Number(match[2]!),
    label: match[3]!,
    nodes: [...match[4]!.matchAll(/"([^"]+)"/g)].map((item) => item[1]!),
  }));
}

interface GroupSplit {
  task: string;
  stage: number;
  label: string;
  nodes: string[];
}

// Деление группы по решению владельца (process-map-028). Причина отдельного
// объявления та же, что у рёбер и входов выше: импортёр пересобирает
// process.json с нуля. Тест сторожит связь в ОБЕ стороны — объявленные узлы
// обязаны лежать в новой группе, а сама группа обязана существовать у этапа.
describe('import-pptx.py: деление группы по решению владельца', () => {
  const splits = readGroupSplit();

  it('объявление не потеряно и называет задачу-основание', () => {
    expect(
      splits.length,
      'STAGE_GROUP_SPLIT в scripts/import-pptx.py пуст или не найден — ' +
        'деление групп не переживёт следующий npm run data',
    ).toBeGreaterThan(0);
    for (const split of splits) {
      expect(split.task, 'источник решения').toMatch(/^process-map-/);
      expect(split.nodes.length).toBeGreaterThan(0);
    }
  });

  it('новая группа есть у этапа, и объявленные узлы лежат именно в ней', () => {
    for (const split of splits) {
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
  const fromPython = readPythonTuple('SYSTEM_CODES');
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
