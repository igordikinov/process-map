import { useEffect, useRef, type Dispatch, type SetStateAction } from 'react';
import {
  applyNodeChanges,
  Background,
  BackgroundVariant,
  ReactFlow,
  useNodesState,
  type EdgeTypes,
  type NodeTypes,
} from '@xyflow/react';
import { EdgeMarkers } from '../components/edges';
import { StartViewport } from '../components/StageDetail/StartViewport';
import {
  GRID_DOT_SIZE,
  GRID_GAP,
  MAX_ZOOM,
  MIN_ZOOM,
  TOOLBAR_FIT_VIEW_OPTIONS,
  groupContainerId,
  type StageGraph,
  type StageDetailNode,
} from '../components/StageDetail/stageGraph';
import { Toolbar } from '../components/Toolbar';
import { NodeDrawer } from '../components/NodeDrawer';
import { ru } from '../i18n/ru';
import { useEditor } from './interaction';
import { EditorInspector } from './EditorInspector';
import { defaultEdgeKind } from './geometry';
import { editorId } from './operations';
import styles from './Editor.module.css';

interface Props {
  graph: StageGraph;
  compact: boolean;
  drawerOpen: boolean;
  nodeTypes: NodeTypes;
  edgeTypes: EdgeTypes;
  setHeights: Dispatch<SetStateAction<Map<string, number>>>;
}
export function StageFlow({ graph, compact, drawerOpen, nodeTypes, edgeTypes, setHeights }: Props) {
  const editor = useEditor()!;
  const dragging = useRef(false);
  const runtimeNodes = () =>
    graph.nodes.map(
      (node) =>
        ({
          ...node,
          className:
            editor.editable &&
            editor.target?.kind === 'group' &&
            node.id === groupContainerId(editor.target.id)
              ? 'pm-editor-selected'
              : undefined,
          ...(node.type === 'detail'
            ? {
                height: undefined,
                measured: { width: node.width, height: node.height },
                style: { ...node.style, height: undefined },
              }
            : {}),
          draggable: editor.editable && (node.type !== 'groupBox' || node.data.kind === 'group'),
          connectable: editor.editable && node.type !== 'groupBox',
          extent: editor.editable ? undefined : node.extent,
          ...(node.type === 'groupBox' && node.data.kind === 'group'
            ? { dragHandle: '.pm-group-handle' }
            : {}),
        }) as StageDetailNode,
    );
  const [nodes, setNodes] = useNodesState<StageDetailNode>(runtimeNodes());
  useEffect(() => {
    if (!dragging.current) setNodes(runtimeNodes());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph, editor.editable, editor.target, setNodes]);
  const visible = new Set(graph.nodes.map((node) => node.id));
  return (
    <>
      <EdgeMarkers>
        <ReactFlow
          nodes={nodes}
          edges={graph.edges.map((edge) => ({
            ...edge,
            className:
              editor.editable && editor.target?.kind === 'edge' && editor.target.id === edge.id
                ? 'pm-editor-selected'
                : undefined,
          }))}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          nodesDraggable={editor.editable}
          nodesConnectable={editor.editable}
          elementsSelectable={false}
          nodesFocusable={false}
          edgesFocusable={editor.editable}
          deleteKeyCode={null}
          nodeClickDistance={4}
          snapToGrid={editor.editable}
          snapGrid={[16, 16]}
          panOnScroll
          minZoom={MIN_ZOOM}
          maxZoom={MAX_ZOOM}
          proOptions={{ hideAttribution: true }}
          inert={!editor.editable && drawerOpen ? '' : undefined}
          onNodesChange={(changes) => {
            const dimensions = changes.filter((change) => change.type === 'dimensions');
            if (dimensions.length)
              setHeights((previous) => {
                let next = previous;
                for (const change of dimensions) {
                  if (
                    change.dimensions &&
                    editor.stage.nodes.some(
                      (node) => node.id === change.id && node.type === 'detail',
                    ) &&
                    previous.get(change.id) !== change.dimensions.height
                  ) {
                    if (next === previous) next = new Map(previous);
                    next.set(change.id, change.dimensions.height);
                  }
                }
                return next;
              });
            if (editor.editable)
              setNodes((previous) =>
                applyNodeChanges(
                  changes.filter((change) => change.type === 'position'),
                  previous,
                ),
              );
          }}
          onNodeDragStart={() => {
            dragging.current = true;
          }}
          onNodeDragStop={(_event, node) => {
            dragging.current = false;
            const before = graph.nodes.find((item) => item.id === node.id);
            if (!before) return;
            let success: boolean;
            if (node.type === 'groupBox') {
              const group = editor.stage.groups.find(
                (item) => groupContainerId(item.id) === node.id,
              );
              success = group
                ? editor.run({
                    type: 'moveGroup',
                    id: group.id,
                    dx: node.position.x - before.position.x,
                    dy: node.position.y - before.position.y,
                  })
                : false;
            } else {
              const origin = graph.nodes.find((item) => item.id === before.parentId)?.position ?? {
                x: 0,
                y: 0,
              };
              success = editor.run({
                type: 'moveNode',
                id: node.id,
                position: { x: node.position.x + origin.x, y: node.position.y + origin.y },
              });
            }
            if (!success) setNodes(runtimeNodes());
          }}
          onConnect={(connection) =>
            editor.request(() => {
              const source = editor.stage.nodes.find((node) => node.id === connection.source);
              const target = editor.stage.nodes.find((node) => node.id === connection.target);
              if (source && target) {
                const edge = {
                  id: editorId('edge'),
                  source: source.id,
                  target: target.id,
                  kind: defaultEdgeKind(source, target),
                };
                if (editor.run({ type: 'upsertEdge', edge }))
                  editor.select({ kind: 'edge', id: edge.id }, true);
              }
            })
          }
          onEdgeClick={(_event, edge) => {
            if (editor.editable) editor.select({ kind: 'edge', id: edge.id });
          }}
        >
          <StartViewport bounds={graph.bounds} anchor={graph.startAnchor} compact={compact} />
          <Background variant={BackgroundVariant.Dots} gap={GRID_GAP} size={GRID_DOT_SIZE} />
        </ReactFlow>
      </EdgeMarkers>
      <Toolbar
        fitViewOptions={TOOLBAR_FIT_VIEW_OPTIONS}
        drawerOpen={editor.editable ? editor.target !== null : drawerOpen}
        compact={compact}
      />
      {editor.editable ? (
        <EditorInspector />
      ) : (
        <NodeDrawer nodes={editor.stage.nodes.filter((node) => visible.has(node.id))} />
      )}
      {editor.editable && editor.stage.nodes.length === 0 && (
        <div className={styles.empty}>
          <p>{ru.editor.empty}</p>
          <button
            type="button"
            className={styles.button}
            onClick={() => editor.select({ kind: 'createNode', x: 0, y: 0 })}
          >
            {ru.editor.addNode}
          </button>
        </div>
      )}
      {editor.error && !editor.target && (
        <p className={`${styles.message} ${styles.notices}`} role="alert">
          {editor.error}
        </p>
      )}
    </>
  );
}
