// Deep-link `?version=&module=&stage=&node=` (SPEC.md §4.7, задачи
// process-map-0y2, process-map-0c5.8, process-map-9mn.18).
//
// Единственная точка входа — useDeepLink(), вызывается один раз в App.tsx.
// Делает две вещи одним эффектом:
//   1) при монтировании читает location.search и переводит store на нужный
//      уровень/узел (см. didParseInitialUrl ниже — ровно один раз, иначе
//      deep-link переигрывался бы при каждом клике по карточке, потому что
//      currentStageId после этого тоже меняется и попадает в deps эффекта);
//   2) на каждое изменение currentModuleId/currentStageId/selectedNodeId
//      (клик по карточке модуля или этапа, «Назад», открытие/закрытие
//      Drawer — не важно, откуда) переписывает URL
//      через `history.replaceState` (SPEC §4.7: не `pushState` — приложение
//      живёт в iframe корпоративной вики (SPEC §6), и `pushState` засорял бы
//      историю родительской страницы, ломая пользователю кнопку «назад»
//      браузера).
//
// Порядок вызовов navigateToStage → selectNode принципиален — см. комментарий
// в src/store/useProcessStore.ts: navigateToStage сбрасывает selectedNodeId.
// Обратный порядок молча теряет узел.
//
// Разрешение этапа по узлу: id узлов уникальны ГЛОБАЛЬНО по всему документу
// (см. комментарий validateIntegrity в src/data/schema.ts), поэтому параметр
// node, если он валиден, однозначно определяет свой этап и имеет приоритет
// над параметром stage. Это единое правило закрывает сразу два случая
// «устойчивости» из задачи:
//   - `?node=<id>` без `stage` — этап находится обратным поиском по узлу;
//   - узел из другого этапа, чем указан в `stage` — выигрывает этап узла,
//     потому что именно он даёт непустой экран (Drawer, открытый поверх
//     чужого этапа, был бы либо пуст, либо вводил бы в заблуждение), а
//     несовпадающий stage расценивается как устаревший/ошибочный.
// Во всех остальных случаях устойчивости (несуществующий этап/узел, `stage`
// не число, пустые значения) целевой этап не находится — приложение остаётся
// на уровне 1 (Обзор), а не падает и не показывает пустой экран.
//
// ─── ?module= (эпик M8, задача process-map-9mn.18) ───────────────────────────
//
// У трёхуровневой карты (модули → этапы → шаги) появляется третий параметр,
// и порядок разбора РАСШИРЕН, а не переписан:
//   1) version — первым, как и раньше, с перечитыванием карты;
//   2) node — id узлов уникальны по всему документу: узел → этап → модуль;
//   3) stage — номер СКВОЗНОЙ, 1..N по всему документу, а не позиция внутри
//      модуля (решение «ссылки, а не вложение», ModuleSchema): этап → модуль.
//      Поэтому `?stage=7` без `?module=` работает и означает ровно один этап;
//   4) module — читается, ТОЛЬКО если ни node, ни stage не разрешились.
// Этап старше модуля по той же причине, по которой узел старше этапа: он
// определяет владельца однозначно (moduleOfStage), а обратное неверно — у
// модуля этапов несколько. `?module=A&stage=<этап модуля B>` открывает этап и
// нормализует модуль в адресе на B: модуль, противоречащий этапу, —
// устаревшая или ошибочная часть ссылки, ровно как stage, противоречащий
// узлу. Уступи этап модулю — ссылка на этап открывала бы экран модуля, и
// автор вики, давший номер этапа, получал бы не то, что просил.
//
// ЗНАЧЕНИЕ ?module= — ID модуля (dp, meio, snp), а не номер. Id набирает руками
// автор вики, и id переживает перестановку модулей в документе; номер —
// нет. Сравнение точное, с учётом регистра, как у ?node=: у реальной карты id
// модулей совпадают с кодами систем с точностью до регистра (dp и DP, см.
// MODULE_PRODUCTION в tests/fixtures/three-level-process.ts), и сравнение без
// учёта регистра означало бы, что регистр в ссылке что-то значит в одном
// параметре и ничего — в другом.
//
// СОВМЕСТИМОСТИ СО СТАРЫМИ ССЫЛКАМИ НЕТ, и это решение владельца (задача
// process-map-9mn.8), а не упущение: когда корень станет трёхуровневой картой
// inplan, `?stage=N` будет означать N-й этап inplan, а не SNP. Правила
// перевода старых номеров в новые здесь нет и заводить его не нужно.
import { useEffect, useRef } from 'react';
import type { Module, ProcessMap, Stage } from '../data/schema';
import { useProcessStore } from '../store/useProcessStore';
import { loadProcessMap } from '../data/loader';
import { moduleById, moduleOfStage } from '../data/modules';
import { DEFAULT_VERSION_ID, getSelectedVersionId } from '../data/versions';
import { selectVersion } from '../data/versionSwitch';
import { useProcessMap } from './useProcessMap';

