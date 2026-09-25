// Легенда полотна: SPEC §4.6 упоминает её местом в тулбаре, макет кладёт её
// в левый нижний угол на обоих артбордах A1/A2 — но состав пунктов там на
// обоих один и тот же («Шаг · Данные · Интеграция · Предупреждение»), хотя
// уровень 1 не содержит НИ ОДНОГО узла этих типов (там только карточки
// этапов, карточки систем и рёбра). Слепое копирование макета вводило
// читателя в заблуждение, поэтому состав здесь зависит от уровня:
//   · уровень 1 (обзор) — линия процесса, пунктир интеграции, карточка
//     системы: то, что на обзоре реально есть;
//   · уровень 2 (детализация) — типы узлов, как в макете (там они верны).
// Пункт «Интеграция» (и «Система» на уровне 1 — она тоже пропадает вместе
// со свимлейнами) скрывается, когда toggle «Показать интеграции» выключен:
// иначе легенда обещала бы то, чего на экране больше нет.
//
// Из-за этого компонент больше не «чистый»: ему нужен store — level решает
// currentStageId (null → обзор), state toggle решает showIntegrations.
//
// У ТРЁХУРОВНЕВОЙ карты экранов три (process-map-9mn.16), и currentStageId
// === null их уже не различает: он null и на экране модулей, и на экране
// этапов модуля. Экран модулей узнаётся currentScreen() из src/data/modules.ts
// — по форме документа и паре (currentModuleId, currentStageId), поэтому
// легенда читает ещё и саму карту. Состав его пунктов — modulesItems() ниже:
// «Процесс», «Интеграция», «Система», каждый лишь при том, что он объясняет.
// На двухуровневой карте экрана модулей нет, и легенда там прежняя.
//
// React Flow ему не нужен вовсе — и именно поэтому она НЕ монтируется внутри
// .canvas/<ReactFlowProvider> (см. Overview.tsx/StageDetail.tsx): раньше она
// плавала там поверх полотна абсолютным позиционированием, но перекрывала
// содержимое на реальных данных — см. подробное обоснование в
// Legend.module.css. Теперь она отдельная строка (.legendStrip) под .canvas,
// а не над ним; сама позиция строки задаётся снаружи, здесь только контент.
//
// Компактный режим (SPEC §4.5, артборд A4, задача process-map-5l3):
// легенда сворачивается в кнопку-иконку (assets/icons/tables.svg). Кнопка
// живёт ВНУТРИ той же полосы под полотном, а не всплывает над ним: макет A4
// рисует её в левом нижнем углу полотна, но в M2 замерено, что плавающая
// панель перекрывает содержимое на любом углу и на любом этапе (см.
// Legend.module.css). Схлопывание внутрь полосы даёт то же «легенда не
// занимает место», не возвращая устранённый дефект.
//
// Раскрытие — состояние самого компонента, а не store: это не состояние
// карты процесса (уровень, выбранный узел, режим), а положение одного
// элемента хрома, которое ничего не должно переживать.
import { useMemo, useState } from 'react';
import { iconUrl } from '../../assets/icons';
import { currentScreen } from '../../data/modules';
import type { NodeType, ProcessMap } from '../../data/schema';
import { useProcessMap } from '../../hooks/useProcessMap';
import { ru } from '../../i18n/ru';
import { useProcessStore } from '../../store/useProcessStore';
import detailStyles from '../nodes/DetailNode/DetailNode.module.css';
import styles from './Legend.module.css';

const LEGEND_ICON = iconUrl('tables');

interface LegendItem {
  key: string;
  label: string;
  // CSS-модули типизированы как Record<string, string> с индексной сигнатурой
  // (vite/client.d.ts) — при noUncheckedIndexedAccess (tsconfig) любой
  // styles.xxx выводится как string | undefined, хотя ключ существует.
  // В className ниже это безопасно (шаблонная строка), тип поля отражает
  // фактический тип styles.* без утверждений (`as string`).
  swatch: string | undefined;
}

/** Уровень 1 (SPEC §4.1): линия процесса, пунктир интеграции, карточка системы. */
const OVERVIEW_ITEMS: readonly LegendItem[] = [
  { key: 'process', label: ru.legend.process, swatch: styles.swatchProcess },
  { key: 'integration', label: ru.legend.integration, swatch: styles.swatchIntegration },
  { key: 'system', label: ru.legend.system, swatch: styles.swatchSystem },
];

