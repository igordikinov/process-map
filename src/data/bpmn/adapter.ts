// Схема BPMN → карта процесса (process-map-70e.5).
//
// Здесь только оркестрация и ГРАНИЦА: наружу отдаётся либо карта, прошедшая
// схему и проверку целостности, либо отчёт с блокерами. Промежуточных форм нет
// — тот же приём, что у `parseImportedOverrides` и у `parseBpmnDocument`.
//
// Правила отображения живут в taxonomy.ts и stageContent.ts, доменные
// допущения — в profile.ts и profiles/. Этот файл не решает ничего про
// содержание процесса.
import { layoutStage } from '../../layout/stageLayout';
import {
  ProcessMapSchema,
  validateIntegrity,
  type ProcessMap,
  type ProcessNode,
  type Stage,
} from '../schema';
import { indexPlanes } from './di';
import { assignUniqueIds, mapIdFrom, slugify } from './ids';
import {
  collectModules,
  countBelowLevel,
  findProcess,
  hasFlowNodes,
  shortTitleOf,
  type ModuleDraft,
} from './modules';
import { buildOverviewEdges, resolveCrossReferences } from './overviewEdges';
import { NEUTRAL_PROFILE, type BpmnProfile } from './profile';
import { profileFor } from './profiles/inplan';
import { ReportBuilder, type BpmnReport, type ContentKind, type Disposition } from './report';
import {
  collectAnnotations,
  collectDataUsage,
  collectEdges,
  collectGroups,
  collectNodes,
  directionOf,
  joinDescription,
} from './stageContent';
import { classifyElement, isKnownNonNode } from './taxonomy';
import { elementName, normalizeText } from './text';
import { BPMN_NS, nsAll } from './xml';

export interface BpmnSourceMeta {
  readonly fileName: string;
  /** `File.lastModified`. Дата берётся отсюда: в BPMN её нет. */
  readonly lastModified: number;
  readonly profile?: BpmnProfile;
}

export type AdaptationResult =
  | { readonly status: 'ok'; readonly map: ProcessMap; readonly report: BpmnReport }
  | { readonly status: 'failed'; readonly report: BpmnReport };

/**
 * Потолок числа узлов ПОСЛЕ разбора.
 *
 * Комментарии в xml.ts дважды обещают, что от подвешивания вкладки защищает не
 * лимит элементов XML, а этот, — и до сих пор такой константы в проекте не
 * было. Ориентир: настоящая модель даёт около 450 узлов вместе с данными,
 * потолок 3000 — примерно семикратный запас.
 */
export const MAX_MAP_NODES = 3000;

/**
 * Подписи вида нотации для безымянных элементов.
 *
 * Это СЛОВАРЬ НОТАЦИИ, а не содержание процесса: запрет «не изобретать
 * процесс» им не нарушается. Карточка без подписи выглядела бы дефектом
 * отрисовки, а безымянных элементов в модели владельца 29.
 */
const NOTATION_LABEL: Readonly<Record<string, string>> = {
  exclusiveGateway: 'Развилка',
  inclusiveGateway: 'Развилка',
  complexGateway: 'Развилка',
  eventBasedGateway: 'Ожидание события',
  parallelGateway: 'Параллельно',
  startEvent: 'Начало',
  endEvent: 'Конец',
  intermediateThrowEvent: 'Промежуточное событие',
  intermediateCatchEvent: 'Промежуточное событие',
};

function notationLabel(el: Element): string {
  return NOTATION_LABEL[el.localName] ?? 'Элемент схемы';
}

/** Вид содержания для учёта плотности отображения. */
function contentKindOf(el: Element): ContentKind {
  if (el.namespaceURI !== BPMN_NS.model) {
    return 'other';
  }
  switch (el.localName) {
    case 'sequenceFlow':
      return 'sequenceFlow';
    case 'textAnnotation':
      return 'annotation';
    case 'group':
      return 'group';
    case 'dataObjectReference':
    case 'dataStoreReference':
      return 'dataNode';
    default:
      return classifyElement(el) === undefined ? 'other' : 'flowNode';
  }
}

