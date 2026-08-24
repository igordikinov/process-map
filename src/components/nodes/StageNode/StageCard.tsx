// Презентационная карточка этапа (SPEC §4.1, артборд A1).
//
// Намеренно не зависит от React Flow: Handle'ы и NodeProps живут в StageNode.tsx,
// а карточку можно рендерить и тестировать без ReactFlowProvider и без моков
// размеров контейнера.
import type { Stage } from '../../../data/schema';
import { ru } from '../../../i18n/ru';
import { useProcessStore } from '../../../store/useProcessStore';
import styles from './StageCard.module.css';

const WARNING_ICON = `${import.meta.env.BASE_URL}icons/warning-triangle.svg`;

export interface StageCardProps {
  stage: Stage;
}

export function StageCard({ stage }: StageCardProps) {
  const navigateToStage = useProcessStore((state) => state.navigateToStage);
  const isActive = useProcessStore((state) => state.currentStageId === stage.id);
  const warningsCount = stage.warningsCount ?? 0;

  return (
    <button
      type="button"
      className={isActive ? `${styles.card} ${styles.active}` : styles.card}
      aria-label={ru.stageNode.ariaLabel(stage.number, stage.title)}
      aria-current={isActive ? 'step' : undefined}
      onClick={() => {
        navigateToStage(stage.id);
      }}
    >
      <div className={styles.head}>
        <span className={styles.number}>{stage.number}</span>
        {warningsCount > 0 ? (
          <span className={styles.warnings}>
            <img src={WARNING_ICON} alt="" className={styles.warningsIcon} />
            {ru.stageNode.warnings(warningsCount)}
          </span>
        ) : (
          <span className={styles.caption}>
            {isActive ? ru.stageNode.captionActive : ru.stageNode.caption}
          </span>
        )}
      </div>

      <div className={styles.title} title={stage.title}>
        {stage.title}
      </div>
      <div className={styles.divider} />
      <div className={styles.outputsTitle}>{ru.stageNode.keyOutputs}</div>

      <ul className={styles.outputs}>
        {stage.keyOutputs.map((output) => (
          // Карточка 274×210 фиксирована по SPEC §4.1, а формулировки в данных
          // длиннее макетных, поэтому пункт обрезается многоточием, а не срезом
          // по краю карточки; полный текст доступен в подсказке.
          <li key={output} className={styles.output}>
            <span className={styles.dash} aria-hidden="true">
              —
            </span>
            <span className={styles.outputText} title={output}>
              {output}
            </span>
          </li>
        ))}
      </ul>

      {/* Строка появляется только при заполненной ссылке (SPEC §4.1);
          stage.screen наполняется редактором ссылок в M3. */}
      {stage.screen !== undefined && (
        <span className={styles.link}>{ru.stageNode.openInInplan}</span>
      )}
    </button>
  );
}
