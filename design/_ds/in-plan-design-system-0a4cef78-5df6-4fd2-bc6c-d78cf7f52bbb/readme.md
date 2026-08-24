# In.Plan Design System

**In.Plan** («Платформа интегрированного планирования», in-plan.ru) is a Russian enterprise **integrated supply-chain planning (SCP) platform**. It is a dense, data-heavy B2B web application: planners work in huge editable grids, Gantt charts, dashboards and process managers across planning modules — Демандпланирование (Demand Planning), Планирование поставок (Supply Planning), Производственное расписание (Production Scheduling), Оптимизация запасов (Inventory Optimization) and Платформа (Platform administration).

The real product is Angular 21 + Angular Material, themed by the proprietary **scp-ui** UI kit (npm `scp-ui` 2.6.0). This design system recreates its tokens, iconography and component families in framework-agnostic CSS + React so design agents can produce on-brand screens and assets.

## Sources
All extracted from the attached local codebase mount `in plan front/` (GitLab: `gitlab.platform.in-plan.ru/scp/code/front-end/…`):
- `scp-front/scp-front (1)/scp-front (2)/` — main monorepo: `scp-shell` (host SPA: header, sidebar, tabs, home, feature screens), `scp-shared` (icon set — 243 SVGs, domain components), `scp-grid`, `scp-graph`, `scp-sku-basecode`, theme-source (Tokens Studio JSON)
- `scp-ui/scp-ui/` — the UI kit library (component inventory ground truth): styles under `projects/scp-ui/src/styles/` (`_variables.scss`, `themes/_variables.light.scss`, `themes/light-theme.scss`)
- `scp-platform`, `scp-gantt`, `scp-query-builder-dev`, `scp-datetime-picker-dev`, `keycloak-angular`, `openapi` — supporting repos
- No Figma was provided.

**Logo**: real PNG assets copied to `assets/` (`header-logo-in.png` + `header-logo-plan.png` — “in.” purple block + “plan” white wordmark, used side-by-side on the dark sidebar; `index-logo.png` large lockup; `logo-in.png`/`logo-plan.png` alternates). The wordmark is white — always place on dark or purple backgrounds.

**Fonts caveat**: the repo self-hosts Open Sans / Inter / PT Sans / Roboto / Material Icons, but the binary font files were empty in the mount. `tokens/fonts.css` substitutes the identical families from Google Fonts CDN (Open Sans + Material Icons). Swap to self-hosted files when provided.

## CONTENT FUNDAMENTALS
- **Language: Russian.** All product copy is Russian; English appears only in technical labels (KPI, Prod/Dev, MIN/MAX).
- **Tone: formal, terse, instrumental.** Enterprise software for professionals; zero marketing voice inside the app. The one warm moment is the login/home greeting «Добро пожаловать!».
- **Address: formal «вы»** (capitalized mid-UI only at sentence start): «Вы ещё не совершали действий, которые можно отменить».
- **Casing: sentence case everywhere.** No Title Case. Uppercase reserved for tiny section labels (sidebar «НАСТРОЙКИ»-style menu titles, «KPI», MIN/MAX).
- **Buttons: infinitive verbs**, one or two words: «Сохранить», «Отменить», «Применить», «Свернуть», «Подробнее». Dialog default pair: Отменить / Применить.
- **Tooltips: short noun phrases**: «Менеджер процессов», «Личный кабинет», «Сценарий/версии», «Назад».
- **Long-form warnings are complete, dry sentences**: «Для сценария было выполнено слияние с родительской версией. В данном сценарии нельзя изменять данные…».
- **Dates**: `dd.MM.yyyy HH:mm`. Lists separated by ` | ` pipes in logs/history.
- **No emoji, ever.** No exclamation marks in operational UI.
- Domain vocabulary: сценарий, версия, мастер-версия, срез, показатель, метаданные, процесс, слияние, агрегация, перспектива.

