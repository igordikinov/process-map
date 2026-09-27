// Корень приложения: экраны без роутера (CLAUDE.md «Чего не делать»).
//
// Экран выбирает currentScreen() из src/data/modules.ts по двум скалярам store
// (currentModuleId, currentStageId) и по форме ДОКУМЕНТА (process-map-9mn.16):
//   · 'modules' — уровень 1 трёхуровневой карты, карточки модулей;
//   · 'stages'  — обзор этапов (SPEC §4.1): корень двухуровневой карты или
//                 экран модуля трёхуровневой;
//   · 'steps'   — детализация этапа (SPEC §4.2).
// Двухуровневая карта экрана 'modules' не получает никогда: currentScreen
// отвечает 'stages' при любом currentModuleId, если модулей у документа нет.
//
// Deep-link (?version=&module=&stage=&node=, SPEC §4.7, process-map-9mn.18)
// разбирается хуком useDeepLink: он подставляет id в store сразу после
// монтирования и дальше синхронизирует URL (replaceState) при любой навигации —
// см. src/hooks/useDeepLink.ts.
import { useEffect, useMemo, type ReactElement } from 'react';
import { ImportReport } from './components/ImportReport';
import { ModulesOverview } from './components/ModulesOverview';
import { Overview, type OverviewHeaderKind } from './components/Overview';
import { StageDetail } from './components/StageDetail';
import {
  currentScreen,
  hasModules,
  levelTwoView,
  moduleById,
  type LevelTwoView,
  type MapScreen,
} from './data/modules';
import { useDeepLink } from './hooks/useDeepLink';
import { useProcessMap } from './hooks/useProcessMap';
import { useProcessStore } from './store/useProcessStore';

interface ScreenViewProps {
  screen: MapScreen;
  /** Что показывает экран этапов — см. levelTwoView в src/data/modules.ts. */
  view: LevelTwoView;
  header: OverviewHeaderKind;
}

/**
 * Экран по его имени. switch по объединению без default: забытая ветка при
 * новом значении MapScreen — ошибка tsc TS2366 («Function lacks ending return
 * statement and return type does not include 'undefined'»), а не молчаливый
 * пустой экран.
 *
 * Эту ошибку даёт ТОЛЬКО явный тип результата ReactElement. Без него проверки
 * нет, хотя выглядит, будто есть: noImplicitReturns в tsconfig не включён, а
 * выведенный тип функции-компонента допускает undefined (ReactNode в
 * @types/react 18 включает undefined) — и switch без одной ветки молча
 * компилируется, рисуя пустой экран. Проверено на ревью 9mn.16: объединение
 * из четырёх значений при трёх ветках без аннотации — tsc exit 0, с
 * аннотацией — TS2366. Поэтому аннотацию не снимать «для краткости».
 */
function ScreenView({ screen, view, header }: ScreenViewProps): ReactElement {
  switch (screen) {
    case 'modules':
      return <ModulesOverview />;
    case 'stages':
      // Этапы выбранного модуля на трёхуровневой карте, вся карта — на
      // двухуровневой (process-map-9mn.17). Какие именно, решил levelTwoView
      // в App; экран получает готовые значения.
      return (
        <Overview
          stages={view.stages}
          overviewEdges={view.overviewEdges}
          frameLabel={view.frameLabel}
          module={view.module}
          header={header}
        />
      );
    case 'steps':
      return <StageDetail />;
  }
}

