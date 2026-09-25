// Deep-link на версию карты: `?version=` (process-map-0c5.8).
//
// Сценарии `?stage=`/`?node=` живут в tests/useDeepLink.test.tsx и после этой
// задачи не изменились ни на строку — это и есть главное требование:
// параметр версии не пишется, пока показана версия по умолчанию, поэтому все
// уже разосланные по вики ссылки означают ровно то, что означали.
//
// СТРАНИЦА ИЗ ФИКСТУР (process-map-9mn.34): обе версии подменены
// (tests/fixtures/pageMocks.ts), чтобы механика адреса не зависела от того, у
// какой карты в этой сборке есть вторая версия. useDeepLink, versions.ts,
// loader.ts и App работают по-настоящему. Сценарии на НАСТОЯЩЕЙ карте snp
// остаются в tests/useDeepLink.test.tsx.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import App from '../src/App';
import { clearImportedMap } from '../src/data/activeMap';
import { loadBaseProcessMap } from '../src/data/loader';
import {
  DEFAULT_VERSION_ID,
  getSelectedVersionId,
  resetSelectedVersion,
} from '../src/data/versions';
import { selectVersion } from '../src/data/versionSwitch';
import { refreshProcessMap } from '../src/hooks/useProcessMap';
import { createInitialState, useProcessStore } from '../src/store/useProcessStore';
import { FIXTURE_ALT_ID, fixtureAltVersion, fixtureDefaultVersion } from './fixtures/pageMocks';

// Порядок и форма — дословно из шапки tests/fixtures/pageMocks.ts.
vi.mock('@map/process.json', async () =>
  (await import('./fixtures/pageMocks')).defaultVersionModule(),
);
vi.mock('@map-alt/process.json', async () =>
  (await import('./fixtures/pageMocks')).altVersionModule(),
);

/*
 * Вторая версия — известная тесту фикстура, а не «первая, не равная
 * умолчанию» из listVersions(): отвались подмена @map-alt, поиск нашёл бы
 * настоящую карту, и тесты зеленели бы на чужих данных. С константой
 * `?version=fixture-alt` просто не найдётся, и покраснеет всё, что её ждёт.
 */
const ALT = {
  id: FIXTURE_ALT_ID,
  title: fixtureAltVersion().title,
  stages: fixtureAltVersion().stages.length,
};

function setUrl(search: string): void {
  window.history.pushState({}, '', `/${search}`);
}

function params(): URLSearchParams {
  return new URLSearchParams(window.location.search);
}

async function renderApp(): Promise<void> {
  await act(async () => {
    render(<App />);
  });
}

beforeEach(() => {
  localStorage.clear();
  useProcessStore.setState(createInitialState());
  clearImportedMap();
  resetSelectedVersion();
  refreshProcessMap();
  setUrl('');
});

afterEach(() => {
  clearImportedMap();
  resetSelectedVersion();
  refreshProcessMap();
  setUrl('');
});

