// Шапка с хлебными крошками (SPEC §4.2, артборд A2): кнопка «Назад», крошки,
// бейдж, справа счётчик.
//
// ТРИ ФОРМЫ (задача process-map-9mn.17), и какая из них, решают два входа —
// проп module и currentStageId из store:
//
//   карта        экран   module   крошки                                     бейдж          счётчик
//   2 уровня     этап    нет      {rootLabel} › {stage.title}                «Этап N»       шаги · входы · выходы
//   3 уровня     модуль  есть     {rootLabel} › {module.shortTitle}          «Модуль N»     «N этапов»
//   3 уровня     этап    есть     {rootLabel} › {module.shortTitle} › {…}    «Этап k из n»  шаги · входы · выходы
//
// Экрана «2 уровня, корень» у крошек нет: там шапка OverviewHeader, и
// компонент возвращает null — ровно как до 9mn.17.
//
// ДВУХУРОВНЕВАЯ ФОРМА — ПОБАЙТОВО ПРЕЖНЯЯ. От её DOM зависят юнит-тесты
// (tests/breadcrumbs.test.tsx, stageDetail.test.tsx, compact.test.tsx и другие)
// и десять литералов «Назад к обзору процесса» в пяти файлах e2e (на
// 25.09.2026; пересчитать — `git grep -c "Назад к обзору процесса" -- e2e`),
// и на картах snp и mrp читатель не должен заметить, что компонент научился
// чему-то ещё: корень — <span>, а не кнопка, подпись «Назад» — прежняя строка
// ru.breadcrumbs.backAriaLabel.
//
// Компонент самодостаточен по данным: получает список этапов и модуль
// пропами и сам достаёт текущий этап из `useProcessStore` — так его можно
// смонтировать на любом экране без риска падения.
import type { ReactNode } from 'react';
import { iconUrl } from '../../assets/icons';
import type { Module, Stage } from '../../data/schema';
import { ru } from '../../i18n/ru';
import { useProcessStore } from '../../store/useProcessStore';
import { countStageNodes } from '../../utils/stageNodes';
import styles from './Breadcrumbs.module.css';

export interface BreadcrumbsProps {
  /**
   * Этапы, среди которых ищется текущий (currentStageId из store).
   *
   * На уровне этапа — `map.stages` (передаётся снаружи, чтобы не грузить JSON
   * повторно на каждый ререндер и не плодить источники данных, см. loader.ts).
   * На экране модуля — показанные этапы модуля (levelTwoView), и их число —
   * счётчик «N этапов»: он считает карточки на полотне, а не stageIds.
   *
   * readonly: stagesOfModule без фильтра отдаёт массив самого документа той
   * же ссылкой (шапка src/data/modules.ts), и компонент его только читает.
   */
  stages: readonly Stage[];
  /**
   * Корень крошек — имя КАРТЫ, а не константа (process-map-0c5.12).
   *
   * Раньше здесь стояло «E2E-процесс», и это было неправдой на двух картах из
   * трёх: на «Процессе планирования потребности в материалах» (адрес /mrp/) и
   * на карте из модели, которая описывает десять модулей In.Plan. Пока карты
   * жили на разных адресах, ложь никому не бросалась в глаза; с переключателем
   * версий обе стоят на одной странице, и она видна за один клик.
   *
   * Значение — `map.moduleLabel`, решение владельца от 05.09.2026: «Модуль SNP»,
   * «Модуль MRP», «Все модули In.Plan». Поле обязательно и непусто по схеме.
   * На двухуровневой карте это ровно та строка, которой подписана рамка вокруг
   * потока этапов на обзоре, — читатель видит на двух уровнях одно и то же имя.
   *
   * НА ТРЁХУРОВНЕВОЙ КАРТЕ — ТОЖЕ map.moduleLabel («Все процессы In.Plan»), и
   * НИКОГДА module.label. У moduleLabel две роли (комментарий к Module.label в
   * schema.ts): подпись рамки и корень крошек. module.label забирает только
   * первую — рамку уровня 2 («Модуль DP», levelTwoView). Корень, взятый из
   * модуля, назвал бы модуль дважды — «Модуль DP › DP · Планирование спроса ›
   * Этап» — и подписал бы дорогу на корень неверно: кнопка по-прежнему вела
   * бы на экран всех модулей (resetLevel), а называлась бы именем одного из
   * них.
   *
   * Пропом, а не чтением карты внутри: компонент остаётся чистым и уже
   * принимает `stages`, а не карту целиком.
   */
  rootLabel: string;
  /**
   * Модуль, в котором стоит читатель, — только на ТРЁХУРОВНЕВОЙ карте.
   *
   * Не задан — двухуровневая карта, форма крошек побайтово прежняя. Задан —
   * одна из двух трёхуровневых форм (шапка файла): при currentStageId ===
   * null это экран модуля, иначе экран этапа этого модуля.
   *
   * На экране этапа это ВЛАДЕЛЕЦ этапа по документу — moduleOfStage(map,
   * stage.id), — а не currentModuleId из store: этап без модуля в store —
   * законное состояние (deep-link ?stage=N без ?module=, комментарий к
   * navigateToStage), и документ владельца знает всегда. На нём держится k в
   * бейдже «Этап k из n»: позиция берётся из module.stageIds, и модуль, этапа
   * не содержащий, дал бы «Этап 0 из n».
   */
  module?: Module | undefined;
  /**
   * SPEC §4.5: шапка 44 px. Артборд A4 показывает только уровень 1, но
   * требование «шапка 44 px» относится к режиму, а не к экрану: две разные
   * высоты шапки на двух уровнях одного низкого фрейма — это дефект, а не
   * замысел. Счётчик справа при этом остаётся: он и есть содержимое шапки,
   * а не украшение.
   */
  compact?: boolean;
}