## VISUAL FOUNDATIONS
- **Color model**: white work surfaces (`--scp-background-primary` #ffffff) on a cool light-grey canvas (`--scp-background-secondary` #f5f6f8); one loud **brand purple #9000ff** used precisely — primary buttons, active/selected markers, focus, links to brand actions; hover darkens (#6f00ce/#7320d9), pressed darkens more (#4f0096/#822be2). Tints for surfaces: #faf3ff, #f4e3ff, #f1e0ff.
- **The dark rail**: navigation sidebar is near-black **#1b1b1b** (submenu #404040, active row #9c9c9c) — the only dark region in an otherwise light app. Active menu item gets a **4px purple left bar**; child links get **6px orange (#ff9a3b) round bullets** (purple when active); expanded/hovered section headers turn **orange #ff9a3b** — orange is the sidebar's secondary accent, and also the warning color.
- **Semantics**: success green #22bb55 (bg #d2faef), error red #f22a41 (bg #ffd6db, newer scale #ee4444), warning orange #ff9a3b (bg #fcf0d4). Neutral text: primary #212529, secondary #adb0b4, disabled #d9d9d9.
- **Type**: Open Sans only, 300–700. UI base 14/20 regular; page title 600 28px; dialog title 600 18/24; body-s 12/16 for hints/notes/tooltips; tiny 12px uppercase 600 for group labels. Numbers in KPIs 700 25px+.
- **Spacing**: 4-based: 4/8/12/16/24/32/40/64 (`--scp-paddings-*`). Page gutters 32–35px; card padding 16–24px.
- **Radii**: buttons & small controls **4px**, cards/widgets/modals **8px**, larger sections 16px; pills 9999px (badge, env label). Never large blobby radii.
- **Borders**: hairline 1px; table grid #eff1f5, dividers #cbcbcb/#cacaca, control borders #949598 (hover #5a5a5c, active #020202), menu border #cfd4dc.
- **Shadows: nearly none.** Flat surfaces separated by borders and background tints. Exceptions: widgets `0 2px 4px rgba(0,0,0,.1)`, floating menus `0 4px 15px #00000026`, drawer `-2px 0 8px rgba(0,0,0,.15)`. No inner shadows, no glows.
- **Backgrounds & imagery**: app screens are flat color; the home page uses a full-bleed photo (`assets/home-bg.jpg`) with dark #404040 panels and white text on top; login uses `assets/login-background.jpg`. Illustration style = simple grey/purple line SVGs (`no-data.svg`, `not-found.svg`).
- **Hover states**: background shifts one step (#f5f6f8→#eaeaea→#dfdfe0 pressed) for neutral controls; purple-tint hover (#faf3ff) for brand-tertiary; text hovers turn purple; menu rows hover #eee7f3; dark-sidebar rows hover #9c9c9c. Disabled = bg #f5f6f8 / opacity .5, never blur.
- **Motion**: fast and functional — 200ms ease-in-out (sidebar, icons), 300ms width transitions (panels), 120ms controls, drawer 250ms cubic-bezier(.25,.8,.25,1). No bounces, no springs, no entrance choreography.
- **Transparency/blur**: virtually none (one backdrop-filter on the collapsed-sidebar submenu). Overlay scrim = plain rgba black.
- **Tables/grids** (the heart of the product): header row 36px semibold 600 on white or #f8f8f8, body rows 32px, 1px #eff1f5 grid lines, highlighted row #eee7f3, selected cell outlined **purple**, disabled cells #f5f6f8. Cell padding 8px. Font 14/16.
- **Tabs**: Material underline tabs; page-tabs 14px, height 38px, **4px purple underline** on active, black text, pin + close micro-icons inside each tab.
- **Cards/widgets**: white, 8px radius, 1px #cfcfcf border or light shadow, 14px label + big bold value; indicative scales are slim 8px bars with min/max marks and range colors.

## ICONOGRAPHY
- **Primary system: the proprietary 243-icon SVG set** copied verbatim to `assets/icons/svg/` (from `scp-shared/assets/icons/svg/`). In the real app they're registered via `MatIconRegistry.addSvgIcon` and used as `<mat-icon svgIcon="name">`. Mostly 16–24px grid, 1.5–2px stroke line icons; some status icons are filled+colored (notification-*, process-*, ok-green, warning-red). Recolored via CSS `stroke`/`fill` (sidebar forces white strokes).
- Naming is kebab-case by function: `filter`, `excel-export`, `chart-gantt`, `save-draft-to-master`, `process-inprogress`, module icons `mod-demand-planning`…`mod-platform`.
- **Secondary: Material Icons font** (`.material-icons` class, loaded in `tokens/fonts.css`) — the codebase ships the font; used rarely versus the SVG set.
- **Use the `Icon` React component** (`components/icon/`) which inlines any icon from `assets/icons/svg/` and recolors it.
- **No emoji, no unicode-as-icon** (except literal «-» dash for neutral trend). Never hand-draw replacements — the set is exhaustive.
- Trend arrows for widgets also live at `assets/icons/trend-arrow-up.svg` / `trend-arrow-bottom.svg`.

## Component inventory (ground truth = scp-ui 2.6.0)
button, checkbox, radio, input, textarea, select, slide-toggle, input-switcher, form-field (+field-error, field-hint), dialog, drawer, note, tooltip, widget (+indicative-scale), loading, expandable-text, scroll-container, form-state.
**Intentional additions** (exist in scp-shell code, not scp-ui): `Icon` (wrapper for the SVG set — needed outside Angular's icon registry), `Badge` (`.scp-badge` class in shell styles), `PageTabs` (shell `scp-tabs` pattern), `Spinner` (shell `scp-spinner`).

### Components (React, `window.InPlanDesignSystem_0a4cef`)
- `components/icon/` — **Icon**
- `components/buttons/` — **Button**
- `components/forms/` — **Input**, **Textarea**, **Select**, **Checkbox**, **Radio**, **SlideToggle**, **InputSwitcher**, **FormField**, **FieldHint**, **FieldError**
- `components/overlay/` — **Dialog**, **Drawer**, **Tooltip**
- `components/feedback/` — **Note**, **Loading**, **Spinner**, **FormState**
- `components/data/` — **Widget**, **IndicativeScale**, **Badge**, **ExpandableText**, **ScrollContainer**
- `components/navigation/` — **PageTabs**

## Index
- `styles.css` — global CSS entry (imports everything under `tokens/`)
- `tokens/` — `colors.css`, `typography.css`, `spacing.css`, `components.css`, `fonts.css`, `base.css`
- `assets/` — logos, home/login backgrounds, no-data illustrations, user avatar, `icons/svg/` (243 icons)
- `components/` — React primitives: `icon/`, `buttons/`, `forms/`, `overlay/`, `feedback/`, `data/`, `navigation/`
- `guidelines/` — foundation specimen cards (Design System tab)
- `ui_kits/scp-shell/` — full-screen recreation of the In.Plan planning workspace (sidebar + header + tabs + grid, interactive)
- `SKILL.md` — agent skill entry point
