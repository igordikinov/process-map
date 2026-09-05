// Подпись на ребре: «Да», «Нет», условие ветвления (process-map-70e.6).
//
// ЗАЧЕМ ЭТО ПОЯВИЛОСЬ. Поле `label` было в схеме с самого начала, доезжало до
// объекта ребра React Flow — и не рисовалось ничем: оба edge-компонента брали
// у `getSmoothStepPath` только путь и выбрасывали `labelX`/`labelY`. Пока
// карты собирались из презентаций, это ничего не стоило: подпись не задана ни
// у одного из 80 рёбер обеих карт. С импортом BPMN стоит: в модели владельца
// 148 связей названы «Да» или «Нет», и развилка без подписей ветвей не
// сообщает читателю ничего.
//
// ПОЧЕМУ HTML, А НЕ SVG-ТЕКСТ. У React Flow есть `EdgeText`, но он рисует
// <text> и стилизуется объектами `CSSProperties` с цветами прямо в .tsx — это
// запрещено правилом проекта (хардкод цвета вне токенов). Остальной хром
// приложения — HTML и CSS-модули, поэтому подпись тоже HTML: заодно бесплатно
// достаются перенос, многоточие и `title` с полным текстом.
import type { ReactNode } from 'react';
import { EdgeLabelRenderer } from '@xyflow/react';
import styles from './EdgeLabel.module.css';

export interface EdgeLabelProps {
  /**
   * Подпись, как её отдаёт React Flow.
   *
   * Тип `ReactNode`, а не `string`, потому что таков `EdgeProps.label` в
   * @xyflow/react. Сужение делается ЗДЕСЬ, в одном месте, а не в каждом
   * edge-компоненте: модель разрешает ребру только строковую подпись
   * (`Edge.label` в src/data/schema.ts), и всё остальное подписью не считается.
   */
  label?: ReactNode;
  /** Точка на пути, которую вернул getSmoothStepPath. */
  x: number;
  y: number;
}

export function EdgeLabel({ label, x, y }: EdgeLabelProps) {
  // РАННИЙ ВЫХОД ОБЯЗАТЕЛЕН. Без него на картах snp и mrp появились бы 80
  // пустых подложек поверх узлов — единственный способ испортить существующие
  // карты этой правкой.
  if (typeof label !== 'string' || label.trim() === '') {
    return null;
  }

  return (
    <EdgeLabelRenderer>
      <div
        className={styles.label}
        // Позиция приходит из геометрии пути и меняется при каждом
        // панорамировании — в CSS-модуль её не вынести.
        style={{ transform: `translate(-50%, -50%) translate(${x}px, ${y}px)` }}
        title={label}
      >
        {label}
      </div>
    </EdgeLabelRenderer>
  );
}
