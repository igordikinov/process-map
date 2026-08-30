# SPEC — Техническая спецификация «In.Plan Process Map»

Версия 1.0 · 24.08.2026. Дополняет PRD.md. Референс визуала — `Мокеты процесса In.Plan.zip` (артборды A1–A4 + дополнение A5 «редактор ссылки»).

## 1. Стек

| Слой           | Выбор                                                   | Почему                                                      |
| -------------- | ------------------------------------------------------- | ----------------------------------------------------------- |
| Сборка         | Vite 5, TypeScript strict                               | статический бандл, быстрый dev                              |
| UI             | React 18                                                | требование React Flow                                       |
| Граф           | `@xyflow/react` (React Flow 12)                         | зум/пан, кастомные узлы, ортогональные рёбра (`smoothstep`) |
| Автолейаут     | `@dagrejs/dagre` — только в скрипте `scripts/layout.ts` | генерация стартовых координат, в рантайме не используется   |
| Стили          | CSS Modules + CSS-переменные из токенов In.Plan         | без Tailwind, чтобы совпасть с макетом                      |
| Состояние      | `zustand`                                               | компактно, без бойлерплейта                                 |
| Валидация JSON | `zod`                                                   | схема данных + проверка импорта                             |
| Тесты          | Vitest + Testing Library, Playwright для e2e            |                                                             |
| Линт           | ESLint + Prettier                                       |                                                             |

Пакетов помимо перечисленных не добавлять без записи в `bd`-задаче.

## 2. Структура репозитория

```
process-map/
  CLAUDE.md                 # инструкции агентам (см. CLAUDE.md)
  PRD.md  SPEC.md
  .beads/                   # трекер задач bd
  design/                   # распакованный макет Claude Design (только для чтения)
  src/
    assets/icons/*.svg      # иконки из design/assets/icons; импортируются
                            # как ассеты Vite (реестр assets/icons/index.ts),
                            # не через public/ — см. process-map-o62
    main.tsx  App.tsx
    config.ts               # linkTarget: '_top' | '_blank', compactHeight: 640
    data/process.json       # ИСТОЧНИК ИСТИНЫ
    data/schema.ts          # zod-схема + типы
    data/loader.ts          # merge JSON + localStorage overrides
    store/useProcessStore.ts
    theme/tokens.css        # переменные из design/_ds/tokens/*.css
    theme/sizes.ts          # размеры узлов числами для React Flow и dagre;
                            # источник истины для --pm-*-node-* (process-map-vhg)
    theme/global.css
    components/
      Overview/             # уровень 1
      StageDetail/          # уровень 2
      nodes/                # StageNode, StepNode, DataNode, IntegrationNode, WarningNode
      edges/                # ProcessEdge (фиолетовый), IntegrationEdge (синий пунктир)
      NodeDrawer/           # боковая панель + ScreenLinkSection + ScreenLinkForm
      Toolbar/              # зум, fit, toggle интеграций, Просмотр/Редактор, экспорт/импорт
      Legend/
      Breadcrumbs/
    hooks/useFrameSize.ts   # ResizeObserver → compact
    hooks/useDeepLink.ts
    utils/url.ts            # валидация, открытие ссылки
    i18n/ru.ts              # все строки UI
  scripts/
    import-pptx.py          # pptx → process.json: содержание + геометрия слайда
    layout.ts               # dagre → координаты (position)
    data.ts                 # весь конвейер одной командой: npm run data
  tests/  e2e/
```

## 3. Модель данных (`process.json`)

