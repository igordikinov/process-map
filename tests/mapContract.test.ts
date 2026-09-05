// Контракт карты: инварианты, которым обязана удовлетворять ЛЮБАЯ карта
// процесса, а не конкретно SNP (задача process-map-3wh.3).
//
// ЗАЧЕМ ОТДЕЛЬНЫЙ ФАЙЛ. До второй карты требования к данным были размазаны по
// корпусу: часть лежала в tests/data.test.ts, часть — в виде `throw new Error`
// на уровне модуля в tests/useDeepLink.test.tsx и tests/breadcrumbs.test.tsx
// («в process.json нет этапа 2»). Такие требования не видны, пока не сломаются,
// и ломаются с ложным диагнозом: падает тест про хлебные крошки, хотя дело в
// данных. Здесь они собраны в одном месте и проверяются явно.
//
// ПОЧЕМУ ЧЕРЕЗ fs, А НЕ ЧЕРЕЗ import. Карты обнаруживаются на диске
// (src/data/<id>/process.json), а не импортируются статически. Тогда один
// `vitest run` проверяет ВСЕ карты сразу — независимо от того, под какую
// настроена сборка, — и третья карта не потребует ни строчки правок здесь.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ProcessMapSchema, validateIntegrity } from '../src/data/schema.ts';
import { layoutStage } from '../src/layout/stageLayout.ts';

const DATA_ROOT = resolve(process.cwd(), 'src', 'data');

interface DiscoveredMap {
  /** Имя каталога: src/data/<id>/process.json */
  id: string;
  path: string;
  source: string;
}

function discoverMaps(): DiscoveredMap[] {
  return readdirSync(DATA_ROOT)
    .filter((entry) => statSync(join(DATA_ROOT, entry)).isDirectory())
    .map((id) => ({ id, path: join(DATA_ROOT, id, 'process.json') }))
    .filter(({ path }) => {
      try {
        return statSync(path).isFile();
      } catch {
        return false;
      }
    })
    .map(({ id, path }) => ({ id, path, source: readFileSync(path, 'utf8') }));
}

const maps = discoverMaps();

describe('контракт карты: обнаружение', () => {
  // Без этого весь файл деградировал бы молча: describe.each по пустому
  // массиву — это ноль тестов и зелёный прогон. Ровно та тихая деградация,
  // от которой контракт и должен защищать.
  it('в src/data/ найдена хотя бы одна карта', () => {
    expect(maps.map((map) => map.id)).not.toEqual([]);
  });
});

