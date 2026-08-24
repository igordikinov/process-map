// Тесты merge overrides и устойчивости хранилища (SPEC.md §3 «Overrides»).
// Работают на фикстуре buildSampleProcessMap(), а не на реальном process.json.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  mergeOverrides,
  parseOverrides,
  readStoredOverrides,
  removeNodeOverride,
  resetOverrides,
  safeParseOverrides,
  setNodeOverride,
  writeStoredOverrides,
} from '../src/data/loader';
import {
  OVERRIDES_STORAGE_KEY,
  type Overrides,
  type ProcessMap,
  type ScreenLink,
} from '../src/data/schema';
import { buildSampleProcessMap } from './fixtures/sample-process';

const JSON_SCREEN: ScreenLink = { title: 'Из JSON', url: 'https://example.com/json' };
const OVERRIDE_SCREEN: ScreenLink = { title: 'Из override', url: 'https://example.com/override' };

/** id узлов фикстуры стабильны по конструкции фабрики, не по данным презентации. */
function firstNodeId(map: ProcessMap): string {
  const id = map.stages[0]?.nodes[0]?.id;
  if (id === undefined) {
    throw new Error('фикстура должна содержать хотя бы один узел');
  }
  return id;
}

function secondNodeId(map: ProcessMap): string {
  const id = map.stages[0]?.nodes[1]?.id;
  if (id === undefined) {
    throw new Error('фикстура должна содержать хотя бы два узла');
  }
  return id;
}

/** Копия фикстуры, где у первого узла первого этапа задан screen из JSON. */
function mapWithJsonScreen(): ProcessMap {
  const base = buildSampleProcessMap();
  return {
    ...base,
    stages: base.stages.map((stage, stageIndex) =>
      stageIndex === 0
        ? {
            ...stage,
            nodes: stage.nodes.map((node, nodeIndex) =>
              nodeIndex === 0 ? { ...node, screen: { ...JSON_SCREEN } } : node,
            ),
          }
        : stage,
    ),
  };
}

function nodeById(map: ProcessMap, id: string) {
  const node = map.stages.flatMap((stage) => stage.nodes).find((candidate) => candidate.id === id);
  if (node === undefined) {
    throw new Error(`узел ${id} не найден`);
  }
  return node;
}

describe('mergeOverrides — три состояния override', () => {
  it('нет записи по узлу → screen берётся из JSON', () => {
    const map = mapWithJsonScreen();
    const id = firstNodeId(map);

    const merged = mergeOverrides(map, {});

    expect(nodeById(merged, id).screen).toEqual(JSON_SCREEN);
  });

  it('запись без поля screen ({}) равнозначна отсутствию записи', () => {
    const map = mapWithJsonScreen();
    const id = firstNodeId(map);

    const merged = mergeOverrides(map, { [id]: {} });

    expect(nodeById(merged, id).screen).toEqual(JSON_SCREEN);
  });

  it('{ screen: {...} } заменяет screen узла и имеет приоритет над JSON', () => {
    const map = mapWithJsonScreen();
    const id = firstNodeId(map);

    const merged = mergeOverrides(map, { [id]: { screen: OVERRIDE_SCREEN } });

    expect(nodeById(merged, id).screen).toEqual(OVERRIDE_SCREEN);
  });

  it('{ screen: null } — явно удалённая ссылка: поля screen нет и оно не откатывается к JSON', () => {
    const map = mapWithJsonScreen();
    const id = firstNodeId(map);

    const merged = mergeOverrides(map, { [id]: { screen: null } });
    const node = nodeById(merged, id);

    expect(node.screen).toBeUndefined();
    expect('screen' in node).toBe(false);
  });

  it('{ screen: {...} } добавляет ссылку узлу, у которого её не было в JSON', () => {
    const map = buildSampleProcessMap();
    const id = secondNodeId(map);
    expect(nodeById(map, id).screen).toBeUndefined();

    const merged = mergeOverrides(map, { [id]: { screen: OVERRIDE_SCREEN } });

    expect(nodeById(merged, id).screen).toEqual(OVERRIDE_SCREEN);
  });

  it('не мутирует исходную карту', () => {
    const map = mapWithJsonScreen();
    const id = firstNodeId(map);

    mergeOverrides(map, { [id]: { screen: null } });

    expect(nodeById(map, id).screen).toEqual(JSON_SCREEN);
  });

  it('игнорирует записи для несуществующих узлов', () => {
    const map = mapWithJsonScreen();

    const merged = mergeOverrides(map, { 'no-such-node': { screen: OVERRIDE_SCREEN } });

    expect(merged.stages.flatMap((stage) => stage.nodes)).toHaveLength(
      map.stages.flatMap((stage) => stage.nodes).length,
    );
    expect(nodeById(merged, firstNodeId(map)).screen).toEqual(JSON_SCREEN);
  });

  it('применяет разные состояния к разным узлам за один вызов', () => {
    const map = mapWithJsonScreen();
    const first = firstNodeId(map);
    const second = secondNodeId(map);

    const merged = mergeOverrides(map, {
      [first]: { screen: null },
      [second]: { screen: OVERRIDE_SCREEN },
    });

    expect(nodeById(merged, first).screen).toBeUndefined();
    expect(nodeById(merged, second).screen).toEqual(OVERRIDE_SCREEN);
  });
});

