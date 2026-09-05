// Элемент BPMN → тип узла карты (process-map-70e.5).
//
// Единственное место, где решается «чем это будет на экране». Таблица закрытая
// и исчерпывающая: неизвестный элемент возвращает undefined, и вызывающий код
// ОБЯЗАН записать его в отчёт, а не пропустить молча.
import type { EventDefinition, EventKind, GatewayKind, NodeType } from '../schema';
import { BPMN_NS, nsChildren } from './xml';

export interface BpmnKind {
  readonly type: NodeType;
  readonly gatewayKind?: GatewayKind;
  readonly eventKind?: EventKind;
  readonly eventDefinition?: EventDefinition;
}

/** Активности, которые читатель вики видит как СВОЙ шаг процесса. */
const STEP_TASKS = new Set(['task', 'userTask', 'manualTask', 'scriptTask', 'businessRuleTask']);

/**
 * Активности, которые читатель видит как ПЕРЕДАЧУ наружу.
 *
 * Почему именно эти: `serviceTask` в Camunda 8 исполняется внешним воркером,
 * `sendTask`/`receiveTask` — обмен сообщениями. Тип `integration` в модели уже
 * значит «передача между системами», и главное — узлы этого типа пропадают по
 * тумблеру «Показать интеграции». То есть читатель может одним движением убрать
 * с карты техническую половину и увидеть только человеческие шаги. Ради этой
 * возможности разделение и делается.
 */
const INTEGRATION_TASKS = new Set(['serviceTask', 'sendTask', 'receiveTask']);

/** Активности, которые сворачиваются в одну карточку с содержимым внутри. */
const SUBPROCESS_TASKS = new Set(['subProcess', 'callActivity', 'transaction', 'adHocSubProcess']);

const GATEWAY_KINDS: Readonly<Record<string, GatewayKind>> = {
  exclusiveGateway: 'exclusive',
  parallelGateway: 'parallel',
  inclusiveGateway: 'inclusive',
  eventBasedGateway: 'eventBased',
  complexGateway: 'complex',
};

const EVENT_KINDS: Readonly<Record<string, EventKind>> = {
  startEvent: 'start',
  intermediateThrowEvent: 'intermediate',
  intermediateCatchEvent: 'intermediate',
  endEvent: 'end',
};

const EVENT_DEFINITIONS: Readonly<Record<string, EventDefinition>> = {
  linkEventDefinition: 'link',
  messageEventDefinition: 'message',
  timerEventDefinition: 'timer',
  errorEventDefinition: 'error',
  signalEventDefinition: 'signal',
  escalationEventDefinition: 'escalation',
  terminateEventDefinition: 'terminate',
};

/**
 * Определения событий, которые читаются как НЕНОРМАЛЬНЫЙ исход.
 *
 * Такое событие становится `warning`: это единственный тип карточки, который
 * на полотне читается как «что-то пошло не так». В модели владельца их нет ни
 * одного — все события там простые, кроме link, — но правило нужно: без него
 * первый же файл с обработкой ошибок показал бы аварийный конец обычным
 * событием.
 */
const WARNING_DEFINITIONS = new Set<EventDefinition>(['error', 'escalation', 'terminate']);

/** Определение события: чем оно вызывается или что бросает. */
export function eventDefinitionOf(el: Element): EventDefinition {
  for (const child of Array.from(el.children)) {
    if (child.namespaceURI !== BPMN_NS.model) {
      continue;
    }
    const known = EVENT_DEFINITIONS[child.localName];
    if (known !== undefined) {
      return known;
    }
  }
  return 'none';
}

/** Есть ли у элемента дочернее определение события неизвестного нам вида. */
export function hasUnknownEventDefinition(el: Element): boolean {
  return Array.from(el.children).some(
    (child) =>
      child.namespaceURI === BPMN_NS.model &&
      child.localName.endsWith('EventDefinition') &&
      EVENT_DEFINITIONS[child.localName] === undefined,
  );
}

/**
 * Элемент BPMN → тип узла карты, или `undefined`, если элемент узлом не станет.
 *
 * `undefined` возвращается ДВУМ разным классам элементов, и вызывающий обязан
 * различать их сам: `sequenceFlow`, `group`, `textAnnotation` узлами не
 * становятся ПО ПРАВИЛУ, а вот незнакомый элемент — это дыра в таблице, и он
 * обязан попасть в отчёт. Совмещать оба случая в одном возврате нельзя, поэтому
 * рядом живёт `isKnownNonNode`.
 */
export function classifyElement(el: Element): BpmnKind | undefined {
  if (el.namespaceURI !== BPMN_NS.model) {
    return undefined;
  }
  const name = el.localName;

  if (STEP_TASKS.has(name)) {
    return { type: 'step' };
  }
  if (INTEGRATION_TASKS.has(name)) {
    return { type: 'integration' };
  }
  if (SUBPROCESS_TASKS.has(name)) {
    return { type: 'subprocess' };
  }

  const gatewayKind = GATEWAY_KINDS[name];
  if (gatewayKind !== undefined) {
    return { type: 'gateway', gatewayKind };
  }

  const eventKind = EVENT_KINDS[name];
  if (eventKind !== undefined) {
    const eventDefinition = eventDefinitionOf(el);
    const type: NodeType = WARNING_DEFINITIONS.has(eventDefinition) ? 'warning' : 'event';
    return { type, eventKind, eventDefinition };
  }

  if (name === 'dataObjectReference' || name === 'dataStoreReference') {
    return { type: 'data' };
  }

  return undefined;
}

/**
 * Элементы, которые узлами не становятся ПО ПРАВИЛУ, а не по незнанию.
 *
 * `boundaryEvent` здесь не по лени: узел в модели не может быть прикреплён к
 * узлу, а в модели владельца граничных событий нет ни одного. Показывать его
 * отдельной карточкой значило бы стереть разницу между «прикреплено к шагу» и
 * «следует за шагом» — поэтому он идёт в отчёт как непоказанный, а не
 * притворяется обычным событием.
 */
const KNOWN_NON_NODES = new Set([
  'sequenceFlow',
  'messageFlow',
  'association',
  'dataAssociation',
  'dataInputAssociation',
  'dataOutputAssociation',
  'group',
  'textAnnotation',
  'laneSet',
  'lane',
  'dataObject',
  'documentation',
  'extensionElements',
  'incoming',
  'outgoing',
  'property',
  'ioSpecification',
  'dataInput',
  'dataOutput',
  'multiInstanceLoopCharacteristics',
  'standardLoopCharacteristics',
  'conditionExpression',
  'boundaryEvent',
]);

export function isKnownNonNode(el: Element): boolean {
  return el.namespaceURI === BPMN_NS.model && KNOWN_NON_NODES.has(el.localName);
}

/** Расходящийся шлюз: из него выходит больше одной связи. */
export function isDiverging(el: Element): boolean {
  return nsChildren(el, BPMN_NS.model, 'outgoing').length > 1;
}
