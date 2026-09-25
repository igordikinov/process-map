// scripts/data.ts
// Конвейер данных целиком:  презентация → src/data/snp/process.json
//
//     npm run data
//
// ЗАЧЕМ ОТДЕЛЬНАЯ КОМАНДА (задача process-map-3b9). Конвейер состоит из двух
// шагов, и порядок между ними обязателен:
//
//   1. scripts/import-pptx.py — вынимает содержание из «SNP Е2Е процесс.pptx»
//      и кладёт в `position` СЫРУЮ геометрию слайда (карточки на ней
//      накладываются десятками пар), а её же копию — в `slidePosition`;
//   2. scripts/layout.ts — считает по `slidePosition` пригодные координаты
//      (dagre) и перезаписывает `position`.
//
// Перед ними — шаг 0: самопроверка импортёра (`--self-test`, решение владельца
// по process-map-ngw). Упала — не запускается ни импорт, ни раскладка.
//
// Раньше порядок нигде не был зафиксирован: тот, кто прогонял только импорт и
// коммитил, получал карту с наложенными узлами. Теперь помнить порядок не надо
// — есть одна команда, а забытая раскладка ловится ещё и тестом
// (tests/layout.test.ts: координаты файла сверяются с пересчётом).
//
// ПОЧЕМУ НЕ `python … && npm run layout` в package.json: импортёр возвращает 2,
// когда потерял ручные ссылки на экраны (EXIT_LINKS_LOST) — файл при этом
// записан корректно, и раскладку всё равно надо прогнать. `&&` в этом случае
// молча оборвал бы конвейер на сыром файле. Здесь код 2 пробрасывается наружу
// как есть, но раскладка выполняется.

import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runBpmnMap } from './bpmnMap.ts';
import { runLayout } from './layout.ts';
import { isBpmnMapId, mapIdFromArgv, type DataMapId, type MapId } from './mapTarget.ts';

/** Код возврата импортёра «ссылки на экраны потеряны» — scripts/import-pptx.py::EXIT_LINKS_LOST. */
const EXIT_LINKS_LOST = 2;

/**
 * Интерпретаторы Python в порядке предпочтения. `PYTHON` позволяет указать
 * конкретный (например, из venv), `py` — лаунчер Windows, который есть там,
 * где `python` не прописан в PATH.
 */
function pythonCandidates(): string[] {
  const explicit = process.env['PYTHON'];
  return explicit !== undefined && explicit !== '' ? [explicit] : ['python', 'py'];
}

/**
 * Запуск scripts/import-pptx.py с аргументами `args` первым найденным
 * интерпретатором Python. Возвращает код возврата скрипта; 1 — если запустить
 * не удалось вовсе.
 */
function runImporter(args: readonly string[]): number {
  const script = fileURLToPath(new URL('./import-pptx.py', import.meta.url));
  const candidates = pythonCandidates();
  for (const [index, exe] of candidates.entries()) {
    const result = spawnSync(exe, [script, ...args], {
      stdio: 'inherit',
    });
    // @types/node типизирует result.error как обычный Error, без code: код
    // ошибки живёт в NodeJS.ErrnoException, куда Error присваивается напрямую
    // (все поля там необязательные). Приведение не нужно — только аннотация.
    const spawnError: NodeJS.ErrnoException | undefined = result.error;
    // ENOENT именно на этом кандидате — пробуем следующий; на последнем — падаем.
    if (spawnError?.code === 'ENOENT') {
      if (index < candidates.length - 1) {
        continue;
      }
      console.error(
        `\nне найден интерпретатор Python (пробовали: ${candidates.join(', ')}).\n` +
          'Укажите его явно:  PYTHON=C:\\path\\to\\python.exe npm run data',
      );
      return 1;
    }
    if (result.error !== undefined) {
      console.error(`\nне удалось запустить ${exe}: ${result.error.message}`);
      return 1;
    }
    return result.status ?? 1;
  }
  return 1;
}

/**
 * Аргументы самопроверки импортёра (`--self-test`): презентация ей не нужна,
 * и сама она ничего не пишет.
 *
 * ЗАЧЕМ ЗДЕСЬ (решение владельца по process-map-ngw). Самопроверка стережёт в
 * том числе код, который из этого конвейера для опубликованных карт НЕДОСТИЖИМ
 * (групп в колодах SNP и MRP нет, разбор ярусов не вызывается), — побайтовое
 * сравнение пересобранных карт его не покрывает. Раньше самопроверку не
 * запускало ничего: только человек руками. Теперь её гоняют CI
 * (.github/workflows/deploy.yml) и этот конвейер, а npm run check — нет: он
 * обязан обходиться без Python. Кто запускает конвейер, тот трогает импортёр,
 * и Python у него есть.
 */
export const SELF_TEST_ARGS: readonly string[] = ['--self-test'];

