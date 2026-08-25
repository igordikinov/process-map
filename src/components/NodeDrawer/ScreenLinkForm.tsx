// Форма ссылки на экран In.Plan — редактор (SPEC §4.4, артборд A5).
//
// В process.json поле screen не заполнено ни у одного из 103 узлов и заполнено
// не будет: ссылки попадают в приложение ТОЛЬКО через эту форму и живут в
// overrides localStorage (SPEC §3), которые накладывает src/data/loader.ts.
//
// Что здесь НЕ изобретается заново:
//   - валидация url — utils/url.ts::validateUrl (три различимых состояния:
//     valid / warning «http:» / invalid с reason);
//   - тексты ошибок — ru.screenLinkForm, ключи названы 1:1 по `reason`,
//     поэтому сопоставление ниже — просто таблица, без разбора строк;
//   - запись — loader.ts::setNodeOverride, где `null` означает «пользователь
//     удалил ссылку» (и это НЕ откат к значению из JSON);
//   - обновление экрана после записи — commitOverrides из hooks/useProcessMap.
//
// Форма написана руками, без библиотек форм (CLAUDE.md: новые зависимости
// только через задачу в bd).
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { setNodeOverride } from '../../data/loader';
import type { ScreenLink } from '../../data/schema';
import { commitOverrides } from '../../hooks/useProcessMap';
import { ru } from '../../i18n/ru';
import { validateUrl } from '../../utils/url';
import styles from './ScreenLinkForm.module.css';

/** SPEC §4.4: `title` обязателен и не длиннее 80 символов. */
export const TITLE_MAX_LENGTH = 80;

/**
 * Тексты по `reason` из validateUrl. Ключи совпадают с reason дословно —
 * если в utils/url.ts появится новый reason, TypeScript потребует текст здесь,
 * а не молча покажет пустую строку.
 */
const URL_MESSAGES = {
  empty: ru.screenLinkForm.urlEmpty,
  malformed: ru.screenLinkForm.urlMalformed,
  'unsupported-protocol': ru.screenLinkForm.urlUnsupportedProtocol,
  'insecure-protocol': ru.screenLinkForm.urlInsecureWarning,
} as const satisfies Record<string, string>;

export interface ScreenLinkFormProps {
  /** id узла, чей override правим (SPEC §3: overrides — Record<nodeId, …>). */
  nodeId: string;
  /** Текущая ссылка узла: undefined — форма добавления, объект — редактирование. */
  screen: ScreenLink | undefined;
  /** Закрыть форму: и «Отмена», и успешное сохранение, и удаление. */
  onClose: () => void;
}

