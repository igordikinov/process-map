// Интерфейс загрузки BPMN: кнопка, отказы, подмена карты, отчёт
// (process-map-70e.9).
//
// ЧТО ИМЕННО ЗДЕСЬ ПРОВЕРЯЕТСЯ. Разбор и сборка карты покрыты своими файлами
// (tests/bpmn/*), и дублировать их незачем. Этот файл про то, что видит
// пользователь: отказ обязан оставить старую карту на месте и сказать почему,
// успех — подменить карту, поднять отчёт и оставить путь назад.
//
// Успех проверяется на НАСТОЯЩЕЙ модели из корня репозитория, как в
// tests/bpmn/adapter.test.ts, а не на синтетической: интерфейс должен работать
// на том файле, который владелец в него кладёт, и число «показано N из M» в
// отчёте имеет смысл только на нём.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import App from '../src/App';
import { clearImportedMap, getImportReport, isImportedActive } from '../src/data/activeMap';
import { MAX_BPMN_BYTES } from '../src/data/bpmn/xml';
import { loadBaseProcessMap } from '../src/data/loader';
import { refreshProcessMap } from '../src/hooks/useProcessMap';
import { ru } from '../src/i18n/ru';
import { createInitialState, useProcessStore } from '../src/store/useProcessStore';

const ROOT = process.cwd();
const MODEL = readdirSync(ROOT).find((name) => name.toLowerCase().endsWith('.bpmn'));

beforeEach(() => {
  localStorage.clear();
  useProcessStore.setState(createInitialState());
  clearImportedMap();
  refreshProcessMap();
  window.history.replaceState({}, '', '/');
});

afterEach(() => {
  clearImportedMap();
  refreshProcessMap();
});

/** Обзор в режиме «Редактор»: только там есть кнопки импорта (SPEC §4.4). */
function renderEditor(): void {
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: ru.toolbar.modeEdit }));
}

/** Скрытый input именно BPMN-импорта: у JSON-импорта свой, с другим accept. */
function bpmnInput(): HTMLInputElement {
  const input = document.querySelector<HTMLInputElement>('input[type="file"][accept*=".bpmn"]');
  expect(input, 'скрытый input BPMN не найден').not.toBeNull();
  return input as HTMLInputElement;
}

/**
 * Кладёт файл в input и ждёт строку ответа.
 *
 * Ждать нужно именно живую область: разбор асинхронный (file.text()), и без
 * ожидания тест проверял бы состояние до его окончания. Приём взят из
 * tests/toolbar.test.tsx, где так же проверяется, что область ровно одна.
 */
async function importFile(content: string | Blob, name = 'model.bpmn'): Promise<HTMLElement> {
  const file = content instanceof Blob ? content : new File([content], name, { type: 'text/xml' });
  fireEvent.change(bpmnInput(), { target: { files: [file] } });
  return waitFor(() => {
    /*
     * Живые области ШАПКИ сюда не считаются. С появлением переключателя версий
     * (process-map-0c5.7) в шапке обзора живёт своя `role="status"` — она
     * объявляет, какая версия показана. Раньше живая область на экране была
     * ровно одна, и проверка «их ровно одна» сторожила, что тулбар не отвечает
     * дважды. Сторож остаётся, но считает теперь только ответы ТУЛБАРА:
     * одновременно эти две области не срабатывают (при загруженной схеме
     * переключателя нет вовсе), а смешивать их в одном счётчике значило бы
     * проверять не то, что написано в имени теста.
     */
    const messages = [...document.querySelectorAll('[role="alert"], [role="status"]')].filter(
      (element) => element.closest('header') === null,
    );
    expect(messages.length).toBe(1);
    return messages[0] as HTMLElement;
  });
}

function reportPanel(): HTMLElement {
  return screen.getByRole('dialog', { name: ru.importReport.title });
}

