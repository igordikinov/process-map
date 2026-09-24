// Отчёт о том, что из схемы показано, а что нет (process-map-70e.5).
//
// ЗАЧЕМ ОН ВООБЩЕ. Карта показывает не всю схему: содержимое свёрнутых
// подпроцессов остаётся за карточкой, часть элементов не имеет представления в
// модели. На настоящем файле владельца видно 304 узла потока из 911 — треть.
// Пользователь этого не ожидает, и без отчёта карта врала бы умолчанием.
//
// ЧЕТЫРЕ СЛОЯ, КОТОРЫЕ ДЕЛАЮТ «ПОТЕРЯТЬ МОЛЧА» НЕВОЗМОЖНЫМ:
//  1. обход инвертирован — адаптер идёт по детям и КЛАССИФИЦИРУЕТ каждого, а не
//     ищет известные имена: способ «искать известное» по построению не может
//     сообщить о том, чего не искал;
//  2. у каждого элемента ровно один исход, третьего состояния «не рассматривали»
//     нет;
//  3. арифметика тождества, проверяемая тестом: сумма исходов равна числу
//     элементов этого вида в документе. Потерять элемент — значит не сойтись в
//     сложении, а не «не заметить»;
//  4. доля не отдаётся без знаменателя: `density` — пара, а не число, и голый
//     процент из отчёта достать нечем.

/** Вид содержания схемы, по которому считается плотность отображения. */
export type ContentKind =
  'flowNode' | 'sequenceFlow' | 'dataNode' | 'annotation' | 'group' | 'other';

/**
 * Что адаптер сделал с элементом. Ровно один исход на элемент.
 *
 * `attached` — элемент не стал объектом карты, но его содержание переехало в
 * поле другого объекта (аннотация в описание шага). Это НЕ потеря, и смешивать
 * его с `dropped` нельзя: пользователю важно, исчез текст или переехал.
 */
export type Disposition = 'shown' | 'attached' | 'belowLevel' | 'dropped' | 'unsupported';

/**
 * Причина, по которой элемент не показан. Перечисление закрытое: у каждого
 * значения обязан быть текст, и `Record<LossReason, string>` это сторожит.
 */
export type LossReason =
  | 'module-empty'
  | 'below-level'
  | 'outside-modules'
  | 'group-unlabelled'
  | 'annotation-unattached'
  | 'edge-endpoint-missing'
  | 'not-a-node'
  | 'unsupported-element';

export interface LossItem {
  readonly reason: LossReason;
  readonly kind: ContentKind;
  /** id элемента в файле — по нему владелец найдёт объект в Camunda Modeler. */
  readonly sourceId: string;
  /** Имя из файла. Пустая строка — частая ПРИЧИНА потери, а не отсутствие данных. */
  readonly sourceName: string;
  /** Модуль, к которому элемент относился бы. Пусто — элемент вне модулей. */
  readonly moduleName: string;
}

/**
 * Ведро потерь одной причины.
 *
 * ПОЧЕМУ ВЕДРО, А НЕ ПЛОСКИЙ СПИСОК: `below-level` на настоящем файле — это
 * шестьсот с лишним элементов. Список такой длины не читают, он превращает
 * отчёт в шум и прячет те несколько десятков, с которыми владелец МОЖЕТ
 * что-то сделать. Поимённо перечисляется то, что чинится руками; массовое
 * даётся числом с примерами.
 */
export interface LossBucket {
  readonly reason: LossReason;
  readonly count: number;
  readonly samples: readonly LossItem[];
  /** false — примеров меньше, чем потерь; рендер обязан напечатать «и ещё N». */
  readonly complete: boolean;
}

export interface StageReport {
  readonly stageId: string;
  readonly title: string;
  readonly sourceId: string;
  readonly nodes: number;
  readonly dataNodes: number;
  readonly edges: number;
  readonly groups: number;
  /** Сколько элементов спрятано за свёрнутыми карточками подпроцессов. */
  readonly belowLevel: number;
}

export interface SkippedModule {
  readonly name: string;
  readonly sourceId: string;
  readonly reason: LossReason;
}

export interface BpmnReport {
  readonly source: {
    readonly fileName: string;
    readonly exporter: string;
    readonly planes: number;
    readonly elements: number;
  };
  /** По одной строке на вид содержания; сумма исходов равна `inFile`. */
  readonly density: readonly {
    readonly kind: ContentKind;
    readonly inFile: number;
    readonly shown: number;
    readonly attached: number;
    readonly belowLevel: number;
    readonly dropped: number;
    readonly unsupported: number;
  }[];
  /**
   * Главная цифра отчёта. ПАРА, А НЕ ДОЛЯ: голый процент можно напечатать без
   * знаменателя, и «показано 33%» читается совсем не так, как «304 из 911».
   */
  readonly shownFlowNodes: { readonly shown: number; readonly inFile: number };
  readonly stages: readonly StageReport[];
  readonly skippedModules: readonly SkippedModule[];
  readonly losses: readonly LossBucket[];
  /** Пусто ровно тогда, когда карта собралась. */
  readonly blockers: readonly string[];
}

