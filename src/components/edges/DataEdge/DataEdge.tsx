// Ребро «шаг ↔ артефакт данных» (process-map-70e.6).
//
// ЗАЧЕМ ОНО ПОЯВИЛОСЬ. Значение `kind: 'data'` объявлено в схеме и описано в
// SPEC с самого начала, но не отрисовывалось ничем: stageGraph отправлял всё,
// что не `integration`, в поток. Ветка была мёртвой, потому что в картах из
// презентаций рёбер к узлам данных нет вовсе — колонки входов и выходов стоят
// без стрелок. В BPMN такая связь есть (`dataAssociation`), и её надо чем-то
// рисовать.
//
// ТОЧЕЧНЫЙ ПУНКТИР, А НЕ ШТРИХОВОЙ. Штриховой уже занят интеграцией, и два
// пунктира одного рисунка читатель не различит. Точки — то, чем нотация BPMN
// рисует ассоциацию с артефактом, так что выбор не произвольный.
import { BaseEdge, getSmoothStepPath, type Edge, type EdgeProps } from '@xyflow/react';
import { EdgeLabel } from '../EdgeLabel';
import { EDGE_BORDER_RADIUS } from '../edgeGeometry';
import { useEdgeMarkers } from '../edgeMarkerContext';
import styles from '../edges.module.css';

export type DataEdgeType = Edge<Record<string, unknown>, 'data'>;

export function DataEdge({
  sourceX,
  sourceY,
  sourcePosition,
  targetX,
  targetY,
  targetPosition,
  label,
}: EdgeProps<DataEdgeType>) {
  const markers = useEdgeMarkers();
  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: EDGE_BORDER_RADIUS,
  });

  return (
    <>
      <BaseEdge path={path} className={styles.data} markerEnd={`url(#${markers.data})`} />
      <EdgeLabel label={label} x={labelX} y={labelY} />
    </>
  );
}
