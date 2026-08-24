// Стрелки для рёбер. Вынесены в отдельный <svg><defs>, потому что
// MarkerType.ArrowClosed из React Flow принимает цвет только строкой-литералом
// (hex в .tsx запрещён правилом no-restricted-syntax, CLAUDE.md).
// url(#id) резолвится в пределах документа, поэтому маркеры видны и из svg
// самого React Flow.
import styles from './edges.module.css';

export const ARROW_PROCESS = 'pm-arrow-process';
export const ARROW_INTEGRATION = 'pm-arrow-integration';

export function EdgeMarkers() {
  return (
    <svg className={styles.markers} aria-hidden="true" focusable="false">
      <defs>
        <marker
          id={ARROW_PROCESS}
          viewBox="0 0 8 8"
          refX="7"
          refY="4"
          markerWidth="7"
          markerHeight="7"
          orient="auto"
        >
          <path className={styles.arrowProcess} d="M0,0.5 L7,4 L0,7.5 Z" />
        </marker>
        <marker
          id={ARROW_INTEGRATION}
          viewBox="0 0 8 8"
          refX="7"
          refY="4"
          markerWidth="6.5"
          markerHeight="6.5"
          orient="auto"
        >
          <path className={styles.arrowIntegration} d="M0,0.5 L7,4 L0,7.5 Z" />
        </marker>
      </defs>
    </svg>
  );
}
