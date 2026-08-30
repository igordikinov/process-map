// Свимлейн уровня 1 — узел React Flow типа group (SPEC §4.1).
// Родитель для IntegrationNode; сам не перетаскивается и не выбирается.
import type { Node, NodeProps } from '@xyflow/react';
import styles from './LaneNode.module.css';

export interface LaneNodeData extends Record<string, unknown> {
  title: string;
}

export type LaneNodeType = Node<LaneNodeData, 'lane'>;

/**
 * Рамка вокруг основного потока этапов (process-map-sni). Оформление то же, что
 * у свимлейнов, поэтому компонент общий, а тип узла отдельный: React Flow кладёт
 * тип в класс `.react-flow__node-<type>`, и общий тип слил бы в один счётчик
 * свимлейны и рамку потока — а они появляются по разным условиям (свимлейны
 * пропадают вместе с интеграциями, рамка потока остаётся).
 */
export type FlowLaneNodeType = Node<LaneNodeData, 'flowLane'>;

export function LaneNode({ data }: NodeProps<LaneNodeType | FlowLaneNodeType>) {
  return (
    <div className={styles.lane}>
      <div className={styles.title}>{data.title}</div>
    </div>
  );
}