export function ScreenLinkForm({ nodeId, screen, onClose }: ScreenLinkFormProps) {
  // Исходные значения — только стартовые: «Отмена» просто закрывает форму,
  // ничего не записав, поэтому откат к исходному состоянию получается сам
  // собой (в localStorage за время правки не попадает ни одного байта).
  const [title, setTitle] = useState<string>(screen?.title ?? '');
  const [url, setUrl] = useState<string>(screen?.url ?? '');

  // Ошибки показываются после первой попытки сохранить, а не с первого
  // нажатия клавиши: свежеоткрытая пустая форма, сразу красная от двух
  // ошибок, ругается на пользователя за то, чего он ещё не делал.
  // Предупреждение про http: — не ошибка, оно показывается сразу.
  const [submitted, setSubmitted] = useState(false);

  const titleRef = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const titleErrorId = useId();
  const titleCounterId = useId();
  const urlId = useId();
  const urlMessageId = useId();

  // Фокус в первое поле: форма открывается кнопкой «Добавить»/«Изменить»
  // уже внутри открытой панели, поэтому с фокусом панели (NodeDrawer) не
  // конфликтует — тот эффект отрабатывает при монтировании панели.
  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  const trimmedTitle = title.trim();
  const titleEmpty = trimmedTitle === '';
  const urlValidation = validateUrl(url);
  // SPEC §4.4: `warning` (http:) сохранять МОЖНО — блокирует только invalid.
  const canSave = !titleEmpty && urlValidation.status !== 'invalid';

  const showTitleError = submitted && titleEmpty;
  const showUrlError = submitted && urlValidation.status === 'invalid';
  const showUrlWarning = urlValidation.status === 'warning';
  // Текст берётся по `reason` без разбора строк: ключи ru.screenLinkForm
  // названы ровно так же (см. комментарий у URL_MESSAGES).
  const urlMessage =
    urlValidation.status === 'valid' ? undefined : URL_MESSAGES[urlValidation.reason];

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    setSubmitted(true);
    if (!canSave) {
      // Сохранение заблокировано: тексты ошибок покажет рендер ниже.
      return;
    }
    commitOverrides(() => setNodeOverride(nodeId, { title: trimmedTitle, url: url.trim() }));
    onClose();
  };

  const handleRemove = (): void => {
    // Именно setNodeOverride(id, null), а НЕ removeNodeOverride(id):
    // запись `{ screen: null }` — это «ссылка удалена пользователем», её
    // loader.ts не откатывает к значению из process.json. removeNodeOverride
    // означал бы «вернуть как было в JSON» и здесь был бы ошибкой.
    commitOverrides(() => setNodeOverride(nodeId, null));
    onClose();
  };

  return (
    <form
      className={styles.form}
      onSubmit={handleSubmit}
      noValidate
      aria-label={ru.screenLinkForm.ariaLabel}
    >
      <div className={styles.field}>
        <div className={styles.labelRow}>
          <label className={styles.label} htmlFor={titleId}>
            {ru.screenLinkForm.titleLabel}
          </label>
          {/* Счётчик символов — ограничение SPEC §4.4 (≤ 80) видно заранее. */}
          <span
            className={styles.counter}
            id={titleCounterId}
            title={ru.screenLinkForm.titleCounterHint(TITLE_MAX_LENGTH)}
          >
            {ru.screenLinkForm.titleCounter(title.length, TITLE_MAX_LENGTH)}
          </span>
        </div>
        <input
          ref={titleRef}
          id={titleId}
          className={showTitleError ? `${styles.input} ${styles.inputInvalid}` : styles.input}
          type="text"
          value={title}
          // maxLength — для браузера, slice — для гарантии: программная
          // подстановка значения (в том числе вставка из буфера в jsdom)
          // maxLength не соблюдает, а состояние длиннее 80 не должно
          // существовать вовсе — тогда и «слишком длинного» состояния,
          // которое надо было бы объяснять пользователю, не возникает.
          maxLength={TITLE_MAX_LENGTH}
          onChange={(event) => {
            setTitle(event.target.value.slice(0, TITLE_MAX_LENGTH));
          }}
          aria-invalid={showTitleError}
          aria-describedby={showTitleError ? `${titleCounterId} ${titleErrorId}` : titleCounterId}
        />
        {showTitleError && (
          <p className={styles.error} id={titleErrorId}>
            {ru.screenLinkForm.titleEmpty}
          </p>
        )}
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor={urlId}>
          {ru.screenLinkForm.urlLabel}
        </label>
        <input
          id={urlId}
          className={showUrlError ? `${styles.input} ${styles.inputInvalid}` : styles.input}
          type="text"
          inputMode="url"
          value={url}
          onChange={(event) => {
            setUrl(event.target.value);
          }}
          aria-invalid={showUrlError}
          aria-describedby={showUrlError || showUrlWarning ? urlMessageId : undefined}
        />
        {showUrlError && (
          <p className={styles.error} id={urlMessageId}>
            {urlMessage}
          </p>
        )}
        {/* Предупреждение — не ошибка: поле не краснеет, сохранение разрешено. */}
        {showUrlWarning && (
          <p className={styles.warning} id={urlMessageId}>
            {urlMessage}
          </p>
        )}
      </div>

      <div className={styles.actions}>
        {/* «Удалить ссылку» — только когда удалять есть что. */}
        {screen !== undefined && (
          <button type="button" className={styles.remove} onClick={handleRemove}>
            {ru.screenLinkForm.remove}
          </button>
        )}
        <button
          type="button"
          className={`${styles.button} ${styles.buttonSecondary}`}
          onClick={onClose}
        >
          {ru.screenLinkForm.cancel}
        </button>
        {/* Кнопка НЕ disabled при невалидных данных: заблокированная кнопка
            молчит о причине. Клик показывает тексты ошибок и не пишет
            override — «блокировка сохранения» из SPEC §4.4 сделана в
            handleSubmit, а не отключением кнопки. */}
        <button type="submit" className={`${styles.button} ${styles.buttonPrimary}`}>
          {ru.screenLinkForm.save}
        </button>
      </div>
    </form>
  );
}
