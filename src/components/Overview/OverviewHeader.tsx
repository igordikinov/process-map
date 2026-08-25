// Шапка обзора (SPEC §4.1): заголовок, бейдж с числом этапов, дата обновления.
// Компонент чистый — тестируется без React Flow.
import { ru } from '../../i18n/ru';
import { formatIsoDate } from '../../utils/format';
import styles from './OverviewHeader.module.css';

export interface OverviewHeaderProps {
  /** map.title — заголовок берётся из данных, а не из i18n. */
  title: string;
  stagesCount: number;
  /** map.updatedAt в виде ISO-строки. */
  updatedAt: string;
  /** SPEC §4.5: шапка 44 px, дата обновления снята (артборд A4). */
  compact?: boolean;
}

export function OverviewHeader({
  title,
  stagesCount,
  updatedAt,
  compact = false,
}: OverviewHeaderProps) {
  return (
    <header className={compact ? `${styles.header} ${styles.compact}` : styles.header}>
      <h1 className={styles.title}>{title}</h1>
      <span className={styles.badge}>{ru.overview.stagesBadge(stagesCount)}</span>
      {/* Дата обновления в компактном режиме не рисуется (артборд A4): в 44 px
          остаётся только то, без чего экран не опознать — заголовок и число
          этапов. Дата остаётся доступна, как только фрейм станет выше. */}
      {!compact && (
        <>
          <div className={styles.spacer} />
          <span className={styles.updated}>{ru.overview.updatedAt(formatIsoDate(updatedAt))}</span>
        </>
      )}
    </header>
  );
}
