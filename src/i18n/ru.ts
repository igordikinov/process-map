// Все строки интерфейса (CLAUDE.md «Кодовые правила»).
// Функции здесь — только форматирование готовых значений, никакой логики UI.
import { pluralRu } from '../utils/format';

export const ru = {
  appTitle: 'In.Plan Process Map',

  overview: {
    /** Бейдж в шапке: «4 этапа». */
    stagesBadge: (count: number): string =>
      `${count} ${pluralRu(count, 'этап', 'этапа', 'этапов')}`,
    /** Правая часть шапки: «Обновлено 24.08.2026». */
    updatedAt: (date: string): string => `Обновлено ${date}`,
    /** Заголовки dashed-свимлейнов. */
    laneIn: 'Внешние системы — вход',
    laneOut: 'Внешние системы — выход',
    /** aria-label полотна. */
    canvasLabel: 'Схема процесса, уровень 1',
  },

  stageNode: {
    /** Подпись рядом с номером у неактивной карточки. */
    caption: 'Этап',
    /** Подпись рядом с номером у активной карточки. */
    captionActive: 'Выбранный этап',
    /** Заголовок блока со списком keyOutputs. */
    keyOutputs: 'Ключевые выходы',
    /** Счётчик предупреждений этапа: «5 предупреждений». */
    warnings: (count: number): string =>
      `${count} ${pluralRu(count, 'предупреждение', 'предупреждения', 'предупреждений')}`,
    /** Нижняя строка карточки, показывается только если у этапа есть screen. */
    openInInplan: 'Открыть в In.Plan →',
    /** aria-label кнопки-карточки. */
    ariaLabel: (number: number, title: string): string => `Этап ${number}: ${title}`,
  },

  stageDetail: {
    /** aria-label полотна уровня 2. */
    canvasLabel: 'Схема этапа, уровень 2',
    /** Заголовок левой колонки data-узлов (артборд A2). */
    inputsColumn: 'Входные данные',
    /** Заголовок правой колонки data-узлов (артборд A2). */
    outputsColumn: 'Выходные данные',
  },

  stepNode: {
    /** aria-label карточки шага: тип узла помогает скринридеру. */
    ariaLabel: (label: string): string => `Шаг: ${label}`,
    ariaLabelIntegration: (label: string): string => `Интеграция: ${label}`,
    ariaLabelWarning: (label: string): string => `Предупреждение: ${label}`,
    /** aria-label и title иконки link-external (показывается только при screen). */
    openScreen: (title: string): string => `Открыть экран в In.Plan: ${title}`,
  },

  dataNode: {
    /** aria-label карточки данных. */
    ariaLabel: (label: string): string => `Данные: ${label}`,
  },

  /** Боковая панель узла (SPEC §4.3, артборд A3). */
  drawer: {
    /** aria-label и title кнопки-крестика в шапке панели. */
    close: 'Закрыть',
    /** Заголовок секции ссылки на экран. */
    screenSection: 'Экран в системе',
    /** Состояние «ссылка не задана» — в v1 оно у всех узлов (ссылки из M3). */
    screenEmpty: 'Ссылка не задана',
    /** Текстовое действие рядом с пустым состоянием, только в режиме редактора. */
    screenAdd: 'Добавить',
    /** title строки ссылки: заголовок и url усечены многоточием. */
    screenHint: (title: string, url: string): string => `${title} — ${url}`,
    /** Заголовки секций в порядке SPEC §4.3. */
    inputs: 'Входы',
    outputs: 'Выходы',
    /** По артборду A3 заголовок пишется через запятую. */
    system: 'Система, модуль',
    owner: 'Ответственный',
    /** Футер: stroked-кнопка, показывается только при непустом description. */
    more: 'Подробнее',
    /** Футер: primary-кнопка, disabled без ссылки на экран. */
    openInModule: 'Открыть в модуле',
    /** title той же кнопки, когда она заблокирована. */
    openInModuleEmpty: 'Ссылка на экран не задана',
  },

  /** Тулбар полотна (SPEC §4.6): toggle интеграций + зум −/%/+/fit. */
  toolbar: {
    /** Видимый текст и aria-label переключателя интеграций. */
    showIntegrations: 'Показать интеграции',
    /** aria-label и title кнопки уменьшения масштаба. */
    zoomOut: 'Уменьшить',
    /** aria-label и title кнопки увеличения масштаба. */
    zoomIn: 'Увеличить',
    /** aria-label и title кнопки «Уместить в экран». */
    fitView: 'Уместить в экран',
    /** Текст в ячейке процента масштаба: «100%». */
    zoomPercent: (percent: number): string => `${percent}%`,
  },

  /** Легенда полотна (макет A1/A2, левый нижний угол). */
  legend: {
    /** aria-label блока целиком. */
    ariaLabel: 'Условные обозначения',
    step: 'Шаг',
    data: 'Данные',
    integration: 'Интеграция',
    warning: 'Предупреждение',
  },

  breadcrumbs: {
    /** Корень крошек, всегда одинаков: «E2E-процесс › {stage.title}». */
    root: 'E2E-процесс',
    /** Бейдж рядом с крошками: «Этап N». */
    stageBadge: (number: number): string => `Этап ${number}`,
    /** aria-label кнопки возврата на уровень 1. */
    backAriaLabel: 'Назад к обзору процесса',
    /** Счётчик справа: «11 шагов · 4 входа · 4 выхода». */
    counter: (steps: number, inputs: number, outputs: number): string =>
      `${steps} ${pluralRu(steps, 'шаг', 'шага', 'шагов')} · ` +
      `${inputs} ${pluralRu(inputs, 'вход', 'входа', 'входов')} · ` +
      `${outputs} ${pluralRu(outputs, 'выход', 'выхода', 'выходов')}`,
  },
} as const;
