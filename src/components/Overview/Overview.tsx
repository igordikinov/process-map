// Экран «Обзор процесса, уровень 1» (SPEC §4.1, артборд A1).
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
import { loadProcessMap } from '../../data/loader';
import { ru } from '../../i18n/ru';
import { useProcessStore } from '../../store/useProcessStore';
import { EdgeMarkers, IntegrationEdge, ProcessEdge } from '../edges';
import { Legend } from '../Legend';
import { IntegrationNode } from '../nodes/IntegrationNode';
import { LaneNode } from '../nodes/LaneNode';
import { StageNode } from '../nodes/StageNode';
import { Toolbar } from '../Toolbar';
import { OverviewHeader } from './OverviewHeader';
import {
  buildOverviewGraph,
  FIT_VIEW_PADDING,
  GRID_DOT_SIZE,
  GRID_GAP,
  MAX_ZOOM,
  MIN_ZOOM,
} from './overviewGraph';
import styles from './Overview.module.css';

// Объекты объявлены на уровне модуля: React Flow предупреждает, если nodeTypes
// или edgeTypes меняют идентичность между рендерами.
const nodeTypes = {
  lane: LaneNode,
  system: IntegrationNode,
  stage: StageNode,
} as unknown as NodeTypes;

const edgeTypes = {
  process: ProcessEdge,
  integration: IntegrationEdge,
} as unknown as EdgeTypes;

const fitViewOptions = { padding: FIT_VIEW_PADDING };

export function Overview() {
  const showIntegrations = useProcessStore((state) => state.showIntegrations);

  // Данные статичны в пределах сессии просмотра: loadProcessMap() читает
  // process.json + overrides из localStorage один раз при монтировании.
  const map = useMemo(() => loadProcessMap(), []);
  const { nodes, edges } = useMemo(
    () => buildOverviewGraph(map, showIntegrations),
    [map, showIntegrations],
  );

  return (
    <div className={styles.root}>
      <OverviewHeader title={map.title} stagesCount={map.stages.length} updatedAt={map.updatedAt} />
      {/* role="region", а не "application": схема статична, а application
          переводит скринридер в режим прямого прохода клавиш и глушит
          навигацию по элементам. */}
      <div className={styles.canvas} role="region" aria-label={ru.overview.canvasLabel}>
        {/* ReactFlowProvider — общий контекст для <ReactFlow> и тулбара:
            Toolbar рендерится РЯДОМ с полотном, не внутри него (см. подробное
            объяснение в Toolbar.tsx), поэтому его useReactFlow()/useViewport()
            нужен провайдер уровнем выше, а не автосозданный <ReactFlow>. */}
        <ReactFlowProvider>
          <EdgeMarkers>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              nodesDraggable={false}
              nodesConnectable={false}
              elementsSelectable={false}
              // Фокус несут <button> карточек этапов; собственные tabIndex узлов и
              // рёбер React Flow добавляли 18 лишних остановок Tab до первой карточки.
              nodesFocusable={false}
              edgesFocusable={false}
              panOnScroll
              fitView
              fitViewOptions={fitViewOptions}
              minZoom={MIN_ZOOM}
              maxZoom={MAX_ZOOM}
            >
              <Background variant={BackgroundVariant.Dots} gap={GRID_GAP} size={GRID_DOT_SIZE} />
            </ReactFlow>
          </EdgeMarkers>
          {/* Тот же fitViewOptions, что и автозапуск fitView выше (SPEC §4.6):
              на уровне 1 пола читаемости нет, кнопка «Уместить в экран» просто
              повторяет исходный вид. */}
          <Toolbar fitViewOptions={fitViewOptions} />
          <Legend />
        </ReactFlowProvider>
      </div>
    </div>
  );
}
