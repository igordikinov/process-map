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
//
// ПОЧЕМУ ЗДЕСЬ НЕТ useNodesInitialized() (задача process-map-j2x).
// -------------------------------------------------------------
// Раньше вызов был закрыт условием `if (!nodesInitialized) return`, «чтобы не
// подгонять вид под неизмеренные узлы». В этом приложении этот флаг НИКОГДА не
// становится true, и fitView не вызывался ни разу — проверено логом в браузере:
// на смену режима эффект приходил с nodesInitialized === false и молча выходил.
// Причина в устройстве экрана: `nodes` — контролируемый проп, который
// buildOverviewGraph собирает заново, а `onNodesChange` у <ReactFlow> нет
// (узлы в v1 не двигаются). Поэтому React Flow не пишет измеренные размеры
// обратно в пользовательские узлы, а `store.nodesInitialized` пересчитывается
// только в setNodes() из `userNode.measured` — то есть остаётся false навсегда.
//
// Условие при этом было и не нужно: `useReactFlow().fitView()` не считает
// ничего немедленно, а СТАВИТ подгонку в очередь (`fitViewQueued`), и та
// разрешается либо в setNodes, либо в updateNodeInternals — то есть уже ПОСЛЕ
// того, как ResizeObserver React Flow измерил новые узлы. Ожидание, ради
// которого стоял флаг, обеспечивает сам React Flow.
import { useEffect, useRef } from 'react';
import { useReactFlow, type FitViewOptions } from '@xyflow/react';

export interface RefitViewportProps {
  /** Значение, смена которого обязана пересчитать вид. */
  compact: boolean;
  fitViewOptions: FitViewOptions;
}

export function RefitViewport({ compact, fitViewOptions }: RefitViewportProps) {
  const { fitView } = useReactFlow();
  // Одна подгонка на одно значение режима: без этого эффект перезапускался бы
  // от смены ссылки на fitView/fitViewOptions и дёргал бы вид на ровном месте.
  const appliedFor = useRef<boolean | null>(null);

  useEffect(() => {
    if (appliedFor.current === compact) {
      return;
    }
    appliedFor.current = compact;
    void fitView(fitViewOptions);
  }, [compact, fitView, fitViewOptions]);

  return null;
}
