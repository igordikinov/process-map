// Сборка узлов и рёбер уровня 1 ТРЁХУРОВНЕВОЙ карты: карточки модулей, их
// связи и полосы (эпик M8, задача process-map-9mn.16). Чистая функция без
// React — зеркало overviewGraph.ts, и по той же причине: вся раскладка
// проверяется unit-тестами без рендера полотна (tests/modulesGraph.test.ts).
//
// ЧТО НА ПОЛОТНЕ, сверху вниз:
//   1. свимлейн «Внешние системы — вход» — системы-ИСТОЧНИКИ связей moduleEdges;
//   2. карточки модулей — ОДНИМ РЯДОМ, в порядке МАССИВА map.modules;
//   3. полосы map.lanes (сегодня одна — FP&A) — на всю ширину, под карточками;
//   4. свимлейн «Внешние системы — выход» — системы-ПРИЁМНИКИ.
// Свимлейнов у настоящей карты inplan не будет вовсе (у её связей уровня 1 нет
// концов-систем); их приносит фикстура (BI, EPM), и экран обязан рисовать и
// такой документ — схема его разрешает.
//
// КОМПАКТНЫЙ РЕЖИМ (SPEC §4.5, process-map-9mn.19) — тот же экран, свёрнутый
// по правилам компактного обзора этапов (артборд A4):
//   · карточки модулей 228×200, ряд начинается там же, где ряд компактных
//     этапов;
//   · свимлейны заменены одной строкой-бейджем «Внешние системы …» — тем же
//     узлом SystemsBadge, что на компактном обзоре этапов;
//   · полоса FP&A ОСТАЁТСЯ, но тонкой и с тем же заголовком (решение
//     владельца process-map-9mn.31, п. 5): она описывает процесс, а не
//     интеграции, и свёртке вместе со свимлейнами не подлежит.
//
// Координаты считаются здесь, а не берутся из данных, — ровно как у обзора
// этапов (шапка overviewGraph.ts): у Module поля position нет. Макета уровня 1
// в design/ нет, поэтому числа ниже — продолжение геометрии обзора этапов
// (те же отступы, та же высота ряда карточек), а не замер артборда.
import type { Edge as FlowEdge, Node as FlowNode } from '@xyflow/react';
import type { MapWithModules } from '../../data/modules';
import { SystemCodeSchema, type SystemCode } from '../../data/schema';
import { ru } from '../../i18n/ru';
import {
  EDGE_LABEL_WRAP_MAX_WIDTH,
  IO_NODE_SIZE,
  MODULE_NODE_SIZE,
  MODULE_NODE_SIZE_COMPACT,
} from '../../theme/sizes';
import {
  ARTIFACT_EDGE_OFFSET,
  ARTIFACT_LABEL_MAX_HEIGHT,
} from '../edges/ArtifactEdge/artifactGeometry';
import { MODULE_HANDLE, type ModuleNodeType } from '../nodes/ModuleNode';
import { SYSTEM_HANDLE, type IntegrationNodeType } from '../nodes/IntegrationNode';
import type { LaneNodeData, LaneNodeType } from '../nodes/LaneNode';
import type { SystemsBadgeNodeType } from '../nodes/SystemsBadge';
import {
  collectSystems,
  INTERACTIVE_NODE_STYLE,
  LANE_IN_HEIGHT,
  LANE_IN_ID,
  LANE_IN_Y,
  LANE_OUT_HEIGHT,
  LANE_OUT_ID,
  LANE_PADDING_X,
  LANE_RIGHT_GAP,
  LANE_X,
  systemLaneNodes,
  systemNodeId,
  SYSTEMS_BADGE_ID,
} from '../Overview/overviewGraph';

