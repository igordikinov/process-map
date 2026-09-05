// Узлы, приходящие из BPMN: шлюз, событие, свёрнутый подпроцесс
// (process-map-70e.7).
//
// Синтетика, а не реальная карта: узлов этих типов нет ни в snp, ни в mrp и не
// будет — они появляются только в схеме, загруженной пользователем. Тем важнее
// проверить их здесь: до появления адаптера это единственный сторож.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Legend } from '../src/components/Legend';
import { buildStageGraph } from '../src/components/StageDetail/stageGraph';
import { StepCard } from '../src/components/nodes/StepNode';
import { ru } from '../src/i18n/ru';
import { STEP_NODE_SIZE } from '../src/theme/sizes.ts';
import {
  ProcessMapSchema,
  type NodeType,
  type ProcessNode,
  type Stage,
} from '../src/data/schema.ts';
import { createInitialState, useProcessStore } from '../src/store/useProcessStore';
import { buildSampleProcessMap } from './fixtures/sample-process.ts';

const BPMN_TYPES = ['gateway', 'event', 'subprocess'] as const;

/** Этап, у которого первые три узла потока — типы BPMN. */
function stageWithBpmnTypes(): Stage {
  const map = buildSampleProcessMap();
  const stage = map.stages[0];
  expect(stage).toBeTruthy();
  const flow = (stage as Stage).nodes.filter((node) => node.type !== 'data');
  expect(flow.length, 'в фикстуре мало узлов потока').toBeGreaterThanOrEqual(3);
  const retyped = (stage as Stage).nodes.map((node) => {
    const index = flow.indexOf(node);
    const type = index >= 0 && index < BPMN_TYPES.length ? BPMN_TYPES[index] : node.type;
    return { ...node, type } as ProcessNode;
  });
  // Через схему: заодно доказывает, что такие узлы вообще валидны.
  return ProcessMapSchema.parse({ ...map, stages: [{ ...stage, nodes: retyped }] })
    .stages[0] as Stage;
}

describe('stageGraph: типы BPMN получают свой тип узла React Flow', () => {
  const graph = buildStageGraph(stageWithBpmnTypes());
  const byId = new Map(graph.nodes.map((node) => [node.id, node]));

  /*
   * Инвариант «тип узла React Flow равен ProcessNode.type» держит e2e и
   * стилизацию: тип попадает в класс `.react-flow__node-<type>`. Раньше
   * flowNodeOf заканчивался безусловным возвратом карточки шага, и любой новый
   * тип молча рисовался бы шагом — дефект был бы невидим на snp и mrp, где
   * таких узлов нет.
   */
  it.each(BPMN_TYPES)('узел типа %s не подменяется шагом', (type) => {
    const source = stageWithBpmnTypes().nodes.find((node) => node.type === type);
    expect(source, `в фикстуре нет узла типа ${type}`).toBeTruthy();
    expect(byId.get(source!.id)?.type).toBe(type);
  });

  it('размер у них тот же, что у карточки шага', () => {
    for (const type of BPMN_TYPES) {
      const source = stageWithBpmnTypes().nodes.find((node) => node.type === type);
      const flow = byId.get(source!.id);
      expect(flow?.width, type).toBe(STEP_NODE_SIZE.width);
      expect(flow?.height, type).toBe(STEP_NODE_SIZE.height);
    }
  });
});

describe('StepCard: подпись для скринридера называет вид узла', () => {
  const node: ProcessNode = {
    id: 'n1',
    type: 'gateway',
    label: 'Достаточно ли запасов?',
    position: { x: 0, y: 0 },
  };

  it.each([
    ['gateway', ru.stepNode.ariaLabelGateway] as const,
    ['event', ru.stepNode.ariaLabelEvent] as const,
    ['subprocess', ru.stepNode.ariaLabelSubprocess] as const,
  ])('вариант %s', (variant, label) => {
    render(<StepCard node={{ ...node, type: variant as NodeType }} variant={variant} />);
    expect(screen.getByRole('button', { name: label(node.label) })).toBeInTheDocument();
  });
});

// ─────────────────────────── легенда ───────────────────────────

const mockMap = vi.hoisted(() => ({
  current: null as ReturnType<typeof buildSampleProcessMap> | null,
}));

vi.mock('../src/hooks/useProcessMap', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/hooks/useProcessMap')>();
  return {
    ...actual,
    useProcessMap: () => mockMap.current ?? actual.useProcessMap(),
  };
});

describe('Legend: пункты BPMN появляются только когда такие узлы есть', () => {
  beforeEach(() => {
    useProcessStore.setState(createInitialState());
    mockMap.current = null;
  });

  /*
   * Главная проверка. Легенда, обещающая «Развилку» на карте без единого
   * шлюза, — ровно та ложь, ради которой написана шапка Legend.tsx: макет
   * показывал одни и те же четыре типа узлов и на обзоре, где их нет вовсе.
   */
  it('на карте без шлюзов и событий их в легенде нет', () => {
    const map = buildSampleProcessMap();
    const stage = map.stages[0];
    mockMap.current = map;
    useProcessStore.setState({ currentStageId: stage?.id ?? null });
    render(<Legend />);

    expect(screen.queryByText(ru.legend.gateway)).not.toBeInTheDocument();
    expect(screen.queryByText(ru.legend.event)).not.toBeInTheDocument();
    expect(screen.queryByText(ru.legend.subprocess)).not.toBeInTheDocument();
    // Базовые четыре пункта остаются безусловными.
    expect(screen.getByText(ru.legend.step)).toBeInTheDocument();
    expect(screen.getByText(ru.legend.warning)).toBeInTheDocument();
  });

  it('когда на этапе есть шлюз, событие и подпроцесс — пункты появляются', () => {
    const map = buildSampleProcessMap();
    const stage = stageWithBpmnTypes();
    mockMap.current = { ...map, stages: [stage] };
    useProcessStore.setState({ currentStageId: stage.id });
    render(<Legend />);

    expect(screen.getByText(ru.legend.gateway)).toBeInTheDocument();
    expect(screen.getByText(ru.legend.event)).toBeInTheDocument();
    expect(screen.getByText(ru.legend.subprocess)).toBeInTheDocument();
  });

  it('на обзоре пунктов BPMN нет даже при такой карте', () => {
    const stage = stageWithBpmnTypes();
    mockMap.current = { ...buildSampleProcessMap(), stages: [stage] };
    useProcessStore.setState({ currentStageId: null });
    render(<Legend />);

    expect(screen.queryByText(ru.legend.gateway)).not.toBeInTheDocument();
  });
});
