import { ru } from '../i18n/ru';
import { splitStageDataNodes } from '../utils/stageNodes';
import {
  ProcessMapSchema,
  validateIntegrity,
  type Edge,
  type Group,
  type ProcessMap,
  type ProcessNode,
  type Stage,
} from '../data/schema';
import { groupBox, preserveEmptyGroups, snap } from './geometry';

export type EditorSelection = { kind: 'node' | 'edge' | 'group'; id: string } | null;
export type EditorCommand =
  | { type: 'addNode'; node: ProcessNode; parentId?: string }
  | {
      type: 'updateNode';
      id: string;
      patch: Partial<Omit<ProcessNode, 'id' | 'type' | 'position'>>;
      parentId?: string;
    }
  | { type: 'moveNode'; id: string; position: { x: number; y: number } }
  | { type: 'deleteNode'; id: string }
  | { type: 'upsertEdge'; edge: Edge }
  | { type: 'deleteEdge'; id: string }
  | { type: 'upsertGroup'; group: Group }
  | { type: 'moveGroup'; id: string; dx: number; dy: number }
  | { type: 'deleteGroup'; id: string };

export function editorId(kind: 'node' | 'edge' | 'group'): string {
  return `${kind}-${crypto.randomUUID()}`;
}

export function assertEditorMap(raw: unknown): ProcessMap {
  const map = ProcessMapSchema.parse(raw);
  const problems = validateIntegrity(map);
  for (const stage of map.stages) {
    const containerIds = new Set([
      'column:in',
      'column:out',
      ...stage.groups.map((group) => `group:${group.id}`),
    ]);
    const groups = new Set<string>();
    for (const group of stage.groups) {
      if (groups.has(group.id)) problems.push(ru.editor.duplicateGroup(group.id));
      groups.add(group.id);
    }
    const pairs = new Set<string>();
    for (const edge of stage.edges) {
      if (edge.source === edge.target) problems.push(ru.editor.selfEdge);
      const key = JSON.stringify([edge.source, edge.target, edge.kind]);
      if (pairs.has(key)) problems.push(ru.editor.duplicateEdge);
      pairs.add(key);
    }
    for (const node of stage.nodes) {
      if (containerIds.has(node.id)) problems.push(ru.editor.reservedId(node.id));
      if (!Number.isFinite(node.position.x) || !Number.isFinite(node.position.y)) {
        problems.push(ru.editor.invalidPosition);
      }
    }
  }
  if (problems.length) throw new Error(problems.join('\n'));
  return map;
}

export function deletionImpact(stage: Stage, id: string) {
  const ids = new Set([id]);
  for (const edge of stage.edges) {
    if (
      edge.source === id &&
      stage.nodes.some((node) => node.id === edge.target && node.type === 'detail')
    )
      ids.add(edge.target);
  }
  return {
    ids,
    nodes: ids.size,
    edges: stage.edges.filter((edge) => ids.has(edge.source) || ids.has(edge.target)).length,
  };
}

function changeStage(stage: Stage, command: EditorCommand): Stage {
  // Зафиксировать прежний смысл данных до геометрического изменения legacy-карты.
  if (command.type === 'moveNode' || command.type === 'moveGroup') {
    const outputs = new Set(splitStageDataNodes(stage).outputs.map((node) => node.id));
    stage = {
      ...stage,
      nodes: stage.nodes.map((node) =>
        node.type === 'data' && !node.direction
          ? { ...node, direction: outputs.has(node.id) ? 'out' : 'in' }
          : node,
      ),
    };
  }
  let next = stage;
  switch (command.type) {
    case 'addNode': {
      if (!command.node.label.trim()) throw new Error(ru.editor.invalidName);
      next = { ...stage, nodes: [...stage.nodes, command.node] };
      if (command.node.type === 'detail') {
        if (!command.parentId) throw new Error(ru.editor.chooseParent);
        next.edges = [
          ...stage.edges,
          { id: editorId('edge'), source: command.parentId, target: command.node.id, kind: 'data' },
        ];
      }
      break;
    }
    case 'updateNode': {
      const node = stage.nodes.find((item) => item.id === command.id);
      if (!node) throw new Error(ru.editor.missingNode);
      if (command.patch.label !== undefined && !command.patch.label.trim())
        throw new Error(ru.editor.invalidName);
      next = {
        ...stage,
        nodes: stage.nodes.map((item) =>
          item.id === command.id ? { ...item, ...command.patch } : item,
        ),
      };
      if (node.type === 'detail' && command.parentId !== undefined) {
        if (!command.parentId) throw new Error(ru.editor.chooseParent);
        const parentId = command.parentId;
        next.edges = stage.edges.map((edge) =>
          edge.target === node.id ? { ...edge, source: parentId, kind: 'data' } : edge,
        );
      }
      break;
    }
    case 'moveNode':
      next = {
        ...stage,
        nodes: stage.nodes.map((node) =>
          node.id === command.id
            ? { ...node, position: { x: snap(command.position.x), y: snap(command.position.y) } }
            : node,
        ),
      };
      break;
    case 'deleteNode': {
      const { ids } = deletionImpact(stage, command.id);
      next = {
        ...stage,
        nodes: stage.nodes.filter((node) => !ids.has(node.id)),
        edges: stage.edges.filter((edge) => !ids.has(edge.source) && !ids.has(edge.target)),
      };
      break;
    }
    case 'upsertEdge':
      next = {
        ...stage,
        edges: stage.edges.some((edge) => edge.id === command.edge.id)
          ? stage.edges.map((edge) => (edge.id === command.edge.id ? command.edge : edge))
          : [...stage.edges, command.edge],
      };
      break;
    case 'deleteEdge':
      next = { ...stage, edges: stage.edges.filter((edge) => edge.id !== command.id) };
      break;
    case 'upsertGroup':
      if (!command.group.label.trim()) throw new Error(ru.editor.invalidGroup);
      next = {
        ...stage,
        groups: stage.groups.some((group) => group.id === command.group.id)
          ? stage.groups.map((group) => (group.id === command.group.id ? command.group : group))
          : [...stage.groups, command.group],
      };
      break;
    case 'moveGroup': {
      const group = stage.groups.find((item) => item.id === command.id);
      if (!group) throw new Error(ru.editor.missingGroup);
      const origin = groupBox(stage, group);
      const dx = snap(origin.x + command.dx) - origin.x;
      const dy = snap(origin.y + command.dy) - origin.y;
      next = {
        ...stage,
        groups: stage.groups.map((item) =>
          item.id === group.id
            ? { ...item, position: { x: origin.x + dx, y: origin.y + dy } }
            : item,
        ),
        nodes: stage.nodes.map((node) =>
          node.group === group.id
            ? { ...node, position: { x: node.position.x + dx, y: node.position.y + dy } }
            : node,
        ),
      };
      break;
    }
    case 'deleteGroup':
      next = {
        ...stage,
        groups: stage.groups.filter((group) => group.id !== command.id),
        nodes: stage.nodes.map((node) =>
          node.group === command.id ? { ...node, group: undefined } : node,
        ),
      };
      break;
  }
  return preserveEmptyGroups(stage, next);
}

export function applyEditorCommand(
  map: ProcessMap,
  stageId: string,
  command: EditorCommand,
): ProcessMap {
  if (!map.stages.some((stage) => stage.id === stageId)) throw new Error(ru.editor.missingStage);
  const next = {
    ...map,
    stages: map.stages.map((stage) => (stage.id === stageId ? changeStage(stage, command) : stage)),
  };
  assertEditorMap(next);
  return next;
}
