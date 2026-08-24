// Классификация узлов этапа: поток шагов vs колонки входов/выходов.
//
// Это ЕДИНСТВЕННЫЙ источник правила разделения data-узлов на колонки входов и
// выходов: data-узел — вход, если его x левее середины bounding box не-data
// узлов, иначе выход. Отсюда его берут и `scripts/layout.ts` (раскладка), и
// счётчик в `Breadcrumbs`, и экран `StageDetail`.
//
// Модуль живёт в `src/`, а не в `scripts/`, потому что зависимость может идти
// только в эту сторону: `scripts/layout.ts` тянет `@dagrejs/dagre`, а SPEC §1
// требует держать dagre вне рантайм-бандла. Здесь — только классификация уже
// существующих `position`, без пересчёта координат.
//
// Не заводить вторую копию правила: колонки на экране, счётчик и раскладка
// обязаны совпадать.
import type { ProcessNode, Stage } from '../data/schema';

export interface StageDataSplit {
  inputs: ProcessNode[];
  outputs: ProcessNode[];
}

export function splitStageDataNodes(stage: Stage): StageDataSplit {
  const flow = stage.nodes.filter((node) => node.type !== 'data');
  const data = stage.nodes.filter((node) => node.type === 'data');
  if (flow.length === 0) {
    return { inputs: data, outputs: [] };
  }
  const xs = flow.map((node) => node.position.x);
  const midpoint = (Math.min(...xs) + Math.max(...xs)) / 2;
  return {
    inputs: data.filter((node) => node.position.x < midpoint),
    outputs: data.filter((node) => node.position.x >= midpoint),
  };
}

export interface StageNodeCounts {
  /** Узлы потока: `step` + `integration` + `warning` (SPEC §4.2, все они
   *  рисуются карточкой шага и раскладываются dagre в одном потоке —
   *  см. `scripts/layout.ts::NODE_SIZE` и `layoutFlow`, где integration/
   *  warning используют тот же размер, что step, и не выделяются в
   *  отдельную группу). */
  steps: number;
  inputs: number;
  outputs: number;
}

export function countStageNodes(stage: Stage): StageNodeCounts {
  const { inputs, outputs } = splitStageDataNodes(stage);
  return {
    steps: stage.nodes.length - inputs.length - outputs.length,
    inputs: inputs.length,
    outputs: outputs.length,
  };
}
