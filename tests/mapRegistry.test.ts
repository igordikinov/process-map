// Реестры карт в конвейере обязаны сходиться (задача process-map-3wh.7).
//
// Карт две штуки в трёх местах: MAPS в scripts/import-pptx.py (что умеет
// разбирать импортёр), MAP_IDS в scripts/layout.ts (что умеет раскладывать) и
// каталоги src/data/*/ (что реально лежит на диске). Разойдись любые два —
// получилось бы «импорт прошёл, раскладка отказалась» или, хуже, раскладка
// молча переписала бы координатами не тот файл.
//
// Python в CI не запускается (.github/workflows), поэтому его исходник, как и
// в tests/snp/importPreserve.test.ts, разбирается регуляркой.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BPMN_MAP_IDS, DEFAULT_MAP, MAP_IDS } from '../scripts/mapTarget.ts';

const IMPORTER_SOURCE = readFileSync(resolve(process.cwd(), 'scripts', 'import-pptx.py'), 'utf8');
const DATA_ROOT = resolve(process.cwd(), 'src', 'data');

/** Ключи MAPS из импортёра: строки вида `    "snp": MapSpec(`. */
function importerMapKeys(): string[] {
  const body = /^MAPS: dict\[str, MapSpec\] = \{$([\s\S]*?)^\}$/m.exec(IMPORTER_SOURCE);
  expect(body, 'в scripts/import-pptx.py не найден реестр MAPS').not.toBeNull();
  return [...(body?.[1] ?? '').matchAll(/^\s{4}"([a-z0-9-]+)": MapSpec\(/gm)].map(
    (m) => m[1] ?? '',
  );
}

/** Каталоги src/data/<id>/ с файлом process.json. */
function dataDirs(): string[] {
  return readdirSync(DATA_ROOT)
    .filter((entry) => statSync(join(DATA_ROOT, entry)).isDirectory())
    .filter((entry) => {
      try {
        return statSync(join(DATA_ROOT, entry, 'process.json')).isFile();
      } catch {
        return false;
      }
    });
}

describe('реестры карт', () => {
  it('импортёр и раскладка знают один и тот же набор карт', () => {
    expect([...MAP_IDS].sort()).toEqual(importerMapKeys().sort());
  });

  it('у каждой объявленной карты есть данные на диске', () => {
    // Обратное неверно намеренно: каталог может появиться раньше, чем импортёр
    // научится собирать эту карту. А вот объявленная карта без данных означает,
    // что реестр обещает то, чего нет.
    expect([...MAP_IDS].sort()).toEqual(
      dataDirs()
        .filter((id) => (MAP_IDS as readonly string[]).includes(id))
        .sort(),
    );
  });

  /*
   * КАРТЫ ИЗ МОДЕЛИ — второй реестр, и у них НЕТ записи в импортёре
   * презентаций: презентации у них не существует. Поэтому проверка та же, но
   * только против диска.
   */
  it('у каждой карты из модели есть данные на диске', () => {
    expect([...BPMN_MAP_IDS].sort()).toEqual(
      dataDirs()
        .filter((id) => (BPMN_MAP_IDS as readonly string[]).includes(id))
        .sort(),
    );
  });

  it('карта из модели не объявлена целью сборки', () => {
    // Своего адреса у неё нет: она живёт второй версией внутри чужой страницы.
    // Попади она в MAP_IDS — первая же проверка этого файла потребовала бы
    // записи в реестре импортёра презентаций, и реестр начал бы врать.
    for (const id of BPMN_MAP_IDS) {
      expect(MAP_IDS as readonly string[]).not.toContain(id);
    }
  });

  /*
   * ДЫРА, КОТОРУЮ ЗАКРЫВАЕТ ЭТА ПРОВЕРКА. Раньше обратное направление было
   * ослаблено намеренно: «каталог может появиться раньше, чем импортёр научится
   * собирать эту карту». С появлением второго генератора цена этого послабления
   * выросла: каталог, который не производит НИ ОДИН генератор, — это ровно тот
   * способ, которым протухшая карта осталась бы в репозитории незамеченной.
   * Её бы никто не перегенерировал, и никто бы не покраснел.
   */
  it('каждый каталог с данными объявлен хотя бы в одном реестре', () => {
    const declared = new Set<string>([...MAP_IDS, ...BPMN_MAP_IDS]);
    const orphans = dataDirs().filter((id) => !declared.has(id));
    expect(
      orphans,
      `в src/data/ лежат карты, которых нет ни в одном реестре: ${orphans.join(', ')}. ` +
        `Такую карту не перегенерирует ни один конвейер, и её протухание никто не заметит.`,
    ).toEqual([]);
  });

  it('карта по умолчанию объявлена в обоих реестрах', () => {
    expect(MAP_IDS).toContain(DEFAULT_MAP);
    expect(importerMapKeys()).toContain(DEFAULT_MAP);
    expect(IMPORTER_SOURCE).toContain(`DEFAULT_MAP = "${DEFAULT_MAP}"`);
  });

  it('у объявленной карты профиль разбора из известного набора', () => {
    // Профилей два: overview+details (устройство презентации SNP — обзор плюс
    // четыре слайда детализации) и single-slide (вводит process-map-3wh.9).
    const profiles = [...IMPORTER_SOURCE.matchAll(/^\s{8}profile="([a-z+-]+)",$/gm)].map(
      (m) => m[1],
    );
    expect(profiles.length).toBe(MAP_IDS.length);
    for (const profile of profiles) {
      expect(['overview+details', 'single-slide']).toContain(profile);
    }
  });
});
