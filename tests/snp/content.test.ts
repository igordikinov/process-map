// Содержание карты SNP: то, что верно про ЭТУ карту и не обязано быть верным
// про любую другую (задача process-map-3wh.3).
//
// Инварианты, общие для всех карт, живут в tests/mapContract.test.ts и здесь
// не дублируются. Разделение проведено по одному признаку: можно ли направить
// проверку на вторую карту и ожидать зелёного. Если нет — она здесь.
import { describe, expect, it } from 'vitest';
import { ProcessMapSchema } from '../../src/data/schema.ts';
import processJson from '../../src/data/snp/process.json';
import requiredNodeIds from '../fixtures/snp/required-nodes.json';

const map = ProcessMapSchema.parse(processJson);

describe('карта SNP: содержание', () => {
  it('ровно четыре этапа с номерами 1..4', () => {
    // Переехало из tests/mapContract.test.ts (process-map-70e.4): четвёрка —
    // свойство ЭТОЙ презентации, а не любой карты. Схема с тех пор допускает
    // любое N ≥ 1, потому что этапы карты BPMN приходят из модулей файла.
    // Сторож не ослаб: обрезанный разбор презентации по-прежнему красит тест.
    expect(map.stages).toHaveLength(4);
    expect(map.stages.map((stage) => stage.number)).toEqual([1, 2, 3, 4]);
  });

  it('содержит не менее 40 узлов суммарно по всем этапам', () => {
    // Порог — про объём ИМЕННО этой презентации (6 слайдов, ~40 шагов, PRD).
    // Для карты MRP он недостижим: слайд 8 даёт 12 шагов.
    const totalNodes = map.stages.reduce((sum, stage) => sum + stage.nodes.length, 0);
    expect(totalNodes).toBeGreaterThanOrEqual(40);
  });

  it('содержит все обязательные id узлов из tests/fixtures/snp/required-nodes.json', () => {
    // Фикстуру пишет сам импортёр (scripts/import-pptx.py::collect_required_node_ids)
    // при разборе презентации. Смысл: «презентация назвала эти узлы — не потеряй
    // их молча». К другой карте неприменимо, пока у неё нет своего генератора,
    // поэтому файл лежит в tests/fixtures/<id>/, а не общий на репозиторий.
    const present = new Set(map.stages.flatMap((stage) => stage.nodes.map((node) => node.id)));
    expect(requiredNodeIds.length).toBeGreaterThanOrEqual(40);
    const missing = requiredNodeIds.filter((id) => !present.has(id));
    expect(missing).toEqual([]);
  });

  it('у каждого этапа есть и входы, и выходы', () => {
    // Регрессия process-map-24p: у этапов 1 и 2 геометрическое правило давало
    // ноль выходов при 2–3 ключевых выходах на карточке обзора — экран
    // противоречил сам себе.
    //
    // ПОЧЕМУ ЭТОТ ТЕСТ НЕ УЕХАЛ В КОНТРАКТ. На карте MRP он невыполним: на
    // слайде 8 входы нарисованы только у первой группы, а единственный выход —
    // у третьей. Это не дефект разбора, так нарисовано. Ослабить формулировку
    // до «хотя бы у одного этапа» значило бы потерять сторож ровно того
    // дефекта, ради которого он заведён, поэтому он остаётся строгим и
    // остаётся SNP-only.
    for (const stage of map.stages) {
      const data = stage.nodes.filter((node) => node.type === 'data');
      expect(
        data.filter((node) => node.direction === 'in').length,
        `этап ${stage.number}: входы`,
      ).toBeGreaterThan(0);
      expect(
        data.filter((node) => node.direction === 'out').length,
        `этап ${stage.number}: выходы`,
      ).toBeGreaterThan(0);
    }
  });
});
