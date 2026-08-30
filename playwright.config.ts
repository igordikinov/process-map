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
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },

  // Сервер поднимает сам Playwright, отдельного шага в CI быть НЕ должно:
  // reuseExistingServer в CI равен false, и на занятом порту прогон упадёт
  // с «is already used».
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !isCI,
  },
});