/** Уровень 2 (SPEC §4.2): типы узлов — совпадает с макетом A2. */
const STAGE_ITEMS: readonly LegendItem[] = [
  { key: 'step', label: ru.legend.step, swatch: styles.swatchStep },
  { key: 'data', label: ru.legend.data, swatch: styles.swatchData },
  { key: 'integration', label: ru.legend.integration, swatch: styles.swatchIntegration },
  { key: 'warning', label: ru.legend.warning, swatch: styles.swatchWarning },
];

/**
 * Типы, приходящие только из BPMN (process-map-70e.7).
 *
 * Показываются УСЛОВНО — лишь когда на текущем этапе такой узел есть. Четыре
 * базовых пункта остаются безусловными: они описывают модель приложения, и
 * этап без предупреждений всё равно перечисляет «Предупреждение» (это
 * зафиксировано tests/legend.test.tsx). А обещать «Развилку» на карте, где
 * шлюзов нет ни одного, — ровно та ложь легенды, ради которой написана шапка
 * этого файла.
 *
 * Образец у них НЕ цветная полоска, а ФОРМА — ромб, круг, рамка: полоска у
 * всех трёх общая с шагом, потому что все они поток процесса (см.
 * StepCardVariant). Прецедент образца-фигуры — swatchSystem уровня 1.
 */
const BPMN_ITEMS: readonly (LegendItem & { readonly nodeType: NodeType })[] = [
  { key: 'gateway', nodeType: 'gateway', label: ru.legend.gateway, swatch: styles.swatchGateway },
  { key: 'event', nodeType: 'event', label: ru.legend.event, swatch: styles.swatchEvent },
  {
    key: 'subprocess',
    nodeType: 'subprocess',
    label: ru.legend.subprocess,
    swatch: styles.swatchSubprocess,
  },
];

/**
 * Подробность под шагом (NodeType 'detail', process-map-9mn.36). Пункт
 * УСЛОВНЫЙ по тому же правилу, что пункты BPMN выше, и тем же механизмом —
 * множеством типов, реально присутствующих на этапе: у карт snp и mrp
 * подробностей нет ни одной, и «Подробность» в их легенде была бы обещанием
 * того, чего на полотне нет.
 *
 * Образец — миниатюра самой карточки (без полоски типа, заливка и рамка
 * выноски); класс пока живёт рядом с карточкой, в DetailNode.module.css, —
 * почему там и куда ему переехать, сказано у .legendSwatch.
 */
const DETAIL_ITEM: LegendItem & { readonly nodeType: NodeType } = {
  key: 'detail',
  nodeType: 'detail',
  label: ru.legend.detail,
  swatch: detailStyles.legendSwatch,
};

/** Пункты, которых не остаётся на полотне при выключенных интеграциях
 *  (см. overviewGraph.ts/stageGraph.ts): «система» есть только в OVERVIEW_ITEMS,
 *  фильтр по обоим уровням общий и просто не найдёт лишний ключ. */
const HIDDEN_WITHOUT_INTEGRATIONS = new Set(['integration', 'system']);

/**
 * Уровень 1 ТРЁХУРОВНЕВОЙ карты — экран модулей (process-map-9mn.16).
 *
 * Пункты те же, что у обзора этапов, но каждый — только если на полотне есть
 * то, что он объясняет (довод шапки файла):
 *   · «Процесс» — если есть связь модуль → модуль. Карта из одного модуля
 *     законна (hasModules) и рисует одну карточку без единой линии;
 *   · «Интеграция» и «Система» — если у связей уровня 1 есть конец-система.
 *     У настоящей карты inplan таких концов нет вовсе, свимлейнов на её
 *     уровне 1 не будет, и обещать их легенда не должна. Что второй конец
 *     такой связи — именно код системы, гарантирует validateIntegrity («хотя
 *     бы один конец — модуль», и каждый конец — модуль или код системы).
 *
 * Пункта «Модуль» НЕТ намеренно: карточка модуля подписана сама, словом
 * «Модуль» рядом с номером, — ровно как карточка этапа, для которой пункта
 * «Этап» на обзоре тоже нет (решение записано у ru.legend.detail).
 *
 * Тумблер интеграций применяется ниже общим фильтром, как на других экранах.
 */
