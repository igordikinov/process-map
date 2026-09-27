// Сборка графа уровня 1 трёхуровневой карты — buildModulesGraph (задача
// process-map-9mn.16).
//
// Чистая функция, поэтому проверяется без полотна, по образцу
// buildOverviewGraph в tests/overview.test.tsx. Кликабельность и фокус на
// настоящем полотне — в tests/modulesOverview.test.tsx; настоящий клик мышью
// (jsdom не делает hit-testing) — e2e задачи process-map-9mn.21.
//
// ФИКСТУРА НЕ РАЗЛИЧАЕТ ДВА ПОРЯДКА. У трёхуровневой фикстуры порядок массива
// map.modules совпадает с порядком номеров (1, 2, 4), и раскладка «по индексу»
// неотличима на ней от раскладки «по номеру». Поэтому рядом с ней — вариант с
// ПЕРЕСТАВЛЕННЫМ МАССИВОМ: номера те же, порядок документа обратный. На нём
// расходятся обе ошибки, которые здесь стерегутся: карточки по номеру и
// «обратная связь» по номеру (урок бага wuv — признак обратного ребра и
// раскладка обязаны читать один и тот же порядок). Вариант валиден — это
// проверяется, а не предполагается: validateIntegrity упорядочивает блоки
// этапов по module.number, а не по месту модуля в массиве.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  buildModulesGraph,
  type ModulesNode,
} from '../src/components/ModulesOverview/modulesGraph';
import {
  INTERACTIVE_NODE_STYLE,
  LANE_IN_ID,
  LANE_OUT_ID,
  SYSTEMS_BADGE_ID,
  systemNodeId,
} from '../src/components/Overview/overviewGraph';
import { hasModules, type MapWithModules } from '../src/data/modules';
import { validateIntegrity } from '../src/data/schema';
import { ru } from '../src/i18n/ru';
import {
  EDGE_LABEL_WRAP_MAX_WIDTH,
  MODULE_NODE_SIZE,
  MODULE_NODE_SIZE_COMPACT,
  STAGE_NODE_SIZE_COMPACT,
} from '../src/theme/sizes';
import {
  LANE_FPA,
  MODULE_DEMAND,
  MODULE_EDGE_LABEL,
  MODULE_IDS,
  MODULE_PRODUCTION,
  MODULE_SUPPLY,
  SYSTEM_OUTSIDE_IO,
  SYSTEM_OUTSIDE_IO_2,
  parseThreeLevelProcessMap,
} from './fixtures/three-level-process';

function fixture(): MapWithModules {
  return parseThreeLevelProcessMap();
}

/** Модули в ОБРАТНОМ порядке массива; номера и всё остальное — как в фикстуре. */
function reversedModules(): MapWithModules {
  const map = fixture();
  return { ...map, modules: [...map.modules].reverse() };
}

function modulesOf(nodes: readonly ModulesNode[]): ModulesNode[] {
  return nodes.filter((node) => node.type === 'module');
}

/** id карточек модулей слева направо — по координате, а не по месту в массиве узлов. */
function leftToRight(nodes: readonly ModulesNode[]): string[] {
  return [...modulesOf(nodes)].sort((a, b) => a.position.x - b.position.x).map((node) => node.id);
}

function nodeById(nodes: readonly ModulesNode[], id: string): ModulesNode {
  const node = nodes.find((candidate) => candidate.id === id);
  if (node === undefined) {
    throw new Error(`На полотне нет узла "${id}"`);
  }
  return node;
}

