// Реактивный доступ к слитой карте процесса (SPEC §3 «Overrides», §4.4).
//
// ЗАЧЕМ ЭТОТ МОДУЛЬ ВООБЩЕ НУЖЕН
// ------------------------------
// ProcessMap намеренно НЕ лежит в zustand-store (см. шапку
// src/store/useProcessStore.ts): единственный источник истины — src/data/loader.ts,
// который каждый раз заново читает process.json и накладывает overrides из
// localStorage. Плата за это — отсутствие реактивности: после
// setNodeOverride() ни один подписчик store не сработает, а компоненты,
// звавшие `useMemo(() => loadProcessMap(), [])`, продолжат показывать карту,
// снятую при монтировании.
//
// Здесь это чинится ОДИН раз и в ОДНОМ месте — маленьким внешним стором
// поверх loader.ts:
//   - `useProcessMap()` подписывает компонент на карту через
//     useSyncExternalStore (штатный механизм React 18 для внешних источников);
//   - `refreshProcessMap()` перечитывает карту у loader.ts и будит подписчиков;
//   - `commitOverrides(write)` связывает запись и обновление, чтобы «записал,
//     но забыл обновить» было невозможно написать случайно.
//
// Два источника истины при этом не появляются: снимок здесь — КЭШ результата
// loader.ts, а не независимое состояние. Его нельзя изменить иначе как
// перечитав loader.ts целиком, поэтому разъехаться ему не с чем.
//
// Тем же механизмом пользуется экспорт/импорт и «Сбросить правки»
// (process-map-6q0): `commitOverrides(() => replaceOverrides(imported))` и
// `commitOverrides(() => { resetOverrides(); })` обновят экран без своей
// проводки — писать в localStorage мимо commitOverrides не нужно никому.
import { useSyncExternalStore } from 'react';
import { loadProcessMap } from '../data/loader';
import type { ProcessMap } from '../data/schema';

// Снимок общий на весь модуль: карта одна на приложение, и два экрана
// (Overview/StageDetail) обязаны видеть одни и те же данные.
// null — «ещё не читали»: ленивое первое чтение оставляет разбор zod на момент
// первого рендера, как было с useMemo, а не на импорт модуля.
let snapshot: ProcessMap | null = null;

const listeners = new Set<() => void>();

// useSyncExternalStore требует, чтобы getSnapshot возвращал СТАБИЛЬНУЮ ссылку,
// пока данные не изменились: новый объект на каждый вызов даёт бесконечный
// цикл рендера. Поэтому карта кэшируется и заменяется только в
// refreshProcessMap().
function getSnapshot(): ProcessMap {
  if (snapshot === null) {
    snapshot = loadProcessMap();
  }
  return snapshot;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Перечитывает карту из loader.ts и уведомляет подписчиков.
 *
 * Вызывать ПОСЛЕ любой записи overrides. Прямой вызов нужен там, где запись
 * сделал не мы (например, событие `storage` из соседней вкладки); в обычном
 * коде предпочтительнее commitOverrides — он не даёт забыть про обновление.
 */
export function refreshProcessMap(): void {
  snapshot = loadProcessMap();
  for (const listener of listeners) {
    listener();
  }
}

/**
 * Выполняет запись overrides и синхронно обновляет карту для всех подписчиков.
 * Возвращает то же, что вернула сама запись (loader.ts отдаёт новые overrides
 * или признак успеха записи).
 */
export function commitOverrides<T>(write: () => T): T {
  const result = write();
  refreshProcessMap();
  return result;
}

/** Слитая карта (process.json + overrides). Перерисовывает компонент при правках. */
export function useProcessMap(): ProcessMap {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
