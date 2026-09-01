import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { DEFAULT_MAP, mapAlias, mapIdFromEnv, mapOutDir, mapTitle } from './scripts/mapTarget.ts';

// Какую карту собираем — из переменной MAP (scripts/mapTarget.ts).
// ЭТОТ ЖЕ АЛИАС ОБЯЗАН СТОЯТЬ В vitest.config.ts: Vitest при наличии своего
// конфига vite.config.ts не читает вовсе, и алиас только здесь дал бы зелёный
// `npm run build` и красный `vitest run`. Инлайнить путь нельзя — только
// mapAlias() из общего модуля.
const mapId = mapIdFromEnv();

const TITLE_TAG = /<title>[^<]*<\/title>/;

/**
 * Подставляет в index.html заголовок собираемой карты.
 *
 * ЗАЧЕМ ПЛАГИН, А НЕ document.title В РАНТАЙМЕ. HTML отдаётся до JS: вкладка
 * успела бы мигнуть чужим заголовком, а во view-source остался бы неверный.
 * Источник текста — те же данные, что и у шапки страницы, второго списка
 * названий не появляется.
 *
 * БРОСАЕТ, если тега нет: иначе на странице второй карты молча остался бы
 * заголовок первой, и ни сборка, ни один тест этого бы не заметили.
 */
function mapTitlePlugin(title: string): Plugin {
  return {
    name: 'inplan-map-title',
    transformIndexHtml(html) {
      if (!TITLE_TAG.test(html)) {
        throw new Error(
          'В index.html не найден тег <title> — заголовок карты подставить некуда. ' +
            'Плагин inplan-map-title (vite.config.ts) рассчитывает на него.',
        );
      }
      const escaped = title.replace(/&/g, '&amp;').replace(/</g, '&lt;');
      return html.replace(TITLE_TAG, `<title>${escaped}</title>`);
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  // base относительный (SPEC §6): приложение живёт в iframe в подкаталоге, и
  // благодаря этому вторая карта раздаётся из dist/<id>/ без правок путей.
  base: './',
  plugins: [react(), mapTitlePlugin(mapTitle(mapId))],
  resolve: { alias: mapAlias(mapId) },
  build: {
    // Карта по умолчанию — в корень dist, остальные — в подкаталог по id.
    // ПОРЯДОК СБОРОК ВАЖЕН: сборка карты по умолчанию вычищает dist целиком,
    // включая подкаталоги. Поэтому она идёт ПЕРВОЙ (см. скрипт build).
    outDir: mapOutDir(mapId),
    emptyOutDir: mapId === DEFAULT_MAP,
  },
});
