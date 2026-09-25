// Разбор исходника scripts/import-pptx.py для тестов (задача process-map-n6h).
//
// ЗАЧЕМ ИСХОДНИК, А НЕ ЗАПУСК PYTHON. Python в CI не запускается вовсе
// (.github/workflows/deploy.yml), поэтому всё, что тесты сверяют с импортёром, —
// порядок ключей, коды систем, таблицы решений владельца, — они читают из его
// ИСХОДНИКА. Импортёр при этом ничего о тестах не знает и знать не должен.
//
// ЗАЧЕМ ОДИН ФАЙЛ. До этой задачи в одном tests/snp/importPreserve.test.ts жили
// ПЯТЬ копий одной и той же регулярки, вырезающей таблицу решений из исходника
// (четыре разборщика и счётчик ключей map, дописанный рядом, а не вместо), и у
// каждого разборщика — своя регулярка на записи с жёстким порядком ключей.
// Правка формата таблицы требовала чинить их все по отдельности.
//
// ЧТО ИЗМЕНИЛОСЬ ПО СУЩЕСТВУ, А НЕ ТОЛЬКО ПО МЕСТУ:
//
//  1. Таблица не найдена — исключение с её именем, а не пустой список. Раньше
//     каждая копия при промахе возвращала [] или '', и промах ловила только
//     соседняя проверка «длина больше нуля» — ровно там, где её не забыли
//     написать.
//
//  2. Записи читаются разбором python-литерала, а не регуляркой на запись.
//     Регулярка с жёстким порядком ключей НЕ СОВПАВШУЮ запись пропускает:
//     matchAll её просто не находит, и список становится короче без единого
//     сообщения. Здесь каждый элемент таблицы обязан разобраться, иначе —
//     исключение с номером строки импортёра. Порядок ключей, кроме первого,
//     больше ничего не значит.
//
//  3. Ключ map — ПЕРВЫЙ ключ каждой записи, и отбор по нему обязателен:
//     типизированные читатели ниже без имени карты не вызываются. Решение
//     владельца относится к одной карте (scripts/import-pptx.py::decisions_for),
//     и сверка записи чужой карты с src/data/snp/process.json заведомо ложна —
//     первая же запись "map": "inplan" уронила бы тесты SNP по причине, не
//     имеющей к ним отношения.
//
// Отбор по карте делается ДО чтения полей записи: у записей другой карты может
// быть другой набор ключей (карта In.Plan собирается не из презентации), и их
// форма — забота тестов той карты. Структурные правила (запись — словарь, map
// первым) проверяются у ВСЕХ записей таблицы, какой бы карте они ни относились.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// import.meta.url под vitest+jsdom — не file:-URL (см. scripts/layout.ts::jsonPath),
// поэтому путь берётся от корня прогона.
export const IMPORTER_PATH = resolve(process.cwd(), 'scripts', 'import-pptx.py');

/**
 * Исходник импортёра. Отсутствие файла роняет вызывающего на readFileSync — это
 * и есть нужное поведение: молча пропускать нечего.
 */
export function readImporterSource(): string {
  return readFileSync(IMPORTER_PATH, 'utf8');
}

/** Таблицы решений владельца: у каждой записи — ключ map первым полем. */
export const DECISION_TABLES = [
  'OWNER_DECISION_EDGES',
  'STAGE_INPUT_ENRICHMENT',
  'OWNER_DECISION_EXTERNAL_IO',
  'STAGE_GROUP_SPLIT',
] as const;

export type DecisionTable = (typeof DECISION_TABLES)[number];

/** Значение python-литерала. Кортеж и список оба становятся массивом. */
export type PyValue = string | number | boolean | null | PyValue[] | PyDict;

/**
 * Словарь — Map, а не объект: объект переставил бы ключи-числа вперёд, а порядок
 * ключей здесь — часть контракта (map обязан стоять первым).
 */
export type PyDict = Map<string, PyValue>;

