// Реестры карт в конвейере обязаны сходиться (задача process-map-3wh.7).
//
// Карт две штуки в трёх местах: MAPS в scripts/import-pptx.py (что умеет
// разбирать импортёр), MAP_IDS в scripts/layout.ts (что умеет раскладывать) и
// каталоги src/data/*/ (что реально лежит на диске). Разойдись любые два —
// получилось бы «импорт прошёл, раскладка отказалась» или, хуже, раскладка
// молча переписала бы координатами не тот файл.
//
// Python из npm run check не запускается (решение владельца по process-map-ngw:
// проверка обязана обходиться без него; Python запускают только CI и npm run
// data, и только ради самопроверки импортёра). Поэтому реестры импортёра
// читаются из его ИСХОДНИКА: здесь — регуляркой по телу словаря, а константы и
// таблицы решений (tests/snp/importPreserve.test.ts и другие) — разборщиком
// tests/helpers/importerSource.ts, который разбирает python-литерал целиком.
//
// Здесь же — проводка той самой самопроверки (два последних describe): первым
// шагом npm run data и шагом CI до npm run check. Отдельного файла под неё нет:
// предмет тот же — импортёр и конвейер, которые реестры выше и соединяют.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { importArgs, runPipeline, SELF_TEST_ARGS, type PipelineSteps } from '../scripts/data.ts';
import { BPMN_MAP_IDS, DEFAULT_MAP, MAP_IDS, mapAlias } from '../scripts/mapTarget.ts';

const IMPORTER_SOURCE = readFileSync(resolve(process.cwd(), 'scripts', 'import-pptx.py'), 'utf8');
const DATA_ROOT = resolve(process.cwd(), 'src', 'data');

/** Тело реестра MAPS — между `MAPS: … = {` и `}` в первой колонке. */
function importerMapsBody(): string {
  const body = /^MAPS: dict\[str, MapSpec\] = \{$([\s\S]*?)^\}$/m.exec(IMPORTER_SOURCE);
  expect(body, 'в scripts/import-pptx.py не найден реестр MAPS').not.toBeNull();
  return body?.[1] ?? '';
}

