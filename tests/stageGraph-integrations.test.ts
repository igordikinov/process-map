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

// Группа, все узлы которой — интеграции (process-map-7v1: «Публикация планов»
// этапа 3), при выключенном toggle не должна оставлять на полотне пустую рамку
// с заголовком. Габарит остальных групп при этом считается по полному набору
// узлов, чтобы раскладка не прыгала, — это проверяется вторым тестом.
describe('buildStageGraph: группа целиком из интеграций (process-map-7v1)', () => {
  const stage = loadBaseProcessMap().stages.find((candidate) => candidate.number === 3);

  it('на этапе 3 есть группа, состоящая только из интеграций', () => {
    expect(stage, 'этап 3').toBeDefined();
    const publication = stage!.nodes.filter((node) => node.group === 'publikaciya-planov');
    expect(publication.length).toBeGreaterThan(0);
    expect(
      publication.every((node) => node.type === 'integration'),
      'группа перестала быть целиком интеграционной — тест ниже потерял предмет',
    ).toBe(true);
  });

  it('контейнер группы пропадает вместе с её узлами', () => {
    const on = buildStageGraph(stage!, true).nodes;
    const off = buildStageGraph(stage!, false).nodes;
    const container = (nodes: typeof on) =>
      nodes.filter((node) => node.id === 'group:publikaciya-planov');

    expect(container(on), 'при включённых интеграциях контейнер нужен').toHaveLength(1);
    expect(
      container(off),
      'пустая dashed-рамка с заголовком осталась на полотне без единого узла',
    ).toHaveLength(0);
  });

  it('частично скрытая группа контейнер сохраняет и размер не меняет', () => {
    // Этап 2: в группе есть и интеграции, и обычные шаги.
    const stage2 = loadBaseProcessMap().stages.find((candidate) => candidate.number === 2);
    const groupsWithMix = (stage2?.groups ?? []).filter((group) => {
      const members = stage2!.nodes.filter((node) => node.group === group.id);
      return (
        members.some((node) => node.type === 'integration') &&
        members.some((node) => node.type !== 'integration')
      );
    });
    if (groupsWithMix.length === 0) {
      return;
    }
    const id = `group:${groupsWithMix[0]!.id}`;
    const on = buildStageGraph(stage2!, true).nodes.find((node) => node.id === id);
    const off = buildStageGraph(stage2!, false).nodes.find((node) => node.id === id);

    expect(on).toBeDefined();
    expect(off, 'частично скрытая группа потеряла контейнер').toBeDefined();
    expect(off?.position, 'габарит группы поехал при переключении toggle').toEqual(on?.position);
  });
});
