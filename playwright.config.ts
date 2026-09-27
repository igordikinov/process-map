import { defineConfig } from '@playwright/test';

// В CI прогон идёт отдельным job'ом, от которого зависит деплой на Pages
// (.github/workflows/deploy.yml, задача process-map-vjz.3).
const isCI = Boolean(process.env.CI);

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,

  // Локально ретраев нет: флак должен быть виден сразу, а не замазан повтором
  // (именно так месяц жил process-map-6ja). В CI два ретрая — там падение
  // бывает и от нагрузки на раннер, а разбирать его некому в момент прогона.
  retries: isCI ? 2 : 0,

  // Забытый test.only не должен молча сузить прогон в CI до одного теста.
  forbidOnly: isCI,

  // trace: 'on-first-retry' работает только при ненулевых retries — до этой
  // задачи их не было, и при падении в CI не осталось бы вообще никакой
  // диагностики. В CI дополнительно пишется HTML-отчёт: job выгружает его
  // артефактом, потому что текстового лога шага для разбора флака мало.
  reporter: isCI ? [['list'], ['html', { open: 'never' }]] : 'list',

  use: {
    trace: 'on-first-retry',
  },

  // Сценарии SNP остаются на SNP. Три уровня и версии проверяет inplan.
  projects: [
    {
      name: 'inplan',
      testMatch: ['**/modules.spec.ts', '**/version-switch.spec.ts', '**/maps/*.spec.ts'],
      use: { baseURL: 'http://localhost:5173' },
    },
    {
      name: 'snp',
      testIgnore: ['**/modules.spec.ts', '**/version-switch.spec.ts'],
      use: { baseURL: 'http://localhost:5175' },
    },
    { name: 'mrp', testDir: './e2e/maps', use: { baseURL: 'http://localhost:5174' } },
  ],

  // Сервер поднимает сам Playwright, отдельного шага в CI быть НЕ должно:
  // reuseExistingServer в CI равен false, и на занятом порту прогон упадёт
  // с «is already used».
  // Порт второй карты закреплён только здесь и в скрипте dev:mrp: в CI
  // reuseExistingServer=false, и занятый порт уронит прогон.
  webServer: [
    { command: 'npm run dev:snp', url: 'http://localhost:5175', reuseExistingServer: !isCI },
    {
      command: 'npm run dev:inplan',
      url: 'http://localhost:5173',
      reuseExistingServer: !isCI,
    },
    {
      command: 'npm run dev:mrp',
      url: 'http://localhost:5174',
      reuseExistingServer: !isCI,
    },
  ],
});
