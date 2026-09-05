// XML-слой импорта BPMN: сторожа и обход (process-map-70e.3).
//
// Все ожидания ниже — из ЗАМЕРОВ в Chrome 141 и jsdom 25, а не из спецификации
// XML. Это существенно: три проверки проходят только потому, что оба движка
// ведут себя одинаково, и ещё одна написана именно из-за того, что они ведут
// себя ПО-РАЗНОМУ (см. «обрезанный файл» ниже).
import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  BPMN_NS,
  MAX_BPMN_BYTES,
  MAX_BPMN_ELEMENTS,
  declaredEncoding,
  hasDoctypeInProlog,
  nsAll,
  nsChildren,
  numAttr,
  parseBpmnDocument,
} from '../../src/data/bpmn/xml';

const MODEL = BPMN_NS.model;

/** Минимальный корректный документ с телом `inner`. */
function definitions(inner: string, prefix = 'bpmn'): string {
  const open =
    prefix === ''
      ? `<definitions xmlns="${MODEL}">`
      : `<${prefix}:definitions xmlns:${prefix}="${MODEL}">`;
  const close = prefix === '' ? '</definitions>' : `</${prefix}:definitions>`;
  return `<?xml version="1.0" encoding="UTF-8"?>${open}${inner}${close}`;
}

/** Достаёт документ из результата, падая с внятным текстом при отказе. */
function okDoc(xml: string): XMLDocument {
  const result = parseBpmnDocument(xml);
  if (result.status !== 'ok') {
    throw new Error(`ожидался разбор, получен отказ: ${result.reason}`);
  }
  return result.doc;
}

describe('parseBpmnDocument: приём и отказ', () => {
  it('разбирает корректный BPMN', () => {
    const doc = okDoc(definitions('<bpmn:process id="P"><bpmn:task id="T"/></bpmn:process>'));
    expect(doc.documentElement.localName).toBe('definitions');
  });

  /*
   * САМАЯ ВАЖНАЯ ПРОВЕРКА ФАЙЛА, и она написана из-за расхождения движков.
   *
   * Замерено на этом же огрызке:
   *   Chrome: documentElement.localName === 'definitions'
   *   jsdom:  documentElement.localName === 'parsererror'
   * То есть распространённая проверка `documentElement.nodeName ===
   * 'parsererror'` была бы ЗЕЛЁНОЙ в этом тесте и НЕ РАБОТАЛА бы в проде:
   * пользователь получил бы карту, построенную из обрезанного файла.
   */
  it('отвергает обрезанный файл, у которого корень выглядит правильным', () => {
    const truncated = `<?xml version="1.0"?><bpmn:definitions xmlns:bpmn="${MODEL}"><bpmn:process><bpmn:task/>`;
    expect(parseBpmnDocument(truncated)).toEqual({ status: 'rejected', reason: 'malformed' });
  });

  /*
   * ЭТОТ ТЕСТ СУЩЕСТВУЕТ РАДИ МУТАЦИИ, КОТОРУЮ БОЛЬШЕ НЕЧЕМ УБИТЬ.
   *
   * Проверка выше («обрезанный файл») в jsdom проходит и с наивной реализацией
   * `documentElement.nodeName === 'parsererror'`, потому что jsdom как раз
   * подменяет корень. Мутационный прогон это подтвердил: подмена механизма на
   * наивный оставляла корпус зелёным, то есть от Chrome-специфичного дефекта —
   * принять огрызок файла за исправную схему — тесты не защищали.
   *
   * Документ ниже РАЗБИРАЕТСЯ без ошибок в обоих движках: он корректен, корень
   * правильный, а элемент `parsererror` в нём просто лежит. Отвергнуть его
   * может только реализация, которая ищет `parsererror` по всему документу, а
   * не смотрит на корень. Заодно это фиксирует поведение, описанное в модуле:
   * файл, протащивший собственный `parsererror`, отвергается — ошибка в
   * безопасную сторону.
   */
  it('отвергает документ с элементом parsererror при правильном корне', () => {
    const smuggled = definitions('<bpmn:process id="P"/><parsererror/>');
    expect(
      new DOMParser().parseFromString(smuggled, 'application/xml').documentElement.localName,
    ).toBe('definitions');
    expect(parseBpmnDocument(smuggled)).toEqual({ status: 'rejected', reason: 'malformed' });
  });

  it('отвергает валидный XML, который не BPMN', () => {
    expect(parseBpmnDocument('<?xml version="1.0"?><root><a/></root>')).toEqual({
      status: 'rejected',
      reason: 'not-bpmn',
    });
  });

  it('отвергает definitions из чужого пространства имён', () => {
    const alien =
      '<?xml version="1.0"?><definitions xmlns="urn:example:other"><task/></definitions>';
    expect(parseBpmnDocument(alien)).toEqual({ status: 'rejected', reason: 'not-bpmn' });
  });

  it('снимает BOM и разбирает файл', () => {
    // Escape, а не сам символ: буквальный U+FEFF в исходнике запрещён правилом
    // no-irregular-whitespace и в диффе неразличим от пустоты.
    expect(parseBpmnDocument(`\uFEFF${definitions('<bpmn:process id="P"/>')}`).status).toBe('ok');
  });
});

