// Экран этапов (SPEC §4.1, артборд A1): «Обзор процесса, уровень 1» на
// двухуровневой карте и экран одного модуля — уровень 2 — на трёхуровневой
// (задача process-map-9mn.17).
//
// ЧТО ПОКАЗЫВАТЬ, ПРИХОДИТ ПРОПАМИ: этапы, рёбра, подпись рамки и модуль —
// значения levelTwoView() из src/data/modules.ts, которые App считает один
// раз на пару (карта, модуль). Экран не выясняет сам, какой модуль выбран и
// какие этапы ему принадлежат, по тому же доводу, по которому rootLabel у
// Breadcrumbs — проп: знание о форме документа живёт в одном месте, и второй
// экземпляр этого знания здесь рано или поздно разошёлся бы с первым. Из
// карты экран по-прежнему читает только то, что принадлежит документу
// целиком: заголовок, дату, id, корень крошек.
//
// ШАПКА — ОДНА ИЗ ДВУХ (проп header). Корень карты ('root') получает
// OverviewHeader с переключателем версий, экран модуля ('crumbs') — хлебные
// крошки и НИКАКОГО переключателя. Это правка SPEC §4.2 («на уровне 2
// переключателя версий нет: там нет шапки вовсе»), вынужденная тем, что на
// трёхуровневой карте экран этапов перестал быть корнем: без крошек с него не
// видно дороги назад, а переключатель, выкидывающий из того места, где
// стоишь, читался бы как ошибка — довод SPEC тот же, меняется только экран,
// к которому он относится. Текст SPEC переписывает задача process-map-9mn.22.
import { useMemo } from 'react';
import {
  Background,
  BackgroundVariant,
  ReactFlow,
  ReactFlowProvider,
  type EdgeTypes,
  type NodeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useFrameSize } from '../../hooks/useFrameSize';
import { useProcessMap } from '../../hooks/useProcessMap';
import { ru } from '../../i18n/ru';
import { isImportedActive } from '../../data/activeMap';
import type { Edge, Module, Stage } from '../../data/schema';
import { getSelectedVersionId, listVersions } from '../../data/versions';
import { selectVersion } from '../../data/versionSwitch';
import { useProcessStore } from '../../store/useProcessStore';
import { Breadcrumbs } from '../Breadcrumbs';
import { EdgeMarkers, IntegrationEdge, ProcessEdge } from '../edges';
import { Legend } from '../Legend';
import { IntegrationNode } from '../nodes/IntegrationNode';
import { LaneNode } from '../nodes/LaneNode';
import { StageNode } from '../nodes/StageNode';
import { SystemsBadge } from '../nodes/SystemsBadge';
import { Toolbar } from '../Toolbar';
import { OverviewHeader } from './OverviewHeader';
import {
  buildOverviewGraph,
  FIT_VIEW_PADDING,
  GRID_DOT_SIZE,
  GRID_GAP,
  MAX_ZOOM,
  MIN_ZOOM,
} from './overviewGraph';
import { RefitViewport } from './RefitViewport';
import { fitKeyOf } from './RefitViewportKey';
import styles from './Overview.module.css';

// Объекты объявлены на уровне модуля: React Flow предупреждает, если nodeTypes
// или edgeTypes меняют идентичность между рендерами.
// Проверка типов настоящая, а не заглушённая: до process-map-ge3 здесь стояло
// `as unknown as`, и оно пропускало в карту что угодно — проба с числом вместо
// компонента не давала ни одной ошибки. `satisfies` сверяет объект с NodeTypes,
// но не расширяет тип переменной до Record, поэтому имена ключей остаются точными.
const nodeTypes = {
  lane: LaneNode,
  // Рамка вокруг потока этапов (process-map-sni) — тот же компонент, отдельный
  // тип: он попадает в класс узла, и общий тип слил бы счётчики в e2e.
  flowLane: LaneNode,
  system: IntegrationNode,
  stage: StageNode,
  systemsBadge: SystemsBadge,
} satisfies NodeTypes;

