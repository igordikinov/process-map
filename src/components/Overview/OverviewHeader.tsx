// Шапка обзора (SPEC §4.1): заголовок, бейдж с числом этапов, дата обновления.
// Компонент чистый — тестируется без React Flow.
import type { MapVersion } from '../../data/versions';
import { ru } from '../../i18n/ru';
import { formatIsoDate } from '../../utils/format';
import styles from './OverviewHeader.module.css';

/** Подпись версии: строка владельца, а при её отсутствии — заголовок карты. */
function versionLabel(version: MapVersion): string {
  return ru.overview.versionLabels[version.id] ?? version.title;
}

export interface OverviewHeaderProps {
  /** map.title — заголовок берётся из данных, а не из i18n. */
  title: string;
  stagesCount: number;
  /** map.updatedAt в виде ISO-строки. */
  updatedAt: string;
  /** SPEC §4.5: шапка 44 px, дата обновления снята (артборд A4). */
  compact?: boolean;
  /**
   * Показана ли карта, загруженная пользователем (process-map-70e.9).
   *
   * Приходит пропом, а не читается из activeMap: компонент чистый и
   * тестируется без состояния приложения — так же, как `title` берётся из
   * данных, а не из i18n.
   */
  imported?: boolean;
  /**
   * Версии карты, доступные на этом адресе (process-map-0c5.7).
   *
   * Меньше двух — группа не рендерится вовсе. Один неактивный сегмент обещал бы
   * выбор, которого нет: тот же довод, по которому кнопки «Отчёт импорта» и
   * «Вернуться к встроенной карте» не рисуются до первого импорта.
   */
  versions?: readonly MapVersion[];
  selectedVersionId?: string;
  onSelectVersion?: (id: string) => void;
}

export function OverviewHeader({
  title,
  stagesCount,
  updatedAt,
  compact = false,
  imported = false,
  versions = [],
  selectedVersionId,
  onSelectVersion,
}: OverviewHeaderProps) {
  // Переключать нечего — и группы нет. При загруженной пользователем схеме
  // показана вообще не версия, поэтому группу прячет вызывающий (Overview):
  // сегмент «нажат» утверждал бы, что показана эта версия, а показан чужой файл.
  const showVersions = versions.length > 1 && onSelectVersion !== undefined;
  const selected = versions.find((version) => version.id === selectedVersionId);
  return (
    <header className={compact ? `${styles.header} ${styles.compact}` : styles.header}>
      <h1 className={styles.title}>{title}</h1>
      <span className={styles.badge}>{ru.overview.stagesBadge(stagesCount)}</span>
      {/* ПРИЗНАК ПОДМЕНЫ. Смена заголовка признаком не является: он сменился бы
          и при переходе на вторую ВСТРОЕННУЮ карту, а читателю вики важно
          отличить «другая карта проекта» от «чужой файл поверх этой страницы».
          Бейдж остаётся и в компактном режиме: он не украшение, а ответ на
          вопрос «то ли я вижу». */}
      {imported && <span className={styles.importedBadge}>{ru.toolbar.importedBadge}</span>}

      {showVersions && (
        /* Два <button aria-pressed> в role="group" — дословно устройство
           переключателя «Просмотр / Редактор» (Toolbar.tsx), там же записано,
           почему не radiogroup: у него своя клавиатурная модель со стрелками и
           roving tabindex, которую пришлось бы писать руками ради двух значений.

           И НЕ role="switch": e2e/compact.spec.ts находит тулбар как
           document.querySelector('[role="switch"]')?.parentElement, и второй
           switch раньше по DOM молча увёл бы сторож ширины на чужой элемент —
           тест не покраснел бы, а позеленел не про то. */
        <div className={styles.versions} role="group" aria-label={ru.overview.versionGroup}>
          {versions.map((version) => {
            const label = versionLabel(version);
            const active = version.id === selectedVersionId;
            return (
              <button
                key={version.id}
                type="button"
                className={active ? `${styles.version} ${styles.versionActive}` : styles.version}
                aria-pressed={active}
                title={ru.overview.versionHint(label, version.stages)}
                onClick={() => {
                  onSelectVersion(version.id);
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
      )}

      {/* Живая область: aria-pressed сообщает «нажато» и ничего — про то, что
          сменились заголовок, число этапов и все узлы полотна. Узел СТАБИЛЬНЫЙ,
          меняется только текст: живую область, которой на месте сменили роль
          или которую пересоздали, скринридер не перечитывает (обратный случай
          с key разобран в EditorActions.tsx). */}
      {showVersions && (
        <span className={styles.announcement} role="status">
          {selected === undefined
            ? ''
            : ru.overview.versionAnnouncement(versionLabel(selected), selected.stages)}
        </span>
      )}
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
