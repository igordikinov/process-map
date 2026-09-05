// Карта из модели, лежащая в репозитории, — сторожа (process-map-0c5.5).
//
// ПОЧЕМУ РЕГЕНЕРАЦИЯ, А НЕ КОНСТАНТА-ОТПЕЧАТОК.
//
// У карт из презентаций свежесть данных сторожит `MAP_DATA_FINGERPRINT` в
// scripts/import-pptx.py (tests/mapFingerprint.test.ts). Тот механизм существует
// по вынужденной причине: Python в CI не запускается, и сравнить файл с выводом
// импортёра нечем — сравнивают с числом, которое правят руками вместе с файлом.
//
// Отсюда его слепое пятно: константа НЕ ЛОВИТ «поменяли адаптер и
// перегенерировали неверно» — отпечаток обновили заодно, и всё зелено.
//
// Генератор BPMN написан на TypeScript и работает в том же рантайме, что и
// тесты, поэтому здесь можно то, чего нельзя там: перегенерировать карту прямо
// в прогоне и сверить побайтово. Это строго сильнее — ловит и правку адаптера,
// и ручную правку JSON, и апгрейд dagre, и забытую раскладку. Собственных
// констант-отпечатков для этой карты поэтому НЕ ЗАВОДИТСЯ: они были бы
// обещанием, что импортёр презентаций умеет эту карту, а он не умеет.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BPMN_MAP, bpmnSourceHash, buildBpmnMap } from '../scripts/bpmnMap.ts';
import { serialize } from '../scripts/layout.ts';
import { mapJsonPath } from '../scripts/mapTarget.ts';

const REGENERATE = `npm run data -- --map ${BPMN_MAP.id}`;

describe(`карта ${BPMN_MAP.id} собрана из ${BPMN_MAP.sourceFile}`, () => {
  it('файл в репозитории — в точности то, что даёт генератор сегодня', () => {
    const onDisk = readFileSync(mapJsonPath(BPMN_MAP.id), 'utf8');

    expect(
      serialize(buildBpmnMap()),
      `src/data/${BPMN_MAP.id}/process.json разошёлся с генератором.\n` +
        `Руками этот файл не правят — он собирается с нуля.\n` +
        `Если менялся адаптер или модель, прогоните: ${REGENERATE}`,
    ).toBe(onDisk);
  });

  /*
   * Вторая половина, и она про ДРУГОЙ отказ. Сверка выше сравнивает файл с тем,
   * что даёт адаптер СЕЙЧАС — то есть из модели, лежащей в репозитории сейчас.
   * Подменили модель и не перегенерировали — сверка покраснеет, но скажет
   * «файл разошёлся с генератором», и причину придётся искать. Эта проверка
   * называет её прямо.
   */
  it('модель не менялась с момента генерации карты', () => {
    expect(
      bpmnSourceHash(),
      `${BPMN_MAP.sourceFile} изменился. Перегенерируйте карту (${REGENERATE}), ` +
        `обновите sourceSha256 и updatedAt в scripts/bpmnMap.ts.`,
    ).toBe(BPMN_MAP.sourceSha256);
  });

  /*
   * Против тихой деградации. Если разбор однажды начнёт возвращать пустую или
   * куцую карту, оба теста выше останутся зелёными: сгенерированное совпадёт с
   * сгенерированным. Числа взяты из замера на этой модели и совпадают с
   * MODEL_FACTS в tests/bpmn/adapter.test.ts.
   */
  it('в карте десять этапов и 454 узла', () => {
    const map = buildBpmnMap();
    expect(map.stages).toHaveLength(10);
    expect(map.stages.reduce((sum, stage) => sum + stage.nodes.length, 0)).toBe(454);
    expect(map.overviewEdges).toHaveLength(18);
  });

  /*
   * Поля, которых в модели НЕТ: process@name и definitions@name в файле равны
   * null, а дата взялась бы из mtime, который не переживает git clone. Без
   * наложения карта назвалась бы именем файла. Тест сторожит само наложение —
   * убери его, и читатель увидит «In.Plan Process Model v11» в шапке.
   */
  it('заголовок, подпись рамки и дата — объявленные, а не выведенные из файла', () => {
    const map = buildBpmnMap();
    expect(map.id).toBe(BPMN_MAP.id);
    expect(map.title).toBe(BPMN_MAP.title);
    expect(map.moduleLabel).toBe(BPMN_MAP.moduleLabel);
    expect(map.updatedAt).toBe(BPMN_MAP.updatedAt);
    expect(map.title).not.toContain('.bpmn');
  });
});
