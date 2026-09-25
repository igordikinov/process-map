// Подробность под шагом, уровень 2 (NodeType 'detail', process-map-9mn.32;
// оформление, клик и выноска — process-map-9mn.36; итоговый размер и место
// ПОД шагом, а не рангом правее, — process-map-9mn.26).
//
// Что закреплено и почему:
//   · текст — абзацы блока со слайда, склеенные через \n (решение владельца,
//     process-map-9mn.31), поэтому white-space: pre-line и БЕЗ обрезки: у
//     шага подпись клампится до двух строк, а подробность целиком и есть
//     содержание (правило и его сторож — шапка DetailNode.module.css);
//   · карточка — <button>, который выбирает узел, ровно как DataNode и
//     StepCard (решение оркестратора, process-map-9mn.36): любой узел полотна
//     ведёт себя одинаково, достижим с клавиатуры, и панель (SPEC §4.3)
//     открывается для подробности так же, как для шага. Пока клик ничего не
//     делал, карточка была <div> — кнопка без действия была бы ложным
//     обещанием; теперь действие есть;
//   · ОДИН хэндл — цель сверху. Входящее ребро у подробности ровно одно и
//     исходящих нет (validateIntegrity), а выноска всегда идёт от низа
//     карточки хоста к верху подробности (stageGraph.ts, тип ребра
//     'detailLink'). Хэндл слева, как у шага, не нужен никакому ребру:
//     лишняя точка подключения только позволила бы правилу выбора хэндлов
//     молча пустить выноску сбоку. Идентификатор — общий с узлами потока
//     (STEP_HANDLE), потому что хэндлы ребру выбирает stageGraph.ts.
//
// title у карточки нет, в отличие от шага и данных: там он несёт полный
// текст, срезанный клампом, а здесь полный текст и так на виду. Описание узла
// (если оно появится) показывает панель.
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import type { ProcessNode } from '../../../data/schema';
import { ru } from '../../../i18n/ru';
import { useProcessStore } from '../../../store/useProcessStore';
import { STEP_HANDLE } from '../StepNode';
import styles from './DetailNode.module.css';

export interface DetailNodeData extends Record<string, unknown> {
  node: ProcessNode;
}

export type DetailNodeType = Node<DetailNodeData, 'detail'>;

export function DetailNode({ data }: NodeProps<DetailNodeType>) {
  const selectNode = useProcessStore((state) => state.selectNode);
  const node = data.node;
  const isSelected = useProcessStore((state) => state.selectedNodeId === node.id);

  return (
    <>
      <Handle type="target" position={Position.Top} id={STEP_HANDLE.top} isConnectable={false} />
      <button
        type="button"
        className={isSelected ? `${styles.card} ${styles.selected}` : styles.card}
        aria-current={isSelected ? 'true' : undefined}
        // Тип узла впереди: без него скринридер прочитал бы подробность как
        // ещё один шаг процесса (см. ru.detailNode).
        aria-label={ru.detailNode.ariaLabel(node.label)}
        onClick={() => {
          selectNode(node.id);
        }}
      >
        <span className={styles.text}>{node.label}</span>
      </button>
    </>
  );
}
