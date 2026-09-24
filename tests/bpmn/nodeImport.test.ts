// Сторож: адаптер BPMN импортируется НАСТОЯЩИМ Node (process-map-0c5.2).
//
// ЗАЧЕМ ОТДЕЛЬНЫЙ ТЕСТ И ПОЧЕМУ ОН ЗАПУСКАЕТ ПОДПРОЦЕСС.
//
// Конвейер данных собирает карту из .bpmn обычным Node-скриптом, а Node с
// `--experimental-strip-types` требует явного расширения у рантаймных импортов.
// В `src/data/bpmn/**` они поэтому все написаны с `.ts` — в отличие от остального
// `src/`.
//
// Обычный тест эту поломку НЕ ЗАМЕТИЛ БЫ: vitest резолвит модули через Vite, а
// тому расширения безразличны. Убери `.ts` из любого импорта — весь корпус
// останется зелёным, и сломается только конвейер, то есть в тот момент, когда
// кто-то соберётся перегенерировать карту. Поэтому проверка гоняет настоящий
// `node`, а не импортирует модуль сама.
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

// Путь от корня репозитория, а НЕ от import.meta.url: под vitest он не
// file:-URL, и fileURLToPath на нём падает. Та же ловушка описана в
// scripts/mapTarget.ts, где корень поэтому считается лениво.
const ADAPTER = resolve(process.cwd(), 'src/data/bpmn/adapter.ts');

describe('адаптер BPMN пригоден для конвейера данных', () => {
  it('импортируется настоящим Node через --experimental-strip-types', () => {
    const result = spawnSync(
      process.execPath,
      [
        '--experimental-strip-types',
        '--no-warnings',
        '--input-type=module',
        '--eval',
        // pathToFileURL обязателен: на Windows динамический import() от пути
        // вида C:\… видит схему «c:» и падает с ERR_UNSUPPORTED_ESM_URL_SCHEME.
        // JSON.stringify — чтобы обратные слэши не стали escape-последовательностями.
        `const m = await import(${JSON.stringify(pathToFileURL(ADAPTER).href)});
         if (typeof m.bpmnToProcessMap !== 'function') {
           throw new Error('bpmnToProcessMap не экспортируется');
         }`,
      ],
      { encoding: 'utf8' },
    );

    expect(
      result.status,
      `Node не смог импортировать адаптер. Скорее всего, у относительного импорта ` +
        `в src/data/bpmn/** пропало расширение .ts — оно там обязательно, ` +
        `см. шапку adapter.ts (process-map-0c5.2).\n${result.stderr}`,
    ).toBe(0);
  });
});
