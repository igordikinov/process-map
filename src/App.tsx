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
// Deep-link (?stage=&node=, SPEC §4.7) разбирается хуком useDeepLink: он
// подставляет id в store сразу после монтирования и дальше синхронизирует URL
// (replaceState) при любой навигации — см. src/hooks/useDeepLink.ts.
import { useEffect } from 'react';
import { ImportReport } from './components/ImportReport';
import { ModulesOverview } from './components/ModulesOverview';
import { Overview } from './components/Overview';
import { StageDetail } from './components/StageDetail';
import { currentScreen, hasModules, moduleById, type MapScreen } from './data/modules';
import { useDeepLink } from './hooks/useDeepLink';
import { useProcessMap } from './hooks/useProcessMap';
import { useProcessStore } from './store/useProcessStore';

/**
 * Экран по его имени. switch по объединению без default: забытая ветка при
 * новом значении MapScreen — ошибка tsc («не все пути возвращают значение»), а
 * не молчаливый пустой экран.
 */
function ScreenView({ screen }: { screen: MapScreen }) {
  switch (screen) {
    case 'modules':
      return <ModulesOverview />;
    case 'stages':
      // На трёхуровневой карте Overview пока рисует ВСЮ карту, а не этапы
      // выбранного модуля: параметризует его задача process-map-9mn.17.
      return <Overview />;
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
   * ВТОРАЯ ЗАЩИТА: «модуль не найден → на корень» (process-map-9mn.16).
   *
   * Зеркало эффекта «этап не найден» в StageDetail.tsx и по тем же доводам.
   * currentScreen() существование модуля намеренно не проверяет (он отвечает,
   * КАКОЙ уровень адресует состояние, а не валидно ли оно), поэтому id модуля,
   * которого в документе нет, законно приводит на экран 'stages' — и это тупик:
   * экрана модуля нет, а «Назад» с него вёл бы на корень лишь по счастливой
   * случайности. Откуда берётся такой id: подмена карты, смена версии, будущий
   * ?module= в адресе (process-map-9mn.18).
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
      <ScreenView screen={screen} />
      {/* Панель отчёта монтируется ВЫШЕ всех экранов: она обязана пережить
          переход между уровнями, а панель узла живёт внутри полотна и такого
          не умеет (process-map-70e.9). */}
      <ImportReport />
    </>
  );
}

export default App;