/**
 * Полоса уровня 1 (map.lanes): тот же LaneNode, СВОЙ тип узла.
 *
 * Тип попадает в класс `.react-flow__node-<type>` (прецедент — lane/flowLane в
 * LaneNode.tsx): под типом 'lane' полоса FP&A попала бы в один счётчик со
 * свимлейнами внешних систем, а появляются они по разным условиям — свимлейны
 * пропадают вместе с интеграциями, полоса остаётся.
 */
export type ModuleLaneNodeType = FlowNode<LaneNodeData, 'moduleLane'>;

export type ModulesNode =
  ModuleNodeType | ModuleLaneNodeType | LaneNodeType | IntegrationNodeType | SystemsBadgeNodeType;

export interface ModulesGraph {
  nodes: ModulesNode[];
  edges: FlowEdge[];
}

// ───────────────────────────── геометрия ─────────────────────────────

/** Левый край и верх ряда карточек — те же, что у ряда этапов (overviewGraph.ts). */
const MODULE_X0 = 48;
const MODULE_Y = 200;

/**
 * Запас между краем карточки и подписью ребра — место под стрелку, чтобы
 * подпись не легла на наконечник.
 */
const MODULE_EDGE_CLEARANCE = 16;

/**
 * Зазор между карточками модулей ВЫВЕДЕН из ширины подписи, а не взят у этапов
 * (там 30). Связь соседних модулей — прямая с правого края на левый, и её
 * подпись-артефакт встаёт ровно в середину зазора. При 30 px «Итоговый
 * неограниченный прогноз» лёг бы на обе соседние карточки. Подпись переносится
 * по строкам (EdgeLabel wrap), поэтому зазору достаточно её наибольшей ширины.
 */
const MODULE_GAP = EDGE_LABEL_WRAP_MAX_WIDTH + MODULE_EDGE_CLEARANCE * 2;

/**
 * Просвет между подписью ребра, ведомого снизу, и полосой FP&A под ней.
 *
 * Не меньше прежнего: до process-map-9mn.19 трёхстрочная подпись кончалась в
 * 13.5 px над полосой, и задача сдвинула подпись вниз, не отняв у полосы ни
 * пикселя (сторож — tests/artifactLabelGeometry.test.ts).
 */
const BAND_LABEL_CLEARANCE = 14;

/**
 * Промежуток между низом карточек и первым элементом под ними (полосой или
 * свимлейном выхода). ОДИН для обоих режимов: подпись-артефакт в компактном
 * режиме не меньше, и места под неё нужно столько же.
 *
 * Шире, чем у обзора этапов (там 42), из-за ребра, ведомого СНИЗУ (обратная
 * связь, связь через модуль): его горизонтальный отрезок лежит на
 * ARTIFACT_EDGE_OFFSET ниже карточек, и подпись-артефакт центрируется на этом
 * отрезке (artifactGeometry.ts в ArtifactEdge, там же — почему отступ
 * подобран под подпись).
 * Под карточками, таким образом, помещаются: отрезок до подписи, нижняя
 * половина подписи высотой ARTIFACT_LABEL_MAX_HEIGHT и просвет до полосы.
 *
 * Выведено из констант, а не записано числом: при прежнем литерале (56)
 * правка отступа ребра молча положила бы подпись на полосу. Math.ceil на
 * половине высоты — тот же, что в ARTIFACT_EDGE_OFFSET: он же поглощает
 * полпикселя хэндла (хэндл 1 px стоит серединой на рамке карточки, и путь
 * начинается на 0.5 px ниже её низа).
 */
const BELOW_CARDS_GAP =
  ARTIFACT_EDGE_OFFSET + Math.ceil(ARTIFACT_LABEL_MAX_HEIGHT / 2) + BAND_LABEL_CLEARANCE;

/**
 * Высота полосы map.lanes: в ней только подпись (LaneNode рисует заголовок у
 * верхнего края), содержимого у полосы нет — поэтому она ниже свимлейнов.
 */
const MODULE_LANE_HEIGHT = 40;

