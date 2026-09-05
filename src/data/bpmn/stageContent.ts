// Содержимое одного этапа: узлы, связи, данные, группы, подписи
// (process-map-70e.5).
//
// Один модуль на четыре близких извлечения, а не четыре файла, как намечал
// план: все они идут по ОДНОМУ И ТОМУ ЖЕ списку прямых детей модуля и делят
// индексы (id узла по id элемента, геометрию из плана модуля). Разнесённые по
// файлам, они передавали бы эти индексы друг другу параметрами — швов было бы
// больше, чем содержания.
import type { Direction, Edge, Group, ProcessNode } from '../schema.ts';
import { contains, type Bounds } from './di.ts';
import type { ModuleDraft } from './modules.ts';
import type { BpmnProfile } from './profile.ts';
import { annotationTextOf, elementName, leadingCode, normalizeText } from './text.ts';
import { classifyElement } from './taxonomy.ts';
import { BPMN_NS, nsChildren } from './xml.ts';

/** Сопоставление «id элемента BPMN → id узла карты», общее на весь документ. */
export type IdMap = ReadonlyMap<string, string>;

// ────────────────────────────── узлы ──────────────────────────────

export interface NodeDraft {
  readonly node: ProcessNode;
  readonly source: Element;
  readonly bounds: Bounds | undefined;
}

/**
 * Прямые дети модуля → узлы карты.
 *
 * Безымянные элементы подписи НЕ ТЕРЯЮТ: шлюз без имени получает подпись вида
 * нотации («Развилка»), событие — «Начало»/«Конец». Это словарь нотации, а не
 * содержание процесса, поэтому запрет «не изобретать процесс» не нарушается, а
 * карточка без подписи выглядела бы дефектом отрисовки.
 */
export function collectNodes(
  module: ModuleDraft,
  ids: IdMap,
  fallbackLabel: (el: Element) => string,
): NodeDraft[] {
  const drafts: NodeDraft[] = [];
  for (const child of module.children) {
    const kind = classifyElement(child);
    if (kind === undefined) {
      continue;
    }
    const bpmnId = child.getAttribute('id') ?? '';
    const id = ids.get(bpmnId);
    if (id === undefined) {
      continue;
    }
    const label = elementName(child);
    drafts.push({
      source: child,
      bounds: module.plane?.bounds(bpmnId),
      node: {
        id,
        type: kind.type,
        ...(kind.gatewayKind === undefined ? {} : { gatewayKind: kind.gatewayKind }),
        ...(kind.eventKind === undefined ? {} : { eventKind: kind.eventKind }),
        ...(kind.eventDefinition === undefined ? {} : { eventDefinition: kind.eventDefinition }),
        label: label === '' ? fallbackLabel(child) : label,
        position: { x: 0, y: 0 },
      },
    });
  }
  return drafts;
}

// ────────────────────────────── связи ──────────────────────────────

export interface EdgeResult {
  readonly edges: Edge[];
  /** Связи, у которых конец не попал на уровень карты. */
  readonly dropped: Element[];
}

/**
 * `sequenceFlow` → ребро этапа.
 *
 * Отбрасывается связь, чей конец не стал узлом карты. В модели владельца таких
 * нет — проверено, все связи модуля соединяют только его прямых детей, — но
 * фильтр обязан существовать: `validateIntegrity` объявляет ребро с висящим
 * концом ошибкой данных, и первая же схема с иной структурой уронила бы импорт
 * вместо того, чтобы честно сказать, чего не хватило.
 */
export function collectEdges(
  module: ModuleDraft,
  ids: IdMap,
  known: ReadonlySet<string>,
): EdgeResult {
  const edges: Edge[] = [];
  const dropped: Element[] = [];
  for (const child of module.children) {
    if (child.namespaceURI !== BPMN_NS.model || child.localName !== 'sequenceFlow') {
      continue;
    }
    const sourceId = ids.get(child.getAttribute('sourceRef') ?? '');
    const targetId = ids.get(child.getAttribute('targetRef') ?? '');
    const edgeId = ids.get(child.getAttribute('id') ?? '');
    if (
      sourceId === undefined ||
      targetId === undefined ||
      edgeId === undefined ||
      !known.has(sourceId) ||
      !known.has(targetId) ||
      sourceId === targetId
    ) {
      dropped.push(child);
      continue;
    }
    const label = elementName(child);
    edges.push({
      id: edgeId,
      source: sourceId,
      target: targetId,
      kind: 'process',
      // Тело conditionExpression на ребро НЕ идёт: `${amount > 1000000}` это код,
      // а не текст для читателя вики. Идёт только имя связи — «Да», «Нет».
      ...(label === '' ? {} : { label }),
    });
  }
  return { edges, dropped };
}

