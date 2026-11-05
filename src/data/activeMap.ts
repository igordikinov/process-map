// Активная загруженная карта живёт в сессии. loader/editorDraft отдельно
// сохраняют восстановление; после перезагрузки встроенная карта открывается первой.
import type { BpmnReport } from './bpmn/report';
import type { ProcessMap } from './schema';

let imported: ProcessMap | null = null;

/*
 * Отчёт разбора живёт РЯДОМ С КАРТОЙ и ровно столько же.
 *
 * Он описывает не приложение, а конкретную загруженную схему: что из неё
 * показано и что потеряно. Отдельно от карты он мгновенно превратился бы в
 * ложь — отчёт от прошлого файла поверх нынешней карты.
 */
let report: BpmnReport | null = null;

/** Показать загруженную карту вместо встроенной. */
export function setImportedMap(map: ProcessMap): void {
  imported = map;
}

/** Вернуться к встроенной карте. */
export function clearImportedMap(): void {
  imported = null;
  report = null;
}

/** Загруженная карта или `null`, если показывается встроенная. */
export function getImportedMap(): ProcessMap | null {
  return imported;
}

/**
 * Показывается ли сейчас загруженная карта.
 *
 * Нужно интерфейсу: заголовок сменился бы и при переходе на вторую встроенную
 * карту, поэтому признаком подмены он служить не может — нужен явный.
 */
export function isImportedActive(): boolean {
  return imported !== null;
}

export function setImportReport(value: BpmnReport): void {
  report = value;
}

export function getImportReport(): BpmnReport | null {
  return report;
}

export function clearImportReport(): void {
  report = null;
}
