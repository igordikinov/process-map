// Геометрия диаграммы BPMN: планы, прямоугольники, порядок чтения
// (process-map-70e.5).
//
// ГЛАВНОЕ, ЧТО ЗДЕСЬ ЛЕГКО ПЕРЕПУТАТЬ. Планов в файле не один, а по одному на
// каждый свёрнутый подпроцесс — в модели владельца их 73. Координаты
// `dc:Bounds` отсчитываются ВНУТРИ СВОЕГО плана: у детей модуля SNP начало
// около x≈202, у детей DP — около x≈372, и это разные системы координат.
// Взять корневой план для детей модуля — самая вероятная ошибка реализации, и
// она спрячется: `slidePositionOf` в раскладке молча откатится на `position`,
// узлы разъедутся, но ничего не упадёт.
import { BPMN_NS, nsAll, nsChildren, numAttr } from './xml';

export interface Bounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** План одной диаграммы: геометрия элементов ОДНОГО подпроцесса или процесса. */
export interface PlaneIndex {
  /** `@bpmnElement` плана — id процесса или подпроцесса, который он рисует. */
  readonly ownerId: string;
  /** Прямоугольник элемента в системе координат ЭТОГО плана. */
  readonly bounds: (bpmnId: string) => Bounds | undefined;
  /** Свёрнут ли элемент (у подпроцесса `isExpanded` отсутствует или false). */
  readonly isExpanded: (bpmnId: string) => boolean;
}

function readBounds(shape: Element): Bounds | undefined {
  const box = nsChildren(shape, BPMN_NS.dc, 'Bounds')[0];
  if (box === undefined) {
    return undefined;
  }
  const x = numAttr(box, 'x');
  const y = numAttr(box, 'y');
  const width = numAttr(box, 'width');
  const height = numAttr(box, 'height');
  if (x === undefined || y === undefined || width === undefined || height === undefined) {
    return undefined;
  }
  return { x, y, width, height };
}

/**
 * Все планы документа по `@bpmnElement`.
 *
 * План без `@bpmnElement` пропускается: он ничего не адресует, и молча
 * приписать его чему-либо было бы догадкой.
 */
export function indexPlanes(doc: Document): Map<string, PlaneIndex> {
  const planes = new Map<string, PlaneIndex>();
  for (const plane of nsAll(doc, BPMN_NS.bpmndi, 'BPMNPlane')) {
    const ownerId = plane.getAttribute('bpmnElement');
    if (ownerId === null || ownerId === '') {
      continue;
    }
    const boxes = new Map<string, Bounds>();
    const expanded = new Set<string>();
    for (const shape of nsAll(plane, BPMN_NS.bpmndi, 'BPMNShape')) {
      const target = shape.getAttribute('bpmnElement');
      if (target === null || target === '') {
        continue;
      }
      const box = readBounds(shape);
      if (box !== undefined) {
        boxes.set(target, box);
      }
      if (shape.getAttribute('isExpanded') === 'true') {
        expanded.add(target);
      }
    }
    planes.set(ownerId, {
      ownerId,
      bounds: (bpmnId) => boxes.get(bpmnId),
      isExpanded: (bpmnId) => expanded.has(bpmnId),
    });
  }
  return planes;
}

/** Полностью ли `inner` лежит внутри `outer`. Допуск нужен: рамки рисуют на глаз. */
export function contains(outer: Bounds, inner: Bounds, tolerance = 2): boolean {
  return (
    inner.x >= outer.x - tolerance &&
    inner.y >= outer.y - tolerance &&
    inner.x + inner.width <= outer.x + outer.width + tolerance &&
    inner.y + inner.height <= outer.y + outer.height + tolerance
  );
}

export function areaOf(box: Bounds): number {
  return box.width * box.height;
}

/** Расстояние между центрами — для привязки свободной подписи к ближайшему узлу. */
export function centerDistance(a: Bounds, b: Bounds): number {
  const dx = a.x + a.width / 2 - (b.x + b.width / 2);
  const dy = a.y + a.height / 2 - (b.y + b.height / 2);
  return Math.hypot(dx, dy);
}

export interface Placed<T> {
  readonly item: T;
  readonly bounds: Bounds | undefined;
}

/**
 * Порядок чтения: строками сверху вниз, внутри строки слева направо.
 *
 * ЗАЧЕМ ИМЕННО СТРОКАМИ, а не просто по `y`. Элементы одной строки почти
 * никогда не выровнены по пикселю: у события высота 36, у задачи 80, и центры
 * различаются на десятки пикселей. Сортировка по чистому `y` разорвала бы
 * строку и выдала бы порядок, который читатель не узнаёт. Поэтому строкой
 * считается группа с перекрытием по вертикали.
 *
 * Элементы без геометрии уходят в хвост в исходном порядке: выдумывать им
 * место нельзя, а терять — тем более.
 */
export function readingOrder<T>(items: readonly Placed<T>[], rowTolerance = 0.5): T[] {
  const placed = items.filter((entry): entry is Placed<T> & { bounds: Bounds } => {
    return entry.bounds !== undefined;
  });
  const loose = items.filter((entry) => entry.bounds === undefined).map((entry) => entry.item);

  const sorted = [...placed].sort((a, b) => a.bounds.y - b.bounds.y);
  const rows: (Placed<T> & { bounds: Bounds })[][] = [];
  for (const entry of sorted) {
    const row = rows[rows.length - 1];
    const previous = row?.[0];
    const overlaps =
      previous !== undefined &&
      entry.bounds.y < previous.bounds.y + previous.bounds.height * rowTolerance;
    if (row !== undefined && overlaps) {
      row.push(entry);
    } else {
      rows.push([entry]);
    }
  }

  const ordered: T[] = [];
  for (const row of rows) {
    row.sort((a, b) => a.bounds.x - b.bounds.x);
    for (const entry of row) {
      ordered.push(entry.item);
    }
  }
  return [...ordered, ...loose];
}
