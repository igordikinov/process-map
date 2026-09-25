// Строки интерфейса трёхуровневой карты в src/i18n/ru.ts (задача
// process-map-9mn.33).
//
// ПОЧЕМУ ОТДЕЛЬНЫЙ ФАЙЛ. Строки добавлены РАНЬШЕ экранов, которые их покажут
// (9mn.16, 9mn.17, 9mn.36): ru.ts общий, и параллельные правки конфликтуют.
// Значит, до этих задач строки не рендерит ни один компонент, и ни один
// компонентный тест их не видит. Но и после — не увидит опечатку: компонентные
// тесты ищут элементы по самим ru.* (tests/breadcrumbs.test.tsx ищет счётчик
// через ru.breadcrumbs.counter), то есть сверяют строку с ней же. Подпись
// «Назад», утверждённую владельцем дословно, с текстом владельца сверяет
// только этот файл.
//
// Что закреплено:
//   · склонение каждого нового счёта по числу — 1, 2, 5, 11, 21 обязательно:
//     11 — исключение («11 модулей», а не «11 модуль»), 21 — возврат к форме
//     единственного числа («21 модуль»), и именно на этих двух ломаются
//     самодельные правила;
//   · тексты владельца — побайтово (подписи «Назад», бейджи, подпись версии);
//   · строки двухуровневых карт не сдвинулись ни на букву: на них стоят
//     литералы e2e («Назад к обзору процесса», «Этап 2»).
//
// Сами строки ожидаются литералами, а не через pluralRu: тест, собирающий
// ожидание тем же pluralRu, что и проверяемый код, проверял бы pluralRu сам
// с собой.
import { describe, expect, it } from 'vitest';
import { ru } from '../src/i18n/ru';

/**
 * Таблица склонений по числу. Кроме обязательных 1, 2, 5, 11, 21 — 4 (верх
 * формы «few»), 12 и 14 (вся полоса исключений 11–14, а не одно 11) и 22.
 */
function pluralTable(one: string, few: string, many: string): readonly [number, string][] {
  return [
    [1, `1 ${one}`],
    [2, `2 ${few}`],
    [4, `4 ${few}`],
    [5, `5 ${many}`],
    [11, `11 ${many}`],
    [12, `12 ${many}`],
    [14, `14 ${many}`],
    [21, `21 ${one}`],
    [22, `22 ${few}`],
  ];
}

const MODULES = pluralTable('модуль', 'модуля', 'модулей');
const STAGES = pluralTable('этап', 'этапа', 'этапов');

describe('склонения новых счётчиков', () => {
  it.each(MODULES)('overview.modulesBadge(%i) → «%s»', (count, expected) => {
    expect(ru.overview.modulesBadge(count)).toBe(expected);
  });

  it.each(MODULES)('overview.modulesCount(%i) → «%s»', (count, expected) => {
    expect(ru.overview.modulesCount(count)).toBe(expected);
  });

  it.each(STAGES)('overview.stagesCount(%i) → «%s»', (count, expected) => {
    expect(ru.overview.stagesCount(count)).toBe(expected);
  });

  it.each(STAGES)('breadcrumbs.stagesCounter(%i) → «%s»', (count, expected) => {
    expect(ru.breadcrumbs.stagesCounter(count)).toBe(expected);
  });
});

describe('фразы счёта для подсказки и объявления версии', () => {
  /*
   * process-map-9mn.16 перевела versionHint/versionAnnouncement с числа этапов
   * на готовую фразу счёта (см. комментарий в ru.ts). Этот блок закрепляет,
   * что у ДВУХУРОВНЕВЫХ версий текст остался побайтово прежним: до перехода
   * versionHint('Полная модель', n) печатала `Полная модель — ${n} этап(а/ов)`,
   * и ровно этот литерал из таблицы STAGES ожидается теперь от
   * versionHint('Полная модель', stagesCount(n)). Тесты переключателя
   * (tests/versionSwitcher.test.tsx) сверяют подсказку с вызовом ru.overview.*,
   * то есть с той же функцией, и дрейфа текста не заметили бы — заметит этот.
   */
  it.each(STAGES)(
    'versionHint/versionAnnouncement(…, stagesCount(%i)) — прежний текст',
    (count, expected) => {
      // Ожидание — литерал таблицы, а не вызов stagesCount: так тест ловит и
      // дрейф фразы, и дрейф самих функций, не сверяя код с ним же.
      expect(ru.overview.stagesCount(count)).toBe(expected);
      expect(ru.overview.versionHint('Полная модель', ru.overview.stagesCount(count))).toBe(
        `Полная модель — ${expected}`,
      );
      expect(ru.overview.versionAnnouncement('Полная модель', ru.overview.stagesCount(count))).toBe(
        `Карта: Полная модель, ${expected}`,
      );
    },
  );

  it.each(MODULES)(
    'versionHint/versionAnnouncement(…, modulesCount(%i)) считают модули',
    (count, expected) => {
      expect(ru.overview.versionHint('Процессы', ru.overview.modulesCount(count))).toBe(
        `Процессы — ${expected}`,
      );
      expect(ru.overview.versionAnnouncement('Процессы', ru.overview.modulesCount(count))).toBe(
        `Карта: Процессы, ${expected}`,
      );
    },
  );
});