describe('до импорта', () => {
  it('в редакторе есть «Импорт BPMN», но нет ни отчёта, ни возврата, ни бейджа', () => {
    renderEditor();

    expect(screen.getByRole('button', { name: ru.toolbar.importBpmn })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: ru.toolbar.openImportReport })).toBeNull();
    expect(screen.queryByRole('button', { name: ru.toolbar.returnToBuiltin })).toBeNull();
    expect(screen.queryByText(ru.toolbar.importedBadge)).toBeNull();
  });

  it('в режиме просмотра кнопки импорта нет вовсе', () => {
    render(<App />);

    expect(screen.queryByRole('button', { name: ru.toolbar.importBpmn })).toBeNull();
  });

  /*
   * РЕГРЕССИЯ 70e.9. Шесть кнопок в ОДНОМ сегменте на 1024×600 с открытой
   * панелью узла уезжали за левый край экрана: сегментированная группа не
   * переносится (фиксированная высота + overflow:hidden), а ряд тулбара прижат
   * вправо. Тулбар переносит по группам — значит групп должно быть две.
   * Геометрию в jsdom не проверить (layout'а нет), поэтому сторожится причина:
   * кнопки лежат в разных контейнерах.
   */
  it('кнопки правок и кнопки выбора карты лежат в разных группах тулбара', () => {
    renderEditor();

    const exportGroup = screen.getByRole('button', { name: ru.toolbar.exportJson }).parentElement;
    const bpmnGroup = screen.getByRole('button', { name: ru.toolbar.importBpmn }).parentElement;
    expect(exportGroup).not.toBeNull();
    expect(bpmnGroup).not.toBeNull();
    expect(bpmnGroup).not.toBe(exportGroup);
  });
});

describe('отказы: карта остаётся прежней', () => {
  /**
   * Файл сверх лимита. Настоящий Blob такого размера не создаётся: проверка
   * стоит ДО чтения, ей достаточно File.size, а мегабайты в тесте — только
   * трата памяти.
   */
  it('файл больше лимита отвергается своей строкой и не читается', async () => {
    renderEditor();
    const oversized = new File(['<x/>'], 'huge.bpmn', { type: 'text/xml' });
    Object.defineProperty(oversized, 'size', { value: MAX_BPMN_BYTES + 1 });

    const message = await importFile(oversized);

    expect(message).toHaveTextContent(ru.toolbar.importBpmnTooLarge);
    expect(message).toHaveAttribute('role', 'alert');
    expect(isImportedActive()).toBe(false);
  });

  /*
   * Три разных дефекта файла дают ОДНУ строку — намеренно, по прецеденту
   * владельца для импорта JSON: «для пользователя это одно событие». Тест
   * фиксирует именно это решение, иначе кто-нибудь «улучшит» его тремя
   * текстами, а различать их пользователю нечем.
   */
  it.each([
    ['битый XML', '<bpmn:definitions><bpmn:process></bpmn:definitions>'],
    ['валидный XML, но не BPMN', '<?xml version="1.0"?><catalog><book id="1"/></catalog>'],
    [
      'DOCTYPE в прологе',
      '<?xml version="1.0"?><!DOCTYPE definitions [<!ENTITY x "y">]><definitions/>',
    ],
  ])('%s: одна общая строка отказа, карта не подменяется', async (_name, text) => {
    const builtinId = loadBaseProcessMap().id;
    renderEditor();

    const message = await importFile(text);

    expect(message).toHaveTextContent(ru.toolbar.importBpmnBadFile);
    expect(isImportedActive()).toBe(false);
    expect(loadBaseProcessMap().id).toBe(builtinId);
    expect(screen.queryByRole('dialog', { name: ru.importReport.title })).toBeNull();
  });
});

// Настоящая модель. describe.skipIf вместо молчаливого пропуска: если .bpmn
// из репозитория исчезнет, прогон обязан это сказать, а не позеленеть.
describe('в репозитории есть схема BPMN для проверки интерфейса', () => {
  it('найден .bpmn в корне', () => {
    expect(MODEL, 'нет ни одного .bpmn в корне репозитория').toBeDefined();
  });
});

