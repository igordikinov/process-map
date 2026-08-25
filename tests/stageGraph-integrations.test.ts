// Тесты фильтрации интеграций уровня 2 (SPEC §4.6, задача process-map-jl8).
// Отдельный файл, а не правка tests/stageGraph.test.ts — CLAUDE.md: чужие
// тесты не трогаем, свои кладём в новые файлы.
import { describe, expect, it } from 'vitest';
import { buildStageGraph } from '../src/components/StageDetail';
import { loadBaseProcessMap } from '../src/data/loader';
import type { Stage } from '../src/data/schema';

const map = loadBaseProcessMap();

/** Этап, где точно есть хотя бы один узел типа integration (данные это гарантируют). */
function stageWithIntegrationNode(): Stage {
  const stage = map.stages.find((candidate) =>
    candidate.nodes.some((node) => node.type === 'integration'),
  );
  if (stage === undefined) {
    throw new Error('В process.json нет этапа с узлом типа integration');
  }
  return stage;
}

describe('buildStageGraph: toggle показа интеграций (SPEC §4.6)', () => {
  it('по умолчанию (без второго аргумента) ведёт себя как showIntegrations=true', () => {
    const stage = stageWithIntegrationNode();
    const withDefault = buildStageGraph(stage);
    const withTrue = buildStageGraph(stage, true);

    expect(withDefault.nodes.map((node) => node.id)).toEqual(withTrue.nodes.map((node) => node.id));
    expect(withDefault.edges.map((edge) => edge.id)).toEqual(withTrue.edges.map((edge) => edge.id));
  });

  it('showIntegrations=false убирает узлы типа integration', () => {
    const stage = stageWithIntegrationNode();
    const integrationIds = new Set(
      stage.nodes.filter((node) => node.type === 'integration').map((node) => node.id),
    );
    expect(integrationIds.size).toBeGreaterThan(0);

    const { nodes } = buildStageGraph(stage, false);
    const ids = new Set(nodes.map((node) => node.id));

    for (const id of integrationIds) {
      expect(ids.has(id)).toBe(false);
    }
  });

  it('showIntegrations=false убирает рёбра kind=integration и рёбра, висящие на скрытом узле', () => {
    const stage = stageWithIntegrationNode();
    const integrationNodeIds = new Set(
      stage.nodes.filter((node) => node.type === 'integration').map((node) => node.id),
    );

    const { nodes, edges } = buildStageGraph(stage, false);
    const nodeIds = new Set(nodes.map((node) => node.id));

    for (const edge of stage.edges) {
      const dangles = integrationNodeIds.has(edge.source) || integrationNodeIds.has(edge.target);
      const shouldBeHidden = edge.kind === 'integration' || dangles;
      const isPresent = edges.some((flowEdge) => flowEdge.id === edge.id);
      if (shouldBeHidden) {
        expect(isPresent, `ребро ${edge.id} должно быть скрыто`).toBe(false);
      }
    }

    // Ни одно оставшееся ребро не ссылается на узел, которого нет на полотне.
    for (const edge of edges) {
      expect(nodeIds.has(edge.source)).toBe(true);
      expect(nodeIds.has(edge.target)).toBe(true);
    }
  });

  it('showIntegrations=false не меняет узлы, не относящиеся к интеграциям (шаги/данные/предупреждения остаются)', () => {
    const stage = stageWithIntegrationNode();
    const nonIntegrationIds = stage.nodes
      .filter((node) => node.type !== 'integration')
      .map((node) => node.id);

    const { nodes } = buildStageGraph(stage, false);
    const ids = new Set(nodes.map((node) => node.id));

    for (const id of nonIntegrationIds) {
      expect(ids.has(id)).toBe(true);
    }
  });

  it('showIntegrations=false не меняет геометрию контейнеров (раскладка не «прыгает»)', () => {
    const stage = stageWithIntegrationNode();
    const withTrue = buildStageGraph(stage, true);
    const withFalse = buildStageGraph(stage, false);

    // bounds и коробки групп/колонок считаются по полному набору узлов
    // независимо от toggle — см. комментарий buildStageGraph в stageGraph.ts.
    expect(withFalse.bounds).toEqual(withTrue.bounds);

    const containersOf = (graph: typeof withTrue) =>
      graph.nodes
        .filter((node) => node.type === 'groupBox')
        .map((node) => ({ id: node.id, position: node.position, style: node.style }));
    expect(containersOf(withFalse)).toEqual(containersOf(withTrue));
  });

  it('этап без узлов integration ведёт себя одинаково при true/false', () => {
    const stage = map.stages.find(
      (candidate) => !candidate.nodes.some((node) => node.type === 'integration'),
    );
    if (stage === undefined) {
      // Все этапы содержат интеграции — проверять нечего, но и падать незачем.
      return;
    }
    const withTrue = buildStageGraph(stage, true);
    const withFalse = buildStageGraph(stage, false);
    expect(withFalse.nodes.map((node) => node.id)).toEqual(withTrue.nodes.map((node) => node.id));
    expect(withFalse.edges.map((edge) => edge.id)).toEqual(withTrue.edges.map((edge) => edge.id));
  });
});
