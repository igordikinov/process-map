// Подробность под шагом на полотне уровня 2 (NodeType 'detail',
// process-map-9mn.32; карточка, выбор узла, выноска и пункт легенды —
// process-map-9mn.36).
//
// ЗАЧЕМ ЭТОТ ФАЙЛ. Ни на одной карте на диске подробностей нет, так что ни
// e2e, ни тесты на настоящих данных их не видят. Проверено мутациями (9mn.32):
// строка регистрации `detail: DetailNode` в nodeTypes удалялась, подпись из
// DetailNode — тоже, и весь корпус, кроме этого файла, оставался зелёным.
// Здесь держится:
//   · тип узла React Flow равен 'detail', то есть узел нарисован СВОИМ
//     компонентом: без регистрации React Flow молча подставил бы узел по
//     умолчанию (у него другой формат data, и текст бы пропал);
//   · текст виден целиком, с абзацами, и НИЧЕМ не обрезается;
//   · карточка — кнопка выбора узла, как у шага и данных: клик выбирает узел
//     и открывает панель (решение оркестратора, process-map-9mn.36). Пока
//     карточка была заглушкой, этот файл утверждал обратное — «кнопки нет»;
//   · хэндлы выноски на обоих концах: низ хоста, верх подробности;
//   · «Подробность» в легенде — там, где подробность есть.
//
// СТРАНИЦА ИЗ ФИКСТУР (tests/fixtures/pageMocks.ts): версия по умолчанию —
// двухуровневая фикстура с одной законной подробностью под первым шагом этапа
// 1, вторая версия — как у всех страниц из фикстур. Порядок и форма подмены —
// из шапки pageMocks.ts: vi.mock в этом файле, данные динамическим импортом.
// Константы подробности живут в vi.hoisted: фабрика исполняется раньше любого
// объявления в файле.
//
// jsdom не делает hit-testing и не считает раскладку: здесь проверяется, ЧТО
// нарисовано и какие стили к этому применены, а не то, что по этому можно
// кликнуть мышью в браузере (для этого — pointer-events обёртки ниже).
import { readFileSync, readdirSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { ReactFlow, ReactFlowProvider } from '@xyflow/react';
import App from '../src/App';
import { DetailLinkEdge } from '../src/components/edges';
import edgeStyles from '../src/components/edges/edges.module.css';
import detailStyles from '../src/components/nodes/DetailNode/DetailNode.module.css';
import { STEP_HANDLE } from '../src/components/nodes/StepNode';
import { loadBaseProcessMap } from '../src/data/loader';
import { validateIntegrity } from '../src/data/schema';
import { ru } from '../src/i18n/ru';
import { createInitialState, useProcessStore } from '../src/store/useProcessStore';

const DETAIL = vi.hoisted(() => ({
  id: 'stage-1-detail',
  edgeId: 'stage-1-edge-detail',
  // Первый узел этапа 1 двухуровневой фикстуры — шаг (sample-process.ts);
  // tests/data.test.ts вешает подробность туда же.
  stepId: 'stage-1-node-1',
  label: 'Первый абзац\nВторой абзац',
  /** Заголовок панели подробности — первый абзац подписи (process-map-9mn.37). */
  heading: 'Первый абзац',
}));

vi.mock('@map/process.json', async () => {
  const map = (await import('./fixtures/pageMocks')).fixtureDefaultVersion();
  const stage = map.stages[0];
  if (stage === undefined) {
    throw new Error('в двухуровневой фикстуре нет этапа 1');
  }
  stage.nodes.push({
    id: DETAIL.id,
    type: 'detail',
    label: DETAIL.label,
    position: { x: 120, y: 160 },
  });
  stage.edges.push({ id: DETAIL.edgeId, source: DETAIL.stepId, target: DETAIL.id, kind: 'data' });
  return { default: map };
});
vi.mock('@map-alt/process.json', async () =>
  (await import('./fixtures/pageMocks')).altVersionModule(),
);

beforeEach(() => {
  useProcessStore.setState(createInitialState());
  // App читает location.search при монтировании — см. tests/stageDetail.test.tsx.
  window.history.replaceState({}, '', '/');
});

/** Открывает этап `index` страницы из фикстур и рисует приложение. */
function renderStage(index: number) {
  const stage = loadBaseProcessMap().stages[index];
  expect(stage, `в фикстуре нет этапа с индексом ${index}`).toBeDefined();
  useProcessStore.getState().navigateToStage(stage!.id);
  return render(<App />);
}

/** Обёртка React Flow узла по id — внутри неё и хэндлы, и карточка. */
function nodeWrapper(container: HTMLElement, id: string): HTMLElement {
  const wrapper = container.querySelector<HTMLElement>(`.react-flow__node[data-id="${id}"]`);
  expect(wrapper, `узел ${id} не нарисован`).not.toBeNull();
  return wrapper!;
}

describe('DetailNode на полотне уровня 2', () => {
  it('предпосылка: подмена сработала, и подробность в карте законна', () => {
    // Без неё красное ниже могло бы значить «подробности в данных нет вовсе»,
    // а зелёное — что проверялась битая карта.
    const map = loadBaseProcessMap();
    const detail = map.stages[0]?.nodes.find((node) => node.id === DETAIL.id);
    expect(detail?.type).toBe('detail');
    expect(validateIntegrity(map)).toEqual([]);
  });

  it('рисуется своим компонентом: кнопка с полным текстом и типом узла в имени', () => {
    const { container } = renderStage(0);

    const wrapper = container.querySelector<HTMLElement>(
      `.react-flow__node-detail[data-id="${DETAIL.id}"]`,
    );
    expect(wrapper, 'узел подробности не нарисован типом detail').not.toBeNull();
    // Побайтово, с \n между абзацами: текст не обрезан и не пересобран.
    expect(wrapper?.textContent).toBe(DETAIL.label);

    const button = within(wrapper!).getByRole('button', {
      name: ru.detailNode.ariaLabel(DETAIL.label),
    });
    expect(button.textContent).toBe(DETAIL.label);
    // Достижима с клавиатуры: обычная кнопка в порядке обхода. Сама обёртка
    // React Flow фокуса не берёт (focusable: false в stageGraph.ts).
    expect(button.tabIndex).toBe(0);
    expect(wrapper?.hasAttribute('tabindex')).toBe(false);
    // Ловушка React Flow 12: без pointer-events: all на обёртке до кнопки в
    // браузере не дошёл бы ни один клик (см. INTERACTIVE_NODE_STYLE).
    expect(wrapper?.style.pointerEvents).toBe('all');
  });

  it('клик выбирает подробность и открывает панель узла', () => {
    renderStage(0);
    expect(useProcessStore.getState().selectedNodeId).toBeNull();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: ru.detailNode.ariaLabel(DETAIL.label) }));

    expect(useProcessStore.getState().selectedNodeId).toBe(DETAIL.id);
    // Панель — та же, что у любого узла (SPEC §4.3), но заголовок у
    // подробности — первый абзац подписи, а вся подпись дословно, с \n, — в
    // теле панели (process-map-9mn.37). Раньше здесь утверждалось «заголовок
    // равен всей подписи», и это и был дефект: заголовок клампится до двух
    // строк. Подробные проверки правила — tests/nodeDrawerDetail.test.tsx;
    // здесь — что панель, открытая КЛИКОМ ПО КАРТОЧКЕ на полотне, та же.
    const dialog = screen.getByRole('dialog', { name: DETAIL.heading });
    expect(within(dialog).getByRole('heading', { level: 2 }).textContent).toBe(DETAIL.heading);
    expect(within(dialog).getByTestId('drawer-detail-text').textContent).toBe(DETAIL.label);
    // Выбранная карточка помечена так же, как шаг и данные.
    expect(
      screen.getByRole('button', { name: ru.detailNode.ariaLabel(DETAIL.label) }),
    ).toHaveAttribute('aria-current', 'true');
  });

  /*
   * Хэндлы выноски — на обоих концах. stageGraph.ts просит у ребра
   * sourceHandle 'bottom' и targetHandle 'top' (tests/stageGraph.test.ts), но
   * React Flow нарисует ребро, только если у узлов ТАКИЕ хэндлы есть: иначе
   * ребро молча пропадает с предупреждением в консоли. В jsdom рёбра не
   * рисуются вовсе (им нужны измеренные хэндлы), поэтому проверяются сами
   * хэндлы в DOM.
   */
  it('у подробности один хэндл — цель сверху, у шага-хоста есть источник снизу', () => {
    const { container } = renderStage(0);

    const handles = nodeWrapper(container, DETAIL.id).querySelectorAll('.react-flow__handle');
    expect(handles).toHaveLength(1);
    const [target] = handles;
    expect(target?.getAttribute('data-handlepos')).toBe('top');
    expect(target?.getAttribute('data-handleid')).toBe(STEP_HANDLE.top);
    expect(target?.classList.contains('target')).toBe(true);

    const hostSource = nodeWrapper(container, DETAIL.stepId).querySelector(
      `.react-flow__handle.source[data-handleid="${STEP_HANDLE.bottom}"]`,
    );
    expect(hostSource, 'у шага-хоста нет хэндла-источника снизу').not.toBeNull();
    expect(hostSource?.getAttribute('data-handlepos')).toBe('bottom');
  });
});

