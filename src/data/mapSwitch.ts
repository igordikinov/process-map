// Подмена карты и возврат к встроенной (process-map-70e.8).
//
// ПОЧЕМУ ОТДЕЛЬНЫЙ ФАЙЛ, А НЕ ЧАСТЬ activeMap.ts. Здесь связываются три вещи:
// состояние активной карты, store уровней и снимок карты в useProcessMap. А
// useProcessMap импортирует loader, loader импортирует activeMap — положи эти
// две функции в activeMap, и получится кольцо. Состояние отдельно, действия
// отдельно, колец нет.
import { useProcessStore } from '../store/useProcessStore';
import { refreshProcessMap } from '../hooks/useProcessMap';
import { clearImportedMap, setImportedMap } from './activeMap';
import type { ProcessMap } from './schema';

/**
 * Показать загруженную карту.
 *
 * ПОРЯДОК ОБЯЗАТЕЛЕН, и `back()` здесь не косметика.
 *
 * `currentStageId` в store — это id этапа ТЕКУЩЕЙ карты. В новой карте такого
 * этапа нет, и `StageDetail` при неизвестном этапе возвращает `null`. Крошки с
 * кнопкой «Назад» рендерятся НИЖЕ этого return, то есть на экране не осталось
 * бы ничего и выйти можно было бы только перезагрузкой.
 *
 * Вторая защита от того же тупика стоит в самом `StageDetail` — он возвращает
 * на обзор сам. Две защиты, потому что причин попасть в это состояние может
 * оказаться больше, чем мы знаем сегодня.
 *
 * `back()` идёт ДО подмены: иначе между подменой и сбросом уровня успевает
 * пройти рендер с чужим `currentStageId`.
 */
export function applyImportedMap(map: ProcessMap): void {
  useProcessStore.getState().back();
  setImportedMap(map);
  refreshProcessMap();
}

/**
 * Вернуться к карте, собранной на сборке.
 *
 * Правки загруженной карты при этом НЕ удаляются: они лежат в своём
 * пространстве ключей и переживут возврат. Повторная загрузка того же файла
 * вернёт и карту, и правки к ней.
 */
export function revertToBuiltinMap(): void {
  useProcessStore.getState().back();
  clearImportedMap();
  refreshProcessMap();
}
