// Панель узла для подробности (NodeType 'detail', process-map-9mn.37).
//
// ДЕФЕКТ. Заголовок панели клампится до двух строк (NodeDrawer.module.css
// .title), а подпись подробности — весь текст блока со слайда: до 7 абзацев,
// склеенных через \n (SPEC §3). Пока заголовком шла вся подпись, в панели
// была видна её первая пара строк, а целиком — только на полотне и во
// всплывающей подсказке.
//
// ПРАВИЛО, которое держит этот файл (шапка NodeDrawer.tsx):
//   · заголовок подробности — ПЕРВЫЙ абзац подписи, под тем же клампом; он же
//     имя диалога;
//   · полный текст — в теле панели, дословно, white-space: pre-line, без
//     клампа и многоточия;
//   · полный текст НЕ показывается, только когда заголовок уже показывает его
//     весь: абзац один И вёрстка доказала, что кламп ничего не срезал.
//     Сомнение (раскладки нет, не измерено) — в пользу показа;
//   · у всех остальных типов узлов панель прежняя: заголовок — вся подпись,
//     тела с текстом нет. Прежнее поведение шага держит и tests/nodeDrawer.test.tsx,
//     он этой задачей не тронут.
//
// ПОДРОБНОСТЬ ЗДЕСЬ СИНТЕТИЧЕСКАЯ: ни на одной карте на диске подробностей нет
// (шапка tests/detailNode.test.tsx), брать настоящую неоткуда. Подпись узла
// панель берёт как есть, так что содержание текста проверкам безразлично.
//
// jsdom НЕ СЧИТАЕТ РАСКЛАДКУ: scrollHeight и clientHeight у любого элемента —
// нули. Поэтому «уместился ли заголовок» здесь не измеряется, а ЗАДАЁТСЯ —
// подменой этих двух высот у заголовков (stubHeadingLayout ниже). Проверяется
// решение панели по ответу вёрстки, а не сама вёрстка: что Chromium под
// -webkit-line-clamp отдаёт в scrollHeight полную высоту текста — штатное
// поведение движка, на котором держится хук useFitsWithoutClamp.ts.
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import { NodeDrawer } from '../src/components/NodeDrawer';
import drawerStyles from '../src/components/NodeDrawer/NodeDrawer.module.css';
import { NodeTypeSchema, type NodeType, type ProcessNode } from '../src/data/schema';
import { ru } from '../src/i18n/ru';
import { createInitialState, useProcessStore } from '../src/store/useProcessStore';

const FIRST_PARAGRAPH = 'Расчёт потребности по всем узлам сети';
const MULTI_PARAGRAPH = `${FIRST_PARAGRAPH}\nБез учёта ограничений мощностей\nПо всем продуктам`;
const SINGLE_PARAGRAPH = 'Расчёт потребности по всем узлам сети без учёта ограничений мощностей';

const DETAIL_TEXT_TESTID = 'drawer-detail-text';

function nodeOfType(type: NodeType, label: string, extra: Partial<ProcessNode> = {}): ProcessNode {
  return { id: `drawer-${type}`, type, label, position: { x: 0, y: 0 }, ...extra };
}

function openDrawer(node: ProcessNode) {
  useProcessStore.getState().selectNode(node.id);
  return render(<NodeDrawer nodes={[node]} />);
}

/** Блок полного текста подробности в теле панели, если он есть. */
function detailText(): HTMLElement | null {
  return screen.queryByTestId(DETAIL_TEXT_TESTID);
}

function heading(): HTMLElement {
  return within(screen.getByRole('dialog')).getByRole('heading', { level: 2 });
}

// ─────────────────────── подмена раскладки ───────────────────────

/** Высоты, которые «вернёт вёрстка» заголовкам; null — подмены нет. */
let headingLayout: { scrollHeight: number; clientHeight: number } | null = null;
const LAYOUT_KEYS = ['scrollHeight', 'clientHeight'] as const;