/**
 * Параметры адреса, которыми владеет карта, — В ПОРЯДКЕ ЗАПИСИ: от общего к
 * частному, как читается сама ссылка (версия → модуль → этап → узел).
 *
 * Порядок приходится задавать явно: URLSearchParams.set() дописывает новый
 * ключ В КОНЕЦ, и `?stage=3`, получив модуль, превратился бы в
 * `?stage=3&module=…` — адрес рабочий, но читается задом наперёд, и одна и та
 * же страница имела бы два адреса в зависимости от того, откуда в неё пришли.
 */
const OWN_PARAMS = ['version', 'module', 'stage', 'node'] as const;
type OwnParam = (typeof OWN_PARAMS)[number];
const OWN_PARAM_SET: ReadonlySet<string> = new Set(OWN_PARAMS);

/**
 * Строка запроса: чужие параметры — как были и в прежнем порядке, свои — после
 * них, в порядке OWN_PARAMS; отсутствующее значение не пишется вовсе.
 *
 * ЧУЖИЕ ВПЕРЕДИ — ради совместимости, а не вкуса. Прежняя запись (set() на
 * месте, новое — в конец) давала ровно эту форму всякий раз, когда своих
 * параметров в стартовом адресе не было или они уже стояли после чужих и по
 * порядку: параметры хоста там, где хост их поставил, наши — следом. Поэтому
 * адреса двухуровневой карты, которые приложение пишет само при навигации,
 * остались побайтово прежними. Иначе, чем раньше, выходит только ссылка,
 * набранная руками не по порядку (`?node=x&stage=2`, `?stage=2&foo=1`), и
 * самовосстановление `?node=x`: раньше `?node=x&stage=2`, теперь
 * `?stage=2&node=x`. Смысл адреса от этого не меняется — URLSearchParams
 * порядка не различает, — меняется только то, что его читать удобнее.
 */
function composeSearch(current: string, own: Readonly<Partial<Record<OwnParam, string>>>): string {
  const result = new URLSearchParams();
  for (const [key, value] of new URLSearchParams(current)) {
    if (!OWN_PARAM_SET.has(key)) {
      result.append(key, value);
    }
  }
  for (const key of OWN_PARAMS) {
    const value = own[key];
    if (value !== undefined) {
      result.append(key, value);
    }
  }
  return result.toString();
}

function findStageByNumber(map: ProcessMap, raw: string | null): Stage | undefined {
  if (raw === null || raw === '') {
    return undefined;
  }
  const number = Number(raw);
  if (!Number.isInteger(number)) {
    return undefined;
  }
  return map.stages.find((stage) => stage.number === number);
}

function findStageByNodeId(map: ProcessMap, raw: string | null): Stage | undefined {
  if (raw === null || raw === '') {
    return undefined;
  }
  return map.stages.find((stage) => stage.nodes.some((node) => node.id === raw));
}

/**
 * Модуль из параметра адреса.
 *
 * На двухуровневой карте — всегда undefined: moduleById отвечает undefined,
 * если модулей у документа нет (hasModules внутри). Так `?module=dp` на
 * странице snp игнорируется тем же путём, что `?module=такого-нет` на
 * трёхуровневой, без второй проверки формы карты здесь.
 */
function findModuleById(map: ProcessMap, raw: string | null): Module | undefined {
  if (raw === null || raw === '') {
    return undefined;
  }
  return moduleById(map, raw);
}

