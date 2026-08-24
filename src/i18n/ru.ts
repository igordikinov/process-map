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
} as const;
