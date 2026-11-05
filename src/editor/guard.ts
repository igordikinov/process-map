type Action = () => void;
let guard: ((action: Action) => void) | null = null;
export function registerEditorGuard(next: ((action: Action) => void) | null): () => void {
  guard = next;
  return () => {
    if (guard === next) guard = null;
  };
}
export function requestEditorAction(action: Action): void {
  if (guard) guard(action);
  else action();
}
