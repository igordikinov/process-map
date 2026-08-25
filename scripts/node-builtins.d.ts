// Минимальные объявления типов для встроенных модулей Node, которыми пользуются
// scripts/layout.ts и тесты, читающие файлы репозитория
// (tests/importPreserve.test.ts).
//
// Почему не @types/node: пакета в проекте нет, а новая зависимость по CLAUDE.md
// заводится только отдельной задачей в bd. Здесь объявлено ровно то, что реально
// вызывается в scripts/**, — без попытки повторить настоящие типы Node.
// Файл лежит в scripts/, поэтому на код в src/ (рантайм-бандл) не влияет.

declare module 'node:fs' {
  export function readFileSync(path: string, encoding: 'utf8'): string;
  export function writeFileSync(
    path: string,
    data: string,
    options?: { encoding?: 'utf8' },
  ): void;
}

declare module 'node:module' {
  export function createRequire(url: string | URL): (id: string) => unknown;
}

declare module 'node:path' {
  export function resolve(...paths: string[]): string;
}

declare module 'node:url' {
  export function fileURLToPath(url: string | URL): string;
}

declare const process: {
  argv: string[];
  exitCode: number;
  /** Корень прогона: под vitest+jsdom import.meta.url не file:-URL. */
  cwd(): string;
};
