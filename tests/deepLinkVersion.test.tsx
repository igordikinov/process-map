// Deep-link на версию карты: `?version=` (process-map-0c5.8).
//
// Сценарии `?stage=`/`?node=` живут в tests/useDeepLink.test.tsx и после этой
// задачи не изменились ни на строку — это и есть главное требование:
// параметр версии не пишется, пока показана версия по умолчанию, поэтому все
// уже разосланные по вики ссылки означают ровно то, что означали.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import App from '../src/App';
import { clearImportedMap } from '../src/data/activeMap';
import { loadBaseProcessMap } from '../src/data/loader';
import {
  DEFAULT_VERSION_ID,
  getSelectedVersionId,
  listVersions,
  resetSelectedVersion,
} from '../src/data/versions';
import { selectVersion } from '../src/data/versionSwitch';
import { refreshProcessMap } from '../src/hooks/useProcessMap';
import { createInitialState, useProcessStore } from '../src/store/useProcessStore';

const ALT = listVersions().find((version) => version.id !== DEFAULT_VERSION_ID);
if (ALT === undefined) {
  throw new Error('В бандле одна версия — проверять переключение нечем');
}

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
   * ГЛАВНЫЙ ТЕСТ ЗАДАЧИ. Номера этапов у версий означают РАЗНОЕ: у карты по
   * умолчанию их четыре, у второй — десять. Разбери `stage` раньше версии — и
   * этап с номером, которого в первой карте нет, просто не найдётся, а
   * существующий номер открыл бы ДРУГОЙ этап. Экран при этом выглядит рабочим.
   */
  it('этап ищется в той версии, которая названа в адресе', async () => {
    const alt = ALT;
    // Номер, которого у карты по умолчанию нет вовсе.
    const beyondDefault = loadBaseProcessMap().stages.length + 1;
    expect(alt.stages).toBeGreaterThanOrEqual(beyondDefault);
    setUrl(`?version=${alt.id}&stage=${beyondDefault}`);

    await renderApp();

    const stage = loadBaseProcessMap().stages.find(
      (candidate) => candidate.number === beyondDefault,
    );
    expect(stage).toBeDefined();
    expect(useProcessStore.getState().currentStageId).toBe(stage?.id);
  });

  it('узел из второй версии открывает её этап', async () => {
    const alt = ALT;
    selectVersion(alt.id);
    const node = loadBaseProcessMap().stages[1]?.nodes[0];
    const stageId = loadBaseProcessMap().stages[1]?.id;
    resetSelectedVersion();
    refreshProcessMap();
    expect(node).toBeDefined();
    setUrl(`?version=${alt.id}&node=${node?.id as string}`);

    await renderApp();

    expect(useProcessStore.getState().currentStageId).toBe(stageId);
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
