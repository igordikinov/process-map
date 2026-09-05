// Модули верхнего уровня → этапы карты (process-map-70e.5).
//
// РЕШЕНИЕ ВЛАДЕЛЬЦА от 05.09.2026: этап — это подпроцесс верхнего уровня, а
// уровень 2 — его ПРЯМЫЕ дети. Свёрнутый подпроцесс внутри остаётся одной
// карточкой: так его и нарисовал автор схемы, а третьего уровня навигации в
// приложении нет.
//
// Прежний план предполагал лестницу «пулы → дорожки → подпроцессы». Настоящий
// файл её отменил: в модели In.Plan нет ни `collaboration`, ни `laneSet` —
// единственная иерархия там подпроцессы. Лестница осталась бы кодом, который
// невозможно проверить ни на одном имеющемся файле.
import { readingOrder, type Bounds, type PlaneIndex } from './di';
import { parseModuleName, type ModuleName } from './text';
import { BPMN_NS, nsAll, nsChildren } from './xml';
import { classifyElement } from './taxonomy';

export interface ModuleDraft {
  /** Сам элемент подпроцесса — нужен, чтобы считать спрятанное под ним. */
  readonly element: Element;
  readonly bpmnId: string;
  readonly rawName: string;
  readonly meta: ModuleName;
  /** ПРЯМЫЕ дети модуля — ровно то, что попадёт на уровень 2. */
  readonly children: readonly Element[];
  /** Собственный план модуля: координаты его детей живут ТАМ, а не в корневом. */
  readonly plane: PlaneIndex | undefined;
  readonly bounds: Bounds | undefined;
}

/** Единственный `bpmn:process` документа, или `undefined`. */
export function findProcess(doc: Document): Element | undefined {
  const definitions = doc.documentElement;
  const processes = nsChildren(definitions, BPMN_NS.model, 'process');
  // Процессов может быть несколько (по одному на пул). Берём тот, у которого
  // больше всего прямых детей: он и есть содержательный, остальные — заглушки
  // участников. Молча брать первый нельзя: порядок в файле произвольный.
  return [...processes].sort((a, b) => b.children.length - a.children.length)[0];
}

/**
 * Модули верхнего уровня в порядке чтения корневой диаграммы.
 *
 * ПОЧЕМУ НЕ ДОКУМЕНТНЫЙ ПОРЯДОК. Порядок детей `bpmn:process` — это порядок
 * создания элементов в Modeler, и в модели владельца он ставит первыми четыре
 * самых пустых модуля. Порядок чтения по геометрии даёт тот ряд, который автор
 * видит на экране, — а именно он и станет порядком карточек на обзоре.
 */
export function collectModules(process: Element, planes: Map<string, PlaneIndex>): ModuleDraft[] {
  const rootPlane = planes.get(process.getAttribute('id') ?? '');
  const drafts = nsChildren(process, BPMN_NS.model, 'subProcess').map((el) => {
    const bpmnId = el.getAttribute('id') ?? '';
    const rawName = el.getAttribute('name') ?? '';
    return {
      element: el,
      bpmnId,
      rawName,
      meta: parseModuleName(rawName),
      children: Array.from(el.children),
      plane: planes.get(bpmnId),
      bounds: rootPlane?.bounds(bpmnId),
    } satisfies ModuleDraft;
  });

  return readingOrder(drafts.map((item) => ({ item, bounds: item.bounds })));
}

/**
 * Есть ли у модуля хоть один узел потока среди прямых детей.
 *
 * Решение владельца: пустые модули пропускаются. В модели их два — «Price
 * Planning» и «Optimizer», внутри пусто. Этап без единого узла дал бы пустое
 * полотно, а `mapContract` для карт на диске такое прямо запрещает.
 */
export function hasFlowNodes(module: ModuleDraft): boolean {
  return module.children.some((child) => {
    const kind = classifyElement(child);
    return kind !== undefined && kind.type !== 'data';
  });
}

/**
 * Короткая подпись этапа для карточки обзора.
 *
 * Код модуля («SNP», «DP») — идеальный кандидат: он короткий и именно им автор
 * называет модуль. Если кода нет, берём название, обрезая по границе слова:
 * карточка обзора узкая, и середина слова в ней читается как ошибка.
 */
export function shortTitleOf(meta: ModuleName, maxLength = 24): string {
  if (meta.code !== '') {
    return meta.code;
  }
  const title = meta.title;
  if (title.length <= maxLength) {
    return title;
  }
  const cut = title.slice(0, maxLength);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > 8 ? cut.slice(0, lastSpace) : cut).trim();
}

/**
 * Сколько элементов спрятано за свёрнутой карточкой модуля.
 *
 * Считается всё, что глубже прямых детей: именно это число отвечает на вопрос
 * «карточка показывает пять узлов, а сколько под ней». У модуля DM в модели
 * владельца пять узлов на карте и 291 глубже — без этой цифры карта врала бы
 * умолчанием.
 */
export function countBelowLevel(module: ModuleDraft): number {
  let total = 0;
  for (const child of nsAll(module.element, BPMN_NS.model, '*')) {
    if (child.parentElement !== module.element) {
      total += 1;
    }
  }
  return total;
}