```ts
type NodeType = 'step' | 'data' | 'integration' | 'warning';
type SystemCode = 'DP' | 'PS' | 'IO' | 'ERP' | 'MRP' | 'INPLAN';

interface ScreenLink {
  title: string; // «Планирование поставок › Объёмный план»
  url: string; // https://...
}

interface ProcessNode {
  id: string; // kebab-case, уникален глобально
  type: NodeType;
  label: string; // ≤ 2 строки
  description?: string;
  group?: string; // id группы (dashed-контейнер), напр. "unconstrained"
  direction?: 'in' | 'out'; // колонка data-узла: вход или выход этапа
  inputs?: string[]; // человекочитаемые
  outputs?: string[];
  system?: SystemCode;
  owner?: string;
  screen?: ScreenLink;
  position: { x: number; y: number }; // что показывает приложение (считает layout.ts)
  slidePosition?: { x: number; y: number }; // исходная геометрия слайда (пишет import-pptx.py)
}

interface Group {
  id: string;
  label: string;
}

interface Edge {
  id: string;
  source: string;
  target: string;
  kind: 'process' | 'integration' | 'data';
  label?: string;
}

interface ExternalIO {
  // свимлейны уровня 1 и колонки уровня 2
  system: SystemCode;
  label: string;
  stage: number;
  direction: 'in' | 'out';
}

interface Stage {
  id: string;
  number: 1 | 2 | 3 | 4;
  title: string;
  shortTitle: string;
  keyOutputs: string[]; // ≤ 3
  warningsCount?: number;
  screen?: ScreenLink;
  groups: Group[];
  nodes: ProcessNode[];
  edges: Edge[];
  inputs: ExternalIO[];
  outputs: ExternalIO[];
}

interface ProcessMap {
  version: string;
  updatedAt: string;
  title: string;
  stages: Stage[];
  overviewEdges: Edge[]; // связи этап→этап и система→этап
}
```

Правила: `id` стабильны (по ним работают deep-link и localStorage); `position` обязателен; JSON проходит `schema.parse()` в тесте `tests/data.test.ts`, который также проверяет, что число узлов ≥ 40 и все `edge.source/target` существуют.

### Конвейер данных: `npm run data`

`process.json` собирается двумя шагами, и порядок между ними обязателен:

1. `scripts/import-pptx.py` — содержание из презентации; в `position` кладётся **сырая геометрия слайда** (на ней карточки накладываются), её копия — в `slidePosition`;
2. `scripts/layout.ts` (`npm run layout`) — dagre считает по `slidePosition` пригодные координаты и перезаписывает **только** `position`.

Обе половины склеены в одну команду `npm run data`, чтобы порядок не приходилось помнить (`process-map-3b9`). Незавершённый конвейер виден в `npm run check`: `tests/layout.test.ts` сверяет координаты файла с пересчётом.

`slidePosition` — служебное поле: в UI не используется, задаёт вход раскладки. Раскладка обязана сидироваться им, а не `position`, который сама же перезаписывает, — иначе после первого прогона она опирается на собственный прошлый результат, а геометрия презентации теряется навсегда (`process-map-cxn`). Поле необязательное: документ без него валиден, раскладка на нём откатывается на `position` и печатает предупреждение.

### `direction`: колонки входов и выходов

Колонку data-узла на экране детализации (§4.2) задаёт **явное поле `direction`**, а не координата (`process-map-24p`). Единственный источник правила — `src/utils/stageNodes.ts::splitStageDataNodes`; его читают раскладка, счётчик в крошках и сам экран.

Значение ставит импортёр по **происхождению фигуры**, а не эвристикой: data-узел рождается ровно в двух местах, и каждое знает направление точно — левая колонка входов слайда детализации даёт `'in'`, блок выходов этапа под его контейнером на слайде обзора даёт `'out'`. Поэтому поле стоит у **всех** data-узлов; у остальных типов оно бессмысленно и не проставляется. Ручной правкой это поле не является и в перенос ручных полей (`PRESERVED_NODE_FIELDS`) не входит.

Выводить направление из координат нельзя: блоки выходов этапов 1 и 2 презентация рисует левее середины области шагов, и прежнее правило «левее середины — вход» давало у этих этапов **ноль выходов** при 2–3 ключевых выходах на карточке обзора — экран противоречил сам себе.

Поле необязательное: документ без него (старый файл, экспорт стороннего инструмента, §4.7) остаётся валидным, и такой узел классифицируется прежним геометрическим правилом-фолбэком.

Артефакт, названный выходом этапа в обзоре, но уже существующий узлом колонки входов на слайде детализации, остаётся входом и вторым узлом не заводится — расхождение печатается в отчёте импортёра, а не разрешается за владельца процесса.

### Рёбра по решению владельца процесса

Всё содержание документа читается из презентации. Единственное исключение — `OWNER_DECISION_EDGES` в `scripts/import-pptx.py`: рёбра, которых на слайде нет и которые добавлены **по зафиксированному решению владельца процесса** (`process-map-7bz` — группа «Публикация планов» этапа 3). Дописать их прямо в `process.json` нельзя: импортёр собирает файл с нуля и сотрёт их следующим прогоном (`process-map-2dj`). Объявление в коде переживает перегенерацию по построению и остаётся на виду; отчёт импортёра печатает такие рёбра отдельным блоком, а `tests/importPreserve.test.ts` сверяет объявление с файлом в обе стороны.

