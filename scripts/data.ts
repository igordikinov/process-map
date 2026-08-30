// scripts/data.ts
// Конвейер данных целиком:  презентация → src/data/process.json
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
import { fileURLToPath } from 'node:url';
import { runLayout } from './layout.ts';

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

function runImport(): number {
  const script = fileURLToPath(new URL('./import-pptx.py', import.meta.url));
  const candidates = pythonCandidates();
  for (const [index, exe] of candidates.entries()) {
    // --in-pipeline: импортёр знает, что раскладка запустится следом, и не
    // требует её отдельной строкой (scripts/import-pptx.py::print_layout_required).
    const result = spawnSync(exe, [script, '--in-pipeline'], { stdio: 'inherit' });
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

function main(): number {
  const importCode = runImport();
  // 0 — всё перенесено, 2 — часть ручных ссылок потеряна (файл записан).
  // Любой другой код означает, что импорт не состоялся: раскладывать нечего.
  if (importCode !== 0 && importCode !== EXIT_LINKS_LOST) {
    console.error(
      `\nимпорт завершился с кодом ${importCode} — раскладка НЕ запускалась, ` +
        'src/data/process.json остался в прежнем состоянии',
    );
    return importCode;
  }

  const layoutCode = runLayout();
  if (layoutCode !== 0) {
    return layoutCode;
  }

  console.log('\nконвейер завершён: import-pptx.py → layout.ts');
  if (importCode === EXIT_LINKS_LOST) {
    console.log(
      `код возврата ${EXIT_LINKS_LOST}: часть ручных ссылок на экраны потеряна — ` +
        'список выше, проставьте их заново',
    );
  }
  return importCode;
}

process.exitCode = main();