/**
 * Модуль, который пишется в адрес при таком состоянии.
 *
 * НА УРОВНЕ ШАГОВ — ВЛАДЕЛЕЦ ЭТАПА ПО ДОКУМЕНТУ (moduleOfStage), а не
 * currentModuleId из store. Store владельца знает, только если ему сказали
 * (второй аргумент navigateToStage необязателен, шапка useProcessStore.ts), а
 * документ знает всегда; модуль в адресе, расходящийся с этапом в том же
 * адресе, — ссылка, которая противоречит сама себе. Тот же источник у крошек
 * (StageDetail.tsx: module={moduleOfStage(map, stage.id)}), поэтому адрес и
 * шапка экрана называют один и тот же модуль.
 *
 * НА ЭКРАНЕ ЭТАПОВ — модуль из store, но только существующий в документе
 * (moduleById): этапа нет, и спросить документ больше не о чем. Модуль-призрак
 * (подмена карты, смена версии) в адрес не попадает, а сам экран уводит на
 * корень защита в App.tsx.
 *
 * ЭТАП ЗАДАН, НО НЕ НАЙДЕН — модуля в адресе нет, как нет stage и node: это
 * тупик, из которого StageDetail сам уводит на корень, и деталям тупика в
 * ссылке не место. Через App эту ветку не отличить (проверено мутантом без
 * ветки, 9mn.18): StageDetail уводит с тупика СВОИМ эффектом, эффекты потомков
 * в React идут раньше эффекта App, и сюда тупик приходит уже сброшенным. Ветка
 * стоит, чтобы правило адреса не держалось на порядке эффектов в чужом
 * компоненте, — и потому её сторожит тест хука без App, где StageDetail нет и
 * тупик доходит сюда как есть (tests/deepLinkModules.test.tsx, «этап-призрак»).
 *
 * На двухуровневой карте ответ — undefined в каждой ветке (moduleOfStage и
 * moduleById оба отвечают undefined, если модулей у документа нет), и
 * параметр module там не пишется НИКОГДА — по тому же правилу, по которому не
 * пишется версия по умолчанию: адреса snp и mrp остаются побайтово прежними.
 * Посторонний `?module=` из адреса при этом стирается: composeSearch переносит
 * свои параметры только из этого ответа.
 */
function moduleForAddress(
  map: ProcessMap,
  stage: Stage | undefined,
  currentStageId: string | null,
  currentModuleId: string | null,
): Module | undefined {
  if (stage !== undefined) {
    return moduleOfStage(map, stage.id);
  }
  if (currentStageId !== null) {
    return undefined;
  }
  return moduleById(map, currentModuleId);
}

