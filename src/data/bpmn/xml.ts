// Разбор XML файла BPMN 2.0 и сторожа против враждебного файла (process-map-70e.3).
//
// Файл приходит ОТ ПОЛЬЗОВАТЕЛЯ, а приложение живёт в iframe внутри вики — то
// есть это единственное место продукта, куда попадает чужой недоверенный ввод.
// Поэтому модуль устроен как граница: наружу отдаётся либо разобранный
// документ, либо причина отказа, и ни одной промежуточной формы.
//
// Зависимостей нет намеренно. Встроенного DOMParser хватает, а правило
// CLAUDE.md требует заводить новую зависимость отдельной задачей с
// обоснованием — обоснования нет.

// ────────────────────────── пространства имён ──────────────────────────

/**
 * ПРЕФИКСЫ В BPMN НЕ ЗНАЧАТ НИЧЕГО, и это главная ловушка формата.
 *
 * Замерено (Chrome 141 и jsdom 25): `getElementsByTagName('bpmn:task')` даёт 0
 * на файле с префиксом `bpmn2:` — а Camunda Modeler исторически писал именно
 * `bpmn2:`, современный пишет `bpmn:`, сторонние экспортёры не пишут префикс
 * вовсе. Один и тот же процесс в трёх видах. `getElementsByTagNameNS` во всех
 * трёх случаях даёт 1.
 *
 * Отсюда правило модуля: обход только через `nsAll`/`nsChildren`, ни одного
 * `getElementsByTagName` с префиксом и ни одного CSS-селектора (замерено:
 * `querySelectorAll('task')` в jsdom даёт 0 на префиксованном документе и 1 на
 * документе с умолчательным пространством — то есть тест был бы зелёным или
 * красным в зависимости от того, как оформлена фикстура, а не от кода).
 */
export const BPMN_NS = {
  /** Элементы процесса: definitions, process, lane, task, sequenceFlow… */
  model: 'http://www.omg.org/spec/BPMN/20100524/MODEL',
  /** Диаграмма: BPMNDiagram, BPMNPlane, BPMNShape, BPMNEdge. */
  bpmndi: 'http://www.omg.org/spec/BPMN/20100524/DI',
  /** Геометрия фигуры: dc:Bounds с x/y/width/height. */
  dc: 'http://www.omg.org/spec/DD/20100524/DC',
  /** Геометрия связи: di:waypoint. */
  di: 'http://www.omg.org/spec/DD/20100524/DI',
  /** Расширения Camunda 7: assignee, formKey, topic… */
  camunda: 'http://camunda.org/schema/1.0/bpmn',
  /** Расширения Camunda 8. Другое пространство, не подмножество camunda 7. */
  zeebe: 'http://camunda.org/schema/zeebe/1.0',
} as const;

// ────────────────────────────── лимиты ──────────────────────────────

/**
 * Потолок размера файла. Проверяется по `File.size` ДО чтения содержимого:
 * размер доступен сразу, и файл на два гигабайта отклоняется, не заняв памяти.
 *
 * Ориентир: `src/data/snp/process.json` — 69 KB на 4 этапа и ~44 узла, то есть
 * четыре мегабайта это запас почти на порядок к любой реальной схеме.
 */
export const MAX_BPMN_BYTES = 4 * 1024 * 1024;

/**
 * Потолок числа элементов XML. Файл может быть валидным, небольшим и при этом
 * порождать десятки тысяч узлов React Flow — а полотно живёт в iframe внутри
 * чужой страницы, и подвесить мы можем не только себя.
 */
export const MAX_BPMN_ELEMENTS = 20000;

// ────────────────────────────── результат ──────────────────────────────

/**
 * Причина отказа. Отдельные значения, а не одна строка «не получилось»,
 * потому что пользователю нужно знать, что чинить: битый файл чинят в
 * редакторе, а слишком большой — не чинят вовсе.
 *
 * Тексты для каждой причины даёт владелец (см. задачу про UI): прецедент в
 * `src/i18n/ru.ts` — тексты импорта JSON даны дословно и не переформулируются.
 */
