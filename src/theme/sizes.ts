// Единственный источник истины по размерам узлов и хрома (SPEC §4.1, §4.2, §4.5).
//
// Зачем модуль, а не одни только CSS-переменные: числа нужны трём потребителям
// с несовместимыми форматами —
//   · CSS-модулям компонентов — как `var(--pm-*)` в px;
//   · React Flow (src/components/Overview/overviewGraph.ts, StageDetail) —
//     как числа в `node.width`/`node.height`/`position`;
//   · dagre (scripts/layout.ts) — как числа в `graph.setNode({ width, height })`.
//
// Поэтому числа живут здесь, а токены в src/theme/tokens.css обязаны им
// соответствовать. Соответствие не «на честном слове»: карта SIZE_TOKENS ниже
// связывает имя токена с константой, а tests/sizes.test.ts парсит tokens.css и
// падает при любом расхождении. Правка одного числа здесь — и вёрстка, и
// раскладка, и тест меняются согласованно; правка только токена — красный тест.
//
// Модуль импортируется ядром раскладки (src/layout/stageLayout.ts), а его в
// свою очередь запускает Node через `--experimental-strip-types`: здесь
// допустимы только стираемые конструкции (никаких enum и namespace) и никаких
// импортов рантайм-значений извне.

export interface NodeSize {
  readonly width: number;
  readonly height: number;
}

/**
 * StageNode, уровень 1 (SPEC §4.1).
 *
 * Высота 232, а не 210 из артборда A1: лимит «Ключевых выходов» поднят с трёх
 * до четырёх (process-map-24i), потому что презентация перечисляет у этапа 3
 * ровно четыре опубликованных плана. Четвёртая строка в 210 не влезала —
 * у карточки с двухстрочным заголовком запас под списком был -1 px, и пункт
 * оставался в дереве доступности, но не на экране. Ширина 274 из макета.
 */
export const STAGE_NODE_SIZE: NodeSize = { width: 274, height: 232 };

/** StageNode в компактном режиме, высота контейнера < config.compactHeight (SPEC §4.5). */
export const STAGE_NODE_SIZE_COMPACT: NodeSize = { width: 228, height: 200 };

/**
 * Карточка модуля — уровень 1 ТРЁХУРОВНЕВОЙ карты (узел 'module', задача
 * process-map-9mn.16).
 *
 * ВЫВЕДЕНА из STAGE_NODE_SIZE, а не переписана числами. Артборда уровня 1 в
 * design/ нет, а ModuleSchema прямо говорит «карточка уровня 1 устроена как
 * карточка этапа»: те же блоки (номер, подпись, название, до четырёх ключевых
 * выходов) требуют той же площади. Литералы 274×232 здесь молча разошлись бы
 * с этапом при первой же правке его размера (прецедент — DETAIL_NODE_SIZE ниже).
 *
 * Своя константа всё-таки нужна: из неё считают раскладку modulesGraph.ts и
 * вёрстка ModuleCard (токены --pm-module-node-*), и когда у уровня 1 появится
 * свой макет, правка коснётся одной строки здесь, а не карточки этапа.
 */
export const MODULE_NODE_SIZE: NodeSize = {
  width: STAGE_NODE_SIZE.width,
  height: STAGE_NODE_SIZE.height,
};

/**
 * Карточка модуля в компактном режиме (SPEC §4.5). Тот же довод: 228×200, как у
 * компактной карточки этапа. Доводку компактного уровня 1 (строка-бейдж,
 * тонкая полоса) делает задача process-map-9mn.19.
 */
export const MODULE_NODE_SIZE_COMPACT: NodeSize = {
  width: STAGE_NODE_SIZE_COMPACT.width,
  height: STAGE_NODE_SIZE_COMPACT.height,
};

/**
 * Наибольшая ширина ПЕРЕНОСИМОЙ подписи ребра — артефакта между модулями
 * уровня 1 («Итоговый неограниченный прогноз», process-map-9mn.16).
 *
 * Число здесь, а не только в токене, потому что от него зависит раскладка:
 * зазор между карточками модулей (modulesGraph.ts) обязан вмещать подпись,
 * иначе она легла бы на соседние карточки. Подпись этапов («Да»/«Нет») своей
 * ширины в раскладке не имеет и остаётся токеном --pm-edge-label-max-width.
 *
 * 104 — ОЦЕНКА, а не замер макета (макета уровня 1 нет): самое длинное слово
 * известных артефактов, «неограниченный», — 14 знаков кегля 11 px, около 6 px
 * на знак, плюс подложка по 4 px с каждой стороны и запас. box-sizing в
 * проекте border-box (global.css), поэтому подложка входит в эту ширину. Слово
 * длиннее ширины не вылезает за подложку, а рвётся посреди слова
 * (overflow-wrap в EdgeLabel.module.css). Замер на реальной карте — задача
 * process-map-9mn.19 (визуальная доводка уровня 1).
 */
