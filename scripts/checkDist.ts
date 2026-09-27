import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const MODEL_MARKER = 'Сквозной процесс планирования In.Plan';
const pages = [
  { path: '', title: 'Карта процессов In.Plan', model: true },
  { path: 'snp', title: 'E2E-процесс планирования поставок', model: false },
  { path: 'mrp', title: 'Процесс планирования потребности в материалах', model: false },
] as const;

/** Проверяет результат сборки, независимо от реестра, который мог быть испорчен. */
export function checkDist(dist = resolve('dist')): void {
  for (const page of pages) {
    const root = join(dist, page.path);
    const html = readFileSync(join(root, 'index.html'), 'utf8');
    if (!html.includes(`<title>${page.title}</title>`)) throw new Error(`${root}: неверный title`);
    const scripts = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)].map((m) => m[1]!);
    if (scripts.length === 0) throw new Error(`${root}: нет JS в index.html`);
    for (const script of scripts) {
      if (!script.startsWith('./assets/'))
        throw new Error(`${root}: путь JS не относительный: ${script}`);
      readFileSync(resolve(root, script));
    }
    const assets = join(root, 'assets');
    const js = readdirSync(assets)
      .filter((name) => name.endsWith('.js'))
      .map((name) => readFileSync(join(assets, name), 'utf8'))
      .join('\n');
    if (js.includes(MODEL_MARKER) !== page.model) {
      throw new Error(
        `${root}: неверный состав версий — BPMN ${page.model ? 'отсутствует' : 'попала в отдельную карту'}`,
      );
    }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  checkDist(resolve(dirname(fileURLToPath(import.meta.url)), '../dist'));
  console.log('Состав dist проверен: inplan + BPMN в корне, отдельные SNP и MRP.');
}
