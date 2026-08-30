// Экран «Детализация этапа, уровень 2» (SPEC §4.2, артборд A2).
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
import { useFrameSize } from '../../hooks/useFrameSize';
import { useProcessMap } from '../../hooks/useProcessMap';
import { ru } from '../../i18n/ru';
import { useProcessStore } from '../../store/useProcessStore';
import { Breadcrumbs } from '../Breadcrumbs';
import { EdgeMarkers, IntegrationEdge, ProcessEdge } from '../edges';
import { Legend } from '../Legend';
import { NodeDrawer } from '../NodeDrawer';
import { DataNode } from '../nodes/DataNode';
import { GroupNode } from '../nodes/GroupNode';
import { StepNode } from '../nodes/StepNode';
import { WarningNode } from '../nodes/WarningNode';
import { Toolbar } from '../Toolbar';
import {
  buildStageGraph,
  GRID_DOT_SIZE,
  GRID_GAP,
  MAX_ZOOM,
  MIN_ZOOM,
  TOOLBAR_FIT_VIEW_OPTIONS,
} from './stageGraph';
import { StartViewport } from './StartViewport';
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

/** Убирает ссылку-attribution React Flow — обоснование в Overview.tsx (4hv). */
const proOptions = { hideAttribution: true };

export function StageDetail() {
  const currentStageId = useProcessStore((state) => state.currentStageId);
  const showIntegrations = useProcessStore((state) => state.showIntegrations);
  const selectedNodeId = useProcessStore((state) => state.selectedNodeId);

  // SPEC §4.5: режим решает высота КОНТЕЙНЕРА (приложение в iframe, SPEC §6).
  const { ref: rootRef, compact } = useFrameSize();

  // Карта с наложенными overrides, реактивно к правкам редактора (SPEC §4.4):
  // сохранённая в панели ссылка сразу появляется и в самой панели, и иконкой
  // link-external на карточке шага (SPEC §4.2). См. src/hooks/useProcessMap.ts.
  const map = useProcessMap();
  const stage = map.stages.find((candidate) => candidate.id === currentStageId);
  const graph = useMemo(
    () => (stage === undefined ? undefined : buildStageGraph(stage, showIntegrations)),
    [stage, showIntegrations],
  );

  // Уровень выбирает App.tsx по currentStageId, поэтому сюда можно попасть
  // только с существующим этапом. Рассинхрон (например, id из старого
  // deep-link) не должен ронять приложение — показываем пустой экран, решение
  // о возврате на уровень 1 принимает пользователь кнопкой «Назад» в крошках.
  if (stage === undefined || graph === undefined) {
    return null;
  }

  // Панели отдаются только те узлы, которые СЕЙЧАС нарисованы на полотне, а не
  // все узлы этапа. Иначе выключенный toggle «Показать интеграции» (SPEC §4.6)
  // убирал карточку узла-интеграции с полотна, но оставлял открытой панель с
  // его описанием: подсветки нет, затемнение лежит на пустом месте, и вернуть
  // фокус на карточку при закрытии тоже некуда. Это тот же принцип, что уже
  // записан в store (navigateToStage/back сбрасывают selectedNodeId): панель
  // не переживает исчезновение своего узла с экрана. Список берётся из
  // graph.nodes, а не пересобирается своим фильтром, — правило видимости
  // остаётся одно, в buildStageGraph. Контейнеры групп/колонок отсеиваются
  // сами: их id (`group:…`, `column:…`) не совпадают ни с одним ProcessNode.
  const renderedIds = new Set(graph.nodes.map((node) => node.id));
  const visibleNodes = stage.nodes.filter((node) => renderedIds.has(node.id));
  const drawerOpen = visibleNodes.some((node) => node.id === selectedNodeId);

  return (
    <div className={compact ? `${styles.root} ${styles.compact}` : styles.root} ref={rootRef}>
      <Breadcrumbs stages={map.stages} compact={compact} />
      {/* role="region", а не "application" — см. комментарий в Overview.tsx. */}
      <div className={styles.canvas} role="region" aria-label={ru.stageDetail.canvasLabel}>
        {/* key по этапу на самом провайдере (не только на <ReactFlow> ниже):
            смена этапа обязана пересобрать ОБЩИЙ store React Flow целиком,
            иначе Toolbar (сиблинг <ReactFlow>, читает viewport из того же
            store — см. Toolbar.tsx) на миг унаследовал бы масштаб/сдвиг
            предыдущего этапа, пока StartViewport его не перезапишет. Раскладки
            отличаются в разы (3942×1088 у этапа 2 против 3528×296 у этапа 1). */}
        <ReactFlowProvider key={stage.id}>
          <EdgeMarkers>
            <ReactFlow
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
              // fitView намеренно НЕ используется: он опускал масштаб до 0.25…0.53
              // и делал подписи нечитаемыми. Стартовый вид — StartViewport.
              // minZoom/maxZoom здесь остаются границами РУЧНОГО зума (колесо,
              // тулбар): отдалить схему целиком пользователь по-прежнему может.
              minZoom={MIN_ZOOM}
              maxZoom={MAX_ZOOM}
              proOptions={proOptions}
            >
              <StartViewport
                bounds={graph.bounds}
                anchor={graph.startAnchor}
                compact={compact}
              />
              <Background variant={BackgroundVariant.Dots} gap={GRID_GAP} size={GRID_DOT_SIZE} />
            </ReactFlow>
          </EdgeMarkers>
          {/* Кнопка «Уместить в экран» уважает тот же пол читаемости, что и
              стартовый вид (SPEC §4.6) — см. комментарий у TOOLBAR_FIT_VIEW_OPTIONS
              в stageGraph.ts. */}
          {/* drawerOpen: панель шириной 360 накрывает правый верхний угол
              полотна вместе со всем тулбаром — см. .shifted в Toolbar.module.css. */}
          <Toolbar fitViewOptions={TOOLBAR_FIT_VIEW_OPTIONS} drawerOpen={drawerOpen} />
        </ReactFlowProvider>
        {/* Боковая панель узла — внутри .canvas, чтобы затемнение начиналось
            под шапкой крошек, как в артборде A3 (SPEC §4.3). */}
        <NodeDrawer nodes={visibleNodes} />
      </div>
      {/* Легенда — строка ПОД полотном, не поверх него: раскладка потока
          шагов на реальных данных занимает весь угол/край полотна на всех
          4 этапах (см. Legend.module.css) — плавающая панель гарантированно
          перекрыла бы что-нибудь. Легенде не нужен React Flow, поэтому она
          и не внутри .canvas/<ReactFlowProvider>. */}
      {/* Компактный режим (SPEC §4.5) ужимает полосу под кнопку-иконку,
          но не возвращает легенду на полотно — см. Legend.tsx. */}
      <div className={styles.legendStrip}>
        <Legend compact={compact} />
      </div>
    </div>
  );
}