const KINDS: readonly ContentKind[] = [
  'flowNode',
  'sequenceFlow',
  'dataNode',
  'annotation',
  'group',
  'other',
];

/** Сколько примеров показывать в ведре потерь. */
const MAX_SAMPLES = 8;

/**
 * Накопитель отчёта. Заполняется во время обхода, замораживается в конце —
 * жанр SlideReport из scripts/import-pptx.py, только результат становится
 * данными, а не печатью.
 */
export class ReportBuilder {
  private readonly counts = new Map<string, number>();
  private readonly inFile = new Map<ContentKind, number>();
  private readonly items: LossItem[] = [];
  private readonly stages: StageReport[] = [];
  private readonly skipped: SkippedModule[] = [];
  private readonly blockers: string[] = [];

  /** Знаменатель плотности: сколько таких элементов в ФАЙЛЕ, на любой глубине. */
  countInFile(kind: ContentKind, count = 1): void {
    this.inFile.set(kind, (this.inFile.get(kind) ?? 0) + count);
  }

  /** Исход одного элемента. Вызывается ровно один раз на элемент. */
  record(kind: ContentKind, disposition: Disposition): void {
    const key = `${kind}|${disposition}`;
    this.counts.set(key, (this.counts.get(key) ?? 0) + 1);
  }

  /**
   * Пометка «этот элемент не показан, и вот почему».
   *
   * Исход при этом НЕ записывается: он приходит из общей развёртки в адаптере,
   * где каждому элементу раздаётся ровно один исход. Иначе элемент, о котором
   * есть и пометка, и исход, посчитался бы дважды, и арифметика тождества
   * разошлась бы — причём в сторону, которая выглядит как «показано больше,
   * чем есть».
   */
  note(item: LossItem): void {
    this.items.push(item);
  }

  addStage(stage: StageReport): void {
    this.stages.push(stage);
  }

  skipModule(module: SkippedModule): void {
    this.skipped.push(module);
  }

  blocker(text: string): void {
    this.blockers.push(text);
  }

  build(source: BpmnReport['source']): BpmnReport {
    const density = KINDS.map((kind) => ({
      kind,
      inFile: this.inFile.get(kind) ?? 0,
      shown: this.counts.get(`${kind}|shown`) ?? 0,
      attached: this.counts.get(`${kind}|attached`) ?? 0,
      belowLevel: this.counts.get(`${kind}|belowLevel`) ?? 0,
      dropped: this.counts.get(`${kind}|dropped`) ?? 0,
      unsupported: this.counts.get(`${kind}|unsupported`) ?? 0,
    }));

    const byReason = new Map<LossReason, LossItem[]>();
    for (const item of this.items) {
      const bucket = byReason.get(item.reason) ?? [];
      bucket.push(item);
      byReason.set(item.reason, bucket);
    }
    const losses = [...byReason.entries()].map(([reason, items]) => ({
      reason,
      count: items.length,
      samples: items.slice(0, MAX_SAMPLES),
      complete: items.length <= MAX_SAMPLES,
    }));

    const flow = density.find((row) => row.kind === 'flowNode');
    return {
      source,
      density,
      shownFlowNodes: { shown: flow?.shown ?? 0, inFile: flow?.inFile ?? 0 },
      stages: this.stages,
      skippedModules: this.skipped,
      losses,
      blockers: this.blockers,
    };
  }
}

/**
 * Сходится ли арифметика: сумма исходов равна числу элементов вида в файле.
 *
 * Вынесено в функцию, а не оставлено тесту, потому что это утверждение о самом
 * отчёте, и проверять его должен и рантайм — расхождение означает, что элемент
 * потерялся между обходом и учётом.
 */
export function densityMismatches(report: BpmnReport): string[] {
  return report.density
    .filter((row) => {
      const sum = row.shown + row.attached + row.belowLevel + row.dropped + row.unsupported;
      return sum !== row.inFile;
    })
    .map(
      (row) =>
        `${row.kind}: учтено ${
          row.shown + row.attached + row.belowLevel + row.dropped + row.unsupported
        }, в файле ${row.inFile}`,
    );
}