/**
 * Аргументы импорта карты. --in-pipeline: импортёр знает, что раскладка
 * запустится следом, и не требует её отдельной строкой
 * (scripts/import-pptx.py::print_layout_required).
 */
export function importArgs(mapId: MapId): readonly string[] {
  return ['--in-pipeline', '--map', mapId];
}

/**
 * Шаги конвейера, которые запускают внешние программы и пишут файлы.
 *
 * ЗАЧЕМ ПАРАМЕТРОМ. Порядок шагов и обрыв конвейера на упавшей самопроверке —
 * решение владельца (process-map-ngw), и без теста его стёр бы любой рефакторинг:
 * `if (false)` вместо проверки кода самопроверки оставлял зелёными все проверки
 * проекта, а конвейер шёл дальше и собирал карту сломанным импортёром. С шагами
 * параметром tests/mapRegistry.test.ts гоняет настоящий runPipeline на
 * подставных шагах — без Python и без записи файлов. Рабочий путь зовёт
 * runPipeline без второго аргумента.
 */
export interface PipelineSteps {
  /** scripts/import-pptx.py с аргументами; код возврата скрипта. */
  readonly importer: (args: readonly string[]) => number;
  /** scripts/layout.ts — раскладка карты из презентации. */
  readonly layout: (mapId: MapId) => number;
  /** scripts/bpmnMap.ts — вся ветка карты из модели. */
  readonly bpmn: () => number;
}

const REAL_STEPS: PipelineSteps = {
  importer: runImporter,
  layout: runLayout,
  bpmn: runBpmnMap,
};

/** Весь конвейер для карты `mapId`; возвращает код возврата процесса. */
export function runPipeline(mapId: DataMapId, steps: PipelineSteps = REAL_STEPS): number {
  /*
   * РАЗВИЛКА ПО ИСТОЧНИКУ (process-map-0c5.4). У карты из модели нет
   * презентации, поэтому питоновский импортёр в этой ветке не участвует вовсе.
   * Раскладка тоже: адаптер уже разложил карту тем же ядром layoutStage,
   * сидируясь геометрией схемы, — второй проход был бы no-op, а лишний шаг в
   * конвейере обязательно однажды разошёлся бы с первым.
   */
  if (isBpmnMapId(mapId)) {
    return steps.bpmn();
  }

  /*
   * ШАГ 0 — САМОПРОВЕРКА ИМПОРТЁРА, до импорта (process-map-ngw). Стоит ПОСЛЕ
   * развилки по источнику намеренно: карта из модели импортёра не касается, и
   * требовать ради неё Python значило бы уронить конвейер там, где он не нужен.
   *
   * Упавшая самопроверка обрывает конвейер: импорт по сломанному импортёру дал
   * бы файл, которому нельзя верить, — а разбираться, что именно в нём не так,
   * пришлось бы по диффу данных вместо названной проверки.
   */
  const selfTestCode = steps.importer(SELF_TEST_ARGS);
  if (selfTestCode !== 0) {
    console.error(
      `\nсамопроверка импортёра (scripts/import-pptx.py --self-test) завершилась с кодом ` +
        `${selfTestCode} — импорт и раскладка НЕ запускались, ` +
        `src/data/${mapId}/process.json остался в прежнем состоянии`,
    );
    return selfTestCode;
  }

  const importCode = steps.importer(importArgs(mapId));
  // 0 — всё перенесено, 2 — часть ручных ссылок потеряна (файл записан).
  // Любой другой код означает, что импорт не состоялся: раскладывать нечего.
  if (importCode !== 0 && importCode !== EXIT_LINKS_LOST) {
    console.error(
      `\nимпорт завершился с кодом ${importCode} — раскладка НЕ запускалась, ` +
        `src/data/${mapId}/process.json остался в прежнем состоянии`,
    );
    return importCode;
  }

  const layoutCode = steps.layout(mapId);
  if (layoutCode !== 0) {
    return layoutCode;
  }

  console.log('\nконвейер завершён: самопроверка → import-pptx.py → layout.ts');
  if (importCode === EXIT_LINKS_LOST) {
    console.log(
      `код возврата ${EXIT_LINKS_LOST}: часть ручных ссылок на экраны потеряна — ` +
        'список выше, проставьте их заново',
    );
  }
  return importCode;
}

// Модуль импортируют тесты ради runPipeline, поэтому конвейер запускается только
// при прямом запуске `npm run data` — тем же приёмом, что в scripts/layout.ts.
function isDirectRun(): boolean {
  const entry = process.argv[1];
  if (entry === undefined) {
    return false;
  }
  try {
    return resolve(entry) === resolve(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isDirectRun()) {
  // Карта разбирается ОДИН раз и передаётся обоим шагам: разные ключи у импорта
  // и раскладки означали бы, что вторая переписывает координатами чужой файл.
  process.exitCode = runPipeline(mapIdFromArgv(process.argv.slice(2)));
}