// --------------------------------------------------------------------------------------
// Поиск объявления верхнего уровня
// --------------------------------------------------------------------------------------

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Имя подставляется в регулярку — пусть лучше упадёт здесь, чем совпадёт с чужим. */
function assertIdentifier(name: string): void {
  if (!IDENTIFIER.test(name)) {
    throw new Error(`«${name}» — не имя python-константы`);
  }
}

function lineOf(text: string, offset: number): number {
  return text.slice(0, offset).split('\n').length;
}

/**
 * Подсказка к «не найдено» для исходника с CRLF. Регулярка таблиц привязана к
 * LF (`= (\n` … `\n)\n`), и на CRLF-копии она не находит НИЧЕГО — раньше это
 * выглядело как «таблица пуста», и искать пришлось бы не там. Терпимой к CRLF
 * регулярку не делаем намеренно: .gitattributes требует LF для *.py (CRLF ломает
 * шебанг), и CRLF в рабочем дереве — поломка чекаута, которую тест обязан
 * назвать, а не обойти.
 */
function crlfHint(source: string): string {
  return source.includes('\r\n')
    ? ' В исходнике окончания строк CRLF, а разбор таблиц привязан к LF — ' +
        '.gitattributes требует LF для *.py; проверьте, как файл попал в рабочее дерево.'
    : '';
}

/**
 * Единственное совпадение объявления верхнего уровня. Два совпадения — тоже
 * ошибка, а не «берём первое»: Python применил бы ПОСЛЕДНЕЕ присваивание, а
 * регулярка нашла бы первое, и тест сверял бы данные не с тем объявлением.
 * Именно поэтому самопроверка импортёра передаёт свои фикстуры параметром, а не
 * вторым литералом верхнего уровня.
 */
function locateOnce(source: string, pattern: RegExp, what: string, expected = ''): RegExpExecArray {
  const found: RegExpExecArray[] = [];
  for (let match = pattern.exec(source); match !== null; match = pattern.exec(source)) {
    found.push(match);
  }
  if (found.length === 0) {
    throw new Error(`В scripts/import-pptx.py не найдена ${what}${expected}.${crlfHint(source)}`);
  }
  if (found.length > 1) {
    const lines = found.map((match) => lineOf(source, match.index)).join(', ');
    throw new Error(
      `В scripts/import-pptx.py ${what} объявлена ${found.length} раза (строки ${lines}) — ` +
        'Python взял бы последнее объявление, разбор взял бы первое.',
    );
  }
  return found[0]!;
}

// --------------------------------------------------------------------------------------
// Чтение python-литерала
// --------------------------------------------------------------------------------------
//
// Подмножество, которым записаны константы импортёра: строки (с неявной склейкой
// соседних литералов), целые и дробные числа, True/False/None, кортежи, списки и
// словари; комментарии и переводы строк внутри скобок. Всё прочее — f-строки,
// тройные кавычки, выражения, вызовы — ИСКЛЮЧЕНИЕ с номером строки, а не
// догадка: тот, кто впервые запишет в таблицу новый вид значения, узнает об этом
// здесь, а не по тихо укоротившемуся списку.

const NUMBER = /-?\d[\d_]*(?:\.\d[\d_]*)?(?![\w.])/y;
const CONSTANT = /(?:True|False|None)(?!\w)/y;

class LiteralReader {
  private pos: number;
  private readonly text: string;
  private readonly where: string;
  private readonly firstLine: number;

  /**
   * @param text      текст, в котором лежит литерал;
   * @param start     позиция начала литерала в этом тексте;
   * @param where     имя константы — для сообщений;
   * @param firstLine номер строки импортёра, с которой начинается `text`.
   */
  constructor(text: string, start: number, where: string, firstLine: number) {
    this.text = text;
    this.pos = start;
    this.where = where;
    this.firstLine = firstLine;
  }

  /** Номер строки scripts/import-pptx.py для позиции в тексте. */
  lineAt(at: number): number {
    return this.firstLine + lineOf(this.text, at) - 1;
  }

