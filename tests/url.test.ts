// Открытие ссылок и валидация URL (SPEC §4.8, §4.4; задача process-map-6mi).
//
// SPEC §4.8 прямо требует покрыть ОБА пути openScreen: обычный (`window.top`
// доступен, целимся в `_top`) и фолбэк (`window.top` недоступен → `_blank`).
// Второй путь — не экзотика: в проде приложение живёт в iframe на чужом домене
// (SPEC §6), и без фолбэка ссылка там просто не откроется.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { config } from '../src/config';
import { openScreen, validateUrl } from '../src/utils/url';

const URL_OK = 'https://example.com/plan';

/** Исключение, которое браузер бросает при обращении к чужому origin. */
function securityError(): DOMException {
  return new DOMException(
    'Blocked a frame with origin from accessing a cross-origin frame.',
    'SecurityError',
  );
}

/**
 * Подменяет `window.top` на время теста.
 *
 * `configurable: true` обязателен: иначе второй тест не сможет переопределить
 * свойство обратно. Возврат исходного поведения — в afterEach через delete:
 * `window.top` — унаследованный геттер прототипа, собственного свойства у
 * объекта окна изначально нет.
 */
function stubTop(descriptor: PropertyDescriptor): void {
  Object.defineProperty(window, 'top', { configurable: true, ...descriptor });
}

const originalLinkTarget = config.linkTarget;

/** Шпион вместо window.open. Отдельная фабрика — чтобы вывести его тип. */
function createOpenSpy() {
  return vi.fn<(url: string, target: string) => Window | null>(() => null);
}

let openSpy: ReturnType<typeof createOpenSpy>;

beforeEach(() => {
  // window.open в jsdom не реализован (пишет «Not implemented» в консоль),
  // поэтому в тестах он всегда подменён — заодно это единственный способ
  // увидеть, с каким target его позвали.
  openSpy = createOpenSpy();
  Object.defineProperty(window, 'open', { configurable: true, writable: true, value: openSpy });
});

afterEach(() => {
  config.linkTarget = originalLinkTarget;
  delete (window as { top?: unknown }).top;
  vi.restoreAllMocks();
});

describe('openScreen', () => {
  it('открывает в _top, когда window.top доступен', () => {
    config.linkTarget = '_top';
    // Штатный jsdom: window.top — само окно, document читается свободно.
    expect(window.top?.document).toBeDefined();

    openScreen(URL_OK);

    expect(openSpy).toHaveBeenCalledTimes(1);
    expect(openSpy).toHaveBeenCalledWith(URL_OK, '_top');
  });

  // Ровно тот случай, ради которого фолбэк и написан: iframe на чужом домене.
  // Обращение к window.top при этом НЕ бросает (top в белом списке кросс-
  // доменного WindowProxy) — бросает первое обращение к document.
  it('фолбэк на _blank, когда document верхнего окна кидает SecurityError', () => {
    config.linkTarget = '_top';
    const crossOrigin = {
      get document(): Document {
        throw securityError();
      },
    } as unknown as Window;
    stubTop({ get: () => crossOrigin });

    openScreen(URL_OK);

    expect(openSpy).toHaveBeenCalledWith(URL_OK, '_blank');
  });

  // Второй способ получить ту же недоступность: некоторые движки бросают уже
  // на самом обращении к window.top.
  it('фолбэк на _blank, когда обращение к window.top кидает SecurityError', () => {
    config.linkTarget = '_top';
    stubTop({
      get: () => {
        throw securityError();
      },
    });

    openScreen(URL_OK);

    expect(openSpy).toHaveBeenCalledWith(URL_OK, '_blank');
  });

  it('фолбэк на _blank, когда window.top === null (окно отсоединено)', () => {
    config.linkTarget = '_top';
    stubTop({ get: () => null });

    openScreen(URL_OK);

    expect(openSpy).toHaveBeenCalledWith(URL_OK, '_blank');
  });

  // Фолбэк касается только '_top': при явном '_blank' проверять верхнее окно
  // незачем, и подмена target была бы отсебятиной.
  it('при linkTarget _blank открывает в _blank и не трогает window.top', () => {
    config.linkTarget = '_blank';
    const top = vi.fn(() => {
      throw securityError();
    });
    stubTop({ get: top });

    openScreen(URL_OK);

    expect(openSpy).toHaveBeenCalledWith(URL_OK, '_blank');
    expect(top).not.toHaveBeenCalled();
  });

  it('возвращает то, что вернул window.open, и не пытается открыть повторно', () => {
    config.linkTarget = '_top';
    // null от window.open = блокировщик всплывающих окон (или успешное
    // открытие с noopener). Повторная попытка открыла бы вторую вкладку.
    expect(openScreen(URL_OK)).toBeNull();
    expect(openSpy).toHaveBeenCalledTimes(1);

    const opened = {} as Window;
    openSpy.mockReturnValue(opened);
    expect(openScreen(URL_OK)).toBe(opened);
  });

  // screen.url приезжает из overrides в localStorage (SPEC §3) — то есть из
  // данных, которые может подменить кто угодно. javascript: в '_top' выполнил
  // бы скрипт в контексте страницы-хозяина (SPEC §6, iframe на чужом домене).
  it('не открывает ссылку, не прошедшую валидацию', () => {
    config.linkTarget = '_top';

    expect(openScreen('javascript:alert(1)')).toBeNull();
    expect(openScreen('не ссылка')).toBeNull();
    expect(openScreen('')).toBeNull();

    expect(openSpy).not.toHaveBeenCalled();
  });
});

describe('validateUrl', () => {
  it('https — корректен без замечаний', () => {
    expect(validateUrl('https://inplan.company.ru/plan/42')).toEqual({ status: 'valid' });
    // Пробелы по краям — типичный результат вставки из буфера, не ошибка.
    expect(validateUrl('  https://example.com/plan  ')).toEqual({ status: 'valid' });
  });

  // SPEC §4.4: http ДОПУСКАЕТСЯ с предупреждением. Отдельный статус нужен
  // редактору (process-map-0sb): сохранить можно, но сказать об этом надо.
  it('http — корректен, но с предупреждением', () => {
    expect(validateUrl('http://inplan.company.ru/plan')).toEqual({
      status: 'warning',
      reason: 'insecure-protocol',
    });
  });

  it('пустая строка — ошибка empty', () => {
    expect(validateUrl('')).toEqual({ status: 'invalid', reason: 'empty' });
    expect(validateUrl('   ')).toEqual({ status: 'invalid', reason: 'empty' });
  });

  it('мусор и относительный путь — ошибка malformed', () => {
    for (const value of ['не ссылка', 'example.com/plan', '/plan/42', 'https://']) {
      expect(validateUrl(value), value).toEqual({ status: 'invalid', reason: 'malformed' });
    }
  });

  it('javascript: и прочие схемы — ошибка unsupported-protocol', () => {
    for (const value of ['javascript:alert(1)', 'data:text/html,<b>x</b>', 'file:///c:/plan.txt']) {
      expect(validateUrl(value), value).toEqual({
        status: 'invalid',
        reason: 'unsupported-protocol',
      });
    }
  });

  // Разные статусы — не косметика: у редактора три разных поведения
  // (сохранить молча / сохранить с предупреждением / не дать сохранить),
  // и булево их не различает.
  it('различает три исхода, а не два', () => {
    const statuses = ['https://a.example', 'http://a.example', 'javascript:void 0'].map(
      (value) => validateUrl(value).status,
    );
    expect(new Set(statuses).size).toBe(3);
  });
});
