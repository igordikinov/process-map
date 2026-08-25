// Секция «Экран в системе» боковой панели узла (SPEC §4.3).
//
// В process.json поле screen не заполнено НИ У ОДНОГО узла: ссылки появляются
// только через редактор (M3, SPEC §4.4) и живут в overrides localStorage,
// которые накладывает src/data/loader.ts. Поэтому состояние «ссылка не задана»
// здесь — норма, а не крайний случай.
import { iconUrl } from '../../assets/icons';
import type { ProcessNode } from '../../data/schema';
import { ru } from '../../i18n/ru';
import { useProcessStore } from '../../store/useProcessStore';
import { Section } from './Section';
import styles from './ScreenLinkSection.module.css';

// Путь считает сборщик, а не строка в рантайме (см. src/assets/icons/index.ts).
const LINK_EXTERNAL_ICON = iconUrl('link-external');

export interface ScreenLinkSectionProps {
  node: ProcessNode;
}

export function ScreenLinkSection({ node }: ScreenLinkSectionProps) {
  const mode = useProcessStore((state) => state.mode);
  const screen = node.screen;

  return (
    <Section title={ru.drawer.screenSection}>
      {screen === undefined ? (
        <div className={styles.empty}>
          <span className={styles.emptyText}>{ru.drawer.screenEmpty}</span>
          {/* SPEC §4.3: action «Добавить» — только в режиме редактора. */}
          {mode === 'edit' && (
            // ЗАГЛУШКА без обработчика: форма ссылки (ScreenLinkForm, артборд
            // A5) — задача process-map-0sb (M3, SPEC §4.4). Своя форма здесь
            // разошлась бы с валидацией и записью overrides из той задачи.
            <button type="button" className={styles.add}>
              {ru.drawer.screenAdd}
            </button>
          )}
        </div>
      ) : (
        // title на всю строку: и заголовок, и url усекаются многоточием,
        // полное значение доступно наведением.
        <div className={styles.row} title={ru.drawer.screenHint(screen.title, screen.url)}>
          <img className={styles.icon} src={LINK_EXTERNAL_ICON} alt="" />
          <span className={styles.title}>{screen.title}</span>
          <span className={styles.url}>{screen.url}</span>
        </div>
      )}
    </Section>
  );
}
