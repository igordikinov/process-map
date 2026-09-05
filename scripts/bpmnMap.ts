// scripts/bpmnMap.ts
// Вторая ветка конвейера данных: модель Camunda → src/data/<карта>/process.json
//
//     npm run data -- --map inplan-model
//
// ЗАЧЕМ ОТДЕЛЬНЫЙ ГЕНЕРАТОР, А НЕ РАСШИРЕНИЕ import-pptx.py. Разбор BPMN уже
// написан и работает в браузере (src/data/bpmn/), он на TypeScript и покрыт
// тестами на настоящей модели. Второй разбор на Python означал бы две
// реализации одних правил и, неизбежно, две слегка разные карты из одного файла.
//
// ПАРСЕР. В Node 22 глобального DOMParser нет, а src/data/bpmn/xml.ts зовёт его
// напрямую. Подставляем реализацию из jsdom — она УЖЕ в devDependencies и УЖЕ
// является тем парсером, под которым tests/bpmn/adapter.test.ts прогоняет
// адаптер на этом же файле. То есть закоммиченный артефакт и его проверка
// получаются от одного парсера, и разойтись им негде.
//
// Присваивание через `??=`, а не `=`: этот модуль исполняется и под vitest, где
// окружение jsdom уже дало DOMParser, и перетирать его чужим экземпляром незачем.
import { createHash } from 'node:crypto';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { bpmnToProcessMap } from '../src/data/bpmn/adapter.ts';
import { parseBpmnDocument } from '../src/data/bpmn/xml.ts';
import { ProcessMapSchema, validateIntegrity, type ProcessMap } from '../src/data/schema.ts';
import { serialize } from './layout.ts';
import { mapJsonPath, type BpmnMapId } from './mapTarget.ts';

/**
 * Объявление карты, собираемой из модели.
 *
 * ПОЧЕМУ ЭТИ ПОЛЯ ОБЪЯВЛЕНЫ, А НЕ ВЗЯТЫ ИЗ ФАЙЛА. Замерено: в
 * `In.Plan Process Model v11.bpmn` атрибуты `process@name` и `definitions@name`
 * равны null. Адаптер в этом случае берёт заголовок из ИМЕНИ ФАЙЛА, и читателю
 * вики показалось бы «In.Plan Process Model v11» — и там же, в подписи рамки
 * вокруг потока этапов, где у соседних карт стоит «Модуль SNP».
 *
 * `updatedAt` объявлен по другой причине, и она жёстче: адаптер выводит дату из
 * `lastModified` файла, а git время файлов НЕ ХРАНИТ — после клона это время
 * клонирования. Вдобавок `isoDate` в адаптере считает по ЛОКАЛЬНОЙ зоне, то
 * есть один и тот же момент даёт разные даты у владельца (MSK) и в CI (UTC).
 * Объявленная строка убирает целый класс расхождений «у меня зелено, в CI
 * красно».
 *
 * Прецедент наложения содержания, которого нет в источнике, — таблица
 * `OWNER_DECISION_EDGES` в scripts/import-pptx.py (SPEC §3 «Рёбра по решению
 * владельца процесса»): доменные решения объявляются в одном видном месте, где
 * их можно оспорить, и переживают перегенерацию.
 *
 * Строки `title` и `moduleLabel` даны владельцем 05.09.2026 (process-map-0c5.1).
 */
export const BPMN_MAP = {
  id: 'inplan-model',
  sourceFile: 'In.Plan Process Model v11.bpmn',
  /**
   * sha256 файла модели. Сторож одного конкретного отказа: модель обновили,
   * карту перегенерировать забыли. Побайтовая сверка карты его НЕ ловит — она
   * сравнивает файл с тем, что даёт адаптер СЕГОДНЯ, то есть из новой модели, и
   * покраснела бы уже после того, как кто-то заметил бы расхождение глазами.
   */
  sourceSha256: '18f60bb10a023f16563ada7b79dcc5266d46a248525caa1571e7dec25f5aeab5',
  updatedAt: '2026-09-05',
  title: 'Сквозной процесс планирования In.Plan',
  moduleLabel: 'Все модули In.Plan',
} as const satisfies { id: BpmnMapId; [key: string]: string };

