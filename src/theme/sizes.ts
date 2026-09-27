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
 * компактной карточки этапа. Остальная раскладка компактного уровня 1
 * (строка-бейдж вместо свимлейнов, тонкая полоса FP&A) — в modulesGraph.ts
 * (process-map-9mn.19): это координаты, а не размер карточки.
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
 * (overflow-wrap в EdgeLabel.module.css). Замер на реальной карте ждёт её
 * данных: process-map-9mn.19 довела геометрию уровня 1 (высоту подписи ниже,
 * отступ ребра, компактный режим), но настоящих артефактов у неё не было.
 */
export const EDGE_LABEL_WRAP_MAX_WIDTH = 104;

/**
 * Высота строки подписи ребра — токен --pm-line-height-15, которым
 * EdgeLabel.module.css задаёт line-height подписи (process-map-9mn.19).
 *
 * Число здесь по тому же доводу, что ширина выше: от высоты подписи зависит
 * раскладка уровня 1. Ребро, ведомое СНИЗУ карточек (обратная связь, связь
 * через модуль), кладёт подпись на свой горизонтальный отрезок, и насколько
 * этот отрезок опустить, чтобы подпись не легла на карточки, решает её высота
 * (ARTIFACT_EDGE_OFFSET в components/edges/ArtifactEdge/artifactGeometry.ts).
 * Вертикальной подложки у подписи нет — только горизонтальная, — поэтому
 * высота подписи ровно строки. Совпадение с CSS сторожат tests/sizes.test.ts
 * (SIZE_TOKENS ниже) и tests/artifactLabelGeometry.test.ts (что подпись берёт
 * именно этот токен и не добавляет к строкам вертикальной подложки).
 */
export const EDGE_LABEL_LINE_HEIGHT = 15;

/**
 * Сколько строк переносимой подписи-артефакта раскладка уровня 1 обязана
 * уместить между карточками и полосой FP&A.
 *
 * Это БЮДЖЕТ, а не предел: подпись не клампится (многоточие съело бы
 * артефакт, см. EdgeLabel wrap), и четвёртая строка просто легла бы на
 * соседнее. Три — столько занимает самый длинный известный артефакт,
 * «Итоговый неограниченный прогноз», при ширине EDGE_LABEL_WRAP_MAX_WIDTH.
 * Появится длиннее — растёт это число, а вслед за ним отступ ребра и зазор
 * под карточками; раскладка считается от него, а не от литералов.
 */
export const EDGE_LABEL_WRAP_MAX_LINES = 3;

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
 * Ширина совпадает с шагом. Высота 170 подтверждена измерением Chromium
 * с Open Sans 12.5/15: самая длинная коробка L2 (слайд 9 [18], 7 абзацев)
 * занимает 136 px текста + 24 px отступов + 2 px рамки; запас 8 px.
 * Подробность размещается под хозяином с зазором 24 px (9mn.26).
 * Токены --pm-detail-node-* сверяются с этой константой в tests/sizes.test.ts.
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
  '--pm-line-height-15': EDGE_LABEL_LINE_HEIGHT,
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