  private fail(message: string, at: number = this.pos): never {
    const near = JSON.stringify(this.text.slice(at, at + 40));
    throw new Error(
      `${this.where}, строка ${this.lineAt(at)} scripts/import-pptx.py: ${message}; рядом: ${near}`,
    );
  }

  /** Пробелы, переводы строк и комментарии: внутри скобок Python их не замечает. */
  private skipTrivia(): void {
    while (this.pos < this.text.length) {
      const ch = this.text[this.pos];
      if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
        this.pos += 1;
      } else if (ch === '#') {
        const eol = this.text.indexOf('\n', this.pos);
        this.pos = eol === -1 ? this.text.length : eol;
      } else {
        return;
      }
    }
  }

  private peek(): string | undefined {
    this.skipTrivia();
    return this.text[this.pos];
  }

  private eat(token: string): boolean {
    if (this.peek() !== token) {
      return false;
    }
    this.pos += 1;
    return true;
  }

  private expect(token: string): void {
    if (!this.eat(token)) {
      this.fail(`ожидалось «${token}»`);
    }
  }

  private sticky(pattern: RegExp): string | null {
    pattern.lastIndex = this.pos;
    const match = pattern.exec(this.text);
    if (match === null) {
      return null;
    }
    this.pos += match[0].length;
    return match[0];
  }

  atEnd(): boolean {
    return this.peek() === undefined;
  }

  value(): PyValue {
    const ch = this.peek();
    if (ch === '"' || ch === "'") {
      return this.strings();
    }
    if (ch === '(') {
      return this.parenthesized();
    }
    if (ch === '[') {
      return this.list();
    }
    if (ch === '{') {
      return this.dict();
    }
    const number = this.sticky(NUMBER);
    if (number !== null) {
      return Number(number.replaceAll('_', ''));
    }
    const constant = this.sticky(CONSTANT);
    if (constant !== null) {
      return constant === 'None' ? null : constant === 'True';
    }
    return this.fail(
      'значение не разобрано — поддержаны строки, числа, True/False/None, кортежи, ' +
        'списки и словари; новый вид значения требует доработки tests/helpers/importerSource.ts',
    );
  }

  /**
   * Элементы тела кортежа без внешних скобок — в таком виде readDecisionBlock
   * отдаёт таблицу. Висячая запятая допустима, как и в Python.
   */
  elements(): { value: PyValue; at: number }[] {
    const items: { value: PyValue; at: number }[] = [];
    while (!this.atEnd()) {
      const at = this.pos;
      items.push({ value: this.value(), at });
      if (this.atEnd()) {
        break;
      }
      this.expect(',');
    }
    return items;
  }

  /**
   * Python склеивает соседние строковые литералы: `"a" "b"` — это `"ab"`. Так в
   * таблицах записаны длинные why и source.
   */
  private strings(): string {
    let value = this.string();
    for (let next = this.peek(); next === '"' || next === "'"; next = this.peek()) {
      value += this.string();
    }
    return value;
  }

  private string(): string {
    const start = this.pos;
    const quote = this.text[start]!;
    if (this.text.startsWith(quote.repeat(3), start)) {
      this.fail('строки в тройных кавычках не поддержаны');
    }
    this.pos += 1;
    let value = '';
    for (;;) {
      const ch = this.text[this.pos];
      if (ch === undefined || ch === '\n') {
        this.fail('строка не закрыта', start);
      }
      this.pos += 1;
      if (ch === quote) {
        return value;
      }
      value += ch === '\\' ? this.escape() : ch;
    }
  }

  private escape(): string {
    const ch = this.text[this.pos];
    this.pos += 1;
    switch (ch) {
      case '\\':
      case '"':
      case "'":
        return ch;
      case 'n':
        return '\n';
      case 't':
        return '\t';
      default:
        return this.fail(`escape-последовательность «\\${ch ?? ''}» не поддержана`, this.pos - 2);
    }
  }

  private parenthesized(): PyValue {
    this.expect('(');
    const items: PyValue[] = [];
    let comma = false;
    while (!this.eat(')')) {
      items.push(this.value());
      if (this.eat(')')) {
        break;
      }
      this.expect(',');
      comma = true;
    }
    // (x) без запятой — скобки группировки, а не кортеж: так в таблицах записаны
    // многострочные строки "why": ("…" "…"). Кортеж из одного элемента — только
    // с запятой: ("…",). Спутать их — значит получить строку там, где ждали
    // список, или наоборот.
    return items.length === 1 && !comma ? items[0]! : items;
  }

  private list(): PyValue[] {
    this.expect('[');
    const items: PyValue[] = [];
    while (!this.eat(']')) {
      items.push(this.value());
      if (this.eat(']')) {
        break;
      }
      this.expect(',');
    }
    return items;
  }

  private dict(): PyDict {
    this.expect('{');
    const dict: PyDict = new Map();
    while (!this.eat('}')) {
      this.skipTrivia();
      const at = this.pos;
      const key = this.value();
      if (typeof key !== 'string') {
        this.fail('ключ словаря — не строка', at);
      }
      if (dict.has(key)) {
        this.fail(`ключ «${key}» повторён — Python молча оставил бы последнее значение`, at);
      }
      this.expect(':');
      dict.set(key, this.value());
      if (this.eat('}')) {
        break;
      }
      this.expect(',');
    }
    return dict;
  }
}