describe('сторож против DTD', () => {
  /*
   * ЧТО ЗДЕСЬ МОЖНО ПРОВЕРИТЬ, А ЧТО НЕТ — граница проходит по движку.
   *
   * Замерено на одной и той же бомбе глубины 5:
   *   Chrome: 9375 символов за 0.6 мс, без ошибки — сущности разворачиваются
   *           РЕКУРСИВНО, то есть глубина 10 это экспонента и падение вкладки;
   *   jsdom:  20 символов — подстановка идёт на ОДИН уровень, вложенные ссылки
   *           остаются текстом.
   *
   * Значит взрыв в этом тесте невоспроизводим, и ожидание «длина > 3000» было
   * бы утверждением про Chrome, зелёным или красным в зависимости от раннера,
   * а не от кода. Проверяем то, в чём движки СОГЛАСНЫ и чего достаточно для
   * вывода: DTD обрабатывается, а не отвергается, — то есть без сторожа файл с
   * бомбой дошёл бы до разбора. Экспонента подтверждена замером в Chrome и
   * записана здесь, потому что автотестом она не закрывается.
   */
  it('отвергает бомбу вида «billion laughs», и DTD без сторожа действительно обрабатывается', () => {
    let dtd = '<!ENTITY a0 "LOL">';
    for (let i = 1; i <= 5; i += 1) {
      const prev = `&a${i - 1};`;
      dtd += `<!ENTITY a${i} "${prev.repeat(5)}">`;
    }
    const bomb = `<?xml version="1.0"?><!DOCTYPE definitions [${dtd}]><definitions xmlns="${MODEL}"><process id="P" name="&a5;"/></definitions>`;

    expect(parseBpmnDocument(bomb)).toEqual({ status: 'rejected', reason: 'doctype' });

    // Угроза не гипотетическая: разбор не спотыкается о DTD и подставляет
    // сущность — значение перестаёт быть исходным «&a5;».
    const raw = new DOMParser().parseFromString(bomb, 'application/xml');
    expect(raw.getElementsByTagName('parsererror')).toHaveLength(0);
    const name = raw.getElementsByTagNameNS(MODEL, 'process')[0]?.getAttribute('name') ?? '';
    expect(name).not.toBe('&a5;');
    expect(name.length).toBeGreaterThan('&a5;'.length);
  });

  it('отвергает DOCTYPE после комментария в прологе', () => {
    const xml = `<?xml version="1.0"?><!-- выгрузка --><!DOCTYPE definitions><definitions xmlns="${MODEL}"/>`;
    expect(hasDoctypeInProlog(xml)).toBe(true);
  });

  /*
   * Наивная проверка «первый `<`, за которым не `?` и не `!`» оборвала бы
   * пролог ВНУТРИ этого комментария и не заметила DOCTYPE за ним — то есть
   * пропустила бы бомбу. Ошибка в опасную сторону, поэтому случай зафиксирован.
   */
  it('видит DOCTYPE за комментарием, содержащим угловые скобки', () => {
    const xml = `<?xml version="1.0"?><!-- см. <definitions> ниже --><!DOCTYPE definitions [<!ENTITY x "y">]><definitions xmlns="${MODEL}"/>`;
    expect(hasDoctypeInProlog(xml)).toBe(true);
    expect(parseBpmnDocument(xml)).toEqual({ status: 'rejected', reason: 'doctype' });
  });

  /*
   * Обратная сторона: слово DOCTYPE в описании шага прологом не является.
   * Ради этого случая сторож и сканирует пролог, а не ищет подстроку в файле.
   */
  it('не считает DOCTYPE внутри documentation прологом', () => {
    const xml = definitions(
      '<bpmn:process id="P"><bpmn:documentation>в файле не должно быть &lt;!DOCTYPE</bpmn:documentation></bpmn:process>',
    );
    expect(hasDoctypeInProlog(xml)).toBe(false);
    expect(parseBpmnDocument(xml).status).toBe('ok');
  });
});

