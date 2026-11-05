import { requestEditorAction } from '../../editor/guard';
import { writeStoredOverrides } from '../../data/loader';
import { replaceEditedMap } from '../../editor/commands';
import { readImportedRecovery } from '../../data/editorDraft';
import { DEFAULT_VERSION_ID } from '../../data/versions';
import { getImportReport, clearImportReport } from '../../data/activeMap';
import type { ProcessMap } from '../../data/schema';
import { downloadTextFile } from '../../utils/download';
// Экспорт полного документа, импорт, восстановление и явный сброс черновика.
import {
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type FocusEvent,
  type ReactElement,
} from 'react';
import { isImportedActive, setImportReport } from '../../data/activeMap';
import { bpmnToProcessMap } from '../../data/bpmn/adapter';
import { MAX_BPMN_BYTES, parseBpmnDocument } from '../../data/bpmn/xml';
import { getMergedProcessMap, loadBaseProcessMap, resetOverrides } from '../../data/loader';
import { applyImportedMap, revertToBuiltinMap } from '../../data/mapSwitch';
import { useProcessStore } from '../../store/useProcessStore';
import { commitOverrides } from '../../hooks/useProcessMap';
import { ru } from '../../i18n/ru';
import {
  exportFileName,
  parseImportedOverrides,
  serializeProcessMap,
} from '../../utils/processTransfer';
import styles from './EditorActions.module.css';

/**
 * Строка обратной связи рядом с кнопками. `kind` решает не только цвет, но и
 * ARIA-роль: ошибка перебивает чтение (`alert`), успех ждёт паузы (`status`).
 */
type MessageKind = 'error' | 'success';

interface Message {
  kind: MessageKind;
  text: string;
}

/**
 * Скачивание текста файлом. Обычный <a download> с Blob-URL: без
 * зависимостей и без сервера (приложение статическое, SPEC §6).
 * Ссылка добавляется в DOM — Firefox не реагирует на click() у элемента вне
 * документа. URL освобождается следующим тиком: сама загрузка стартует
 * синхронно на click(), но моментальный revokeObjectURL() в части браузеров
 * успевает обогнать её.
 */
