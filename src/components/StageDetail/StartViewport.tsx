// Стартовый вид полотна уровня 2 (задачи process-map-l8a, process-map-c18).
//
// Почему не `fitView`: он подгоняет масштаб под габарит раскладки, а раскладки
// этапов до 3942 px шириной — подпись шага 13px превращалась в 3.2…6.9 px, то
// есть в нечитаемую полоску. Читаемый пол масштаба и привязку к первой карточке
// шага считает чистая функция initialViewport (stageGraph.ts), здесь только
// применение.
//
// Почему отдельный компонент, а не пропы <ReactFlow>: размеры полотна известны
// только после измерения контейнера, а `defaultViewport` применяется до него.
// Компонент рендерится ДЕТЬМИ <ReactFlow> (там уже есть контекст провайдера —
// ровно как у <Background>), поэтому ему доступны и useStore, и useReactFlow.
import { useEffect, useRef } from 'react';
import { useReactFlow, useStore } from '@xyflow/react';
import { initialViewport, type Box } from './stageGraph';

export interface StartViewportProps {
  /** Габарит раскладки из buildStageGraph — с учётом рамок групп и колонок. */
  bounds: Box;
  /** Якорь стартового вида из buildStageGraph — первая карточка шага. */
  anchor: Box;
  /**
   * Компактный режим (SPEC §4.5). Не влияет на сам расчёт, но обязан
   * ПЕРЕСЧИТАТЬ стартовый вид: смена режима меняет высоту шапки и полосы
   * легенды, то есть высоту полотна, — SPEC §4.5 прямо требует «fitView
   * вызывается заново».
   */
  compact: boolean;
}

export function StartViewport({ bounds, anchor, compact }: StartViewportProps) {
  const { setViewport } = useReactFlow();
  const width = useStore((state) => state.width);
  const height = useStore((state) => state.height);
  // Хранится НЕ «применяли ли вообще», а «для какого режима применяли»:
  // null — ещё ни разу. Так однократность сохраняется внутри режима, а
  // переключение режима даёт ровно один новый стартовый вид.
  const appliedFor = useRef<boolean | null>(null);

  useEffect(() => {
    // Полотно ещё не измерено — ждём первого ненулевого размера.
    if (appliedFor.current === compact || width === 0 || height === 0) {
      return;
    }
    appliedFor.current = compact;
    // Ровно один раз на этап и режим: <ReactFlowProvider key={stage.id}>
    // размонтирует и этот компонент вместе с флагом, поэтому смена этапа даёт
    // новый стартовый вид, а ресайз окна внутри одного режима — нет. Сбрасывать
    // вьюпорт на каждый ресайз нельзя: это затирало бы пан и зум, которые
    // пользователь уже выставил руками.
    void setViewport(initialViewport(bounds, { width, height }, anchor));
  }, [bounds, anchor, compact, width, height, setViewport]);

  return null;
}
