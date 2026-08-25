// Кнопки тулбара, доступные только в режиме «Редактор» (SPEC §4.4):
// «Экспорт JSON», «Импорт JSON», «Сбросить правки».
//
// Что здесь НЕ изобретается заново:
//   - полная слитая карта для экспорта — loader.ts::getMergedProcessMap();
//   - формат файла и разбор импорта — utils/processTransfer.ts (там же
//     разобрано, почему форматы экспорта и импорта в SPEC §3 расходятся и как
//     это примирено);
//   - запись и сброс — loader.ts::replaceOverrides()/resetOverrides();
//   - обновление экрана после записи — commitOverrides() из hooks/useProcessMap.
//     Писать в localStorage мимо него нельзя: карта не лежит в store, и без
//     commitOverrides открытые экраны остались бы со старыми данными.
//
// ОБРАБОТКА ОШИБОК ИМПОРТА. Битый JSON и «не тот файл» не должны ронять
// приложение — parseImportedOverrides() возвращает null, и мы просто ничего не
// пишем. Показать пользователю сообщение сейчас нельзя: утверждённой строки
// для него нет, а сочинять текст UI запрещено (CLAUDE.md). Поэтому отказ виден
// только в консоли — это диагностика для разработчика, а не строка интерфейса.
// Побочный эффект, о котором надо помнить: успешный импорт файла, идентичного
// базовому process.json, снаружи неотличим от отвергнутого файла — оба ничего
// не меняют на экране.
import { useRef, type ChangeEvent } from 'react';
import {
  getMergedProcessMap,
  loadBaseProcessMap,
  replaceOverrides,
  resetOverrides,
} from '../../data/loader';
import { commitOverrides } from '../../hooks/useProcessMap';
import { ru } from '../../i18n/ru';
import {
  EXPORT_FILE_NAME,
  parseImportedOverrides,
  serializeProcessMap,
} from '../../utils/processTransfer';
import styles from './EditorActions.module.css';

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

  const handleExport = (): void => {
    downloadTextFile(EXPORT_FILE_NAME, serializeProcessMap(getMergedProcessMap()));
  };

  const handleImportClick = (): void => {
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
          // См. шапку файла: строки UI для этого случая ещё нет.
          console.warn('Импорт JSON: файл не является картой процесса, правки не изменены');
          return;
        }
        commitOverrides(() => replaceOverrides(overrides));
      })
      .catch(() => {
        console.warn('Импорт JSON: файл не удалось прочитать, правки не изменены');
      });
  };

  const handleReset = (): void => {
    // Подтверждения нет намеренно: window.confirm потребовал бы строки, которой
    // в утверждённом наборе не существует. Вопрос вынесен владельцу процесса —
    // см. отчёт по process-map-6q0.
    commitOverrides(() => {
      resetOverrides();
    });
  };

  return (
    <div className={styles.group}>
      <button type="button" className={styles.button} onClick={handleExport}>
        {ru.toolbar.exportJson}
      </button>
      <button type="button" className={styles.button} onClick={handleImportClick}>
        {ru.toolbar.importJson}
      </button>
      <button type="button" className={styles.button} onClick={handleReset}>
        {ru.toolbar.resetOverrides}
      </button>
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
  );
}
