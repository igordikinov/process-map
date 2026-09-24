// Переключение версии карты (process-map-0c5.6).
//
// ПОЧЕМУ ОТДЕЛЬНЫЙ ФАЙЛ, А НЕ ЧАСТЬ versions.ts — та же причина, по которой
// существует mapSwitch.ts рядом с activeMap.ts: здесь связываются состояние
// версии, store уровней и снимок карты в useProcessMap, а useProcessMap
// импортирует loader, loader импортирует versions. Положи это действие в
// versions.ts — получится кольцо. Состояние отдельно, действия отдельно.
import { useProcessStore } from '../store/useProcessStore';
import { refreshProcessMap } from '../hooks/useProcessMap';
import { clearImportedMap, isImportedActive } from './activeMap';
import { getSelectedVersionId, hasVersion, setSelectedVersionId } from './versions';

/**
 * Показать другую версию карты.
 *
 * ПОРЯДОК ОБЯЗАТЕЛЕН, и `back()` здесь не косметика — довод дословно тот же,
 * что в mapSwitch.ts::applyImportedMap: `currentStageId` это id этапа ТЕКУЩЕЙ
 * версии, в другой такого этапа нет, а `StageDetail` при неизвестном этапе
 * возвращает `null` — и крошки с кнопкой «Назад» рендерятся НИЖЕ этого return.
 * На экране не осталось бы ничего.
 *
 * `back()` идёт ДО подмены: иначе между подменой и сбросом уровня успевает
 * пройти рендер с чужим `currentStageId`.
 *
 * `clearImportedMap()` — честное прочтение действия «показать эту встроенную
 * версию»: пока поверх лежит файл пользователя, показана не версия. Интерфейс
 * до этого пути не доводит (при загруженной схеме переключатель не рисуется),
 * но если однажды доведёт — сделает понятное, а не молча ничего.
 *
 * Возвращает false, если версии с таким id в этом бандле нет: значение
 * приходит в том числе из адреса, и битый параметр не должен ничего менять.
 */
export function selectVersion(id: string): boolean {
  if (!hasVersion(id)) {
    return false;
  }
  if (id === getSelectedVersionId() && !isImportedActive()) {
    return true;
  }
  // Проверка выше не меняет ничего именно затем, чтобы подмена шла ПОСЛЕ back().
  useProcessStore.getState().back();
  setSelectedVersionId(id);
  clearImportedMap();
  refreshProcessMap();
  return true;
}