describe('кодировка', () => {
  it('пропускает utf-8 и отсутствие объявления', () => {
    expect(declaredEncoding(definitions('<bpmn:process id="P"/>'))).toBe('utf-8');
    expect(declaredEncoding(`<definitions xmlns="${MODEL}"/>`)).toBeUndefined();
    expect(parseBpmnDocument(`<definitions xmlns="${MODEL}"/>`).status).toBe('ok');
  });

  /*
   * File.text() всегда декодирует как UTF-8, поэтому файл в windows-1251
   * разобрался бы без единой ошибки и дал бы моджибейк во всех подписях —
   * карту, которая выглядит рабочей и врёт.
   */
  it('отвергает не-UTF-8, потому что подписи молча стали бы моджибейком', () => {
    const xml = `<?xml version="1.0" encoding="windows-1251"?><definitions xmlns="${MODEL}"/>`;
    expect(parseBpmnDocument(xml)).toEqual({ status: 'rejected', reason: 'encoding' });
  });
});

describe('обход: префиксы не значат ничего', () => {
  /*
   * Один и тот же процесс в трёх видах. Camunda Modeler исторически писал
   * bpmn2:, современный пишет bpmn:, сторонние экспортёры — без префикса.
   */
  it.each([
    ['bpmn', 'современный Camunda Modeler'],
    ['bpmn2', 'старый Camunda Modeler'],
    ['', 'умолчательное пространство имён'],
  ])('находит задачу при префиксе «%s» (%s)', (prefix) => {
    const inner = prefix === '' ? '<task id="T"/>' : `<${prefix}:task id="T"/>`;
    const doc = okDoc(definitions(inner, prefix));
    expect(nsAll(doc, MODEL, 'task').map((el) => el.getAttribute('id'))).toEqual(['T']);
  });

  it('читает атрибут Camunda по пространству имён, а не по префиксу', () => {
    const xml = `<?xml version="1.0"?><definitions xmlns="${MODEL}" xmlns:c="${BPMN_NS.camunda}"><userTask id="U" c:assignee="ivanov"/></definitions>`;
    const task = nsAll(okDoc(xml), MODEL, 'userTask')[0];
    expect(task?.getAttributeNS(BPMN_NS.camunda, 'assignee')).toBe('ivanov');
  });
});

describe('nsChildren: вложенные дорожки', () => {
  const nested = definitions(
    '<bpmn:laneSet id="LS"><bpmn:lane id="L1"><bpmn:childLaneSet><bpmn:lane id="L1a"/></bpmn:childLaneSet></bpmn:lane><bpmn:lane id="L2"/></bpmn:laneSet>',
  );

  /*
   * Зачем nsChildren вообще нужен: getElementsByTagNameNS рекурсивен, и
   * рекурсия схлопнула бы два уровня иерархии дорожек в один — дорожка-родитель
   * оказалась бы сестрой собственного ребёнка, а этапов стало бы на один больше,
   * чем в схеме.
   */
  it('рекурсивный поиск видит и вложенную дорожку — поэтому им пользоваться нельзя', () => {
    const laneSet = nsAll(okDoc(nested), MODEL, 'laneSet')[0];
    expect(laneSet).toBeDefined();
    expect(nsAll(laneSet as Element, MODEL, 'lane').map((el) => el.getAttribute('id'))).toEqual([
      'L1',
      'L1a',
      'L2',
    ]);
  });

  it('прямые дети дают только верхний уровень дорожек', () => {
    const laneSet = nsAll(okDoc(nested), MODEL, 'laneSet')[0];
    expect(
      nsChildren(laneSet as Element, MODEL, 'lane').map((el) => el.getAttribute('id')),
    ).toEqual(['L1', 'L2']);
  });
});

