// Состояние UI карты процесса (SPEC.md §4.1–§4.7).
//
// В store лежит ТОЛЬКО состояние интерфейса. Сам ProcessMap сюда не кладётся:
// данные статичны и уже валидируются/сливаются в src/data/loader.ts, а два
// источника истины (loader + store) неизбежно разъезжались бы после правки
// ссылки в редакторе.
//
// Персистентности нет намеренно: `mode` персистить прямо запрещено (SPEC §4.4 —
// при загрузке всегда «Просмотр»), а уровень/выбранный узел восстанавливаются
// из deep-link (§4.7), а не из хранилища.
//
// УРОВЕНЬ — ДВА СКАЛЯРА, А НЕ ПУТЬ (эпик M8, задача process-map-9mn.12). У
// трёхуровневой карты экран адресуется парой currentModuleId + currentStageId;
// какой экран она означает, решает currentScreen() в src/data/modules.ts — он
// знает карту, store нет. Массив-путь [moduleId, stageId] рассматривался и
// отвергнут: новая ссылка на каждый переход будила бы каждого подписчика
// zustand, каждый селектор пришлось бы переписать на разбор массива, и сломался
// бы каждый тест store — ради той же выразительности, что у двух скаляров при
// глубине, которая фиксирована и равна трём.
//
// Двухуровневая карта живёт на этом же store без единой ветки: currentModuleId
// на ней просто всегда null, и все переходы ведут себя дословно как до M8.
import { create } from 'zustand';

export type ViewMode = 'view' | 'edit';

export interface ProcessState {
  /**
   * id выбранного модуля; null — модуль не выбран.
   *
   * На двухуровневой карте всегда null. На трёхуровневой null при
   * currentStageId === null — это корень (экран модулей).
   */
  currentModuleId: string | null;
  /**
   * id текущего этапа; null — экран этапов (обзор двухуровневой карты или
   * этапы модуля трёхуровневой), либо корень, если и модуль не выбран.
   */
  currentStageId: string | null;
  /** id узла с открытым Drawer; null — Drawer закрыт. */
  selectedNodeId: string | null;
  /** Режим тулбара. Всегда 'view' при загрузке, в localStorage не сохраняется. */
  mode: ViewMode;
  /** Toggle «Показать интеграции» (SPEC §4.6). По макету включён по умолчанию. */
  showIntegrations: boolean;
  /**
   * Открыта ли панель отчёта импорта (process-map-70e.9).
   *
   * Здесь, а не рядом с самим отчётом: отчёт это данные загруженной карты, а
   * «открыта ли панель» — состояние интерфейса, ровно то, для чего store и
   * заведён. В localStorage не сохраняется, как и mode.
   */
  importReportOpen: boolean;

  /** Переход на экран этапов модуля. Сбрасывает этап и закрывает Drawer. */
  navigateToModule: (moduleId: string) => void;
  /**
   * Переход на уровень шагов этапа. Всегда закрывает Drawer — см. комментарий
   * ниже. Модуль меняется ТОЛЬКО если передан второй аргумент.
   */
  navigateToStage: (stageId: string, moduleId?: string) => void;
  /** Ровно на один уровень вверх. */
  back: () => void;
  /** На корень карты с любого уровня. */
  resetLevel: () => void;
  /** Открыть Drawer узла. */
  selectNode: (nodeId: string) => void;
  /** Закрыть Drawer (Esc, клик по фону). */
  closeDrawer: () => void;
  /** Переключить показ интеграционных рёбер и узлов систем. */
  toggleIntegrations: () => void;
  /** Просмотр ↔ Редактор. */
  setMode: (mode: ViewMode) => void;
  /** Показать или скрыть панель отчёта импорта. */
  setImportReportOpen: (open: boolean) => void;
}

export interface ProcessUiState {
  currentModuleId: string | null;
  currentStageId: string | null;
  selectedNodeId: string | null;
  mode: ViewMode;
  showIntegrations: boolean;
  importReportOpen: boolean;
}

/**
 * Начальные значения. Вынесены отдельно, чтобы тесты могли сбрасывать store.
 *
 * currentModuleId: null здесь ОБЯЗАТЕЛЕН, и не ради полноты. Тесты сбрасывают
 * store вызовом useProcessStore.setState(createInitialState()), а setState в
 * zustand СЛИВАЕТ объект с текущим состоянием, а не заменяет его. Поле,
 * забытое здесь, сброс просто не трогает: модуль, выбранный одним тестом,
 * доживал бы до следующего, и тот проверял бы уже не тот экран.
 */
export function createInitialState(): ProcessUiState {
  return {
    currentModuleId: null,
    currentStageId: null,
    selectedNodeId: null,
    mode: 'view',
    showIntegrations: true,
    importReportOpen: false,
  };
}

