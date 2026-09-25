// Экран «Все модули» — уровень 1 ТРЁХУРОВНЕВОЙ карты (эпик M8, задача
// process-map-9mn.16). Корень такой карты: карточки модулей, их связи и полоса
// FP&A. Клик по карточке уводит на экран этапов модуля (navigateToModule).
//
// ЗЕРКАЛО Overview.tsx, и намеренно: та же оболочка (шапка, полотно React Flow
// с сеткой, тулбар, легенда под полотном, пересчёт вида по режиму и карте) и
// те же CSS-классы — Overview.module.css берётся как есть. Читатель, у которого
// на соседних адресах живут карты обеих форм, не должен замечать, что корень у
// них собран разными компонентами. Отличаются только граф (modulesGraph.ts),
// бейдж шапки и подпись полотна.
//
// ПЕРЕКЛЮЧАТЕЛЬ ВЕРСИЙ ЖИВЁТ ЗДЕСЬ: на трёхуровневой карте корень — это
// уровень 1, а переключатель по SPEC §4.1 стоит на корне (на уровне шагов его
// нет вовсе, SPEC §4.2). Экран этапов модуля (уровень 2, process-map-9mn.17)
// переключателя не несёт: на трёхуровневой карте он не корень, и вместо шапки
// с версиями у него хлебные крошки.
import { useMemo } from 'react';
import {
  Background,
  BackgroundVariant,
  ReactFlow,
  ReactFlowProvider,
  type EdgeTypes,
  type NodeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { isImportedActive } from '../../data/activeMap';
import { hasModules } from '../../data/modules';
import { getSelectedVersionId, listVersions } from '../../data/versions';
import { selectVersion } from '../../data/versionSwitch';
import { useFrameSize } from '../../hooks/useFrameSize';
import { useProcessMap } from '../../hooks/useProcessMap';
import { ru } from '../../i18n/ru';
import { useProcessStore } from '../../store/useProcessStore';
import { ArtifactEdge, ArtifactIntegrationEdge, EdgeMarkers } from '../edges';
import { Legend } from '../Legend';
import { IntegrationNode } from '../nodes/IntegrationNode';
import { LaneNode } from '../nodes/LaneNode';
import { ModuleNode } from '../nodes/ModuleNode';
import { OverviewHeader } from '../Overview/OverviewHeader';
import {
  FIT_VIEW_PADDING,
  GRID_DOT_SIZE,
  GRID_GAP,
  MAX_ZOOM,
  MIN_ZOOM,
} from '../Overview/overviewGraph';
import { RefitViewport } from '../Overview/RefitViewport';
import { Toolbar } from '../Toolbar';
import { buildModulesGraph } from './modulesGraph';
import styles from '../Overview/Overview.module.css';

// На уровне модуля, а не в теле компонента: React Flow предупреждает, если
// nodeTypes/edgeTypes меняют идентичность между рендерами. `satisfies`, а не
// `as` — довод тот же, что в Overview.tsx (process-map-ge3).
const nodeTypes = {
  // Свой тип карточки модуля, а не 'stage' — см. шапку ModuleNode.tsx.
  module: ModuleNode,
  // Полоса map.lanes — тот же LaneNode, свой тип (см. ModuleLaneNodeType).
  moduleLane: LaneNode,
  lane: LaneNode,
  system: IntegrationNode,
} satisfies NodeTypes;

const edgeTypes = {
  artifact: ArtifactEdge,
  artifactIntegration: ArtifactIntegrationEdge,
} satisfies EdgeTypes;

const fitViewOptions = { padding: FIT_VIEW_PADDING };

/** Та же настройка, что в Overview.tsx (process-map-4hv): без ссылки-attribution. */
const proOptions = { hideAttribution: true };

export function ModulesOverview() {
  const showIntegrations = useProcessStore((state) => state.showIntegrations);
  const { ref: rootRef, compact } = useFrameSize();
  const map = useProcessMap();

  // Граф строится только для карты С МОДУЛЯМИ — сузить тип карты иначе, чем
  // hasModules(), нельзя (шапка src/data/modules.ts). App монтирует этот экран
  // лишь на трёхуровневой карте, но хуки обязаны идти до любого раннего
  // выхода, поэтому проверка — внутри useMemo, а не перед ним.
  const graph = useMemo(
    () => (hasModules(map) ? buildModulesGraph(map, showIntegrations, compact) : undefined),
    [map, showIntegrations, compact],
  );

  // hasModules второй раз — ради сужения типа map для map.modules ниже:
  // значение из useMemo сужения не переносит. Ответ у обеих проверок один.
  if (graph === undefined || !hasModules(map)) {
    return null;
  }

  const imported = isImportedActive();

  return (
    <div className={compact ? `${styles.root} ${styles.compact}` : styles.root} ref={rootRef}>
      <OverviewHeader
        title={map.title}
        stagesCount={map.stages.length}
        // Бейдж «5 модулей», а не «20 этапов» (решение владельца 24.09.2026):
        // этапов на этом экране нет, есть карточки модулей.
        modulesCount={map.modules.length}
        updatedAt={map.updatedAt}
        compact={compact}
        imported={imported}
        // При загруженной схеме версий не предлагаем — довод дословно тот же,
        // что в Overview.tsx.
        versions={imported ? [] : listVersions()}
        selectedVersionId={getSelectedVersionId()}
        onSelectVersion={selectVersion}
      />
      <div className={styles.canvas} role="region" aria-label={ru.overview.allModulesCanvasLabel}>
        <ReactFlowProvider>
          <EdgeMarkers>
            <ReactFlow
              nodes={graph.nodes}
              edges={graph.edges}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              nodesDraggable={false}
              nodesConnectable={false}
              elementsSelectable={false}
              // Фокус несут <button> карточек модулей — одна остановка Tab на
              // карточку, как на обзоре этапов.
              nodesFocusable={false}
              edgesFocusable={false}
              panOnScroll
              fitView
              fitViewOptions={fitViewOptions}
              minZoom={MIN_ZOOM}
              maxZoom={MAX_ZOOM}
              proOptions={proOptions}
            >
              <Background variant={BackgroundVariant.Dots} gap={GRID_GAP} size={GRID_DOT_SIZE} />
              <RefitViewport
                fitKey={`${String(compact)}:${map.id}`}
                fitViewOptions={fitViewOptions}
              />
            </ReactFlow>
          </EdgeMarkers>
          <Toolbar fitViewOptions={fitViewOptions} compact={compact} />
        </ReactFlowProvider>
      </div>
      <div className={styles.legendStrip}>
        <Legend compact={compact} />
      </div>
    </div>
  );
}
