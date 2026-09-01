// Что e2e/maps/smoke.spec.ts ожидает увидеть на каждой карте
// (задача process-map-3wh.3).
//
// ЗАЧЕМ ОТДЕЛЬНАЯ ТАБЛИЦА. Смоук — единственный спек, который гоняется для
// ОБЕИХ карт, поэтому литерала вроде «Модуль SNP» в нём быть не может: он
// покраснел бы на MRP. Ожидания выбираются по имени проекта Playwright.
//
// e2e намеренно не импортируют ничего из src/ (в том числе i18n и данные):
// проверка «что видит пользователь» не должна брать ожидаемое значение из
// того же места, откуда его берёт приложение.

export interface MapExpectations {
  /** Подпись рамки вокруг потока этапов (.react-flow__node-flowLane). */
  moduleLabel: string;
}

export const MAP_EXPECTATIONS: Record<string, MapExpectations> = {
  snp: { moduleLabel: 'Модуль SNP' },
};

/**
 * Ожидания для текущего проекта Playwright.
 *
 * Проекты snp/mrp появляются в playwright.config.ts вместе со второй сборкой
 * (задача process-map-3wh.13). До этого конфиг однопроектный, и Playwright
 * даёт проекту пустое имя — тогда смоук гоняется против карты по умолчанию.
 */
export function expectationsFor(projectName: string): MapExpectations {
  const id = projectName === '' ? 'snp' : projectName;
  const expectations = MAP_EXPECTATIONS[id];
  if (expectations === undefined) {
    throw new Error(
      `Нет ожиданий для карты «${id}». Проект Playwright назван по id карты; ` +
        `добавьте запись в MAP_EXPECTATIONS (e2e/maps/expected.ts). ` +
        `Известны: ${Object.keys(MAP_EXPECTATIONS).join(', ')}.`,
    );
  }
  return expectations;
}