export const EDGE_LABEL_WRAP_MAX_WIDTH = 104;

/** Карточка внешней системы в свимлейне уровня 1 (макет A1). */
export const IO_NODE_SIZE: NodeSize = { width: 200, height: 40 };

/**
 * StepNode, уровень 2 (SPEC §4.2). IntegrationNode и WarningNode собственного
 * размера в SPEC не имеют и рисуются той же карточкой шага.
 */
export const STEP_NODE_SIZE: NodeSize = { width: 318, height: 52 };

/** DataNode, уровень 2 (SPEC §4.2). */
export const DATA_NODE_SIZE: NodeSize = { width: 200, height: 56 };

/**
 * DetailNode — подробность под шагом, уровень 2 (NodeType 'detail',
 * process-map-9mn.32).
 *
 * РАЗМЕР ВРЕМЕННЫЙ. Ширина — ширина карточки шага: подробность стоит под
 * своим шагом и шире него быть не должна. Поэтому она ВЫВЕДЕНА из
 * STEP_NODE_SIZE, а не переписана числом: литерал 318 здесь молча разошёлся
 * бы с шагом при первой же правке его ширины. Высота 170 — запас под
 * несколько абзацев без обрезки (текст не клампится, в отличие от шага).
 *
 * Итоговые числа по макету назначит задача process-map-9mn.26. Раскладка
 * (stageLayout.ts, stageGraph.ts) берёт их отсюда сама, а токены
 * --pm-detail-node-* в tokens.css — это вторая запись тех же чисел, и править
 * её нужно руками: расхождение ловит tests/sizes.test.ts (SIZE_TOKENS).
 */
export const DETAIL_NODE_SIZE: NodeSize = { width: STEP_NODE_SIZE.width, height: 170 };

/** Drawer (SPEC §4.3). */
export const DRAWER_WIDTH = 360;

/** Шапка: обычная (SPEC §4.1) и компактная (SPEC §4.5). */
export const HEADER_HEIGHT = 52;
export const HEADER_HEIGHT_COMPACT = 44;

/**
 * Имя CSS-переменной в src/theme/tokens.css → её числовое значение в px.
 * Сторож tests/sizes.test.ts требует, чтобы каждый токен из этой карты
 * присутствовал в tokens.css ровно с этим значением.
 */
export const SIZE_TOKENS: Readonly<Record<string, number>> = {
  '--pm-stage-node-width': STAGE_NODE_SIZE.width,
  '--pm-stage-node-height': STAGE_NODE_SIZE.height,
  '--pm-stage-node-width-compact': STAGE_NODE_SIZE_COMPACT.width,
  '--pm-stage-node-height-compact': STAGE_NODE_SIZE_COMPACT.height,
  '--pm-module-node-width': MODULE_NODE_SIZE.width,
  '--pm-module-node-height': MODULE_NODE_SIZE.height,
  '--pm-module-node-width-compact': MODULE_NODE_SIZE_COMPACT.width,
  '--pm-module-node-height-compact': MODULE_NODE_SIZE_COMPACT.height,
  '--pm-edge-label-wrap-max-width': EDGE_LABEL_WRAP_MAX_WIDTH,
  '--pm-io-node-width': IO_NODE_SIZE.width,
  '--pm-io-node-height': IO_NODE_SIZE.height,
  '--pm-step-node-width': STEP_NODE_SIZE.width,
  '--pm-step-node-height': STEP_NODE_SIZE.height,
  '--pm-data-node-width': DATA_NODE_SIZE.width,
  '--pm-data-node-height': DATA_NODE_SIZE.height,
  '--pm-detail-node-width': DETAIL_NODE_SIZE.width,
  '--pm-detail-node-height': DETAIL_NODE_SIZE.height,
  '--pm-drawer-width': DRAWER_WIDTH,
  '--pm-header-height': HEADER_HEIGHT,
  '--pm-header-height-compact': HEADER_HEIGHT_COMPACT,
};
