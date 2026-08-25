// Секция боковой панели узла (SPEC §4.3, артборд A3): заголовок-«эйбров»
// капслоком + содержимое. Отдельный компонент, потому что его используют и
// NodeDrawer (Входы/Выходы/Система/Ответственный), и ScreenLinkSection —
// дублировать разметку заголовка в двух модулях смысла нет.
import type { ReactNode } from 'react';
import styles from './Section.module.css';

export interface SectionProps {
  /** Текст заголовка. Все строки — из src/i18n/ru.ts. */
  title: string;
  /** `true` — зазор 6px как у полей «Система, модуль» / «Ответственный». */
  tight?: boolean;
  children: ReactNode;
}

export function Section({ title, tight = false, children }: SectionProps) {
  return (
    <section className={tight ? `${styles.section} ${styles.tight}` : styles.section}>
      {/* h3: заголовок панели (node.label) — h2, секции вложены в него. */}
      <h3 className={styles.title}>{title}</h3>
      {children}
    </section>
  );
}