describe.each(maps)('контракт карты: $id', ({ id, source }) => {
  const map = ProcessMapSchema.parse(JSON.parse(source));

  it('разбирается схемой без ошибок', () => {
    expect(() => ProcessMapSchema.parse(JSON.parse(source))).not.toThrow();
  });

  it('не содержит проблем ссылочной целостности', () => {
    expect(validateIntegrity(map)).toEqual([]);
  });

  it('id узлов уникальны глобально по всему документу', () => {
    const ids = map.stages.flatMap((stage) => stage.nodes.map((node) => node.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('номера этапов идут 1..N без дыр и повторов', () => {
    // БЫЛО «ровно четыре этапа»: четвёрка была снята с презентаций и попала в
    // контракт как свойство любой карты. С импортом BPMN это перестало быть
    // правдой — этапов столько, сколько модулей в файле, — и проверка
    // переехала в tests/snp/content.test.ts и tests/mrp/content.test.ts, где
    // она верна. Здесь остался инвариант, который обязан держаться у КАЖДОЙ
    // карты: нумерация сплошная, начинается с единицы, номера не повторяются.
    // Он не формальность: по number ищет этап deep-link (?stage=N), и дыра в
    // нумерации даёт ссылку в никуда.
    const numbers = map.stages.map((stage) => stage.number).sort((a, b) => a - b);
    expect(numbers.length).toBeGreaterThan(0);
    expect(numbers).toEqual(numbers.map((_, index) => index + 1));
  });

  it('есть этапы с номерами 1 и 2: на них держатся тесты интерфейса', () => {
    // Поднято из ведра B. Раньше это требование жило как `throw new Error` на
    // уровне модуля в tests/useDeepLink.test.tsx:16-28 и tests/breadcrumbs.test.tsx
    // — то есть карта без этапа 2 роняла ЦЕЛЫЕ файлы тестов интерфейса с
    // диагнозом про хлебные крошки. Здесь оно названо своим именем.
    const numbers = new Set(map.stages.map((stage) => stage.number));
    expect(numbers.has(1), 'нет этапа 1').toBe(true);
    expect(numbers.has(2), 'нет этапа 2').toBe(true);
  });

  it('у каждого этапа есть узлы', () => {
    for (const stage of map.stages) {
      expect(stage.nodes.length, `этап ${stage.number} пуст`).toBeGreaterThan(0);
    }
  });

  it('есть хотя бы один шаг без ссылки на экран', () => {
    // На этом держатся e2e/helpers.ts::firstStepWithoutLink и
    // e2e/json-transfer.spec.ts: они выбирают узел без screen, чтобы тесты не
    // зависели от того, куда владелец поставит очередную ссылку
    // (process-map-071). Если ссылки проставят всем шагам, это надо увидеть
    // здесь, а не по таймауту в семи e2e.
    const steps = map.stages.flatMap((stage) => stage.nodes).filter((node) => node.type === 'step');
    expect(steps.length).toBeGreaterThan(0);
    expect(steps.filter((node) => node.screen === undefined).length).toBeGreaterThan(0);
  });

  it('direction проставлен у всех data-узлов и только у них', () => {
    // Импортёр знает направление точно (по происхождению фигуры), поэтому
    // «поле опционально» относится к чужим документам, а не к нашим файлам.
    // Если проставлять его перестанут, splitStageDataNodes молча откатится на
    // геометрию — ровно дефект, который чинил process-map-24p.
    const nodes = map.stages.flatMap((stage) => stage.nodes);
    const data = nodes.filter((node) => node.type === 'data');

    expect(data.length).toBeGreaterThan(0);
    expect(data.filter((node) => node.direction === undefined).map((node) => node.id)).toEqual([]);
    expect(
      nodes
        .filter((node) => node.type !== 'data' && node.direction !== undefined)
        .map((node) => node.id),
    ).toEqual([]);
  });

  it('координаты совпадают с пересчётом: конвейер доведён до конца', () => {
    // Перенесено из tests/layout.test.ts, потому что инвариант — про карту, а
    // не про раскладку: он ловит документ, над которым прогнали только импорт
    // (scripts/import-pptx.py) и не прогнали scripts/layout.ts. Здесь он
    // сторожит каждую карту, а не только SNP.
    for (const stage of map.stages) {
      const placements = layoutStage(stage);
      for (const node of stage.nodes) {
        const placement = placements.get(node.id);
        expect(placement, `${node.id} не получил координат`).toBeDefined();
        expect(
          placement,
          `${node.id}: координаты файла не совпадают с раскладкой по исходной геометрии слайда. ` +
            'Похоже, прогнан только импорт (scripts/import-pptx.py) — в файле сырая ' +
            'геометрия презентации, на которой карточки накладываются. ' +
            'Конвейер целиком: npm run data',
        ).toEqual(node.position);
      }
    }
  });

  it('формат файла: отступ 2, LF, кириллица не экранирована', () => {
    // Формат задаёт JSON.stringify внутри serializeProcessMap, а не prettier
    // (файл в .prettierignore). На побайтовом совпадении держится передача
    // ссылок на экраны из браузера в репозиторий (docs/ссылки-на-экраны.md),
    // поэтому формат — часть контракта, а не косметика.
    expect(source, 'найден CR: файл должен быть с LF').not.toMatch(/\r/);
    expect(source.endsWith('\n'), 'нет завершающего перевода строки').toBe(true);
    expect(source.endsWith('\n\n'), 'лишний пустой перевод строки в конце').toBe(false);
    expect(source, 'кириллица экранирована в \\uXXXX').not.toMatch(/\\u04/);
    expect(source.split('\n')[1] ?? '', 'отступ не в два пробела').toMatch(/^ {2}\S/);
  });

  it('id карты совпадает с именем каталога', () => {
    // Ключ overrides в localStorage выводится из map.id (loader.ts), а данные
    // берутся из каталога. Расхождение означало бы, что карта пишет правки под
    // чужим ключом, и заметить это можно было бы только по жалобе.
    expect(id).toMatch(/^[a-z][a-z0-9-]*$/);
    expect(map.id).toBe(id);
  });

  it('подпись модуля непустая', () => {
    // Рисуется рамкой вокруг потока этапов (overviewGraph.ts). Пустая строка
    // прошла бы схему и дала бы безымянную рамку на экране.
    expect(map.moduleLabel.trim()).not.toBe('');
  });
});
