import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProcessMapSchema, type ProcessMap, type ProcessNode } from '../src/data/schema';
import { applyEditorCommand, assertEditorMap } from '../src/editor/operations';
import {
  baseFingerprint,
  clearEditorSessions,
  discardEditorDraft,
  draftKey,
  editorDraftState,
  readEditorMap,
  readImportedRecovery,
  saveImportedRecovery,
  travelEditorHistory,
  writeEditorMap,
} from '../src/data/editorDraft';
import { buildStageGraph } from '../src/components/StageDetail/stageGraph';
import { parseImportedOverrides, serializeProcessMap } from '../src/utils/processTransfer';

function fixture(): ProcessMap {
  return ProcessMapSchema.parse({
    version: '1',
    id: 'editor-test',
    title: 'Карта',
    moduleLabel: 'Процесс',
    updatedAt: '2026-11-05',
    overviewEdges: [],
    stages: [
      {
        id: 'stage',
        number: 1,
        title: 'Этап',
        shortTitle: 'Этап',
        keyOutputs: [],
        groups: [{ id: 'g', label: 'Группа' }],
        inputs: [],
        outputs: [],
        nodes: [
          { id: 'a', type: 'step', label: 'Шаг', group: 'g', position: { x: 32, y: 64 } },
          { id: 'b', type: 'step', label: 'Следующий шаг', position: { x: 512, y: 64 } },
          {
            id: 'detail',
            type: 'detail',
            label: 'Подробность',
            group: 'g',
            position: { x: 32, y: 144 },
          },
        ],
        edges: [
          { id: 'ab', source: 'a', target: 'b', kind: 'process' },
          { id: 'ad', source: 'a', target: 'detail', kind: 'data' },
        ],
      },
    ],
  });
}
const edit = (map: ProcessMap, command: Parameters<typeof applyEditorCommand>[2]) =>
  applyEditorCommand(map, 'stage', command);
beforeEach(() => {
  localStorage.clear();
  clearEditorSessions();
});
afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  clearEditorSessions();
});

