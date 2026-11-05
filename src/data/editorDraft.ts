import { ru } from '../i18n/ru';
import { z } from 'zod';
import {
  EdgeSchema,
  GroupSchema,
  ProcessMapSchema,
  ProcessNodeSchema,
  type ProcessMap,
} from './schema';
import { assertEditorMap } from '../editor/operations';

const StageEditSchema = z.object({
  nodes: z.array(ProcessNodeSchema),
  edges: z.array(EdgeSchema),
  groups: z.array(GroupSchema),
});
const DraftSchema = z.object({
  format: z.literal(2),
  mapId: z.string(),
  fingerprint: z.string(),
  stages: z.record(StageEditSchema),
  snapshot: ProcessMapSchema.optional(),
});
type Draft = z.infer<typeof DraftSchema>;
export interface DraftContext {
  base: ProcessMap;
  scope: string;
}
interface Session {
  fingerprint: string;
  map: ProcessMap;
  raw: string | null;
  past: ProcessMap[];
  future: ProcessMap[];
  unsaved: boolean;
  conflict: string | null;
}
const sessions = new Map<string, Session>();

export function draftKey(context: DraftContext): string {
  return `inplan-process-map:${context.scope}:draft:v2`;
}

/** Отпечаток содержимого, а не только даты: обновление базы не теряет черновик. */
export function baseFingerprint(base: ProcessMap): string {
  let hash = 0xcbf29ce484222325n;
  for (const character of JSON.stringify(base)) {
    hash = BigInt.asUintN(64, (hash ^ BigInt(character.codePointAt(0)!)) * 0x100000001b3n);
  }
  return hash.toString(16);
}