// ─────────────────────── текст без обрезки ───────────────────────
//
// КАК ЭТО ПРОВЕРЯЕТСЯ ЧЕСТНО. Vitest не обрабатывает CSS (css.include пуст):
// CSS-модуль отдаёт имена классов, но в документ ни одна таблица стилей не
// попадает, и getComputedStyle в jsdom видит одни умолчания — проверка через
// него была бы зелёной при любом клампе. Поэтому связь «класс на элементе →
// правило CSS» восстанавливается здесь явно:
//   1. каждый класс на карточке и внутри неё обязан быть объявлен в
//      DetailNode.module.css — чужой класс (скажем, .label карточки шага с его
//      line-clamp: 2) краснеет здесь;
//   2. в этом модуле нет ни одного объявления, которое режет текст;
//   3. на элементе с текстом стоит класс, чьё правило даёт white-space:
//      pre-line — абзацы остаются абзацами;
//   4. инлайновых стилей на карточке нет вовсе — обрезка не придёт и оттуда;
//   5. обрезка не придёт и из ЧУЖОЙ таблицы стилей: ни одна другая таблица в
//      src/ не адресует узел подробности React Flow, а правила, которые
//      достают до любого узла (глобальные и по .react-flow__node), ничего не
//      режут. Без этого кламп, объявленный, скажем, в StageDetail.module.css
//      через :global(.react-flow__node-detail), прошёл бы мимо пунктов 1–4:
//      на самой карточке классов из чужого модуля при этом нет.

