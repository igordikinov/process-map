// Программная фабрика минимальной валидной ProcessMap для tests/data.test.ts.
//
// src/data/snp/process.json ещё не существует — его создаёт задача process-map-np4
// (импорт из презентации). До тех пор позитивные тесты схемы/целостности
// гоняются против этой фикстуры: ≥ 40 узлов, целостные рёбра, реалистичный
// набор groups/inputs/outputs/overviewEdges.
import type {
  Edge,
  ExternalIO,
  Group,
  ProcessMap,
  ProcessNode,
  Stage,
} from '../../src/data/schema.ts';

const SYSTEM_CODES = ['DP', 'PS', 'IO', 'ERP'] as const;
const NODES_PER_STAGE = 11; // 4 этапа × 11 = 44 узла, что удовлетворяет "≥ 40".

function buildStage(stageNumber: 1 | 2 | 3 | 4): Stage {
  const stageId = `stage-${stageNumber}`;
  const groups: Group[] = [{ id: `${stageId}-group-main`, label: `Группа ${stageNumber}` }];

  const nodes: ProcessNode[] = Array.from({ length: NODES_PER_STAGE }, (_, i) => {
    const index = i + 1;
    const id = `${stageId}-node-${index}`;
    const node: ProcessNode = {
      id,
      type: index % NODES_PER_STAGE === 0 ? 'warning' : index % 2 === 0 ? 'data' : 'step',
      label: `Шаг ${stageNumber}.${index}`,
      position: { x: index * 120, y: stageNumber * 100 },
    };
    if (index <= 3) {
      node.group = groups[0]?.id;
    }
    return node;
  });

  const edges: Edge[] = nodes.slice(0, -1).map((node, i) => {
    const next = nodes[i + 1];
    if (!next) {
      throw new Error('unreachable: next node must exist');
    }
    return {
      id: `${stageId}-edge-${i + 1}`,
      source: node.id,
      target: next.id,
      kind: 'process',
    };
  });

  const inputs: ExternalIO[] = [
    {
      system: SYSTEM_CODES[stageNumber - 1] ?? 'DP',
      label: `Вход из системы, этап ${stageNumber}`,
      stage: stageNumber,
      direction: 'in',
    },
  ];
  const outputs: ExternalIO[] = [
    {
      system: SYSTEM_CODES[stageNumber % SYSTEM_CODES.length] ?? 'PS',
      label: `Выход в систему, этап ${stageNumber}`,
      stage: stageNumber,
      direction: 'out',
    },
  ];

  return {
    id: stageId,
    number: stageNumber,
    title: `Этап ${stageNumber}: пример`,
    shortTitle: `Этап ${stageNumber}`,
    keyOutputs: ['Выход A', 'Выход B'],
    groups,
    nodes,
    edges,
    inputs,
    outputs,
  };
}

export function buildSampleProcessMap(): ProcessMap {
  const stages: Stage[] = [1, 2, 3, 4].map((n) => buildStage(n as 1 | 2 | 3 | 4));

  const overviewEdges: Edge[] = [
    { id: 'overview-edge-1', source: 'stage-1', target: 'stage-2', kind: 'process' },
    { id: 'overview-edge-2', source: 'stage-2', target: 'stage-3', kind: 'process' },
    { id: 'overview-edge-3', source: 'stage-3', target: 'stage-4', kind: 'process' },
    { id: 'overview-edge-4', source: 'DP', target: 'stage-1', kind: 'integration' },
    { id: 'overview-edge-5', source: 'stage-4', target: 'PS', kind: 'integration' },
  ];

  return {
    version: '1.0.0-fixture',
    id: 'fixture',
    updatedAt: '2026-08-24',
    title: 'In.Plan E2E процесс (фикстура)',
    moduleLabel: 'Модуль фикстуры',
    stages,
    overviewEdges,
  };
}
