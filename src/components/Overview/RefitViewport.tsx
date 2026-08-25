// Пересчёт стартового вида обзора при смене режима (SPEC §4.5: «fitView
// вызывается заново», задача process-map-5l3).
//
// <ReactFlow fitView> отрабатывает один раз при монтировании. Компактный режим
// определяется ПОСЛЕ первого кадра (ResizeObserver измеряет контейнер, см.
// useFrameSize), и переключение меняет и размеры карточек этапов, и их
// координаты, и состав узлов (свимлейны → строка-бейдж). Без повторного
// fitView раскладка осталась бы подогнанной под прежний режим — часть карточек
// за кадром.
//
// Компонент рендерится ДЕТЬМИ <ReactFlow> — как <Background> и StartViewport
// уровня 2: там уже есть контекст провайдера.
import { useEffect, useRef } from 'react';
import { useNodesInitialized, useReactFlow, type FitViewOptions } from '@xyflow/react';

export interface RefitViewportProps {
  /** Значение, смена которого обязана пересчитать вид. */
  compact: boolean;
  fitViewOptions: FitViewOptions;
}

export function RefitViewport({ compact, fitViewOptions }: RefitViewportProps) {
  const { fitView } = useReactFlow();
  // Узлы компактного режима другого размера, и подгонять вид до того, как
  // React Flow их измерил, бессмысленно — получится масштаб под старые
  // габариты.
  const nodesInitialized = useNodesInitialized();
  const appliedFor = useRef<boolean | null>(null);

  useEffect(() => {
    if (appliedFor.current === compact || !nodesInitialized) {
      return;
    }
    appliedFor.current = compact;
    void fitView(fitViewOptions);
  }, [compact, nodesInitialized, fitView, fitViewOptions]);

  return null;
}
