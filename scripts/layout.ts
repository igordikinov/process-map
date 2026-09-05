// scripts/layout.ts
// Пересчитывает стартовые координаты узлов src/data/<карта>/process.json.
//
// Запуск (из корня репозитория):
//
//     npm run layout       # только раскладка
//     npm run data         # весь конвейер: import-pptx.py → layout.ts
//
// ЭТО ВТОРАЯ ПОЛОВИНА КОНВЕЙЕРА. Первая — scripts/import-pptx.py: она кладёт в
// `position` сырую геометрию слайда, на которой карточки накладываются. Порядок
// «импорт → раскладка» обязателен, поэтому обе половины склеены в `npm run data`.
//
// САМА РАСКЛАДКА ЖИВЁТ НЕ ЗДЕСЬ, а в src/layout/stageLayout.ts
// (process-map-70e.2). Здесь остались только чтение файла, отчёт и запись.
// Причина переезда: то же ядро нужно в браузере — схема BPMN, загруженная
// пользователем, приходит без координат вовсе, и вторая реализация раскладки
// показывала бы одну и ту же карту в двух разных видах.
//
// ЧЕМ СИДИРУЕТСЯ РАСКЛАДКА (задача process-map-cxn). Исходный порядок узлов и
// деление data-узлов на колонки входов/выходов берутся из `node.slidePosition` —
// геометрии слайда, которую пишет импортёр и которую этот скрипт НЕ трогает.
// Раньше сидировался `position` — то самое поле, которое скрипт перезаписывает,
// то есть после первого прогона раскладка опиралась на результат собственной
// прошлой работы, а геометрия презентации была потеряна. Если slidePosition в
// файле нет (старый файл, экспорт из стороннего инструмента), раскладка
// откатывается на `position` и скрипт печатает об этом предупреждение.
//
// Скрипт меняет в JSON ТОЛЬКО поле position у узлов: содержание (id, label,
// рёбра, группы, типы) берётся из презентации и здесь не трогается.
// Прогон детерминирован — повторный запуск даёт побайтово тот же файл:
// узлы и рёбра сортируются перед добавлением в граф, координаты округляются
// до целых, случайности нет.
//
// Раскладка считается отдельно для двух независимых графов:
//   · уровень 2 (SPEC §4.2) — по одному графу на этап: шаги/интеграции/
//     предупреждения через dagre (rankdir LR), data-узлы — колонками входов
//     слева и выходов справа;
//   · уровень 1 (SPEC §4.1) — карточки этапов + внешние системы по
//     overviewEdges. В схеме (src/data/schema.ts) у Stage нет поля position,
//     поэтому координаты обзора НЕ записываются, а только печатаются в отчёте.

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ProcessMapSchema, type ProcessMap } from '../src/data/schema.ts';
import {
  boundsOf,
  countOverlappingPairs,
  countStageOverlaps,
  countWithoutSlidePosition,
  layoutOverview,
  layoutStage,
  rectOf,
} from '../src/layout/stageLayout.ts';
import { splitStageDataNodes as splitDataNodes } from '../src/utils/stageNodes.ts';
import { DEFAULT_MAP, mapIdFromArgv, mapJsonPath, type MapId } from './mapTarget.ts';

// Реестр карт и разбор `--map` — в scripts/mapTarget.ts: тот же список нужен
// конфигам сборки, а второй экземпляр разошёлся бы с первым.

// --------------------------------------------------------------------------------------
// Запись и отчёт
// --------------------------------------------------------------------------------------

/**
 * Формат записи повторяет scripts/import-pptx.py (json.dumps ensure_ascii=False,
 * indent=2, перевод строки в конце, LF): иначе прогоны импорта и раскладки
 * бесконечно переписывали бы файл друг за другом.
 */
function serialize(map: ProcessMap): string {
  return `${JSON.stringify(map, null, 2)}\n`;
}

/**
 * Полный прогон раскладки: читает src/data/<карта>/process.json, пересчитывает
 * координаты, печатает отчёт и записывает файл. Экспортируется ради
 * scripts/data.ts (конвейер `npm run data`), который вызывает её в том же
 * процессе после импорта.
 */