/*
 * Общий таймаут на весь блок. Каждая проверка здесь разбирает НАСТОЯЩУЮ модель
 * на 1.3 МБ — под нагрузкой полного прогона это стабильно 2–5 с, то есть ровно
 * на границе стандартных 5000 мс, и тесты падали по таймауту по очереди, каждый
 * раз новый. Синтетическая мини-схема убрала бы задержку, но вместе с ней и
 * смысл: интерфейс обязан работать на том файле, который владелец в него кладёт.
 */
describe.skipIf(MODEL === undefined)(
  'успешный импорт настоящей модели',
  { timeout: 20_000 },
  () => {
    const fileName = MODEL as string;
    const path = resolve(ROOT, fileName);
    const text = readFileSync(path, 'utf8');

    it('файл владельца укладывается в лимит размера', () => {
      expect(statSync(path).size).toBeLessThanOrEqual(MAX_BPMN_BYTES);
    });

    it('карта подменяется, отчёт открывается, в сообщении обе цифры', async () => {
      const builtinId = loadBaseProcessMap().id;
      renderEditor();

      const message = await importFile(text, fileName);

      expect(isImportedActive()).toBe(true);
      expect(loadBaseProcessMap().id).not.toBe(builtinId);

      const report = getImportReport();
      expect(report).not.toBeNull();
      const { shown, inFile } = (report as NonNullable<typeof report>).shownFlowNodes;
      expect(message).toHaveAttribute('role', 'status');
      expect(message).toHaveTextContent(
        ru.toolbar.importBpmnApplied(loadBaseProcessMap().stages.length, shown, inFile),
      );
      // Доля печатается только со знаменателем: «показано 33%» читается иначе.
      expect(within(reportPanel()).getByText(ru.importReport.densityHeadline(shown, inFile)));
    });

    it('на экране появляются бейдж подмены и путь назад', async () => {
      renderEditor();
      await importFile(text, fileName);

      expect(screen.getByText(ru.toolbar.importedBadge)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: ru.toolbar.returnToBuiltin })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: ru.toolbar.openImportReport })).toBeInTheDocument();
    });

    it('возврат к встроенной карте убирает и бейдж, и отчёт', async () => {
      const builtinId = loadBaseProcessMap().id;
      renderEditor();
      await importFile(text, fileName);

      fireEvent.click(screen.getByRole('button', { name: ru.toolbar.returnToBuiltin }));

      expect(isImportedActive()).toBe(false);
      expect(loadBaseProcessMap().id).toBe(builtinId);
      expect(screen.queryByText(ru.toolbar.importedBadge)).toBeNull();
      expect(screen.queryByRole('dialog', { name: ru.importReport.title })).toBeNull();
      /*
       * Закрытая панель — ещё не пустой отчёт: панель прячет setImportReportOpen,
       * а данные лежат отдельно. Мутация «не обнулять report при возврате»
       * проверку по одной лишь панели переживала. Отчёт описывает КОНКРЕТНУЮ
       * загруженную схему и обязан исчезнуть вместе с ней, иначе он превращается
       * в ложь — отчёт от прошлого файла поверх нынешней карты.
       */
      expect(getImportReport()).toBeNull();
    });

    /*
     * ЛОВУШКА ПОВТОРНОГО ВЫБОРА. Без `input.value = ''` браузер не шлёт change
     * при выборе ТОГО ЖЕ файла второй раз, и второй импорт молча не срабатывает.
     *
     * Проверять `input.value === ''` ПОСЛЕ импорта бесполезно: в jsdom значение
     * file-инпута и так пустое всегда, и такая проверка проходит даже при
     * удалённом сбросе — мутация это показала. Поэтому наблюдается сама ЗАПИСЬ:
     * акцессор на экземпляре считает присваивания, делегируя настоящему.
     * Присвоить непустое значение и посмотреть, очистится ли оно, нельзя —
     * jsdom (как и браузер) запрещает запись непустой строки в file-инпут.
     */
    it('обработчик сбрасывает значение input, иначе тот же файл второй раз не выбрать', async () => {
      renderEditor();
      const input = bpmnInput();
      const native = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
      const writes: string[] = [];
      Object.defineProperty(input, 'value', {
        configurable: true,
        get: (): unknown => native?.get?.call(input),
        set: (value: string): void => {
          writes.push(value);
          native?.set?.call(input, value);
        },
      });

      await importFile(text, fileName);

      expect(writes).toContain('');
    });

    // Единственный тест, разбирающий модель ДВАЖДЫ: 20 с блока рассчитаны и на него.
    it('повторный импорт того же файла снова подменяет карту', async () => {
      renderEditor();
      await importFile(text, fileName);
      fireEvent.click(screen.getByRole('button', { name: ru.toolbar.returnToBuiltin }));
      expect(isImportedActive()).toBe(false);

      await importFile(text, fileName);

      expect(isImportedActive()).toBe(true);
    });

    it('отчёт закрывается крестиком и клавишей Esc', async () => {
      renderEditor();
      await importFile(text, fileName);

      fireEvent.click(within(reportPanel()).getByRole('button', { name: ru.importReport.close }));
      expect(screen.queryByRole('dialog', { name: ru.importReport.title })).toBeNull();

      fireEvent.click(screen.getByRole('button', { name: ru.toolbar.openImportReport }));
      expect(reportPanel()).toBeInTheDocument();
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(screen.queryByRole('dialog', { name: ru.importReport.title })).toBeNull();
    });

    /*
     * Числа в отчёте склоняются. На модели владельца есть этап с 31 узлом и 21
     * связью — «31 узлов · 21 связей» было в первой версии панели и выглядело
     * недоделкой. Проверяется не конкретная строка модели, а само правило: для
     * каждого этапа отчёта в панели есть строка ровно в той форме, которую даёт
     * i18n, — включая единственное число.
     */
    it('числа этапов в отчёте склоняются', async () => {
      renderEditor();
      await importFile(text, fileName);
      const report = getImportReport() as NonNullable<ReturnType<typeof getImportReport>>;
      const panel = reportPanel();

      for (const stage of report.stages) {
        const row = within(panel).getByText(stage.title).parentElement;
        expect(row).not.toBeNull();
        expect(row).toHaveTextContent(ru.importReport.stageNodes(stage.nodes));
        expect(row).toHaveTextContent(ru.importReport.stageEdges(stage.edges));
      }
      // Форма «21 связь» существует в i18n, а не только в голове автора.
      expect(ru.importReport.stageEdges(21)).toBe('21 связь');
      expect(ru.importReport.stageNodes(31)).toBe('31 узел');
    });

    /*
     * ПОТЕРИ НАЗЫВАЮТСЯ ПОИМЁННО. «Заметка ни к чему не привязана — 14» без
     * примеров нечинимо: непонятно, КАКАЯ заметка. У каждого примера обязан быть
     * sourceId — по нему объект находится в Camunda Modeler.
     */
    it('в каждом ведре потерь показаны примеры с id из файла', async () => {
      renderEditor();
      await importFile(text, fileName);
      const report = getImportReport() as NonNullable<ReturnType<typeof getImportReport>>;
      const panel = reportPanel();

      expect(report.losses.length).toBeGreaterThan(0);
      for (const bucket of report.losses) {
        for (const sample of bucket.samples) {
          expect(within(panel).getAllByText(new RegExp(sample.sourceId)).length).toBeGreaterThan(0);
        }
        // «и ещё N» — только когда примеров меньше, чем потерь.
        const more = ru.importReport.lossMore(bucket.count - bucket.samples.length);
        if (bucket.complete) {
          expect(within(panel).queryByText(more)).toBeNull();
        } else {
          expect(within(panel).getByText(more)).toBeInTheDocument();
        }
      }
    });
  },
);