export function useDeepLink(): void {
  const map = useProcessMap();
  const navigateToModule = useProcessStore((state) => state.navigateToModule);
  const navigateToStage = useProcessStore((state) => state.navigateToStage);
  const selectNode = useProcessStore((state) => state.selectNode);
  // Значения читаются только затем, чтобы попасть в deps эффекта и заставить
  // его перезапуститься при любой навигации — САМ эффект берёт свежее
  // состояние через useProcessStore.getState() (см. комментарий ниже).
  //
  // currentModuleId здесь обязателен: переход с корня на экран модуля меняет
  // ТОЛЬКО его (этап и узел остаются null), и без него в deps адрес уровня 2
  // не писался бы вовсе.
  const currentModuleId = useProcessStore((state) => state.currentModuleId);
  const currentStageId = useProcessStore((state) => state.currentStageId);
  const selectedNodeId = useProcessStore((state) => state.selectedNodeId);

  const didParseInitialUrl = useRef(false);

  useEffect(() => {
    /*
     * Карта, ПО КОТОРОЙ ПИШЕТСЯ АДРЕС. Обычно — `map` этого рендера. На первом
     * проходе — та же карта, в которой разбиралась ссылка (`active` ниже): с
     * `?version=` это уже карта названной версии, а `map` из замыкания — ещё
     * прежней. Пиши адрес по прежней, и первая запись описывала бы состояние
     * новой версии данными старой: номер этапа из одной карты, владельца — из
     * другой (`?version=<двухуровневая>&stage=2` на миг получал бы module
     * трёхуровневой версии по умолчанию). Следующий проход, после
     * refreshProcessMap, переписал бы адрес верно, но replaceState с неверным
     * адресом уже состоялся бы.
     */
    let addressMap = map;

    if (!didParseInitialUrl.current) {
      didParseInitialUrl.current = true;

      const initialParams = new URLSearchParams(window.location.search);
      const versionParam = initialParams.get('version');
      const moduleParam = initialParams.get('module');
      const stageParam = initialParams.get('stage');
      const nodeParam = initialParams.get('node');

      /*
       * ВЕРСИЯ РАЗБИРАЕТСЯ ПЕРВОЙ, И ЭТО НЕ ВОПРОС АККУРАТНОСТИ.
       *
       * Номера этапов у версий означают РАЗНОЕ: у карты из презентации их
       * четыре, у карты из модели — десять. Разбери `stage` раньше версии, и
       * `?version=inplan-model&stage=7` не нашёл бы этап (в карте по умолчанию
       * его нет), а `?stage=2` открыл бы ДРУГОЙ этап. Экран при этом выглядел
       * бы работающим — тихий неверный исход, худший из возможных.
       *
       * Неизвестное значение игнорируется, а не роняет и не откатывает на
       * вторую версию: то же правило, что у `?stage=99`.
       */
      const versionApplied =
        versionParam !== null && versionParam !== '' && selectVersion(versionParam);

      /*
       * Карта перечитывается ЗАНОВО, а не берётся из замыкания: `map` пришёл с
       * рендера ДО подмены версии, и поиск этапа шёл бы по прежней карте.
       */
      const active = versionApplied ? loadProcessMap() : map;
      addressMap = active;

      const nodeStage = findStageByNodeId(active, nodeParam);
      const targetStage = nodeStage ?? findStageByNumber(active, stageParam);

      if (targetStage !== undefined) {
        /*
         * Владелец этапа — ИЗ ДОКУМЕНТА (active, та же карта, в которой найден
         * этап), и он передаётся store вторым аргументом. Не ради адреса —
         * адрес берёт модуль из документа сам (moduleForAddress), — а ради
         * «Назад»: back() знает только поля store, и без модуля в нём первый
         * же шаг вверх с уровня шагов вёл бы на корень, а не на экран
         * модуля-владельца (шапка back() в useProcessStore.ts).
         *
         * Модуль из ?module= сюда НЕ идёт ни при каком значении: этап старше
         * (шапка файла), и модуль, противоречащий этапу, store не получает.
         *
         * На двухуровневой карте владельца нет, второй аргумент — undefined, и
         * вызов ровно прежний navigateToStage(id): модуль в store не трогается.
         */
        navigateToStage(targetStage.id, moduleOfStage(active, targetStage.id)?.id);
        // selectNode — только если узел реально нашёлся и принадлежит именно
        // targetStage (а он всегда принадлежит, раз targetStage взят из
        // nodeStage выше); пустой/битый node без валидного stage сюда не
        // попадёт вовсе (targetStage тогда undefined).
        if (nodeStage !== undefined && nodeParam !== null) {
          selectNode(nodeParam);
        }
      } else {
        /*
         * МОДУЛЬ — ТОЛЬКО ЗДЕСЬ, в ветке «ни узел, ни этап не разрешились».
         * Прочитай его раньше или рядом с этапом, и navigateToModule, который
         * сбрасывает этап (шапка useProcessStore.ts), вернул бы ссылку на этап
         * на экран модуля.
         *
         * Этап, указанный, но не найденный (`?module=snp&stage=99`), модуль
         * не отменяет: открывается экран модуля — ближайшее к просьбе, что
         * документ может показать, как `?stage=99` оставляет на корне.
         *
         * Неизвестный id и любой id на двухуровневой карте — undefined
         * (findModuleById), и экран остаётся на корне; параметр из адреса
         * сотрёт запись ниже.
         */
        const targetModule = findModuleById(active, moduleParam);
        if (targetModule !== undefined) {
          navigateToModule(targetModule.id);
        }
      }
    }

    // Синхронизация URL. Через useProcessStore.getState(), а не через
    // currentStageId/selectedNodeId из замыкания выше: на первом проходе
    // (монтирование) оба эффекта в этом теле выполняются в одном commit без
    // промежуточного рендера — dispatch (navigateToStage/selectNode) уже
    // обновил стор синхронно (zustand), а пропсы текущего рендера — ещё нет.
    // getState() гарантирует, что URL сразу пишется по факту, без лишнего
    // кадра с неверным (пустым) query.
    const state = useProcessStore.getState();
    const stage =
      state.currentStageId === null
        ? undefined
        : addressMap.stages.find((candidate) => candidate.id === state.currentStageId);

    // Свои параметры собираются заново при каждой записи, чужие переносятся
    // как есть (composeSearch). Ключ, которого здесь нет, из адреса стирается —
    // так уходят и stage/node при возврате на обзор, и посторонний ?module= на
    // двухуровневой карте.
    const own: Partial<Record<OwnParam, string>> = {};

    /*
     * Версия пишется в адрес, только если она НЕ по умолчанию. Тогда все уже
     * разосланные по вики ссылки вида `?stage=3` остаются побайтово теми же и
     * означают ровно то, что означали, — а параметр появляется только там, где
     * без него смысл потерялся бы.
     *
     * Пишется по ВЫБРАННОЙ версии, даже когда поверх лежит загруженная схема:
     * адрес описывает то, что получится после перезагрузки, а перезагрузка
     * загруженную схему отбрасывает всегда.
     */
    const selectedVersion = getSelectedVersionId();
    if (selectedVersion !== DEFAULT_VERSION_ID) {
      own.version = selectedVersion;
    }

    // Уровень 1 — модуля нет; экран модуля — ?module=<id>; уровень шагов —
    // ?module=<владелец>&stage=<номер>(&node=<id>). Откуда берётся модуль и
    // почему на двухуровневой карте его нет никогда — moduleForAddress.
    const module = moduleForAddress(addressMap, stage, state.currentStageId, state.currentModuleId);
    if (module !== undefined) {
      own.module = module.id;
    }

    // stage === undefined — либо корень/экран модуля, либо currentStageId не
    // резолвится в существующий этап; в обоих случаях stage и node в адресе
    // не место.
    if (stage !== undefined) {
      own.stage = String(stage.number);
      if (state.selectedNodeId !== null) {
        own.node = state.selectedNodeId;
      }
    }

    const query = composeSearch(window.location.search, own);
    const url = `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`;
    // SPEC §4.7: replaceState, НЕ pushState — история родительской вики не
    // должна расти при навигации внутри iframe.
    //
    // try/catch — защита в глубину (process-map-cxd). replaceState бросает
    // SecurityError, когда URL документа непригоден для history-состояния:
    // sandboxed-фрейм с srcdoc или data:-адресом. Цена перехвата нулевая, а
    // цена отказа — всё приложение: error boundary в проекте нет ни одного,
    // App висит прямо под createRoot, и React 18, не найдя boundary для
    // исключения из эффекта, размонтирует корень.
    //
    // ЧЕГО ЭТА ЗАЩИТА НЕ КАСАЕТСЯ, вопреки первой редакции этого комментария:
    // sandbox без allow-same-origin. Проверено зондом в Chromium — там
    // window.origin === 'null', localStorage бросает, а replaceState работает:
    // браузер смотрит на URL документа, а он у нас настоящий http-адрес, а не
    // opaque. То есть README «Условие 2» был прав изначально, обещая потерю
    // одного лишь localStorage.
    //
    // Молчаливое проглатывание здесь уместно: синхронизация адреса — удобство
    // (deep-link на перезагрузку), а не функция. Карта обязана работать и без
    // неё. Тот же приём применён к localStorage в data/loader.ts::getStorage.
    try {
      window.history.replaceState(window.history.state as unknown, '', url);
    } catch {
      // Адрес не синхронизируется — карта продолжает работать.
    }
  }, [
    map,
    currentModuleId,
    currentStageId,
    selectedNodeId,
    navigateToModule,
    navigateToStage,
    selectNode,
  ]);
}