/**
 * Заголовки (h1…h6) начинают отвечать заданными высотами. Геттер ставится
 * СВОИМ свойством на HTMLHeadingElement.prototype и перекрывает унаследованный
 * от Element; снимается удалением — унаследованный снова виден.
 * Значения читаются при каждом обращении, поэтому их можно менять посреди
 * теста (подмена шрифта ниже).
 */
function stubHeadingLayout(layout: { scrollHeight: number; clientHeight: number }): void {
  headingLayout = layout;
  for (const key of LAYOUT_KEYS) {
    Object.defineProperty(HTMLHeadingElement.prototype, key, {
      configurable: true,
      get: () => headingLayout?.[key] ?? 0,
    });
  }
}

/** document.fonts с управляемой готовностью: jsdom своего не имеет. */
function stubFonts(): () => Promise<void> {
  let resolve: () => void = () => undefined;
  const ready = new Promise<void>((settle) => {
    resolve = settle;
  });
  Object.defineProperty(document, 'fonts', { configurable: true, value: { ready } });
  return async () => {
    resolve();
    await ready;
  };
}

beforeEach(() => {
  useProcessStore.setState(createInitialState());
});

afterEach(() => {
  headingLayout = null;
  for (const key of LAYOUT_KEYS) {
    Reflect.deleteProperty(HTMLHeadingElement.prototype, key);
  }
  Reflect.deleteProperty(document, 'fonts');
});

describe('предпосылки подмены', () => {
  it('у jsdom нет раскладки и нет document.fonts, подмена снимается бесследно', () => {
    // Без раскладки высоты — нули: это и есть «измерить не удалось».
    const probe = document.createElement('h2');
    expect(probe.scrollHeight).toBe(0);
    expect(probe.clientHeight).toBe(0);
    // Свои свойства прототипа заголовков — только от подмены: иначе удаление
    // в afterEach снесло бы настоящие.
    for (const key of LAYOUT_KEYS) {
      expect(Object.getOwnPropertyDescriptor(HTMLHeadingElement.prototype, key)).toBeUndefined();
    }
    expect('fonts' in document).toBe(false);
  });
});

// ─────────────────────── несколько абзацев ───────────────────────

describe('Панель подробности из нескольких абзацев', () => {
  it('заголовок, его title и имя диалога — первый абзац, и кламп заголовка на месте', () => {
    openDrawer(nodeOfType('detail', MULTI_PARAGRAPH));

    expect(screen.getByRole('dialog', { name: FIRST_PARAGRAPH })).toBeInTheDocument();
    expect(heading().textContent).toBe(FIRST_PARAGRAPH);
    // title — полный текст срезанного заголовка, то есть абзаца, а не всей
    // подписи: вся подпись и так стоит в теле панели.
    expect(heading()).toHaveAttribute('title', FIRST_PARAGRAPH);
    // Заголовок остаётся заголовком панели: тот же класс, тот же кламп.
    expect(heading()).toHaveClass(String(drawerStyles.title));
  });

  it('тело — вся подпись дословно, с переносами между абзацами', () => {
    openDrawer(nodeOfType('detail', MULTI_PARAGRAPH));

    const text = detailText();
    expect(text, 'в теле панели нет полного текста подробности').not.toBeNull();
    expect(text?.textContent).toBe(MULTI_PARAGRAPH);
    expect(text?.textContent?.split('\n')).toHaveLength(3);
  });

  it('тело есть, даже когда первый абзац уместился в заголовок', () => {
    // Заголовок — не весь текст по построению, раскладка тут ни при чём.
    stubHeadingLayout({ scrollHeight: 24, clientHeight: 24 });
    openDrawer(nodeOfType('detail', MULTI_PARAGRAPH));
    expect(detailText()?.textContent).toBe(MULTI_PARAGRAPH);
  });

  it('полный текст стоит первым в прокручиваемой области панели, до описания и секций', () => {
    const node = nodeOfType('detail', MULTI_PARAGRAPH, { description: 'Описание узла' });
    openDrawer(node);

    const text = detailText();
    // Не в шапке: шапка не прокручивается, и там его срезала бы высота панели.
    expect(text?.closest('header')).toBeNull();
    expect(text?.parentElement).toHaveClass(String(drawerStyles.content));
    expect(text?.parentElement?.firstElementChild).toBe(text);
    // Описание — следом, отдельным блоком, как у любого узла.
    expect(screen.getByText('Описание узла')).toBeInTheDocument();
    expect(screen.getByText(ru.drawer.screenSection)).toBeInTheDocument();
  });
});

