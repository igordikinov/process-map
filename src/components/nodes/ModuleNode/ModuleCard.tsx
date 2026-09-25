// Презентационная карточка модуля — уровень 1 трёхуровневой карты (эпик M8,
// задача process-map-9mn.16).
//
// УСТРОЕНА КАК КАРТОЧКА ЭТАПА (ModuleSchema: «карточка уровня 1 устроена как
// карточка этапа»): номер, подпись «Модуль», короткое название, разделитель,
// «Ключевые выходы». Поэтому и вид у неё тот же — классы StageCard.module.css.
// Свой в ModuleCard.module.css только размер (MODULE_NODE_SIZE), он подмешан к
// классу карточки этапа через composes.
//
// ЧЕГО У НЕЁ НЕТ по сравнению с этапом, и почему (ru.moduleNode):
//   · состояния «выбран» — navigateToModule уводит на уровень 2, где карточек
//     модулей нет, и «выбранная» карточка модуля на экране не встречается;
//   · счётчика предупреждений — у модуля нет warningsCount;
//   · строки «Открыть в In.Plan» — открытие экрана модуля с карточки отложено
//     владельцем за M8 (process-map-9mn.31, п. 11): module.screen пока только
//     переживает переимпорт.
//
// Намеренно не зависит от React Flow — как и StageCard: хэндлы живут в
// ModuleNode.tsx, а карточку можно рендерить в тесте без провайдера.
import type { Module } from '../../../data/schema';
import { ru } from '../../../i18n/ru';
import { useProcessStore } from '../../../store/useProcessStore';
import stageStyles from '../StageNode/StageCard.module.css';
import styles from './ModuleCard.module.css';

/**
 * Компактный режим показывает ДВА ключевых выхода — то же число, что у
 * компактной карточки этапа (StageCard.tsx), и по той же причине список
 * режется в разметке, а не в CSS: скрытый пункт остался бы в дереве
 * доступности.
 */
const COMPACT_KEY_OUTPUTS = 2;

export interface ModuleCardProps {
  module: Module;
  /** SPEC §4.5: карточка 228×200, два выхода, без подписи «Модуль». */
  compact?: boolean;
}

export function ModuleCard({ module, compact = false }: ModuleCardProps) {
  const navigateToModule = useProcessStore((state) => state.navigateToModule);
  const outputs = compact ? module.keyOutputs.slice(0, COMPACT_KEY_OUTPUTS) : module.keyOutputs;

  return (
    <button
      type="button"
      className={compact ? `${styles.card} ${styles.compact}` : styles.card}
      aria-label={ru.moduleNode.ariaLabel(module.number, module.title)}
      onClick={() => {
        navigateToModule(module.id);
      }}
    >
      <div className={stageStyles.head}>
        {/* module.number, а не позиция в ряду: номера модулей с дырой законны
            (1, 2, 4 — карта берёт пять модулей презентации из восьми), и
            читатель видит тот же номер, что на слайде. */}
        <span className={stageStyles.number}>{module.number}</span>
        {!compact && <span className={stageStyles.caption}>{ru.moduleNode.caption}</span>}
      </div>

      {/* shortTitle в карточке, полное название — в подсказке и aria-label:
          тот же довод, что у карточки этапа (process-map-vjz.1). */}
      <div className={stageStyles.title} title={module.title}>
        {module.shortTitle}
      </div>
      <div className={stageStyles.divider} />
      {/* Заголовок только при непустом списке: у модуля PP в фикстуре и у MRP
          на слайде обзора выходного артефакта нет вовсе (process-map-9mn.5), и
          подпись над пустотой обещала бы список, которого нет. */}
      {!compact && outputs.length > 0 && (
        <div className={stageStyles.outputsTitle}>{ru.moduleNode.keyOutputs}</div>
      )}

      <ul className={stageStyles.outputs}>
        {outputs.map((output, index) => (
          // Ключ по индексу — довод дословно тот же, что в StageCard.tsx
          // (process-map-xsk): схема не требует уникальности строк.
          <li key={index} className={stageStyles.output}>
            <span className={stageStyles.dash} aria-hidden="true">
              —
            </span>
            <span className={stageStyles.outputText} title={output}>
              {output}
            </span>
          </li>
        ))}
      </ul>
    </button>
  );
}