### Overrides (localStorage)

Ключ `inplan-process-map:overrides:v1`, значение `Record<nodeId, { screen?: ScreenLink | null }>`. `loader.ts` накладывает overrides поверх JSON при старте. Экспорт отдаёт полный слитый `process.json`; импорт валидирует zod'ом и заменяет overrides.

## 4. Экраны и поведение

### 4.1 Обзор (A1)

- Верхняя полоса 52 px: заголовок, бейдж «4 этапа», справа дата `updatedAt`.
- Полотно React Flow с точечной сеткой (`Background variant=dots gap=16`).
- Два dashed-контейнера свимлейнов (in/out) как узлы типа `group`, не перетаскиваются.
- Третий dashed-контейнер того же стиля охватывает все 4 карточки этапов, заголовок «Модуль SNP». В отличие от свимлейнов не зависит от toggle «Показать интеграции»: описывает сам процесс, а не интеграции. В компактном режиме (§4.5) не рисуется. Решение владельца от 30.08.2026 (`process-map-sni`); в артборде A1 этой рамки нет — расхождение с макетом осознанное.
- 4 `StageNode` 274×210: номер, название, разделитель, «Ключевые выходы» (≤ 3), внизу строка «Открыть в In.Plan →», если `stage.screen`. Активный/hover — фиолетовая верхняя полоска.
- Рёбра этап→этап: `ProcessEdge` фиолетовый 1.8 px; система→этап: `IntegrationEdge` синий пунктир 1.3 px, `smoothstep`.
- Все узлы `draggable=false`, `nodesConnectable=false`. Клик по StageNode → `navigate(stage)`.

### 4.2 Детализация (A2)

- Хлебные крошки «E2E-процесс › {stage.title}» + бейдж «Этап N» + кнопка назад; справа счётчик «N шагов · M входов · K выходов».
- Слева колонка `DataNode` входов (200×56, подпись-источник), справа — выходов; посередине группы шагов (`group`-узлы с dashed-рамкой и заголовком).
- `StepNode` 318×52: иконка по типу, текст, справа иконка `link-external.svg` если `node.screen` (клик по иконке → `openScreen`, `stopPropagation`).
- `WarningNode` — фон `#fff8ed`, полоска `#ff9a3b`.
- Клик по любому узлу → Drawer.

### 4.3 Drawer (A3)

- Ширина 360, справа, поверх полотна; полотно приглушается `rgba(31,31,32,.10)`, выбранный узел подсвечен `box-shadow 0 0 0 4px rgba(144,0,255,.14)`.
- Секции по порядку: описание → **Экран в системе** → Входы → Выходы → Система/модуль → Ответственный.
- «Экран в системе»: иконка + `screen.title` + url серым в одну строку с `text-overflow`. Нет ссылки → «Ссылка не задана» + action «Добавить» (только в редакторе).
- Футер: «Открыть в модуле» (primary, disabled без ссылки). Кнопка «Подробнее» из макета в v1 не реализуется — решение владельца процесса (process-map-wo8): она прокручивала бы к описанию, уже видимому на этой же панели, то есть обещала больше, чем делала.
- Esc / клик по фону закрывает.

### 4.4 Редактор (A5)

- Toggle «Просмотр / Редактор» в тулбаре. В `localStorage` не сохраняется — при загрузке всегда «Просмотр».
- Форма: `title` (обязательно, ≤ 80), `url` (обязательно, `new URL()` + протокол `https:`; `http:` допускается с предупреждением). Ошибка «Введите корректный URL». Сохранить → override, Отмена → откат. Кнопка «Удалить ссылку» пишет `screen: null`.
- В тулбаре редактора: «Экспорт JSON» (скачивает `process.json`), «Импорт JSON» (file input), «Сбросить правки».

### 4.5 Компактный режим (A4)

Триггер: высота контейнера < `config.compactHeight` (640). Изменения: шапка 44 px, свимлейны заменяются на одну строку-бейдж «Внешние системы DP PS IO ERP MRP», карточки этапов 228×200 с 2 выходами, легенда сворачивается в кнопку-иконку, `fitView` вызывается заново.

