// Сторож согласованности размеров (задача process-map-vhg).
//
// Числа узлов живут в src/theme/sizes.ts (их читают React Flow и dagre),
// а CSS-модули читают токены --pm-* из src/theme/tokens.css. Два представления
// одного и того же числа — значит нужен тест, который падает, если правка
// затронула только одну сторону.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { NODE_SIZE, STAGE_NODE_SIZE as LAYOUT_STAGE_SIZE } from '../src/layout/stageLayout';
import { buildOverviewGraph } from '../src/components/Overview/overviewGraph';
import { loadBaseProcessMap } from '../src/data/loader';
import {
  DATA_NODE_SIZE,
  IO_NODE_SIZE,
  SIZE_TOKENS,
  STAGE_NODE_SIZE,
  STEP_NODE_SIZE,
} from '../src/theme/sizes';

// Путь относительный (Vitest запускается из корня репозитория), а не от
// import.meta.url: под Vitest он не file:-URL — та же оговорка есть в
// scripts/layout.ts. Импорт `?raw` тоже не годится: Vitest по умолчанию
// заглушает CSS-модули пустой строкой ещё до применения суффикса.
const TOKENS_CSS = readFileSync('src/theme/tokens.css', 'utf8');

/** Все объявления вида `--pm-foo: 274px;` из tokens.css. */
function readPxTokens(css: string): Map<string, number> {
  const found = new Map<string, number>();
  const declaration = /(--[a-z0-9-]+)\s*:\s*(-?\d+(?:\.\d+)?)px\s*;/g;
  let match = declaration.exec(css);
  while (match !== null) {
    const [, name, value] = match;
    if (name !== undefined && value !== undefined) {
      found.set(name, Number(value));
    }
    match = declaration.exec(css);
  }
  return found;
}

describe('размеры: sizes.ts ↔ tokens.css', () => {
  const tokens = readPxTokens(TOKENS_CSS);

  it.each(Object.entries(SIZE_TOKENS))('%s соответствует src/theme/sizes.ts', (name, expected) => {
    expect(
      tokens.get(name),
      `Токен ${name} в src/theme/tokens.css должен быть ${expected}px ` +
        '(значение из src/theme/sizes.ts). Правьте оба места или только sizes.ts.',
    ).toBe(expected);
  });
});

describe('размеры: sizes.ts ↔ раскладка', () => {
  it('ядро раскладки берёт размеры узлов из sizes.ts', () => {
    expect(NODE_SIZE.step).toEqual(STEP_NODE_SIZE);
    expect(NODE_SIZE.integration).toEqual(STEP_NODE_SIZE);
    expect(NODE_SIZE.warning).toEqual(STEP_NODE_SIZE);
    expect(NODE_SIZE.data).toEqual(DATA_NODE_SIZE);
    expect(LAYOUT_STAGE_SIZE).toEqual(STAGE_NODE_SIZE);
  });

  it('buildOverviewGraph ставит узлам размеры из sizes.ts', () => {
    const { nodes } = buildOverviewGraph(loadBaseProcessMap(), true);

    const stages = nodes.filter((node) => node.type === 'stage');
    expect(stages.length).toBeGreaterThan(0);
    for (const node of stages) {
      expect({ width: node.width, height: node.height }).toEqual(STAGE_NODE_SIZE);
    }

    const systems = nodes.filter((node) => node.type === 'system');
    expect(systems.length).toBeGreaterThan(0);
    for (const node of systems) {
      expect({ width: node.width, height: node.height }).toEqual(IO_NODE_SIZE);
    }
  });
});
