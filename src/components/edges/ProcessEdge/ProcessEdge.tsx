// Ребро этап → этап: фиолетовое, 1.8 px, smoothstep (SPEC §4.1).
import { BaseEdge, getSmoothStepPath, type Edge, type EdgeProps } from '@xyflow/react';
import { EDGE_BORDER_RADIUS } from '../edgeGeometry';
import { useEdgeMarkers } from '../edgeMarkerContext';
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
  const markers = useEdgeMarkers();
  const [path] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: EDGE_BORDER_RADIUS,
  });

  return <BaseEdge path={path} className={styles.process} markerEnd={`url(#${markers.process})`} />;
}
