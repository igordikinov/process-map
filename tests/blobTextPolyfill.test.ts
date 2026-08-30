// Сторож полифилла Blob.prototype.text (задача process-map-wu8).
//
// ЗАЧЕМ ОТДЕЛЬНЫЙ ТЕСТ. jsdom 25 не реализует Blob.prototype.text, а vitest в
// jsdom-окружении подменяет глобальный Blob на jsdom-овский — нативный
// Node-метод при этом затеняется и недоступен. Поэтому tests/setup.ts достраивает
// метод через FileReader, иначе импорт JSON (EditorActions.tsx) падал бы с
// «file.text is not a function», то есть на пробеле окружения, а не на коде.
//
// Полифилл обязан исчезнуть, когда jsdom научится сам. Заметка в трекере этого
// не обеспечивает — проверять её некому. Этот тест обеспечивает: он завязан на
// признак «полифилл понадобился», который tests/setup.ts вычисляет ДО
// присваивания. Как только метод появится штатно, признак станет false и
// npm run check покраснеет с готовой инструкцией.
import { describe, expect, it } from 'vitest';
import { blobTextPolyfilled } from './setup';

describe('Blob.prototype.text: полифилл окружения', () => {
  it('всё ещё нужен — иначе полифилл пора удалять', () => {
    expect(
      blobTextPolyfilled,
      'jsdom научился Blob.prototype.text сам. Удалите полифилл и константу ' +
        'blobTextPolyfilled из tests/setup.ts, а вместе с ними этот файл ' +
        '(process-map-wu8): дальше он только маскирует настоящую реализацию.',
    ).toBe(true);
  });

  it('метод доступен тестам и читает содержимое', async () => {
    // Проверяется не сам полифилл, а контракт, ради которого он существует:
    // так читает выбранный файл импорт JSON в EditorActions.tsx.
    const file = new File(['{"a":1}'], 'process.json', { type: 'application/json' });

    expect(typeof file.text).toBe('function');
    await expect(file.text()).resolves.toBe('{"a":1}');
  });
});
