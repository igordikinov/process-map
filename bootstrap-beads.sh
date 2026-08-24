#!/usr/bin/env bash
# Заводит эпики и задачи проекта в beads. Запускать один раз после `bd init`.
# Синтаксис bd может отличаться по версиям — при ошибке сверьтесь с `bd create --help`.
set -euo pipefail

mk() { bd create "$1" -t "${2:-task}" -p "${3:-2}" | grep -oE "Created issue: [A-Za-z0-9._-]+" | head -1 | cut -d" " -f3; }

echo "== M1 — Скелет и данные"
M1=$(mk "M1: Скелет проекта и данные процесса" epic 0)
T11=$(mk "Инициализация Vite+React+TS+React Flow, ESLint/Prettier, npm run check (SPEC §1, §2)" task 0)
T12=$(mk "Токены In.Plan: перенос design/_ds/tokens → src/theme/tokens.css, иконки → public/icons (SPEC §5)" task 1)
T13=$(mk "Zod-схема process.json и типы (SPEC §3), tests/data.test.ts" task 0)
T14=$(mk "data-migrator: pptx → process.json через scripts/import-pptx.py, required-nodes.json (SPEC §3, §7)" task 0)
T15=$(mk "scripts/layout.ts: dagre → position для всех узлов, npm run layout" task 1)
T16=$(mk "Обзор уровня 1: StageNode, свимлейны, ProcessEdge/IntegrationEdge, Background dots (SPEC §4.1)" task 0)
T17=$(mk "Store zustand: текущий этап, выбранный узел, режим, showIntegrations; loader.ts merge overrides" task 0)
for t in $T11 $T12 $T13 $T14 $T15 $T16 $T17; do bd dep add "$t" "$M1" -t parent-child; done
bd dep add "$T13" "$T11"; bd dep add "$T14" "$T13"; bd dep add "$T15" "$T14"
bd dep add "$T16" "$T12"; bd dep add "$T16" "$T17"; bd dep add "$T17" "$T13"

echo "== M2 — Детализация и панель"
M2=$(mk "M2: Детализация этапа, Drawer, тулбар" epic 0)
T21=$(mk "StageDetail: группы-контейнеры, StepNode/DataNode/WarningNode, колонки входов/выходов (SPEC §4.2)" task 0)
T22=$(mk "Breadcrumbs + кнопка Назад + счётчик шагов/входов/выходов" task 1)
T23=$(mk "NodeDrawer: секции, футер, затемнение полотна, подсветка узла, Esc (SPEC §4.3)" task 0)
T24=$(mk "Toolbar: зум −/%/+/fit, toggle Показать интеграции; Legend (SPEC §4.6, F4)" task 1)
T25=$(mk "Unit-тесты компонентов уровня 2 и Drawer" task 2)
for t in $T21 $T22 $T23 $T24 $T25; do bd dep add "$t" "$M2" -t parent-child; done
bd dep add "$M2" "$M1"
bd dep add "$T23" "$T21"; bd dep add "$T25" "$T23"

echo "== M3 — Ссылки на экраны и редактор"
M3=$(mk "M3: screenUrl, режим Редактор, localStorage, экспорт/импорт" epic 0)
T31=$(mk "ScreenLink в узлах: иконка link-external на StepNode, строка 'Открыть в In.Plan' на StageNode, utils/url.ts openScreen с фолбэком _top→_blank (SPEC §4.8, F6)" task 0)
T32=$(mk "ScreenLinkSection в Drawer + кнопка 'Открыть в модуле' (F6)" task 0)
T33=$(mk "Режим Просмотр/Редактор, ScreenLinkForm с валидацией, overrides в localStorage (SPEC §4.4, F7)" task 0)
T34=$(mk "Экспорт/импорт JSON, Сбросить правки; tests/loader.test.ts round-trip (F8)" task 1)
T35=$(mk "tests/url.test.ts: валидация URL и оба пути openScreen" task 1)
for t in $T31 $T32 $T33 $T34 $T35; do bd dep add "$t" "$M3" -t parent-child; done
bd dep add "$M3" "$M2"
bd dep add "$T32" "$T31"; bd dep add "$T33" "$T32"; bd dep add "$T34" "$T33"; bd dep add "$T35" "$T31"

echo "== M4 — Встраивание"
M4=$(mk "M4: Компактный режим, deep-link, сборка, iframe" epic 0)
T41=$(mk "useFrameSize + компактный режим при высоте < 640 (SPEC §4.5, F9)" task 1)
T42=$(mk "Deep-link ?stage=&node= через replaceState (SPEC §4.7, F10)" task 2)
T43=$(mk "Playwright e2e: обзор→этап→Drawer→Открыть в модуле; редактор; компактный режим (SPEC §7)" task 1)
T44=$(mk "visual-qa: сверка A1–A5 с макетом, список расхождений, фиксы" task 1)
T45=$(mk "Сборка dist с base './', README по встраиванию iframe и заголовкам CSP (SPEC §6)" task 1)
T46=$(mk "Проверка в реальной странице In.Plan: iframe, _top навигация, https" task 0)
for t in $T41 $T42 $T43 $T44 $T45 $T46; do bd dep add "$t" "$M4" -t parent-child; done
bd dep add "$M4" "$M3"
bd dep add "$T44" "$T41"; bd dep add "$T45" "$T43"; bd dep add "$T46" "$T45"

bd remember "Приложение живёт в iframe In.Plan: base './', ссылки через config.linkTarget (_top, фолбэк _blank), history.replaceState вместо pushState."
bd remember "process.json — единственный источник истины по процессу; содержание только из SNP Е2Е процесс.pptx. Неясности → задача -t question."
echo "Готово. Далее: bd ready"