export function runLayout(mapId: MapId = DEFAULT_MAP): number {
  const path = mapJsonPath(mapId);
  const original = readFileSync(path, 'utf8');
  const raw = JSON.parse(original) as ProcessMap;
  ProcessMapSchema.parse(raw);

  const before = raw.stages.map((stage) => ({
    number: stage.number,
    overlaps: countStageOverlaps(stage),
  }));

  const lines: string[] = [];
  lines.push('='.repeat(78));
  lines.push('ОТЧЁТ  scripts/layout.ts  (dagre → position)');
  lines.push('='.repeat(78));

  for (const stage of raw.stages) {
    const placements = layoutStage(stage);
    for (const node of stage.nodes) {
      const placement = placements.get(node.id);
      if (placement === undefined) {
        throw new Error(`Узел "${node.id}" не получил координат`);
      }
      node.position = { x: placement.x, y: placement.y };
    }
  }

  for (const stage of raw.stages) {
    const rects = stage.nodes.map(rectOf);
    const bounds = boundsOf(rects);
    const { inputs, outputs } = splitDataNodes(stage);
    const flowCount = stage.nodes.length - inputs.length - outputs.length;
    const wasOverlaps = before.find((item) => item.number === stage.number)?.overlaps ?? 0;
    lines.push('');
    lines.push(`--- этап ${stage.number} «${stage.shortTitle}» ${'-'.repeat(30)}`);
    lines.push(`  habitat:              ${bounds.width}×${bounds.height} px`);
    lines.push(
      `  узлов:                ${stage.nodes.length} ` +
        `(поток ${flowCount}, входов ${inputs.length}, выходов ${outputs.length})`,
    );
    lines.push(`  групп:                ${stage.groups.length}`);
    lines.push(`  рёбер:                ${stage.edges.length}`);
    lines.push(`  пересечений узлов:    ${countOverlappingPairs(rects)} (было ${wasOverlaps})`);
    const orphans = countWithoutSlidePosition(stage);
    if (orphans > 0) {
      lines.push(
        `  БЕЗ slidePosition:    ${orphans} — исходная геометрия слайда утрачена,` +
          ` раскладка сидирована собственным прошлым результатом;` +
          ` восстанавливается перегенерацией: npm run data`,
      );
    }
  }

  const overview = layoutOverview(raw);
  const overviewBounds = boundsOf(overview);
  lines.push('');
  lines.push(`--- обзор (уровень 1) ${'-'.repeat(43)}`);
  lines.push(`  habitat:              ${overviewBounds.width}×${overviewBounds.height} px`);
  lines.push(
    `  узлов:                ${overview.length} ` +
      `(этапов ${overview.filter((item) => item.kind === 'stage').length}, ` +
      `систем ${overview.filter((item) => item.kind === 'system').length})`,
  );
  lines.push(`  рёбер:                ${raw.overviewEdges.length}`);
  lines.push(`  пересечений узлов:    ${countOverlappingPairs(overview)}`);
  lines.push('  координаты (в схеме Stage поля position нет — в JSON не пишутся):');
  for (const item of overview) {
    lines.push(
      `    ${item.kind === 'stage' ? 'этап  ' : 'система'} ${item.id}: x=${item.x} y=${item.y}`,
    );
  }

  const updated = serialize(raw);
  const changed = updated !== original;
  writeFileSync(path, updated, { encoding: 'utf8' });

  lines.push('');
  lines.push('='.repeat(78));
  // Путь печатается настоящий: сообщение с литералом «snp» врало бы при
  // раскладке второй карты (process-map-3wh.9).
  lines.push(`  ${changed ? 'записано' : 'без изменений'}: src/data/${mapId}/process.json`);
  lines.push('='.repeat(78));

  console.log(lines.join('\n'));
  return 0;
}

// Модуль импортируется scripts/data.ts ради runLayout, поэтому запись файла
// выполняется только при прямом запуске `npm run layout`.
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
  process.exitCode = runLayout(mapIdFromArgv(process.argv.slice(2)));
}
