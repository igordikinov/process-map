import { useState, useRef, useEffect } from 'react';
import { NodeDrawer } from '../components/NodeDrawer';
import { ru } from '../i18n/ru';
import { useEditor } from './interaction';
import { deletionImpact, type EditorCommand } from './operations';
import { EdgeProperties, GroupProperties, NodeProperties, PositionProperties } from './Properties';
import styles from './Editor.module.css';

export function EditorInspector() {
  const editor = useEditor();
  const [confirm, setConfirm] = useState<string | null>(null);
  const confirmation = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (confirm) confirmation.current?.querySelector('button')?.focus();
  }, [confirm]);
  if (!editor?.editable || !editor.target) return null;
  const { target, stage } = editor;
  const node =
    target.kind === 'node' ? stage.nodes.find((item) => item.id === target.id) : undefined;
  const group =
    target.kind === 'group' ? stage.groups.find((item) => item.id === target.id) : undefined;
  const edge =
    target.kind === 'edge' ? stage.edges.find((item) => item.id === target.id) : undefined;
  const identity = 'id' in target ? `${target.kind}:${target.id}` : target.kind;
  let deletion: { text: string; command: EditorCommand } | undefined;
  if (node) {
    const impact = deletionImpact(stage, node.id);
    deletion = {
      text: ru.editor.confirmDelete(impact.nodes, impact.edges),
      command: { type: 'deleteNode', id: node.id },
    };
  } else if (group)
    deletion = { text: ru.editor.confirmGroup, command: { type: 'deleteGroup', id: group.id } };
  else if (edge)
    deletion = { text: ru.editor.confirmEdge, command: { type: 'deleteEdge', id: edge.id } };
  const remove =
    deletion &&
    (confirm === identity ? (
      <div
        ref={confirmation}
        className={styles.confirm}
        role="alertdialog"
        aria-label={deletion.text}
      >
        <p>{deletion.text}</p>
        <div className={styles.actions}>
          <button
            type="button"
            className={`${styles.button} ${styles.danger}`}
            onClick={() => {
              if (editor.run(deletion.command)) {
                setConfirm(null);
                editor.select(null, true);
              }
            }}
          >
            {ru.editor.remove}
          </button>
          <button type="button" className={styles.button} onClick={() => setConfirm(null)}>
            {ru.editor.cancel}
          </button>
        </div>
      </div>
    ) : (
      <button
        className={`${styles.button} ${styles.danger}`}
        type="button"
        onClick={() => editor.request(() => setConfirm(identity))}
      >
        {group ? ru.editor.deleteGroup : edge ? ru.editor.deleteEdge : ru.editor.remove}
      </button>
    ));
  const messages = editor.error && (
    <p className={styles.message} role="alert">
      {editor.error}
    </p>
  );
  if (node)
    return (
      <NodeDrawer nodes={stage.nodes} nonModal onRequestClose={() => editor.select(null)}>
        {messages}
        <NodeProperties key={node.id} node={node} />
        <PositionProperties key={`position:${node.id}`} node={node} />
        {remove}
      </NodeDrawer>
    );
  const title = group
    ? ru.editor.groupTitle
    : target.kind === 'createNode'
      ? ru.editor.addNode
      : ru.editor.edgeTitle;
  return (
    <section className={styles.panel} role="dialog" aria-label={title}>
      <header className={styles.header}>
        <h2 className={styles.heading}>{title}</h2>
        <button
          type="button"
          className={styles.button}
          aria-label={ru.editor.close}
          onClick={() => editor.select(null)}
        >
          {ru.editor.cancel}
        </button>
      </header>
      <div className={`${styles.body} ${styles.form}`}>
        {messages}
        {group ? (
          <GroupProperties key={group.id} group={group} />
        ) : target.kind === 'createNode' ? (
          <NodeProperties key="create" />
        ) : (
          <EdgeProperties key={edge?.id ?? 'new-edge'} edge={edge} />
        )}
        {remove}
      </div>
    </section>
  );
}
