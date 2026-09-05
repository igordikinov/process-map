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

const { RefitViewport } = await import('../src/components/Overview/RefitViewport');
const { ReactFlowProvider } = await import('@xyflow/react');
const { default: App } = await import('../src/App');
const { DEFAULT_VERSION_ID, listVersions, resetSelectedVersion } =
  await import('../src/data/versions');
const { refreshProcessMap } = await import('../src/hooks/useProcessMap');
const { createInitialState, useProcessStore } = await import('../src/store/useProcessStore');
const { ru } = await import('../src/i18n/ru');

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
    const alt = listVersions().find((version) => version.id !== DEFAULT_VERSION_ID);
    expect(alt).toBeDefined();
    await act(async () => {
      render(<App />);
    });
    fitView.mockClear();

    await act(async () => {
      fireEvent.click(
        within(screen.getByRole('group', { name: ru.overview.versionGroup })).getByRole('button', {
          name: ru.overview.versionLabels[(alt as { id: string }).id] as string,
        }),
      );
    });

    expect(
      fitView,
      'после смены версии вид не пересчитан: десять карточек останутся за кадром',
    ).toHaveBeenCalled();
  });
});