// --------------------------------------------------------------------------------------
// Константы верхнего уровня
// --------------------------------------------------------------------------------------

/** Значение python-константы верхнего уровня `NAME = …` (аннотация типа допустима). */
function readPythonValue(source: string, name: string): PyValue {
  assertIdentifier(name);
  // \b после имени: иначе MAP_ID совпало бы с MAP_ID_MRP.
  const match = locateOnce(
    source,
    new RegExp(String.raw`^${name}\b[^=\n]*=[ \t]*`, 'gm'),
    `константа ${name}`,
  );
  return new LiteralReader(source, match.index + match[0].length, name, 1).value();
}

/**
 * Кортеж строковых констант верхнего уровня по имени (NODE_KEY_ORDER,
 * SYSTEM_CODES…). Комментарии внутри кортежа пропускаются: прежняя регулярка
 * `\(([^)]*)\)` обрывалась на первой скобке в комментарии и подбирала слова в
 * кавычках из комментариев как элементы.
 */
export function readPythonTuple(source: string, name: string): string[] {
  const value = readPythonValue(source, name);
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
    throw new Error(`${name} в scripts/import-pptx.py — не кортеж строк`);
  }
  return value as string[];
}

/** Строковая константа верхнего уровня по имени (MAP_ID, MAP_UPDATED_AT…). */
export function readPythonString(source: string, name: string): string {
  const value = readPythonValue(source, name);
  if (typeof value !== 'string') {
    throw new Error(`${name} в scripts/import-pptx.py — не строка`);
  }
  return value;
}

// --------------------------------------------------------------------------------------
// Таблицы решений владельца
// --------------------------------------------------------------------------------------

export interface DecisionBlock {
  readonly name: string;
  /** Текст между строкой `NAME… = (` и закрывающей `)` в первой колонке. */
  readonly body: string;
  /** Строка scripts/import-pptx.py, с которой начинается body, — для сообщений. */
  readonly firstLine: number;
}

/**
 * Тело объявления таблицы решений по имени. ЕДИНСТВЕННАЯ регулярка, вырезающая
 * таблицу из исходника, — все читатели ниже идут через неё.
 *
 * Разбор ограничен объявлением ВЕРХНЕГО уровня (`^` и закрывающая `)` в первой
 * колонке): похожие литералы в других местах файла — фикстуры самопроверки —
 * сюда попасть не должны.
 *
 * Не нашлась — ИСКЛЮЧЕНИЕ с именем таблицы, не пустая строка.
 */