export type BpmnParseRejection =
  'doctype' | 'encoding' | 'malformed' | 'not-bpmn' | 'too-many-elements';

export type BpmnParseResult =
  | { readonly status: 'ok'; readonly doc: XMLDocument }
  | { readonly status: 'rejected'; readonly reason: BpmnParseRejection };

// ────────────────────────── сторож против бомбы ──────────────────────────

/**
 * Есть ли `<!DOCTYPE` в прологе — то есть до первого элемента.
 *
 * ПОЧЕМУ ЭТО ГЛАВНЫЙ СТОРОЖ МОДУЛЯ. Замерено:
 *  · XXE (внешняя сущность `file:///…`) закрыт самим движком — Chrome не
 *    резолвит её и отдаёт `parsererror`, сетевых запросов нет. Утечки файла
 *    или SSRF из iframe быть не может;
 *  · а вот ВНУТРЕННИЕ сущности разворачиваются молча: `<!ENTITY x "HELLO">`
 *    подставляется, и «billion laughs» глубины 5 дал в Chrome 9375 символов за
 *    0.6 мс без единой ошибки. Развёртка РЕКУРСИВНАЯ, значит глубина 10 — это
 *    экспонента и падение вкладки.
 *
 * И тут ловушка тестирования: jsdom подставляет сущность лишь на ОДИН уровень
 * (та же бомба дала 20 символов), то есть взрыв в юнит-тесте невоспроизводим.
 * Проверить можно только сам сторож — что и делает `tests/bpmn/xml.test.ts`.
 *
 * Поэтому DTD отвергается целиком, до разбора. Проверка детерминирована и
 * одинакова в Chrome и jsdom, то есть в отличие от поведения самого DOMParser
 * полностью покрывается тестами. Ни один файл, выгруженный из Camunda Modeler,
 * DOCTYPE не содержит — ложных отказов на практике не будет.
 *
 * ПОЧЕМУ НЕ `text.includes('<!DOCTYPE')`. Слово может встретиться в
 * `<bpmn:documentation>` описания шага, и тогда честный файл отвергался бы без
 * причины. Пролог сканируется по-настоящему — с пропуском объявления XML и
 * комментариев, — потому что наивное «найти первый `<` не за которым `?` или
 * `!`» ломается о комментарий вида `<!-- см. <definitions> -->`: пролог
 * оборвался бы внутри комментария, а DOCTYPE после него остался бы незамеченным.
 * Ошибка в эту сторону пропускает бомбу, поэтому дешёвый вариант не годится.
 */
export function hasDoctypeInProlog(text: string): boolean {
  let i = 0;
  while (i < text.length) {
    // Пробелы между конструкциями пролога.
    while (i < text.length && /\s/.test(text[i] ?? '')) {
      i += 1;
    }
    if (text.startsWith('<?', i)) {
      const end = text.indexOf('?>', i + 2);
      if (end === -1) {
        return false; // Незакрытая инструкция: файл всё равно не разберётся.
      }
      i = end + 2;
      continue;
    }
    if (text.startsWith('<!--', i)) {
      const end = text.indexOf('-->', i + 4);
      if (end === -1) {
        return false;
      }
      i = end + 3;
      continue;
    }
    if (text.startsWith('<!DOCTYPE', i)) {
      return true;
    }
    // Стартовый тег элемента или мусор — пролог кончился.
    return false;
  }
  return false;
}

/**
 * Кодировка из объявления XML, в нижнем регистре, или `undefined`, если
 * объявления нет.
 *
 * Нужна потому, что `File.text()` ВСЕГДА декодирует как UTF-8. Файл,
 * сохранённый в windows-1251 (бывает после ручной правки в старом редакторе),
 * разберётся без единой ошибки и даст моджибейк во всех подписях — то есть
 * карту, которая выглядит рабочей и врёт. Лучше отказать.
 */
export function declaredEncoding(text: string): string | undefined {
  const end = text.indexOf('?>');
  if (!text.startsWith('<?xml') || end === -1) {
    return undefined;
  }
  const match = /encoding\s*=\s*["']([^"']+)["']/.exec(text.slice(0, end));
  return match?.[1]?.toLowerCase();
}

