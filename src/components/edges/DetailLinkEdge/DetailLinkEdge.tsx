// Выноска «шаг → подробность» (process-map-9mn.36).
//
// СВОЙ ТИП РЕБРА, а не ребро данных. В модели эта связь — ребро kind: 'data'
// (validateIntegrity требует у подробности ровно одно входящее ребро этого
// вида), и до этой задачи она так и рисовалась: точечным пунктиром со
// стрелкой, как связь шага с артефактом. Но подробность не артефакт и не
// следующий шаг, а пояснение к шагу, и stageGraph.ts выбирает этот тип по
// ТИПУ ЦЕЛИ, а не по kind. Отдельный тип, а не проп, — по тому же
// соображению, что у `process` / `processInner`: тип попадает в класс
// `.react-flow__edge-<type>`, и общий тип слил бы два вида в один счётчик.
//
// ТОНКАЯ ЛИНИЯ БЕЗ СТРЕЛКИ. Стрелка — знак перехода: у серого ребра потока
// внутри группы она та же, и выноска со стрелкой читалась бы как «после шага
// идёт подробность». Нотация BPMN прикрепляет текстовую аннотацию линией без
// наконечника — так и здесь. Цвет и толщина — токены --pm-edge-detail-*.
//
// Геометрия — smoothstep, как у остальных рёбер уровня 2: хэндлы снизу хоста
// и сверху подробности (stageGraph.ts), и когда подробность стоит ровно под
// шагом (process-map-9mn.26), путь вырождается в вертикальный отрезок.
import { BaseEdge, getSmoothStepPath, type Edge, type EdgeProps } from '@xyflow/react';
import { EdgeLabel } from '../EdgeLabel';
import { EDGE_BORDER_RADIUS } from '../edgeGeometry';
import styles from '../edges.module.css';

export type DetailLinkEdgeType = Edge<Record<string, unknown>, 'detailLink'>;

export function DetailLinkEdge({
  sourceX,
  sourceY,
  sourcePosition,
  targetX,
  targetY,
  targetPosition,
  label,
}: EdgeProps<DetailLinkEdgeType>) {
  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: EDGE_BORDER_RADIUS,
  });

  // markerEnd не передаётся намеренно — см. шапку: выноска без стрелки.
  // Подпись рисуется, как у всех рёбер: в презентациях её у выноски нет, но
  // молча терять поле `label` модели ребро не должно (EdgeLabel сам ничего не
  // рисует, когда подписи нет).
  return (
    <>
      <BaseEdge path={path} className={styles.detailLink} />
      <EdgeLabel label={label} x={labelX} y={labelY} />
    </>
  );
}
