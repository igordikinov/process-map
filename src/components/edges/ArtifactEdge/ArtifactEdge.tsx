// Рёбра уровня 1 трёхуровневой карты (process-map-9mn.16): связи moduleEdges.
//
// ЧЕМ ОТЛИЧАЮТСЯ ОТ ProcessEdge / IntegrationEdge. Линия та же — фиолетовая у
// связи модуль → модуль, синий пунктир у связи с внешней системой, — а подпись
// другая: у ребра модулей она НЕ служебная пометка («Да», «Нет»), а артефакт,
// который один модуль передаёт другому («Итоговый неограниченный прогноз»).
// Это содержание связи, и многоточие его съело бы, поэтому подпись здесь
// переносится по строкам (EdgeLabel wrap). Схема кладёт артефакт именно в
// Edge.label, а не в ExternalIO: артефакт системой не является (ProcessMapSchema).
//
// ПОЧЕМУ СВОИ ТИПЫ, А НЕ ФЛАГ В data У СТАРЫХ. Прецедент проекта (lane/flowLane,
// step/integration, process/processInner): React Flow кладёт тип в класс
// `.react-flow__edge-<type>`. Отдай экран модулей свои рёбра под типом
// 'process', и счётчик `.react-flow__edge-process` в e2e обзора этапов начал бы
// считать чужие рёбра — тест не покраснел бы, а позеленел не про то.
import { BaseEdge, getSmoothStepPath, type Edge, type EdgeProps } from '@xyflow/react';
import { EdgeLabel } from '../EdgeLabel';
import { EDGE_BORDER_RADIUS } from '../edgeGeometry';
import { useEdgeMarkers } from '../edgeMarkerContext';
import styles from '../edges.module.css';

/** Связь модуль → модуль: линия потока, подпись-артефакт переносится. */
export type ArtifactEdgeType = Edge<Record<string, unknown>, 'artifact'>;

/** Связь модуля с внешней системой: пунктир интеграции, подпись переносится. */
export type ArtifactIntegrationEdgeType = Edge<Record<string, unknown>, 'artifactIntegration'>;

type PathProps = Pick<
  EdgeProps<ArtifactEdgeType>,
  'sourceX' | 'sourceY' | 'sourcePosition' | 'targetX' | 'targetY' | 'targetPosition'
>;

/** Путь smoothstep и точка подписи — та же геометрия, что у рёбер уровня 2. */
function artifactPathOf({
  sourceX,
  sourceY,
  sourcePosition,
  targetX,
  targetY,
  targetPosition,
}: PathProps): { path: string; labelX: number; labelY: number } {
  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: EDGE_BORDER_RADIUS,
  });
  return { path, labelX, labelY };
}

export function ArtifactEdge(props: EdgeProps<ArtifactEdgeType>) {
  const markers = useEdgeMarkers();
  const { path, labelX, labelY } = artifactPathOf(props);

  return (
    <>
      <BaseEdge path={path} className={styles.process} markerEnd={`url(#${markers.process})`} />
      <EdgeLabel label={props.label} x={labelX} y={labelY} wrap />
    </>
  );
}

export function ArtifactIntegrationEdge(props: EdgeProps<ArtifactIntegrationEdgeType>) {
  const markers = useEdgeMarkers();
  const { path, labelX, labelY } = artifactPathOf(props);

  return (
    <>
      <BaseEdge
        path={path}
        className={styles.integration}
        markerEnd={`url(#${markers.integration})`}
      />
      <EdgeLabel label={props.label} x={labelX} y={labelY} wrap />
    </>
  );
}