describe('версия из адреса', () => {
  it('открывает названную версию', async () => {
    setUrl(`?version=${ALT.id}`);

    await renderApp();

    expect(getSelectedVersionId()).toBe(ALT.id);
    expect(screen.getByRole('heading', { name: ALT.title })).toBeInTheDocument();
  });

  /*
   * ГЛАВНЫЙ ТЕСТ ЗАДАЧИ. Номера этапов у версий означают РАЗНОЕ: у версии по
   * умолчанию их четыре, у второй — семь (у настоящих карт — четыре и десять).
   * Разбери `stage` раньше версии — и этап с номером, которого в первой карте
   * нет, просто не найдётся, а существующий номер открыл бы ДРУГОЙ этап. Экран
   * при этом выглядит рабочим.
   */
  it('этап ищется в той версии, которая названа в адресе', async () => {
    // Номер, которого у карты по умолчанию нет вовсе.
    const beyondDefault = fixtureDefaultVersion().stages.length + 1;
    expect(ALT.stages).toBeGreaterThanOrEqual(beyondDefault);
    setUrl(`?version=${ALT.id}&stage=${beyondDefault}`);

    await renderApp();

    const stage = fixtureAltVersion().stages.find(
      (candidate) => candidate.number === beyondDefault,
    );
    expect(stage).toBeDefined();
    expect(useProcessStore.getState().currentStageId).toBe(stage?.id);
  });

  it('узел из второй версии открывает её этап', async () => {
    const stage = fixtureAltVersion().stages[1];
    const node = stage?.nodes[0];
    expect(node).toBeDefined();
    // Узел обязан быть ТОЛЬКО во второй версии: найдись он и в первой, тест
    // прошёл бы и при разборе `node` раньше версии.
    expect(
      fixtureDefaultVersion().stages.some((candidate) =>
        candidate.nodes.some((other) => other.id === node?.id),
      ),
    ).toBe(false);
    setUrl(`?version=${ALT.id}&node=${node?.id as string}`);

    await renderApp();

    expect(useProcessStore.getState().currentStageId).toBe(stage?.id);
    expect(useProcessStore.getState().selectedNodeId).toBe(node?.id);
  });

  /*
   * Обратная совместимость: ссылка без параметра версии обязана значить ровно
   * то, что значила до этой задачи, — этап карты по умолчанию.
   */
  it('без параметра версии открывается карта по умолчанию', async () => {
    setUrl('?stage=2');

    await renderApp();

    expect(getSelectedVersionId()).toBe(DEFAULT_VERSION_ID);
    const stage = loadBaseProcessMap().stages.find((candidate) => candidate.number === 2);
    expect(useProcessStore.getState().currentStageId).toBe(stage?.id);
  });

  /*
   * Битый параметр оставляет экран на месте — то же правило, что у `?stage=99`.
   * Молчаливый откат на вторую версию был бы тем же дефектом, что «неизвестный
   * MAP роняет сборку» предотвращает на сборке.
   */
  it('неизвестная версия игнорируется, карта остаётся по умолчанию', async () => {
    setUrl('?version=версии-такой-нет');

    await renderApp();

    expect(getSelectedVersionId()).toBe(DEFAULT_VERSION_ID);
    expect(screen.getByRole('heading', { name: loadBaseProcessMap().title })).toBeInTheDocument();
  });
});

describe('версия в адресе', () => {
  it('пишется при переключении на вторую версию', async () => {
    await renderApp();
    expect(params().get('version')).toBeNull();

    await act(async () => {
      selectVersion(ALT.id);
    });

    expect(params().get('version')).toBe(ALT.id);
  });

  /*
   * И ИСЧЕЗАЕТ при возврате. Иначе адрес утверждал бы вторую версию, а на
   * экране была бы первая, и ссылка, скопированная из фрейма, вела бы не туда.
   */
  it('исчезает при возврате к версии по умолчанию', async () => {
    setUrl(`?version=${ALT.id}`);
    await renderApp();
    expect(params().get('version')).toBe(ALT.id);

    await act(async () => {
      selectVersion(DEFAULT_VERSION_ID);
    });

    expect(params().get('version')).toBeNull();
  });

  /*
   * Адрес карты по умолчанию обязан остаться ПУСТЫМ. Появись там
   * `?version=snp`, каждая ссылка из вики обросла бы параметром, который ничего
   * не меняет, а первая же смена id версии сделала бы все такие ссылки
   * недействительными.
   */
  it('не пишется, пока показана версия по умолчанию', async () => {
    await renderApp();

    expect(window.location.search).toBe('');
  });

  it('переживает навигацию на уровень 2 и обратно', async () => {
    setUrl(`?version=${ALT.id}`);
    await renderApp();
    const stageId = loadBaseProcessMap().stages[0]?.id as string;

    await act(async () => {
      useProcessStore.getState().navigateToStage(stageId);
    });
    expect(params().get('version')).toBe(ALT.id);
    expect(params().get('stage')).toBe('1');

    await act(async () => {
      useProcessStore.getState().back();
    });
    expect(params().get('version')).toBe(ALT.id);
    expect(params().get('stage')).toBeNull();
  });
});
