import { describe, expect, it } from 'vitest';
import { LaneSchema, ModuleSchema, ProcessMapSchema } from '../src/data/schema';
import { readImporterSource, readPythonTuple } from './helpers/importerSource';

const source = readImporterSource();

describe('контракт трёхуровневого импортёра', () => {
  it.each([
    ['MAP_KEY_ORDER', ProcessMapSchema],
    ['MODULE_KEY_ORDER', ModuleSchema],
    ['LANE_KEY_ORDER', LaneSchema],
  ] as const)('%s совпадает с порядком ключей схемы', (tuple, schema) => {
    expect(readPythonTuple(source, tuple)).toEqual(Object.keys(schema.shape));
  });

  it('ссылка модуля переносится как необязательное ручное поле', () => {
    expect(readPythonTuple(source, 'PRESERVED_MODULE_FIELDS')).toEqual(['screen']);
    expect(ModuleSchema.shape.screen.isOptional()).toBe(true);
  });
});
