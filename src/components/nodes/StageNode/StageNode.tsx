// Узел React Flow для карточки этапа (SPEC §4.1).
// Вся вёрстка — в StageCard; здесь только точки подключения рёбер.
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import type { Stage } from '../../../data/schema';
import { StageCard } from './StageCard';

export interface StageNodeData extends Record<string, unknown> {
  stage: Stage;
}

export type StageNodeType = Node<StageNodeData, 'stage'>;

/** Идентификаторы хэндлов — используются в overviewGraph.ts при сборке рёбер. */
export const STAGE_HANDLE = {
  /** Вход процессного ребра (слева). */
  left: 'left',
  /** Выход процессного ребра (справа). */
  right: 'right',
  /** Вход интеграционного ребра из свимлейна «вход» (сверху). */
  top: 'top',
  /** Выход интеграционного ребра в свимлейн «выход» (снизу). */
  bottom: 'bottom',
} as const;

export function StageNode({ data }: NodeProps<StageNodeType>) {
  return (
    <>
      <Handle type="target" position={Position.Left} id={STAGE_HANDLE.left} isConnectable={false} />
      <Handle type="target" position={Position.Top} id={STAGE_HANDLE.top} isConnectable={false} />
      <StageCard stage={data.stage} />
      <Handle
        type="source"
        position={Position.Right}
        id={STAGE_HANDLE.right}
        isConnectable={false}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id={STAGE_HANDLE.bottom}
        isConnectable={false}
      />
    </>
  );
}
