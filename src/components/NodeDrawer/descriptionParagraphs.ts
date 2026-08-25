// Разбор многострочного `description` на абзацы (SPEC §3, §4.3).
//
// В process.json описания хранятся одной строкой с переносами `\n`, и это не
// «мягкая» вёрстка, а смысловая структура: у
// formirovanie-preduprezhdeniy-sp-posle-progona-planirovaniya-5-78 это таблица
// из 7 строк «причина → действие», у dezagregaciya-prognoza-po-produktu —
// 9 строк с маркерами «- ». Если отдать текст в один <div>, браузер склеит
// переносы в пробелы и получится нечитаемая простыня, поэтому каждая строка
// рендерится отдельным абзацем.
//
// Функция вынесена из компонента, чтобы её можно было проверить без DOM
// (tests/nodeDrawer.test.tsx) — и чтобы файл компонента не экспортировал
// ничего, кроме компонентов (react-refresh/only-export-components).

/**
 * Строки описания без пустых и без хвостовых пробелов.
 * `undefined` (описания нет) и строка из одних пробелов дают пустой массив —
 * вызывающий код по нему же решает, показывать ли секцию и кнопку «Подробнее».
 */
export function descriptionParagraphs(description: string | undefined): string[] {
  if (description === undefined) {
    return [];
  }
  return description
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}
