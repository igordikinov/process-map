// Подробность под шагом, уровень 2 (NodeType 'detail', process-map-9mn.32).
//
// ЗАГЛУШКА, а не итоговая карточка. Эта задача вводит тип в схему, а тип узла
// обязан во что-то рисоваться: без регистрации в nodeTypes React Flow молча
// нарисовал бы узел по умолчанию (см. шапку NodeTypeSchema). Оформление, клик
// с открытием Drawer, отдельный вид ребра «шаг → подробность» и пункт легенды —
// задача process-map-9mn.36, итоговый размер — process-map-9mn.26.
//
// Что закреплено уже здесь, потому что вытекает из данных, а не из макета:
//   · текст — абзацы блока со слайда, склеенные через \n (решение владельца,
//     process-map-9mn.31), поэтому white-space: pre-line и БЕЗ обрезки: у
//     шага подпись клампится до двух строк, а подробность целиком и есть
//     содержание;
//   · только входящие хэндлы: у подробности ровно одно входящее ребро и ни
//     одного исходящего (validateIntegrity). Идентификаторы — общие с узлами
//     потока (STEP_HANDLE), потому что хэндлы ребру выбирает stageGraph.ts
//     одним правилом для всех узлов.
//
// Карточка — не <button>: пока клик ничего не делает, кнопка была бы ложным
// обещанием для клавиатуры и скринридера. Текст при этом виден и читается.
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import type { ProcessNode } from '../../../data/schema';
import { STEP_HANDLE } from '../StepNode';
import styles from './DetailNode.module.css';

export interface DetailNodeData extends Record<string, unknown> {
  node: ProcessNode;
}

export type DetailNodeType = Node<DetailNodeData, 'detail'>;

export function DetailNode({ data }: NodeProps<DetailNodeType>) {
  return (
    <>
      <Handle type="target" position={Position.Left} id={STEP_HANDLE.left} isConnectable={false} />
      <Handle type="target" position={Position.Top} id={STEP_HANDLE.top} isConnectable={false} />
      <div className={styles.card}>{data.node.label}</div>
    </>
  );
}