// ────────────────────────────── разбор ──────────────────────────────

/**
 * Текст файла → документ BPMN или причина отказа.
 *
 * Порядок проверок обязателен: DOCTYPE отсекается ДО `parseFromString`, иначе
 * бомба успевает развернуться.
 */
export function parseBpmnDocument(text: string): BpmnParseResult {
  // BOM `File.text()` снимает сам, но текст может прийти и другим путём.
  const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  if (hasDoctypeInProlog(source)) {
    return { status: 'rejected', reason: 'doctype' };
  }

  const encoding = declaredEncoding(source);
  if (encoding !== undefined && encoding !== 'utf-8' && encoding !== 'utf8') {
    return { status: 'rejected', reason: 'encoding' };
  }

  const doc = new DOMParser().parseFromString(source, 'application/xml');

  /*
   * ЕДИНСТВЕННАЯ ПЕРЕНОСИМАЯ ПРОВЕРКА ОШИБКИ РАЗБОРА — вот эта.
   *
   * Замерено на обрезанном файле (закрывающих тегов нет):
   *   Chrome: documentElement.localName === 'definitions', то есть привычное
   *           `documentElement.nodeName === 'parsererror'` НЕ СРАБАТЫВАЕТ, и
   *           огрызок был бы принят за исправный BPMN;
   *   jsdom:  documentElement.localName === 'parsererror'.
   * `getElementsByTagName('parsererror').length` даёт 1 в обоих. Пространство
   * имён у элемента разное (xhtml против mozilla), по нему проверять нельзя.
   *
   * Формально файл может протащить собственный элемент `parsererror` в чужом
   * пространстве внутри extensionElements — тогда мы его отвергнем. Ошибка в
   * безопасную сторону, и другого переносимого признака нет.
   */
  if (doc.getElementsByTagName('parsererror').length > 0) {
    return { status: 'rejected', reason: 'malformed' };
  }

  const root = doc.documentElement;
  if (root.localName !== 'definitions' || root.namespaceURI !== BPMN_NS.model) {
    return { status: 'rejected', reason: 'not-bpmn' };
  }

  if (doc.getElementsByTagName('*').length > MAX_BPMN_ELEMENTS) {
    return { status: 'rejected', reason: 'too-many-elements' };
  }

  return { status: 'ok', doc };
}

// ────────────────────────────── обход ──────────────────────────────

/** Область поиска: документ целиком или поддерево одного элемента. */
type NsScope = Document | Element;

/**
 * Все потомки с этим именем, на любой глубине. Порядок — документный.
 */
export function nsAll(scope: NsScope, ns: string, localName: string): Element[] {
  return Array.from(scope.getElementsByTagNameNS(ns, localName));
}

/**
 * Только ПРЯМЫЕ дети с этим именем.
 *
 * Нужна отдельно от `nsAll`, потому что `getElementsByTagNameNS` рекурсивен, а
 * дорожки в BPMN вкладываются друг в друга (`bpmn:lane` → `bpmn:childLaneSet` →
 * `bpmn:lane`). Замерено: поиск `lane` от корневого `laneSet` возвращает и
 * `L1`, и вложенную `L1a` — то есть рекурсивный обход схлопнул бы два уровня
 * иерархии в один и дорожка-родитель стала бы сестрой собственного ребёнка.
 */
export function nsChildren(el: Element, ns: string, localName: string): Element[] {
  return Array.from(el.children).filter(
    (child) => child.namespaceURI === ns && child.localName === localName,
  );
}

/**
 * Числовой атрибут или `undefined`. Пустая строка, «abc» и `Infinity` дают
 * `undefined`, а не `NaN`: координата, молча ставшая `NaN`, уезжает в раскладку
 * и роняет её далеко от места ошибки.
 */
export function numAttr(el: Element, name: string): number | undefined {
  const raw = el.getAttribute(name);
  if (raw === null || raw.trim() === '') {
    return undefined;
  }
  const value = Number.parseFloat(raw);
  return Number.isFinite(value) ? value : undefined;
}