/** Ключи MAPS из импортёра: строки вида `    "snp": MapSpec(`. */
function importerMapKeys(): string[] {
  return [...importerMapsBody().matchAll(/^\s{4}"([a-z0-9-]+)": MapSpec\(/gm)].map(
    (m) => m[1] ?? '',
  );
}

/**
 * Профили карт из MAPS: строки вида `        profile="single-slide",`.
 *
 * Ищутся ТОЛЬКО внутри тела MAPS. Раньше регулярка шла по всему файлу, и
 * самопроверка импортёра с её `replace(MAPS["snp"], profile="bogus")` —
 * стоило бы перенести аргумент на свою строку с тем же отступом — добавила бы
 * «профиль карты», которой нет.
 */
function importerMapProfiles(): string[] {
  return [...importerMapsBody().matchAll(/^\s{8}profile="([a-z+-]+)",$/gm)].map((m) => m[1] ?? '');
}

/**
 * Ключи PROFILE_BUILDERS — диспетчера профилей импортёра (process-map-9mn.14.1):
 * строки вида `    "single-slide": build_single_slide_map,` в теле словаря.
 */
function importerProfileBuilders(): string[] {
  const body = /^PROFILE_BUILDERS: dict\[str, Builder\] = \{$([\s\S]*?)^\}$/m.exec(IMPORTER_SOURCE);
  expect(body, 'в scripts/import-pptx.py не найден диспетчер PROFILE_BUILDERS').not.toBeNull();
  return [...(body?.[1] ?? '').matchAll(/^\s{4}"([a-z+-]+)": [a-z_]+,$/gm)].map((m) => m[1] ?? '');
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

  /*
   * ВТОРАЯ ВЕРСИЯ СТРАНИЦЫ ПО УМОЛЧАНИЮ РЕАЛЬНО ПОПАДАЕТ В БАНДЛ.
   *
   * Сторож против тихой деградации: откатись алиас `@map-alt` на карту по
   * умолчанию — список версий схлопнется до одной записи, переключатель исчезнет
   * с экрана, и ни один юнит-тест механики этого не заметит: они идут на
   * странице из фикстур (tests/fixtures/pageMocks.ts), где обе версии подменены.
   *
   * Раньше эта проверка жила в tests/versions.test.tsx и смотрела на список
   * версий собранной в тесты страницы. Но это вопрос КОНФИГУРАЦИИ сборки, а не
   * механики: страница юнит-тестов закреплена за snp (process-map-9mn.34) и
   * после process-map-9mn.20 второй версии иметь не будет, а страница из корня
   * сайта — будет. Проверяется поэтому сама конфигурация. Что переключатель при
   * этом виден и работает в настоящем бандле, проверяет e2e/version-switch.spec.ts.
   */
  it('у страницы по умолчанию вторая версия ведёт в другой каталог', () => {
    const alias = mapAlias(DEFAULT_MAP);
    // Без этого переименованный ключ дал бы «undefined не равно каталогу» —
    // зелёную проверку ни о чём.
    expect(alias['@map']).toBeDefined();
    expect(alias['@map-alt']).toBeDefined();

    expect(
      alias['@map-alt'],
      `у страницы по умолчанию (${DEFAULT_MAP}) нет второй версии: @map-alt откатился на @map. ` +
        'Проверьте MAP_ALT_VERSION в scripts/mapTarget.ts.',
    ).not.toBe(alias['@map']);
  });

  it('у объявленной карты профиль разбора из известного набора', () => {
    // Профилей три: overview+details (устройство презентации SNP — обзор плюс
    // четыре слайда детализации), single-slide (вводит process-map-3wh.9) и
    // three-tier (трёхуровневая карта inplan, process-map-9mn.14).
    const profiles = importerMapProfiles();
    expect(profiles.length).toBe(MAP_IDS.length);
    for (const profile of profiles) {
      expect(['overview+details', 'single-slide', 'three-tier']).toContain(profile);
    }
  });

  /*
   * ПРОФИЛЬ КАРТЫ ОБЯЗАН ИМЕТЬ ПОСТРОИТЕЛЬ (process-map-9mn.14.1). До диспетчера
   * main() выбирал построитель тернаркой, и профиль, которого импортёр не знал,
   * молча уходил в разбор презентации SNP. Теперь такой профиль останавливает
   * импорт (builder_for), а самопроверка импортёра (пункт 11: профиль каждой
   * карты MAPS — ключ PROFILE_BUILDERS) краснеет в CI и первым шагом npm run
   * data. Обоим нужен Python. Эта проверка ловит то же расхождение раньше и без
   * него — в npm run check, до коммита.
   */
  it('профиль каждой карты — ключ диспетчера PROFILE_BUILDERS', () => {
    const builders = importerProfileBuilders();
    // Без этого сломанная регулярка дала бы пустой список, и проверка ниже
    // краснела бы по поводу, который не назван.
    expect(builders).toContain('overview+details');
    for (const profile of importerMapProfiles()) {
      expect(
        builders,
        `профиль «${profile}» из MAPS не зарегистрирован в PROFILE_BUILDERS ` +
          'scripts/import-pptx.py — импорт такой карты остановится',
      ).toContain(profile);
    }
  });
});

/*
 * КОНВЕЙЕР npm run data: САМОПРОВЕРКА — ПЕРВЫЙ ШАГ (решение владельца по
 * process-map-ngw). Гоняется настоящий runPipeline из scripts/data.ts на
 * подставных шагах: Python не нужен, файлы не пишутся, а порядок вызовов и
 * обрыв на упавшей самопроверке видны по журналу. До этого теста строку
 * `if (selfTestCode !== 0)` можно было заменить на `if (false)` — и npm run
 * data, напечатав «САМОПРОВЕРКА ПРОВАЛЕНА», пересобирал карту сломанным
 * импортёром и завершался кодом 0 при зелёном npm run check.
 */