describe('buildModulesGraph: карточки', () => {
  it('ровно столько узлов типа module, сколько модулей, и НИ ОДНОГО stage', () => {
    // Свой тип узла — это класс .react-flow__node-module. Под типом 'stage'
    // e2e/deep-link.spec.ts::waitForOverview (ждёт ровно четыре
    // .react-flow__node-stage) считал бы карточки модулей этапами и зеленел бы
    // не про то.
    const map = fixture();
    const { nodes } = buildModulesGraph(map, true);

    expect(modulesOf(nodes).map((node) => node.id)).toEqual(map.modules.map((m) => m.id));
    expect(nodes.filter((node) => (node.type as string) === 'stage')).toHaveLength(0);
  });

  it('карточка несёт модуль целиком и размер из sizes.ts', () => {
    const map = fixture();
    const { nodes } = buildModulesGraph(map, true);

    for (const module of map.modules) {
      const node = nodeById(nodes, module.id);
      expect(node.data).toEqual({ module, compact: false });
      expect({ width: node.width, height: node.height }).toEqual(MODULE_NODE_SIZE);
    }
  });

  it('слева направо — порядок массива map.modules (у фикстуры он совпадает с номерами)', () => {
    const map = fixture();
    expect(leftToRight(buildModulesGraph(map, true).nodes)).toEqual(MODULE_IDS);
  });

  it('переставленный массив переставляет карточки — номер модуля порядок не задаёт', () => {
    const map = reversedModules();
    expect(validateIntegrity(map), 'вариант обязан оставаться валидной картой').toEqual([]);
    // Предпосылка: у варианта порядок массива расходится с порядком номеров.
    const byNumber = [...map.modules].sort((a, b) => a.number - b.number).map((m) => m.id);
    const byArray = map.modules.map((m) => m.id);
    expect(byArray).not.toEqual(byNumber);

    expect(leftToRight(buildModulesGraph(map, true).nodes)).toEqual(byArray);
  });

  it('все карточки в одном ряду и не накладываются; зазор вмещает подпись-артефакт', () => {
    for (const compact of [false, true]) {
      const size = compact ? MODULE_NODE_SIZE_COMPACT : MODULE_NODE_SIZE;
      const cards = [...modulesOf(buildModulesGraph(fixture(), true, compact).nodes)].sort(
        (a, b) => a.position.x - b.position.x,
      );
      expect(new Set(cards.map((card) => card.position.y)).size).toBe(1);
      for (let index = 1; index < cards.length; index += 1) {
        const previous = cards[index - 1] as ModulesNode;
        const current = cards[index] as ModulesNode;
        const gap = current.position.x - (previous.position.x + size.width);
        // Подпись связи соседей встаёт в середину зазора; уже её ширины — и она
        // ляжет на обе карточки.
        expect(gap).toBeGreaterThan(EDGE_LABEL_WRAP_MAX_WIDTH);
      }
    }
  });

  it('карточки кликабельны: у обёртки события мыши возвращены стилем', () => {
    // React Flow 12 ставит обёртке pointer-events: none, когда все флаги
    // интерактивности узла выключены, — карточка молча перестаёт кликаться.
    for (const node of modulesOf(buildModulesGraph(fixture(), true).nodes)) {
      expect(node.style).toBe(INTERACTIVE_NODE_STYLE);
      expect(node.draggable).toBe(false);
      expect(node.selectable).toBe(false);
      expect(node.connectable).toBe(false);
      // Фокус несёт <button> карточки, а не обёртка.
      expect(node.focusable).toBe(false);
    }
  });

  it('компактный режим рисуется: карточки на месте и компактного размера', () => {
    const map = fixture();
    const { nodes } = buildModulesGraph(map, true, true);

    const cards = modulesOf(nodes);
    expect(cards.map((node) => node.id)).toEqual(MODULE_IDS);
    for (const node of cards) {
      expect({ width: node.width, height: node.height }).toEqual(MODULE_NODE_SIZE_COMPACT);
      expect(node.data).toMatchObject({ compact: true });
    }
  });
});

