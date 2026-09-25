// Пересчёт стартового вида полотна (process-map-0c5.7).
//
// ЗАЧЕМ ЭТОТ ФАЙЛ. Раньше RefitViewport подгонял вид только при смене
// компактного режима, и это проверялось в e2e — там есть настоящий layout, и
// можно посмотреть на transform полотна. С переключателем версий состав полотна
// меняется и БЕЗ смены режима: четыре карточки становятся десятью, габарит
// растёт вдвое, а вид остался бы подогнанным под прежний — часть карточек за
// кадром.
//
// Мутация «подгонять только один раз за всё время» показала, что юнит-тестами
// это не ловилось ничем. В jsdom нет layout, поэтому смотреть на transform
// бессмысленно; наблюдаемое здесь — сам факт вызова fitView, и его достаточно:
// вопрос «сколько раз и на что» решается в этом компоненте, а «как именно
// подогналось» проверяет e2e.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';

const fitView = vi.fn();

vi.mock('@xyflow/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@xyflow/react')>();
  return { ...actual, useReactFlow: () => ({ ...actual.useReactFlow(), fitView }) };
});

// Страница из фикстур (process-map-9mn.34) — для второго describe: клик по
// переключателю требует двух версий, а есть ли вторая версия у настоящей
// страницы юнит-тестов, решает сборка. Порядок и форма — дословно из шапки
// tests/fixtures/pageMocks.ts. Первому describe подмена безразлична: он рендерит
// RefitViewport без данных карты.
vi.mock('@map/process.json', async () =>
  (await import('./fixtures/pageMocks')).defaultVersionModule(),
);
vi.mock('@map-alt/process.json', async () =>
  (await import('./fixtures/pageMocks')).altVersionModule(),
);

const { RefitViewport } = await import('../src/components/Overview/RefitViewport');
const { ReactFlowProvider } = await import('@xyflow/react');
const { default: App } = await import('../src/App');
const { resetSelectedVersion } = await import('../src/data/versions');
const { loadBaseProcessMap } = await import('../src/data/loader');
const { refreshProcessMap } = await import('../src/hooks/useProcessMap');
const { createInitialState, useProcessStore } = await import('../src/store/useProcessStore');
const { ru } = await import('../src/i18n/ru');
const { FIXTURE_ALT_ID, fixtureAltVersion } = await import('./fixtures/pageMocks');

const OPTIONS = { padding: 0.1 };

function renderWith(fitKey: string) {
  return render(
    <ReactFlowProvider>
      <RefitViewport fitKey={fitKey} fitViewOptions={OPTIONS} />
    </ReactFlowProvider>,
  );
}

describe('RefitViewport', () => {
  it('подгоняет вид при монтировании и на каждую смену ключа', () => {
    fitView.mockClear();
    const { rerender } = renderWith('false:snp');
    expect(fitView).toHaveBeenCalledTimes(1);

    rerender(
      <ReactFlowProvider>
        <RefitViewport fitKey="false:inplan-model" fitViewOptions={OPTIONS} />
      </ReactFlowProvider>,
    );

    expect(
      fitView,
      'вид не пересчитан после смены версии: десять карточек останутся за кадром',
    ).toHaveBeenCalledTimes(2);
  });

  /*
   * Обратная сторона: без этой проверки «подгонять всегда» прошло бы первую.
   * Лишняя подгонка дёргает вид на ровном месте — ровно то, ради чего в
   * компоненте стоит appliedFor.
   */
  it('не подгоняет вид повторно, пока ключ тот же', () => {
    fitView.mockClear();
    const { rerender } = renderWith('false:snp');

    rerender(
      <ReactFlowProvider>
        <RefitViewport fitKey="false:snp" fitViewOptions={{ padding: 0.2 }} />
      </ReactFlowProvider>,
    );

    expect(fitView).toHaveBeenCalledTimes(1);
  });
});

/*
 * ПРОВОДКА КЛЮЧА, а не сам компонент. Мутация «передавать в fitKey один
 * compact, как было до появления версий» переживала все проверки выше:
 * RefitViewport оставался правильным, а Overview передавал ему ключ, который
 * при смене версии не меняется. Наблюдаемое здесь — вызов fitView после
 * настоящего клика по переключателю.
 */
describe('обзор просит пересчитать вид при смене версии', () => {
  beforeEach(() => {
    localStorage.clear();
    useProcessStore.setState(createInitialState());
    resetSelectedVersion();
    refreshProcessMap();
    window.history.replaceState({}, '', '/');
  });

  it('клик по второй версии вызывает fitView', async () => {
    await act(async () => {
      render(<App />);
    });
    fitView.mockClear();

    // У id фикстуры нет подписи владельца в i18n — кнопка подписана заголовком
    // карты (tests/versionSwitcher.test.tsx, «переключатель версий на экране»).
    await act(async () => {
      fireEvent.click(
        within(screen.getByRole('group', { name: ru.overview.versionGroup })).getByRole('button', {
          name: fixtureAltVersion().title,
        }),
      );
    });

    // Клик действительно сменил версию: иначе fitView, вызванный по другой
    // причине, выдал бы себя за пересчёт после смены версии.
    expect(loadBaseProcessMap().id).toBe(FIXTURE_ALT_ID);
    expect(
      fitView,
      'после смены версии вид не пересчитан: семь карточек вместо четырёх останутся за кадром',
    ).toHaveBeenCalled();
  });
});