const DETAIL_CSS_PATH = 'src/components/nodes/DetailNode/DetailNode.module.css';
const DETAIL_CSS = readFileSync(DETAIL_CSS_PATH, 'utf8');
/** Глобальная таблица: её селекторы элементов (button, *) достают до карточки. */
const GLOBAL_CSS_PATH = 'src/theme/global.css';

interface CssRule {
  selector: string;
  body: string;
}

/** CSS без комментариев: закомментированное правило не действует. */
function withoutComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

/**
 * Правила-листья таблицы стилей: селектор и тело без вложенных блоков.
 * Правило внутри @media или @supports тоже лист и тоже попадает в список —
 * регулярное выражение просто находит его внутри блока; теряется только
 * условие самого @-блока, а для проверок ниже важно тело.
 */
function leafRules(css: string): CssRule[] {
  const rules: CssRule[] = [];
  for (const match of withoutComments(css).matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    rules.push({ selector: (match[1] ?? '').trim(), body: match[2] ?? '' });
  }
  return rules;
}

/** Правила модуля подробности. */
function cssRules(css: string): CssRule[] {
  // В модуле подробности @-блоков нет, и это часть проверки, а не допущение:
  // правило под медиазапросом действует не всегда, и сверка «класс на
  // карточке → его правила» ниже этого условия не видит.
  expect(
    withoutComments(css),
    'в DetailNode.module.css появился @-блок — сверка ниже не видит его условия',
  ).not.toMatch(/@/);
  return leafRules(css);
}

