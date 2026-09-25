import { defineConfig, configDefaults } from 'vitest/config';
import { mapAlias, UNIT_TEST_MAP } from './scripts/mapTarget.ts';

// АЛИАС ОБЯЗАН БЫТЬ И ЗДЕСЬ, И В vite.config.ts. Vitest при наличии
// vitest.config.* не читает vite.config.ts вовсе — не мержит, а заменяет.
// Алиас только в одном из файлов даёт зелёный `npm run build` и красный
// `vitest run` (или наоборот). Инлайнить путь нельзя: оба берут его из
// scripts/mapTarget.ts, иначе конфиги разъедутся молча.
//
// КАРТА ЗДЕСЬ — UNIT_TEST_MAP, А НЕ mapIdFromEnv() (process-map-9mn.34). Сборка
// выбирает страницу переменной MAP, юнит-тесты — нет: их страница закреплена
// за snp навсегда, почему — см. комментарий у UNIT_TEST_MAP. Переменная MAP,
// оставшаяся в оболочке от `npm run build:mrp`, больше не подменяет тестам
// карту. Сторож — tests/unitPage.test.ts.

/**
 * Алиасы данных для Vitest: ТЕ ЖЕ каталоги, что даёт mapAlias(), но у КАЖДОГО
 * алиаса СВОЙ id модуля — суффикс `?<имя алиаса без @>`.
 *
 * ЗАЧЕМ СУФФИКС. У страницы без второй версии mapAlias() ведёт `@map` и
 * `@map-alt` в ОДИН каталог (так задумано, см. mapAlias). Приложению это
 * безразлично, а тестам — нет: vi.mock подменяет модуль по РАЗРЕШЁННОМУ id, и
 * при совпадении путей vi.mock('@map/process.json') и
 * vi.mock('@map-alt/process.json') ложатся на один и тот же модуль. Второй
 * побеждает, versions.ts получает одну фикстуру в обоих импортах, и страница
 * из двух фикстур (tests/fixtures/pageMocks.ts) молча становится страницей из
 * одной. Проверено на странице mrp, у которой второй версии нет: без суффикса
 * DEFAULT_VERSION_ID становился 'fixture-alt'. После process-map-9mn.20 второй
 * версии лишится и snp — то есть именно юнит-тестовая страница.
 *
 * ПОЧЕМУ НАСТОЯЩЕЙ СТРАНИЦЕ ЭТО НЕ ВРЕДИТ. Разные id дают два экземпляра
 * одного JSON вместо одного, а versions.ts сравнивает версии по полю id, а не
 * по ссылке — ровно потому, что «Rollup дедуплицирует модуль, а Vitest — не
 * обязательно». Список версий страницы без второй версии остаётся из одной
 * записи. Плагин JSON в Vite пропускает любой запрос, кроме служебных (?raw,
 * ?url, ?worker), так что `process.json?map-alt` разбирается как обычный JSON.
 *
 * Сторож — tests/unitPage.test.ts: он читает ОДИН файл через оба алиаса и
 * проверяет, что подмена одного не задевает другой.
 */
function testAlias(
  alias: Readonly<Record<string, string>>,
): { find: RegExp; replacement: string }[] {
  return Object.entries(alias).map(([name, dir]) => ({
    // Имя целиком и «/» за ним: '@map' не должен захватить '@map-alt/…'.
    find: new RegExp(`^${escapeRegExp(name)}/(.*)$`),
    // `$1` — подстановка String.replace (плагин алиасов делает именно её), а не
    // интерполяция шаблона. Прямые слэши — чтобы путь Windows не зависел от
    // того, как его нормализует резолвер.
    replacement: `${dir.replace(/\\/g, '/')}/$1?${name.replace(/^@/, '')}`,
  }));
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export default defineConfig({
  resolve: { alias: testAlias(mapAlias(UNIT_TEST_MAP)) },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    // e2e/ гоняет Playwright отдельной командой (SPEC §7): его test.beforeEach
    // несовместим с раннером Vitest.
    //
    // .claude/worktrees/ — worktree сессионных агентов: полная копия репозитория,
    // вложенная в репозиторий. Без этого исключения Vitest заходит внутрь и
    // собирает оттуда и Playwright-спеки, и вторые копии собственных тестов —
    // `npm run check` краснел 13 файлами у всякого, у кого worktree существует,
    // причём по причине, не имеющей отношения к его правкам.
    exclude: [...configDefaults.exclude, 'e2e/**', '.claude/worktrees/**'],
  },
});