### 4.6 Тулбар

Справа сверху: toggle «Показать интеграции» (скрывает `IntegrationEdge` и узлы систем), зум −/%/+/fit. Реализация через `useReactFlow()`.

### 4.7 Deep-link

`?stage=2` → сразу уровень 2; `&node=<id>` → плюс открытый Drawer. При навигации URL обновляется через `history.replaceState` (не `pushState`, чтобы не ломать историю родительской вики).

### 4.8 Открытие ссылок

`utils/url.ts::openScreen(url)`: `window.open(url, config.linkTarget)`; если `linkTarget === '_top'` и `window.top` недоступен (SecurityError), фолбэк на `_blank`. Тест покрывает оба пути.

## 5. Визуальные токены

Взять из `design/_ds/.../tokens/colors.css`, `typography.css`, `spacing.css`, перенести в `src/theme/tokens.css` под теми же именами переменных. Ключевые значения: фон полотна `#f5f6f8`, сетка `#dfdfe0`, границы `#eaeaea`/`#d4d5d6`, текст `#212529`/`#5a5a5c`/`#adb0b4`, акцент `#9000ff` (hover `#6f00ce`, light `#d899ff`), интеграция `#0d56e2`, предупреждение `#ff9a3b`, шрифт `'Open Sans', system-ui`. Иконки — из `design/assets/icons`.

## 6. Встраивание в In.Plan

```html
<iframe
  src="https://<host>/process-map/?stage=1"
  style="width:100%;height:720px;border:0"
  loading="lazy"
></iframe>
```

`vite.config.ts`: `base: './'` — чтобы бандл работал из любого подкаталога. В `dist/` не должно быть абсолютных путей. Сервер не должен отдавать `X-Frame-Options: DENY`; при необходимости `Content-Security-Policy: frame-ancestors https://*.company.ru`.

Атрибут `allow="clipboard-write"` из версии 1.0 убран: в v1 приложение с буфером обмена не работает (`process-map-dps`, проверено grep'ом по `src/`).

Три условия работоспособности, найденные при реализации. Развёрнуто — в `README.md`, там же чек-лист приёмки на стенде.

1. **Завершающий слэш обязателен** (`process-map-phd`). При `base: './'` `index.html` ссылается на `./assets/…` относительно URL документа, поэтому по адресу `/process-map` (без слэша) браузер запросит `/assets/…` в корне хоста и получит 404 — не загрузится сам бандл. Лечится только редиректом 301 на стороне хостинга; требование к хостингу, не к приложению.
2. **`sandbox` ломает `_top`-навигацию молча** (`process-map-6ap`). Фолбэк `_top → _blank` в `openScreen` (§4.8) срабатывает по `SecurityError`, а `sandbox` без `allow-top-navigation` браузер применяет **без исключения** — переход просто не происходит. Требование к встраивающей стороне: либо без `sandbox`, либо с `allow-top-navigation-by-user-activation` (плюс `allow-popups`, `allow-scripts`, `allow-same-origin` — без последнего недоступен `localStorage` для overrides §3).
3. **Только https** (PRD §9): http-фрейм в https-вики блокируется как mixed content.

## 7. Тестирование

- `tests/data.test.ts` — схема, целостность рёбер, полнота (список обязательных id шагов из презентации в `tests/fixtures/required-nodes.json`).
- `tests/layout.test.ts` — раскладка: узлы не пересекаются, колонки по краям, и конвейер данных (§3): координаты файла = пересчёт по `slidePosition`, сид не зависит от `position`.
- `tests/url.test.ts` — валидация и `openScreen`.
- `tests/loader.test.ts` — merge overrides, импорт/экспорт round-trip.
- `e2e/`: обзор → этап 2 → шаг → Drawer → «Открыть в модуле» (перехват `window.open`); редактор: сохранить ссылку, перезагрузить, ссылка на месте; компактный режим при viewport 1024×600.
- `npm run check` = typecheck + lint + unit; `npm run e2e` отдельно.

## 8. Definition of Done для задачи

Код + тесты зелёные (`npm run check`) + при UI-задаче скриншот Playwright сравнён глазами с соответствующим артбордом + `bd close <id> "…"` с кратким описанием.
