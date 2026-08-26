# CLAUDE.md — правила разработки In.Plan Process Map

Ты работаешь над статическим React Flow приложением по документам `PRD.md` и `SPEC.md`. Они — источник требований; при противоречии SPEC.md главнее. Референс визуала — папка `design/` (макет Claude Design, только чтение).

## Трекер задач: beads (`bd`)

Все работы ведутся только через `bd`. Никаких TODO в markdown и никаких задач «в голове».

Начало каждой сессии:
```bash
bd prime          # контекст и накопленные заметки проекта
bd ready          # что можно брать (нет открытых блокеров)
```
Цикл работы над задачей:
```bash
bd show <id>
bd update <id> --claim              # взять в работу атомарно
# ... реализация, тесты ...
npm run check
bd close <id> "что сделано, что проверено"
```
Правила:
- Одна задача = одна ветка `feat/<id>-<slug>` и один PR/коммит с `<id>` в заголовке.
- Нашёл новую работу, баг или вопрос — не делай молча, заведи задачу: `bd create "..." -t bug|task -p 1..3` и при необходимости `bd dep add <новая> <текущая>`.
- Узнал неочевидное про проект (ограничение In.Plan, поведение React Flow, решение по архитектуре) — `bd remember "..."`. Это единственная долговременная память между сессиями.
- Не закрывай задачу, если `npm run check` красный или DoD из SPEC.md §8 не выполнен.
- Эпики — родительские задачи `M1..M4`; дочерние имеют иерархические id (`bd-xxxx.1`). Порядок реализации задаёт `bd ready`, а не твоё желание.
- `.beads/issues.jsonl` обновляется автоматически (`export.auto`/`export.git-add` в `.beads/config.yaml` + хук `pre-commit`) — вручную гонять `bd export` не требуется; после клонирования репозитория один раз выполните `bd hooks install --beads` (подробности — README).

## Субагенты

Главный агент (ты в основной сессии) — оркестратор: планирует, декомпозирует, проверяет, коммитит. Реализацию делегируй субагентам через Task tool, по одному субагенту на bd-задачу, в изолированных worktree, когда задачи независимы и трогают разные папки.

Роли (передавай роль в первом абзаце промпта субагента):

- **implementer** — реализует одну bd-задачу. Получает: id, текст `bd show`, ссылки на разделы SPEC, список файлов, которые можно менять. Возвращает: список изменённых файлов, результат `npm run check`, что осталось неясным. Не закрывает задачу сам — закрывает оркестратор после проверки.
- **reviewer** — read-only. Получает diff и раздел SPEC. Ищет расхождения со спекой и макетом, отсутствующие тесты, лишние зависимости. Отвечает списком находок с severity; без правок кода.
- **visual-qa** — запускает `npm run dev`, снимает скриншоты Playwright для артборда A1..A5 в 1280×720 и 1024×600, сравнивает с `design/*.dc.html` (открыть в браузере) и перечисляет визуальные отличия: размеры, цвета, отступы, отсутствующие элементы.
- **data-migrator** — только M1: переносит содержимое `SNP Е2Е процесс.pptx` в `src/data/process.json` через `scripts/import-pptx.py` (python-pptx), затем расставляет координаты `scripts/layout.ts`. Обязан сверить количество шагов с презентацией и записать список id в `tests/fixtures/required-nodes.json`.

Параллелить можно: implementer'ов на задачах без общих файлов (например `nodes/*` и `NodeDrawer/*`). Нельзя параллелить: изменения `process.json`, `schema.ts`, `store/*` — это общий контракт, его правит один агент, остальные ждут (`bd dep add`).

После каждого implementer'а: оркестратор запускает reviewer, при UI-задаче — visual-qa, устраняет находки (сам или новым implementer'ом), потом `bd close`.

Промпт субагенту всегда содержит: роль, bd id, точные разделы SPEC, разрешённые файлы, команду проверки, формат ответа. Не пересказывай субагенту весь SPEC — дай ему прочитать файл.

## Кодовые правила

- TypeScript strict, без `any`. Все строки UI в `src/i18n/ru.ts`.
- Цвета и размеры только из `src/theme/tokens.css`; хардкод hex в компонентах запрещён (ESLint правило `no-restricted-syntax` на `#[0-9a-f]{3,6}` в tsx).
- Узлы React Flow не перетаскиваются и не соединяются в v1.
- Новая зависимость — только через задачу в `bd` с обоснованием.
- `base: './'` в Vite не трогать: приложение живёт в iframe в подкаталоге.
- Коммиты: `feat(<id>): ...`, `fix(<id>): ...`, `test(<id>): ...`.

## Команды

```bash
npm i
npm run dev          # http://localhost:5173
npm run check        # tsc + eslint + vitest
npm run e2e          # playwright
npm run build        # dist/
npm run layout       # пересчитать стартовые координаты (dagre) → process.json
```

## Чего не делать

- Не изобретать процесс: содержание этапов и шагов — только из презентации и process.json; неясности — задача с `-t question`, а не догадка.
- Не добавлять бэкенд, роутер, Tailwind, UI-киты.
- Не менять `design/`.


<!-- BEGIN BEADS INTEGRATION v:1 profile:minimal hash:6cd5cc61 -->
## Beads Issue Tracker

This project uses **bd (beads)** for issue tracking. Run `bd prime` to see full workflow context and commands.

### Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --claim  # Claim work
bd close <id>         # Complete work
```

### Rules

- Use `bd` for ALL task tracking — do NOT use TodoWrite, TaskCreate, or markdown TODO lists
- Run `bd prime` for detailed command reference and session close protocol
- Use `bd remember` for persistent knowledge — do NOT use MEMORY.md files

**Architecture in one line:** issues live in a local Dolt DB; sync uses `refs/dolt/data` on your git remote; `.beads/issues.jsonl` is a passive export. See https://github.com/gastownhall/beads/blob/main/docs/SYNC_CONCEPTS.md for details and anti-patterns.

## Agent Context Profiles

The managed Beads block is task-tracking guidance, not permission to override repository, user, or orchestrator instructions.

- **Conservative (default)**: Use `bd` for task tracking. Do not run git commits, git pushes, or Dolt remote sync unless explicitly asked. At handoff, report changed files, validation, and suggested next commands.
- **Minimal**: Keep tool instruction files as pointers to `bd prime`; use the same conservative git policy unless active instructions say otherwise.
- **Team-maintainer**: Only when the repository explicitly opts in, agents may close beads, run quality gates, commit, and push as part of session close. A current "do not commit" or "do not push" instruction still wins.

## Session Completion

This protocol applies when ending a Beads implementation workflow. It is subordinate to explicit user, repository, and orchestrator instructions.

1. **File issues for remaining work** - Create beads for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **Handle git/sync by active profile**:
   ```bash
   # Conservative/minimal/default: report status and proposed commands; wait for approval.
   git status

   # Team-maintainer opt-in only, unless current instructions forbid it:
   git pull --rebase
   git push
   git status
   ```
5. **Hand off** - Summarize changes, validation, issue status, and any blocked sync/commit/push step

**Critical rules:**
- Explicit user or orchestrator instructions override this Beads block.
- Do not commit or push without clear authority from the active profile or the current user request.
- If a required sync or push is blocked, stop and report the exact command and error.
<!-- END BEADS INTEGRATION -->
