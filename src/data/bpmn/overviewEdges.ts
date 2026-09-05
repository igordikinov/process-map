// Стрелки обзора: связи между модулями (process-map-70e.5).
//
// ПРОБЛЕМА, КОТОРУЮ ЭТО РЕШАЕТ. Связей между модулями в файле НЕТ ВОВСЕ: у
// процесса верхнего уровня двенадцать подпроцессов, одна бесхозная задача и
// группа — ни одного `sequenceFlow`. Взятый буквально, обзор был бы десятью
// карточками без единой стрелки, то есть переставал бы быть обзором процесса и
// становился списком модулей.
//
// ГДЕ СВЯЗИ ВСЁ-ТАКИ ЕСТЬ. Стартовые и конечные события ВНУТРИ модулей названы
// кодами соседей: SNP начинается с «DP: Планирование спроса» и «IO: Оптимизация
// запасов», SOP заканчивается «DP» и «SNP». Автор записал переходы текстом, а
// не стрелками.
//
// ЧЕСТНАЯ ОГОВОРКА. Это ВЫВОД ПО ИМЕНИ, а не факт из файла: имя события может
// совпасть с кодом модуля случайно, а может и не совпасть, когда переход есть.
// Поэтому вывод работает только с объявленным профилем, а всё неразрешённое
// попадает в отчёт — чтобы владелец видел, сколько переходов инструмент НЕ
// понял, и не считал получившийся граф полным.
import type { Edge } from '../schema';
import type { BpmnProfile } from './profile';
import { elementName } from './text';
import { BPMN_NS, nsChildren } from './xml';

export interface CrossReference {
  /** Код модуля-источника по профилю. */
  readonly from: string;
  /** Код модуля-приёмника. */
  readonly to: string;
  /** Имя события, из которого связь выведена, — для отчёта. */
  readonly via: string;
}

export interface CrossReferenceResult {
  readonly refs: readonly CrossReference[];
  /** Имена граничных событий, которые не удалось сопоставить ни с одним модулем. */
  readonly unresolved: readonly string[];
}

/**
 * Первый токен имени: «DP: Планирование спроса» → `DP`, «SNP» → `SNP`.
 *
 * Берётся именно НАЧАЛО строки: код соседа автор ставит первым, а дальше идёт
 * пояснение. Поиск кода где угодно в строке давал бы ложные срабатывания —
 * «Передача в PS» и «Проверка PS-отчёта» означают разное.
 */
function leadingToken(name: string): string {
  const match = /^([A-ZА-ЯЁ&][A-ZА-ЯЁ0-9&]{0,7})\b/u.exec(name);
  return match?.[1] ?? '';
}

/**
 * Граничные события модулей → пары «модуль → модуль».
 *
 * `startEvent` с кодом соседа означает «сюда приходят ОТТУДА», `endEvent` —
 * «отсюда уходит ТУДА». Направление именно такое: стартовое событие называет
 * источник, конечное — приёмник.
 */
export function resolveCrossReferences(
  modules: readonly { readonly code: string; readonly children: readonly Element[] }[],
  profile: BpmnProfile,
): CrossReferenceResult {
  const refs: CrossReference[] = [];
  const unresolved: string[] = [];
  const seen = new Set<string>();

  for (const module of modules) {
    if (module.code === '') {
      continue;
    }
    for (const child of module.children) {
      if (child.namespaceURI !== BPMN_NS.model) {
        continue;
      }
      const isStart = child.localName === 'startEvent';
      const isEnd = child.localName === 'endEvent';
      if (!isStart && !isEnd) {
        continue;
      }
      const name = elementName(child);
      if (name === '') {
        continue;
      }
      const target = profile.moduleAliases.get(leadingToken(name));
      if (target === undefined) {
        unresolved.push(name);
        continue;
      }
      const from = isStart ? target : module.code;
      const to = isStart ? module.code : target;
      if (from === to) {
        // Событие называет собственный модуль: это не переход, а пометка
        // «сюда возвращаемся». Петля на обзоре ничего не сообщила бы.
        continue;
      }
      const key = `${from}->${to}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      refs.push({ from, to, via: name });
    }
  }

  return { refs, unresolved };
}

/**
 * Пары модулей → рёбра обзора.
 *
 * Ребро строится, только если ОБА конца стали этапами: модуль, пропущенный как
 * пустой, стрелку не получает — она вела бы в карточку, которой на обзоре нет,
 * и `validateIntegrity` объявила бы это ошибкой данных.
 */
export function buildOverviewEdges(
  refs: readonly CrossReference[],
  stageIdByCode: ReadonlyMap<string, string>,
): Edge[] {
  const edges: Edge[] = [];
  for (const ref of refs) {
    const source = stageIdByCode.get(ref.from);
    const target = stageIdByCode.get(ref.to);
    if (source === undefined || target === undefined || source === target) {
      continue;
    }
    edges.push({ id: `ov-${source}--${target}`, source, target, kind: 'process' });
  }
  return edges;
}

/** Прямые дети элемента — вынесено, чтобы адаптер не тянул xml.ts ради одной строки. */
export function directChildren(el: Element): Element[] {
  return nsChildren(el, BPMN_NS.model, '*');
}
