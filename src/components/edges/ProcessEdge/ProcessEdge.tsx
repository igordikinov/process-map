// Рёбра потока: фиолетовое 1.8 px и серое 1.4 px, оба smoothstep.
//
// ДВА ТИПА НА ОДНУ ГЕОМЕТРИЮ (process-map-fxg). На уровне 1 фиолетовым идёт
// весь поток этап → этап (SPEC §4.1). На уровне 2 артборд A2 красит фиолетовым
// ТОЛЬКО переход между группами шагов, а поток внутри группы — серым: так
// структура процесса читается цветом, а не только рамками. Тип выбирается в
// stageGraph.ts сравнением node.group у концов ребра.
//
// Тип, а не проп в data, — по тому же соображению, что у `lane` / `flowLane` и
// `step` / `integration`: React Flow кладёт тип в класс `.react-flow__edge-<type>`,
// и общий тип слил бы два вида рёбер в один счётчик в тестах.
import { BaseEdge, getSmoothStepPath, type Edge, type EdgeProps } from '@xyflow/react';
import { EDGE_BORDER_RADIUS } from '../edgeGeometry';
import { useEdgeMarkers } from '../edgeMarkerContext';
import styles from '../edges.module.css';

export type ProcessEdgeType = Edge<Record<string, unknown>, 'process'>;

/** Ребро внутри группы шагов, уровень 2 (SPEC §4.2, артборд A2). */
export type ProcessInnerEdgeType = Edge<Record<string, unknown>, 'processInner'>;

function smoothStepPathOf({
  sourceX,
  sourceY,
  sourcePosition,
  targetX,
  targetY,
  targetPosition,
}: Pick<
  EdgeProps<ProcessEdgeType>,
  'sourceX' | 'sourceY' | 'sourcePosition' | 'targetX' | 'targetY' | 'targetPosition'
>): string {
  const [path] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: EDGE_BORDER_RADIUS,
  });
  return path;
}

export function ProcessEdge(props: EdgeProps<ProcessEdgeType>) {
  const markers = useEdgeMarkers();

  return (
    <BaseEdge
      path={smoothStepPathOf(props)}
      className={styles.process}
      markerEnd={`url(#${markers.process})`}
    />
  );
}

export function ProcessInnerEdge(props: EdgeProps<ProcessInnerEdgeType>) {
  const markers = useEdgeMarkers();

  return (
    <BaseEdge
      path={smoothStepPathOf(props)}
      className={styles.processInner}
      markerEnd={`url(#${markers.processInner})`}
    />
  );
}