export const useProcessStore = create<ProcessState>()((set) => ({
  ...createInitialState(),

  // Экран этапов модуля открывается «с чистого листа», откуда бы ни шёл
  // переход. Этап сбрасывается: открытый до перехода этап принадлежал своему
  // модулю, и оставь его — currentScreen() показал бы уровень шагов чужого
  // модуля, а не этапы выбранного (этап в нём старше модуля). Drawer, как и
  // при любой смене уровня, переход не переживает.
  navigateToModule: (moduleId) =>
    set({ currentModuleId: moduleId, currentStageId: null, selectedNodeId: null }),

  // Drawer не должен «протекать» между экранами: узел принадлежит конкретному
  // этапу, поэтому при смене уровня выбор всегда сбрасывается.
  // Deep-link ?stage=2&node=x реализуется как navigateToStage(...) → selectNode(...);
  // порядок вызовов важен, обратный порядок закроет Drawer.
  //
  // ВТОРОЙ АРГУМЕНТ НЕОБЯЗАТЕЛЕН, и это следствие шапки файла, а не удобство.
  // Store не знает карту и найти модуль-владелец этапа сам не может. Поэтому:
  //   - moduleId передан — store запоминает его (переход из deep-link
  //     ?module=&stage=, где владелец уже известен вызывающему);
  //   - moduleId не передан — текущий модуль ОСТАЁТСЯ, а не затирается. Клик
  //     по карточке этапа на экране модуля передавать его не обязан: модуль
  //     уже тот. Затирание сделало бы «Назад» с уровня шагов прыжком на
  //     корень вместо экрана модуля, а на двухуровневой карте ничего бы не
  //     изменило (там модуль и так null) — то есть дефект был бы виден только
  //     на картах с модулями.
  // Состояние «этап задан, модуль нет» при этом законно (deep-link ?stage=7 без
  // ?module=): кто знает карту, берёт владельца из документа — moduleOfStage()
  // в src/data/modules.ts.
  navigateToStage: (stageId, moduleId) =>
    set(
      moduleId === undefined
        ? { currentStageId: stageId, selectedNodeId: null }
        : { currentModuleId: moduleId, currentStageId: stageId, selectedNodeId: null },
    ),

  // РОВНО ОДИН УРОВЕНЬ ВВЕРХ и только по полям store, без обращения к карте:
  //   - открыт этап — закрыть этап, модуль оставить: с уровня шагов «Назад»
  //     ведёт на этапы ТОГО ЖЕ модуля, а не на корень;
  //   - этапа нет — закрыть модуль: с этапов модуля на корень (экран модулей).
  // На двухуровневой карте модуль всегда null, поэтому первая ветка — это
  // ровно прежний back() (детализация → обзор), а вторая на обзоре ничего не
  // меняет. Ветка «этап задан, модуль нет» (deep-link без ?module=) ведёт
  // первым же шагом на корень: store владельца этапа не знает, и угадывать его
  // не будет — кто хочет, чтобы «Назад» вёл на экран модуля, передаёт модуль
  // вторым аргументом navigateToStage.
  //
  // Drawer бывает открыт только на уровне шагов, и выбор сбрасывается в обеих
  // ветках — «Назад» не должен уносить открытую карточку ни на какой экран.
  back: () =>
    set((state) =>
      state.currentStageId !== null
        ? { currentStageId: null, selectedNodeId: null }
        : { currentModuleId: null, selectedNodeId: null },
    ),

  // На корень одним детерминированным прыжком — для тех, кому НЕ «на уровень
  // вверх», а «из этого состояния вообще»: подмена карты и смена версии
  // (src/data/mapSwitch.ts, src/data/versionSwitch.ts) и защита от неизвестного
  // этапа в StageDetail. Там оба id принадлежат карте, которой на экране уже
  // нет (или не принадлежат ни одной), и одного back() не хватает: с уровня
  // шагов он снимает только этап, а currentModuleId продолжал бы указывать на
  // модуль прежней карты.
  resetLevel: () => set({ currentModuleId: null, currentStageId: null, selectedNodeId: null }),

  // selectNode/closeDrawer меняют только выбор, уровень не трогают.
  selectNode: (nodeId) => set({ selectedNodeId: nodeId }),
  closeDrawer: () => set({ selectedNodeId: null }),

  // Ни toggle интеграций, ни смена режима не закрывают Drawer: выход из
  // редактора не должен ронять открытую карточку узла.
  toggleIntegrations: () => set((state) => ({ showIntegrations: !state.showIntegrations })),
  setMode: (mode) => set({ mode }),
  setImportReportOpen: (importReportOpen) => set({ importReportOpen }),
}));