function modulesItems(map: ProcessMap): readonly LegendItem[] {
  const moduleIds = new Set((map.modules ?? []).map((module) => module.id));
  const edges = map.moduleEdges ?? [];
  const hasFlow = edges.some((edge) => moduleIds.has(edge.source) && moduleIds.has(edge.target));
  const hasSystems = edges.some(
    (edge) => !moduleIds.has(edge.source) || !moduleIds.has(edge.target),
  );
  return OVERVIEW_ITEMS.filter((item) => (item.key === 'process' ? hasFlow : hasSystems));
}

/**
 * Типы узлов, реально присутствующие на открытом этапе. По ним включаются
 * условные пункты легенды: типы BPMN (BPMN_ITEMS) и «Подробность»
 * (DETAIL_ITEM). Имя хука — от BPMN, ради которых он появился первым.
 *
 * Читает карту, а не данные React Flow: легенда живёт ВНЕ <ReactFlowProvider>
 * (см. шапку файла), и до узлов полотна ей не дотянуться. На обзоре считать
 * нечего — там узлов этих типов нет по построению.
 */
function usePresentBpmnTypes(isOverview: boolean): ReadonlySet<NodeType> {
  const map = useProcessMap();
  const stageId = useProcessStore((state) => state.currentStageId);
  return useMemo(() => {
    if (isOverview || stageId === null) {
      return new Set<NodeType>();
    }
    const stage = map.stages.find((item) => item.id === stageId);
    return new Set<NodeType>(stage?.nodes.map((node) => node.type) ?? []);
  }, [isOverview, map, stageId]);
}

export interface LegendProps {
  /** SPEC §4.5: легенда сворачивается в кнопку-иконку. */
  compact?: boolean;
}

export function Legend({ compact = false }: LegendProps) {
  const isOverview = useProcessStore((state) => state.currentStageId === null);
  const showIntegrations = useProcessStore((state) => state.showIntegrations);
  const [expanded, setExpanded] = useState(false);
  // Экран модулей нельзя узнать по isOverview: currentStageId === null и там.
  // Какой экран на самом деле, решает currentScreen() по форме документа — два
  // скалярных селектора, а не объект (zustand v5, см. App.tsx).
  const map = useProcessMap();
  const currentModuleId = useProcessStore((state) => state.currentModuleId);
  const currentStageId = useProcessStore((state) => state.currentStageId);
  const isModulesScreen = currentScreen(map, { currentModuleId, currentStageId }) === 'modules';

  // Типы BPMN и подробность (DETAIL_ITEM) добавляются только если такой узел
  // на текущем этапе есть. На картах snp и mrp нет ни того, ни другого, и
  // легенда там выглядит ровно как раньше.
  const present = usePresentBpmnTypes(isOverview);
  const base = isModulesScreen ? modulesItems(map) : isOverview ? OVERVIEW_ITEMS : STAGE_ITEMS;
  const extra = isOverview
    ? []
    : [...BPMN_ITEMS, DETAIL_ITEM].filter((item) => present.has(item.nodeType));
  const items = [...base, ...extra].filter(
    (item) => showIntegrations || !HIDDEN_WITHOUT_INTEGRATIONS.has(item.key),
  );

  const list = items.map((item) => (
    <span key={item.key} className={styles.item}>
      <span className={`${styles.swatch} ${item.swatch}`} aria-hidden="true" />
      {item.label}
    </span>
  ));

  if (!compact) {
    return (
      <div className={styles.legend} role="group" aria-label={ru.legend.ariaLabel}>
        {list}
      </div>
    );
  }

  // Свёрнутая легенда: кнопка-иконка, по клику список раскрывается ВПРАВО в
  // той же полосе. Развёрнутый список — не поповер: полоса под полотном
  // достаточно широкая, и всплывающий слой пришлось бы снова размещать над
  // чем-то (см. комментарий в шапке файла).
  return (
    <div
      className={`${styles.legend} ${styles.compact}`}
      role="group"
      aria-label={ru.legend.ariaLabel}
    >
      <button
        type="button"
        className={styles.toggle}
        aria-expanded={expanded}
        aria-label={expanded ? ru.legend.collapse : ru.legend.expand}
        title={expanded ? ru.legend.collapse : ru.legend.expand}
        onClick={() => {
          setExpanded((previous) => !previous);
        }}
      >
        <img src={LEGEND_ICON} alt="" className={styles.toggleIcon} />
      </button>
      {/* Список не «спрятан классом»: скрытый DOM всё равно читается
          скринридером и попадает в поиск по странице. */}
      {expanded && list}
    </div>
  );
}