export function readDecisionBlock(source: string, name: string): DecisionBlock {
  assertIdentifier(name);
  const match = locateOnce(
    source,
    new RegExp(String.raw`^${name}\b[^\n]*=\s*\(\n([\s\S]*?)\n\)\n`, 'gm'),
    `таблица ${name}`,
    ` (ожидается объявление верхнего уровня «${name}… = (» и закрывающая «)» ` +
      'отдельной строкой в первой колонке)',
  );
  const body = match[1]!;
  // Тело заканчивается за три символа («\n)\n») до конца совпадения.
  const bodyStart = match.index + match[0].length - 3 - body.length;
  return { name, body, firstLine: lineOf(source, bodyStart) };
}

/** Запись таблицы решений: словарь, у которого проверены форма и ключ map. */
export interface DecisionRecord {
  readonly table: string;
  /** Номер записи в таблице с единицы — для сообщений. */
  readonly index: number;
  /** Строка scripts/import-pptx.py, где запись начинается. */
  readonly line: number;
  readonly map: string;
  readonly fields: PyDict;
}

function recordLabel(table: string, index: number, line: number, fields?: PyDict): string {
  const task = fields?.get('task');
  const named = typeof task === 'string' ? `, ${task}` : '';
  return `${table}, запись ${index}${named} (строка ${line} scripts/import-pptx.py)`;
}

function toRecord(table: string, index: number, line: number, value: PyValue): DecisionRecord {
  if (!(value instanceof Map)) {
    throw new Error(`${recordLabel(table, index, line)}: запись таблицы решений — не словарь`);
  }
  const label = recordLabel(table, index, line, value);
  // ПЕРВЫМ, а не просто «есть»: по первому ключу видно, к какой карте относится
  // решение, не дочитывая запись. То же правило держит самопроверка импортёра
  // (next(iter(entry)) == "map"), но она живёт в Python, а Python в CI не
  // запускается — значит, в CI это правило проверяет только этот разбор.
  const first: string | undefined = [...value.keys()][0];
  if (first !== 'map') {
    throw new Error(
      `${label}: первым ключом записи обязан быть "map", а стоит ` +
        `${first === undefined ? 'ничего — словарь пуст' : `"${first}"`}. Решение владельца ` +
        'относится к одной карте; без ключа оно применялось бы ко всем сразу.',
    );
  }
  const map = value.get('map');
  if (typeof map !== 'string' || map === '') {
    throw new Error(`${label}: значение "map" обязано быть непустой строкой — именем карты`);
  }
  return { table, index, line, map, fields: value };
}

/**
 * Все записи таблицы решений — ВСЕХ карт. Бросает, если таблица не найдена, пуста,
 * или хотя бы одна запись не словарь либо не начинается с ключа map.
 *
 * Пустая таблица — тоже исключение: самопроверка импортёра считает её ошибкой
 * («таблица решений … пуста»), и разбор не вправе быть мягче. А вот пустой
 * результат ОТБОРА по карте (читатели ниже) — законный ответ: у карты может не
 * быть решений в этой таблице, и решать, нормально ли это, — её тестам.
 */
export function readDecisionTable(source: string, name: string): DecisionRecord[] {
  const block = readDecisionBlock(source, name);
  const reader = new LiteralReader(block.body, 0, name, block.firstLine);
  const records = reader
    .elements()
    .map(({ value, at }, position) => toRecord(name, position + 1, reader.lineAt(at), value));
  if (records.length === 0) {
    throw new Error(
      `${name} в scripts/import-pptx.py найдена (строка ${block.firstLine - 1}), но записей в ней нет`,
    );
  }
  return records;
}

/**
 * Записи таблицы, относящиеся к карте `map`. Единственное место отбора: все
 * типизированные читатели ниже идут через него и без имени карты не вызываются.
 */
function recordsFor(source: string, table: DecisionTable, map: string): DecisionRecord[] {
  return readDecisionTable(source, table).filter((record) => record.map === map);
}

