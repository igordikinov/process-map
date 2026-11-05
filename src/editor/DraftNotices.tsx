import { getEditorContext, resetOverrides } from '../data/loader';
import { commitOverrides, useProcessMap } from '../hooks/useProcessMap';
import { ru } from '../i18n/ru';
import { downloadTextFile } from '../utils/download';
import { serializeProcessMap } from '../utils/processTransfer';
import { currentDraftState } from './commands';
import { assertEditorMap } from './operations';
import styles from './Editor.module.css';

export function DraftNotices() {
  useProcessMap();
  const state = currentDraftState();
  if (!state.unsaved && !state.conflict) return null;
  return (
    <aside className={styles.notices} role="status">
      <p>{state.conflict ? ru.editor.conflict : ru.editor.unsaved}</p>
      {state.conflict && (
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.button}
            onClick={() => {
              let text = state.conflict!;
              try {
                const value = JSON.parse(text) as { snapshot?: unknown };
                if (value.snapshot) text = serializeProcessMap(assertEditorMap(value.snapshot));
              } catch {
                /* Повреждённый черновик тоже можно сохранить для восстановления. */
              }
              downloadTextFile(`draft.${getEditorContext().base.id}.json`, text);
            }}
          >
            {ru.editor.exportConflict}
          </button>
          <button
            type="button"
            className={styles.button}
            onClick={() => commitOverrides(resetOverrides)}
          >
            {ru.editor.resetConflict}
          </button>
        </div>
      )}
    </aside>
  );
}
