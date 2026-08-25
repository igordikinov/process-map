// Deep-link `?stage=&node=` (SPEC.md §4.7, задача process-map-0y2).
//
// Единственная точка входа — useDeepLink(), вызывается один раз в App.tsx.
// Делает две вещи одним эффектом:
//   1) при монтировании читает location.search и переводит store на нужный
//      уровень/узел (см. didParseInitialUrl ниже — ровно один раз, иначе
//      deep-link переигрывался бы при каждом клике по карточке, потому что
//      currentStageId после этого тоже меняется и попадает в deps эффекта);
//   2) на каждое изменение currentStageId/selectedNodeId (клик по карточке,
//      «Назад», открытие/закрытие Drawer — не важно, откуда) переписывает URL
//      через `history.replaceState` (SPEC §4.7: не `pushState` — приложение
//      живёт в iframe корпоративной вики (SPEC §6), и `pushState` засорял бы
//      историю родительской страницы, ломая пользователю кнопку «назад»
//      браузера).
//
// Порядок вызовов navigateToStage → selectNode принципиален — см. комментарий
// в src/store/useProcessStore.ts: navigateToStage сбрасывает selectedNodeId.
// Обратный порядок молча теряет узел.
//
// Разрешение этапа по узлу: id узлов уникальны ГЛОБАЛЬНО по всему документу
// (см. комментарий validateIntegrity в src/data/schema.ts), поэтому параметр
// node, если он валиден, однозначно определяет свой этап и имеет приоритет
// над параметром stage. Это единое правило закрывает сразу два случая
// «устойчивости» из задачи:
//   - `?node=<id>` без `stage` — этап находится обратным поиском по узлу;
//   - узел из другого этапа, чем указан в `stage` — выигрывает этап узла,
//     потому что именно он даёт непустой экран (Drawer, открытый поверх
//     чужого этапа, был бы либо пуст, либо вводил бы в заблуждение), а
//     несовпадающий stage расценивается как устаревший/ошибочный.
// Во всех остальных случаях устойчивости (несуществующий этап/узел, `stage`
// не число, пустые значения) целевой этап не находится — приложение остаётся
// на уровне 1 (Обзор), а не падает и не показывает пустой экран.
import { useEffect, useRef } from 'react';
import type { ProcessMap, Stage } from '../data/schema';
import { useProcessStore } from '../store/useProcessStore';
import { useProcessMap } from './useProcessMap';

function findStageByNumber(map: ProcessMap, raw: string | null): Stage | undefined {
  if (raw === null || raw === '') {
    return undefined;
  }
  const number = Number(raw);
  if (!Number.isInteger(number)) {
    return undefined;
  }
  return map.stages.find((stage) => stage.number === number);
}

function findStageByNodeId(map: ProcessMap, raw: string | null): Stage | undefined {
  if (raw === null || raw === '') {
    return undefined;
  }
  return map.stages.find((stage) => stage.nodes.some((node) => node.id === raw));
}

export function useDeepLink(): void {
  const map = useProcessMap();
  const navigateToStage = useProcessStore((state) => state.navigateToStage);
  const selectNode = useProcessStore((state) => state.selectNode);
  // Значения читаются только затем, чтобы попасть в deps эффекта и заставить
  // его перезапуститься при любой навигации — САМ эффект берёт свежее
  // состояние через useProcessStore.getState() (см. комментарий ниже).
  const currentStageId = useProcessStore((state) => state.currentStageId);
  const selectedNodeId = useProcessStore((state) => state.selectedNodeId);

  const didParseInitialUrl = useRef(false);

  useEffect(() => {
    if (!didParseInitialUrl.current) {
      didParseInitialUrl.current = true;

      const initialParams = new URLSearchParams(window.location.search);
      const stageParam = initialParams.get('stage');
      const nodeParam = initialParams.get('node');

      const nodeStage = findStageByNodeId(map, nodeParam);
      const targetStage = nodeStage ?? findStageByNumber(map, stageParam);

      if (targetStage !== undefined) {
        navigateToStage(targetStage.id);
        // selectNode — только если узел реально нашёлся и принадлежит именно
        // targetStage (а он всегда принадлежит, раз targetStage взят из
        // nodeStage выше); пустой/битый node без валидного stage сюда не
        // попадёт вовсе (targetStage тогда undefined).
        if (nodeStage !== undefined && nodeParam !== null) {
          selectNode(nodeParam);
        }
      }
    }

    // Синхронизация URL. Через useProcessStore.getState(), а не через
    // currentStageId/selectedNodeId из замыкания выше: на первом проходе
    // (монтирование) оба эффекта в этом теле выполняются в одном commit без
    // промежуточного рендера — dispatch (navigateToStage/selectNode) уже
    // обновил стор синхронно (zustand), а пропсы текущего рендера — ещё нет.
    // getState() гарантирует, что URL сразу пишется по факту, без лишнего
    // кадра с неверным (пустым) query.
    const state = useProcessStore.getState();
    const params = new URLSearchParams(window.location.search);
    const stage =
      state.currentStageId === null
        ? undefined
        : map.stages.find((candidate) => candidate.id === state.currentStageId);

    if (stage === undefined) {
      // Либо уровень 1 (Обзор), либо currentStageId не резолвится в
      // существующий этап — в обоих случаях в URL деталям деталей не место.
      params.delete('stage');
      params.delete('node');
    } else {
      params.set('stage', String(stage.number));
      if (state.selectedNodeId === null) {
        params.delete('node');
      } else {
        params.set('node', state.selectedNodeId);
      }
    }

    const query = params.toString();
    const url = `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`;
    // SPEC §4.7: replaceState, НЕ pushState — история родительской вики не
    // должна расти при навигации внутри iframe.
    window.history.replaceState(window.history.state as unknown, '', url);
  }, [map, currentStageId, selectedNodeId, navigateToStage, selectNode]);
}
