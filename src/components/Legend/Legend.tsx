// Легенда полотна: SPEC §4.6 упоминает её местом в тулбаре, макет кладёт её
// в левый нижний угол на обоих артбордах A1/A2 — но состав пунктов там на
// обоих один и тот же («Шаг · Данные · Интеграция · Предупреждение»), хотя
// уровень 1 не содержит НИ ОДНОГО узла этих типов (там только карточки
// этапов, карточки систем и рёбра). Слепое копирование макета вводило
// читателя в заблуждение, поэтому состав здесь зависит от уровня:
//   · уровень 1 (обзор) — линия процесса, пунктир интеграции, карточка
//     системы: то, что на обзоре реально есть;
//   · уровень 2 (детализация) — типы узлов, как в макете (там они верны).
// Пункт «Интеграция» (и «Система» на уровне 1 — она тоже пропадает вместе
// со свимлейнами) скрывается, когда toggle «Показать интеграции» выключен:
// иначе легенда обещала бы то, чего на экране больше нет.
//
// Из-за этого компонент больше не «чистый»: ему нужен store — level решает
// currentStageId (null → обзор), state toggle решает showIntegrations.
// React Flow ему не нужен вовсе — и именно поэтому она НЕ монтируется внутри
// .canvas/<ReactFlowProvider> (см. Overview.tsx/StageDetail.tsx): раньше она
// плавала там поверх полотна абсолютным позиционированием, но перекрывала
// содержимое на реальных данных — см. подробное обоснование в
// Legend.module.css. Теперь она отдельная строка (.legendStrip) под .canvas,
// а не над ним; сама позиция строки задаётся снаружи, здесь только контент.
//
// Компактный режим (SPEC §4.5) сворачивает легенду в кнопку-иконку
// (design/*.dc.html, артборд A4, assets/icons/tables.svg) — задача M4.
// Здесь заложена только точка расширения: списки *_ITEMS ниже не завязаны
// на разметку панели, поэтому M4 сможет переиспользовать их для содержимого
// свёрнутой кнопки/поповера, не трогая этот компонент. Сама логика
// «высота контейнера < config.compactHeight» не реализуется в этой задаче.
import { ru } from '../../i18n/ru';
import { useProcessStore } from '../../store/useProcessStore';
import styles from './Legend.module.css';

interface LegendItem {
  key: string;
  label: string;
  // CSS-модули типизированы как Record<string, string> с индексной сигнатурой
  // (vite/client.d.ts) — при noUncheckedIndexedAccess (tsconfig) любой
  // styles.xxx выводится как string | undefined, хотя ключ существует.
  // В className ниже это безопасно (шаблонная строка), тип поля отражает
  // фактический тип styles.* без утверждений (`as string`).
  swatch: string | undefined;
}

/** Уровень 1 (SPEC §4.1): линия процесса, пунктир интеграции, карточка системы. */
const OVERVIEW_ITEMS: readonly LegendItem[] = [
  { key: 'process', label: ru.legend.process, swatch: styles.swatchProcess },
  { key: 'integration', label: ru.legend.integration, swatch: styles.swatchIntegration },
  { key: 'system', label: ru.legend.system, swatch: styles.swatchSystem },
];

/** Уровень 2 (SPEC §4.2): типы узлов — совпадает с макетом A2. */
const STAGE_ITEMS: readonly LegendItem[] = [
  { key: 'step', label: ru.legend.step, swatch: styles.swatchStep },
  { key: 'data', label: ru.legend.data, swatch: styles.swatchData },
  { key: 'integration', label: ru.legend.integration, swatch: styles.swatchIntegration },
  { key: 'warning', label: ru.legend.warning, swatch: styles.swatchWarning },
];

/** Пункты, которых не остаётся на полотне при выключенных интеграциях
 *  (см. overviewGraph.ts/stageGraph.ts): «система» есть только в OVERVIEW_ITEMS,
 *  фильтр по обоим уровням общий и просто не найдёт лишний ключ. */
const HIDDEN_WITHOUT_INTEGRATIONS = new Set(['integration', 'system']);

export function Legend() {
  const isOverview = useProcessStore((state) => state.currentStageId === null);
  const showIntegrations = useProcessStore((state) => state.showIntegrations);

  const items = (isOverview ? OVERVIEW_ITEMS : STAGE_ITEMS).filter(
    (item) => showIntegrations || !HIDDEN_WITHOUT_INTEGRATIONS.has(item.key),
  );

  return (
    <div className={styles.legend} role="group" aria-label={ru.legend.ariaLabel}>
      {items.map((item) => (
        <span key={item.key} className={styles.item}>
          <span className={`${styles.swatch} ${item.swatch}`} aria-hidden="true" />
          {item.label}
        </span>
      ))}
    </div>
  );
}