/** Корень репозитория. Лениво — по той же причине, что и в scripts/mapTarget.ts. */
function root(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), '..');
}

/** Путь к файлу модели в корне репозитория. */
export function bpmnSourcePath(): string {
  return resolve(root(), BPMN_MAP.sourceFile);
}

/** sha256 файла модели — сторож «модель сменилась, карту не перегенерировали». */
export function bpmnSourceHash(): string {
  return createHash('sha256').update(readFileSync(bpmnSourcePath())).digest('hex');
}

/**
 * Собирает карту из модели и накладывает объявленные поля.
 *
 * Наложение — ровно четыре поля, и spread сохраняет порядок ключей: все четыре
 * уже есть в объекте, который вернул адаптер, поэтому нормализовать порядок
 * не требуется, а побайтовая сверка в тестах остаётся осмысленной.
 *
 * Повторные `ProcessMapSchema.parse` и `validateIntegrity` в конце — не
 * паранойя: наложение меняет `id`, а на нём висит ключ overrides и инвариант
 * «id карты == имя каталога» из tests/mapContract.
 */
export function buildBpmnMap(): ProcessMap {
  globalThis.DOMParser ??= new JSDOM('').window.DOMParser;

  const text = readFileSync(bpmnSourcePath(), 'utf8');
  const parsed = parseBpmnDocument(text);
  if (parsed.status !== 'ok') {
    throw new Error(`${BPMN_MAP.sourceFile}: файл не разобрался (${parsed.reason})`);
  }

  const result = bpmnToProcessMap(parsed.doc, {
    fileName: BPMN_MAP.sourceFile,
    lastModified: 0,
  });
  if (result.status !== 'ok') {
    throw new Error(
      `${BPMN_MAP.sourceFile}: карта не собралась.\n  ${result.report.blockers.join('\n  ')}`,
    );
  }

  const map: ProcessMap = {
    ...result.map,
    id: BPMN_MAP.id,
    title: BPMN_MAP.title,
    moduleLabel: BPMN_MAP.moduleLabel,
    updatedAt: BPMN_MAP.updatedAt,
  };

  ProcessMapSchema.parse(map);
  const problems = validateIntegrity(map);
  if (problems.length > 0) {
    throw new Error(`${BPMN_MAP.sourceFile}: карта не прошла проверку целостности:
  ${problems.join('\n  ')}`);
  }
  return map;
}

/**
 * Полный прогон: собрать, записать, напечатать отчёт.
 *
 * Раскладка отдельным шагом НЕ запускается: адаптер уже разложил карту тем же
 * ядром `layoutStage`, что и scripts/layout.ts, сидируясь `slidePosition` из
 * геометрии схемы. `npm run layout -- --map inplan-model` при этом остаётся
 * доступен и обязан быть no-op — ровно это и сторожит tests/mapContract.
 */
export function runBpmnMap(): number {
  let map: ProcessMap;
  try {
    map = buildBpmnMap();
  } catch (error) {
    console.error(String(error instanceof Error ? error.message : error));
    return 1;
  }

  const target = mapJsonPath(BPMN_MAP.id);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, serialize(map), 'utf8');

  const nodes = map.stages.reduce((sum, stage) => sum + stage.nodes.length, 0);
  const edges = map.stages.reduce((sum, stage) => sum + stage.edges.length, 0);
  console.log(
    `${BPMN_MAP.sourceFile} → src/data/${BPMN_MAP.id}/process.json\n` +
      `  этапов ${map.stages.length}, узлов ${nodes}, связей ${edges}, ` +
      `стрелок обзора ${map.overviewEdges.length}\n` +
      `  sha256 модели ${bpmnSourceHash()}`,
  );
  return 0;
}
