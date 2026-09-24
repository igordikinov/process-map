import { defineConfig, configDefaults } from 'vitest/config';
import { mapAlias, mapIdFromEnv } from './scripts/mapTarget.ts';

// АЛИАС ОБЯЗАН БЫТЬ И ЗДЕСЬ, И В vite.config.ts. Vitest при наличии
// vitest.config.* не читает vite.config.ts вовсе — не мержит, а заменяет.
// Алиас только в одном из файлов даёт зелёный `npm run build` и красный
// `vitest run` (или наоборот). Инлайнить путь нельзя: оба берут его из
// scripts/mapTarget.ts, иначе конфиги разъедутся молча.
export default defineConfig({
  resolve: { alias: mapAlias(mapIdFromEnv()) },
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