// Путь иконки изолирован в одной константе: реестр иконок (src/assets/icons)
// появился параллельно, во время работы над этой задачей (process-map-mpg),
// поэтому используем его, а не собственный механизм — см. комментарий в
// src/assets/icons/index.ts про BASE_URL и `base: './'`.
const RETURN_ICON_SRC = iconUrl('return-back');

interface CrumbsHeaderProps {
  compact: boolean;
  /** aria-label и title кнопки «Назад»: подпись называет, КУДА она ведёт. */
  backLabel: string;
  onBack: () => void;
  /** Звенья крошек и бейдж — содержимое .crumbs. */
  children: ReactNode;
  counter: string;
}

/**
 * Оболочка шапки, общая для трёх форм. Разметка — дословно та, что была у
 * компонента до 9mn.17: двухуровневая форма, собранная через неё, даёт тот же
 * DOM, байт в байт (сторожат tests/breadcrumbs.test.tsx и e2e).
 */
function CrumbsHeader({ compact, backLabel, onBack, children, counter }: CrumbsHeaderProps) {
  return (
    <header className={compact ? `${styles.header} ${styles.compact}` : styles.header}>
      <button
        type="button"
        className={styles.backButton}
        onClick={onBack}
        aria-label={backLabel}
        title={backLabel}
      >
        <img className={styles.backIcon} src={RETURN_ICON_SRC} alt="" />
      </button>

      <div className={styles.crumbs}>{children}</div>

      <div className={styles.spacer} />

      <span className={styles.counter}>{counter}</span>
    </header>
  );
}

/**
 * Неактивное звено трёхуровневых крошек — КНОПКА.
 *
 * Зачем звено вообще кликабельно: при трёх уровнях до корня иначе два клика
 * «Назад» и ни одного видимого признака, что корень — место назначения
 * (process-map-9mn.17). «Назад» остаётся и по-прежнему значит «на один
 * уровень вверх».
 *
 * <button>, А НЕ <a href>. Приложение живёт в iframe вики (SPEC §6), и
 * навигация по ссылке растила бы историю родительской страницы — то, от чего
 * deep-link отказался в пользу replaceState (SPEC §4.7). Адреса у экранов
 * здесь нет вовсе: переход — смена состояния store.
 *
 * Только на трёхуровневой карте. На двухуровневой корень крошек остаётся
 * <span>, как до 9mn.17: от этого DOM зависят юнит-тесты и e2e (шапка
 * файла), и на двух уровнях звено-кнопка ничего бы не добавило — с экрана
 * этапа корень и «Назад» ведут на один и тот же обзор.
 *
 * На трёхуровневой карте такое же совпадение есть на экране модуля: корень
 * (resetLevel) и «Назад» (back) оба ведут на экран модулей. Это дублирование
 * принято сознательно: трекер 9mn.17 требует, чтобы КАЖДОЕ неактивное звено
 * трёхуровневых крошек было кнопкой, и корень, кликабельный на уровне 3, но
 * немой на уровне 2, читался бы как сбой, а не как замысел.
 */
function CrumbLink({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" className={`${styles.crumbLabel} ${styles.crumbLink}`} onClick={onClick}>
      {children}
    </button>
  );
}

function Separator() {
  return <span className={styles.crumbSeparator}>›</span>;
}

