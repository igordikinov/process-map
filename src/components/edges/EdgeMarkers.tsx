// Стрелки для рёбер. Вынесены в отдельный <svg><defs>, потому что
// MarkerType.ArrowClosed из React Flow принимает цвет только строкой-литералом
// (hex в .tsx запрещён правилом no-restricted-syntax, CLAUDE.md).
// url(#id) резолвится в пределах документа, поэтому маркеры видны и из svg
// самого React Flow.
import { useId, useMemo, type ReactNode } from 'react';
import { EdgeMarkerContext, type EdgeMarkerIds } from './edgeMarkerContext';
import styles from './edges.module.css';

export interface EdgeMarkersProps {
  children: ReactNode;
}

/**
 * Объявляет маркеры и раздаёт их id потомкам (в том числе рёбрам внутри
 * ReactFlow). Оборачивать нужно всё полотно целиком.
 */
export function EdgeMarkers({ children }: EdgeMarkersProps) {
  // useId даёт ':r0:'-подобные строки; двоеточия убираются, чтобы id гарантированно
  // работал и во фрагментной ссылке url(#…), и в document.querySelector.
  const rawId = useId();
  const ids = useMemo<EdgeMarkerIds>(() => {
    const base = `pm-arrow-${rawId.replace(/:/g, '')}`;
    return {
      process: `${base}-process`,
      processInner: `${base}-process-inner`,
      integration: `${base}-integration`,
      data: `${base}-data`,
    };
  }, [rawId]);

  return (
    <EdgeMarkerContext.Provider value={ids}>
      <svg className={styles.markers} aria-hidden="true" focusable="false">
        <defs>
          <marker
            id={ids.process}
            viewBox="0 0 8 8"
            refX="7"
            refY="4"
            markerWidth="7"
            markerHeight="7"
            orient="auto"
          >
            <path className={styles.arrowProcess} d="M0,0.5 L7,4 L0,7.5 Z" />
          </marker>
          {/* Стрелка ребра внутри группы: та же геометрия, серая заливка. */}
          <marker
            id={ids.processInner}
            viewBox="0 0 8 8"
            refX="7"
            refY="4"
            markerWidth="7"
            markerHeight="7"
            orient="auto"
          >
            <path className={styles.arrowProcessInner} d="M0,0.5 L7,4 L0,7.5 Z" />
          </marker>
          <marker
            id={ids.integration}
            viewBox="0 0 8 8"
            refX="7"
            refY="4"
            markerWidth="6.5"
            markerHeight="6.5"
            orient="auto"
          >
            <path className={styles.arrowIntegration} d="M0,0.5 L7,4 L0,7.5 Z" />
          </marker>
          {/* Стрелка ребра к артефакту данных: та же геометрия, нейтральная
              заливка — артефакт не система, синий тут врал бы. */}
          <marker
            id={ids.data}
            viewBox="0 0 8 8"
            refX="7"
            refY="4"
            markerWidth="6.5"
            markerHeight="6.5"
            orient="auto"
          >
            <path className={styles.arrowData} d="M0,0.5 L7,4 L0,7.5 Z" />
          </marker>
        </defs>
      </svg>
      {children}
    </EdgeMarkerContext.Provider>
  );
}
