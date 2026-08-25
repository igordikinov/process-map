// Тулбар полотна (SPEC §4.6): toggle «Показать интеграции» + зум −/%/+/fit.
// Справа сверху на обоих полотнах (артборды A1/A2 в design/*.dc.html).
//
// Рендерится РЯДОМ с <ReactFlow>, внутри общего <ReactFlowProvider> (см.
// Overview.tsx/StageDetail.tsx) — не ДЕТЬМИ <ReactFlow>, как EdgeMarkers/
// StartViewport. useReactFlow()/useViewport() требуют только контекст
// провайдера, а не сам смонтированный GraphView, поэтому сиблинг работает
// точно так же. Это важно для двух вещей:
//   1) кнопки тулбара не попадают внутрь `.react-flow` — там их бы посчитали
//      существующие тесты «фокусируемых элементов ровно N карточек»
//      (tests/App.test.tsx, tests/stageDetail.test.tsx), которые эту задачу
//      не трогает;
//   2) в DOM тулбар всё равно идёт ПОСЛЕ полотна (JSX-порядок в Overview/
//      StageDetail), поэтому кнопки не встают в Tab раньше карточек —
//      см. e2e/overview.spec.ts «до первой карточки этапа один Tab».
//
// Позиционирование — обычный position:absolute в .module.css, а не Panel из
// @xyflow/react: Panel рендерится ДЕТЬМИ <ReactFlow> (внутри `.react-flow`),
// что вернуло бы проблему (1).
import { useReactFlow, useViewport, type FitViewOptions } from '@xyflow/react';
import { iconUrl } from '../../assets/icons';
import { ru } from '../../i18n/ru';
import { useProcessStore } from '../../store/useProcessStore';
import styles from './Toolbar.module.css';

const MINUS_ICON = iconUrl('minus');
const PLUS_ICON = iconUrl('plus');
const FIT_ICON = iconUrl('fit');

export interface ToolbarProps {
  /**
   * Опции fitView для кнопки «Уместить в экран». Экран решает сам:
   *   · уровень 1 (Overview) передаёт то же, что использует автозапуск
   *     fitView при монтировании (см. FIT_VIEW_PADDING в overviewGraph.ts) —
   *     там пола читаемости нет;
   *   · уровень 2 (StageDetail) передаёт TOOLBAR_FIT_VIEW_OPTIONS из
   *     stageGraph.ts — с minZoom/maxZoom, равными START_ZOOM_MIN/MAX.
   *     Без этого fitView() ушёл бы ниже читаемого порога 12px и отменил
   *     эффект задачи process-map-l8a (см. её комментарии в stageGraph.ts).
   */
  fitViewOptions: FitViewOptions;
}

export function Toolbar({ fitViewOptions }: ToolbarProps) {
  const { zoomIn, zoomOut, fitView } = useReactFlow();
  const { zoom } = useViewport();
  const showIntegrations = useProcessStore((state) => state.showIntegrations);
  const toggleIntegrations = useProcessStore((state) => state.toggleIntegrations);

  return (
    <div className={styles.toolbar}>
      <button
        type="button"
        role="switch"
        aria-checked={showIntegrations}
        aria-label={ru.toolbar.showIntegrations}
        className={styles.toggle}
        onClick={toggleIntegrations}
      >
        <span className={styles.switchTrack} aria-hidden="true">
          <span className={styles.switchKnob} />
        </span>
        <span className={styles.toggleLabel}>{ru.toolbar.showIntegrations}</span>
      </button>

      <div className={styles.zoomGroup}>
        <button
          type="button"
          className={styles.zoomButton}
          aria-label={ru.toolbar.zoomOut}
          title={ru.toolbar.zoomOut}
          onClick={() => {
            void zoomOut();
          }}
        >
          <img src={MINUS_ICON} alt="" className={styles.zoomIcon} />
        </button>

        <span className={styles.zoomDisplay}>{ru.toolbar.zoomPercent(Math.round(zoom * 100))}</span>

        <button
          type="button"
          className={styles.zoomButton}
          aria-label={ru.toolbar.zoomIn}
          title={ru.toolbar.zoomIn}
          onClick={() => {
            void zoomIn();
          }}
        >
          <img src={PLUS_ICON} alt="" className={styles.zoomIcon} />
        </button>

        <button
          type="button"
          className={styles.zoomButton}
          aria-label={ru.toolbar.fitView}
          title={ru.toolbar.fitView}
          onClick={() => {
            void fitView(fitViewOptions);
          }}
        >
          <img src={FIT_ICON} alt="" className={styles.zoomIconFit} />
        </button>
      </div>
    </div>
  );
}
