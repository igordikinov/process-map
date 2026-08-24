import '@testing-library/jest-dom/vitest';

// ── Полифиллы окружения для React Flow (@xyflow/react) в jsdom ──────────────
//
// React Flow измеряет контейнер полотна и узлы через ResizeObserver и
// getBoundingClientRect. В jsdom первого нет вовсе, второй всегда возвращает
// нули — без обоих моков падает любой тест, который монтирует <ReactFlow>.
// Файл общий для всех тестов намеренно: полотно рендерится и в App.test.tsx,
// и будет рендериться в тестах уровня 2 (M2).

class ResizeObserverMock implements ResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = ResizeObserverMock;
}

// jsdom не реализует layout, поэтому размеры задаются константой. Значения —
// рабочая область артборда A1 (1280 × 720 минус шапка 52), чтобы fitView
// считал осмысленный зум.
const MOCK_WIDTH = 1280;
const MOCK_HEIGHT = 668;

Element.prototype.getBoundingClientRect = function getBoundingClientRect(): DOMRect {
  return {
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: MOCK_WIDTH,
    bottom: MOCK_HEIGHT,
    width: MOCK_WIDTH,
    height: MOCK_HEIGHT,
    toJSON: () => ({}),
  } as DOMRect;
};

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