// ─────────────────────── тело без клампа ───────────────────────
//
// Vitest не обрабатывает CSS (css.include пуст): CSS-модуль отдаёт имена
// классов, но таблица стилей в документ не попадает, и getComputedStyle видит
// одни умолчания. Связь «класс на блоке → правило CSS» восстанавливается
// явно — тем же приёмом, что в tests/detailNode.test.tsx для карточки на
// полотне: каждый класс блока обязан быть объявлен в NodeDrawer.module.css, и
// ни одно правило этих классов не режет текст.

const DRAWER_CSS = readFileSync('src/components/NodeDrawer/NodeDrawer.module.css', 'utf8');

interface CssRule {
  selector: string;
  body: string;
}

/** CSS без комментариев: закомментированное правило не действует. */
function withoutComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

/** Правила-листья: селектор и тело без вложенных блоков. */
function leafRules(css: string): CssRule[] {
  const rules: CssRule[] = [];
  for (const match of withoutComments(css).matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    rules.push({ selector: (match[1] ?? '').trim(), body: match[2] ?? '' });
  }
  return rules;
}

/**
 * Всё, чем CSS умеет срезать текст. Список — тот же, что CLIPPING в
 * tests/detailNode.test.tsx (там же разобрано, почему прокрутка у карточки на
 * полотне — тоже обрезка). Общий помощник не заведён: правка того файла вне
 * рамок этой задачи.
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

describe('Полный текст подробности ничем не обрезается', () => {
  const rules = leafRules(DRAWER_CSS);
  const declared = new Set(
    rules.flatMap((rule) =>
      Array.from(rule.selector.matchAll(/\.([A-Za-z_][\w-]*)/g), (match) => match[1] ?? ''),
    ),
  );
  /** Сгенерированное имя класса → локальное имя из модуля. */
  const localOf = new Map([...declared].map((name) => [String(drawerStyles[name]), name] as const));

  /** Правила, чей селектор адресует локальный класс `name`. */
  const rulesOf = (name: string) =>
    rules.filter((rule) => new RegExp(`\\.${name}(?![\\w-])`).test(rule.selector));

  it('предпосылка: у заголовка панели кламп есть — его класс и есть то, что запрещено телу', () => {
    // Иначе проверка ниже была бы зелёной и с классом заголовка на теле.
    expect(
      rulesOf('title')
        .map((rule) => rule.body)
        .join(';'),
    ).toMatch(/line-clamp/);
  });

  it('классы блока — только из модуля панели, ни одно их правило не режет, и есть pre-line', () => {
    openDrawer(nodeOfType('detail', MULTI_PARAGRAPH));
    const text = detailText();
    expect(text).not.toBeNull();
    if (text === null) {
      return;
    }

    // Инлайновых стилей нет: вёрстка блока — только модуль.
    expect(text.getAttribute('style'), 'инлайновый стиль на блоке текста').toBeNull();
    // Внутри блока — только текст: вложенный элемент со своими классами
    // прошёл бы мимо сверки ниже.
    expect(text.children).toHaveLength(0);

    const classes = Array.from(text.classList);
    expect(classes.length, 'у блока текста нет ни одного класса').toBeGreaterThan(0);
    const locals = classes.map((className) => {
      const local = localOf.get(className);
      expect(
        local,
        `класс ${className} не из NodeDrawer.module.css — его правила не проверены`,
      ).toBeDefined();
      return local ?? '';
    });
    expect(locals, 'на теле класс заголовка с его клампом').not.toContain('title');

    const own = locals.flatMap(rulesOf);
    for (const rule of own) {
      for (const pattern of CLIPPING) {
        expect(rule.body, `${rule.selector}: ${pattern}`).not.toMatch(pattern);
      }
    }
    expect(own.map((rule) => rule.body).join(';')).toMatch(/white-space\s*:\s*pre-line/);
  });
});

