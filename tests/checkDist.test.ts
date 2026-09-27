import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { checkDist } from '../scripts/checkDist';

const temps: string[] = [];
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'check-dist-'));
  temps.push(root);
  for (const [dir, title] of [
    ['', 'Карта процессов In.Plan'],
    ['snp', 'E2E-процесс планирования поставок'],
    ['mrp', 'Процесс планирования потребности в материалах'],
  ]) {
    mkdirSync(join(root, dir!, 'assets'), { recursive: true });
    writeFileSync(
      join(root, dir!, 'index.html'),
      `<title>${title}</title><script type="module" src="./assets/app.js"></script>`,
    );
    writeFileSync(
      join(root, dir!, 'assets/app.js'),
      dir === '' ? 'Сквозной процесс планирования In.Plan' : 'local map',
    );
  }
  return root;
}
afterEach(() => temps.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })));
it('принимает три страницы с двумя версиями только в корне', () =>
  expect(() => checkDist(fixture())).not.toThrow());
it.each(['', 'snp', 'mrp'])('ловит неверный состав версий на странице %s', (dir) => {
  const root = fixture();
  writeFileSync(
    join(root, dir, 'assets/app.js'),
    dir === '' ? 'no model' : 'Сквозной процесс планирования In.Plan',
  );
  expect(() => checkDist(root)).toThrow('BPMN');
});
it('ловит страницу с чужим заголовком', () => {
  const root = fixture();
  writeFileSync(join(root, 'snp/index.html'), '<title>Карта процессов In.Plan</title>');
  expect(() => checkDist(root)).toThrow('title');
});
it('ловит отсутствующий бандл', () => {
  const root = fixture();
  rmSync(join(root, 'mrp/assets/app.js'));
  expect(() => checkDist(root)).toThrow();
});