export function Breadcrumbs({ stages, rootLabel, module, compact = false }: BreadcrumbsProps) {
  const currentStageId = useProcessStore((state) => state.currentStageId);
  const back = useProcessStore((state) => state.back);
  const resetLevel = useProcessStore((state) => state.resetLevel);
  const navigateToModule = useProcessStore((state) => state.navigateToModule);

  // ЭКРАН МОДУЛЯ (3 уровня, уровень 2): «Все процессы In.Plan › DP ·
  // Планирование спроса», бейдж «Модуль N», счётчик «N этапов».
  if (currentStageId === null) {
    // Без модуля это корень двухуровневой карты: у него своя шапка
    // (OverviewHeader), и крошкам рисовать нечего — как до 9mn.17.
    if (module === undefined) {
      return null;
    }
    return (
      <CrumbsHeader
        compact={compact}
        // back(), а не resetLevel(): «Назад» — ровно на один уровень вверх
        // (process-map-9mn.31, п. 4), и с экрана модуля этот уровень — корень.
        // Здесь оба дают одно состояние; back() — потому что кнопка «Назад»
        // на всех экранах значит одно и то же.
        backLabel={ru.breadcrumbs.backToAllModules}
        onBack={back}
        counter={ru.breadcrumbs.stagesCounter(stages.length)}
      >
        <CrumbLink onClick={resetLevel}>{rootLabel}</CrumbLink>
        <Separator />
        {/* Звено модуля — shortTitle «DP · Планирование спроса», а не label
            «Модуль DP» (решение владельца process-map-9mn.31, п. 3): то же
            звено, что посередине крошек уровня этапа. «Модуль DP» остаётся
            подписью рамки на полотне этого экрана. */}
        <span className={styles.crumbActive}>{module.shortTitle}</span>
        <span className={styles.badge}>{ru.breadcrumbs.moduleBadge(module.number)}</span>
      </CrumbsHeader>
    );
  }

  const stage = stages.find((candidate) => candidate.id === currentStageId);

  // Рассинхрон currentStageId и stages (например, стейт ещё не подхватил
  // новый список этапов): безопаснее не показывать крошки, чем показать
  // пустой заголовок этапа. Из тупика выводит защита в StageDetail.tsx.
  if (stage === undefined) {
    return null;
  }

  const counts = countStageNodes(stage);
  const counter = ru.breadcrumbs.counter(counts.steps, counts.inputs, counts.outputs);

  // ЭКРАН ЭТАПА ДВУХУРОВНЕВОЙ КАРТЫ — побайтово как до 9mn.17.
  if (module === undefined) {
    return (
      <CrumbsHeader
        compact={compact}
        backLabel={ru.breadcrumbs.backAriaLabel}
        onBack={back}
        counter={counter}
      >
        <span className={styles.crumbLabel}>{rootLabel}</span>
        <Separator />
        <span className={styles.crumbActive}>{stage.title}</span>
        <span className={styles.badge}>{ru.breadcrumbs.stageBadge(stage.number)}</span>
      </CrumbsHeader>
    );
  }

  // ЭКРАН ЭТАПА ТРЁХУРОВНЕВОЙ КАРТЫ: три звена, бейдж «Этап k из n».
  //
  // k — ПОЗИЦИЯ ВНУТРИ МОДУЛЯ, а не stage.number. Номера этапов сквозные через
  // все модули (DP 1–4, MEIO 5–8, …), и «Этап 7» у третьего этапа MEIO
  // читалась бы как ошибка; stage.number остаётся адресом (?stage=N), а не
  // подписью. Позиция — из module.stageIds, то есть из того же порядка, в
  // котором карточки стоят на экране модуля (stagesOfModule): первая слева
  // карточка — «Этап 1 из n», какой бы номер у неё ни был.
  const position = module.stageIds.indexOf(stage.id) + 1;
  // На модуль этапа, а не back(). В обычном пути это одно и то же состояние:
  // клик по карточке на экране модуля оставляет модуль в store. Расходятся
  // они на этапе, открытом без модуля (deep-link ?stage=N без ?module=): там
  // back() увёл бы на корень, и подпись «Назад к этапам модуля» стала бы
  // неправдой. Владельца этапа крошки знают из документа (проп module), store
  // — нет (комментарий к back в useProcessStore.ts), поэтому переход и берёт
  // модуль отсюда. Так «Назад» остаётся «на один уровень вверх» при любом
  // пути на этот экран.
  const toModule = () => {
    navigateToModule(module.id);
  };

  return (
    <CrumbsHeader
      compact={compact}
      backLabel={ru.breadcrumbs.backToModuleStages}
      onBack={toModule}
      counter={counter}
    >
      <CrumbLink onClick={resetLevel}>{rootLabel}</CrumbLink>
      <Separator />
      <CrumbLink onClick={toModule}>{module.shortTitle}</CrumbLink>
      <Separator />
      <span className={styles.crumbActive}>{stage.title}</span>
      <span className={styles.badge}>
        {ru.breadcrumbs.stageOfModuleBadge(position, module.stageIds.length)}
      </span>
    </CrumbsHeader>
  );
}