// ────────────────────────────── данные ──────────────────────────────

/**
 * Направление артефакта: производит его этап или потребляет.
 *
 * ПО ПРОИСХОЖДЕНИЮ, А НЕ ПО КООРДИНАТАМ — дословный прецедент process-map-24p,
 * где вывод колонки из геометрии дал «15 входов · 0 выходов» на этапах, чьи
 * карточки перечисляли по три ключевых выхода.
 *
 * Артефакт, который внутри этапа и производится, и потребляется, считается
 * ВЫХОДОМ: он сделан здесь, а то, что его тут же кто-то использует, —
 * внутреннее дело этапа.
 */
export function directionOf(
  refId: string,
  producedBy: ReadonlySet<string>,
  consumedBy: ReadonlySet<string>,
  geometric: () => Direction,
): Direction {
  if (producedBy.has(refId)) {
    return 'out';
  }
  if (consumedBy.has(refId)) {
    return 'in';
  }
  return geometric();
}

export interface DataUsage {
  readonly producedBy: ReadonlySet<string>;
  readonly consumedBy: ReadonlySet<string>;
}

/** Кто производит и кто потребляет каждый артефакт внутри модуля. */
export function collectDataUsage(module: ModuleDraft): DataUsage {
  const producedBy = new Set<string>();
  const consumedBy = new Set<string>();
  for (const child of module.children) {
    for (const out of nsChildren(child, BPMN_NS.model, 'dataOutputAssociation')) {
      const target = nsChildren(out, BPMN_NS.model, 'targetRef')[0]?.textContent;
      if (target !== null && target !== undefined && target.trim() !== '') {
        producedBy.add(target.trim());
      }
    }
    for (const input of nsChildren(child, BPMN_NS.model, 'dataInputAssociation')) {
      for (const src of nsChildren(input, BPMN_NS.model, 'sourceRef')) {
        const value = src.textContent?.trim();
        if (value !== undefined && value !== '') {
          consumedBy.add(value);
        }
      }
    }
  }
  return { producedBy, consumedBy };
}

// ────────────────────────────── группы ──────────────────────────────

export interface GroupResult {
  readonly groups: Group[];
  /** Узел → id группы карты. */
  readonly membership: ReadonlyMap<string, string>;
  /** Рамки, для которых подпись вывести не удалось. */
  readonly unlabelled: Element[];
}

/**
 * `bpmn:group` → группа этапа.
 *
 * ДВЕ ТРУДНОСТИ, ОБЕ ИЗ НАСТОЯЩЕГО ФАЙЛА. Первая: членства у группы нет —
 * `bpmn:group` не перечисляет участников, и определять его приходится
 * геометрически, по вложенности прямоугольников. Вторая: все 49 групп модели
 * БЕЗЫМЯННЫ (`categoryValue` в файле нет вовсе), а модель требует непустую
 * подпись на пунктирной рамке.
 *
 * Решение владельца: подпись выводится из диапазона кодов участников —
 * «DP-030-010 … DP-030-040». Это не выдумка, а пересказ содержимого рамки. Если
 * ни у одного участника кода нет, группа отбрасывается вместе со ссылками на
 * неё: рамка с пустым заголовком выглядела бы поломкой.
 */
export function collectGroups(
  module: ModuleDraft,
  nodes: readonly NodeDraft[],
  ids: IdMap,
  profile: BpmnProfile,
): GroupResult {
  const groups: Group[] = [];
  const membership = new Map<string, string>();
  const unlabelled: Element[] = [];

  const boxes = module.children
    .filter((el) => el.namespaceURI === BPMN_NS.model && el.localName === 'group')
    .map((el) => ({ el, bounds: module.plane?.bounds(el.getAttribute('id') ?? '') }))
    .filter((entry): entry is { el: Element; bounds: Bounds } => entry.bounds !== undefined)
    // От меньшей к большей: узел достаётся САМОЙ ТЕСНОЙ рамке, а не первой
    // попавшейся — в модели владельца группы местами вложены друг в друга.
    .sort((a, b) => a.bounds.width * a.bounds.height - b.bounds.width * b.bounds.height);

  for (const { el, bounds } of boxes) {
    const members = nodes.filter(
      (draft) => draft.bounds !== undefined && contains(bounds, draft.bounds),
    );
    const codes = members
      .map((draft) => leadingCode(draft.node.label, profile.codePattern))
      .filter((code): code is string => code !== undefined)
      .sort();
    const first = codes[0];
    const last = codes[codes.length - 1];
    if (first === undefined || last === undefined) {
      unlabelled.push(el);
      continue;
    }
    const groupId = ids.get(el.getAttribute('id') ?? '');
    if (groupId === undefined) {
      unlabelled.push(el);
      continue;
    }
    groups.push({ id: groupId, label: first === last ? first : `${first} … ${last}` });
    for (const member of members) {
      if (!membership.has(member.node.id)) {
        membership.set(member.node.id, groupId);
      }
    }
  }

  return { groups, membership, unlabelled };
}