/** ISO-дата в ЛОКАЛЬНОЙ зоне: toISOString дал бы UTC и сдвинул бы день назад. */
function isoDate(timestamp: number): string {
  const date = new Date(timestamp);
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function bpmnToProcessMap(doc: Document, meta: BpmnSourceMeta): AdaptationResult {
  const report = new ReportBuilder();
  const definitions = doc.documentElement;
  const planes = indexPlanes(doc);
  const source = {
    fileName: meta.fileName,
    exporter: [
      definitions.getAttribute('exporter') ?? '',
      definitions.getAttribute('exporterVersion') ?? '',
    ]
      .filter((part) => part !== '')
      .join(' '),
    planes: planes.size,
    elements: doc.getElementsByTagName('*').length,
  };

  const process = findProcess(doc);
  if (process === undefined) {
    report.blocker('В файле нет ни одного bpmn:process');
    return { status: 'failed', report: report.build(source) };
  }

  // ЗНАМЕНАТЕЛЬ ПЛОТНОСТИ считается по ВСЕМУ поддереву процесса, на любой
  // глубине: только так «показано N из M» отвечает на вопрос «карта это вся
  // схема или её треть».
  const everything = nsAll(process, BPMN_NS.model, '*');
  for (const el of everything) {
    report.countInFile(contentKindOf(el));
  }

  /*
   * ИСХОД КАЖДОГО ЭЛЕМЕНТА — В ОДНОЙ КАРТЕ, а не в счётчиках по ходу обхода.
   *
   * Счётчики позволяли бы забыть элемент: он просто не попал бы ни в одну ветку,
   * и арифметика разошлась бы молча — ровно тот класс тихой потери, ради которого
   * отчёт и написан. С картой обход сначала помечает то, что понял, а в конце
   * ОДИН проход раздаёт исход всем остальным по происхождению.
   */
  const disposed = new Map<Element, Disposition>();

  /*
   * Профиль подбирается ПО id ПРОЦЕССА, а вызывающий код может его перебить.
   * Пользователю решать нечего: файл либо та самая модель, либо нет, и проверка
   * одной строки честнее переключателя, смысл которого пришлось бы объяснять.
   */
  const profile = meta.profile ?? profileFor(process.getAttribute('id')) ?? NEUTRAL_PROFILE;
  const activeProfile =
    profile.processId === '' || profile.processId === process.getAttribute('id')
      ? profile
      : NEUTRAL_PROFILE;

  const modules = collectModules(process, planes);
  const shownModules: ModuleDraft[] = [];
  const skippedModules: ModuleDraft[] = [];
  for (const module of modules) {
    if (hasFlowNodes(module)) {
      shownModules.push(module);
    } else {
      skippedModules.push(module);
      report.skipModule({
        name: module.meta.title === '' ? module.bpmnId : module.meta.title,
        sourceId: module.bpmnId,
        reason: 'module-empty',
      });
    }
  }

  if (shownModules.length === 0) {
    report.blocker('Ни один подпроцесс верхнего уровня не содержит узлов процесса');
    return { status: 'failed', report: report.build(source) };
  }

  // ── id раздаются ОДИН раз на весь документ ──
  // validateIntegrity требует глобальной уникальности id узлов по всей карте,
  // поэтому раздавать их поэтапно нельзя.
  const idSources: string[] = [];
  for (const module of shownModules) {
    for (const child of module.children) {
      const bpmnId = child.getAttribute('id');
      if (bpmnId !== null && bpmnId !== '') {
        idSources.push(bpmnId);
      }
    }
  }
  const assigned = assignUniqueIds(idSources);
  const ids = new Map<string, string>();
  idSources.forEach((bpmnId, index) => {
    const value = assigned[index];
    if (value !== undefined) {
      ids.set(bpmnId, value);
    }
  });

  const stages: Stage[] = [];
  /** Код модуля → id этапа: по нему стрелки обзора находят свои концы. */
  const stageIdByCode = new Map<string, string>();

  shownModules.forEach((module, index) => {
    const stageId = `stage-${index + 1}-${slugify(
      module.meta.code !== '' ? module.meta.code : module.meta.title,
      'stage',
      24,
    )}`;

    if (module.meta.code !== '') {
      stageIdByCode.set(module.meta.code, stageId);
    }

    const drafts = collectNodes(module, ids, notationLabel);
    const nodeIds = new Set(drafts.map((draft) => draft.node.id));
    const { edges, dropped } = collectEdges(module, ids, nodeIds);
    const groupResult = collectGroups(module, drafts, ids, activeProfile);
    const annotationResult = collectAnnotations(module, drafts, ids, activeProfile);
    const usage = collectDataUsage(module);

    // Середина области шагов — запасной вариант для артефакта, не связанного ни
    // с чем ассоциацией. Таких в модели двенадцать.
    const placedFlow = drafts.filter(
      (draft) => draft.node.type !== 'data' && draft.bounds !== undefined,
    );
    const xs = placedFlow.map((draft) => draft.bounds?.x ?? 0);
    const middle = xs.length === 0 ? 0 : (Math.min(...xs) + Math.max(...xs)) / 2;

    const nodes: ProcessNode[] = drafts.map((draft) => {
      const bpmnId = draft.source.getAttribute('id') ?? '';
      const description = joinDescription(annotationResult.descriptions.get(draft.node.id) ?? []);
      const owner = annotationResult.owners.get(draft.node.id);
      const group = groupResult.membership.get(draft.node.id);
      const direction =
        draft.node.type === 'data'
          ? directionOf(bpmnId, usage.producedBy, usage.consumedBy, () =>
              (draft.bounds?.x ?? 0) < middle ? 'in' : 'out',
            )
          : undefined;
      const slide = draft.bounds;
      return {
        ...draft.node,
        ...(description === undefined ? {} : { description }),
        ...(group === undefined ? {} : { group }),
        ...(direction === undefined ? {} : { direction }),
        ...(owner === undefined ? {} : { owner }),
        ...(slide === undefined ? {} : { slidePosition: { x: slide.x, y: slide.y } }),
      };
    });

    // ── исходы прямых детей модуля ──
    for (const draft of drafts) {
      disposed.set(draft.source, 'shown');
    }
    const shownEdgeIds = new Set(edges.map((edge) => edge.id));
    const shownGroupIds = new Set(groupResult.groups.map((group) => group.id));
    const unattached = new Set(annotationResult.unattached);

    for (const child of module.children) {
      if (disposed.has(child)) {
        continue;
      }
      if (child.namespaceURI !== BPMN_NS.model) {
        disposed.set(child, 'unsupported');
        report.note({
          reason: 'unsupported-element',
          kind: contentKindOf(child),
          sourceId: child.getAttribute('id') ?? '',
          sourceName: elementName(child),
          moduleName: module.meta.title,
        });
        continue;
      }
      const mapped = ids.get(child.getAttribute('id') ?? '');
      switch (child.localName) {
        case 'sequenceFlow':
          disposed.set(
            child,
            mapped !== undefined && shownEdgeIds.has(mapped) ? 'shown' : 'dropped',
          );
          break;
        case 'group':
          disposed.set(
            child,
            mapped !== undefined && shownGroupIds.has(mapped) ? 'shown' : 'dropped',
          );
          break;
        case 'textAnnotation':
          // Привязанная аннотация не показана, а ПЕРЕЕХАЛА в описание узла.
          // Смешивать это с потерей нельзя: пользователю важно, исчез текст или
          // переехал.
          disposed.set(child, unattached.has(child) ? 'dropped' : 'attached');
          break;
        case 'association':
          disposed.set(child, 'attached');
          break;
        default:
          if (isKnownNonNode(child)) {
            disposed.set(child, 'dropped');
          } else {
            disposed.set(child, 'unsupported');
            report.note({
              reason: 'unsupported-element',
              kind: contentKindOf(child),
              sourceId: child.getAttribute('id') ?? '',
              sourceName: elementName(child),
              moduleName: module.meta.title,
            });
          }
      }
    }

    for (const el of dropped) {
      report.note({
        reason: 'edge-endpoint-missing',
        kind: 'sequenceFlow',
        sourceId: el.getAttribute('id') ?? '',
        sourceName: elementName(el),
        moduleName: module.meta.title,
      });
    }
    for (const el of groupResult.unlabelled) {
      report.note({
        reason: 'group-unlabelled',
        kind: 'group',
        sourceId: el.getAttribute('id') ?? '',
        sourceName: '',
        moduleName: module.meta.title,
      });
    }
    for (const el of annotationResult.unattached) {
      report.note({
        reason: 'annotation-unattached',
        kind: 'annotation',
        sourceId: el.getAttribute('id') ?? '',
        sourceName: '',
        moduleName: module.meta.title,
      });
    }

    /*
     * ДЕДУПЛИКАЦИЯ ИДЁТ ДО СРЕЗА, И ПОРЯДОК ЗДЕСЬ — ВЕСЬ СМЫСЛ (process-map-xsk).
     *
     * В модели владельца одинаково названные объекты данных встречаются в 6
     * модулях из 10: «Производственный план», «Данные для расчета запасов»,
     * «Сценарии». Для читателя это ОДИН выход, а не два.
     *
     * Срез до дедупликации давал два разных дефекта сразу: карточка печатала
     * один и тот же выход дважды, и этот дубль занимал слот в четвёрке,
     * вытесняя из неё выход, который ещё нигде не назван. Второе тише и хуже
     * первого — потеря содержания без единого признака на экране.
     *
     * Set сохраняет порядок вставки, поэтому результат детерминирован: это
     * важно, карта из BPMN коммитится в репозиторий и сверяется побайтово.
     */
    const keyOutputs = [
      ...new Set(
        nodes
          .filter((node) => node.type === 'data' && node.direction === 'out')
          .map((node) => node.label),
      ),
    ].slice(0, 4);

    const stage: Stage = {
      id: stageId,
      number: index + 1,
      title: module.meta.title === '' ? module.bpmnId : module.meta.title,
      shortTitle: shortTitleOf(module.meta),
      keyOutputs,
      groups: groupResult.groups,
      nodes,
      edges,
      inputs: [],
      outputs: [],
    };

    // Координаты считает ТО ЖЕ ядро, что и `npm run layout`: карта, положенная
    // потом в репозиторий, получит те же числа, и mapContract это подтвердит.
    const placements = layoutStage(stage);
    for (const node of stage.nodes) {
      const placement = placements.get(node.id);
      if (placement !== undefined) {
        node.position = { x: placement.x, y: placement.y };
      }
    }

    stages.push(stage);
    report.addStage({
      stageId,
      title: stage.title,
      sourceId: module.bpmnId,
      nodes: nodes.filter((node) => node.type !== 'data').length,
      dataNodes: nodes.filter((node) => node.type === 'data').length,
      edges: edges.length,
      groups: groupResult.groups.length,
      belowLevel: countBelowLevel(module),
    });
  });

  // ── развёртка: исход получают ВСЕ оставшиеся элементы ──
  // Ровно это делает учёт полным по построению: пропустить элемент нельзя, он
  // либо помечен выше, либо попадёт сюда.
  const skippedIds = new Set(skippedModules.map((module) => module.bpmnId));
  const shownIds = new Set(shownModules.map((module) => module.bpmnId));

  // Сам модуль, ставший этапом, ПОКАЗАН, а не отброшен: он представлен на карте
  // карточкой этапа. Без этой строки отчёт называл бы двенадцать модулей
  // потерянными и занижал бы плотность на них же.
  for (const module of shownModules) {
    disposed.set(module.element, 'shown');
  }
  for (const module of skippedModules) {
    disposed.set(module.element, 'dropped');
  }

  for (const el of everything) {
    if (disposed.has(el)) {
      continue;
    }
    const disposition = dispositionOfRest(el, process, shownIds, skippedIds);
    disposed.set(el, disposition);
    // Прямой ребёнок процесса, не ставший модулем, теряется молча — а это ровно
    // то, чего отчёт не должен допускать. В модели владельца так теряется
    // задача «On Hold»: она лежит вне модулей, и этапа у неё нет.
    if (el.parentElement === process && contentKindOf(el) !== 'other') {
      report.note({
        reason: 'outside-modules',
        kind: contentKindOf(el),
        sourceId: el.getAttribute('id') ?? '',
        sourceName: elementName(el),
        moduleName: '',
      });
    }
  }
  for (const [el, disposition] of disposed) {
    report.record(contentKindOf(el), disposition);
  }
  for (const module of skippedModules) {
    report.note({
      reason: 'module-empty',
      kind: 'flowNode',
      sourceId: module.bpmnId,
      sourceName: module.meta.title,
      moduleName: '',
    });
  }

  const totalNodes = stages.reduce((sum, stage) => sum + stage.nodes.length, 0);
  if (totalNodes > MAX_MAP_NODES) {
    report.blocker(`Узлов в карте ${totalNodes}, потолок ${MAX_MAP_NODES}`);
    return { status: 'failed', report: report.build(source) };
  }

  const title =
    normalizeText(process.getAttribute('name')) ||
    normalizeText(definitions.getAttribute('name')) ||
    meta.fileName.replace(/\.[^.]+$/, '');

  /*
   * Стрелки обзора выводятся из ИМЁН граничных событий: связей между модулями в
   * файле нет вовсе. Это вывод, а не факт, поэтому он работает только с
   * объявленным профилем, а неразрешённые имена идут в отчёт — владелец должен
   * видеть, сколько переходов инструмент не понял.
   */
  const crossRefs = resolveCrossReferences(
    shownModules.map((module) => ({ code: module.meta.code, children: module.children })),
    activeProfile,
  );
  const overviewEdges = buildOverviewEdges(crossRefs.refs, stageIdByCode);

  const draft = {
    version: '1.0.0',
    id: mapIdFrom(process.getAttribute('id') ?? meta.fileName),
    updatedAt: isoDate(meta.lastModified),
    title,
    // moduleLabel обязателен и непуст по схеме: это подпись рамки вокруг потока.
    moduleLabel: title,
    stages,
    overviewEdges,
  };

  const parsed = ProcessMapSchema.safeParse(draft);
  if (!parsed.success) {
    report.blocker(`Карта не прошла схему: ${parsed.error.issues[0]?.message ?? 'ошибка'}`);
    return { status: 'failed', report: report.build(source) };
  }
  const problems = validateIntegrity(parsed.data);
  if (problems.length > 0) {
    report.blocker(`Нарушена целостность карты: ${problems[0] ?? ''}`);
    return { status: 'failed', report: report.build(source) };
  }

  return { status: 'ok', map: parsed.data, report: report.build(source) };
}

/**
 * Исход элемента, не помеченного при обходе модулей.
 *
 * Три случая, и различать их обязательно: содержимое свёрнутой карточки —
 * это не потеря, а осознанная свёртка; элемент пустого модуля потерян вместе с
 * модулем; элемент вне модулей потерян потому, что этапа у него нет.
 */
function dispositionOfRest(
  el: Element,
  process: Element,
  shownModules: ReadonlySet<string>,
  skippedModules: ReadonlySet<string>,
): Disposition {
  for (let parent = el.parentElement; parent !== null; parent = parent.parentElement) {
    const id = parent.getAttribute('id') ?? '';
    if (shownModules.has(id)) {
      return 'belowLevel';
    }
    if (skippedModules.has(id)) {
      return 'dropped';
    }
    if (parent === process) {
      return 'dropped';
    }
  }
  return 'dropped';
}
