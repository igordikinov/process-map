// Панель отчёта импорта BPMN (process-map-70e.9).
//
// ЗАЧЕМ ОНА. Карта показывает не всю схему: на модели владельца видно 314 узлов
// потока из 911, остальное скрыто за карточками свёрнутых подпроцессов. Это ровно
// то, чего пользователь не ожидает, и без отчёта карта врала бы умолчанием.
//
// ПОЧЕМУ ПАНЕЛЬ, А НЕ МОДАЛКА. Модальных окон в этом приложении нет вовсе:
// приложение живёт в <iframe> вики, и при sandbox без allow-modals браузер
// подавляет диалог МОЛЧА — вызов возвращает false, ошибки не происходит. Это уже
// ловили на _top-навигации (process-map-6ap) и на подтверждении сброса правок.
//
// ЧЕМ ОТЛИЧАЕТСЯ ОТ NodeDrawer, чей вид она повторяет: тот монтируется только в
// StageDetail и позиционируется внутри полотна, а отчёт обязан пережить переход
// на уровень 2. Поэтому монтируется в App.tsx и позиционируется fixed. Токены
// общие с панелью узла — две панели должны читаться как одна система.
import { useEffect } from 'react';
import { iconUrl } from '../../assets/icons';
import { getImportReport } from '../../data/activeMap';
import type { LossReason } from '../../data/bpmn/report';
import { ru } from '../../i18n/ru';
import { useProcessStore } from '../../store/useProcessStore';
import styles from './ImportReport.module.css';

const CLOSE_ICON = iconUrl('x-close');

export function ImportReport() {
  const open = useProcessStore((state) => state.importReportOpen);
  const setOpen = useProcessStore((state) => state.setImportReportOpen);
  const report = getImportReport();

  // Esc закрывает панель — как у панели узла. Слушатель вешается только когда
  // панель открыта: иначе он перехватывал бы Esc у всего приложения.
  useEffect(() => {
    if (!open) {
      return undefined;
    }
    const onKeyDown = (event: globalThis.KeyboardEvent): void => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, setOpen]);

  if (!open || report === null) {
    return null;
  }

  const { source, shownFlowNodes, stages, skippedModules, losses, blockers } = report;

  return (
    <aside
      className={styles.panel}
      /* aria-modal НЕ ставим — панель немодальна по замыслу: полотно под ней
         остаётся живым, и утверждать обратное значило бы врать скринридеру.
         То же решение, что у NodeDrawer (process-map-9ji). */
      role="dialog"
      aria-label={ru.importReport.title}
    >
      <header className={styles.header}>
        <h2 className={styles.title}>{ru.importReport.title}</h2>
        <button
          type="button"
          className={styles.close}
          onClick={() => {
            setOpen(false);
          }}
          aria-label={ru.importReport.close}
          title={ru.importReport.close}
        >
          <img className={styles.closeIcon} src={CLOSE_ICON} alt="" />
        </button>
      </header>

      <div className={styles.content}>
        {blockers.length > 0 && (
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>{ru.importReport.blockers}</h3>
            <ul className={styles.list}>
              {blockers.map((text) => (
                <li className={styles.item} key={text}>
                  {text}
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* ГЛАВНЫЙ РАЗДЕЛ, и он идёт первым. Доля печатается только со
            знаменателем: «показано 33%» читается совсем не так, как
            «314 из 911», а голый процент из отчёта достать нечем — там пара. */}
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>{ru.importReport.density}</h3>
          <p className={styles.headline}>
            {ru.importReport.densityHeadline(shownFlowNodes.shown, shownFlowNodes.inFile)}
          </p>
          <p className={styles.hint}>{ru.importReport.densityHint}</p>
        </section>

        {stages.length > 0 && (
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>{ru.importReport.stages}</h3>
            <ul className={styles.list}>
              {stages.map((stage) => (
                <li className={styles.item} key={stage.stageId}>
                  <span className={styles.itemTitle}>{stage.title}</span>
                  <span className={styles.itemMeta}>
                    {ru.importReport.stageNodes(stage.nodes)} ·{' '}
                    {ru.importReport.stageEdges(stage.edges)}
                    {stage.belowLevel > 0
                      ? ` · ${ru.importReport.stageHidden(stage.belowLevel)}`
                      : ''}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {skippedModules.length > 0 && (
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>{ru.importReport.skipped}</h3>
            <p className={styles.hint}>{ru.importReport.skippedHint}</p>
            <ul className={styles.list}>
              {skippedModules.map((module) => (
                <li className={styles.item} key={module.sourceId}>
                  {module.name}
                </li>
              ))}
            </ul>
          </section>
        )}

        {losses.length > 0 && (
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>{ru.importReport.losses}</h3>
            <ul className={styles.list}>
              {losses.map((bucket) => (
                <li className={styles.item} key={bucket.reason}>
                  <span className={styles.itemTitle}>
                    {ru.importReport.loss[bucket.reason as LossReason]} — {bucket.count}
                  </span>
                  {/* ПРИМЕРЫ ОБЯЗАТЕЛЬНЫ, а не украшение. Число само по себе
                      нечинимо: «заметка ни к чему не привязана — 14» не
                      говорит, КАКАЯ заметка. Поэтому у каждого примера стоит
                      sourceId — по нему объект находится в Camunda Modeler
                      (report.ts, LossItem).

                      Безымянный элемент печатается ОДНИМ id, без заглушки
                      «без названия»: в вёдрах «рамка без названия» и «заметка
                      ни к чему не привязана» безымянны все примеры до одного,
                      и восемь одинаковых заглушек подряд лишь прятали бы те
                      строки, где имя есть. Что имени нет, уже сказано в
                      заголовке ведра. */}
                  <ul className={styles.samples}>
                    {bucket.samples.map((sample) => (
                      <li className={styles.sample} key={sample.sourceId}>
                        {sample.sourceName !== '' && (
                          <span className={styles.sampleName}>{sample.sourceName}</span>
                        )}
                        <span className={styles.sampleMeta}>
                          {sample.moduleName === ''
                            ? sample.sourceId
                            : `${sample.moduleName} · ${sample.sourceId}`}
                        </span>
                      </li>
                    ))}
                  </ul>
                  {/* Флаг complete не косметика: без него десять примеров
                      читались бы как «вот и всё» — та же тихая потеря, только
                      этажом выше, уже внутри отчёта. */}
                  {!bucket.complete && (
                    <span className={styles.itemMeta}>
                      {ru.importReport.lossMore(bucket.count - bucket.samples.length)}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>{ru.importReport.source}</h3>
          <dl className={styles.facts}>
            <dt className={styles.factName}>{ru.importReport.sourceFile}</dt>
            <dd className={styles.factValue}>{source.fileName}</dd>
            {source.exporter !== '' && (
              <>
                <dt className={styles.factName}>{ru.importReport.sourceExporter}</dt>
                <dd className={styles.factValue}>{source.exporter}</dd>
              </>
            )}
            <dt className={styles.factName}>{ru.importReport.sourcePlanes}</dt>
            <dd className={styles.factValue}>{source.planes}</dd>
            <dt className={styles.factName}>{ru.importReport.sourceElements}</dt>
            <dd className={styles.factValue}>{source.elements}</dd>
          </dl>
        </section>
      </div>
    </aside>
  );
}