const edgeTypes = {
  process: ProcessEdge,
  integration: IntegrationEdge,
} satisfies EdgeTypes;

const fitViewOptions = { padding: FIT_VIEW_PADDING };

/*
 * Убирает ссылку-attribution React Flow из правого нижнего угла полотна
 * (решение владельца, process-map-4hv): карта встроена в In.Plan, и на демо
 * клиентам в углу висел посторонний бренд.
 *
 * hideAttribution — публичный проп библиотеки, а @xyflow/react распространяется
 * под обычным MIT без оговорок про attribution: подписка Pro у авторов — просьба
 * о поддержке, а не условие лицензии. Поэтому штатный проп, а не CSS-хак.
 */
const proOptions = { hideAttribution: true };

/**
 * Какая шапка у экрана этапов: 'root' — корень карты (OverviewHeader с
 * переключателем версий), 'crumbs' — экран модуля трёхуровневой карты
 * (хлебные крошки). Выбирает App: hasModules(map) ? 'crumbs' : 'root'.
 */
export type OverviewHeaderKind = 'root' | 'crumbs';

export interface OverviewProps {
  /** Показанные этапы: map.stages либо этапы модуля в порядке stageIds. */
  readonly stages: readonly Stage[];
  /** Рёбра, касающиеся показанных этапов (overviewEdgesOf). */
  readonly overviewEdges: readonly Edge[];
  /** Подпись рамки потока: module.label либо map.moduleLabel. */
  readonly frameLabel: string;
  /**
   * Выбранный модуль — для крошек экрана модуля. На двухуровневой карте
   * undefined. На экране модуля undefined бывает только мгновение: модуль,
   * которого нет в документе, App возвращает на корень эффектом
   * («модуль не найден», App.tsx), и до этого крошки просто не рисуются.
   */
  readonly module: Module | undefined;
  readonly header: OverviewHeaderKind;
}

