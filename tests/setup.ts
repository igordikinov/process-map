import { afterEach, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';

// ── Полифиллы окружения для React Flow (@xyflow/react) в jsdom ──────────────
//
// React Flow измеряет контейнер полотна через ResizeObserver и
// getBoundingClientRect, а jsdom не реализует layout: первого нет вовсе, второй
// всегда возвращает нули, и <ReactFlow> не монтируется.

class ResizeObserverMock implements ResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = ResizeObserverMock;
}

// Blob.prototype.text() — импорт JSON читает выбранный файл именно им
// (EditorActions.tsx). В браузерах метод есть с 2019 года, а jsdom 25 его так
// и не реализовал, оставив только FileReader: без полифилла любой тест импорта
// падал бы с «file.text is not a function», то есть на пробеле окружения, а не
// на поведении приложения. Полифилл достраивает ровно чтение текста и ничего
// в логике импорта не подменяет.
/**
 * Понадобился ли полифилл. Вычисляется ДО присваивания ниже, поэтому отвечает
 * на вопрос «умеет ли jsdom сам», а не «есть ли метод сейчас».
 *
 * За значением следит сторож в tests/blobTextPolyfill.test.ts: когда jsdom
 * реализует метод штатно, полифилл не установится, константа станет false и
 * сторож покраснеет с инструкцией удалить и его, и этот код (process-map-wu8).
 * Иначе мёртвый полифилл остался бы в проекте навсегда — заметку «при
 * обновлении jsdom проверить» проверять некому.
 */
export const blobTextPolyfilled = typeof Blob.prototype.text !== 'function';

if (blobTextPolyfilled) {
  Blob.prototype.text = function text(this: Blob): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.addEventListener('load', () => {
        resolve(String(reader.result));
      });
      reader.addEventListener('error', () => {
        reject(reader.error ?? new Error('FileReader: не удалось прочитать файл'));
      });
      reader.readAsText(this);
    });
  };
}

// DOMMatrixReadOnly нужен React Flow для разбора transform панорамирования.
if (typeof globalThis.DOMMatrixReadOnly === 'undefined') {
  class DOMMatrixReadOnlyMock {
    m22 = 1;
    constructor(transform?: string) {
      const match = /matrix\(([^)]+)\)/.exec(transform ?? '');
      if (match?.[1] !== undefined) {
        const parts = match[1].split(',').map((value) => Number(value.trim()));
        this.m22 = parts[3] ?? 1;
      }
    }
  }
  globalThis.DOMMatrixReadOnly = DOMMatrixReadOnlyMock as unknown as typeof DOMMatrixReadOnly;
}

// Размер подменяется ТОЛЬКО контейнеру полотна (.react-flow) и только на время
// теста. Глобальная безусловная подмена прототипа: (1) скрывала бы дефекты
// вроде pointer-events, (2) сломала бы useFrameSize в M4 — порог compactHeight
// (SPEC §4.5) никогда бы не сработал, потому что любой элемент отдавал бы 668.
const CANVAS_SELECTOR = '.react-flow';
const CANVAS_WIDTH = 1280;
// Рабочая область артборда A1: 720 минус шапка 52.
const CANVAS_HEIGHT = 668;

const originalGetBoundingClientRect = Element.prototype.getBoundingClientRect;

beforeEach(() => {
  Element.prototype.getBoundingClientRect = function getBoundingClientRect(this: Element): DOMRect {
    if (this.matches(CANVAS_SELECTOR)) {
      return {
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        right: CANVAS_WIDTH,
        bottom: CANVAS_HEIGHT,
        width: CANVAS_WIDTH,
        height: CANVAS_HEIGHT,
        toJSON: () => ({}),
      } as DOMRect;
    }
    return originalGetBoundingClientRect.call(this);
  };
});

afterEach(() => {
  Element.prototype.getBoundingClientRect = originalGetBoundingClientRect;
});
