import { EditorProvider } from '../../editor/EditorContext';
import { StageFlow } from '../../editor/StageFlow';
// Экран «Детализация этапа, уровень 2» (SPEC §4.2, артборд A2).
import { useEffect, useMemo, useState } from 'react';
import { ReactFlowProvider, type EdgeTypes, type NodeTypes } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { hasModules, moduleOfStage } from '../../data/modules';
import { useFrameSize } from '../../hooks/useFrameSize';
import { useProcessMap } from '../../hooks/useProcessMap';
import { ru } from '../../i18n/ru';
import { useProcessStore } from '../../store/useProcessStore';
import { Breadcrumbs } from '../Breadcrumbs';
import { DataEdge, DetailLinkEdge, IntegrationEdge, ProcessEdge, ProcessInnerEdge } from '../edges';
import { Legend } from '../Legend';
import { DataNode } from '../nodes/DataNode';
import { DetailNode } from '../nodes/DetailNode';
import { GroupNode } from '../nodes/GroupNode';
import { StepNode } from '../nodes/StepNode';
import { WarningNode } from '../nodes/WarningNode';
import { buildStageGraph, type StageEdgeType } from './stageGraph';
import styles from './StageDetail.module.css';

// Объекты объявлены на уровне модуля: React Flow предупреждает, если nodeTypes
// или edgeTypes меняют идентичность между рендерами.
// Проверка типов настоящая, а не заглушённая: до process-map-ge3 здесь стояло
// `as unknown as`, и оно пропускало в карту что угодно — проба с числом вместо
// компонента не давала ни одной ошибки. `satisfies` сверяет объект с NodeTypes,
// но не расширяет тип переменной до Record, поэтому имена ключей остаются точными.
const nodeTypes = {
  groupBox: GroupNode,
  step: StepNode,
  // Интеграция — тот же компонент, отдельный тип (process-map-73m, process-map-e21):
  // тип попадает в класс узла, и общий тип означал бы, что `.react-flow__node-step`
  // выбирает «шаг ИЛИ интеграцию». Тот же приём, что у `lane` / `flowLane` уровня 1.
  integration: StepNode,
  warning: WarningNode,
  data: DataNode,
  // Типы BPMN (process-map-70e.7): та же карточка, свои типы узлов — см.
  // GatewayNodeType в StepNode.tsx.
  gateway: StepNode,
  event: StepNode,
  subprocess: StepNode,
  // Подробность под шагом (process-map-9mn.32, оформление — process-map-9mn.36).
  // Без регистрации React Flow нарисовал бы узел по умолчанию, и тип из схемы
  // молча выглядел бы чужим (сторож — tests/detailNode.test.tsx).
  detail: DetailNode,
} satisfies NodeTypes;

const edgeTypes = {
  process: ProcessEdge,
  // Поток внутри группы шагов рисуется серым (артборд A2, process-map-fxg).
  // Отдельный тип, а не проп: тип попадает в класс ребра, и общий тип слил бы
  // два вида в один счётчик — то же соображение, что у `lane` / `flowLane`.
  processInner: ProcessInnerEdge,
  integration: IntegrationEdge,
  // Ребро к артефакту данных (process-map-70e.6). Значение kind: 'data' было в
  // схеме с самого начала, но не отрисовывалось ничем.
  data: DataEdge,
  // Выноска «шаг → подробность» (process-map-9mn.36): тонкая линия без стрелки.
  detailLink: DetailLinkEdge,
  // Вторая половина `satisfies` — полнота: каждый тип, который выдаёт
  // buildStageGraph (StageEdgeType), обязан иметь здесь компонент. Забытая
  // регистрация роняет tsc, а не рисует ребро кривой React Flow по умолчанию
  // (почему иначе это заметить нечем — у StageEdgeType в stageGraph.ts).
} satisfies EdgeTypes & Record<StageEdgeType, EdgeTypes[string]>;

/** Убирает ссылку-attribution React Flow — обоснование в Overview.tsx (4hv). */