describe('buildModulesGraph: полоса FP&A', () => {
  it('полоса map.lanes — свой тип moduleLane, подпись из данных, на всю ширину под карточками', () => {
    const map = fixture();
    const { nodes } = buildModulesGraph(map, true);
    const band = nodeById(nodes, LANE_FPA);
    const lane = map.lanes?.[0];

    expect(band.type).toBe('moduleLane');
    expect(band.data).toEqual({ title: lane?.title });

    const cards = modulesOf(nodes);
    const cardsBottom = Math.max(...cards.map((card) => card.position.y + (card.height ?? 0)));
    const cardsLeft = Math.min(...cards.map((card) => card.position.x));
    const cardsRight = Math.max(...cards.map((card) => card.position.x + (card.width ?? 0)));
    const bandWidth = Number(band.style?.width);

    expect(band.position.y).toBeGreaterThan(cardsBottom);
    expect(band.position.x).toBeLessThanOrEqual(cardsLeft);
    expect(band.position.x + bandWidth).toBeGreaterThanOrEqual(cardsRight);
  });

  it('полоса НЕ интерактивна: без стиля-возврата событий, без фокуса, не в цепочке', () => {
    // Без INTERACTIVE_NODE_STYLE React Flow сам выключает обёртке
    // pointer-events — ровно то, что полосе нужно. Стиль «как у карточек»
    // сделал бы её мишенью для мыши.
    const { nodes, edges } = buildModulesGraph(fixture(), true);
    const band = nodeById(nodes, LANE_FPA);

    expect(band.style).not.toBe(INTERACTIVE_NODE_STYLE);
    expect(band.style?.pointerEvents).toBeUndefined();
    expect(band.focusable).toBe(false);
    expect(band.selectable).toBe(false);
    expect(band.draggable).toBe(false);
    expect(band.connectable).toBe(false);
    // Не звено цепочки: ни одно ребро не касается полосы.
    expect(edges.filter((edge) => edge.source === LANE_FPA || edge.target === LANE_FPA)).toEqual(
      [],
    );
  });

  it('у полосы имя для скринридера — через роль group', () => {
    const map = fixture();
    const band = nodeById(buildModulesGraph(map, true).nodes, LANE_FPA);

    expect(band.ariaRole).toBe('group');
    expect(band.ariaLabel).toBe(ru.lane.ariaLabel(map.lanes?.[0]?.title ?? ''));
  });

  it('полоса идёт в массиве раньше карточек — React Flow рисует её под ними', () => {
    const { nodes } = buildModulesGraph(fixture(), true);
    const bandIndex = nodes.findIndex((node) => node.id === LANE_FPA);
    const firstCard = nodes.findIndex((node) => node.type === 'module');
    expect(bandIndex).toBeGreaterThanOrEqual(0);
    expect(bandIndex).toBeLessThan(firstCard);
  });

  /*
   * НЕСКОЛЬКО ПОЛОС. У фикстуры и у настоящей inplan полоса одна (FP&A), но
   * схема разрешает сколько угодно (LaneSchema, lanes.min(1)), и на одной
   * полосе раскладка «все в одну y» неотличима от стопки: без этого теста
   * выживала мутация, ставящая каждой полосе одну и ту же высоту (ревью 9mn.16).
   */
  it('полосы map.lanes идут стопкой: не накладываются, свимлейн выхода — под последней', () => {
    const map = fixture();
    map.lanes = [...(map.lanes ?? []), { id: 'hr', title: 'Кадровое планирование' }];
    expect(validateIntegrity(map), 'вариант обязан оставаться валидной картой').toEqual([]);

    const { nodes } = buildModulesGraph(map, true);
    const bands = nodes
      .filter((node) => node.type === 'moduleLane')
      .sort((a, b) => a.position.y - b.position.y);
    // Порядок стопки — порядок массива map.lanes.
    expect(bands.map((band) => band.id)).toEqual(map.lanes.map((lane) => lane.id));

    const bottomOf = (node: ModulesNode) => node.position.y + Number(node.style?.height);
    for (let index = 1; index < bands.length; index += 1) {
      const upper = bands[index - 1] as ModulesNode;
      const lower = bands[index] as ModulesNode;
      expect(lower.position.y, `${lower.id} под ${upper.id}`).toBeGreaterThanOrEqual(
        bottomOf(upper),
      );
    }
    const last = bands[bands.length - 1] as ModulesNode;
    expect(nodeById(nodes, LANE_OUT_ID).position.y).toBeGreaterThanOrEqual(bottomOf(last));
  });

  it('без map.lanes полос нет, и экран всё равно строится', () => {
    const map = fixture();
    delete map.lanes;
    const { nodes } = buildModulesGraph(map, true);
    expect(nodes.filter((node) => node.type === 'moduleLane')).toHaveLength(0);
    expect(modulesOf(nodes)).toHaveLength(map.modules.length);
  });
});