describe('команды редактора', () => {
  it.each(['inplan', 'inplan-model', 'snp', 'mrp'])(
    'исходная карта %s проходит проверку редактора',
    (id) => {
      expect(() =>
        assertEditorMap(JSON.parse(readFileSync(`src/data/${id}/process.json`, 'utf8'))),
      ).not.toThrow();
    },
  );
  it.each([
    'step',
    'data',
    'integration',
    'warning',
    'gateway',
    'event',
    'subprocess',
    'detail',
  ] as const)('добавляет %s без изменения других узлов', (type) => {
    const base = fixture();
    const node: ProcessNode = {
      id: `new-${type}`,
      type,
      label: 'Новый',
      position: { x: 800, y: 32 },
    };
    const next = edit(base, { type: 'addNode', node, parentId: 'b' });
    expect(next.stages[0]!.nodes).toHaveLength(4);
    expect(base.stages[0]!.nodes).toHaveLength(3);
    expect(() => assertEditorMap(next)).not.toThrow();
  });
  it('переименовывает без изменения id и координат, сохраняет привязку к сетке', () => {
    const named = edit(fixture(), {
      type: 'updateNode',
      id: 'a',
      patch: { label: 'Другое название' },
    });
    expect(named.stages[0]!.nodes[0]).toMatchObject({
      id: 'a',
      label: 'Другое название',
      position: { x: 32, y: 64 },
    });
    const moved = edit(named, { type: 'moveNode', id: 'a', position: { x: -19, y: 103 } });
    expect(moved.stages[0]!.nodes[0]!.position).toEqual({ x: -16, y: 96 });
  });
  it('удаляет шаг вместе с подробностью и рёбрами, не соединяет соседей', () => {
    const next = edit(fixture(), { type: 'deleteNode', id: 'a' });
    expect(next.stages[0]!.nodes.map((node) => node.id)).toEqual(['b']);
    expect(next.stages[0]!.edges).toEqual([]);
    expect(next.stages[0]!.groups[0]!.position).toEqual({ x: 16, y: 24 });
    expect(buildStageGraph(next.stages[0]!).nodes.some((node) => node.id === 'group:g')).toBe(true);
  });
  it('перемещение не меняет направление данных legacy-карты', () => {
    const base = edit(fixture(), {
      type: 'addNode',
      node: { id: 'input', type: 'data', label: 'Данные', position: { x: 0, y: 400 } },
    });
    const next = edit(base, { type: 'moveNode', id: 'a', position: { x: -1024, y: 64 } });
    expect(next.stages[0]!.nodes.find((node) => node.id === 'input')!.direction).toBe('in');
    expect(next.stages[0]!.nodes.find((node) => node.id === 'input')!.position).toEqual({
      x: 0,
      y: 400,
    });
  });
  it('отвергает id, конфликтующий с контейнером полотна', () => {
    expect(() =>
      edit(fixture(), {
        type: 'addNode',
        node: { id: 'group:g', type: 'step', label: 'Конфликт', position: { x: 0, y: 0 } },
      }),
    ).toThrow();
  });
  it('удаляет только рамку, сохраняя блоки, их связи и координаты', () => {
    const base = fixture();
    const next = edit(base, { type: 'deleteGroup', id: 'g' });
    expect(next.stages[0]!.groups).toEqual([]);
    expect(next.stages[0]!.nodes.map((node) => node.position)).toEqual(
      base.stages[0]!.nodes.map((node) => node.position),
    );
    expect(next.stages[0]!.nodes.every((node) => node.group === undefined)).toBe(true);
    expect(next.stages[0]!.edges).toEqual(base.stages[0]!.edges);
  });
  it('сдвигает всех членов группы на одинаковое расстояние, сохраняя относительное расположение', () => {
    const base = fixture();
    const next = edit(base, { type: 'moveGroup', id: 'g', dx: 48, dy: 32 });
    expect(next.stages[0]!.nodes[0]!.position).toEqual({ x: 80, y: 104 });
    expect(next.stages[0]!.nodes[2]!.position).toEqual({ x: 80, y: 184 });
    expect(next.stages[0]!.nodes[1]).toEqual(base.stages[0]!.nodes[1]);
  });
  it('перепривязывает подробность атомарно; не допускает сироту или второго родителя', () => {
    expect(() => edit(fixture(), { type: 'deleteEdge', id: 'ad' })).toThrow();
    const next = edit(fixture(), { type: 'updateNode', id: 'detail', patch: {}, parentId: 'b' });
    expect(next.stages[0]!.edges.find((edge) => edge.id === 'ad')!.source).toBe('b');
    expect(() =>
      edit(next, {
        type: 'upsertEdge',
        edge: { id: 'another', source: 'a', target: 'detail', kind: 'data' },
      }),
    ).toThrow();
  });
  it('отвергает висячие, повторные и самосвязи, разрешает цикл', () => {
    for (const edge of [
      { id: 'bad', source: 'a', target: 'missing', kind: 'process' as const },
      { id: 'dup', source: 'a', target: 'b', kind: 'process' as const },
      { id: 'self', source: 'a', target: 'a', kind: 'process' as const },
    ])
      expect(() => edit(fixture(), { type: 'upsertEdge', edge })).toThrow();
    expect(() =>
      edit(fixture(), {
        type: 'upsertEdge',
        edge: { id: 'back', source: 'b', target: 'a', kind: 'process' },
      }),
    ).not.toThrow();
  });
});

