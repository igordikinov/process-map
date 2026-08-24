// Свимлейн уровня 1 — узел React Flow типа group (SPEC §4.1).
// Родитель для IntegrationNode; сам не перетаскивается и не выбирается.
import type { Node, NodeProps } from '@xyflow/react';
import styles from './LaneNode.module.css';

export interface LaneNodeData extends Record<string, unknown> {
  title: string;
}

export type LaneNodeType = Node<LaneNodeData, 'lane'>;

export function LaneNode({ data }: NodeProps<LaneNodeType>) {
  return (
    <div className={styles.lane}>
      <div className={styles.title}>{data.title}</div>
    </div>
  );
}
