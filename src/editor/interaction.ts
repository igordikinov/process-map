import { createContext, useContext, useEffect, useId } from 'react';
import type { Stage } from '../data/schema';
import type { EditorCommand, EditorSelection } from './operations';

export type EditorTarget =
  | EditorSelection
  | {
      kind: 'createNode' | 'createEdge';
      x: number;
      y: number;
      parentId?: string;
      groupId?: string;
    };
interface EditorInteraction {
  editable: boolean;
  stage: Stage;
  target: EditorTarget;
  dirty: boolean;
  error: string;
  select: (target: EditorTarget, force?: boolean) => void;
  run: (command: EditorCommand) => boolean;
  request: (action: () => void) => void;
  registerForm: (id: string, dirty: boolean, apply: (() => boolean) | null) => void;
  history: (direction: 'undo' | 'redo') => void;
  clearError: () => void;
}
export const Context = createContext<EditorInteraction | null>(null);
export function useEditor() {
  return useContext(Context);
}
export function useEditorForm(dirty: boolean, apply: () => boolean): void {
  const editor = useEditor();
  const id = useId();
  const register = editor?.registerForm;
  useEffect(() => {
    register?.(id, dirty, apply);
    return () => register?.(id, false, null);
  }, [register, id, dirty, apply]);
}
