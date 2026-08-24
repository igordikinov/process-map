// Ребро этап → этап: фиолетовое, 1.8 px, smoothstep (SPEC §4.1).
import { BaseEdge, getSmoothStepPath, type Edge, type EdgeProps } from '@xyflow/react';
import { ARROW_PROCESS } from '../EdgeMarkers';
import styles from '../edges.module.css';

export type ProcessEdgeType = Edge<Record<string, unknown>, 'process'>;

export function ProcessEdge({
  sourceX,
  sourceY,
  sourcePosition,
  targetX,
  targetY,
  targetPosition,
}: EdgeProps<ProcessEdgeType>) {
  const [path] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 8,
  });

  return <BaseEdge path={path} className={styles.process} markerEnd={`url(#${ARROW_PROCESS})`} />;
}
