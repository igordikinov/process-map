import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Node, Edge } from '@xyflow/react';
import { ProcessMapSchema } from '../src/data/schema';
import { levelTwoView, hasModules } from '../src/data/modules';
import { buildStageGraph } from '../src/components/StageDetail/stageGraph';
import { buildOverviewGraph } from '../src/components/Overview/overviewGraph';
import { buildModulesGraph } from '../src/components/ModulesOverview/modulesGraph';
import { layoutStage } from '../src/layout/stageLayout';

const root = resolve('src/data');
const maps = readdirSync(root)
  .filter((id) => existsSync(resolve(root, id, 'process.json')))
  .map((id) =>
    ProcessMapSchema.parse(JSON.parse(readFileSync(resolve(root, id, 'process.json'), 'utf8'))),
  );

function verifyGraph(nodes: Node[], edges: Edge[]) {
  const ids = new Set(nodes.map((n) => n.id));
  expect(ids.size).toBe(nodes.length);
  for (const edge of edges) {
    expect(ids.has(edge.source), edge.id + ' source').toBe(true);
    expect(ids.has(edge.target), edge.id + ' target').toBe(true);
  }
  const rects = nodes.map((n) => {
    const parent = nodes.find((p) => p.id === n.parentId);
    return {
      id: n.id,
      parentId: n.parentId,
      type: n.type,
      x: n.position.x + (parent?.position.x ?? 0),
      y: n.position.y + (parent?.position.y ?? 0),
      w: n.width ?? Number(n.style?.width),
      h: n.height ?? Number(n.style?.height),
    };
  });
  for (const rect of rects) {
    // У бейджа ширина определяется текстом в браузере; в раскладке её нет.
    if (rect.type === 'systemsBadge') {
      expect([rect.x, rect.y].every(Number.isFinite)).toBe(true);
      continue;
    }
    expect([rect.x, rect.y, rect.w, rect.h].every(Number.isFinite), rect.id).toBe(true);
    if (rect.parentId) {
      const parent = rects.find((r) => r.id === rect.parentId)!;
      expect(parent, rect.id).toBeDefined();
      expect(nodes.findIndex((n) => n.id === parent.id)).toBeLessThan(
        nodes.findIndex((n) => n.id === rect.id),
      );
      expect(rect.x).toBeGreaterThanOrEqual(parent.x);
      expect(rect.y).toBeGreaterThanOrEqual(parent.y);
      expect(rect.x + rect.w).toBeLessThanOrEqual(parent.x + parent.w + 0.01);
      expect(rect.y + rect.h).toBeLessThanOrEqual(parent.y + parent.h + 0.01);
    }
  }
  return rects;
}

function noOverlap(rects: ReturnType<typeof verifyGraph>) {
  rects.forEach((a, i) =>
    rects.slice(i + 1).forEach((b) => {
      if (a.parentId === b.id || b.parentId === a.id) return;
      const overlap =
        Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 0.1 &&
        Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 0.1;
      expect(overlap, `${a.id} пересекается с ${b.id}`).toBe(false);
    }),
  );
}

it('UI-контракты обнаружили карты', () => expect(maps.length).toBeGreaterThan(0));
describe.each(maps)('UI-контракт $id', (map) => {
  it.each(map.stages)('этап $number: типы, концы рёбер, контейнеры и геометрия', (stage) => {
    const graph = buildStageGraph(stage);
    const rects = verifyGraph(graph.nodes, graph.edges);
    for (const node of stage.nodes)
      expect(graph.nodes.find((n) => n.id === node.id)?.type).toBe(node.type);
    for (const edge of stage.edges) {
      const detail = stage.nodes.find((n) => n.id === edge.target && n.type === 'detail');
      const host = stage.nodes.find((n) => n.id === edge.source);
      if (detail && host) {
        expect(detail.position.x).toBe(host.position.x);
        expect(detail.position.y).toBeGreaterThan(host.position.y + 52);
      }
    }
    noOverlap(rects);
    const layout = layoutStage(stage);
    for (const n of stage.nodes) expect(n.position, n.id).toEqual(layout.get(n.id));
    const hidden = buildStageGraph(stage, false);
    verifyGraph(hidden.nodes, hidden.edges);
    for (const edge of stage.edges) {
      if (
        stage.nodes.find((n) => n.id === edge.source)?.type === 'integration' &&
        stage.nodes.find((n) => n.id === edge.target)?.type === 'detail'
      ) {
        expect(hidden.nodes.some((n) => n.id === edge.target)).toBe(false);
      }
    }
  });
  it.each([false, true])('обзоры и модули, compact=%s', (compact) => {
    const views = map.modules?.map((m) => levelTwoView(map, m.id)) ?? [levelTwoView(map, null)];
    for (const view of views) {
      const graph = buildOverviewGraph(view, true, compact);
      noOverlap(verifyGraph(graph.nodes, graph.edges).filter((n) => n.type === 'stage'));
    }
    if (hasModules(map)) {
      const graph = buildModulesGraph(map, true, compact);
      noOverlap(verifyGraph(graph.nodes, graph.edges).filter((n) => n.type === 'module'));
    }
  });
});

it('подробность скрывается вместе с интеграцией', () => {
  const stage = structuredClone(maps.find((m) => m.id === 'inplan')!.stages[0]!);
  const host = stage.nodes.find((n) => n.type === 'step')!;
  const detail = stage.nodes.find((n) => n.type === 'detail')!;
  host.type = 'integration';
  const visible = buildStageGraph(stage, true);
  expect(visible.nodes.map((n) => n.id)).toContain(detail.id);
  const hidden = buildStageGraph(stage, false);
  expect(hidden.nodes.map((n) => n.id)).not.toContain(host.id);
  expect(hidden.nodes.map((n) => n.id)).not.toContain(detail.id);
  verifyGraph(hidden.nodes, hidden.edges);
});
