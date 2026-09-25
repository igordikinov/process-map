// Страница юнит-тестов — snp, и никакая другая (process-map-9mn.34).
//
// ЗАЧЕМ СТОРОЖ. Около двадцати пяти файлов tests/ читают страницу через алиасы
// @map / @map-alt, и часть из них проверяет содержание SNP дословно (побайтовое
// сравнение в tests/loader.test.ts, четыре карточки обзора, номера этапов в
// deep-link). Пересади их на другую карту — и они покраснеют десятками с
// сообщениями про чужое содержание, а причину придётся искать. Этот файл
// называет её одной строкой.
//
// Здесь же — сторож механизма, на котором стоит страница из фикстур
// (tests/fixtures/pageMocks.ts): у алиасов данных в Vitest разные id модулей.
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mapJsonPath, UNIT_TEST_MAP } from '../scripts/mapTarget.ts';
import { loadBaseProcessMap } from '../src/data/loader';
import { DEFAULT_VERSION_ID } from '../src/data/versions';

const WHY =
  'Юнит-тесты обязаны идти на странице snp: около двадцати пяти файлов tests/ проверяют ' +
  'её содержание дословно. Страницу задаёт UNIT_TEST_MAP в scripts/mapTarget.ts — не ' +
  'DEFAULT_MAP и не переменная MAP (почему — в комментарии там же); vitest.config.ts ' +
  'обязан брать алиас из mapAlias(UNIT_TEST_MAP).';

describe('страница юнит-тестов', () => {
  it('закреплена за snp', () => {
    expect(UNIT_TEST_MAP, WHY).toBe('snp');
  });

  /*
   * Константы мало: её можно не донести до конфига. vitest.config.ts,
   * вернувшийся к mapIdFromEnv() или перешедший на DEFAULT_MAP, оставил бы
   * проверку выше зелёной, а тесты — на чужой карте. Здесь смотрится то, что
   * реально попало в бандл тестов, против файла на диске.
   */
  it('в бандл тестов собрана именно она', () => {
    const onDisk = JSON.parse(readFileSync(mapJsonPath('snp'), 'utf8')) as { id: string };

    expect(DEFAULT_VERSION_ID, WHY).toBe(onDisk.id);
    expect(loadBaseProcessMap().id, WHY).toBe(onDisk.id);
  });
});

describe('алиасы данных в Vitest', () => {
  afterEach(() => {
    vi.doUnmock('@map/process.json');
    vi.resetModules();
  });

  /*
   * ГЛАВНОЕ. У страницы без второй версии @map и @map-alt ведут в ОДИН каталог,
   * а после process-map-9mn.20 такой станет сама snp. vi.mock подменяет модуль
   * по разрешённому id: совпади id у двух алиасов — два vi.mock в тестах
   * механики версий легли бы на один модуль, и страница из двух фикстур молча
   * стала бы страницей из одной (подробно — testAlias в vitest.config.ts).
   *
   * КАК ЭТО ПРОВЕРЯЕТСЯ НЕЗАВИСИМО ОТ СБОРКИ. Какая карта сегодня без второй
   * версии — решение сборки, и ждать его сторож не должен. Поэтому один и тот
   * же файл читается через оба алиаса нарочно: `@map-alt/../snp/` — это
   * src/data/snp/ при любом каталоге второй версии, лишь бы он лежал в
   * src/data/. Ровно та ситуация, в которой без суффикса id совпадали.
   */
  it('подмена @map не задевает тот же файл, прочитанный через @map-alt', async () => {
    vi.resetModules();
    vi.doMock('@map/process.json', () => ({ default: { id: 'подмена' } }));

    const viaMap = (await import('@map/process.json')).default;
    const viaAlt = (await import('@map-alt/../snp/process.json')).default;

    // Без этой строки зелёная проверка ниже ничего бы не доказывала: подмена,
    // которая не сработала вовсе, тоже «не задевает» соседа.
    expect(viaMap.id, 'vi.doMock не подменил @map/process.json').toBe('подмена');
    expect(
      viaAlt.id,
      'подмена @map/process.json задела @map-alt: у алиасов общий id модуля. ' +
        'Проверьте суффикс ?<имя алиаса> в testAlias (vitest.config.ts) — без него ' +
        'страница из фикстур (tests/fixtures/pageMocks.ts) схлопывается до одной версии.',
    ).toBe('snp');
  });
});