/** Локальные имена классов, объявленных в модуле: `.card:hover` → card. */
function declaredClasses(rules: readonly CssRule[]): Set<string> {
  const names = new Set<string>();
  for (const rule of rules) {
    for (const match of rule.selector.matchAll(/\.([A-Za-z_][\w-]*)/g)) {
      if (match[1] !== undefined) {
        names.add(match[1]);
      }
    }
  }
  return names;
}

/**
 * Всё, чем CSS умеет срезать текст: кламп строк, многоточие, скрытие
 * переполнения, запрет переноса, обрезка по контуру.
 *
 * Прокрутка (overflow: auto/scroll) — тоже обрезка. Карточка фиксированной
 * высоты с полосой прокрутки прятала бы хвост текста внутри себя, а колесо
 * мыши на полотне забирает React Flow (панорама и масштаб): прокрутить
 * карточку пользователь не смог бы, и хвост был бы потерян так же, как под
 * overflow: hidden. Значение ищется в любом месте после двоеточия — у
 * overflow бывает и два значения («visible hidden»).
 */
const CLIPPING = [
  /line-clamp/,
  /text-overflow/,
  /-webkit-box/,
  /overflow(-(x|y|block|inline))?\s*:[^;]*\b(hidden|clip|auto|scroll|overlay)\b/,
  /white-space\s*:\s*(nowrap|pre)\s*(;|$)/,
  /text-wrap(-mode)?\s*:\s*nowrap/,
  /clip-path/,
  /(^|[\s;])clip\s*:/,
  /contain\s*:[^;]*\b(paint|strict|content)\b/,
];

describe('DetailNode: текст не обрезается ничем', () => {
  const rules = cssRules(DETAIL_CSS);
  const declared = declaredClasses(rules);
  /** Сгенерированное имя класса → локальное имя из модуля. */
  const localOf = new Map([...declared].map((name) => [String(detailStyles[name]), name] as const));

  it('предпосылка: разбор модуля видит карточку и текст', () => {
    expect(declared.has('card')).toBe(true);
    expect(declared.has('text')).toBe(true);
  });

  it('в модуле подробности нет ни одного объявления, режущего текст', () => {
    for (const rule of rules) {
      for (const pattern of CLIPPING) {
        expect(rule.body, `${rule.selector}: ${pattern}`).not.toMatch(pattern);
      }
    }
  });

  it('на карточке только классы этого модуля, и текст несёт white-space: pre-line', () => {
    const { container } = renderStage(0);
    const button = within(nodeWrapper(container, DETAIL.id)).getByRole('button');
    // Проверяется выбранное состояние: у него свой класс, и он тоже обязан
    // быть из этого модуля.
    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-current', 'true');
    const elements = [button, ...Array.from(button.querySelectorAll<HTMLElement>('*'))];

    for (const element of elements) {
      for (const className of Array.from(element.classList)) {
        expect(
          localOf.has(className),
          `класс ${className} не из DetailNode.module.css — его правила не проверены`,
        ).toBe(true);
      }
      // Инлайновых стилей у карточки нет вовсе: вёрстка — только модуль.
      expect(element.getAttribute('style'), 'инлайновый стиль на карточке').toBeNull();
    }

    // Элемент, несущий текст, — лист с полным текстом подробности.
    const holder = elements.find(
      (element) => element.children.length === 0 && element.textContent === DETAIL.label,
    );
    expect(holder, 'нет элемента, несущего весь текст').toBeDefined();
    const holderLocal = Array.from(holder?.classList ?? []).map((name) => localOf.get(name));
    const holderRules = rules.filter((rule) =>
      holderLocal.some(
        (name) => name !== undefined && new RegExp(`\\.${name}(?![\\w-])`).test(rule.selector),
      ),
    );
    expect(holderRules.map((rule) => rule.body).join(';')).toMatch(/white-space\s*:\s*pre-line/);
  });
});

