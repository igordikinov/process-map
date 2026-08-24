// Узел внешней системы (свимлейны уровня 1, SPEC §4.1 / §3 ExternalIO).
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import type { SystemCode } from '../../../data/schema';
import styles from './IntegrationNode.module.css';

export interface IntegrationNodeData extends Record<string, unknown> {
  system: SystemCode;
  /** Короткая подпись, видимая в карточке. */
  label: string;
  /** Полный список исходных ExternalIO.label — уходит в title (подсказку). */
  fullLabel: string;
  /** 'in' — система-источник (хэндл снизу), 'out' — приёмник (хэндл сверху). */
  direction: 'in' | 'out';
}

export type IntegrationNodeType = Node<IntegrationNodeData, 'system'>;

export const SYSTEM_HANDLE = {
  /** Источник интеграционного ребра: система → этап. */
  bottom: 'bottom',
  /** Приёмник интеграционного ребра: этап → система. */
  top: 'top',
} as const;

export function IntegrationNode({ data }: NodeProps<IntegrationNodeType>) {
  return (
    <>
      {data.direction === 'out' && (
        <Handle
          type="target"
          position={Position.Top}
          id={SYSTEM_HANDLE.top}
          isConnectable={false}
        />
      )}
      <div className={styles.card} title={data.fullLabel}>
        <span className={styles.code}>{data.system}</span>
        <span className={styles.label}>{data.label}</span>
      </div>
      {data.direction === 'in' && (
        <Handle
          type="source"
          position={Position.Bottom}
          id={SYSTEM_HANDLE.bottom}
          isConnectable={false}
        />
      )}
    </>
  );
}
