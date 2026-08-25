// Шапка экрана детализации (SPEC §4.2, артборд A2): кнопка «Назад», крошки
// «E2E-процесс › {stage.title}», бейдж «Этап N», справа счётчик узлов.
//
// Компонент самодостаточен по данным уровня 1/2: получает список этапов и сам
// достаёт текущий из `useProcessStore` — так его можно смонтировать заранее
// (см. CLAUDE.md задачи: «не встраивать в App.tsx», но «готов к монтированию»)
// без риска падения на уровне 1.
import { iconUrl } from '../../assets/icons';
import { loadProcessMap } from '../../data/loader';
import { ru } from '../../i18n/ru';
import { useProcessStore } from '../../store/useProcessStore';
import { countStageNodes } from '../../utils/stageNodes';
import styles from './Breadcrumbs.module.css';

export interface BreadcrumbsProps {
  /** `loadProcessMap().stages` — передаётся снаружи, чтобы не грузить JSON
   *  повторно на каждый ререндер и не плодить источники данных (см. loader.ts). */
  stages: ReturnType<typeof loadProcessMap>['stages'];
  /**
   * SPEC §4.5: шапка 44 px. Артборд A4 показывает только уровень 1, но
   * требование «шапка 44 px» относится к режиму, а не к экрану: две разные
   * высоты шапки на двух уровнях одного низкого фрейма — это дефект, а не
   * замысел. Счётчик узлов справа при этом остаётся: он и есть содержимое
   * шапки уровня 2, а не украшение.
   */
  compact?: boolean;
}

// Путь иконки изолирован в одной константе: реестр иконок (src/assets/icons)
// появился параллельно, во время работы над этой задачей (process-map-mpg),
// поэтому используем его, а не собственный механизм — см. комментарий в
// src/assets/icons/index.ts про BASE_URL и `base: './'`.
const RETURN_ICON_SRC = iconUrl('return-back');

export function Breadcrumbs({ stages, compact = false }: BreadcrumbsProps) {
  const currentStageId = useProcessStore((state) => state.currentStageId);
  const back = useProcessStore((state) => state.back);

  const stage = stages.find((candidate) => candidate.id === currentStageId);

  // Уровень 1 (обзор) использует свою шапку OverviewHeader — здесь крошкам
  // рисовать нечего. Тот же результат и при рассинхроне currentStageId/stages
  // (например, стейт ещё не подхватил новый список этапов): безопаснее не
  // показывать крошки, чем показать пустой заголовок этапа.
  if (currentStageId === null || stage === undefined) {
    return null;
  }

  const counts = countStageNodes(stage);

  return (
    <header className={compact ? `${styles.header} ${styles.compact}` : styles.header}>
      <button
        type="button"
        className={styles.backButton}
        onClick={back}
        aria-label={ru.breadcrumbs.backAriaLabel}
        title={ru.breadcrumbs.backAriaLabel}
      >
        <img className={styles.backIcon} src={RETURN_ICON_SRC} alt="" />
      </button>

      <div className={styles.crumbs}>
        <span className={styles.crumbLabel}>{ru.breadcrumbs.root}</span>
        <span className={styles.crumbSeparator}>›</span>
        <span className={styles.crumbActive}>{stage.title}</span>
        <span className={styles.badge}>{ru.breadcrumbs.stageBadge(stage.number)}</span>
      </div>

      <div className={styles.spacer} />

      <span className={styles.counter}>
        {ru.breadcrumbs.counter(counts.steps, counts.inputs, counts.outputs)}
      </span>
    </header>
  );
}
