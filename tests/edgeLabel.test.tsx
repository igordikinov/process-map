// Подписи на рёбрах и ребро к артефакту данных (process-map-70e.6).
//
// Проверяется ДВА разных утверждения, и второе не менее важное первого:
//   · подпись доезжает до экрана, когда она есть;
//   · и НИЧЕГО не появляется, когда её нет. Второе — единственный способ
//     испортить этой правкой карты snp и mrp: без раннего выхода на них легли
//     бы 80 пустых подложек поверх узлов.
import { createElement, type ComponentType } from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ReactFlow, ReactFlowProvider, type Edge as FlowEdge, type Node } from '@xyflow/react';
import { EdgeLabel } from '../src/components/edges/EdgeLabel';
import { DataEdge, EdgeMarkers, IntegrationEdge, ProcessEdge } from '../src/components/edges';
import { buildStageGraph } from '../src/components/StageDetail/stageGraph';
import { loadBaseProcessMap } from '../src/data/loader';
import { ProcessMapSchema, type Stage } from '../src/data/schema.ts';
import { buildSampleProcessMap } from './fixtures/sample-process.ts';

// ───────────────── подпись как компонент ─────────────────

/** EdgeLabelRenderer рисует в портал React Flow — без полотна его нет. */
function renderInFlow(ui: React.ReactNode) {
  const nodes: Node[] = [];
  const edges: FlowEdge[] = [];
  return render(
    <ReactFlowProvider>
      <div style={{ width: 400, height: 300 }}>
        <ReactFlow nodes={nodes} edges={edges}>
          {ui}
        </ReactFlow>
      </div>
    </ReactFlowProvider>,
  );
}

describe('EdgeLabel', () => {
  it('рисует непустую подпись', () => {
    renderInFlow(<EdgeLabel label="Да" x={10} y={20} />);
    expect(screen.getByText('Да')).toBeInTheDocument();
  });

  it('полный текст остаётся в title: подпись обрезается многоточием', () => {
    renderInFlow(<EdgeLabel label="Сумма заказа больше миллиона" x={0} y={0} />);
    expect(screen.getByTitle('Сумма заказа больше миллиона')).toBeInTheDocument();
  });

  /*
   * Ради этих трёх случаев и написан ранний выход. Пустая подложка поверх узла
   * выглядела бы как артефакт отрисовки, а не как отсутствие подписи.
   */
  it.each([
    ['undefined', undefined],
    ['пустая строка', ''],
    ['одни пробелы', '   '],
  ])('при подписи «%s» не рисует ничего', (_name, label) => {
    const { container } = renderInFlow(<EdgeLabel label={label} x={0} y={0} />);
    expect(container.querySelectorAll('.react-flow__edgelabel-renderer > *')).toHaveLength(0);
  });

  /*
   * React Flow типизирует EdgeProps.label как ReactNode, поэтому сузить его
   * обязан сам компонент. Модель разрешает ребру только строковую подпись.
   */
  it('нестроковая подпись подписью не считается', () => {
    const { container } = renderInFlow(<EdgeLabel label={<span>узел</span>} x={0} y={0} />);
    expect(container.querySelectorAll('.react-flow__edgelabel-renderer > *')).toHaveLength(0);
  });
});

// ───────────────── выбор типа ребра ─────────────────

/** Этап с тремя рёбрами разных видов между первыми узлами потока. */
function stageWithEdgeKinds(): Stage {
  const map = buildSampleProcessMap();
  const stage = map.stages[0];
  expect(stage).toBeTruthy();
  const flow = (stage as Stage).nodes.filter((node) => node.type !== 'data');
  expect(flow.length).toBeGreaterThanOrEqual(4);
  const [a, b, c, d] = flow;
  const edges = [
    { id: 'e-process', source: a!.id, target: b!.id, kind: 'process' as const, label: 'Да' },
    { id: 'e-integration', source: b!.id, target: c!.id, kind: 'integration' as const },
    { id: 'e-data', source: c!.id, target: d!.id, kind: 'data' as const },
  ];
  return ProcessMapSchema.parse({ ...map, stages: [{ ...stage, edges }] }).stages[0] as Stage;
}

