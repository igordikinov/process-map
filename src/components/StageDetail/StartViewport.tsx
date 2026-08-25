// Стартовый вид полотна уровня 2 (задача process-map-l8a).
//
// Почему не `fitView`: он подгоняет масштаб под габарит раскладки, а раскладки
// этапов до 3942 px шириной — подпись шага 13px превращалась в 3.2…6.9 px, то
// есть в нечитаемую полоску. Читаемый пол масштаба и привязку к началу потока
// считает чистая функция initialViewport (stageGraph.ts), здесь только
// применение.
//
// Почему отдельный компонент, а не пропы <ReactFlow>: размеры полотна известны
// только после измерения контейнера, а `defaultViewport` применяется до него.
// Компонент рендерится ДЕТЯМИ <ReactFlow> (там уже есть контекст провайдера —
// ровно как у <Background>), поэтому ему доступны и useStore, и useReactFlow.
import { useEffect, useRef } from 'react';
import { useReactFlow, useStore } from '@xyflow/react';
import { initialViewport, type Box } from './stageGraph';

export interface StartViewportProps {
  /** Габарит раскладки из buildStageGraph — с учётом рамок групп и колонок. */
  bounds: Box;
}

export function StartViewport({ bounds }: StartViewportProps) {
  const { setViewport } = useReactFlow();
  const width = useStore((state) => state.width);
  const height = useStore((state) => state.height);
  const applied = useRef(false);

  useEffect(() => {
    // Полотно ещё не измерено — ждём первого ненулевого размера.
    if (applied.current || width === 0 || height === 0) {
      return;
    }
    applied.current = true;
    // Ровно один раз на этап: <ReactFlow key={stage.id}> размонтирует и этот
    // компонент вместе с флагом, поэтому смена этапа даёт новый стартовый вид,
    // а ресайз окна — нет. Сбрасывать вьюпорт на каждый ресайз нельзя: это
    // затирало бы пан и зум, которые пользователь уже выставил руками.
    void setViewport(initialViewport(bounds, { width, height }));
  }, [bounds, width, height, setViewport]);

  return null;
}
