// Граф экрана модуля — уровень 2 трёхуровневой карты (задача process-map-9mn.17)
// и баг process-map-wuv (сторона хэндла по номеру этапа при раскладке по
// индексу).
//
// Чистая функция buildOverviewGraph на трёхуровневой фикстуре, через
// levelTwoView — ровно так, как её зовёт экран. Экран целиком (крошки,
// переключатель версий, переходы) — tests/levelTwo.test.tsx.
//
// ПОЧЕМУ МОДУЛЬ SNP (MODULE_SUPPLY). Это средний модуль фикстуры: три этапа
// (на двух обратный порядок неотличим от поворота), у него есть и вход, и
// выход во внешние системы, а его системы (ERP на входе, PS на выходе) НЕ
// совпадают с системой соседа слева — DP у модуля спроса. На экране SNP
// системы, собранные со всех этапов карты, выдали бы себя кодом DP.
import { describe, expect, it } from 'vitest';
import {
  buildOverviewGraph,
  FLOW_LANE_ID,
  LANE_IN_ID,
  LANE_OUT_ID,
  SYSTEMS_BADGE_ID,
  systemNodeId,
} from '../src/components/Overview/overviewGraph';
import { STAGE_HANDLE } from '../src/components/nodes/StageNode';
import { levelTwoView } from '../src/data/modules';
import type { ProcessMap, SystemCode } from '../src/data/schema';
import {
  MODULE_DEMAND,
  MODULE_STAGE_IDS,
  MODULE_SUPPLY,
  buildThreeLevelProcessMap,
  type ThreeLevelProcessMap,
} from './fixtures/three-level-process';

const map = buildThreeLevelProcessMap();

function supplyModule(source: ThreeLevelProcessMap = map) {
  const module = source.modules.find((candidate) => candidate.id === MODULE_SUPPLY);
  if (module === undefined) {
    throw new Error('В трёхуровневой фикстуре нет модуля SNP');
  }
  return module;
}

/** Коды систем в узлах свимлейна, в порядке узлов. */
function laneSystems(nodes: ReturnType<typeof buildOverviewGraph>['nodes'], laneId: string) {
  return nodes
    .filter((node) => node.type === 'system' && node.parentId === laneId)
    .map((node) => (node.data as { system: SystemCode }).system);
}

describe('levelTwoView', () => {
  it('модуль: его этапы в порядке stageIds, рёбра, подпись рамки module.label, сам модуль', () => {
    const view = levelTwoView(map, MODULE_SUPPLY);

    expect(view.stages.map((stage) => stage.id)).toEqual(MODULE_STAGE_IDS[MODULE_SUPPLY]);
    expect(view.frameLabel).toBe('Модуль SNP');
    expect(view.frameLabel).not.toBe(map.moduleLabel);
    expect(view.module?.id).toBe(MODULE_SUPPLY);
    const own = new Set(MODULE_STAGE_IDS[MODULE_SUPPLY]);
    expect(view.overviewEdges.length).toBeGreaterThan(0);
    for (const edge of view.overviewEdges) {
      expect(own.has(edge.source) || own.has(edge.target), edge.id).toBe(true);
    }
  });

  it('двухуровневая карта и null — вид совпадает с картой: те же массивы, подпись карты', () => {
    const view = levelTwoView(map, null);
    expect(view.stages).toBe(map.stages);
    expect(view.overviewEdges).toBe(map.overviewEdges);
    expect(view.frameLabel).toBe(map.moduleLabel);
    expect(view.module).toBeUndefined();

    const twoLevel: ProcessMap = { ...buildThreeLevelProcessMap() };
    delete twoLevel.modules;
    const ignored = levelTwoView(twoLevel, MODULE_SUPPLY);
    expect(ignored.stages).toBe(twoLevel.stages);
    expect(ignored.frameLabel).toBe(twoLevel.moduleLabel);
    expect(ignored.module).toBeUndefined();
  });
});

