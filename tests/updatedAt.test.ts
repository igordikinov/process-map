// Сторож даты «Обновлено» (process-map-vjz.10).
//
// ЗАЧЕМ. MAP_UPDATED_AT в scripts/import-pptx.py — объявленная константа, и
// иначе быть не может: содержание карты собирается из презентации И из таблиц
// решений владельца внутри импортёра, а у вторых метки времени нет. Значит дату
// ставит человек — и однажды он забудет. Ровно это и случилось: карта менялась
// пять раз, дата осталась прежней.
//
// ЧТО ДЕЛАЕТ ЭТОТ ФАЙЛ. Связывает объявленную дату с содержанием, которое она
// описывает: рядом с ней лежит отпечаток process.json, и разойтись они не могут
// молча. Автоматически пересчитывать отпечаток в импортёре НЕЛЬЗЯ — тогда он
// всегда совпадал бы и дата протухла бы тем же способом.
//
// ПОЧЕМУ ЗДЕСЬ, А НЕ В PYTHON. Python в CI не запускается вовсе (см.
// .github/workflows/deploy.yml), поэтому проверка на стороне импортёра никого
// не остановила бы. Константы читаются из исходника регуляркой — тот же приём,
// что в tests/importPreserve.test.ts.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const IMPORTER_PATH = resolve(process.cwd(), 'scripts', 'import-pptx.py');
const JSON_PATH = resolve(process.cwd(), 'src', 'data', 'snp', 'process.json');

const importerSource = readFileSync(IMPORTER_PATH, 'utf8');
const jsonSource = readFileSync(JSON_PATH, 'utf8');

/** Читает python-константу-строку верхнего уровня по имени. */
function readPythonString(name: string): string {
  // String.raw, а не обычный шаблон: в нём `\s` схлопывается в `s`, потому что
  // это не распознанная escape-последовательность. Регулярка тогда молча
  // перестаёт работать — на этом я и попался при написании теста.
  const match = new RegExp(String.raw`^${name}\s*=\s*"([^"]*)"`, 'm').exec(importerSource);
  if (match === null) {
    throw new Error(`В scripts/import-pptx.py не найдена константа ${name}`);
  }
  return match[1]!;
}

/**
 * Отпечаток содержания карты.
 *
 * updatedAt заменяется плейсхолдером, а НЕ удаляется: замена сохраняет порядок
 * ключей, а главное — разрывает круг «правка даты меняет хеш, а новый хеш
 * требует правки даты». С плейсхолдером правка даты отпечатка не требует, а
 * правка данных требует — ровно то, что нужно.
 *
 * position участвует: изменилась картинка — изменилась карта. Если апгрейд
 * dagre начнёт требовать бампа даты без содержательных правок, координаты можно
 * исключить здесь одной строкой (их корректность сторожит tests/layout.test.ts).
 */
function fingerprintOf(rawJson: string): string {
  const map: unknown = JSON.parse(rawJson);
  const canonical = { ...(map as Record<string, unknown>), updatedAt: '<updatedAt>' };
  return createHash('sha256')
    .update(JSON.stringify(canonical, null, 2) + '\n', 'utf8')
    .digest('hex');
}

describe('дата «Обновлено» описывает то содержание, которое лежит в данных', () => {
  it('отпечаток содержания совпадает с объявленным в импортёре', () => {
    const actual = fingerprintOf(jsonSource);
    const declared = readPythonString('MAP_DATA_FINGERPRINT');

    expect(
      actual,
      [
        'Содержание src/data/snp/process.json изменилось, а дата в шапке — нет.',
        'В scripts/import-pptx.py поставьте:',
        `  MAP_UPDATED_AT = "<дата правки, YYYY-MM-DD>"`,
        `  MAP_DATA_FINGERPRINT = "${actual}"`,
        'и прогоните npm run data.',
      ].join('\n'),
    ).toBe(declared);
  });

  it('объявленная дата доехала до данных и имеет формат ISO', () => {
    // Зеркальный случай к проверке выше и с ДРУГИМ диагнозом: константу
    // поправили, а конвейер не прогнали. Одинаковое сообщение на два инварианта
    // сделало бы красный тест нечитаемым.
    const declared = readPythonString('MAP_UPDATED_AT');
    const inData = (JSON.parse(jsonSource) as { updatedAt: string }).updatedAt;

    expect(declared).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(inData, 'MAP_UPDATED_AT правили, а npm run data не прогоняли — данные отстали').toBe(
      declared,
    );
  });
});
