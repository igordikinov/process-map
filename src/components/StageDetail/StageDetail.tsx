// Экран «Детализация этапа, уровень 2» (SPEC §4.2, артборд A2).
import { useMemo } from 'react';
import {
  Background,
  BackgroundVariant,
  ReactFlow,
  type EdgeTypes,
  type NodeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { loadProcessMap } from '../../data/loader';
import { ru } from '../../i18n/ru';
import { useProcessStore } from '../../store/useProcessStore';
import { Breadcrumbs } from '../Breadcrumbs';
import { EdgeMarkers, IntegrationEdge, ProcessEdge } from '../edges';
import { DataNode } from '../nodes/DataNode';
import { GroupNode } from '../nodes/GroupNode';
import { StepNode } from '../nodes/StepNode';
import { WarningNode } from '../nodes/WarningNode';
import {
  buildStageGraph,
  FIT_VIEW_PADDING,
  GRID_DOT_SIZE,
  GRID_GAP,
  MAX_ZOOM,
  MIN_ZOOM,
} from './stageGraph';
import styles from './StageDetail.module.css';

// Объекты объявлены на уровне модуля: React Flow предупреждает, если nodeTypes
// или edgeTypes меняют идентичность между рендерами.
const nodeTypes = {
  groupBox: GroupNode,
  step: StepNode,
  warning: WarningNode,
  data: DataNode,
} as unknown as NodeTypes;

const edgeTypes = {
  process: ProcessEdge,
  integration: IntegrationEdge,
} as unknown as EdgeTypes;

const fitViewOptions = { padding: FIT_VIEW_PADDING, minZoom: MIN_ZOOM, maxZoom: MAX_ZOOM };

export function StageDetail() {
  const currentStageId = useProcessStore((state) => state.currentStageId);

  // Данные статичны в пределах сессии просмотра (см. Overview.tsx).
  const map = useMemo(() => loadProcessMap(), []);
  const stage = map.stages.find((candidate) => candidate.id === currentStageId);
  const graph = useMemo(() => (stage === undefined ? undefined : buildStageGraph(stage)), [stage]);

  // Уровень выбирает App.tsx по currentStageId, поэтому сюда можно попасть
  // только с существующим этапом. Рассинхрон (например, id из старого
  // deep-link) не должен ронять приложение — показываем пустой экран, решение
  // о возврате на уровень 1 принимает пользователь кнопкой «Назад» в крошках.
  if (stage === undefined || graph === undefined) {
    return null;
  }

  return (
    <div className={styles.root}>
      <Breadcrumbs stages={map.stages} />
      {/* role="region", а не "application" — см. комментарий в Overview.tsx. */}
      <div className={styles.canvas} role="region" aria-label={ru.stageDetail.canvasLabel}>
        <EdgeMarkers>
          <ReactFlow
            // key по этапу: смена этапа пересобирает полотно целиком и заново
            // запускает fitView — иначе после перехода остаётся вьюпорт
            // предыдущего этапа, а раскладки различаются в разы (3926×1064 у
            // этапа 2 против 3512×272 у этапа 1).
            key={stage.id}
            nodes={graph.nodes}
            edges={graph.edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable={false}
            // Фокус несут <button> карточек узлов (см. overviewGraph.ts).
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
      </div>
    </div>
  );
}