function stored(key: string): string | null {
  try {
    return globalThis.localStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}
function store(key: string, value: string | null): boolean {
  try {
    if (!globalThis.localStorage) return false;
    if (value === null) globalThis.localStorage.removeItem(key);
    else globalThis.localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function asDraft(base: ProcessMap, map: ProcessMap, fingerprint: string): Draft {
  const stages: Draft['stages'] = {};
  for (const stage of map.stages) {
    const original = base.stages.find((item) => item.id === stage.id);
    const edit = { nodes: stage.nodes, edges: stage.edges, groups: stage.groups };
    if (
      !original ||
      JSON.stringify(edit) !==
        JSON.stringify({ nodes: original.nodes, edges: original.edges, groups: original.groups })
    )
      stages[stage.id] = edit;
  }
  return { format: 2, mapId: base.id, fingerprint, stages, snapshot: map };
}

function session(context: DraftContext, legacy: ProcessMap): Session {
  const key = draftKey(context);
  const raw = stored(key);
  const previous = sessions.get(key);
  // Ссылка на базу стабильна до смены карты. Не хешировать её на каждом кадре.
  const fingerprint =
    previous && baseObjects.get(key) === context.base
      ? previous.fingerprint
      : baseFingerprint(context.base);
  if (previous && previous.fingerprint === fingerprint && previous.raw === raw) return previous;
  const next: Session = {
    fingerprint,
    map: legacy,
    raw,
    past: [],
    future: [],
    unsaved: false,
    conflict: null,
  };
  if (raw !== null) {
    try {
      const draft = DraftSchema.parse(JSON.parse(raw));
      if (
        draft.mapId !== context.base.id ||
        draft.fingerprint !== fingerprint ||
        Object.keys(draft.stages).some(
          (id) => !context.base.stages.some((stage) => stage.id === id),
        )
      )
        throw new Error('incompatible');
      next.map = assertEditorMap({
        ...context.base,
        stages: context.base.stages.map((stage) => ({ ...stage, ...draft.stages[stage.id] })),
      });
    } catch {
      next.conflict = raw;
      next.map = context.base;
    }
  }
  sessions.set(key, next);
  baseObjects.set(key, context.base);
  return next;
}
const baseObjects = new Map<string, ProcessMap>();

export function readEditorMap(context: DraftContext, legacy: ProcessMap): ProcessMap {
  // v1 остаётся читаемым до первой записи в v2; внешняя запись v1 тоже видна.
  const state = session(context, legacy);
  if (state.raw === null && !state.unsaved && !state.past.length && !state.future.length)
    state.map = legacy;
  return state.map;
}

export function editorDraftState(context: DraftContext, legacy: ProcessMap) {
  const state = session(context, legacy);
  return {
    undo: state.past.length > 0,
    redo: state.future.length > 0,
    unsaved: state.unsaved,
    conflict: state.conflict,
  };
}

function persist(context: DraftContext, state: Session): void {
  const raw = JSON.stringify(asDraft(context.base, state.map, state.fingerprint));
  if (store(draftKey(context), raw)) {
    state.raw = raw;
    state.unsaved = false;
  } else state.unsaved = true;
}

export function writeEditorMap(context: DraftContext, before: ProcessMap, next: ProcessMap): void {
  assertEditorMap(next);
  const state = session(context, before);
  if (state.conflict) throw new Error(ru.editor.conflictAction);
  if (JSON.stringify(before) === JSON.stringify(next)) return;
  state.past = [...state.past, before].slice(-50);
  state.future = [];
  state.map = next;
  persist(context, state);
}

export function travelEditorHistory(
  context: DraftContext,
  legacy: ProcessMap,
  direction: 'undo' | 'redo',
): boolean {
  const state = session(context, legacy);
  const from = direction === 'undo' ? state.past : state.future;
  const to = direction === 'undo' ? state.future : state.past;
  const next = from.pop();
  if (!next) return false;
  to.push(state.map);
  state.map = next;
  persist(context, state);
  return true;
}

export function discardEditorDraft(context: DraftContext): void {
  const removed = store(draftKey(context), null);
  sessions.delete(draftKey(context));
  baseObjects.delete(draftKey(context));
  if (!removed) {
    // Сброс работает в памяти даже при недоступной записи. Не перечитывать старый raw.
    const raw = stored(draftKey(context));
    sessions.set(draftKey(context), {
      fingerprint: baseFingerprint(context.base),
      map: context.base,
      raw,
      past: [],
      future: [],
      unsaved: true,
      conflict: null,
    });
    baseObjects.set(draftKey(context), context.base);
  }
}

/** Старый экран редактирования ссылки пользуется тем же журналом команд. */
export function updateDraftScreen(
  context: DraftContext,
  legacy: ProcessMap,
  id: string,
  screen: { title: string; url: string } | null,
): void {
  const current = readEditorMap(context, legacy);
  const next = {
    ...current,
    stages: current.stages.map((stage) => ({
      ...stage,
      nodes: stage.nodes.map((node) =>
        node.id === id ? { ...node, screen: screen ?? undefined } : node,
      ),
    })),
  };
  writeEditorMap(context, current, next);
}

const RecoverySchema = z.object({ base: ProcessMapSchema, map: ProcessMapSchema });
const recoveryKey = (pageId: string) => `inplan-process-map:${pageId}:imported-recovery:v2`;
const recoveryMemory = new Map<string, z.infer<typeof RecoverySchema>>();
const recoveryFailures = new Set<string>();
export function saveImportedRecovery(pageId: string, base: ProcessMap, map: ProcessMap): boolean {
  const value = { base, map };
  recoveryMemory.set(pageId, value);
  const saved = store(recoveryKey(pageId), JSON.stringify(value));
  if (saved) recoveryFailures.delete(pageId);
  else recoveryFailures.add(pageId);
  return saved;
}
export function isRecoveryUnsaved(pageId: string): boolean {
  return recoveryFailures.has(pageId);
}
export function readImportedRecovery(pageId: string): z.infer<typeof RecoverySchema> | null {
  if (recoveryFailures.has(pageId)) return recoveryMemory.get(pageId) ?? null;
  const raw = stored(recoveryKey(pageId));
  if (raw === null) return recoveryMemory.get(pageId) ?? null;
  try {
    const value = RecoverySchema.parse(JSON.parse(raw));
    assertEditorMap(value.base);
    assertEditorMap(value.map);
    return value;
  } catch {
    return null;
  }
}

/** Сброс изолированных сессий при выходе из приложения / в тестах. */
export function clearEditorSessions(): void {
  sessions.clear();
  baseObjects.clear();
  recoveryMemory.clear();
  recoveryFailures.clear();
}