describe('safeParseOverrides / parseOverrides', () => {
  it('принимает валидные записи, включая null', () => {
    const raw = { a: { screen: null }, b: { screen: OVERRIDE_SCREEN }, c: {} };
    expect(safeParseOverrides(raw)).toEqual(raw);
    expect(parseOverrides(raw)).toEqual(raw);
  });

  it.each([
    ['строка', 'мусор'],
    ['число', 42],
    ['null', null],
    ['битая запись', { a: { screen: 42 } }],
    ['screen без url', { a: { screen: { title: 'x' } } }],
  ])('невалидное значение (%s) превращается в {}', (_name, raw) => {
    expect(safeParseOverrides(raw)).toEqual({});
  });

  it('parseOverrides бросает на невалидных данных', () => {
    expect(() => parseOverrides({ a: { screen: 42 } })).toThrow();
  });
});

describe('устойчивость localStorage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('пустое хранилище → {}', () => {
    expect(readStoredOverrides()).toEqual({});
  });

  it('битый JSON под ключом → {} и merge продолжает работать', () => {
    localStorage.setItem(OVERRIDES_STORAGE_KEY, '{не json');
    const map = mapWithJsonScreen();

    expect(readStoredOverrides()).toEqual({});
    expect(nodeById(mergeOverrides(map, readStoredOverrides()), firstNodeId(map)).screen).toEqual(
      JSON_SCREEN,
    );
  });

  it('чужая структура под ключом → {}', () => {
    localStorage.setItem(OVERRIDES_STORAGE_KEY, JSON.stringify({ foo: 'bar' }));
    expect(readStoredOverrides()).toEqual({});
  });

  it('отсутствие localStorage не роняет чтение и запись', () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, get: () => undefined });
    try {
      expect(readStoredOverrides()).toEqual({});
      expect(writeStoredOverrides({ a: { screen: null } })).toBe(false);
      expect(() => resetOverrides()).not.toThrow();
    } finally {
      if (original) {
        Object.defineProperty(globalThis, 'localStorage', original);
      }
    }
  });

  it('переполнение квоты при записи → false, без исключения', () => {
    let calls = 0;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation((key: string) => {
      calls += 1;
      // Первый вызов — проба доступности хранилища, она должна проходить.
      if (calls > 1 || key === OVERRIDES_STORAGE_KEY) {
        throw new DOMException('quota', 'QuotaExceededError');
      }
    });

    expect(writeStoredOverrides({ a: { screen: OVERRIDE_SCREEN } })).toBe(false);
  });

  it('setNodeOverride пишет запись, а null сохраняется как явное удаление', () => {
    const stored: Overrides = setNodeOverride('node-a', OVERRIDE_SCREEN);
    expect(stored).toEqual({ 'node-a': { screen: OVERRIDE_SCREEN } });
    expect(readStoredOverrides()).toEqual({ 'node-a': { screen: OVERRIDE_SCREEN } });

    setNodeOverride('node-a', null);
    expect(readStoredOverrides()).toEqual({ 'node-a': { screen: null } });
  });

  it('removeNodeOverride убирает только свою запись', () => {
    setNodeOverride('node-a', OVERRIDE_SCREEN);
    setNodeOverride('node-b', null);

    expect(removeNodeOverride('node-a')).toEqual({ 'node-b': { screen: null } });
    expect(readStoredOverrides()).toEqual({ 'node-b': { screen: null } });
  });

  it('resetOverrides удаляет ключ целиком', () => {
    setNodeOverride('node-a', OVERRIDE_SCREEN);
    resetOverrides();

    expect(localStorage.getItem(OVERRIDES_STORAGE_KEY)).toBeNull();
    expect(readStoredOverrides()).toEqual({});
  });
});