describe('конвейер npm run data: самопроверка импортёра — первый шаг', () => {
  /** Подставные шаги: коды возврата заданы, вызовы пишутся в журнал по порядку. */
  function stubSteps(codes: {
    selfTest?: number;
    importer?: number;
    layout?: number;
    bpmn?: number;
  }): { steps: PipelineSteps; calls: string[] } {
    const calls: string[] = [];
    const steps: PipelineSteps = {
      importer: (args) => {
        calls.push(`importer ${args.join(' ')}`);
        return args.includes('--self-test') ? (codes.selfTest ?? 0) : (codes.importer ?? 0);
      },
      layout: (mapId) => {
        calls.push(`layout ${mapId}`);
        return codes.layout ?? 0;
      },
      bpmn: () => {
        calls.push('bpmn');
        return codes.bpmn ?? 0;
      },
    };
    return { steps, calls };
  }

  // Конвейер печатает итог и причины обрыва; в выводе тестов это шум.
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('аргументы шагов — те, что принимает импортёр', () => {
    // Строгий разбор импортёра (parse_args) остановил бы любой другой флаг —
    // и конвейер упал бы на первом же шаге.
    expect(SELF_TEST_ARGS).toEqual(['--self-test']);
    expect(importArgs('mrp')).toEqual(['--in-pipeline', '--map', 'mrp']);
  });

  it.each(MAP_IDS)('%s: самопроверка → импорт → раскладка, строго в этом порядке', (mapId) => {
    const { steps, calls } = stubSteps({});
    expect(runPipeline(mapId, steps)).toBe(0);
    expect(calls).toEqual([
      'importer --self-test',
      `importer --in-pipeline --map ${mapId}`,
      `layout ${mapId}`,
    ]);
  });

  // Код 2 у импорта означает «файл записан, часть ссылок потеряна», и конвейер
  // идёт дальше. У самопроверки такого кода нет: всё, кроме 0, — провал.
  it.each([1, 2])('самопроверка с кодом %i обрывает конвейер до импорта', (code) => {
    const { steps, calls } = stubSteps({ selfTest: code });
    expect(runPipeline('snp', steps)).toBe(code);
    expect(calls).toEqual(['importer --self-test']);
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('импорт и раскладка НЕ запускались'),
    );
  });

  it('карта из модели обходится без Python: ни самопроверки, ни импорта', () => {
    for (const mapId of BPMN_MAP_IDS) {
      const { steps, calls } = stubSteps({});
      expect(runPipeline(mapId, steps)).toBe(0);
      expect(calls).toEqual(['bpmn']);
    }
  });

  it('импорт с кодом 2 (ссылки потеряны) раскладку не отменяет, код пробрасывается', () => {
    const { steps, calls } = stubSteps({ importer: 2 });
    expect(runPipeline('snp', steps)).toBe(2);
    expect(calls).toEqual([
      'importer --self-test',
      'importer --in-pipeline --map snp',
      'layout snp',
    ]);
  });

  it('упавший импорт раскладку отменяет', () => {
    const { steps, calls } = stubSteps({ importer: 1 });
    expect(runPipeline('snp', steps)).toBe(1);
    expect(calls).toEqual(['importer --self-test', 'importer --in-pipeline --map snp']);
  });
});

/*
 * CI: САМОПРОВЕРКА ИМПОРТЁРА — ШАГ JOB'А build ДО npm run check (решение
 * владельца по process-map-ngw). Проверяется текст workflow: запустить его из
 * vitest нечем. Именно job build — от него зависит deploy (`needs`), и
 * самопроверка, стоящая где-то ещё, деплой бы не держала. Python ставится в том
 * же job'е явно: версию и python-pptx раннер сам не закрепляет.
 */
describe('CI: самопроверка импортёра блокирует деплой', () => {
  const workflow = readFileSync(
    resolve(process.cwd(), '.github', 'workflows', 'deploy.yml'),
    'utf8',
  );

  /** Текст job'а build — от `  build:` до следующего job'а. */
  function buildJob(): string {
    const job = /^ {2}build:\n([\s\S]*?)^ {2}[a-z0-9_-]+:$/m.exec(workflow);
    expect(job, 'в .github/workflows/deploy.yml не найден job build').not.toBeNull();
    return job?.[1] ?? '';
  }

  it('job build: Python 3.11 и python-pptx → --self-test → npm run check', () => {
    const job = buildJob();
    // Регулярки привязаны к началу строки шага: комментарий, где те же слова
    // стоят после «#», шагом не считается.
    const steps: [string, RegExp][] = [
      ['setup-python', /^\s+- uses: actions\/setup-python@v\d+$/m],
      ['python-version 3.11', /^\s+python-version: '3\.11'$/m],
      ['pip install python-pptx', /^\s+- run: python -m pip install python-pptx==[\d.]+/m],
      ['--self-test', /^\s+- run: python scripts\/import-pptx\.py --self-test$/m],
      ['npm run check', /^\s+- run: npm run check$/m],
    ];
    const at = steps.map(([name, pattern]) => {
      const index = job.search(pattern);
      expect(index, `в job build нет шага «${name}»`).toBeGreaterThanOrEqual(0);
      return index;
    });
    expect(at, 'шаги job build идут не в том порядке').toEqual([...at].sort((a, b) => a - b));
  });
});