describe('тексты владельца — дословно', () => {
  it('подпись версии карты модулей — «Процессы»', () => {
    expect(ru.overview.versionLabels['inplan']).toBe('Процессы');
  });

  it('подписи соседних версий не тронуты (их меняет process-map-9mn.20)', () => {
    expect(ru.overview.versionLabels['snp']).toBe('Основные этапы');
    expect(ru.overview.versionLabels['inplan-model']).toBe('Полная модель');
  });

  it('бейдж уровня 2 — «Модуль N»', () => {
    expect(ru.breadcrumbs.moduleBadge(1)).toBe('Модуль 1');
    expect(ru.breadcrumbs.moduleBadge(5)).toBe('Модуль 5');
  });

  it('бейдж уровня 3 — «Этап k из n», сначала позиция, потом число этапов', () => {
    // k ≠ n намеренно: при k = n перестановка аргументов невидима.
    expect(ru.breadcrumbs.stageOfModuleBadge(1, 4)).toBe('Этап 1 из 4');
    expect(ru.breadcrumbs.stageOfModuleBadge(3, 4)).toBe('Этап 3 из 4');
    // И n ≠ 4: четыре этапа — типичный модуль карты inplan (DP 1–4, MEIO
    // 5–8), и при одном n = 4 зашитое «из 4» проходило бы vitest. Ловил бы
    // его только no-unused-vars в eslint, а сторожем текста должен быть
    // этот тест, а не настройка линтера.
    expect(ru.breadcrumbs.stageOfModuleBadge(2, 3)).toBe('Этап 2 из 3');
  });

  it('подписи «Назад» по уровням', () => {
    expect(ru.breadcrumbs.backToModuleStages).toBe('Назад к этапам модуля');
    expect(ru.breadcrumbs.backToAllModules).toBe('Назад ко всем модулям');
  });

  it('бейдж шапки уровня 1 — «5 модулей»', () => {
    // Пример из решения владельца (process-map-9mn.16) — отдельно от таблицы,
    // чтобы строка решения стояла в тестах буквально.
    expect(ru.overview.modulesBadge(5)).toBe('5 модулей');
  });
});

describe('подписи узлов', () => {
  it('карточка модуля', () => {
    expect(ru.moduleNode.caption).toBe('Модуль');
    expect(ru.moduleNode.keyOutputs).toBe('Ключевые выходы');
    expect(ru.moduleNode.ariaLabel(1, 'Планирование спроса')).toBe('Модуль 1: Планирование спроса');
  });

  it('подробность — в узле и в легенде', () => {
    expect(ru.detailNode.ariaLabel('Сбор истории продаж')).toBe('Подробность: Сбор истории продаж');
    expect(ru.legend.detail).toBe('Подробность');
  });

  it('полоса уровня 1', () => {
    expect(ru.lane.ariaLabel('FP&A · Финансовое планирование и анализ')).toBe(
      'Полоса: FP&A · Финансовое планирование и анализ',
    );
  });
});

describe('подписи полотен', () => {
  it('три уровня трёхуровневой карты', () => {
    expect(ru.overview.allModulesCanvasLabel).toBe('Схема всех модулей, уровень 1');
    expect(ru.overview.moduleCanvasLabel).toBe('Схема модуля, уровень 2');
    expect(ru.stageDetail.moduleStageCanvasLabel).toBe('Схема этапа, уровень 3');
  });

  it('все пять подписей попарно различны', () => {
    // Экран опознаётся по имени области (role="region"): совпадение двух
    // подписей сделало бы два экрана неразличимыми для скринридера и для
    // getByRole('region', { name }) в тестах.
    const labels = [
      ru.overview.canvasLabel,
      ru.stageDetail.canvasLabel,
      ru.overview.allModulesCanvasLabel,
      ru.overview.moduleCanvasLabel,
      ru.stageDetail.moduleStageCanvasLabel,
    ];
    expect(new Set(labels).size).toBe(labels.length);
  });
});

describe('строки двухуровневых карт не сдвинулись', () => {
  // Подпись «Назад» и бейдж стоят литералами в e2e (deep-link, journey,
  // stage-detail, version-switch), подписями полотен компонентные тесты
  // опознают экран (getByLabelText(ru.overview.canvasLabel)). Новые ключи
  // добавлены рядом, а не вместо.
  it('подпись «Назад», бейдж этапа, подписи полотен', () => {
    expect(ru.breadcrumbs.backAriaLabel).toBe('Назад к обзору процесса');
    expect(ru.breadcrumbs.stageBadge(2)).toBe('Этап 2');
    expect(ru.overview.canvasLabel).toBe('Схема процесса, уровень 1');
    expect(ru.stageDetail.canvasLabel).toBe('Схема этапа, уровень 2');
  });

  it('новые подписи «Назад» не совпадают с прежней', () => {
    // Иначе getByRole('button', { name: 'Назад к обзору процесса' }) в e2e
    // нашёл бы кнопку не того уровня.
    expect(
      new Set([
        ru.breadcrumbs.backAriaLabel,
        ru.breadcrumbs.backToModuleStages,
        ru.breadcrumbs.backToAllModules,
      ]).size,
    ).toBe(3);
  });
});