// ────────────────────────── подписи и владельцы ──────────────────────────

export interface AnnotationResult {
  /** Узел → абзацы описания, пришедшие из привязанных аннотаций. */
  readonly descriptions: ReadonlyMap<string, string[]>;
  /** Узел → исполнитель, выведенный из свободной наклейки. */
  readonly owners: ReadonlyMap<string, string>;
  /** Аннотации, которые не удалось ни привязать, ни опознать как роль. */
  readonly unattached: Element[];
}

/**
 * Аннотации → описания и исполнители.
 *
 * ДВА РАЗНЫХ СЛУЧАЯ, и путать их нельзя. Привязанная ассоциацией аннотация —
 * это описание узла, и она уезжает в `description`. Свободная — чаще всего
 * наклейка роли («Фоновый процесс», «Demand Planner»), которую автор просто
 * положил рядом с шагом; она уезжает в `owner`, но ТОЛЬКО если профиль знает
 * такую роль и наклейка лежит вплотную к единственному узлу. Иначе привязка
 * была бы догадкой, и аннотация честно уходит в потери.
 */
export function collectAnnotations(
  module: ModuleDraft,
  nodes: readonly NodeDraft[],
  ids: IdMap,
  profile: BpmnProfile,
): AnnotationResult {
  const annotations = new Map<string, Element>();
  for (const child of module.children) {
    if (child.namespaceURI === BPMN_NS.model && child.localName === 'textAnnotation') {
      annotations.set(child.getAttribute('id') ?? '', child);
    }
  }

  const descriptions = new Map<string, string[]>();
  const attached = new Set<string>();
  for (const child of module.children) {
    if (child.namespaceURI !== BPMN_NS.model || child.localName !== 'association') {
      continue;
    }
    // В модели владельца ассоциация идёт «узел → аннотация» у 247 из 254 штук,
    // но направление в BPMN не гарантировано: проверяются оба конца.
    const a = child.getAttribute('sourceRef') ?? '';
    const b = child.getAttribute('targetRef') ?? '';
    const annotationId = annotations.has(a) ? a : annotations.has(b) ? b : undefined;
    const nodeBpmnId = annotationId === a ? b : a;
    if (annotationId === undefined) {
      continue;
    }
    const nodeId = ids.get(nodeBpmnId);
    const text = annotationTextOf(annotations.get(annotationId));
    if (nodeId === undefined || text === '') {
      continue;
    }
    const list = descriptions.get(nodeId) ?? [];
    list.push(text);
    descriptions.set(nodeId, list);
    attached.add(annotationId);
  }

  const owners = new Map<string, string>();
  const unattached: Element[] = [];
  for (const [annotationId, el] of annotations) {
    if (attached.has(annotationId)) {
      continue;
    }
    const text = annotationTextOf(el);
    const box = module.plane?.bounds(annotationId);
    if (!profile.roleStickers.has(text) || box === undefined) {
      unattached.push(el);
      continue;
    }
    const near = nodes
      .filter((draft) => draft.bounds !== undefined && draft.node.type !== 'data')
      .map((draft) => ({ draft, distance: centerGap(box, draft.bounds as Bounds) }))
      .filter((entry) => entry.distance <= profile.stickerDistance)
      .sort((a, b) => a.distance - b.distance);
    const closest = near[0];
    if (closest === undefined) {
      unattached.push(el);
      continue;
    }
    // У узла уже есть исполнитель: вторая наклейка НЕ перезаписывает первую, а
    // уходит в потери. Молчаливая перезапись означала бы, что отчёт считает
    // наклейку привязанной, хотя её текст до карты не доехал — то есть отчёт
    // завышал бы сам себя ровно там, где должен быть точен.
    if (owners.has(closest.draft.node.id)) {
      unattached.push(el);
      continue;
    }
    owners.set(closest.draft.node.id, text);
  }

  return { descriptions, owners, unattached };
}

function centerGap(a: Bounds, b: Bounds): number {
  const dx = a.x + a.width / 2 - (b.x + b.width / 2);
  const dy = a.y + a.height / 2 - (b.y + b.height / 2);
  return Math.hypot(dx, dy);
}

/** Описание узла: абзацы через пустую строку, как в картах из презентаций. */
export function joinDescription(parts: readonly string[]): string | undefined {
  const cleaned = parts.map((part) => normalizeText(part)).filter((part) => part !== '');
  return cleaned.length === 0 ? undefined : cleaned.join('\n\n');
}
