// Размер фрейма приложения и признак компактного режима (SPEC §4.5, задача
// process-map-5l3).
//
// Триггер — высота КОНТЕЙНЕРА, а не окна. Приложение живёт в <iframe> внутри
// корпоративной вики (SPEC §6): высота iframe задаётся хостом и с
// window.innerHeight не связана никак — окно может быть 1440 px высотой, а
// врезка 480. Поэтому измеряется собственный корневой элемент экрана через
// ResizeObserver, а не `matchMedia('(max-height: …)')` и не resize окна.
//
// Хук возвращает callback-ref: элемент попадает в состояние, и наблюдение
// начинается ровно тогда, когда узел появился в DOM (обычный useRef не
// вызывает повторный эффект при смене узла, а экраны у нас размонтируются
// целиком при переходе между уровнями).
import { useCallback, useLayoutEffect, useState } from 'react';
import { config } from '../config';

export interface FrameSize {
  /** Ширина контейнера в px; 0 — ещё не измерен. */
  width: number;
  /** Высота контейнера в px; 0 — ещё не измерен. */
  height: number;
  /** SPEC §4.5: высота контейнера меньше config.compactHeight. */
  compact: boolean;
}

/**
 * Правило компактного режима одной чистой функцией — так его можно проверить
 * без рендера и без подмены геометрии в jsdom.
 *
 * `height <= 0` — НЕ компактный режим. Ноль означает «ещё не измерено»
 * (первый кадр, jsdom без layout), а не «низкий фрейм»; иначе приложение
 * стартовало бы компактным на любом экране и переключалось бы обратно уже
 * после первого ResizeObserver-колбэка — видимым скачком вёрстки.
 */
export function isCompactHeight(height: number): boolean {
  return height > 0 && height < config.compactHeight;
}

export interface UseFrameSizeResult extends FrameSize {
  /** Ref для корневого элемента экрана — его высота и решает (SPEC §4.5). */
  ref: (node: HTMLElement | null) => void;
}

export function useFrameSize(): UseFrameSizeResult {
  const [node, setNode] = useState<HTMLElement | null>(null);
  const [size, setSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });

  const ref = useCallback((next: HTMLElement | null) => {
    setNode(next);
  }, []);

  useLayoutEffect(() => {
    if (node === null) {
      return;
    }

    // Первое измерение — синхронно: ResizeObserver в некоторых браузерах
    // отдаёт первый колбэк уже после кадра, и экран успел бы моргнуть
    // некомпактной раскладкой.
    const read = () => {
      const rect = node.getBoundingClientRect();
      setSize((previous) =>
        previous.width === rect.width && previous.height === rect.height
          ? previous
          : { width: rect.width, height: rect.height },
      );
    };
    read();

    // ResizeObserver может отсутствовать (jsdom без полифилла) — это не повод
    // ронять экран: без него остаётся одно синхронное измерение выше.
    if (typeof ResizeObserver === 'undefined') {
      return;
    }
    const observer = new ResizeObserver(read);
    observer.observe(node);
    return () => {
      observer.disconnect();
    };
  }, [node]);

  return { ref, width: size.width, height: size.height, compact: isCompactHeight(size.height) };
}
