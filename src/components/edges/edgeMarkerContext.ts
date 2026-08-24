// Контекст с id SVG-маркеров-стрелок.
//
// id маркеров глобальны для документа, а в M2 рядом с обзором появится
// StageDetail со своим набором рёбер: захардкоженные id дали бы дубли при
// одновременном монтировании. Поэтому id выдаёт useId() в EdgeMarkers, а рёбра
// читают их отсюда.
//
// Файл без JSX намеренно: хук и контекст в одном модуле с компонентом ломают
// react-refresh/only-export-components.
import { createContext, useContext } from 'react';

export interface EdgeMarkerIds {
  process: string;
  integration: string;
}

/** Пустые id — маркер просто не будет найден, ребро отрисуется без стрелки. */
export const EdgeMarkerContext = createContext<EdgeMarkerIds>({
  process: '',
  integration: '',
});

export function useEdgeMarkers(): EdgeMarkerIds {
  return useContext(EdgeMarkerContext);
}