// ─────────────────────── один абзац ───────────────────────

describe('Подробность из одного абзаца: тело не повторяет заголовок впустую', () => {
  it('заголовок — весь текст', () => {
    openDrawer(nodeOfType('detail', SINGLE_PARAGRAPH));
    expect(screen.getByRole('dialog', { name: SINGLE_PARAGRAPH })).toBeInTheDocument();
    expect(heading().textContent).toBe(SINGLE_PARAGRAPH);
    expect(heading()).toHaveAttribute('title', SINGLE_PARAGRAPH);
  });

  it('вёрстка доказала, что заголовок уместился, — тела нет', () => {
    // Две строки по 24px: содержимое ровно по высоте блока.
    stubHeadingLayout({ scrollHeight: 48, clientHeight: 48 });
    openDrawer(nodeOfType('detail', SINGLE_PARAGRAPH));
    expect(detailText()).toBeNull();
  });

  it('кламп срезал заголовок — полный текст в теле есть', () => {
    // Три строки текста в блоке высотой в две.
    stubHeadingLayout({ scrollHeight: 72, clientHeight: 48 });
    openDrawer(nodeOfType('detail', SINGLE_PARAGRAPH));
    expect(detailText()?.textContent).toBe(SINGLE_PARAGRAPH);
  });

  it('раскладки нет — сомнение в пользу текста: тело есть', () => {
    // jsdom как есть: обе высоты нулевые, доказательства «уместился» нет.
    // Обратное умолчание в браузере без раскладки (скрытый элемент) молча
    // теряло бы хвост длинного абзаца.
    openDrawer(nodeOfType('detail', SINGLE_PARAGRAPH));
    expect(detailText()?.textContent).toBe(SINGLE_PARAGRAPH);
  });

  it('шрифт догрузился и абзац перестал умещаться — полный текст появляется', async () => {
    // font-display: swap: первое измерение — запасным шрифтом, и абзац в две
    // строки уместился. После подмены на Open Sans — уже нет.
    const fontsLoaded = stubFonts();
    stubHeadingLayout({ scrollHeight: 48, clientHeight: 48 });
    openDrawer(nodeOfType('detail', SINGLE_PARAGRAPH));
    expect(detailText()).toBeNull();

    stubHeadingLayout({ scrollHeight: 72, clientHeight: 48 });
    await act(fontsLoaded);
    expect(detailText()?.textContent).toBe(SINGLE_PARAGRAPH);
  });
});

// ─────────────────────── прочие типы ───────────────────────

describe('Панель прочих узлов не меняется', () => {
  const others = NodeTypeSchema.options.filter((type) => type !== 'detail');
  // Подпись с переносом строки: будь правило первого абзаца применено не к
  // одной подробности, заголовок здесь укоротился бы.
  const label = 'Подпись узла\nвторая строка подписи';

  it('предпосылка: типов, кроме подробности, больше одного', () => {
    expect(others).toContain('step');
    expect(others.length).toBeGreaterThan(1);
  });

  it.each(others)('%s: заголовок и title — вся подпись, тела с текстом нет', (type) => {
    // Раскладка «кламп срезал» — самая неблагоприятная: будь правило
    // одного абзаца распространено на прочие типы, тело появилось бы здесь.
    // Его отсутствие обязано быть правилом типа, а не ответом вёрстки.
    stubHeadingLayout({ scrollHeight: 72, clientHeight: 48 });
    openDrawer(nodeOfType(type, label));

    expect(heading().textContent).toBe(label);
    expect(heading()).toHaveAttribute('title', label);
    expect(detailText()).toBeNull();
    // Без описания у узла в панели нет ни одного абзаца.
    expect(screen.getByRole('dialog').querySelectorAll('p')).toHaveLength(0);
  });
});
