// Узел React Flow для карточки модуля — уровень 1 трёхуровневой карты (эпик
// M8, задача process-map-9mn.16). Вся вёрстка — в ModuleCard; здесь только
// точки подключения рёбер.
//
// СОБСТВЕННЫЙ ТИП 'module', хотя карточка выглядит как карточка этапа. Тип
// попадает в класс `.react-flow__node-<type>` (прецеденты — lane/flowLane,
// step/integration). Зарегистрируй экран модулей свои карточки под типом
// 'stage', и e2e/deep-link.spec.ts::waitForOverview, который ждёт ровно четыре
// `.react-flow__node-stage`, начал бы считать карточки модулей за этапы: тест
// не покраснел бы, а позеленел не про то.
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import type { Module } from '../../../data/schema';
import { ModuleCard } from './ModuleCard';

export interface ModuleNodeData extends Record<string, unknown> {
  module: Module;
  /** Компактный режим (SPEC §4.5): карточка 228×200 с двумя выходами. */
  compact?: boolean;
}

export type ModuleNodeType = Node<ModuleNodeData, 'module'>;

/**
 * Идентификаторы хэндлов — используются в modulesGraph.ts при сборке рёбер.
 *
 * Значения совпадают с STAGE_HANDLE, но константа своя: хэндлы — часть
 * контракта ЭТОГО узла, и правка карточки этапа не должна молча переподключать
 * рёбра уровня 1.
 */
export const MODULE_HANDLE = {
  /** Вход связи от предыдущего модуля (слева). */
  left: 'left',
  /** Выход связи к следующему модулю (справа). */
  right: 'right',
  /** Вход связи от внешней системы из свимлейна «вход» (сверху). */
  top: 'top',
  /** Выход обратной связи и связи к системе из свимлейна «выход» (снизу). */
  bottom: 'bottom',
} as const;

export function ModuleNode({ data }: NodeProps<ModuleNodeType>) {
  return (
    <>
      <Handle
        type="target"
        position={Position.Left}
        id={MODULE_HANDLE.left}
        isConnectable={false}
      />
      <Handle type="target" position={Position.Top} id={MODULE_HANDLE.top} isConnectable={false} />
      <ModuleCard module={data.module} compact={data.compact ?? false} />
      <Handle
        type="source"
        position={Position.Right}
        id={MODULE_HANDLE.right}
        isConnectable={false}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id={MODULE_HANDLE.bottom}
        isConnectable={false}
      />
    </>
  );
}
