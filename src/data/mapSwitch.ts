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
 * ПОРЯДОК ОБЯЗАТЕЛЕН, и `resetLevel()` здесь не косметика.
 *
 * `currentStageId` в store — это id этапа ТЕКУЩЕЙ карты. В новой карте такого
 * этапа нет, и `StageDetail` при неизвестном этапе возвращает `null`. Крошки с
 * кнопкой «Назад» рендерятся НИЖЕ этого return, то есть на экране не осталось
 * бы ничего и выйти можно было бы только перезагрузкой.
 *
 * Вторая защита от того же тупика стоит в самом `StageDetail` — он возвращает
 * на корень сам. Две защиты, потому что причин попасть в это состояние может
 * оказаться больше, чем мы знаем сегодня.
 *
 * ИМЕННО `resetLevel()`, А НЕ `back()` (process-map-9mn.12). До трёх уровней
 * это было одно и то же. Теперь `back()` поднимает ровно на один уровень: с
 * уровня шагов он снимает только этап, и `currentModuleId` остался бы
 * указывать на модуль СТАРОЙ карты — та же ошибка, что с этапом, только
 * уровнем выше. Сбрасывать надо всё, что принадлежит уходящей карте, одним
 * вызовом.
 *
 * `resetLevel()` идёт ДО подмены: иначе между подменой и сбросом уровня
 * успевает пройти рендер с чужими `currentModuleId`/`currentStageId`.
 */
export function applyImportedMap(map: ProcessMap): void {
  useProcessStore.getState().resetLevel();
  setImportedMap(map);
  refreshProcessMap();
}

/**
 * Вернуться к карте, собранной на сборке.
 *
 * Правки загруженной карты при этом НЕ удаляются: они лежат в своём
 * пространстве ключей и переживут возврат. Повторная загрузка того же файла
 * вернёт и карту, и правки к ней.
 *
 * Уровень сбрасывается так же и по той же причине, что в applyImportedMap:
 * модуль и этап загруженной карты во встроенной не существуют.
 */
export function revertToBuiltinMap(): void {
  useProcessStore.getState().resetLevel();
  clearImportedMap();
  refreshProcessMap();
}