describe('buildOverviewGraph на экране модуля', () => {
  it('карточки — только этапы модуля, слева направо в порядке stageIds', () => {
    const { nodes } = buildOverviewGraph(levelTwoView(map, MODULE_SUPPLY), true);
    const stages = nodes.filter((node) => node.type === 'stage');

    expect(stages.map((node) => node.id)).toEqual(MODULE_STAGE_IDS[MODULE_SUPPLY]);
    const xs = stages.map((node) => node.position.x);
    expect(
      [...xs].sort((a, b) => a - b),
      'карточки идут слева направо',
    ).toEqual(xs);
    expect(new Set(stages.map((node) => node.position.y)).size).toBe(1);
  });

  it('рамка потока подписана module.label, а не подписью документа', () => {
    const { nodes } = buildOverviewGraph(levelTwoView(map, MODULE_SUPPLY), true);
    const frame = nodes.find((node) => node.id === FLOW_LANE_ID);

    expect(frame?.data).toEqual({ title: supplyModule().label });
    expect(supplyModule().label).not.toBe(map.moduleLabel);
  });

  /*
   * СИСТЕМЫ — ТОЛЬКО ПОКАЗАННЫХ ЭТАПОВ. Ожидание — литералом, а не выводом из
   * фикстуры: вывод повторил бы тот самый сбор, который проверяется. На всех
   * этапах карты вход был бы DP, ERP, PS, а выход — DP, PS, ERP.
   */
  it('свимлейны несут системы только этапов модуля: DP соседнего модуля не появляется', () => {
    const { nodes } = buildOverviewGraph(levelTwoView(map, MODULE_SUPPLY), true);

    expect(laneSystems(nodes, LANE_IN_ID)).toEqual(['ERP']);
    expect(laneSystems(nodes, LANE_OUT_ID)).toEqual(['PS']);
    expect(nodes.some((node) => node.id === systemNodeId('in', 'DP'))).toBe(false);
    expect(nodes.some((node) => node.id === systemNodeId('out', 'DP'))).toBe(false);
  });

  it('модуль спроса зеркально: только DP, без систем модуля SNP', () => {
    const { nodes } = buildOverviewGraph(levelTwoView(map, MODULE_DEMAND), true);

    expect(laneSystems(nodes, LANE_IN_ID)).toEqual(['DP']);
    expect(laneSystems(nodes, LANE_OUT_ID)).toEqual(['DP']);
  });

  it('компактная строка-бейдж тоже собирается из этапов модуля', () => {
    const { nodes } = buildOverviewGraph(levelTwoView(map, MODULE_SUPPLY), true, true);
    const badge = nodes.find((node) => node.id === SYSTEMS_BADGE_ID);

    expect((badge?.data as { systems: SystemCode[] } | undefined)?.systems).toEqual(['ERP', 'PS']);
  });

  it('рёбра: процессные внутри модуля и интеграции его этапов, у каждого конец на полотне', () => {
    const { nodes, edges } = buildOverviewGraph(levelTwoView(map, MODULE_SUPPLY), true);
    const ids = new Set(nodes.map((node) => node.id));

    expect(edges.map((edge) => edge.id).sort()).toEqual([
      'overview-edge-2',
      'overview-edge-3',
      'overview-edge-6',
      'overview-edge-7',
    ]);
    for (const edge of edges) {
      expect(ids.has(edge.source), `${edge.id}: source`).toBe(true);
      expect(ids.has(edge.target), `${edge.id}: target`).toBe(true);
    }
  });
});

/*
 * БАГ process-map-wuv: карточки стоят по ИНДЕКСУ, а обратная связь решалась по
 * stage.number. Модуль с stageIds {5, 4, 3} валиден (moduleBlockProblems
 * требует сплошности множества номеров, а не порядка) — на нём два способа
 * расходятся в обе стороны.
 */
describe('обратная связь решается по индексу на экране, а не по номеру (wuv)', () => {
  /** Модуль SNP с обратным порядком stageIds; рёбра — по выбору теста. */
  function reversedSupply(reverseEdges: boolean): ThreeLevelProcessMap {
    const reversed = buildThreeLevelProcessMap();
    supplyModule(reversed).stageIds.reverse();
    if (reverseEdges) {
      // Поток модуля тоже развёрнут: 5 → 4 → 3, как стоят карточки.
      for (const edge of reversed.overviewEdges) {
        if (edge.id === 'overview-edge-2' || edge.id === 'overview-edge-3') {
          [edge.source, edge.target] = [edge.target, edge.source];
        }
      }
    }
    return reversed;
  }

  it('предпосылка: карточки встают в обратном порядке номеров', () => {
    const { nodes } = buildOverviewGraph(levelTwoView(reversedSupply(false), MODULE_SUPPLY), true);
    const stages = nodes.filter((node) => node.type === 'stage');

    expect(stages.map((node) => node.id)).toEqual(['stage-5', 'stage-4', 'stage-3']);
    expect(stages[0]?.position.x).toBeLessThan(stages[2]?.position.x ?? 0);
  });

  it('прямое на экране ребро (5 → 4, 4 → 3) выходит справа, хотя по номерам «назад»', () => {
    const { edges } = buildOverviewGraph(levelTwoView(reversedSupply(true), MODULE_SUPPLY), true);

    for (const id of ['overview-edge-2', 'overview-edge-3']) {
      const edge = edges.find((candidate) => candidate.id === id);
      expect(edge?.sourceHandle, `${id}: прямое ребро обязано выходить справа`).toBe(
        STAGE_HANDLE.right,
      );
      expect(edge?.targetHandle).toBe(STAGE_HANDLE.left);
    }
  });

  it('обратное на экране ребро (3 → 4, 4 → 5) выходит снизу, хотя по номерам «вперёд»', () => {
    const { edges } = buildOverviewGraph(levelTwoView(reversedSupply(false), MODULE_SUPPLY), true);

    for (const id of ['overview-edge-2', 'overview-edge-3']) {
      const edge = edges.find((candidate) => candidate.id === id);
      expect(edge?.sourceHandle, `${id}: цель левее источника — ребро уходит вниз`).toBe(
        STAGE_HANDLE.bottom,
      );
    }
  });
});
