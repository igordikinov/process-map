// Две версии карты в одном бандле и переключение между ними (process-map-0c5.6).
//
// ГЛАВНОЕ, ЧТО ЗДЕСЬ ПРОВЕРЯЕТСЯ, — не то, что переключение работает, а то, что
// версии НЕ ЗАДЕВАЮТ ДРУГ ДРУГА: правки каждой лежат в своём ключе, и
// «Сбросить правки» на одной не стирает черновик другой. Это тот же инвариант,
// ради которого SPEC §3 когда-то развёл ключи по картам, — только теперь карты
// живут на одном адресе, и проверить его стало важнее.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import App from '../src/App';
import { clearImportedMap, setImportedMap } from '../src/data/activeMap';
import {
  loadBaseProcessMap,
  OVERRIDES_KEY,
  resetOverrides,
  setNodeOverride,
} from '../src/data/loader';
import { ProcessMapSchema } from '../src/data/schema';
import {
  DEFAULT_VERSION_ID,
  getSelectedVersionId,
  hasVersion,
  listVersions,
  resetSelectedVersion,
} from '../src/data/versions';
import { selectVersion } from '../src/data/versionSwitch';
import { refreshProcessMap } from '../src/hooks/useProcessMap';
import { createInitialState, useProcessStore } from '../src/store/useProcessStore';
import { buildSampleProcessMap } from './fixtures/sample-process';

/** Вторая версия этой сборки, если она есть. */
function altVersionId(): string | undefined {
  return listVersions().find((version) => version.id !== DEFAULT_VERSION_ID)?.id;
}

beforeEach(() => {
  localStorage.clear();
  useProcessStore.setState(createInitialState());
  clearImportedMap();
  resetSelectedVersion();
  refreshProcessMap();
});

afterEach(() => {
  clearImportedMap();
  resetSelectedVersion();
  refreshProcessMap();
});

