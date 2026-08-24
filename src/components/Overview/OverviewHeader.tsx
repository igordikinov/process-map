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
}

export function OverviewHeader({ title, stagesCount, updatedAt }: OverviewHeaderProps) {
  return (
    <header className={styles.header}>
      <h1 className={styles.title}>{title}</h1>
      <span className={styles.badge}>{ru.overview.stagesBadge(stagesCount)}</span>
      <div className={styles.spacer} />
      <span className={styles.updated}>{ru.overview.updatedAt(formatIsoDate(updatedAt))}</span>
    </header>
  );
}
