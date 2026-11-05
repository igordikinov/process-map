import { DRAWER_WIDTH, STEP_NODE_SIZE } from '../theme/sizes';
import { useReactFlow } from '@xyflow/react';
import { ru } from '../i18n/ru';
import { currentDraftState } from './commands';
import { useEditor } from './interaction';
import { editorId } from './operations';
import { insertionPoint } from './geometry';
import styles from './Editor.module.css';

export function EditorTools() {
  const editor = useEditor();
  const flow = useReactFlow();
  if (!editor?.editable) return null;
  const state = currentDraftState();
  const center = () => {
    const canvas = document.querySelector('.react-flow')?.getBoundingClientRect();
    if (!canvas) return { x: 0, y: 0 };
    const rightPanel = DRAWER_WIDTH;
    const point = flow.screenToFlowPosition({
      x: canvas.x + (canvas.width - rightPanel) / 2,
      y: canvas.y + canvas.height / 2,
    });
    const left = flow.screenToFlowPosition({ x: canvas.x + 16, y: canvas.y + 160 });
    const right = flow.screenToFlowPosition({
      x: canvas.right - rightPanel - 16,
      y: canvas.bottom - 16,
    });
    return insertionPoint(
      editor.stage,
      { x: point.x - STEP_NODE_SIZE.width / 2, y: point.y - STEP_NODE_SIZE.height / 2 },
      { left: left.x, top: left.y, right: right.x, bottom: right.y },
    );
  };
  return (
    <div className={styles.tools} role="group" aria-label={ru.editor.title}>
      <button
        type="button"
        onClick={() => {
          const selectedId = editor.target?.kind === 'node' ? editor.target.id : undefined;
          const parent = editor.stage.nodes.find((node) => node.id === selectedId);
          editor.select({
            kind: 'createNode',
            ...center(),
            parentId: parent?.id,
            groupId: editor.target?.kind === 'group' ? editor.target.id : parent?.group,
          });
        }}
      >
        {ru.editor.addNode}
      </button>
      <button
        type="button"
        onClick={() =>
          editor.request(() => {
            const group = { id: editorId('group'), label: ru.editor.newGroup, position: center() };
            if (editor.run({ type: 'upsertGroup', group }))
              editor.select({ kind: 'group', id: group.id });
          })
        }
      >
        {ru.editor.addGroup}
      </button>
      <button type="button" onClick={() => editor.select({ kind: 'createEdge', ...center() })}>
        {ru.editor.addEdge}
      </button>
      <button type="button" disabled={!state.undo} onClick={() => editor.history('undo')}>
        {ru.editor.undo}
      </button>
      <button type="button" disabled={!state.redo} onClick={() => editor.history('redo')}>
        {ru.editor.redo}
      </button>
    </div>
  );
}