describe('черновики и перенос', () => {
  it('сохраняет структуру и координаты после пересоздания сессии и полного JSON roundtrip', () => {
    const base = fixture();
    const context = { base, scope: base.id };
    const next = edit(edit(base, { type: 'deleteNode', id: 'a' }), {
      type: 'addNode',
      node: { id: 'new', type: 'step', label: 'Созданный', position: { x: 96, y: 192 } },
    });
    writeEditorMap(context, base, next);
    clearEditorSessions();
    expect(readEditorMap(context, base)).toEqual(ProcessMapSchema.parse(next));
    const result = parseImportedOverrides(serializeProcessMap(next), base);
    expect(result.status).toBe('ok');
    if (result.status === 'ok') expect(result.map).toEqual(ProcessMapSchema.parse(next));
  });
  it('переносит старые ссылки в первый структурный черновик', () => {
    const base = fixture();
    const context = { base, scope: base.id };
    const legacy = edit(base, {
      type: 'updateNode',
      id: 'a',
      patch: { screen: { title: 'Экран', url: 'https://example.com/' } },
    });
    expect(readEditorMap(context, legacy)).toBe(legacy);
    const next = edit(legacy, { type: 'moveNode', id: 'b', position: { x: 800, y: 64 } });
    writeEditorMap(context, legacy, next);
    clearEditorSessions();
    expect(readEditorMap(context, base).stages[0]!.nodes[0]!.screen?.title).toBe('Экран');
  });
  it('не применяет черновик к обновлённой базе и сохраняет резервный снимок', () => {
    const base = fixture();
    const context = { base, scope: base.id };
    writeEditorMap(
      context,
      base,
      edit(base, { type: 'updateNode', id: 'a', patch: { label: 'Правка' } }),
    );
    const updated = { ...base, title: 'Обновлённая карта' };
    const other = { base: updated, scope: base.id };
    expect(readEditorMap(other, updated)).toBe(updated);
    expect(editorDraftState(other, updated).conflict).not.toBeNull();
    expect(
      JSON.parse(localStorage.getItem(draftKey(other))!).snapshot.stages[0].nodes[0].label,
    ).toBe('Правка');
    expect(baseFingerprint(updated)).not.toBe(baseFingerprint(base));
    discardEditorDraft(other);
    expect(readEditorMap(other, updated)).toBe(updated);
  });
  it('при переполнении хранилища сохраняет черновик и историю в памяти', () => {
    const base = fixture();
    const context = { base, scope: base.id };
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    const next = edit(base, { type: 'deleteNode', id: 'a' });
    writeEditorMap(context, base, next);
    expect(readEditorMap(context, base)).toBe(next);
    expect(editorDraftState(context, base).unsaved).toBe(true);
    travelEditorHistory(context, base, 'undo');
    expect(readEditorMap(context, base)).toBe(base);
  });
  it('ограничивает историю 50 действиями, изолирует карты и очищает redo после новой команды', () => {
    const base = fixture();
    const context = { base, scope: base.id };
    let map = base;
    for (let i = 0; i < 55; i++) {
      const next = edit(map, { type: 'updateNode', id: 'a', patch: { label: `Шаг ${i}` } });
      writeEditorMap(context, map, next);
      map = next;
    }
    for (let i = 0; i < 50; i++) expect(travelEditorHistory(context, base, 'undo')).toBe(true);
    expect(travelEditorHistory(context, base, 'undo')).toBe(false);
    expect(readEditorMap(context, base).stages[0]!.nodes[0]!.label).toBe('Шаг 4');
    expect(editorDraftState({ base, scope: 'imported:editor-test' }, base).undo).toBe(false);
    map = readEditorMap(context, base);
    writeEditorMap(context, map, edit(map, { type: 'deleteNode', id: 'a' }));
    expect(editorDraftState(context, base).redo).toBe(false);
  });
  it('хранит загруженную карту отдельно для явного восстановления', () => {
    const base = fixture();
    const next = edit(base, { type: 'deleteNode', id: 'a' });
    saveImportedRecovery('page', base, next);
    clearEditorSessions();
    expect(readImportedRecovery('page')?.map).toEqual(ProcessMapSchema.parse(next));
    expect(readImportedRecovery('other-page')).toBeNull();
  });
});
