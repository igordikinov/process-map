// Идентификаторы и текст адаптера BPMN (process-map-70e.5).
//
// Чистые функции, ни одного узла XML: сюда вынесено всё, что можно проверить
// строками, чтобы тесты правил отображения не тонули в фикстурах документа.
import { describe, expect, it } from 'vitest';
import { assignUniqueIds, mapIdFrom, slugify, slugifyBpmnId } from '../../src/data/bpmn/ids';
import {
  elementName,
  leadingCode,
  nameLines,
  normalizeText,
  parseModuleName,
} from '../../src/data/bpmn/text';

describe('slugify', () => {
  it('транслитерирует кириллицу и приводит к kebab-case', () => {
    expect(slugify('Планирование сети поставок')).toBe('planirovanie-seti-postavok');
    expect(slugify('SNP: Расчёт')).toBe('snp-raschet');
  });

  it('обрезает по длине, не разрывая слово посередине', () => {
    const long = slugify('a'.repeat(40) + ' ' + 'b'.repeat(40), 'x', 50);
    expect(long.length).toBeLessThanOrEqual(50);
    expect(long).toBe('a'.repeat(40));
  });

  /*
   * Идентификатор не имеет права быть пустой строкой: пустой id узла прошёл бы
   * схему (z.string() пропускает '') и сломался бы позже — в deep-link и в
   * ключе overrides, далеко от места ошибки.
   */
  it('строка без букв и цифр даёт запасное значение, а не пустоту', () => {
    expect(slugify('«—»')).toBe('x');
    expect(slugify('', 'node')).toBe('node');
    expect(slugifyBpmnId('___')).toBe('node');
  });

  it('id элемента BPMN становится читаемым слагом', () => {
    expect(slugifyBpmnId('Activity_1mo5vfb')).toBe('activity-1mo5vfb');
    expect(slugifyBpmnId('Event_0voen5w')).toBe('event-0voen5w');
  });
});

describe('mapIdFrom: регулярка схемы на id карты', () => {
  it('обычное имя проходит как есть', () => {
    expect(mapIdFrom('Process_Model_L0')).toBe('process-model-l0');
  });

  /*
   * `/^[a-z][a-z0-9-]*$/` стоит в самой схеме (ProcessMapSchema.id) — это
   * единственное место модели, где форма id проверяется. Слаг, начинающийся с
   * цифры, надо починить здесь, а не отдать наружу и упасть на parse.
   */
  it('слаг, начинающийся с цифры, чинится, а не роняет разбор', () => {
    expect(mapIdFrom('2026 модель')).toMatch(/^[a-z][a-z0-9-]*$/);
    expect(mapIdFrom('2026 модель')).toBe('bpmn-2026-model');
  });
});

describe('assignUniqueIds', () => {
  it('уникальные исходники остаются без суффиксов', () => {
    expect(assignUniqueIds(['Activity_a', 'Activity_b'])).toEqual(['activity-a', 'activity-b']);
  });

  /*
   * Разные id BPMN могут дать один слаг: `A_b` и `A-b` оба становятся `a-b`.
   * Без разрешения коллизий это дало бы два узла с одним id — а
   * validateIntegrity требует глобальной уникальности по всей карте.
   */
  it('разные исходники с одинаковым слагом получают разные id', () => {
    const ids = assignUniqueIds(['A_b', 'A-b']);
    expect(new Set(ids).size).toBe(2);
    expect(ids[0]).not.toBe(ids[1]);
  });

  /*
   * ГЛАВНОЕ СВОЙСТВО. Суффикс — хеш собственного исходного id, а не порядковый
   * номер. Поэтому перестановка элементов в Modeler не меняет id, и ссылки на
   * экраны с deep-link переживают правку соседнего узла.
   */
  it('id не зависит от порядка обхода', () => {
    const direct = assignUniqueIds(['A_b', 'A-b', 'C']);
    const shuffled = assignUniqueIds(['C', 'A-b', 'A_b']);
    expect(shuffled[2]).toBe(direct[0]);
    expect(shuffled[1]).toBe(direct[1]);
    expect(shuffled[0]).toBe(direct[2]);
  });

  it('id не меняется, если соседний элемент удалили', () => {
    const before = assignUniqueIds(['A_b', 'A-b', 'C']);
    const after = assignUniqueIds(['A_b', 'A-b']);
    expect(after[0]).toBe(before[0]);
    expect(after[1]).toBe(before[1]);
  });

  it('на пустом входе возвращает пустой массив', () => {
    expect(assignUniqueIds([])).toEqual([]);
  });
});

