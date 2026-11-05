import { useEditor } from '../../../editor/interaction';
// Контейнер уровня 2 — узел React Flow типа group (SPEC §4.2).
//
// Два вида, различаются только оформлением:
//   · 'group'  — dashed-рамка с заголовком группы (stage.groups);
//   · 'column' — заголовок колонки входов/выходов без рамки (артборд A2:
//                «Входные данные» / «Выходные данные» над колонкой data-узлов).
//
// Оба вида — родители своих узлов (parentId + extent: 'parent'), как свимлейны
// уровня 1 в Overview/overviewGraph.ts. Размер задаётся через style узла.
import type { Node, NodeProps } from '@xyflow/react';
import styles from './GroupNode.module.css';

export type GroupNodeKind = 'group' | 'column';

export interface GroupNodeData extends Record<string, unknown> {
  title: string;
  kind: GroupNodeKind;
}

export type GroupNodeType = Node<GroupNodeData, 'groupBox'>;

export function GroupNode({ data, id }: NodeProps<GroupNodeType>) {
  const editor = useEditor();
  const group = editor?.stage.groups.find((item) => `group:${item.id}` === id);
  return (
    <div className={data.kind === 'group' ? styles.group : styles.column}>
      {/* Названия групп в данных длиннее макетных и обрезаются многоточием;
          полный текст доступен подсказкой. */}
      {editor?.editable && data.kind === 'group' && group ? (
        <button
          type="button"
          className={`${styles.title} pm-group-handle`}
          title={data.title}
          onClick={() => editor.select({ kind: 'group', id: group.id })}
        >
          {data.title}
        </button>
      ) : (
        <div className={styles.title} title={data.title}>
          {data.title}
        </div>
      )}
    </div>
  );
}