describe('DetailNode: чужие таблицы стилей текст подробности не режут', () => {
  // Все таблицы стилей приложения, кроме модуля самой подробности (его
  // проверяет блок выше). Разделитель пути нормализуется: на Windows
  // readdirSync отдаёт обратные косые черты.
  const others = readdirSync('src', { recursive: true, encoding: 'utf8' })
    .map((name) => `src/${name.replace(/\\/g, '/')}`)
    .filter((path) => path.endsWith('.css') && path !== DETAIL_CSS_PATH)
    .map((path) => ({ path, css: readFileSync(path, 'utf8') }));

  /** Правило достаёт до ЛЮБОГО узла полотна, а значит, и до подробности. */
  const reachesEveryNode = (path: string, rule: CssRule) =>
    path === GLOBAL_CSS_PATH || /react-flow__node(?![\w-])/.test(rule.selector);

  it('предпосылка: найдены глобальная таблица и таблица полотна уровня 2', () => {
    // Иначе зелёное ниже значило бы «проверять было нечего».
    const paths = others.map((file) => file.path);
    expect(paths).toContain(GLOBAL_CSS_PATH);
    expect(paths).toContain('src/components/StageDetail/StageDetail.module.css');
    // Правило «для всех узлов» в таблице полотна есть (курсор), то есть
    // отбор ниже действительно что-то отбирает.
    expect(
      others.some(({ path, css }) => leafRules(css).some((rule) => reachesEveryNode(path, rule))),
    ).toBe(true);
  });

  it('ни одна другая таблица не адресует узел подробности React Flow', () => {
    // Вид подробности — только DetailNode.module.css: правило в чужом файле
    // не видит ни сверка классов карточки выше, ни человек, правящий модуль.
    for (const { path, css } of others) {
      expect(withoutComments(css), path).not.toMatch(/react-flow__node-detail/);
    }
  });

  it('правила, достающие до любого узла, ничего не режут', () => {
    for (const { path, css } of others) {
      for (const rule of leafRules(css).filter((candidate) => reachesEveryNode(path, candidate))) {
        for (const pattern of CLIPPING) {
          expect(rule.body, `${path} ${rule.selector}: ${pattern}`).not.toMatch(pattern);
        }
      }
    }
  });
});

// ─────────────────────── выноска и легенда ───────────────────────

describe('DetailLinkEdge: выноска', () => {
  // Подпись передаётся намеренно: stageGraph.ts доносит `label` ребра модели
  // до выноски (tests/stageGraph.test.ts), и компонент не должен терять её
  // молча. В презентациях подписи у выноски нет, но поле законно у любого
  // ребра.
  it('рисует тонкий путь своим классом, БЕЗ стрелки и с подписью ребра', () => {
    const { container } = render(
      <ReactFlowProvider>
        <div style={{ width: 400, height: 300 }}>
          <ReactFlow nodes={[]} edges={[]}>
            <svg>
              {/* Пропсы ребра React Flow шире геометрии; для монтирования
                  хватает того, что компонент реально читает. */}
              <DetailLinkEdge
                {...({
                  id: 'e1',
                  source: 'a',
                  target: 'b',
                  sourceX: 0,
                  sourceY: 0,
                  targetX: 0,
                  targetY: 120,
                  sourcePosition: 'bottom',
                  targetPosition: 'top',
                  label: 'Пояснение к шагу',
                } as unknown as Parameters<typeof DetailLinkEdge>[0])}
              />
            </svg>
          </ReactFlow>
        </div>
      </ReactFlowProvider>,
    );
    const path = container.querySelector(`path.${String(edgeStyles.detailLink)}`);
    expect(path, 'путь выноски без своего класса').not.toBeNull();
    // Стрелка — знак перехода потока; подробность не следующий шаг.
    expect(container.querySelectorAll('path[marker-end]')).toHaveLength(0);
    expect(screen.getByText('Пояснение к шагу')).toBeInTheDocument();
  });
});

describe('Legend: пункт «Подробность»', () => {
  function legend() {
    return within(screen.getByRole('group', { name: ru.legend.ariaLabel }));
  }

  it('есть на этапе, где подробность есть', () => {
    renderStage(0);
    expect(legend().getByText(ru.legend.detail)).toBeInTheDocument();
  });

  it('нет на этапе той же карты, где подробностей нет', () => {
    // Этап 2 фикстуры без подробности: пункт зависит от этапа, а не от карты.
    const stage = loadBaseProcessMap().stages[1];
    expect(stage?.nodes.some((node) => node.type === 'detail')).toBe(false);
    renderStage(1);
    expect(legend().queryByText(ru.legend.detail)).not.toBeInTheDocument();
  });
});