describe('stageGraph: вид ребра выбирается явно', () => {
  const graph = buildStageGraph(stageWithEdgeKinds());
  const byId = new Map(graph.edges.map((edge) => [edge.id, edge]));

  /*
   * ГЛАВНАЯ ПРОВЕРКА ЭТОГО БЛОКА. Раньше стоял тернарник «всё, что не
   * integration, — поток», и значение kind: 'data' из схемы было мёртвым:
   * в картах из презентаций таких рёбер нет, и заметить это было негде.
   */
  it('ребро к артефакту данных получает свой тип, а не тип потока', () => {
    expect(byId.get('e-data')?.type).toBe('data');
  });

  it('интеграция и поток не задеты', () => {
    expect(byId.get('e-integration')?.type).toBe('integration');
    expect(byId.get('e-process')?.type).toMatch(/^process/);
  });

  it('подпись доезжает до объекта ребра', () => {
    expect(byId.get('e-process')?.label).toBe('Да');
    expect(byId.get('e-integration')?.label).toBeUndefined();
  });
});

// ───────────────── регрессия на поставляемых картах ─────────────────

describe('поставляемые карты не задеты', () => {
  /*
   * Числовая опора всей правки: ни одно ребро snp и mrp не имеет подписи,
   * поэтому отрисовка подписей для них доказуемо ничего не меняет. Если
   * подпись у ребра однажды появится, тест покраснеет — и это правильно:
   * значит вид карты изменился и его надо посмотреть глазами.
   */
  it('ни у одного ребра встроенной карты нет подписи', () => {
    const map = loadBaseProcessMap();
    const withLabel = [...map.stages.flatMap((stage) => stage.edges), ...map.overviewEdges].filter(
      (edge) => edge.label !== undefined,
    );
    expect(withLabel).toEqual([]);
  });

  it('ни одно ребро встроенной карты не имеет вида data', () => {
    const map = loadBaseProcessMap();
    const dataEdges = map.stages.flatMap((stage) =>
      stage.edges.filter((edge) => edge.kind === 'data'),
    );
    expect(dataEdges).toEqual([]);
  });
});

// ───────────────── компоненты рёбер монтируются ─────────────────

describe('edge-компоненты не падают внутри полотна', () => {
  /*
   * Пропсы ребра React Flow шире того, что реально читают компоненты. Приведение
   * через unknown, а не `as never`: распространить never нельзя, а перечислять
   * два десятка неиспользуемых полей — шум, скрывающий смысл теста.
   */
  const props = {
    id: 'e1',
    source: 'a',
    target: 'b',
    label: 'Нет',
    sourceX: 0,
    sourceY: 0,
    targetX: 100,
    targetY: 100,
    sourcePosition: 'right',
    targetPosition: 'left',
  } satisfies Record<string, unknown>;

  it.each([
    ['process', ProcessEdge],
    ['integration', IntegrationEdge],
    ['data', DataEdge],
  ])('%s рисует путь и подпись', (_name, Component) => {
    const { container } = render(
      <ReactFlowProvider>
        <div style={{ width: 400, height: 300 }}>
          <ReactFlow nodes={[]} edges={[]}>
            <EdgeMarkers>
              <svg>
                {/* Пропсы ребра React Flow шире геометрии; для монтирования
                    хватает того, что реально читают компоненты. */}
                {/* Каждый компонент типизирован своим типом ребра, а тест
                    проверяет общее для всех троих поведение — отсюда одно
                    приведение на месте вызова, а не три копии пропсов. */}
                {createElement(
                  Component as unknown as ComponentType<Record<string, unknown>>,
                  props,
                )}
              </svg>
            </EdgeMarkers>
          </ReactFlow>
        </div>
      </ReactFlowProvider>,
    );
    expect(container.querySelector('path')).toBeTruthy();
    expect(screen.getByText('Нет')).toBeInTheDocument();
  });
});