describe('buildModulesGraph: связи модулей', () => {
  it('связь модуль → модуль — ребро artifact с подписью-артефактом', () => {
    const { edges } = buildModulesGraph(fixture(), true);
    const first = edges.find((edge) => edge.id === 'module-edge-1');
    const second = edges.find((edge) => edge.id === 'module-edge-2');

    expect(first).toMatchObject({
      type: 'artifact',
      source: MODULE_DEMAND,
      target: MODULE_SUPPLY,
      label: MODULE_EDGE_LABEL,
    });
    expect(second).toMatchObject({
      type: 'artifact',
      source: MODULE_SUPPLY,
      target: MODULE_PRODUCTION,
      label: 'Страховые и целевые запасы',
    });
  });

  it('каждая связь уровня 1 доезжает с подписью данных', () => {
    const map = fixture();
    const { edges } = buildModulesGraph(map, true);
    for (const edge of map.moduleEdges ?? []) {
      expect(edges.find((candidate) => candidate.id === edge.id)?.label).toBe(edge.label);
    }
  });

  it('связь с соседом справа выходит справа и входит слева', () => {
    const { edges } = buildModulesGraph(fixture(), true);
    for (const id of ['module-edge-1', 'module-edge-2']) {
      const edge = edges.find((candidate) => candidate.id === id);
      expect(edge?.sourceHandle, id).toBe('right');
      expect(edge?.targetHandle, id).toBe('left');
    }
  });

  it('ОБРАТНАЯ связь по индексу массива ведётся снизу', () => {
    // Тот же module-edge-1 (demand → supply), но массив переставлен: demand
    // теперь ПРАВЕЕ supply. По номерам (1 → 2) связь прямая, по месту на
    // полотне — обратная, и решает место: с правого хэндла линия ушла бы
    // вправо от карточки, стоящей левее цели.
    const { edges } = buildModulesGraph(reversedModules(), true);
    const edge = edges.find((candidate) => candidate.id === 'module-edge-1');

    expect(edge?.sourceHandle, 'обратная связь обязана выходить снизу').toBe('bottom');
    expect(edge?.targetHandle).toBe('left');
  });

  /*
   * ВТОРОЕ НАПРАВЛЕНИЕ РАСХОЖДЕНИЯ. Тест выше ловит «по номеру прямая, по
   * индексу обратная». Обратный случай — «по индексу прямая к соседу справа,
   * по номеру обратная» — на нём не встречается: в переставленном массиве обе
   * связи фикстуры идут справа налево. Без этого теста выживала мутация,
   * добавляющая номер к индексу (`targetIndex === sourceIndex + 1 &&
   * number(source) < number(target)`) — правило обзора этапов «обратная или не
   * в ряд — снизу», перенесённое на уровень 1. Прямая связь соседей на валидной
   * карте рисовалась бы тогда петлёй снизу вместо отрезка через зазор (ревью
   * 9mn.16).
   */
  it('ПРЯМАЯ по индексу связь с соседом справа выходит справа, даже если по номеру обратная', () => {
    const map = reversedModules();
    // supply (номер 2, индекс 1) → demand (номер 1, индекс 2).
    map.moduleEdges = [
      ...(map.moduleEdges ?? []),
      {
        id: 'module-edge-back-by-number',
        source: MODULE_SUPPLY,
        target: MODULE_DEMAND,
        kind: 'process',
      },
    ];
    expect(validateIntegrity(map), 'вариант обязан оставаться валидной картой').toEqual([]);
    // Предпосылки: по индексу — соседи слева направо, по номеру — назад.
    const index = (id: string) => map.modules.findIndex((module) => module.id === id);
    const number = (id: string) => map.modules.find((module) => module.id === id)?.number ?? 0;
    expect(index(MODULE_DEMAND)).toBe(index(MODULE_SUPPLY) + 1);
    expect(number(MODULE_DEMAND)).toBeLessThan(number(MODULE_SUPPLY));

    const edge = buildModulesGraph(map, true).edges.find(
      (candidate) => candidate.id === 'module-edge-back-by-number',
    );
    expect(edge?.sourceHandle, 'связь с соседом справа обязана выходить справа').toBe('right');
    expect(edge?.targetHandle).toBe('left');
  });

  it('связь ЧЕРЕЗ модуль ведётся снизу — прямая прошла бы за промежуточной карточкой', () => {
    const map = fixture();
    map.moduleEdges = [
      ...(map.moduleEdges ?? []),
      { id: 'module-edge-skip', source: MODULE_DEMAND, target: MODULE_PRODUCTION, kind: 'process' },
    ];
    const edge = buildModulesGraph(map, true).edges.find((e) => e.id === 'module-edge-skip');
    expect(edge?.sourceHandle).toBe('bottom');
    expect(edge?.targetHandle).toBe('left');
  });

  it('вид линии решают концы: связь модулей остаётся артефактом при любом kind', () => {
    const map = fixture();
    map.moduleEdges = (map.moduleEdges ?? []).map((edge) =>
      edge.id === 'module-edge-1' ? { ...edge, kind: 'integration' as const } : edge,
    );
    const { edges } = buildModulesGraph(map, false);
    expect(edges.find((edge) => edge.id === 'module-edge-1')?.type).toBe('artifact');
  });
});