export function StageDetail() {
  const currentStageId = useProcessStore((state) => state.currentStageId);
  const resetLevel = useProcessStore((state) => state.resetLevel);
  const showIntegrations = useProcessStore((state) => state.showIntegrations);
  const selectedNodeId = useProcessStore((state) => state.selectedNodeId);
  const mode = useProcessStore((state) => state.mode);
  const [heights, setHeights] = useState(new Map<string, number>());

  // SPEC §4.5: режим решает высота КОНТЕЙНЕРА (приложение в iframe, SPEC §6).
  const { ref: rootRef, compact } = useFrameSize();

  // Карта с наложенными overrides, реактивно к правкам редактора (SPEC §4.4):
  // сохранённая в панели ссылка сразу появляется и в самой панели, и иконкой
  // link-external на карточке шага (SPEC §4.2). См. src/hooks/useProcessMap.ts.
  const map = useProcessMap();
  const stage = map.stages.find((candidate) => candidate.id === currentStageId);
  const graph = useMemo(
    () => (stage === undefined ? undefined : buildStageGraph(stage, showIntegrations, heights)),
    [stage, showIntegrations, heights],
  );

  /*
   * РАССИНХРОН УРОВНЯ И ДАННЫХ — сам возвращает на корень (process-map-70e.8).
   *
   * Раньше здесь стоял голый `return null` с комментарием, что пользователь
   * выйдет кнопкой «Назад» в крошках. Это было НЕВЕРНО: крошки рендерятся ниже
   * этого return, и на экране не оставалось ничего — выйти можно было только
   * перезагрузкой.
   *
   * Пока карта была одна, состояние почти недостижимо: id этапа попадает в
   * store только из клика по карточке. С подменой карты (импорт BPMN) оно
   * становится обычным — id этапа старой карты в новой не существует. Вторая
   * защита стоит в applyImportedMap, здесь — та, что снимает класс тупиков
   * целиком, включая причины, о которых мы ещё не знаем.
   *
   * Возврат делается эффектом, а не прямо в теле: смена состояния во время
   * рендера — это рендер во время рендера, и React на этом ругается.
   *
   * resetLevel(), а не back() (process-map-9mn.12): с тремя уровнями back()
   * поднимает ровно на один, то есть с уровня шагов снял бы этап и оставил
   * модуль — пользователь оказался бы на экране этапов модуля, выбранного
   * вместе с несуществующим этапом. Раз этап пришёл от чужой карты, модуль,
   * скорее всего, оттуда же, и экран модуля стал бы следующим тупиком: его
   * закрывает своя защита («модуль не найден», process-map-9mn.16), но это
   * был бы второй прыжок через промежуточный экран. Защита обязана вести в
   * одно известное место одним прыжком, а корень есть у карты любой формы.
   */
  useEffect(() => {
    if (stage === undefined) {
      resetLevel();
    }
  }, [stage, resetLevel]);

  if (stage === undefined || graph === undefined) {
    return null;
  }

  // Панели отдаются только те узлы, которые СЕЙЧАС нарисованы на полотне, а не
  // все узлы этапа. Иначе выключенный toggle «Показать интеграции» (SPEC §4.6)
  // убирал карточку узла-интеграции с полотна, но оставлял открытой панель с
  // его описанием: подсветки нет, затемнение лежит на пустом месте, и вернуть
  // фокус на карточку при закрытии тоже некуда. Это тот же принцип, что уже
  // записан в store (navigateToStage/back сбрасывают selectedNodeId): панель
  // не переживает исчезновение своего узла с экрана. Список берётся из
  // graph.nodes, а не пересобирается своим фильтром, — правило видимости
  // остаётся одно, в buildStageGraph. Контейнеры групп/колонок отсеиваются
  // сами: их id (`group:…`, `column:…`) не совпадают ни с одним ProcessNode.
  const renderedIds = new Set(graph.nodes.map((node) => node.id));
  const visibleNodes = stage.nodes.filter((node) => renderedIds.has(node.id));
  const drawerOpen = visibleNodes.some((node) => node.id === selectedNodeId);

  return (
    <EditorProvider stage={stage}>
      <div className={compact ? `${styles.root} ${styles.compact}` : styles.root} ref={rootRef}>
        {/* module — ВЛАДЕЛЕЦ этапа по документу (moduleOfStage), а не
          currentModuleId из store: этап без модуля в store законен (прямой
          navigateToStage(id); deep-link владельца передаёт сам,
          process-map-9mn.18), а документ владельца знает всегда. На
          двухуровневой карте — undefined, и крошки побайтово прежние
          (process-map-9mn.17). */}
        <Breadcrumbs
          stages={map.stages}
          rootLabel={map.moduleLabel}
          module={moduleOfStage(map, stage.id)}
          compact={compact}
        />
        {/* role="region", а не "application" — см. комментарий в Overview.tsx.
          Подпись — настоящий номер экрана на ЭТОЙ карте: на трёхуровневой
          этап — уровень 3 (ru.stageDetail.moduleStageCanvasLabel). */}
        <div
          data-editing={mode === 'edit'}
          className={styles.canvas}
          role="region"
          aria-label={
            hasModules(map) ? ru.stageDetail.moduleStageCanvasLabel : ru.stageDetail.canvasLabel
          }
        >
          {/* key по этапу на самом провайдере (не только на <ReactFlow> ниже):
            смена этапа обязана пересобрать ОБЩИЙ store React Flow целиком,
            иначе Toolbar (сиблинг <ReactFlow>, читает viewport из того же
            store — см. Toolbar.tsx) на миг унаследовал бы масштаб/сдвиг
            предыдущего этапа, пока StartViewport его не перезапишет. Раскладки
            отличаются в разы (3942×1088 у этапа 2 против 3528×296 у этапа 1). */}
          <ReactFlowProvider key={`${map.id}:${stage.id}`}>
            <StageFlow
              graph={graph}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              compact={compact}
              drawerOpen={drawerOpen}
              setHeights={setHeights}
            />
          </ReactFlowProvider>
          {/* Боковая панель узла — внутри .canvas, чтобы затемнение начиналось
            под шапкой крошек, как в артборде A3 (SPEC §4.3). */}
        </div>
        {/* Легенда — строка ПОД полотном, не поверх него: раскладка потока
          шагов на реальных данных занимает весь угол/край полотна на всех
          4 этапах (см. Legend.module.css) — плавающая панель гарантированно
          перекрыла бы что-нибудь. Легенде не нужен React Flow, поэтому она
          и не внутри .canvas/<ReactFlowProvider>. */}
        {/* Компактный режим (SPEC §4.5) ужимает полосу под кнопку-иконку,
          но не возвращает легенду на полотно — см. Legend.tsx. */}
        <div className={styles.legendStrip}>
          <Legend compact={compact} />
        </div>
      </div>
    </EditorProvider>
  );
}
