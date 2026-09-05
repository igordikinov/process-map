// Переключатель версий в шапке обзора (process-map-0c5.7).
//
// Механика переключения проверена в tests/versions.test.tsx. Здесь — интерфейс:
// что видит читатель, что слышит скринридер и когда переключателя нет вовсе.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import App from '../src/App';
import { clearImportedMap, setImportedMap } from '../src/data/activeMap';
import { loadBaseProcessMap } from '../src/data/loader';
import { ProcessMapSchema } from '../src/data/schema';
import { DEFAULT_VERSION_ID, listVersions, resetSelectedVersion } from '../src/data/versions';
import { OverviewHeader } from '../src/components/Overview/OverviewHeader';
import { refreshProcessMap } from '../src/hooks/useProcessMap';
import { ru } from '../src/i18n/ru';
import { createInitialState, useProcessStore } from '../src/store/useProcessStore';
import { buildSampleProcessMap } from './fixtures/sample-process';

const VERSIONS = [
  { id: 'snp', title: 'E2E-процесс планирования поставок', stages: 4 },
  { id: 'inplan-model', title: 'Сквозной процесс планирования In.Plan', stages: 10 },
];

beforeEach(() => {
  localStorage.clear();
  useProcessStore.setState(createInitialState());
  clearImportedMap();
  resetSelectedVersion();
  refreshProcessMap();
  window.history.replaceState({}, '', '/');
});

afterEach(() => {
  clearImportedMap();
  resetSelectedVersion();
  refreshProcessMap();
});

function group(): HTMLElement {
  return screen.getByRole('group', { name: ru.overview.versionGroup });
}

describe('переключатель версий: разметка', () => {
  function renderHeader(props: Partial<Parameters<typeof OverviewHeader>[0]> = {}) {
    return render(
      <OverviewHeader
        title="Заголовок"
        stagesCount={4}
        updatedAt="2026-09-05"
        versions={VERSIONS}
        selectedVersionId="snp"
        onSelectVersion={() => {}}
        {...props}
      />,
    );
  }

  it('две кнопки с подписями владельца, нажата ровно одна', () => {
    renderHeader();

    const buttons = within(group()).getAllByRole('button');
    expect(buttons.map((button) => button.textContent)).toEqual([
      ru.overview.versionLabels['snp'],
      ru.overview.versionLabels['inplan-model'],
    ]);
    expect(buttons.filter((button) => button.getAttribute('aria-pressed') === 'true')).toHaveLength(
      1,
    );
    expect(buttons[0]).toHaveAttribute('aria-pressed', 'true');
  });

  /*
   * НЕ role="switch", и это не вкусовщина. e2e/compact.spec.ts находит тулбар
   * как document.querySelector('[role="switch"]')?.parentElement. Второй switch
   * раньше по DOM молча увёл бы сторож ширины компактного тулбара на чужой
   * элемент: тест не покраснел бы, а позеленел бы не про то. Такие поломки не
   * ловятся ничем, кроме прямого запрета.
   */
  it('переключатель не притворяется switch — иначе сторож ширины тулбара уедет', () => {
    renderHeader();

    expect(within(group()).queryAllByRole('switch')).toHaveLength(0);
    // Первый [role=switch] на странице обзора обязан остаться тумблером тулбара.
    expect(document.querySelector('[role="switch"]')).toBeNull();
  });

  it('подсказка называет версию и число этапов', () => {
    renderHeader();

    expect(within(group()).getByRole('button', { name: 'Полная модель' })).toHaveAttribute(
      'title',
      ru.overview.versionHint('Полная модель', 10),
    );
  });

  it('клик сообщает выбранный id', () => {
    const onSelectVersion = vi.fn();
    renderHeader({ onSelectVersion });

    fireEvent.click(within(group()).getByRole('button', { name: 'Полная модель' }));

    expect(onSelectVersion).toHaveBeenCalledWith('inplan-model');
  });

  /*
   * aria-pressed сообщает «нажато» и ничего — про то, что сменились заголовок,
   * число этапов и все узлы полотна. Живая область говорит это словами.
   */
  it('живая область называет активную версию', () => {
    renderHeader({ selectedVersionId: 'inplan-model' });

    expect(screen.getByRole('status')).toHaveTextContent(
      ru.overview.versionAnnouncement('Полная модель', 10),
    );
  });

  it('версия без подписи в i18n подписывается своим заголовком', () => {
    renderHeader({
      versions: [...VERSIONS, { id: 'неизвестная', title: 'Карта завтрашнего дня', stages: 2 }],
      selectedVersionId: 'snp',
    });

    expect(within(group()).getByRole('button', { name: 'Карта завтрашнего дня' })).toBeVisible();
  });

  /*
   * Один неактивный сегмент обещал бы выбор, которого нет. Тот же довод, по
   * которому «Отчёт импорта» и «Вернуться к встроенной карте» не рисуются до
   * первого импорта.
   */
  it('одна версия — группы нет вовсе', () => {
    renderHeader({ versions: [VERSIONS[0] as (typeof VERSIONS)[number]] });

    expect(screen.queryByRole('group', { name: ru.overview.versionGroup })).toBeNull();
  });

  it('компактный режим переключатель не снимает', () => {
    renderHeader({ compact: true });

    expect(group()).toBeInTheDocument();
    // Дата в компактном режиме снимается, а переключатель — нет: он отвечает на
    // вопрос «то ли я вижу», а он от размера фрейма не зависит.
    expect(screen.queryByText(/Обновлено/u)).toBeNull();
  });
});

describe('переключатель версий на экране', () => {
  it('в обзоре есть обе версии, нажата версия по умолчанию', async () => {
    await act(async () => {
      render(<App />);
    });

    const buttons = within(group()).getAllByRole('button');
    expect(buttons).toHaveLength(listVersions().length);
    expect(
      buttons.find((button) => button.getAttribute('aria-pressed') === 'true')?.textContent,
    ).toBe(ru.overview.versionLabels[DEFAULT_VERSION_ID]);
  });

  it('клик по второй версии меняет карту на экране', async () => {
    const alt = listVersions().find((version) => version.id !== DEFAULT_VERSION_ID);
    expect(alt).toBeDefined();
    await act(async () => {
      render(<App />);
    });

    await act(async () => {
      fireEvent.click(
        within(group()).getByRole('button', {
          name: ru.overview.versionLabels[(alt as { id: string }).id] as string,
        }),
      );
    });

    expect(loadBaseProcessMap().id).toBe(alt?.id);
    expect(screen.getByRole('heading', { name: alt?.title as string })).toBeInTheDocument();
    expect(screen.getByText(ru.overview.stagesBadge(alt?.stages as number))).toBeInTheDocument();
  });

  /*
   * Пока поверх лежит файл пользователя, показана НЕ ВЕРСИЯ, и «нажатый»
   * сегмент утверждал бы обратное. Путь назад у пользователя остаётся — кнопка
   * «Вернуться к встроенной карте» в тулбаре редактора.
   */
  it('при загруженной схеме переключателя нет, а бейдж подмены есть', async () => {
    setImportedMap(ProcessMapSchema.parse({ ...buildSampleProcessMap(), id: 'files-map' }));
    refreshProcessMap();
    await act(async () => {
      render(<App />);
    });

    expect(screen.queryByRole('group', { name: ru.overview.versionGroup })).toBeNull();
    expect(screen.getByText(ru.toolbar.importedBadge)).toBeInTheDocument();
  });
});
