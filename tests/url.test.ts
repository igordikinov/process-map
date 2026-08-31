// Открытие ссылок и валидация URL (SPEC §4.8, §4.4; задачи process-map-6mi,
// process-map-6ap).
//
// Раньше здесь проверялись ОБА пути выбора цели: `_top` при доступном
// `window.top` и фолбэк на `_blank`. Пути больше нет — цель берётся из
// `config.linkTarget` напрямую (process-map-6ap). Причина: проба читала
// `top.document`, а он для чужого origin бросает SecurityError всегда, и
// карта по построению живёт на чужом origin (SPEC §6) — то есть «фолбэк» был
// единственным поведением, а четыре теста ниже описывали ветвление, которого
// в проде не существовало.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { config } from '../src/config';
import { openScreen, validateUrl } from '../src/utils/url';

const URL_OK = 'https://example.com/plan';

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
  // Контракт после process-map-6ap: цель — ровно `config.linkTarget`, без
  // угадывания. Дефолт — новая вкладка.
  it('открывает в новой вкладке и не читает window.top', () => {
    // Если бы проба доступности верхнего окна вернулась, этот геттер сработал
    // бы — а сработать он не должен ни разу.
    const topGetter = vi.fn(() => window);
    stubTop({ get: topGetter });

    openScreen(URL_OK);

    expect(openSpy).toHaveBeenCalledTimes(1);
    expect(openSpy).toHaveBeenCalledWith(URL_OK, '_blank');
    expect(topGetter, 'верхнее окно не должно опрашиваться вовсе').not.toHaveBeenCalled();
  });

  // Ручка остаётся: если карту положат на тот же origin, что и вики, уход всей
  // страницы снова станет достижим — но уже осознанным переключением, а не
  // автоматикой, и без фолбэка.
  it('уважает config.linkTarget, когда его переключили на _top', () => {
    config.linkTarget = '_top';

    openScreen(URL_OK);

    expect(openSpy).toHaveBeenCalledWith(URL_OK, '_top');
  });

  it('возвращает то, что вернул window.open, и не пытается открыть повторно', () => {
    // null от window.open = блокировщик всплывающих окон (или успешное
    // открытие с noopener). Повторная попытка открыла бы вторую вкладку.
    expect(openScreen(URL_OK)).toBeNull();
    expect(openSpy).toHaveBeenCalledTimes(1);

    const opened = {} as Window;
    openSpy.mockReturnValue(opened);
    expect(openScreen(URL_OK)).toBe(opened);
  });

  // screen.url приезжает из overrides в localStorage (SPEC §3) — то есть из
  // данных, которые может подменить кто угодно. window.open('javascript:…')
  // выполнил бы скрипт, поэтому невалидная ссылка не открывается вовсе.
  it('не открывает ссылку, не прошедшую валидацию', () => {
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
