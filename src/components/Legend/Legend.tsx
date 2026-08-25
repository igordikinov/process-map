// Легенда полотна: линия процесса, интеграция, типы узлов (макет — левый
// нижний угол артбордов A1/A2, SPEC §4.6 упоминает её местом в тулбаре).
// Чистая презентационная панель — без состояния, без обращения к store и
// без React Flow: цвета берутся напрямую из токенов, совпадающих с теми, что
// красят ProcessEdge/IntegrationEdge/WarningNode (см. Legend.module.css).
//
// Рендерится сиблингом <ReactFlow>, не ребёнком — см. подробное объяснение
// в Toolbar.tsx (та же причина: не засорять `.react-flow` лишними DOM-узлами
// ради тестов, которые считают кнопки/фокусируемые элементы внутри него).
// Легенде это ещё и не нужно: она не использует хуки React Flow.
//
// Компактный режим (SPEC §4.5) сворачивает легенду в кнопку-иконку
// (design/*.dc.html, артборд A4, assets/icons/tables.svg) — задача M4.
// Здесь заложена только точка расширения: ITEMS ниже не завязан на разметку
// панели, поэтому M4 сможет переиспользовать список для содержимого
// свёрнутой кнопки/поповера, не трогая этот компонент. Сама логика
// «высота контейнера < config.compactHeight» не реализуется в этой задаче.
import { ru } from '../../i18n/ru';
import styles from './Legend.module.css';

const ITEMS = [
  { key: 'step', label: ru.legend.step, bar: styles.barStep },
  { key: 'data', label: ru.legend.data, bar: styles.barData },
  { key: 'integration', label: ru.legend.integration, bar: styles.barIntegration },
  { key: 'warning', label: ru.legend.warning, bar: styles.barWarning },
] as const;

export function Legend() {
  return (
    <div className={styles.legend} role="group" aria-label={ru.legend.ariaLabel}>
      {ITEMS.map((item) => (
        <span key={item.key} className={styles.item}>
          <span className={`${styles.bar} ${item.bar}`} aria-hidden="true" />
          {item.label}
        </span>
      ))}
    </div>
  );
}