describe('normalizeText', () => {
  /*
   * Неразрывные пробелы в файле владельца есть. Без нормализации два визуально
   * одинаковых имени дали бы разные слаги и разошлись бы в поиске.
   */
  it('неразрывный пробел становится обычным, лишние схлопываются', () => {
    expect(normalizeText('План продаж')).toBe('План продаж');
    expect(normalizeText('  два   пробела \n ')).toBe('два пробела');
  });

  it('отсутствие значения даёт пустую строку, а не падение', () => {
    expect(normalizeText(null)).toBe('');
    expect(normalizeText(undefined)).toBe('');
  });
});

describe('nameLines', () => {
  it('переводы строк остаются разделителями, а пустые строки отбрасываются', () => {
    expect(nameLines('SNP\n\nПланирование\nИ. Дикинов')).toEqual([
      'SNP',
      'Планирование',
      'И. Дикинов',
    ]);
  });
});

describe('parseModuleName', () => {
  it('три строки: код, название, владелец', () => {
    expect(parseModuleName('SNP\nПланирование сети поставок\nИ. Дикинов')).toEqual({
      code: 'SNP',
      title: 'Планирование сети поставок',
      owner: 'И. Дикинов',
    });
  });

  it('одна строка с тире: название и владелец', () => {
    expect(parseModuleName('Replenishment – И. Фроликов')).toEqual({
      code: '',
      title: 'Replenishment',
      owner: 'И. Фроликов',
    });
  });

  it('владелец со скобками разбирается', () => {
    const parsed = parseModuleName('IO\nInventory Optimization\nА. Репин (Лев Дегтярев)');
    expect(parsed.owner).toBe('А. Репин (Лев Дегтярев)');
    expect(parsed.title).toBe('Inventory Optimization');
  });

  /*
   * Модуль, названный одним лишь кодом, не имеет права остаться без названия:
   * карточка этапа показывает title, и пустая строка дала бы пустую карточку.
   */
  it('имя из одного кода даёт и код, и название', () => {
    expect(parseModuleName('MRP')).toEqual({ code: 'MRP', title: 'MRP' });
  });

  /*
   * Узкое правило владельца — намеренно. Широкое («последняя строка это
   * владелец») съедало бы половину названия у модулей, названных двумя
   * строками без владельца.
   */
  it('последняя строка, не похожая на подпись, остаётся частью названия', () => {
    expect(parseModuleName('DM\nУправление данными\nи справочниками')).toEqual({
      code: 'DM',
      title: 'Управление данными — и справочниками',
    });
  });

  it('пустое имя не роняет разбор', () => {
    expect(parseModuleName('')).toEqual({ code: '', title: '' });
    expect(parseModuleName(null)).toEqual({ code: '', title: '' });
  });
});

describe('leadingCode', () => {
  const PATTERN = /^[A-Z]{2,4}-\d{2,3}(-\d{2,3})?/;

  it('находит код в начале подписи', () => {
    expect(leadingCode('DP-030-010 Фоновая загрузка', PATTERN)).toBe('DP-030-010');
    expect(leadingCode('PS-010 Графикование', PATTERN)).toBe('PS-010');
  });

  it('подпись без кода даёт undefined', () => {
    expect(leadingCode('Расчёт потребности', PATTERN)).toBeUndefined();
  });
});

describe('elementName', () => {
  it('читает и нормализует атрибут name', () => {
    const doc = new DOMParser().parseFromString('<t name="План продаж"/>', 'application/xml');
    expect(elementName(doc.documentElement)).toBe('План продаж');
  });

  it('без атрибута отдаёт пустую строку', () => {
    const doc = new DOMParser().parseFromString('<t/>', 'application/xml');
    expect(elementName(doc.documentElement)).toBe('');
  });
});