describe('buildModulesGraph: внешние системы', () => {
  it('концы-системы встают в свимлейны: источник BI — во вход, приёмник EPM — в выход', () => {
    const { nodes, edges } = buildModulesGraph(fixture(), true);

    const bi = nodeById(nodes, systemNodeId('in', SYSTEM_OUTSIDE_IO));
    const epm = nodeById(nodes, systemNodeId('out', SYSTEM_OUTSIDE_IO_2));
    expect(bi).toMatchObject({ type: 'system', parentId: LANE_IN_ID });
    expect(epm).toMatchObject({ type: 'system', parentId: LANE_OUT_ID });

    expect(edges.find((edge) => edge.id === 'module-edge-3')).toMatchObject({
      type: 'artifactIntegration',
      source: bi.id,
      target: MODULE_DEMAND,
      sourceHandle: 'bottom',
      targetHandle: 'top',
      label: 'Витрина продаж',
    });
    expect(edges.find((edge) => edge.id === 'module-edge-4')).toMatchObject({
      type: 'artifactIntegration',
      source: MODULE_PRODUCTION,
      target: epm.id,
      sourceHandle: 'bottom',
      targetHandle: 'top',
      label: 'Плановая себестоимость',
    });
  });

  it('свимлейн входа над карточками, свимлейн выхода — под полосой', () => {
    const { nodes } = buildModulesGraph(fixture(), true);
    const laneIn = nodeById(nodes, LANE_IN_ID);
    const laneOut = nodeById(nodes, LANE_OUT_ID);
    const band = nodeById(nodes, LANE_FPA);
    const cardTop = Math.min(...modulesOf(nodes).map((card) => card.position.y));

    expect(laneIn.position.y + Number(laneIn.style?.height)).toBeLessThan(cardTop);
    expect(laneOut.position.y).toBeGreaterThan(band.position.y + Number(band.style?.height));
  });

  it('полоса стоит на месте при любом положении тумблера интеграций', () => {
    const on = nodeById(buildModulesGraph(fixture(), true).nodes, LANE_FPA);
    const off = nodeById(buildModulesGraph(fixture(), false).nodes, LANE_FPA);
    expect(off.position).toEqual(on.position);
  });

  it('без интеграций: нет свимлейнов, систем и связей с ними, связи модулей остаются', () => {
    const map = fixture();
    const { nodes, edges } = buildModulesGraph(map, false);

    expect(nodes.filter((node) => node.type === 'lane')).toHaveLength(0);
    expect(nodes.filter((node) => node.type === 'system')).toHaveLength(0);
    expect(edges.filter((edge) => edge.type === 'artifactIntegration')).toHaveLength(0);

    expect(edges.map((edge) => edge.id)).toEqual(['module-edge-1', 'module-edge-2']);
    expect(modulesOf(nodes)).toHaveLength(map.modules.length);
    expect(nodes.filter((node) => node.type === 'moduleLane')).toHaveLength(1);
  });

  it('карта без концов-систем свимлейнов не получает вовсе (так будет у inplan)', () => {
    const map = fixture();
    map.moduleEdges = (map.moduleEdges ?? []).filter(
      (edge) => edge.source !== SYSTEM_OUTSIDE_IO && edge.target !== SYSTEM_OUTSIDE_IO_2,
    );
    const { nodes } = buildModulesGraph(map, true);
    expect(nodes.filter((node) => node.type === 'lane' || node.type === 'system')).toEqual([]);
  });

  it('фикстура годится для этих проверок: карта с модулями', () => {
    // Предпосылка всего файла, а не формальность: без модулей сборка уровня 1
    // не вызывается, и тип MapWithModules держал бы тесты на честном слове.
    expect(hasModules(fixture())).toBe(true);
  });
});