function field(record: DecisionRecord, key: string): PyValue {
  const value = record.fields.get(key);
  if (value === undefined) {
    throw new Error(
      `${recordLabel(record.table, record.index, record.line, record.fields)}: нет ключа "${key}"`,
    );
  }
  return value;
}

function wrongType(record: DecisionRecord, key: string, expected: string): Error {
  return new Error(
    `${recordLabel(record.table, record.index, record.line, record.fields)}: ` +
      `"${key}" обязан быть ${expected}`,
  );
}

function text(record: DecisionRecord, key: string): string {
  const value = field(record, key);
  if (typeof value !== 'string') {
    throw wrongType(record, key, 'строкой');
  }
  return value;
}

function integer(record: DecisionRecord, key: string): number {
  const value = field(record, key);
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw wrongType(record, key, 'целым числом');
  }
  return value;
}

function texts(record: DecisionRecord, key: string): string[] {
  const value = field(record, key);
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
    throw wrongType(record, key, 'кортежем строк');
  }
  return value as string[];
}

function pairs(record: DecisionRecord, key: string): [string, string][] {
  const value = field(record, key);
  const isPair = (item: PyValue): item is [string, string] =>
    Array.isArray(item) && item.length === 2 && item.every((part) => typeof part === 'string');
  if (!Array.isArray(value) || !value.every(isPair)) {
    throw wrongType(record, key, 'кортежем пар строк');
  }
  return value as [string, string][];
}

/** Поля, общие для записей всех четырёх таблиц. */
export interface DecisionEntry {
  map: string;
  /** Задача-основание решения владельца. */
  task: string;
  stage: number;
}

function entry(record: DecisionRecord): DecisionEntry {
  return { map: record.map, task: text(record, 'task'), stage: integer(record, 'stage') };
}

/** OWNER_DECISION_EDGES — рёбра, которых в презентации нет (process-map-7bz). */
export interface OwnerDecisionEdge extends DecisionEntry {
  source: string;
  targets: string[];
}

export function readOwnerDecisionEdges(source: string, map: string): OwnerDecisionEdge[] {
  return recordsFor(source, 'OWNER_DECISION_EDGES', map).map((record) => ({
    ...entry(record),
    source: text(record, 'source'),
    targets: texts(record, 'targets'),
  }));
}

/** OWNER_DECISION_EXTERNAL_IO — внешние системы этапа, названные владельцем (process-map-vjz.5). */
export interface OwnerExternalIo extends DecisionEntry {
  system: string;
  label: string;
  direction: string;
}

export function readOwnerExternalIo(source: string, map: string): OwnerExternalIo[] {
  return recordsFor(source, 'OWNER_DECISION_EXTERNAL_IO', map).map((record) => ({
    ...entry(record),
    system: text(record, 'system'),
    label: text(record, 'label'),
    direction: text(record, 'direction'),
  }));
}

/** STAGE_INPUT_ENRICHMENT — входы этапа со слайда обзора (process-map-qjl). */
export interface InputEnrichment extends DecisionEntry {
  add: string[];
  expand: { short: string; full: string }[];
}

export function readInputEnrichment(source: string, map: string): InputEnrichment[] {
  return recordsFor(source, 'STAGE_INPUT_ENRICHMENT', map).map((record) => ({
    ...entry(record),
    add: texts(record, 'add'),
    expand: pairs(record, 'expand').map(([short, full]) => ({ short, full })),
  }));
}

/** STAGE_GROUP_SPLIT — деление узлов этапа на группы (process-map-028). */
export interface GroupSplit extends DecisionEntry {
  label: string;
  nodes: string[];
}

export function readGroupSplit(source: string, map: string): GroupSplit[] {
  return recordsFor(source, 'STAGE_GROUP_SPLIT', map).map((record) => ({
    ...entry(record),
    label: text(record, 'label'),
    nodes: texts(record, 'nodes'),
  }));
}
