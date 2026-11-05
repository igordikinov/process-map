import { Context, type EditorTarget } from './interaction';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Stage } from '../data/schema';
import { useProcessStore } from '../store/useProcessStore';
import { ru } from '../i18n/ru';
import { editorHistory, runEditorCommand } from './commands';
import { registerEditorGuard } from './guard';
import type { EditorCommand } from './operations';

export function EditorProvider({ stage, children }: { stage: Stage; children: ReactNode }) {
  const mode = useProcessStore((state) => state.mode);
  const selected = useProcessStore((state) => state.selectedNodeId);
  const [target, setTarget] = useState<EditorTarget>(() =>
    selected ? { kind: 'node', id: selected } : null,
  );
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState('');
  const [pending, setPending] = useState<(() => void) | null>(null);
  const dirtyRef = useRef(false);
  const forms = useRef(new Map<string, { dirty: boolean; apply: () => boolean }>());
  const previousStage = useRef(stage.id);
  const editable = mode === 'edit';
  useEffect(() => {
    if (previousStage.current === stage.id) return;
    previousStage.current = stage.id;
    forms.current.clear();
    dirtyRef.current = false;
    setDirty(false);
    setTarget(null);
    setPending(null);
    setError('');
  }, [stage.id]);
  const request = useCallback((action: () => void) => {
    if (dirtyRef.current) setPending(() => action);
    else action();
  }, []);
  useEffect(() => (editable ? registerEditorGuard(request) : undefined), [editable, request]);
  const select = useCallback(
    (next: EditorTarget, force = false) => {
      const action = () => {
        dirtyRef.current = false;
        setDirty(false);
        setError('');
        setTarget(next);
        if (next?.kind === 'node') useProcessStore.getState().selectNode(next.id);
        else useProcessStore.getState().closeDrawer();
      };
      if (force) action();
      else request(action);
    },
    [request],
  );
  useEffect(() => {
    if (target && 'id' in target) {
      const exists =
        target.kind === 'node'
          ? stage.nodes.some((node) => node.id === target.id)
          : target.kind === 'edge'
            ? stage.edges.some((edge) => edge.id === target.id)
            : stage.groups.some((group) => group.id === target.id);
      if (!exists) {
        setTarget(null);
        dirtyRef.current = false;
        setDirty(false);
        useProcessStore.getState().closeDrawer();
      }
    }
  }, [stage, target]);
  useEffect(() => {
    if (!editable) setTarget(selected ? { kind: 'node', id: selected } : null);
  }, [editable, selected]);
  const run = useCallback(
    (command: EditorCommand): boolean => {
      try {
        runEditorCommand(stage.id, command);
        setError('');
        return true;
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : ru.editor.error);
        return false;
      }
    },
    [stage.id],
  );
  const history = useCallback(
    (direction: 'undo' | 'redo') =>
      request(() => {
        editorHistory(direction);
        dirtyRef.current = false;
        setDirty(false);
      }),
    [request],
  );
  useEffect(() => {
    if (!editable) return;
    const handler = (event: KeyboardEvent) => {
      if (
        event.target instanceof Element &&
        event.target.closest('input,textarea,select,[contenteditable="true"]')
      )
        return;
      if ((event.ctrlKey || event.metaKey) && ['z', 'y'].includes(event.key.toLowerCase())) {
        event.preventDefault();
        history(event.key.toLowerCase() === 'y' || event.shiftKey ? 'redo' : 'undo');
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [editable, history]);
  const registerForm = useCallback((id: string, next: boolean, apply: (() => boolean) | null) => {
    if (apply === null) forms.current.delete(id);
    else forms.current.set(id, { dirty: next, apply });
    const anyDirty = [...forms.current.values()].some((form) => form.dirty);
    dirtyRef.current = anyDirty;
    setDirty(anyDirty);
  }, []);
  const resolve = (choice: 'apply' | 'discard' | 'stay') => {
    if (choice === 'stay') {
      setPending(null);
      return;
    }
    if (choice === 'apply') {
      for (const form of forms.current.values()) if (form.dirty && !form.apply()) return;
    }
    dirtyRef.current = false;
    setDirty(false);
    setPending(null);
    try {
      pending?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : ru.editor.error);
    }
  };
  return (
    <Context.Provider
      value={{
        editable,
        stage,
        target,
        dirty,
        error,
        select,
        run,
        request,
        registerForm,
        history,
        clearError: () => setError(''),
      }}
    >
      {children}
      {pending && <PendingChangesDialog resolve={resolve} />}
    </Context.Provider>
  );
}

function PendingChangesDialog({
  resolve,
}: {
  resolve: (choice: 'apply' | 'discard' | 'stay') => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelector('button')?.focus();
  }, []);
  return (
    <div className="pm-editor-confirm-backdrop">
      <div
        ref={ref}
        role="alertdialog"
        aria-modal="true"
        aria-label={ru.editor.unsavedForm}
        className="pm-editor-confirm"
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            resolve('stay');
          }
          if (event.key === 'Tab') {
            const buttons = [...(ref.current?.querySelectorAll('button') ?? [])];
            if (event.shiftKey && document.activeElement === buttons[0]) {
              event.preventDefault();
              buttons.at(-1)?.focus();
            } else if (!event.shiftKey && document.activeElement === buttons.at(-1)) {
              event.preventDefault();
              buttons[0]?.focus();
            }
          }
        }}
      >
        <p>{ru.editor.unsavedForm}</p>
        <button type="button" onClick={() => resolve('apply')}>
          {ru.editor.apply}
        </button>
        <button type="button" onClick={() => resolve('discard')}>
          {ru.editor.discard}
        </button>
        <button type="button" onClick={() => resolve('stay')}>
          {ru.editor.stay}
        </button>
      </div>
    </div>
  );
}