function App() {
  useDeepLink();
  const map = useProcessMap();
  // ДВА СЕЛЕКТОРА НА ДВА СКАЛЯРА, а не один на объект { currentModuleId,
  // currentStageId }. В zustand v5 селектор, собирающий новый объект, — это не
  // лишний ререндер, а бесконечный цикл useSyncExternalStore («The result of
  // getSnapshot should be cached» → «Maximum update depth exceeded»). Объект
  // LevelState собирается ЗДЕСЬ, после селекторов, и store о нём не знает
  // (комментарий у currentScreen в src/data/modules.ts).
  const currentModuleId = useProcessStore((state) => state.currentModuleId);
  const currentStageId = useProcessStore((state) => state.currentStageId);
  const resetLevel = useProcessStore((state) => state.resetLevel);
  const screen = currentScreen(map, { currentModuleId, currentStageId });

  /*
   * ВИД ЭКРАНА ЭТАПОВ (process-map-9mn.17): этапы, рёбра, подпись рамки и
   * модуль — одним вызовом, чтобы все четыре описывали один модуль.
   *
   * useMemo с зависимостями [map, currentModuleId], а не результат функции в
   * зависимостях: у известного модуля levelTwoView возвращает НОВЫЕ массивы
   * на каждый вызов (кеша нет намеренно, шапка src/data/modules.ts), и без
   * useMemo граф обзора пересобирался бы на каждый рендер App. map в
   * зависимостях приносит сюда бесплатно всё, что меняет карту: правку ссылки
   * в редакторе, импорт BPMN, смену версии.
   *
   * Считается на любом экране, а не только на 'stages': хуки не бывают
   * условными, а пять модулей и двадцать этапов — копейки.
   */
  const view = useMemo(() => levelTwoView(map, currentModuleId), [map, currentModuleId]);
  // Шапка экрана этапов: корень двухуровневой карты — своя шапка с
  // переключателем версий, экран модуля трёхуровневой — крошки (Overview.tsx).
  // Признак — форма ДОКУМЕНТА, как и число уровней (шапка src/data/modules.ts).
  const header: OverviewHeaderKind = hasModules(map) ? 'crumbs' : 'root';

  /*
   * ВТОРАЯ ЗАЩИТА: «модуль не найден → на корень» (process-map-9mn.16).
   *
   * Зеркало эффекта «этап не найден» в StageDetail.tsx и по тем же доводам.
   * currentScreen() существование модуля намеренно не проверяет (он отвечает,
   * КАКОЙ уровень адресует состояние, а не валидно ли оно), поэтому id модуля,
   * которого в документе нет, законно приводит на экран 'stages' — и это тупик:
   * экрана модуля нет, а «Назад» с него вёл бы на корень лишь по счастливой
   * случайности. Откуда такой id может взяться: прямой вызов store, путь,
   * которого сегодня нет. Известные пути его не дают: подмена карты и смена
   * версии сбрасывают уровень (resetLevel), а ?module= из адреса useDeepLink
   * выбирает, только если модуль в документе есть (process-map-9mn.18).
   * Защита стоит по тем же доводам, что вторая защита в StageDetail: причин
   * попасть в тупик может оказаться больше, чем мы знаем сегодня.
   *
   * Признак «не найден» — ТОЛЬКО moduleById(...) === undefined (шапка
   * moduleById): пустой список этапов бывает и у существующего модуля, такой
   * модуль чинят в данных, а не выбрасывают читателя на корень.
   *
   * hasModules(map) — не лишний: на двухуровневой карте moduleById отвечает
   * undefined ВСЕГДА, в том числе при currentModuleId === null, и без этой
   * проверки защита срабатывала бы на обзоре каждой двухуровневой карты (snp,
   * mrp). Это не безобидный повторный сброс: на первом рендере по адресу
   * ?stage=2 экран ещё 'stages', эффект useDeepLink (он выше в этом же
   * компоненте и срабатывает раньше) открывает этап, а следом эта защита со
   * значением первого рендера вернула бы читателя на корень — deep-link
   * перестал бы работать. Посторонний currentModuleId на такой карте безвреден
   * и без защиты: currentScreen его не замечает.
   *
   * resetLevel(), а не back(): тот же довод, что в StageDetail — одним прыжком
   * в известное место. Эффектом, а не в теле: смена состояния во время рендера
   * — это рендер во время рендера, и React на этом ругается.
   */
  const moduleMissing =
    screen === 'stages' && hasModules(map) && moduleById(map, currentModuleId) === undefined;
  useEffect(() => {
    if (moduleMissing) {
      resetLevel();
    }
  }, [moduleMissing, resetLevel]);

  return (
    <>
      <ScreenView screen={screen} view={view} header={header} />
      {/* Панель отчёта монтируется ВЫШЕ всех экранов: она обязана пережить
          переход между уровнями, а панель узла живёт внутри полотна и такого
          не умеет (process-map-70e.9). */}
      <ImportReport />
    </>
  );
}

export default App;
