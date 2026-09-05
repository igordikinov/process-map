// Кнопки тулбара, доступные только в режиме «Редактор» (SPEC §4.4):
// «Экспорт JSON», «Импорт JSON», «Сбросить правки» — плюс обратная связь для
// двух действий, которые раньше молчали (process-map-ygd).
//
// Что здесь НЕ изобретается заново:
//   - полная слитая карта для экспорта — loader.ts::getMergedProcessMap();
//   - формат файла и разбор импорта — utils/processTransfer.ts (там же
//     разобрано, почему форматы экспорта и импорта в SPEC §3 расходятся и как
//     это примирено);
//   - запись и сброс — loader.ts::replaceOverrides()/resetOverrides();
//   - обновление экрана после записи — commitOverrides() из hooks/useProcessMap.
//     Писать в localStorage мимо него нельзя: карта не лежит в store, и без
//     commitOverrides открытые экраны остались бы со старыми данными;
//   - число применённых ссылок — размер overrides, которые вернул
//     parseImportedOverrides(); он уже посчитан диффом против базовой карты,
//     второго прохода по данным здесь нет.
//
// ОБРАТНАЯ СВЯЗЬ ИМПОРТА. Раньше непринятый файл уходил в console.warn, и
// снаружи успешный импорт файла, совпадающего с базовым, был неотличим от
// отвергнутого — оба ничего не меняли на экране. Теперь у обоих исходов есть
// видимая строка (тексты — ru.toolbar, даны владельцем дословно), причём у
// «принят, но расхождений нет» — своя, а не «Применено ссылок: 0».
//
// ПОДТВЕРЖДЕНИЕ СБРОСА — ДВУХШАГОВАЯ КНОПКА, А НЕ window.confirm.
// Приложение живёт в <iframe> вики (README, «Встраивание в In.Plan»). При
// sandbox без allow-modals браузер подавляет confirm() МОЛЧА — диалог не
// показывается, вызов возвращает false, и никакой ошибки не происходит. В
// такой конфигурации confirm-подтверждение либо не спросило бы вообще, либо
// (при обратном значении по умолчанию) пропустило бы сброс без вопроса. Это
// ровно тот же тихий отказ, который уже поймали на _top-навигации
// (process-map-6ap), поэтому modals в этом приложении не используются вовсе.
// Собственная модалка ради одного вопроса — несоразмерно; владелец выбрал
// двухшаговую кнопку.
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
import {
  getMergedProcessMap,
  loadBaseProcessMap,
  replaceOverrides,
  resetOverrides,
} from '../../data/loader';
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
function downloadTextFile(fileName: string, text: string): void {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  globalThis.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 0);
}

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
      .then((text) => {
        const overrides = parseImportedOverrides(text, loadBaseProcessMap());
        if (overrides === null) {
          setMessage({ kind: 'error', text: ru.toolbar.importError });
          return;
        }
        // Счётчик берётся у уже готового диффа, а не считается заново.
        const applied = Object.keys(overrides).length;
        commitOverrides(() => replaceOverrides(overrides));
        setMessage({
          kind: 'success',
          text: applied === 0 ? ru.toolbar.importNoChanges : ru.toolbar.importApplied(applied),
        });
      })
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
      .then((text) => {
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
      })
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
        <button type="button" className={styles.button} onClick={handleExport}>
          {ru.toolbar.exportJson}
        </button>
        <button type="button" className={styles.button} onClick={handleImportClick}>
          {ru.toolbar.importJson}
        </button>
        {/* Взведённое подтверждение — отдельная группа рядом, а не div внутри
            этой: вложенный контейнер сбил бы правило .button:last-of-type,
            которое убирает разделитель у последней кнопки сегмента. */}
        {!resetArmed && (
          <button ref={resetRef} type="button" className={styles.button} onClick={handleResetArm}>
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
        <button type="button" className={styles.button} onClick={handleImportBpmnClick}>
          {ru.toolbar.importBpmn}
        </button>
        {importedActive && (
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
          <button type="button" className={styles.button} onClick={handleReturnToBuiltin}>
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
