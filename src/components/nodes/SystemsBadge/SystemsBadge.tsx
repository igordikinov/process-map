// Строка-бейдж «Внешние системы …» — компактная замена двух dashed-свимлейнов
// уровня 1 (SPEC §4.5, артборд A4).
//
// Почему это узел React Flow, а не абсолютная плашка поверх полотна: строка
// показывает СОДЕРЖИМОЕ карты (какие системы участвуют в процессе), а не
// хром. Плашка поверх панорамируемого полотна рано или поздно перекрывает
// содержимое — ровно та причина, по которой из полотна убрали легенду
// (см. Legend.module.css). Узлом она участвует в fitView и живёт в тех же
// координатах, что и карточки этапов.
//
// Рёбер у строки нет намеренно: она обобщает обе стороны обмена сразу, и
// стрелка от неё к конкретному этапу означала бы направление, которого у
// свёрнутого списка нет. Связь «этап ↔ его системы» в компактном режиме несут
// карточки под этапами (overviewGraph.ts, systemNodeId('compact', …)).
import type { Node, NodeProps } from '@xyflow/react';
import type { SystemCode } from '../../../data/schema';
import { ru } from '../../../i18n/ru';
import styles from './SystemsBadge.module.css';

export interface SystemsBadgeData extends Record<string, unknown> {
  /** Коды систем в порядке появления в process.json — см. overviewGraph.ts. */
  systems: SystemCode[];
}

export type SystemsBadgeNodeType = Node<SystemsBadgeData, 'systemsBadge'>;

export function SystemsBadge({ data }: NodeProps<SystemsBadgeNodeType>) {
  return (
    <div className={styles.badge} role="group" aria-label={ru.overview.compactSystemsAriaLabel}>
      <span className={styles.eyebrow}>{ru.overview.compactSystems}</span>
      <span className={styles.codes}>
        {data.systems.map((system) => (
          <span key={system} className={styles.code}>
            {system}
          </span>
        ))}
      </span>
      <span className={styles.hint}>{ru.overview.compactLanesCollapsed}</span>
    </div>
  );
}