/*
 * КОМПАКТНЫЙ УРОВЕНЬ 1 (SPEC §4.5, задача process-map-9mn.19). Правила те же,
 * что у компактного обзора этапов (tests/compact.test.tsx): карточки 228×200,
 * свимлейны свёрнуты в одну строку-бейдж. Своё у уровня 1 — полоса FP&A: в
 * компакте она ОСТАЁТСЯ, тонкой и с тем же заголовком (решение владельца
 * process-map-9mn.31, п. 5). Геометрия подписей рёбер в компакте — в
 * tests/artifactLabelGeometry.test.ts, проводка режима до экрана — в
 * tests/modulesOverview.test.tsx.
 */
describe('buildModulesGraph: компактный режим (SPEC §4.5)', () => {
  function compactGraph(map: MapWithModules = fixture(), showIntegrations = true) {
    return buildModulesGraph(map, showIntegrations, true);
  }

  it('карточки модулей 228×200 — размер компактной карточки этапа', () => {
    const cards = modulesOf(compactGraph().nodes);
    expect(cards).toHaveLength(MODULE_IDS.length);
    for (const card of cards) {
      expect({ width: card.width, height: card.height }, card.id).toEqual({
        width: 228,
        height: 200,
      });
    }
    // Число — не своё: то же, что у компактной карточки этапа (sizes.ts).
    expect(MODULE_NODE_SIZE_COMPACT).toEqual(STAGE_NODE_SIZE_COMPACT);
  });

  it('карточки в одном ряду, слева направо по массиву, не накладываются', () => {
    const cards = [...modulesOf(compactGraph().nodes)].sort((a, b) => a.position.x - b.position.x);
    expect(cards.map((card) => card.id)).toEqual(MODULE_IDS);
    expect(new Set(cards.map((card) => card.position.y)).size).toBe(1);
    for (let index = 1; index < cards.length; index += 1) {
      const previous = cards[index - 1] as ModulesNode;
      const current = cards[index] as ModulesNode;
      expect(current.position.x, `${current.id} правее ${previous.id}`).toBeGreaterThan(
        previous.position.x + MODULE_NODE_SIZE_COMPACT.width,
      );
    }
  });

  it('свимлейнов и карточек систем нет — вместо них одна строка-бейдж', () => {
    const { nodes } = compactGraph();

    expect(nodes.filter((node) => node.type === 'lane')).toEqual([]);
    expect(nodes.some((node) => node.id === LANE_IN_ID || node.id === LANE_OUT_ID)).toBe(false);
    expect(nodes.filter((node) => node.type === 'system')).toEqual([]);

    const badges = nodes.filter((node) => node.type === 'systemsBadge');
    expect(badges.map((badge) => badge.id)).toEqual([SYSTEMS_BADGE_ID]);
  });

  it('строка-бейдж перечисляет концы-системы в порядке появления, без повторов', () => {
    const map = fixture();
    // Вторая связь с BI — уже приёмником: система в строке всё равно одна.
    map.moduleEdges = [
      ...(map.moduleEdges ?? []),
      {
        id: 'module-edge-bi-out',
        source: MODULE_SUPPLY,
        target: SYSTEM_OUTSIDE_IO,
        kind: 'integration',
      },
    ];
    expect(validateIntegrity(map), 'вариант обязан оставаться валидной картой').toEqual([]);

    const badge = nodeById(compactGraph(map).nodes, SYSTEMS_BADGE_ID);
    expect(badge.data).toEqual({ systems: [SYSTEM_OUTSIDE_IO, SYSTEM_OUTSIDE_IO_2] });
  });

  it('строка-бейдж стоит над карточками и с их левого края', () => {
    const { nodes } = compactGraph();
    const badge = nodeById(nodes, SYSTEMS_BADGE_ID);
    const cardTop = Math.min(...modulesOf(nodes).map((card) => card.position.y));
    const cardsLeft = Math.min(...modulesOf(nodes).map((card) => card.position.x));
    // Высоты у строки в графе нет (она меряется по содержимому), поэтому
    // проверяется запас под её высоту из токена, которым её задаёт CSS.
    const token = /--pm-systems-badge-height:\s*(\d+)px/.exec(
      readFileSync('src/theme/tokens.css', 'utf8'),
    );
    const badgeHeight = Number(token?.[1]);
    expect(badgeHeight, 'токен --pm-systems-badge-height не найден').toBeGreaterThan(0);
    expect(badge.position.y + badgeHeight).toBeLessThan(cardTop);
    expect(badge.position.x).toBe(cardsLeft);
  });

  it('связи с системами в компакте не рисуются, связи модулей остаются', () => {
    const { edges } = compactGraph();
    expect(edges.filter((edge) => edge.type === 'artifactIntegration')).toEqual([]);
    expect(edges.map((edge) => edge.id)).toEqual(['module-edge-1', 'module-edge-2']);
  });

  it('выключенный тумблер убирает и строку-бейдж', () => {
    const { nodes } = compactGraph(fixture(), false);
    expect(nodes.filter((node) => node.type === 'systemsBadge')).toEqual([]);
  });

  it('карта без концов-систем строки-бейджа не получает (так будет у inplan)', () => {
    const map = fixture();
    map.moduleEdges = (map.moduleEdges ?? []).filter(
      (edge) => edge.source !== SYSTEM_OUTSIDE_IO && edge.target !== SYSTEM_OUTSIDE_IO_2,
    );
    expect(compactGraph(map).nodes.filter((node) => node.type === 'systemsBadge')).toEqual([]);
  });

  it('полоса FP&A остаётся: тот же тип, тот же заголовок, тонкая', () => {
    const map = fixture();
    const band = nodeById(compactGraph(map).nodes, LANE_FPA);
    const normal = nodeById(buildModulesGraph(map, true).nodes, LANE_FPA);

    expect(band.type).toBe('moduleLane');
    expect(band.data).toEqual({ title: map.lanes?.[0]?.title });
    expect(band.ariaRole).toBe('group');
    expect(band.ariaLabel).toBe(normal.ariaLabel);
    // Тонкая — ниже обычной, но не схлопнута: заголовок обязан поместиться.
    expect(Number(band.style?.height)).toBeLessThan(Number(normal.style?.height));
    expect(Number(band.style?.height)).toBeGreaterThan(0);
  });

  it('полоса — под карточками, на всю ширину ряда', () => {
    const { nodes } = compactGraph();
    const band = nodeById(nodes, LANE_FPA);
    const cards = modulesOf(nodes);
    const cardsBottom = Math.max(...cards.map((card) => card.position.y + (card.height ?? 0)));
    const cardsLeft = Math.min(...cards.map((card) => card.position.x));
    const cardsRight = Math.max(...cards.map((card) => card.position.x + (card.width ?? 0)));

    expect(band.position.y).toBeGreaterThan(cardsBottom);
    expect(band.position.x).toBeLessThanOrEqual(cardsLeft);
    expect(band.position.x + Number(band.style?.width)).toBeGreaterThanOrEqual(cardsRight);
  });

  it('полоса стоит на месте при любом положении тумблера и в компакте', () => {
    const on = nodeById(compactGraph(fixture(), true).nodes, LANE_FPA);
    const off = nodeById(compactGraph(fixture(), false).nodes, LANE_FPA);
    expect(off.position).toEqual(on.position);
    expect(off.style).toEqual(on.style);
  });

  it('несколько полос в компакте тоже идут стопкой и не накладываются', () => {
    const map = fixture();
    map.lanes = [...(map.lanes ?? []), { id: 'hr', title: 'Кадровое планирование' }];
    const bands = compactGraph(map)
      .nodes.filter((node) => node.type === 'moduleLane')
      .sort((a, b) => a.position.y - b.position.y);
    expect(bands.map((band) => band.id)).toEqual([LANE_FPA, 'hr']);
    const [upper, lower] = bands as [ModulesNode, ModulesNode];
    expect(lower.position.y).toBeGreaterThanOrEqual(upper.position.y + Number(upper.style?.height));
  });

  it('обычный режим не задет: свимлейны на месте, строки-бейджа нет', () => {
    const { nodes } = buildModulesGraph(fixture(), true);
    expect(nodes.some((node) => node.id === LANE_IN_ID)).toBe(true);
    expect(nodes.some((node) => node.id === LANE_OUT_ID)).toBe(true);
    expect(nodes.filter((node) => node.type === 'systemsBadge')).toEqual([]);
  });
});
