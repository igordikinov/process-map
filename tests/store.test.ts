// Тесты состояния UI (SPEC.md §4.1, §4.4, §4.6).
import { beforeEach, describe, expect, it } from 'vitest';
import { OVERRIDES_KEY } from '../src/data/loader';
import { createInitialState, useProcessStore } from '../src/store/useProcessStore';

const get = () => useProcessStore.getState();

describe('useProcessStore', () => {
  beforeEach(() => {
    useProcessStore.setState(createInitialState());
  });

  it('начальное состояние: обзор, Drawer закрыт, режим просмотра, интеграции видны', () => {
    expect(get().currentStageId).toBeNull();
    expect(get().selectedNodeId).toBeNull();
    expect(get().mode).toBe('view');
    expect(get().showIntegrations).toBe(true);
  });

  it('режим всегда view при инициализации и не персистится', () => {
    get().setMode('edit');
    // Пересоздание начального состояния имитирует перезагрузку страницы.
    useProcessStore.setState(createInitialState());

    expect(get().mode).toBe('view');
    expect(localStorage.getItem(OVERRIDES_KEY)).toBeNull();
  });

  it('navigateToStage переводит на уровень 2', () => {
    get().navigateToStage('stage-2');

    expect(get().currentStageId).toBe('stage-2');
    expect(get().selectedNodeId).toBeNull();
  });

  it('navigateToStage закрывает Drawer, открытый на другом этапе', () => {
    get().navigateToStage('stage-2');
    get().selectNode('stage-2-node-1');
    get().navigateToStage('stage-3');

    expect(get().currentStageId).toBe('stage-3');
    expect(get().selectedNodeId).toBeNull();
  });

  it('deep-link: navigateToStage → selectNode даёт уровень 2 с открытым Drawer', () => {
    get().navigateToStage('stage-2');
    get().selectNode('stage-2-node-1');

    expect(get().currentStageId).toBe('stage-2');
    expect(get().selectedNodeId).toBe('stage-2-node-1');
  });

  it('back возвращает на обзор и закрывает Drawer', () => {
    get().navigateToStage('stage-2');
    get().selectNode('stage-2-node-1');
    get().back();

    expect(get().currentStageId).toBeNull();
    expect(get().selectedNodeId).toBeNull();
  });

  it('selectNode не меняет уровень, closeDrawer не меняет уровень', () => {
    get().navigateToStage('stage-1');
    get().selectNode('stage-1-node-1');
    expect(get().currentStageId).toBe('stage-1');

    get().closeDrawer();
    expect(get().selectedNodeId).toBeNull();
    expect(get().currentStageId).toBe('stage-1');
  });

  it('toggleIntegrations переключает флаг туда и обратно', () => {
    get().toggleIntegrations();
    expect(get().showIntegrations).toBe(false);

    get().toggleIntegrations();
    expect(get().showIntegrations).toBe(true);
  });

  it('setMode не закрывает Drawer и не меняет уровень', () => {
    get().navigateToStage('stage-2');
    get().selectNode('stage-2-node-1');

    get().setMode('edit');
    expect(get().mode).toBe('edit');
    expect(get().selectedNodeId).toBe('stage-2-node-1');
    expect(get().currentStageId).toBe('stage-2');

    get().setMode('view');
    expect(get().selectedNodeId).toBe('stage-2-node-1');
  });

  it('toggleIntegrations не сбрасывает выбранный узел', () => {
    get().navigateToStage('stage-2');
    get().selectNode('stage-2-node-1');
    get().toggleIntegrations();

    expect(get().selectedNodeId).toBe('stage-2-node-1');
  });
});

/*
 * ТРИ УРОВНЯ (эпик M8, задача process-map-9mn.12): модули → этапы → шаги.
 *
 * Store карту не знает (шапка src/store/useProcessStore.ts), поэтому id здесь
 * — просто строки: какой экран означает пара currentModuleId + currentStageId,
 * решает currentScreen() в src/data/modules.ts, и его тесты живут в
 * tests/modules.test.ts. Здесь проверяется только то, как переходы двигают
 * эти два скаляра и выбор узла.
 */
