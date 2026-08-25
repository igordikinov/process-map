import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ProcessNodeSchema, ProcessMapSchema, StageSchema } from '../src/data/schema.ts';
import processJson from '../src/data/process.json';

// Контракт между scripts/import-pptx.py и src/data/schema.ts (задача process-map-2dj).
//
// ЗАЧЕМ ЭТОТ ФАЙЛ
// ---------------
// Импортёр пересобирает src/data/process.json из презентации С НУЛЯ. Полей,
// которых в презентации нет (ссылка на экран In.Plan `screen`, `owner`),
// он породить не может — их проставляет человек. Значит перегенерация обязана
// переносить их из предыдущего файла, иначе она их стирает. Ради ссылок карта
// и встроена в вики, поэтому цена молчаливой потери — вся ценность карты.
//
// Перенос реализован в Python (carry_over_manual_fields), и его СЕМАНТИКУ
// проверяет самопроверка самого скрипта:
//
//     python scripts/import-pptx.py --self-test
//
// Здесь, из vitest, проверяется то, что можно проверить без Python и что
// самопроверка проверить не может — согласованность с zod-схемой:
//   1) список переносимых полей не потерял `screen`/`owner`;
//   2) переносимые поля в схеме необязательные (перенос «ничего» валиден);
//   3) порядок ключей в импортёре совпадает с порядком ключей схемы — от этого
//      зависит побайтовое совпадение файла с экспортом из приложения
//      (src/utils/processTransfer.ts::serializeProcessMap прогоняет карту через
//      zod, который пересобирает объекты в порядке схемы);
//   4) реальный process.json этому порядку соответствует.
//
// Что здесь НЕ покрыто (покрыто --self-test): сам перенос по id, различение
// `screen: null` и отсутствия ключа, отчёт о потерянных узлах, идемпотентность.

// import.meta.url под vitest+jsdom — не file:-URL (см. scripts/layout.ts::jsonPath),
// поэтому путь берётся от корня прогона. Отсутствие файла уронит тест на
// readFileSync — это и есть нужное поведение, молча пропускать нечего.
const IMPORTER_PATH = resolve(process.cwd(), 'scripts', 'import-pptx.py');
const importerSource = readFileSync(IMPORTER_PATH, 'utf8');

/** Читает python-кортеж строковых констант верхнего уровня по имени. */
function readPythonTuple(name: string): string[] {
  const match = new RegExp(`^${name}\\s*=\\s*\\(([^)]*)\\)`, 'm').exec(importerSource);
  if (match === null) {
    throw new Error(`В scripts/import-pptx.py не найдена константа ${name}`);
  }
  return [...match[1]!.matchAll(/"([^"]+)"/g)].map((item) => item[1]!);
}

const nodeKeyOrder = readPythonTuple('NODE_KEY_ORDER');
const stageKeyOrder = readPythonTuple('STAGE_KEY_ORDER');
const preservedNodeFields = readPythonTuple('PRESERVED_NODE_FIELDS');
const preservedStageFields = readPythonTuple('PRESERVED_STAGE_FIELDS');

const map = ProcessMapSchema.parse(processJson);

/** Ключи объекта в порядке, объявленном в схеме. */
function schemaKeys(shape: Record<string, unknown>): string[] {
  return Object.keys(shape);
}

describe('import-pptx.py: контракт переноса ручных полей', () => {
  it('переносит ссылку на экран и ответственного — поля, которых нет в презентации', () => {
    expect(preservedNodeFields).toContain('screen');
    expect(preservedNodeFields).toContain('owner');
    expect(preservedStageFields).toContain('screen');
  });

  it('все переносимые поля существуют в схеме и объявлены необязательными', () => {
    const nodeShape = ProcessNodeSchema.shape as Record<string, { isOptional(): boolean }>;
    for (const name of preservedNodeFields) {
      expect(schemaKeys(nodeShape), `ProcessNodeSchema.${name}`).toContain(name);
      expect(nodeShape[name]!.isOptional(), `ProcessNodeSchema.${name} должен быть optional`).toBe(
        true,
      );
    }
    const stageShape = StageSchema.shape as Record<string, { isOptional(): boolean }>;
    for (const name of preservedStageFields) {
      expect(schemaKeys(stageShape), `StageSchema.${name}`).toContain(name);
      expect(stageShape[name]!.isOptional(), `StageSchema.${name} должен быть optional`).toBe(true);
    }
  });

  it('порядок ключей импортёра совпадает с порядком ключей zod-схемы', () => {
    expect(nodeKeyOrder).toEqual(schemaKeys(ProcessNodeSchema.shape));
    expect(stageKeyOrder).toEqual(schemaKeys(StageSchema.shape));
  });

  it('ключи реального process.json лежат в этом же порядке', () => {
    const nodeIndex = new Map(nodeKeyOrder.map((key, index) => [key, index]));
    const stageIndex = new Map(stageKeyOrder.map((key, index) => [key, index]));

    for (const [index, stage] of map.stages.entries()) {
      const rawStage = (processJson as { stages: Record<string, unknown>[] }).stages[index]!;
      const stageKeys = Object.keys(rawStage);
      expect(stageKeys.filter((key) => !stageIndex.has(key)), `этап ${stage.id}`).toEqual([]);
      const stagePositions = stageKeys.map((key) => stageIndex.get(key)!);
      expect([...stagePositions].sort((a, b) => a - b), `этап ${stage.id}`).toEqual(stagePositions);

      const rawNodes = rawStage['nodes'] as Record<string, unknown>[];
      for (const rawNode of rawNodes) {
        const keys = Object.keys(rawNode);
        const label = `узел ${String(rawNode['id'])}`;
        expect(
          keys.filter((key) => !nodeIndex.has(key)),
          label,
        ).toEqual([]);
        const positions = keys.map((key) => nodeIndex.get(key)!);
        expect([...positions].sort((a, b) => a - b), label).toEqual(positions);
      }
    }
  });
});