describe('реестр версий', () => {
  /*
   * Сторож против тихой деградации. Откатись алиас `@map-alt` на карту по
   * умолчанию — список схлопнется до одной записи, переключатель исчезнет с
   * экрана, и НИ ОДИН другой тест этого не заметит: приложение продолжит
   * показывать версию по умолчанию как ни в чём не бывало.
   */
  it('в этой сборке две версии, и первая — по умолчанию', () => {
    const versions = listVersions();
    expect(
      versions.length,
      'вторая версия не попала в бандл: проверьте MAP_ALT_VERSION и алиас @map-alt',
    ).toBe(2);
    expect(versions[0]?.id).toBe(DEFAULT_VERSION_ID);
    expect(getSelectedVersionId()).toBe(DEFAULT_VERSION_ID);
  });

  it('у каждой версии непустой заголовок и хотя бы один этап', () => {
    for (const version of listVersions()) {
      expect(version.title.trim(), `версия ${version.id}`).not.toBe('');
      expect(version.stages, `версия ${version.id}`).toBeGreaterThan(0);
    }
  });

  it('версии различаются по id, иначе переключать нечего', () => {
    const ids = listVersions().map((version) => version.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('переключение версии', () => {
  it('отдаёт карту выбранной версии, а возврат — прежнюю', () => {
    const alt = altVersionId();
    expect(alt).toBeDefined();
    const defaultStages = loadBaseProcessMap().stages.length;

    expect(selectVersion(alt as string)).toBe(true);
    expect(loadBaseProcessMap().id).toBe(alt);

    expect(selectVersion(DEFAULT_VERSION_ID)).toBe(true);
    expect(loadBaseProcessMap().id).toBe(DEFAULT_VERSION_ID);
    expect(loadBaseProcessMap().stages.length).toBe(defaultStages);
  });

  /*
   * Значение приходит в том числе из адреса (`?v=`), а битый параметр по
   * действующему правилу оставляет экран на месте. Молчаливый откат на вторую
   * версию был бы тем же дефектом, что «неизвестный MAP роняет сборку»
   * предотвращает на сборке.
   */
  it('неизвестный id ничего не меняет и говорит об этом', () => {
    expect(selectVersion('версии-такой-нет')).toBe(false);
    expect(getSelectedVersionId()).toBe(DEFAULT_VERSION_ID);
    expect(hasVersion('версии-такой-нет')).toBe(false);
  });

  /*
   * РЕГРЕССИЯ, РАДИ КОТОРОЙ ПОРЯДОК В selectVersion ИМЕННО ТАКОЙ.
   * `currentStageId` — id этапа ТЕКУЩЕЙ версии; в другой такого этапа нет, и
   * StageDetail вернул бы пустой экран, из которого не выйти: крошки с кнопкой
   * «Назад» рендерятся ниже этого return.
   */
  it('переключение с уровня 2 возвращает на обзор', () => {
    const stageId = loadBaseProcessMap().stages[1]?.id;
    expect(stageId).toBeDefined();
    useProcessStore.setState({ currentStageId: stageId as string });

    selectVersion(altVersionId() as string);

    expect(useProcessStore.getState().currentStageId).toBeNull();
  });

  /*
   * ТО ЖЕ, НО НА НАСТОЯЩЕМ ЭКРАНЕ. Проверка выше судит по состоянию store, а
   * пользователю важен экран: пустой уровень 2 без крошек — это тупик, из
   * которого выходят только перезагрузкой.
   *
   * Порядок «back() до подмены» в selectVersion этим тестом НЕ проверяется и
   * проверен быть не может: React 18 батчит обновления, промежуточный рендер с
   * чужим currentStageId в jsdom не наблюдается, и мутация «поменять строки
   * местами» его переживает. Порядок остаётся защитой в глубину — ровно как в
   * mapSwitch.ts, где рядом стоит вторая защита в самом StageDetail.
   */
  it('после переключения с уровня 2 на экране обзор новой версии, а не пустота', async () => {
    const alt = altVersionId() as string;
    const stageId = loadBaseProcessMap().stages[1]?.id as string;
    useProcessStore.setState({ currentStageId: stageId });
    await act(async () => {
      render(<App />);
    });

    await act(async () => {
      selectVersion(alt);
    });

    const altTitle = listVersions().find((version) => version.id === alt)?.title as string;
    expect(screen.getByRole('heading', { name: altTitle })).toBeInTheDocument();
  });

  it('переключение снимает загруженную пользователем схему', () => {
    setImportedMap(ProcessMapSchema.parse({ ...buildSampleProcessMap(), id: 'files-map' }));
    refreshProcessMap();
    expect(loadBaseProcessMap().id).toBe('files-map');

    selectVersion(altVersionId() as string);

    expect(loadBaseProcessMap().id).toBe(altVersionId());
  });
});

describe('изоляция правок между версиями', () => {
  /*
   * ГЛАВНЫЙ ТЕСТ ЗАДАЧИ. Обе версии раздаются с ОДНОГО адреса, а localStorage
   * общий на origin: с единым ключом правка, сделанная на одной версии,
   * подмешивалась бы к другой, где узла с таким id нет вовсе, — или, хуже,
   * случайно совпала бы.
   */
  it('правки версий лежат в разных ключах', () => {
    const alt = altVersionId() as string;
    const defaultNode = loadBaseProcessMap().stages[0]?.nodes[0]?.id as string;
    setNodeOverride(defaultNode, { title: 'Экран умолчания', url: 'https://example.com/a' });

    selectVersion(alt);
    const altNode = loadBaseProcessMap().stages[0]?.nodes[0]?.id as string;
    setNodeOverride(altNode, { title: 'Экран модели', url: 'https://example.com/b' });

    expect(localStorage.getItem(OVERRIDES_KEY)).not.toBeNull();
    expect(localStorage.getItem(`inplan-process-map:${alt}:overrides:v1`)).not.toBeNull();
    // Ключ загруженного файла не задет: встроенная версия — не чужой файл.
    expect(localStorage.getItem(`inplan-process-map:imported:${alt}:overrides:v1`)).toBeNull();
  });

  it('«Сбросить правки» на одной версии не трогает ключ другой', () => {
    const alt = altVersionId() as string;
    setNodeOverride(loadBaseProcessMap().stages[0]?.nodes[0]?.id as string, {
      title: 'Экран умолчания',
      url: 'https://example.com/a',
    });
    const before = localStorage.getItem(OVERRIDES_KEY);
    expect(before).not.toBeNull();

    selectVersion(alt);
    setNodeOverride(loadBaseProcessMap().stages[0]?.nodes[0]?.id as string, {
      title: 'Экран модели',
      url: 'https://example.com/b',
    });
    resetOverrides();

    expect(localStorage.getItem(`inplan-process-map:${alt}:overrides:v1`)).toBeNull();
    expect(localStorage.getItem(OVERRIDES_KEY)).toBe(before);
  });

  it('правки версии переживают уход на другую и возврат', () => {
    const alt = altVersionId() as string;
    selectVersion(alt);
    const nodeId = loadBaseProcessMap().stages[0]?.nodes[0]?.id as string;
    setNodeOverride(nodeId, { title: 'Экран модели', url: 'https://example.com/b' });

    selectVersion(DEFAULT_VERSION_ID);
    selectVersion(alt);

    expect(loadBaseProcessMap().stages[0]?.nodes[0]?.id).toBe(nodeId);
    expect(localStorage.getItem(`inplan-process-map:${alt}:overrides:v1`)).not.toBeNull();
  });
});
