// Рёбра уровня 1 трёхуровневой карты и переносимая подпись-артефакт (задача
// process-map-9mn.16).
//
// Подпись связи модулей — содержание связи («Итоговый неограниченный
// прогноз»), и многоточие его съело бы. Поэтому проверяется КЛАСС переноса на
// подписи, а не только её текст: текст доезжает и до обрезанной подписи, и
// тест по одному тексту зеленел бы при потерянном переносе.
//
// Класс сверяется с тем, что отдаёт сам CSS-модуль: Vitest собирает
// CSS-модули с хешированными именами (у стрелок в DOM это видно —
// «_arrowData_…»), и литерал 'wrap' здесь не нашёлся бы никогда.
import { createElement, type ComponentType, type ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ReactFlow, ReactFlowProvider } from '@xyflow/react';
import {
  ArtifactEdge,
  ArtifactIntegrationEdge,
  EdgeMarkers,
  IntegrationEdge,
  ProcessEdge,
} from '../src/components/edges';
import { EdgeLabel } from '../src/components/edges/EdgeLabel';
import labelStyles from '../src/components/edges/EdgeLabel/EdgeLabel.module.css';
import edgeStyles from '../src/components/edges/edges.module.css';
import { MODULE_EDGE_LABEL } from './fixtures/three-level-process';

/** EdgeLabelRenderer рисует в портал React Flow — без полотна его нет. */
function renderInFlow(ui: ReactNode) {
  return render(
    <ReactFlowProvider>
      <div style={{ width: 400, height: 300 }}>
        <ReactFlow nodes={[]} edges={[]}>
          <EdgeMarkers>
            <svg>{ui}</svg>
          </EdgeMarkers>
        </ReactFlow>
      </div>
    </ReactFlowProvider>,
  );
}

/*
 * Пропсы ребра React Flow шире того, что читают компоненты, — приведение через
 * unknown на месте вызова, как в tests/edgeLabel.test.tsx.
 */
const props = {
  id: 'module-edge-1',
  source: 'a',
  target: 'b',
  label: MODULE_EDGE_LABEL,
  sourceX: 0,
  sourceY: 0,
  targetX: 200,
  targetY: 0,
  sourcePosition: 'right',
  targetPosition: 'left',
} satisfies Record<string, unknown>;

function renderEdge(Component: unknown) {
  return renderInFlow(createElement(Component as ComponentType<Record<string, unknown>>, props));
}

describe('EdgeLabel: переносимый вариант', () => {
  it('wrap добавляет класс переноса к обычной подложке', () => {
    renderInFlow(<EdgeLabel label={MODULE_EDGE_LABEL} x={0} y={0} wrap />);
    const label = screen.getByText(MODULE_EDGE_LABEL);
    expect(labelStyles.wrap).toBeTruthy();
    expect(label).toHaveClass(labelStyles.label as string, labelStyles.wrap as string);
  });

  it('без wrap подпись прежняя — однострочная, без класса переноса', () => {
    renderInFlow(<EdgeLabel label="Да" x={0} y={0} />);
    expect(screen.getByText('Да')).not.toHaveClass(labelStyles.wrap as string);
  });
});

describe('рёбра связей модулей', () => {
  it.each([
    ['artifact', ArtifactEdge, edgeStyles.process],
    ['artifactIntegration', ArtifactIntegrationEdge, edgeStyles.integration],
  ])('%s: линия своего вида и ПЕРЕНОСИМАЯ подпись-артефакт', (_name, Component, lineClass) => {
    const { container } = renderEdge(Component);

    // Первый <path> в документе — стрелка из EdgeMarkers; линия ребра — BaseEdge.
    expect(container.querySelector('path.react-flow__edge-path')).toHaveClass(lineClass as string);
    expect(screen.getByText(MODULE_EDGE_LABEL)).toHaveClass(labelStyles.wrap as string);
  });

  it.each([
    ['process', ProcessEdge],
    ['integration', IntegrationEdge],
  ])(
    '%s обзора этапов и детализации подпись не переносит — там она пометка',
    (_name, Component) => {
      renderEdge(Component);
      expect(screen.getByText(MODULE_EDGE_LABEL)).not.toHaveClass(labelStyles.wrap as string);
    },
  );
});