// ─────────── компактный режим (SPEC §4.5, process-map-9mn.19) ───────────
//
// Числа — те же, что у компактного обзора этапов (overviewGraph.ts, артборд
// A4): экраны уровня 1 и уровня 2 в низком фрейме обязаны читаться как одна
// система, как и в обычном режиме. Константы там не экспортируются, а файл
// обзора этапов эта задача не трогает, поэтому числа повторены здесь с
// ссылкой на источник.

/** Левый край ряда (A4: left 20) — тот же, что у строки-бейджа над ним. */
const MODULE_X0_COMPACT = 20;
/** Верх ряда (A4: top 96) — под строкой-бейджем с запасом, как у этапов. */
const MODULE_Y_COMPACT = 96;
/** Строка-бейдж вместо свимлейнов (A4: left 20, top 16). */
const SYSTEMS_BADGE_X = MODULE_X0_COMPACT;
const SYSTEMS_BADGE_Y = 16;

/**
 * ТОНКАЯ полоса FP&A (решение владельца process-map-9mn.31, п. 5: полоса в
 * компакте остаётся, тонкой и с тем же заголовком). В ней только заголовок, и
 * 28 — наименьшая высота, при которой его строка целиком внутри рамки:
 * LaneNode ставит заголовок на --pm-space-6 (6 px) от внутреннего края рамки
 * в 1 px, строка наследует line-height 20 px (global.css), то есть кончается
 * на 27 px, и нижняя рамка занимает 28-й. Буквы (кегль 10.5, прописные)
 * внутри строки кончаются заметно выше её низа, так что под ними остаётся
 * воздух. Сам LaneNode не меняется: высоту полосы задаёт узел, а не CSS.
 */
const MODULE_LANE_HEIGHT_COMPACT = 28;

/** Промежуток между соседними полосами и между последней полосой и свимлейном выхода. */
const STACK_GAP = 16;

/** Карточка системы — та же, что в свимлейнах обзора этапов. */
const IO_WIDTH = IO_NODE_SIZE.width;

// ───────────────────────────── сборка ─────────────────────────────

