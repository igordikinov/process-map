// Ребро система → этап (и этап → система): синий пунктир 1.3 px, smoothstep
// (SPEC §4.1). В макете A1 линия серо-синяя (#8fa4c4), но SPEC требует синий —
// SPEC главнее (CLAUDE.md), поэтому используется --pm-integration.
import { BaseEdge, getSmoothStepPath, type Edge, type EdgeProps } from '@xyflow/react';
import { ARROW_INTEGRATION } from '../EdgeMarkers';
import styles from '../edges.module.css';

export type IntegrationEdgeType = Edge<Record<string, unknown>, 'integration'>;

export function IntegrationEdge({
  sourceX,
  sourceY,
  sourcePosition,
  targetX,
  targetY,
  targetPosition,
}: EdgeProps<IntegrationEdgeType>) {
  const [path] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 8,
  });

  return (
    <BaseEdge path={path} className={styles.integration} markerEnd={`url(#${ARROW_INTEGRATION})`} />
  );
}
