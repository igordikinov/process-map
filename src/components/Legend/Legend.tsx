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
import type { NodeType } from '../../data/schema';
import { useProcessMap } from '../../hooks/useProcessMap';
import { ru } from '../../i18n/ru';
import { useProcessStore } from '../../store/useProcessStore';
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

/** Пункты, которых не остаётся на полотне при выключенных интеграциях
 *  (см. overviewGraph.ts/stageGraph.ts): «система» есть только в OVERVIEW_ITEMS,
 *  фильтр по обоим уровням общий и просто не найдёт лишний ключ. */
const HIDDEN_WITHOUT_INTEGRATIONS = new Set(['integration', 'system']);

/**
 * Типы BPMN, реально присутствующие на открытом этапе.
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

  // Типы BPMN добавляются только если такой узел на текущем этапе есть.
  // Для карт, собранных из презентаций, множество всегда пусто, и легенда
  // выглядит ровно как раньше.
  const present = usePresentBpmnTypes(isOverview);
  const base = isOverview ? OVERVIEW_ITEMS : STAGE_ITEMS;
  const extra = isOverview ? [] : BPMN_ITEMS.filter((item) => present.has(item.nodeType));
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
