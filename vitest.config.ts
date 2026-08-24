import { defineConfig, configDefaults } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    // e2e/ гоняет Playwright отдельной командой (SPEC §7): его test.beforeEach
    // несовместим с раннером Vitest.
    exclude: [...configDefaults.exclude, 'e2e/**'],
  },
});