describe('useProcessStore: три уровня', () => {
  beforeEach(() => {
    useProcessStore.setState(createInitialState());
  });

  it('начальное состояние: модуль не выбран', () => {
    expect(get().currentModuleId).toBeNull();
  });

  /*
   * СБРОС STORE В ТЕСТАХ. setState в zustand СЛИВАЕТ объект с текущим
   * состоянием: поле, которого нет в createInitialState(), этим сбросом не
   * трогается, и модуль, выбранный одним тестом, доживал бы до следующего.
   */
  it('модуль не протекает через сброс createInitialState()', () => {
    get().navigateToModule('module-supply');
    useProcessStore.setState(createInitialState());

    expect(get().currentModuleId).toBeNull();
  });

  /*
   * Переход идёт С УРОВНЯ ШАГОВ другого модуля и с открытым Drawer: на корне
   * этапа и выбора просто нет, и проверка их сброса там ничего бы не доказала.
   */
  it('navigateToModule открывает этапы модуля: этап и Drawer сбрасываются', () => {
    get().navigateToStage('stage-1', 'module-demand');
    get().selectNode('stage-1-step-1');

    get().navigateToModule('module-supply');

    expect(get().currentModuleId).toBe('module-supply');
    expect(get().currentStageId).toBeNull();
    expect(get().selectedNodeId).toBeNull();
  });

  it('navigateToStage с модулем запоминает переданный модуль', () => {
    get().navigateToModule('module-demand');

    get().navigateToStage('stage-4', 'module-supply');

    expect(get().currentModuleId).toBe('module-supply');
    expect(get().currentStageId).toBe('stage-4');
  });

  /*
   * Клик по карточке этапа на экране модуля модуль не передаёт: он уже тот.
   * Затёртый модуль сделал бы «Назад» с уровня шагов прыжком на корень, а на
   * двухуровневой карте ничего бы не изменил — поэтому проверка только здесь.
   */
  it('navigateToStage без модуля оставляет текущий модуль', () => {
    get().navigateToModule('module-supply');

    get().navigateToStage('stage-3');

    expect(get().currentModuleId).toBe('module-supply');
    expect(get().currentStageId).toBe('stage-3');
  });

  it('navigateToStage без модуля закрывает Drawer, как и раньше', () => {
    get().navigateToStage('stage-3', 'module-supply');
    get().selectNode('stage-3-step-1');

    get().navigateToStage('stage-4');

    expect(get().currentModuleId).toBe('module-supply');
    expect(get().selectedNodeId).toBeNull();
  });

  /*
   * Та же гарантия во ВТОРОЙ ветке navigateToStage. В store это два разных
   * объектных литерала, и тест выше проходит только через первый (без модуля).
   * Ветка с модулем — новый путь deep-link ?module=&stage= и прыжков между
   * модулями; сбрось она выбор не во всех случаях, Drawer узла прежнего этапа
   * остался бы открытым поверх чужого экрана, а все прочие тесты зеленели бы
   * (мутация «убрать selectedNodeId: null из ветки с модулем» проверена).
   */
  it('navigateToStage с модулем тоже закрывает Drawer', () => {
    get().navigateToStage('stage-3', 'module-supply');
    get().selectNode('stage-3-step-1');

    get().navigateToStage('stage-7', 'module-demand');

    expect(get().currentModuleId).toBe('module-demand');
    expect(get().currentStageId).toBe('stage-7');
    expect(get().selectedNodeId).toBeNull();
  });

  it('back с уровня шагов возвращает к этапам того же модуля, а не на корень', () => {
    get().navigateToModule('module-supply');
    get().navigateToStage('stage-3');
    get().selectNode('stage-3-step-1');

    get().back();

    expect(get().currentModuleId).toBe('module-supply');
    expect(get().currentStageId).toBeNull();
    expect(get().selectedNodeId).toBeNull();
  });

  it('back с этапов модуля возвращает на корень', () => {
    get().navigateToModule('module-supply');

    get().back();

    expect(get().currentModuleId).toBeNull();
    expect(get().currentStageId).toBeNull();
  });

  /*
   * Вторая ветка back() тоже сбрасывает выбор — store обещает это «в обеих
   * ветках». Интерфейс сегодня в это состояние не приходит: selectNode зовут
   * только узлы уровня шагов, а «Назад» в крошках есть только при открытом
   * этапе. Но store не знает, какие экраны его вызывают (он и карту не знает),
   * и гарантия — его собственный контракт, а не следствие сегодняшней вёрстки.
   * Без этого теста мутация «вторая ветка не трогает selectedNodeId» выживала
   * бы: во всех прочих вызовах back() без этапа узел просто не выбран.
   */
  it('back с этапов модуля тоже сбрасывает выбор узла', () => {
    get().navigateToModule('module-supply');
    get().selectNode('stray-node');

    get().back();

    expect(get().currentModuleId).toBeNull();
    expect(get().selectedNodeId).toBeNull();
  });

  it('back поднимает ровно на один уровень: с уровня шагов до корня — два вызова', () => {
    get().navigateToStage('stage-3', 'module-supply');

    get().back();
    expect(get().currentModuleId).toBe('module-supply');

    get().back();
    expect(get().currentModuleId).toBeNull();
    expect(get().currentStageId).toBeNull();

    // На корне «Назад» ничего не ломает: подниматься некуда.
    get().back();
    expect(get().currentModuleId).toBeNull();
    expect(get().currentStageId).toBeNull();
  });

  /*
   * Этап без модуля — законное состояние (deep-link ?stage= без ?module=).
   * Владельца этапа store не знает и не угадывает: «Назад» ведёт на корень.
   * Это же и поведение двухуровневой карты, где модуль всегда null.
   */
  it('back с этапа без модуля возвращает на корень одним вызовом', () => {
    get().navigateToStage('stage-3');

    get().back();

    expect(get().currentModuleId).toBeNull();
    expect(get().currentStageId).toBeNull();
  });

  it('двухуровневая карта: модуль не появляется ни на одном переходе', () => {
    get().navigateToStage('stage-2');
    get().selectNode('stage-2-node-1');
    expect(get().currentModuleId).toBeNull();

    get().back();
    expect(get().currentModuleId).toBeNull();
    expect(get().currentStageId).toBeNull();
    expect(get().selectedNodeId).toBeNull();
  });

  /*
   * resetLevel — сброс УРОВНЯ, а не всего интерфейса: режим редактора и toggle
   * интеграций подмена карты или версии не трогала и до трёх уровней (там
   * стоял back()), и трогать не начинает.
   */
  it('resetLevel с уровня шагов уводит на корень и закрывает Drawer', () => {
    get().navigateToStage('stage-3', 'module-supply');
    get().selectNode('stage-3-step-1');
    get().setMode('edit');
    get().toggleIntegrations();

    get().resetLevel();

    expect(get().currentModuleId).toBeNull();
    expect(get().currentStageId).toBeNull();
    expect(get().selectedNodeId).toBeNull();
    expect(get().mode).toBe('edit');
    expect(get().showIntegrations).toBe(false);
  });
});
