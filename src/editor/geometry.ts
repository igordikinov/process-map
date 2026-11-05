import type { Edge, Group, ProcessNode, Stage } from '../data/schema';
import { NODE_SIZE } from '../layout/stageLayout';

export const EMPTY_GROUP_SIZE = { width: 400, height: 240 };
export const snap = (n: number): number => Math.round(n / 16) * 16;

/** Найти место в видимой области, не сдвигая существующие карточки. */
export function insertionPoint(
  stage: Stage,
  point: { x: number; y: number },
  visible: { left: number; top: number; right: number; bottom: number },
) {
  const size = NODE_SIZE.step;
  const free = (x: number, y: number) =>
    stage.nodes.every((node) => {
      const other = NODE_SIZE[node.type];
      return (
        x + size.width + 16 <= node.position.x ||
        node.position.x + other.width + 16 <= x ||
        y + size.height + 16 <= node.position.y ||
        node.position.y + other.height + 16 <= y
      );
    });
  for (let radius = 0; radius < 40; radius++) {
    for (let dy = -radius; dy <= radius; dy++)
      for (let dx = -radius; dx <= radius; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
        const x = snap(point.x) + dx * 16,
          y = snap(point.y) + dy * 16;
        if (
          x < visible.left ||
          y < visible.top ||
          x + size.width > visible.right ||
          y + size.height > visible.bottom
        )
          continue;
        if (free(x, y)) return { x, y };
      }
  }
  return { x: snap(point.x), y: snap(point.y) };
}

export function groupBox(stage: Stage, group: Group) {
  const members = stage.nodes.filter((node) => node.group === group.id);
  if (members.length === 0) {
    return { ...(group.position ?? { x: 0, y: 0 }), ...EMPTY_GROUP_SIZE };
  }
  const x = Math.min(...members.map((node) => node.position.x)) - 16;
  const y = Math.min(...members.map((node) => node.position.y)) - 40;
  return {
    x,
    y,
    width:
      Math.max(...members.map((node) => node.position.x + NODE_SIZE[node.type].width)) - x + 16,
    height:
      Math.max(...members.map((node) => node.position.y + NODE_SIZE[node.type].height)) - y + 20,
  };
}

/** Не терять положение рамки после удаления/переноса последнего участника. */
export function preserveEmptyGroups(before: Stage, after: Stage): Stage {
  return {
    ...after,
    groups: after.groups.map((group) => {
      if (after.nodes.some((node) => node.group === group.id)) return group;
      const previous = before.groups.find((item) => item.id === group.id);
      if (!previous || !before.nodes.some((node) => node.group === group.id)) return group;
      const { x, y } = groupBox(before, previous);
      return { ...group, position: { x, y } };
    }),
  };
}

export function defaultEdgeKind(source: ProcessNode, target: ProcessNode): Edge['kind'] {
  if (source.type === 'data' || target.type === 'data' || target.type === 'detail') return 'data';
  if (source.type === 'integration' || target.type === 'integration') return 'integration';
  return 'process';
}
