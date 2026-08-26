// Классификация узлов этапа: поток шагов vs колонки входов/выходов.
//
// Это ЕДИНСТВЕННЫЙ источник правила разделения data-узлов на колонки входов и
// выходов. Отсюда его берут и `scripts/layout.ts` (раскладка), и счётчик в
// `Breadcrumbs`, и экран `StageDetail`.
//
// ПРАВИЛО (задача process-map-24p). Колонку задаёт явное поле
// `node.direction` ('in' | 'out', SPEC §3): его проставляет импортёр по
// происхождению фигуры в презентации (левая колонка слайда детализации → 'in',
// блок выходов этапа на слайде обзора → 'out'), а не по координатам.
//
// Геометрия направление НЕ задаёт и задавать не может: блоки выходов этапов 1
// и 2 презентация рисует под контейнером этапа на слайде обзора, левее
// середины области шагов, — прежнее правило «левее середины = вход» давало у
// этих этапов ноль выходов при 2–3 ключевых выходах на карточке обзора.
//
// Прежнее геометрическое правило осталось ФОЛБЭКОМ для узлов без `direction`:
// документ, собранный до появления поля (или экспорт из стороннего
// инструмента, §4.7), обязан открываться и классифицироваться как раньше.
// Фолбэк считает середину по узлам потока и делит по ней только те data-узлы,
// у которых поля нет; узлы с `direction` в расчёт середины не входят и так и
// так не участвуют — середина берётся по не-data узлам.
//
// Модуль живёт в `src/`, а не в `scripts/`, потому что зависимость может идти
// только в эту сторону: `scripts/layout.ts` тянет `@dagrejs/dagre`, а SPEC §1
// требует держать dagre вне рантайм-бандла. Здесь — только классификация уже
// существующих узлов, без пересчёта координат.
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

  // Фолбэк для узлов без direction: середина области шагов. Без узлов потока
  // делить нечем — такие узлы уходят во входы, как и раньше.
  const xs = flow.map((node) => node.position.x);
  const midpoint = xs.length > 0 ? (Math.min(...xs) + Math.max(...xs)) / 2 : Number.POSITIVE_INFINITY;

  const inputs: ProcessNode[] = [];
  const outputs: ProcessNode[] = [];
  for (const node of data) {
    const direction = node.direction ?? (node.position.x < midpoint ? 'in' : 'out');
    (direction === 'in' ? inputs : outputs).push(node);
  }
  return { inputs, outputs };
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