export function Overview({ stages, overviewEdges, frameLabel, module, header }: OverviewProps) {
  const showIntegrations = useProcessStore((state) => state.showIntegrations);

  // SPEC §4.5: режим решает высота КОНТЕЙНЕРА, а не окна — приложение живёт в
  // iframe (SPEC §6). Измеряется корень экрана: он занимает всю высоту врезки.
  const { ref: rootRef, compact } = useFrameSize();

  // Карта = process.json + overrides из localStorage. useProcessMap()
  // подписывает экран на правки редактора (SPEC §4.4): после записи ссылки
  // ссылка обязана появиться сразу, без перезагрузки страницы. Этапы и рёбра
  // приходят пропами, но вычислены из той же карты (App зовёт levelTwoView в
  // useMemo по [map, currentModuleId]), поэтому правка доезжает и до них, а
  // их ссылки стабильны, пока правок нет, — useMemo ниже не пересчитывается
  // на каждый рендер. См. src/hooks/useProcessMap.ts.
  const map = useProcessMap();
  const { nodes, edges } = useMemo(
    () => buildOverviewGraph({ stages, overviewEdges, frameLabel }, showIntegrations, compact),
    [stages, overviewEdges, frameLabel, showIntegrations, compact],
  );

  // Признак читается на рендере: подмена карты идёт через refreshProcessMap,
  // который сам вызывает рендер (тот же приём, что в EditorActions).
  const imported = isImportedActive();

  return (
    <div className={compact ? `${styles.root} ${styles.compact}` : styles.root} ref={rootRef}>
      {header === 'root' ? (
        <OverviewHeader
          title={map.title}
          // Число ПОКАЗАННЫХ этапов. На корне двухуровневой карты вид совпадает
          // с картой (levelTwoView), и это ровно прежнее map.stages.length.
          stagesCount={stages.length}
          updatedAt={map.updatedAt}
          compact={compact}
          imported={imported}
          /* При загруженной пользователем схеме версий не предлагаем: показана
             вообще не версия, и «нажатый» сегмент утверждал бы обратное. Путь
             назад у пользователя есть — кнопка «Вернуться к встроенной карте» в
             тулбаре редактора, и она вернёт ту версию, с которой ушли. */
          versions={imported ? [] : listVersions()}
          selectedVersionId={getSelectedVersionId()}
          onSelectVersion={selectVersion}
        />
      ) : (
        /* Экран модуля: крошки вместо шапки корня, переключателя версий нет
           (шапка файла). Корень крошек — map.moduleLabel документа, а не
           frameLabel: у moduleLabel две роли, и module.label забирает только
           подпись рамки (комментарий к rootLabel в Breadcrumbs.tsx). */
        <Breadcrumbs
          stages={stages}
          rootLabel={map.moduleLabel}
          module={module}
          compact={compact}
        />
      )}
      {/* role="region", а не "application": схема статична, а application
          переводит скринридер в режим прямого прохода клавиш и глушит
          навигацию по элементам. Подпись называет настоящий номер экрана на
          ЭТОЙ карте: на трёхуровневой экран этапов — уровень 2
          (ru.overview.moduleCanvasLabel, там же — почему не общая подпись). */}
      <div
        className={styles.canvas}
        role="region"
        aria-label={header === 'root' ? ru.overview.canvasLabel : ru.overview.moduleCanvasLabel}
      >
        {/* ReactFlowProvider — общий контекст для <ReactFlow> и тулбара:
            Toolbar рендерится РЯДОМ с полотном, не внутри него (см. подробное
            объяснение в Toolbar.tsx), поэтому его useReactFlow()/useViewport()
            нужен провайдер уровнем выше, а не автосозданный <ReactFlow>. */}
        <ReactFlowProvider>
          <EdgeMarkers>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              nodesDraggable={false}
              nodesConnectable={false}
              elementsSelectable={false}
              // Фокус несут <button> карточек этапов; собственные tabIndex узлов и
              // рёбер React Flow добавляли 18 лишних остановок Tab до первой карточки.
              nodesFocusable={false}
              edgesFocusable={false}
              panOnScroll
              fitView
              fitViewOptions={fitViewOptions}
              minZoom={MIN_ZOOM}
              maxZoom={MAX_ZOOM}
              proOptions={proOptions}
            >
              <Background variant={BackgroundVariant.Dots} gap={GRID_GAP} size={GRID_DOT_SIZE} />
              {/* SPEC §4.5: при смене режима вид подгоняется заново — карточки
                  этапов меняют и размер, и координаты. Экран и модуль в ключе
                  — по тому же доводу, что версия (FitKeyParts в
                  RefitViewportKey.ts): другой модуль — другой состав полотна.
                  Сегодня экран модуля между двумя модулями размонтируется
                  (путь лежит через экран модулей), но ключ не должен держаться
                  на маршруте, который выбрал интерфейс: смена модуля при
                  смонтированном экране обязана подогнать вид
                  (tests/refitScreens.test.tsx). На двухуровневой карте модуля
                  нет, и moduleId — null. */}
              <RefitViewport
                fitKey={fitKeyOf({
                  screen: 'stages',
                  compact,
                  mapId: map.id,
                  moduleId: module?.id ?? null,
                })}
                fitViewOptions={fitViewOptions}
              />
            </ReactFlow>
          </EdgeMarkers>
          {/* Тот же fitViewOptions, что и автозапуск fitView выше (SPEC §4.6):
              на уровне 1 пола читаемости нет, кнопка «Уместить в экран» просто
              повторяет исходный вид. */}
          <Toolbar fitViewOptions={fitViewOptions} compact={compact} />
        </ReactFlowProvider>
      </div>
      {/* Легенда — строка ПОД полотном, не поверх него: см. обоснование в
          Legend.module.css (плавающая панель рано или поздно перекрывает
          содержимое панорамируемого/масштабируемого полотна). Легенде не
          нужен React Flow, поэтому она и не внутри .canvas. */}
      {/* Компактный режим (SPEC §4.5) не убирает полосу, а ужимает её под
          кнопку-иконку: легенда остаётся вне полотна — см. Legend.tsx. */}
      <div className={styles.legendStrip}>
        <Legend compact={compact} />
      </div>
    </div>
  );
}
