import { getImportedMap } from '../data/activeMap';
import { DEFAULT_VERSION_ID } from '../data/versions';
import { getEditorContext, loadProcessMap } from '../data/loader';
import {
  editorDraftState,
  isRecoveryUnsaved,
  saveImportedRecovery,
  travelEditorHistory,
  writeEditorMap,
} from '../data/editorDraft';
import { commitOverrides } from '../hooks/useProcessMap';
import type { ProcessMap } from '../data/schema';
import { applyEditorCommand, type EditorCommand } from './operations';

function saveRecovery(): void {
  const base = getImportedMap();
  if (base) saveImportedRecovery(DEFAULT_VERSION_ID, base, loadProcessMap());
}

export function runEditorCommand(stageId: string, command: EditorCommand): void {
  commitOverrides(() => {
    const map = loadProcessMap();
    writeEditorMap(getEditorContext(), map, applyEditorCommand(map, stageId, command));
    saveRecovery();
  });
}

export function replaceEditedMap(map: ProcessMap): void {
  commitOverrides(() => {
    writeEditorMap(getEditorContext(), loadProcessMap(), map);
    saveRecovery();
  });
}

export function editorHistory(direction: 'undo' | 'redo'): void {
  commitOverrides(() => {
    travelEditorHistory(getEditorContext(), loadProcessMap(), direction);
    saveRecovery();
  });
}

export function currentDraftState() {
  const state = editorDraftState(getEditorContext(), loadProcessMap());
  return {
    ...state,
    unsaved: state.unsaved || (getImportedMap() !== null && isRecoveryUnsaved(DEFAULT_VERSION_ID)),
  };
}