export function EditorActions() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bpmnInputRef = useRef<HTMLInputElement>(null);
  const setImportReportOpen = useProcessStore((state) => state.setImportReportOpen);
  // Признак «показана не встроенная карта» перечитывается при каждом рендере:
  // подмена идёт через refreshProcessMap, который и вызывает рендер.
  const importedActive = isImportedActive();
  const resetRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  // «Вернуть фокус на „Сбросить правки“ после закрытия подтверждения» —
  // только для явных Отмена/Удалить. При уходе фокуса наружу возвращать его
  // нельзя: фокус уже там, куда его увёл пользователь.
  const returnFocusRef = useRef(false);
  const confirmQuestionId = useId();

  const [pendingMap, setPendingMap] = useState<ProcessMap | null>(null);
  const recovery = !importedActive ? readImportedRecovery(DEFAULT_VERSION_ID) : null;
  const [message, setMessage] = useState<Message | null>(null);
  const [resetArmed, setResetArmed] = useState(false);

  // Подтверждение обязано быть достижимо КЛАВИАТУРОЙ. Кнопка «Сбросить
  // правки» при взводе исчезает, и без этого фокус улетел бы на <body> —
  // до «Удалить» пришлось бы идти Tab'ом через всё полотно (в M1 такой
  // обход стоил 18 нажатий). Поэтому фокус переносится программно: до
  // «Удалить» ноль Tab'ов, до «Отмена» — один.
  useEffect(() => {
    if (resetArmed) {
      confirmRef.current?.focus();
    } else if (returnFocusRef.current) {
      returnFocusRef.current = false;
      resetRef.current?.focus();
    }
  }, [resetArmed]);

  /** Любое новое действие снимает предыдущий ответ и взведённое подтверждение. */
  const startAction = (): void => {
    setMessage(null);
    setPendingMap(null);
    setResetArmed(false);
  };

  const handleExport = (): void => {
    startAction();
    // Имя файла берётся из той же карты, которую сериализуем: иначе имя и
    // содержимое могли бы разойтись (process-map-3wh.13).
    const merged = getMergedProcessMap();
    downloadTextFile(exportFileName(merged), serializeProcessMap(merged));
  };

  const handleImportClick = (): void => {
    startAction();
    fileInputRef.current?.click();
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>): void => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    // Сброс значения обязателен: без него повторный выбор ТОГО ЖЕ файла не
    // даёт события change, и второй импорт молча не срабатывает.
    input.value = '';
    if (file === undefined) {
      return;
    }

    void file
      .text()
      .then((text) =>
        requestEditorAction(() => {
          const result = parseImportedOverrides(text, loadBaseProcessMap());
          if (result.status === 'rejected') {
            setMessage({ kind: 'error', text: ru.toolbar.importError });
            return;
          }
          /*
           * Файл исправной, но ДРУГОЙ карты (process-map-0c5.9). Раньше такого
           * исхода не было: карты жили на разных адресах. Теперь на одном адресе
           * две версии, и файл соседней даёт ноль совпадений по id узлов —
           * пользователь получал бы «файл принят, расхождений нет», то есть ему
           * сказали бы, что всё в порядке.
           */
          if (result.status === 'other-map') {
            setPendingMap(result.map);
            setMessage({
              kind: 'error',
              text:
                result.map.id !== loadBaseProcessMap().id
                  ? `${ru.toolbar.importOtherMap(result.mapId)}. ${ru.editor.differentMap}`
                  : ru.editor.differentMap,
            });
            return;
          }
          // Счётчик берётся у уже готового диффа, а не считается заново.
          const applied = Object.keys(result.overrides).length;
          replaceEditedMap(result.map);
          writeStoredOverrides(result.overrides);
          setMessage({
            kind: 'success',
            text:
              applied === 0
                ? serializeProcessMap(result.map) === serializeProcessMap(loadBaseProcessMap())
                  ? ru.toolbar.importNoChanges
                  : ru.editor.importApplied
                : ru.toolbar.importApplied(applied),
          });
        }),
      )
      .catch(() => {
        // Файл не удалось прочитать — для пользователя это то же событие
        // «файл не тот», отдельной строки владелец для него не давал.
        setMessage({ kind: 'error', text: ru.toolbar.importError });
      });
  };

  const handleImportBpmnClick = (): void => {
    startAction();
    bpmnInputRef.current?.click();
  };

  /**
   * Загрузка схемы BPMN.
   *
   * ВЕСЬ ПУТЬ В try/catch НЕ ИЗ ОСТОРОЖНОСТИ, А ПО НЕОБХОДИМОСТИ: error boundary
   * в приложении нет ни одного — App висит прямо под createRoot, и React 18 при
   * непойманном исключении размонтирует корень (см. useDeepLink.ts). Ошибка
   * разбора чужого файла убила бы приложение до белого экрана.
   */
  const handleBpmnFileChange = (event: ChangeEvent<HTMLInputElement>): void => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    // Тот же приём, что у импорта JSON: без сброса значения повторный выбор
    // ТОГО ЖЕ файла не даёт события change, и второй импорт молча не срабатывает.
    input.value = '';
    if (file === undefined) {
      return;
    }
    // Размер проверяется ДО чтения: File.size доступен сразу, и файл на
    // гигабайты отклоняется, не заняв памяти.
    if (file.size > MAX_BPMN_BYTES) {
      setMessage({ kind: 'error', text: ru.toolbar.importBpmnTooLarge });
      return;
    }

    void file
      .text()
      .then((text) =>
        requestEditorAction(() => {
          const parsed = parseBpmnDocument(text);
          if (parsed.status !== 'ok') {
            // Пять различимых исходов разбора дают одну строку — по образцу
            // решения владельца для JSON: «для пользователя это одно событие».
            // Подробности живут в отчёте, а не в строке тулбара.
            setMessage({ kind: 'error', text: ru.toolbar.importBpmnBadFile });
            return;
          }
          const result = bpmnToProcessMap(parsed.doc, {
            fileName: file.name,
            lastModified: file.lastModified,
          });
          if (result.status !== 'ok') {
            setImportReport(result.report);
            setImportReportOpen(true);
            setMessage({
              kind: 'error',
              text: ru.toolbar.importBpmnNoMap(result.report.blockers[0] ?? ''),
            });
            return;
          }
          setImportReport(result.report);
          applyImportedMap(result.map);
          setImportReportOpen(true);
          setMessage({
            kind: 'success',
            text: ru.toolbar.importBpmnApplied(
              result.map.stages.length,
              result.report.shownFlowNodes.shown,
              result.report.shownFlowNodes.inFile,
            ),
          });
        }),
      )
      .catch(() => {
        setMessage({ kind: 'error', text: ru.toolbar.importBpmnBadFile });
      });
  };

  const handleReturnToBuiltin = (): void => {
    startAction();
    setImportReportOpen(false);
    revertToBuiltinMap();
  };

  const handleResetArm = (): void => {
    setMessage(null);
    setPendingMap(null);
    setResetArmed(true);
  };

  const handleResetCancel = (): void => {
    returnFocusRef.current = true;
    setResetArmed(false);
  };

  const handleResetConfirm = (): void => {
    returnFocusRef.current = true;
    setResetArmed(false);
    commitOverrides(() => {
      resetOverrides();
    });
    // Отклик об успехе (process-map-4vn): раньше строка сообщения просто
    // очищалась, и сброс был единственным действием тулбара без ответа.
    setMessage({ kind: 'success', text: ru.toolbar.resetDone });
  };

  /**
   * Потеря фокуса группой подтверждения возвращает исходный вид. Переход
   * между «Удалить» и «Отмена» фокус из группы не выносит, поэтому проверяется
   * именно relatedTarget, а не сам факт blur.
   */
  const handleConfirmBlur = (event: FocusEvent<HTMLDivElement>): void => {
    const next = event.relatedTarget;
    if (next !== null && event.currentTarget.contains(next)) {
      return;
    }
    setResetArmed(false);
  };

  /**
   * `key` по виду сообщения — не косметика: при смене ошибки на успех (и
   * наоборот) React иначе переиспользовал бы тот же узел, поменяв ему role.
   * Живая область, у которой на месте сменили роль, скринридером не
   * перечитывается — сообщение бы нарисовалось, но не прозвучало.
   */
  const messageRow: ReactElement | null =
    message === null ? null : (
      <p
        key={message.kind}
        className={
          message.kind === 'error'
            ? `${styles.message} ${styles.messageError}`
            : `${styles.message} ${styles.messageSuccess}`
        }
        role={message.kind === 'error' ? 'alert' : 'status'}
      >
        {message.text}
      </p>
    );

  return (
    <>
      {messageRow}
      {pendingMap && (
        <button
          type="button"
          className={styles.button}
          onClick={() =>
            requestEditorAction(() => {
              clearImportReport();
              setImportReportOpen(false);
              applyImportedMap(pendingMap);
              startAction();
              setMessage({ kind: 'success', text: ru.editor.imported });
            })
          }
        >
          {ru.editor.openSeparate}
        </button>
      )}
      {recovery && (
        <button
          type="button"
          className={styles.button}
          onClick={() =>
            requestEditorAction(() => {
              clearImportReport();
              setImportReportOpen(false);
              applyImportedMap(recovery.base);
              replaceEditedMap(recovery.map);
              startAction();
            })
          }
        >
          {ru.editor.restore}
        </button>
      )}

      {/* ДВЕ ГРУППЫ, А НЕ ОДНА — и это не оформление.
          Сегментированная группа не переносится: у неё фиксированная высота и
          overflow:hidden. Тулбар переносит по группам (Toolbar.module.css), а
          группа шире контейнера просто уезжает за край, потому что ряд прижат
          вправо. С шестью кнопками в одном сегменте на 1024×600 с открытой
          панелью узла «Экспорт JSON» оказывался целиком за левым краем
          (x = −112) и не нажимался — ровно тот отказ, ради которого в
          Toolbar.module.css уже появились left + flex-wrap.
          Деление вышло по смыслу, а не по счёту: первая группа меняет ПРАВКИ
          текущей карты, вторая — КАКАЯ карта показана. */}
      <div className={styles.group}>
        <button
          type="button"
          className={styles.button}
          onClick={() => requestEditorAction(handleExport)}
        >
          {ru.toolbar.exportJson}
        </button>
        <button
          type="button"
          className={styles.button}
          onClick={() => requestEditorAction(handleImportClick)}
        >
          {ru.toolbar.importJson}
        </button>
        {/* Взведённое подтверждение — отдельная группа рядом, а не div внутри
            этой: вложенный контейнер сбил бы правило .button:last-of-type,
            которое убирает разделитель у последней кнопки сегмента. */}
        {!resetArmed && (
          <button
            ref={resetRef}
            type="button"
            className={styles.button}
            onClick={() => requestEditorAction(handleResetArm)}
          >
            {ru.toolbar.resetOverrides}
          </button>
        )}
        {/* Настоящий file input скрыт, его открывает кнопка выше: браузерная
            кнопка «Choose file» не стилизуется и не совпала бы с тулбаром.
            aria-hidden + tabIndex=-1 — чтобы в обходе Tab не появилось второго,
            невидимого элемента с тем же смыслом. */}
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          className={styles.fileInput}
          aria-hidden="true"
          tabIndex={-1}
          onChange={handleFileChange}
        />
      </div>

      {resetArmed && (
        // aria-labelledby на видимый вопрос, а не свой aria-label: имя группы
        // и текст на экране обязаны быть одной строкой, иначе они разъедутся
        // при следующей правке.
        <div
          className={styles.confirmGroup}
          role="group"
          aria-labelledby={confirmQuestionId}
          onBlur={handleConfirmBlur}
        >
          <span className={styles.confirmQuestion} id={confirmQuestionId}>
            {ru.toolbar.resetConfirm}
          </span>
          <button
            ref={confirmRef}
            type="button"
            className={`${styles.button} ${styles.confirmAccept}`}
            onClick={handleResetConfirm}
          >
            {ru.toolbar.resetConfirmAccept}
          </button>
          <button type="button" className={styles.button} onClick={handleResetCancel}>
            {ru.toolbar.resetConfirmCancel}
          </button>
        </div>
      )}

      {/* Вторая группа: какая карта показана. До первого импорта в ней одна
          кнопка — остальные две обещали бы действие, которому не к чему
          применяться. */}
      <div className={styles.group}>
        <button
          type="button"
          className={styles.button}
          onClick={() => requestEditorAction(handleImportBpmnClick)}
        >
          {ru.toolbar.importBpmn}
        </button>
        {importedActive && getImportReport() !== null && (
          <button
            type="button"
            className={styles.button}
            onClick={() => {
              startAction();
              setImportReportOpen(true);
            }}
          >
            {ru.toolbar.openImportReport}
          </button>
        )}
        {importedActive && (
          <button
            type="button"
            className={styles.button}
            onClick={() => requestEditorAction(handleReturnToBuiltin)}
          >
            {ru.toolbar.returnToBuiltin}
          </button>
        )}
        {/* Отдельный input, а не общий с JSON: accept разный, а общий потребовал
            бы состояния «какой импорт взведён» ради экономии восьми строк. */}
        <input
          ref={bpmnInputRef}
          type="file"
          accept=".bpmn,.xml,application/xml,text/xml"
          className={styles.fileInput}
          aria-hidden="true"
          tabIndex={-1}
          onChange={handleBpmnFileChange}
        />
      </div>
    </>
  );
}