/** Система ли это — по перечислению схемы, а не «не модуль». */
function asSystemCode(value: string): SystemCode | undefined {
  const parsed = SystemCodeSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

/**
 * @param map              карта С МОДУЛЯМИ (hasModules(map) === true): экран
 *                         модулей монтируется только для неё, и тип не даёт
 *                         позвать сборку для двухуровневой карты.
 * @param showIntegrations toggle из store (SPEC §4.6): false убирает
 *                         свимлейны, карточки систем и связи с системами.
 *                         Карточки модулей, их связи и полосы остаются — они
 *                         описывают сам процесс, а не интеграции.
 * @param compact          SPEC §4.5 (process-map-9mn.19): карточки 228×200,
 *                         строка-бейдж вместо свимлейнов, тонкая полоса FP&A.
 */
export function buildModulesGraph(
  map: MapWithModules,
  showIntegrations: boolean,
  compact = false,
): ModulesGraph {
  const cardSize = compact ? MODULE_NODE_SIZE_COMPACT : MODULE_NODE_SIZE;
  // Зазор между карточками в компакте ПРЕЖНИЙ: он выведен из ширины подписи
  // (MODULE_GAP), а подпись в низком фрейме не уже.
  const step = cardSize.width + MODULE_GAP;
  const moduleCount = map.modules.length;
  const x0 = compact ? MODULE_X0_COMPACT : MODULE_X0;
  const y0 = compact ? MODULE_Y_COMPACT : MODULE_Y;
  const bandHeight = compact ? MODULE_LANE_HEIGHT_COMPACT : MODULE_LANE_HEIGHT;

  // ПОРЯДОК — ИНДЕКС В МАССИВЕ map.modules, а не module.number. Номера модулей
  // законно идут с дырой (1, 2, 4: карта берёт пять модулей презентации из
  // восьми), и порядок документа — единственный источник, который не надо
  // выводить. Тот же индекс ниже решает, какая связь обратная: урок бага wuv —
  // «обратное» по одному признаку, а раскладка по другому расходятся, и ребро
  // ведётся справа на карточку, стоящую СЛЕВА.
  const moduleIndex = new Map(map.modules.map((module, index) => [module.id, index]));

  const contentRight = x0 + (moduleCount - 1) * step + cardSize.width;
  // Ширина полос. В обычном режиме — ширина свимлейнов: три рамки выровнены,
  // как на обзоре этапов. В компактном свимлейнов нет, и полоса идёт ровно под
  // рядом карточек — от левого края первой до правого края последней: её левый
  // край совпадает с краем ряда и строки-бейджа (обе с x = 20), и выступ
  // вправо был бы единственным несимметричным краем на полотне.
  const laneWidth = Math.max(contentRight + LANE_RIGHT_GAP - LANE_X, IO_WIDTH + LANE_PADDING_X * 2);
  const bandX = compact ? x0 : LANE_X;
  const bandWidth = compact ? contentRight - x0 : laneWidth;
  const belowCardsY = y0 + cardSize.height + BELOW_CARDS_GAP;
  const lanes = map.lanes ?? [];
  // Свимлейн выхода — ПОСЛЕ полос, а не между ними и карточками: полоса стоит
  // на месте при любом положении тумблера интеграций. Поставь свимлейн выше, и
  // полоса прыгала бы вверх-вниз при каждом переключении (fitView на тумблер не
  // перезапускается — RefitViewport слушает экран, модуль, режим и карту).
  const laneOutY = belowCardsY + lanes.length * (bandHeight + STACK_GAP);

  const nodes: ModulesNode[] = [];

  if (showIntegrations && compact) {
    // СТРОКА-БЕЙДЖ ВМЕСТО СВИМЛЕЙНОВ (SPEC §4.5) — тот же узел, что на
    // компактном обзоре этапов, и по той же причине узлом, а не плашкой: он
    // участвует в fitView и не перекрывает содержимое (шапка SystemsBadge.tsx).
    //
    // Состав — ПОРЯДОК ПОЯВЛЕНИЯ концов-систем в moduleEdges, одним списком
    // для обеих сторон обмена: строка обобщает оба свимлейна сразу, и
    // направления у свёрнутого списка нет. collectSystems снимает повторы —
    // система, стоящая и источником, и приёмником, в строке одна.
    //
    // ЧЕГО В КОМПАКТЕ НЕТ: карточек систем и рёбер к ним. Их место — свимлейны,
    // и со свимлейнами они уходят; конца у такой связи на полотне не остаётся.
    // Карточек систем под модулями, как под этапами на артборде A4, здесь нет
    // намеренно: под карточками модулей лежат подписи рёбер, ведомых снизу, и
    // полоса FP&A, и макета, который развёл бы их с карточками систем, у
    // уровня 1 нет. У настоящей карты inplan концов-систем на уровне 1 нет
    // вовсе, поэтому строки-бейджа у неё не будет ни в каком режиме.
    const systems = collectSystems(
      (map.moduleEdges ?? []).flatMap((edge) => {
        const source = asSystemCode(edge.source);
        const target = asSystemCode(edge.target);
        if (source !== undefined && moduleIndex.has(edge.target)) {
          return [{ system: source, label: '' }];
        }
        if (target !== undefined && moduleIndex.has(edge.source)) {
          return [{ system: target, label: '' }];
        }
        return [];
      }),
    );
    if (systems.length > 0) {
      nodes.push({
        id: SYSTEMS_BADGE_ID,
        type: 'systemsBadge',
        position: { x: SYSTEMS_BADGE_X, y: SYSTEMS_BADGE_Y },
        data: { systems: systems.map((item) => item.system) },
        // Ширина не задаётся: строка меряется по содержимому — как на
        // компактном обзоре этапов (overviewGraph.ts, SystemsBadge.tsx).
        draggable: false,
        selectable: false,
        connectable: false,
        focusable: false,
      });
    }
  }

  if (showIntegrations && !compact) {
    // Системы уровня 1 — концы moduleEdges, а не ExternalIO: реестра систем
    // уровня 1 в документе нет (комментарий к связям уровня 1 в
    // validateIntegrity). Подпись карточки пустая НАМЕРЕННО: артефакт уже стоит
    // подписью на самом ребре, и повторять его в карточке значило бы писать
    // одно и то же дважды на двух соседних объектах. Карточка показывает код.
    const inputs = collectSystems(
      (map.moduleEdges ?? []).flatMap((edge) => {
        const system = asSystemCode(edge.source);
        return system !== undefined && moduleIndex.has(edge.target) ? [{ system, label: '' }] : [];
      }),
    );
    const outputs = collectSystems(
      (map.moduleEdges ?? []).flatMap((edge) => {
        const system = asSystemCode(edge.target);
        return system !== undefined && moduleIndex.has(edge.source) ? [{ system, label: '' }] : [];
      }),
    );
    nodes.push(
      ...systemLaneNodes(
        [
          {
            id: LANE_IN_ID,
            title: ru.overview.laneIn,
            y: LANE_IN_Y,
            height: LANE_IN_HEIGHT,
            items: inputs,
            direction: 'in',
          },
          {
            id: LANE_OUT_ID,
            title: ru.overview.laneOut,
            y: laneOutY,
            height: LANE_OUT_HEIGHT,
            items: outputs,
            direction: 'out',
          },
        ],
        laneWidth,
      ),
    );
  }

  // Полосы map.lanes (решение владельца process-map-9mn.31, п. 5): сквозная
  // функция под модулями. НЕ ИНТЕРАКТИВНЫ — ни клика, ни фокуса, ни места в
  // цепочке модулей. Поэтому:
  //   · НИКАКОГО INTERACTIVE_NODE_STYLE. React Flow сам ставит обёртке
  //     pointer-events: none, когда у узла выключены все флаги
  //     интерактивности, — ровно то, что полосе нужно. Стиль, возвращающий
  //     события карточкам, сделал бы полосу мишенью для мыши, и клик по ней
  //     уходил бы не на полотно;
  //   · focusable: false — у полосы нет действия, и остановка Tab на ней была
  //     бы ложным обещанием клавиатуре;
  //   · имя всё же нужно — полоса сообщает, что под модулями идёт сквозная
  //     функция. Имя вешается ролью group (ru.lane: у узла без роли aria-label
  //     по ARIA 1.2 запрещён), через ariaRole/ariaLabel узла — React Flow
  //     кладёт их на обёртку, и сам LaneNode менять не нужно.
  // Идут в массиве раньше карточек: React Flow рисует узлы в порядке массива.
  // В компактном режиме полоса та же — тот же тип, заголовок и флаги, — меньше
  // только её высота и ширина (bandHeight, bandWidth выше): режим её сжимает,
  // но не убирает (решение владельца 9mn.31, п. 5).
  lanes.forEach((lane, index) => {
    nodes.push({
      id: lane.id,
      type: 'moduleLane',
      position: { x: bandX, y: belowCardsY + index * (bandHeight + STACK_GAP) },
      data: { title: lane.title },
      style: { width: bandWidth, height: bandHeight },
      ariaRole: 'group',
      ariaLabel: ru.lane.ariaLabel(lane.title),
      draggable: false,
      selectable: false,
      connectable: false,
      focusable: false,
    });
  });

  map.modules.forEach((module, index) => {
    nodes.push({
      id: module.id,
      type: 'module',
      position: { x: x0 + index * step, y: y0 },
      data: { module, compact },
      width: cardSize.width,
      height: cardSize.height,
      // Без этого стиля карточка молча не кликается: React Flow 12 ставит
      // обёртке pointer-events: none, когда все флаги интерактивности узла
      // выключены (подробно — у INTERACTIVE_NODE_STYLE в overviewGraph.ts).
      style: INTERACTIVE_NODE_STYLE,
      draggable: false,
      selectable: false,
      connectable: false,
      // Фокус несёт сам <button> карточки — как у карточки этапа.
      focusable: false,
    });
  });

  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges: FlowEdge[] = [];

  for (const edge of map.moduleEdges ?? []) {
    const sourceIndex = moduleIndex.get(edge.source);
    const targetIndex = moduleIndex.get(edge.target);
    const label = edge.label === undefined ? {} : { label: edge.label };

    // ВИД ЛИНИИ РЕШАЮТ КОНЦЫ, А НЕ edge.kind. На уровне 1 связь двух модулей —
    // всегда поток процесса (модуль системой не бывает), а связь с системой —
    // всегда интеграция: её карточка живёт в свимлейне, и тумблер интеграций
    // обязан убирать ребро вместе с этой карточкой. Опирайся мы на kind,
    // связь модулей с kind 'integration' пропала бы по тумблеру, хотя обе её
    // карточки остались на экране.
    if (sourceIndex !== undefined && targetIndex !== undefined) {
      // Справа выходит только связь с СОСЕДОМ СПРАВА. Всё остальное ведётся
      // снизу:
      //   · обратная связь (цель левее) — с правого хэндла путь разворачивался
      //     бы на той же высоте, что и прямые рёбра, прятался за карточками и
      //     торчал обрубком справа (process-map-3wh.17, тот же случай у этапов);
      //   · связь через модуль (цель правее, но не соседняя) — прямая прошла бы
      //     ЗА промежуточной карточкой, а подпись, которая рисуется поверх
      //     узлов, легла бы прямо на неё.
      // Обе проверки — по ИНДЕКСУ в массиве, тому же, что ставит карточки.
      const nextToTheRight = targetIndex === sourceIndex + 1;
      edges.push({
        id: edge.id,
        type: 'artifact',
        source: edge.source,
        target: edge.target,
        sourceHandle: nextToTheRight ? MODULE_HANDLE.right : MODULE_HANDLE.bottom,
        targetHandle: MODULE_HANDLE.left,
        ...label,
      });
      continue;
    }

    // В компактном режиме связи с системами не рисуются: их концы жили в
    // свимлейнах, а свимлейны свёрнуты в строку-бейдж (см. её сборку выше).
    if (!showIntegrations || compact) {
      continue;
    }

    // Один конец — код системы (validateIntegrity: хотя бы один конец —
    // модуль). Источник-система живёт в свимлейне входа, приёмник — выхода.
    // Конец, который не модуль и не система, до экрана не доезжает: такую
    // связь отвергает validateIntegrity, а здесь ей просто некуда встать.
    const sourceSystem = asSystemCode(edge.source);
    const targetSystem = asSystemCode(edge.target);
    const sourceId =
      sourceIndex !== undefined
        ? edge.source
        : sourceSystem === undefined
          ? undefined
          : systemNodeId('in', sourceSystem);
    const targetId =
      targetIndex !== undefined
        ? edge.target
        : targetSystem === undefined
          ? undefined
          : systemNodeId('out', targetSystem);
    if (
      sourceId === undefined ||
      targetId === undefined ||
      !nodeIds.has(sourceId) ||
      !nodeIds.has(targetId)
    ) {
      continue;
    }

    edges.push({
      id: edge.id,
      type: 'artifactIntegration',
      source: sourceId,
      target: targetId,
      sourceHandle: sourceIndex !== undefined ? MODULE_HANDLE.bottom : SYSTEM_HANDLE.bottom,
      targetHandle: targetIndex !== undefined ? MODULE_HANDLE.top : SYSTEM_HANDLE.top,
      ...label,
    });
  }

  return { nodes, edges };
}
