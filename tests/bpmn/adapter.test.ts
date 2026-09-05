// Адаптер BPMN → карта процесса, на настоящей модели владельца
// (process-map-70e.5).
//
// Файл обнаруживается на диске, а не называется в тесте по имени: модель
// сменится на v12, и тест обязан подхватить её сам. Отдельный сторож требует,
// чтобы хоть один .bpmn в репозитории был — иначе describe по пустому списку
// дал бы ноль тестов и зелёный прогон.
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { bpmnToProcessMap } from '../../src/data/bpmn/adapter';
import { densityMismatches } from '../../src/data/bpmn/report';
import { parseBpmnDocument } from '../../src/data/bpmn/xml';
import { ProcessMapSchema, validateIntegrity } from '../../src/data/schema.ts';
import { countOverlappingPairs, layoutStage, rectOf } from '../../src/layout/stageLayout.ts';

const ROOT = process.cwd();
const files = readdirSync(ROOT).filter((name) => name.toLowerCase().endsWith('.bpmn'));

describe('в репозитории есть схема BPMN', () => {
  it('найден хотя бы один .bpmn', () => {
    expect(files.length, 'нет ни одного .bpmn в корне репозитория').toBeGreaterThan(0);
  });
});

describe.each(files)('модель %s', (fileName) => {
  const text = readFileSync(resolve(ROOT, fileName), 'utf8');
  const parsed = parseBpmnDocument(text);
  if (parsed.status !== 'ok') {
    throw new Error(`файл не разобрался: ${parsed.reason}`);
  }
  const result = bpmnToProcessMap(parsed.doc, { fileName, lastModified: Date.now() });

  it('собирается в карту без блокеров', () => {
    expect(result.report.blockers).toEqual([]);
    expect(result.status).toBe('ok');
  });

  if (result.status !== 'ok') {
    return;
  }
  const map = result.map;

  it('карта проходит схему и проверку целостности', () => {
    expect(() => ProcessMapSchema.parse(map)).not.toThrow();
    expect(validateIntegrity(map)).toEqual([]);
  });

  it('id узлов уникальны глобально по документу', () => {
    const ids = map.stages.flatMap((stage) => stage.nodes.map((node) => node.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  /*
   * Схема пропускает пустую строку (z.string()), поэтому подпись сторожит
   * только этот тест. Безымянных элементов в модели десятки, и карточка без
   * подписи выглядела бы дефектом отрисовки.
   */
  it('у каждого узла и каждой группы непустая подпись', () => {
    for (const stage of map.stages) {
      for (const node of stage.nodes) {
        expect(node.label.trim(), `узел ${node.id} без подписи`).not.toBe('');
      }
      for (const group of stage.groups) {
        expect(group.label.trim(), `группа ${group.id} без подписи`).not.toBe('');
      }
    }
  });

  it('номера этапов идут 1..N без дыр', () => {
    const numbers = map.stages.map((stage) => stage.number);
    expect(numbers).toEqual(numbers.map((_, index) => index + 1));
  });

  /*
   * Пустой этап дал бы пустое полотно и карточку обзора, ведущую в никуда.
   * Ради этого пустые модули и пропускаются — а сторож нужен потому, что
   * пропуск легко случайно снять, и заметить это было бы негде.
   */
  it('ни один этап не пуст', () => {
    for (const stage of map.stages) {
      expect(stage.nodes.length, `этап ${stage.number} «${stage.shortTitle}» пуст`).toBeGreaterThan(
        0,
      );
    }
  });

  it('direction проставлен у всех узлов данных и только у них', () => {
    for (const stage of map.stages) {
      for (const node of stage.nodes) {
        if (node.type === 'data') {
          expect(node.direction, `data-узел ${node.id} без direction`).toBeDefined();
        } else {
          expect(node.direction, `у ${node.id} лишний direction`).toBeUndefined();
        }
      }
    }
  });

  /*
   * Та же метрика, которой судится build-time раскладка (tests/layout.test.ts).
   * Раскладку считает то же ядро, поэтому и требование к ней то же.
   */
  it('узлы этапа не накладываются друг на друга', () => {
    for (const stage of map.stages) {
      expect(
        countOverlappingPairs(stage.nodes.map(rectOf)),
        `этап ${stage.number} «${stage.shortTitle}»`,
      ).toBe(0);
    }
  });

  it('координаты равны пересчёту layoutStage — раскладка доведена до конца', () => {
    for (const stage of map.stages) {
      const placements = layoutStage(stage);
      for (const node of stage.nodes) {
        expect(node.position, `узел ${node.id}`).toEqual(placements.get(node.id));
      }
    }
  });

  it('slidePosition заполнен: геометрия источника не потеряна', () => {
    const without = map.stages.flatMap((stage) =>
      stage.nodes.filter((node) => node.slidePosition === undefined),
    );
    expect(without.map((node) => node.id)).toEqual([]);
  });

  /*
   * ГЛАВНЫЙ ТЕСТ ОТЧЁТА. Сумма исходов по каждому виду содержания обязана
   * равняться числу таких элементов в файле. Потерять элемент — значит не
   * сойтись в сложении, а не «не заметить».
   */
  it('арифметика плотности сходится', () => {
    expect(densityMismatches(result.report)).toEqual([]);
  });

  it('доля показанного отдаётся со знаменателем', () => {
    const { shown, inFile } = result.report.shownFlowNodes;
    expect(inFile).toBeGreaterThan(0);
    expect(shown).toBeGreaterThan(0);
    expect(shown).toBeLessThanOrEqual(inFile);
  });
});

/*
 * ЧИСЛА КОНКРЕТНОЙ МОДЕЛИ — в одной таблице и в одном месте.
 *
 * Красный здесь означает «модель изменилась, посмотри отчёт и обнови таблицу»,
 * а НЕ «адаптер сломан». Все проверки выше написаны так, что о содержании
 * файла не знают ничего и переживут переход на v12 без правок; знание про v11
 * собрано только здесь, чтобы обновление было одним блоком, а дифф показывал
 * ровно то, что изменилось.
 */
const MODEL_FACTS = {
  fileName: 'In.Plan Process Model v11.bpmn',
  exporter: 'Camunda Modeler 5.19.0',
  planes: 73,
  stages: 10,
  skipped: ['Optimizer - фичи по версиям- А. Репин', 'Price Planning'],
  shortTitles: [
    'DP',
    'SNP',
    'PS',
    'DM',
    'IO',
    'SOP',
    'TPP',
    'MRP',
    'MRP Планирование',
    'Replenishment',
  ],
  flowNodesShown: 314,
  flowNodesInFile: 911,
  edges: 224,
  dataNodes: 150,
  labelledGroups: 20,
  owners: 28,
  dataIn: 33,
  dataOut: 117,
  stagesWithKeyOutputs: 8,
  overviewEdges: 18,
} as const;

describe('модель In.Plan v11: содержание', () => {
  const text = readFileSync(resolve(ROOT, MODEL_FACTS.fileName), 'utf8');
  const parsed = parseBpmnDocument(text);
  if (parsed.status !== 'ok') {
    throw new Error(`файл не разобрался: ${parsed.reason}`);
  }
  const result = bpmnToProcessMap(parsed.doc, {
    fileName: MODEL_FACTS.fileName,
    lastModified: Date.UTC(2026, 1, 12),
  });
  if (result.status !== 'ok') {
    throw new Error(`карта не собралась: ${result.report.blockers.join('; ')}`);
  }
  const { map, report } = result;

  it('десять этапов из двенадцати модулей, два пустых пропущены', () => {
    expect(map.stages).toHaveLength(MODEL_FACTS.stages);
    expect(report.skippedModules.map((module) => module.name).sort()).toEqual(
      [...MODEL_FACTS.skipped].sort(),
    );
  });

  it('порядок этапов — порядок чтения корневой диаграммы, а не документный', () => {
    expect(map.stages.map((stage) => stage.shortTitle)).toEqual([...MODEL_FACTS.shortTitles]);
  });

  /*
   * ГЛАВНАЯ ЦИФРА, которую пользователь не ожидает: на карту попадает треть
   * содержания файла, остальное скрыто за свёрнутыми карточками подпроцессов —
   * ровно так же, как в самом Camunda Modeler.
   */
  it('показана треть узлов потока, и отчёт называет обе цифры', () => {
    expect(report.shownFlowNodes.shown).toBe(MODEL_FACTS.flowNodesShown);
    expect(report.shownFlowNodes.inFile).toBe(MODEL_FACTS.flowNodesInFile);
  });

  it('связи, данные, группы и исполнители', () => {
    const edges = map.stages.reduce((sum, stage) => sum + stage.edges.length, 0);
    const data = map.stages.flatMap((stage) => stage.nodes).filter((node) => node.type === 'data');
    const groups = map.stages.flatMap((stage) => stage.groups);
    const owners = map.stages
      .flatMap((stage) => stage.nodes)
      .filter((node) => node.owner !== undefined);
    expect(edges).toBe(MODEL_FACTS.edges);
    expect(data).toHaveLength(MODEL_FACTS.dataNodes);
    expect(groups).toHaveLength(MODEL_FACTS.labelledGroups);
    expect(owners).toHaveLength(MODEL_FACTS.owners);
  });

  /*
   * Подпись безымянной группы выводится из диапазона кодов её участников, а не
   * выдумывается: все 49 групп модели безымянны, `categoryValue` в файле нет.
   */
  it('подписи групп — диапазоны кодов участников', () => {
    const labels = map.stages.flatMap((stage) => stage.groups).map((group) => group.label);
    expect(labels).toContain('DP-030-010 … DP-030-040');
    for (const label of labels) {
      expect(label, `подпись группы «${label}» не похожа на код`).toMatch(/^[A-Z]{2,4}-\d/);
    }
  });

  /*
   * СТОРОЖ ПРОТИВ ПОВТОРЕНИЯ process-map-24p.
   *
   * Направление артефакта выводится из ПРОИСХОЖДЕНИЯ — есть ли у него
   * производитель внутри этапа, — а не из координат. Ровно на этом месте в
   * картах из презентаций уже был дефект: вывод колонки из геометрии дал «15
   * входов · 0 выходов» у этапов, чьи карточки перечисляли по три ключевых
   * выхода, и экран противоречил сам себе.
   *
   * Мутация «всегда считать по геометрии» не роняла ни одной другой проверки:
   * все они смотрят лишь на то, что direction ПРОСТАВЛЕН. Этот тест смотрит на
   * то, ЧЕМУ он равен.
   */
  it('направление данных выведено из происхождения, а не из координат', () => {
    const data = map.stages.flatMap((stage) => stage.nodes).filter((node) => node.type === 'data');
    expect(data.filter((node) => node.direction === 'in')).toHaveLength(MODEL_FACTS.dataIn);
    expect(data.filter((node) => node.direction === 'out')).toHaveLength(MODEL_FACTS.dataOut);
  });

  /*
   * Прямое следствие правильного направления: «ключевые выходы» на карточке
   * обзора берутся из артефактов с direction === 'out'. Пустые они были бы
   * ровно в том случае, когда направление посчитано неверно.
   */
  it('у большинства этапов есть ключевые выходы', () => {
    const withOutputs = map.stages.filter((stage) => stage.keyOutputs.length > 0);
    expect(withOutputs).toHaveLength(MODEL_FACTS.stagesWithKeyOutputs);
  });

  /*
   * Связей между модулями в файле НЕТ ВОВСЕ: у процесса верхнего уровня
   * двенадцать подпроцессов и ни одного sequenceFlow. Стрелки выведены из имён
   * граничных событий — SNP начинается с «DP: Планирование спроса». Это вывод,
   * а не факт из файла, поэтому он работает только с объявленным профилем.
   *
   * Без него обзор был бы десятью карточками без единой стрелки, то есть
   * переставал бы быть обзором процесса.
   */
  it('обзор получает стрелки, выведенные из имён граничных событий', () => {
    expect(map.overviewEdges).toHaveLength(MODEL_FACTS.overviewEdges);
    const stageIds = new Set(map.stages.map((stage) => stage.id));
    for (const edge of map.overviewEdges) {
      expect(stageIds.has(edge.source), `источник ${edge.source} не этап`).toBe(true);
      expect(stageIds.has(edge.target), `цель ${edge.target} не этап`).toBe(true);
      expect(edge.source).not.toBe(edge.target);
    }
  });

  it('дата берётся из файла, а не из «сегодня»', () => {
    expect(map.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('экспортёр и число планов диаграмм прочитаны', () => {
    expect(report.source.exporter).toBe(MODEL_FACTS.exporter);
    expect(report.source.planes).toBe(MODEL_FACTS.planes);
  });
});
