// Геометрия и классификация элементов BPMN (process-map-70e.5).
import { describe, expect, it } from 'vitest';
import {
  areaOf,
  centerDistance,
  contains,
  indexPlanes,
  readingOrder,
  type Bounds,
} from '../../src/data/bpmn/di';
import {
  classifyElement,
  eventDefinitionOf,
  hasUnknownEventDefinition,
  isDiverging,
  isKnownNonNode,
} from '../../src/data/bpmn/taxonomy';
import { BPMN_NS, parseBpmnDocument } from '../../src/data/bpmn/xml';

const MODEL = BPMN_NS.model;

function doc(inner: string, diagram = ''): Document {
  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<bpmn:definitions xmlns:bpmn="${MODEL}" xmlns:bpmndi="${BPMN_NS.bpmndi}" xmlns:dc="${BPMN_NS.dc}">` +
    inner +
    diagram +
    `</bpmn:definitions>`;
  const result = parseBpmnDocument(xml);
  if (result.status !== 'ok') {
    throw new Error(`фикстура не разобралась: ${result.reason}`);
  }
  return result.doc;
}

function el(inner: string): Element {
  const d = doc(`<bpmn:process id="P">${inner}</bpmn:process>`);
  const process = d.getElementsByTagNameNS(MODEL, 'process')[0];
  const child = process?.firstElementChild;
  if (child === null || child === undefined) {
    throw new Error('нет элемента в фикстуре');
  }
  return child;
}

describe('indexPlanes: у каждого подпроцесса своя система координат', () => {
  /*
   * Ради чего этот модуль вообще существует. Планов в модели владельца 73, и
   * dc:Bounds внутри каждого отсчитываются от своего начала. Взять корневой
   * план для детей модуля — самая вероятная ошибка, и она спрячется: раскладка
   * молча откатится на position, узлы разъедутся, но ничего не упадёт.
   */
  const diagram =
    `<bpmndi:BPMNDiagram>` +
    `<bpmndi:BPMNPlane bpmnElement="P">` +
    `<bpmndi:BPMNShape bpmnElement="Sub_1"><dc:Bounds x="900" y="10" width="100" height="80"/></bpmndi:BPMNShape>` +
    `</bpmndi:BPMNPlane>` +
    `</bpmndi:BPMNDiagram>` +
    `<bpmndi:BPMNDiagram>` +
    `<bpmndi:BPMNPlane bpmnElement="Sub_1">` +
    `<bpmndi:BPMNShape bpmnElement="Task_1"><dc:Bounds x="10" y="20" width="100" height="80"/></bpmndi:BPMNShape>` +
    `<bpmndi:BPMNShape bpmnElement="Sub_2" isExpanded="true"><dc:Bounds x="200" y="20" width="300" height="200"/></bpmndi:BPMNShape>` +
    `</bpmndi:BPMNPlane>` +
    `</bpmndi:BPMNDiagram>`;
  const planes = indexPlanes(doc('<bpmn:process id="P"/>', diagram));

  it('находит план каждого подпроцесса и корня', () => {
    expect([...planes.keys()].sort()).toEqual(['P', 'Sub_1']);
  });

  it('координаты берутся из своего плана, а не из корневого', () => {
    expect(planes.get('P')?.bounds('Sub_1')).toEqual({ x: 900, y: 10, width: 100, height: 80 });
    expect(planes.get('Sub_1')?.bounds('Task_1')).toEqual({ x: 10, y: 20, width: 100, height: 80 });
    // Ребёнок подпроцесса в корневом плане не значится вовсе.
    expect(planes.get('P')?.bounds('Task_1')).toBeUndefined();
  });

  it('читает признак развёрнутости подпроцесса', () => {
    expect(planes.get('Sub_1')?.isExpanded('Sub_2')).toBe(true);
    // Свёрнутый: атрибута нет. Именно так помечены все 12 модулей владельца.
    expect(planes.get('P')?.isExpanded('Sub_1')).toBe(false);
  });

  it('фигура без Bounds не даёт координат, но и не роняет разбор', () => {
    const broken = indexPlanes(
      doc(
        '<bpmn:process id="P"/>',
        `<bpmndi:BPMNDiagram><bpmndi:BPMNPlane bpmnElement="P">` +
          `<bpmndi:BPMNShape bpmnElement="X"/></bpmndi:BPMNPlane></bpmndi:BPMNDiagram>`,
      ),
    );
    expect(broken.get('P')?.bounds('X')).toBeUndefined();
  });
});

describe('геометрия', () => {
  const outer: Bounds = { x: 0, y: 0, width: 100, height: 100 };

  it('вложенность считается с допуском: рамки рисуют на глаз', () => {
    expect(contains(outer, { x: 10, y: 10, width: 20, height: 20 })).toBe(true);
    expect(contains(outer, { x: -1, y: -1, width: 102, height: 102 })).toBe(true);
    expect(contains(outer, { x: -10, y: 0, width: 20, height: 20 })).toBe(false);
  });

  it('площадь и расстояние между центрами', () => {
    expect(areaOf(outer)).toBe(10000);
    expect(centerDistance(outer, { x: 100, y: 0, width: 100, height: 100 })).toBe(100);
  });
});

describe('readingOrder', () => {
  const at = (id: string, x: number, y: number): { item: string; bounds: Bounds } => ({
    item: id,
    bounds: { x, y, width: 100, height: 80 },
  });

  /*
   * Сортировка по чистому `y` разорвала бы строку: у события высота 36, у
   * задачи 80, и центры одной строки различаются на десятки пикселей. Порядок
   * получился бы такой, какого читатель на схеме не видел.
   */
  it('строка держится вместе, даже когда элементы не выровнены по пикселю', () => {
    const order = readingOrder([at('b', 200, 12), at('a', 10, 0), at('c', 10, 300)]);
    expect(order).toEqual(['a', 'b', 'c']);
  });

  it('элементы без геометрии уходят в хвост, но не теряются', () => {
    const order = readingOrder([
      { item: 'ghost', bounds: undefined },
      at('a', 10, 0),
      { item: 'ghost2', bounds: undefined },
    ]);
    expect(order).toEqual(['a', 'ghost', 'ghost2']);
  });
});

describe('classifyElement', () => {
  it.each([
    ['task', 'step'],
    ['userTask', 'step'],
    ['manualTask', 'step'],
    ['serviceTask', 'integration'],
    ['sendTask', 'integration'],
    ['subProcess', 'subprocess'],
    ['callActivity', 'subprocess'],
    ['dataObjectReference', 'data'],
    ['dataStoreReference', 'data'],
  ])('%s → %s', (name, type) => {
    expect(classifyElement(el(`<bpmn:${name} id="X"/>`))?.type).toBe(type);
  });

  it('шлюзы дают тип gateway и свой вид', () => {
    expect(classifyElement(el('<bpmn:exclusiveGateway id="G"/>'))).toEqual({
      type: 'gateway',
      gatewayKind: 'exclusive',
    });
    expect(classifyElement(el('<bpmn:parallelGateway id="G"/>'))?.gatewayKind).toBe('parallel');
  });

  it('события дают место в потоке и определение', () => {
    expect(classifyElement(el('<bpmn:startEvent id="E"/>'))).toEqual({
      type: 'event',
      eventKind: 'start',
      eventDefinition: 'none',
    });
    const link = classifyElement(
      el(
        '<bpmn:intermediateThrowEvent id="E"><bpmn:linkEventDefinition/></bpmn:intermediateThrowEvent>',
      ),
    );
    expect(link).toEqual({ type: 'event', eventKind: 'intermediate', eventDefinition: 'link' });
  });

  /*
   * Аварийный исход — единственный случай, когда событие становится
   * предупреждением: это единственная карточка, читающаяся как «пошло не так».
   * В модели владельца таких нет, но без правила первый же файл с обработкой
   * ошибок показал бы аварийный конец обычным событием.
   */
  it.each(['errorEventDefinition', 'escalationEventDefinition', 'terminateEventDefinition'])(
    'событие с %s становится предупреждением',
    (definition) => {
      const node = classifyElement(
        el(`<bpmn:endEvent id="E"><bpmn:${definition}/></bpmn:endEvent>`),
      );
      expect(node?.type).toBe('warning');
      expect(node?.eventKind).toBe('end');
    },
  );

  it('незнакомый элемент даёт undefined — вызывающий обязан записать его в отчёт', () => {
    expect(classifyElement(el('<bpmn:чтоТоНовое id="X"/>'))).toBeUndefined();
  });
});

describe('isKnownNonNode: отличает «не узел по правилу» от «не узнали»', () => {
  it.each(['sequenceFlow', 'group', 'textAnnotation', 'laneSet', 'boundaryEvent'])(
    '%s — известный не-узел',
    (name) => {
      expect(isKnownNonNode(el(`<bpmn:${name} id="X"/>`))).toBe(true);
    },
  );

  it('незнакомый элемент известным не-узлом не считается', () => {
    expect(isKnownNonNode(el('<bpmn:чтоТоНовое id="X"/>'))).toBe(false);
  });
});

describe('вспомогательное', () => {
  it('неизвестное определение события распознаётся как неизвестное', () => {
    expect(
      hasUnknownEventDefinition(
        el('<bpmn:startEvent id="E"><bpmn:cancelEventDefinition/></bpmn:startEvent>'),
      ),
    ).toBe(true);
    expect(
      eventDefinitionOf(
        el('<bpmn:startEvent id="E"><bpmn:cancelEventDefinition/></bpmn:startEvent>'),
      ),
    ).toBe('none');
  });

  it('расходящийся шлюз отличается от сходящегося числом исходящих связей', () => {
    const diverging = el(
      '<bpmn:exclusiveGateway id="G"><bpmn:outgoing>a</bpmn:outgoing><bpmn:outgoing>b</bpmn:outgoing></bpmn:exclusiveGateway>',
    );
    const merging = el(
      '<bpmn:exclusiveGateway id="G"><bpmn:incoming>a</bpmn:incoming><bpmn:outgoing>b</bpmn:outgoing></bpmn:exclusiveGateway>',
    );
    expect(isDiverging(diverging)).toBe(true);
    expect(isDiverging(merging)).toBe(false);
  });
});