describe('numAttr', () => {
  const shape = nsAll(
    okDoc(definitions('<bpmn:task id="T" x="12.5" y="" z="abc" w="0"/>')),
    MODEL,
    'task',
  )[0] as Element;

  it('читает число, включая ноль и дробное', () => {
    expect(numAttr(shape, 'x')).toBe(12.5);
    expect(numAttr(shape, 'w')).toBe(0);
  });

  /*
   * Ради чего проверка Number.isFinite: координата, молча ставшая NaN, уезжает
   * в раскладку и роняет её далеко от места ошибки.
   */
  it('отсутствующий, пустой и нечисловой атрибут дают undefined, а не NaN', () => {
    expect(numAttr(shape, 'y')).toBeUndefined();
    expect(numAttr(shape, 'z')).toBeUndefined();
    expect(numAttr(shape, 'нет-такого')).toBeUndefined();
  });
});

describe('лимит числа элементов', () => {
  /*
   * Файл может быть валидным, небольшим и при этом порождать десятки тысяч
   * узлов React Flow. Полотно живёт в iframe внутри чужой страницы — подвесить
   * мы можем не только себя.
   */
  it('отвергает документ, в котором элементов больше потолка', () => {
    // Считается ОТ КОНСТАНТЫ, а не от числа: иначе тест продолжал бы проверять
    // прежний лимит после его правки и молча терял бы смысл.
    const many = '<bpmn:task/>'.repeat(MAX_BPMN_ELEMENTS + 1);
    expect(parseBpmnDocument(definitions(many))).toEqual({
      status: 'rejected',
      reason: 'too-many-elements',
    });
  });
});

/*
 * НАСТОЯЩАЯ МОДЕЛЬ ВЛАДЕЛЬЦА — самая ценная проверка файла, и появилась она
 * последней (process-map-70e.1).
 *
 * Ровно этот тест поймал бы дефект, который иначе доехал бы до пользователя:
 * потолок числа элементов стоял на 20 000, а в модели их 15 725 — 79% лимита.
 * Никакой синтетический тест этого не показывает, потому что синтетика
 * подгоняется под лимит, а не под реальность. Проверяются обе стороны: файл
 * принимается И у лимитов остаётся честный запас.
 */
describe('модель In.Plan из Camunda: файл целиком проходит сторожа', () => {
  const PATH = resolve(process.cwd(), 'In.Plan Process Model v11.bpmn');
  const source = readFileSync(PATH, 'utf8');

  it('разбирается как BPMN', () => {
    const result = parseBpmnDocument(source);
    expect(result.status).toBe('ok');
  });

  it('лимиты имеют запас, а не еле-еле пропускают файл', () => {
    const bytes = statSync(PATH).size;
    const doc = okDoc(source);
    const elements = doc.getElementsByTagName('*').length;

    // Запас не меньше троекратного. Если модель вырастет настолько, что запас
    // исчезнет, тест покраснеет ЗАРАНЕЕ — до того, как честный файл начнёт
    // отклоняться у пользователя с формулировкой «слишком много элементов».
    expect(bytes * 3).toBeLessThan(MAX_BPMN_BYTES);
    expect(elements * 3).toBeLessThan(MAX_BPMN_ELEMENTS);
  });

  it('префиксы файла разбираются пространствами имён, а не строками', () => {
    const doc = okDoc(source);
    // В файле префикс `bpmn:`, но код о нём не знает — и не должен.
    expect(nsAll(doc, MODEL, 'subProcess').length).toBeGreaterThan(0);
    expect(nsAll(doc, MODEL, 'sequenceFlow').length).toBeGreaterThan(0);
  });
});
