// Презентационная карточка узла потока, уровень 2 (SPEC §4.2, артборд A2 318×52).
//
// Одна карточка на три варианта — step / integration / warning, — потому что в
// макете A2 и в раскладке это один и тот же прямоугольник 318×52: отличаются
// только цвет левой полоски, фон и иконка. Размер общий не «на глаз», а по
// коду: scripts/layout.ts::NODE_SIZE кладёт integration и warning тот же
// STEP_NODE_SIZE, что и step.
//
// Как и StageCard уровня 1, компонент намеренно не зависит от React Flow:
// Handle'ы живут в StepNode.tsx / WarningNode.tsx, а карточку можно
// рендерить и тестировать без ReactFlowProvider.
import { iconUrl, type IconName } from '../../../assets/icons';
import type { ProcessNode } from '../../../data/schema';
import { ru } from '../../../i18n/ru';
import { useProcessStore } from '../../../store/useProcessStore';
import { openScreen } from '../../../utils/url';
import styles from './StepCard.module.css';

/**
 * Вариант оформления = ProcessNode.type для всех типов, кроме `data`.
 *
 * ЧТО КОДИРУЕТ ЧТО (process-map-70e.7). Полоска слева отвечает на вопрос «что
 * это за сущность»: свой шаг процесса, внешняя интеграция, предупреждение. Вид
 * элемента BPMN — шлюз, событие, свёрнутый подпроцесс — полоской НЕ кодируется:
 * все три относятся к потоку процесса и делят с шагом одну полоску, а
 * различаются иконкой. Иначе на 3 px ширины пришлось бы разводить семь
 * значений оттенками одного цвета, и они стали бы неразличимы.
 *
 * ФОРМА КАРТОЧКИ У ВСЕХ ОДНА — 318×52, ромба и круга нет. Осознанное
 * отступление от нотации BPMN: подпись шлюза («Достаточно ли запасов?») в ромб
 * 50×50 не помещается и по стандарту рисуется СНАРУЖИ фигуры, то есть на
 * полотне наехала бы на соседей. Обоснование продублировано у NODE_SIZE в
 * src/layout/stageLayout.ts, потому что размер задаётся там.
 */
export type StepCardVariant =
  'step' | 'integration' | 'warning' | 'gateway' | 'event' | 'subprocess';

// Пути считает сборщик, а не строка в рантайме (см. src/assets/icons/index.ts).
const TYPE_ICON: Record<StepCardVariant, IconName> = {
  step: 'step-in-process',
  integration: 'link',
  warning: 'warning-triangle',
  // Иконки повторяют фигуры нотации BPMN — ромб, круг, рамка с плюсом. Это не
  // выдуманная графика, а сам стандарт: раз форму карточки мы дать не можем,
  // её несёт иконка.
  gateway: 'gateway',
  event: 'event',
  subprocess: 'subprocess',
};

const LINK_EXTERNAL_ICON = iconUrl('link-external');

const ARIA_LABEL: Record<StepCardVariant, (label: string) => string> = {
  step: ru.stepNode.ariaLabel,
  integration: ru.stepNode.ariaLabelIntegration,
  warning: ru.stepNode.ariaLabelWarning,
  gateway: ru.stepNode.ariaLabelGateway,
  event: ru.stepNode.ariaLabelEvent,
  subprocess: ru.stepNode.ariaLabelSubprocess,
};

// Тип значения — string | undefined: CSS-модули типизированы как
// Record<string, string> при включённом noUncheckedIndexedAccess.
const VARIANT_CLASS: Record<StepCardVariant, string | undefined> = {
  step: styles.step,
  integration: styles.integration,
  warning: styles.warning,
  // Полоска общая с шагом: все три — поток процесса (см. StepCardVariant).
  gateway: styles.step,
  event: styles.step,
  subprocess: styles.step,
};

export interface StepCardProps {
  node: ProcessNode;
  variant: StepCardVariant;
}

export function StepCard({ node, variant }: StepCardProps) {
  const selectNode = useProcessStore((state) => state.selectNode);
  const isSelected = useProcessStore((state) => state.selectedNodeId === node.id);

  // Описание в данных многострочное (таблицы «причина → действие»), переносы
  // сохраняются: title рендерится браузером с учётом \n.
  const hint = node.description === undefined ? node.label : `${node.label}\n\n${node.description}`;

  // Отдельная const, а не node.screen по месту: сужение типа у свойства не
  // переживает границу колбэка, у const — переживает.
  const screen = node.screen;

  return (
    // Кнопка ссылки — СОСЕД карточки, а не потомок: вложенный <button> невалиден
    // и ломает и клавиатуру, и скринридеры. Отсюда обёртка с position: relative.
    <div className={styles.wrapper}>
      <button
        type="button"
        className={[styles.card, VARIANT_CLASS[variant], isSelected ? styles.selected : '']
          .filter(Boolean)
          .join(' ')}
        // Drawer (process-map-lo7) откроется по этому же selectedNodeId.
        aria-current={isSelected ? 'true' : undefined}
        aria-label={ARIA_LABEL[variant](node.label)}
        title={hint}
        onClick={() => {
          selectNode(node.id);
        }}
      >
        <img className={styles.icon} src={iconUrl(TYPE_ICON[variant])} alt="" />
        <span className={styles.label}>{node.label}</span>
      </button>

      {/* SPEC §4.2: иконка link-external показывается ТОЛЬКО при node.screen.
          В process.json screen не заполнен ни у одного узла — ссылки приходят
          из overrides редактора (M3, SPEC §4.4). */}
      {screen !== undefined && (
        <button
          type="button"
          className={styles.linkButton}
          aria-label={ru.stepNode.openScreen(screen.title)}
          title={ru.stepNode.openScreen(screen.title)}
          // stopPropagation и на pointerdown: React Flow слушает pointer-события
          // на обёртке узла, одного onClick мало.
          onPointerDown={(event) => {
            event.stopPropagation();
          }}
          onClick={(event) => {
            // stopPropagation обязателен и здесь: без него клик всплывёт до
            // карточки и вместе со ссылкой откроется Drawer.
            event.stopPropagation();
            // Своей логики window.open тут нет намеренно: она разошлась бы с
            // utils/url.ts::openScreen (SPEC §4.8) и с tests/url.test.ts.
            openScreen(screen.url);
          }}
        >
          <img className={styles.linkIcon} src={LINK_EXTERNAL_ICON} alt="" />
        </button>
      )}
    </div>
  );
}
