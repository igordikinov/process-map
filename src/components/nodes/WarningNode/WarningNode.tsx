// Узел предупреждения, уровень 2 (SPEC §4.2: фон --pm-warning-bg, полоска
// --pm-warning-stroke).
//
// Отдельный тип узла React Flow, но вёрстка общая со StepCard: в макете A2
// предупреждение — та же карточка 318×52, отличается только фоном, цветом
// полоски и иконкой. Дублировать разметку ради разных цветов нельзя — они
// разъедутся при первой же правке размеров.
import type { Node, NodeProps } from '@xyflow/react';
import type { ProcessNode } from '../../../data/schema';
import { StepCard, StepHandles } from '../StepNode';

export interface WarningNodeData extends Record<string, unknown> {
  node: ProcessNode;
}

export type WarningNodeType = Node<WarningNodeData, 'warning'>;

export function WarningNode({ data }: NodeProps<WarningNodeType>) {
  return (
    <>
      <StepHandles />
      <StepCard node={data.node} variant="warning" />
    </>
  );
}
