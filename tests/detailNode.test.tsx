// Подробность под шагом на полотне уровня 2 (NodeType 'detail',
// process-map-9mn.32).
//
// ЗАЧЕМ ЭТОТ ФАЙЛ, ПОКА КАРТОЧКА — ЗАГЛУШКА. Оформление подробности — задача
// process-map-9mn.36, но два свойства держатся уже сейчас, и без этого файла
// их не сторожило ничто: ни на одной карте на диске подробностей нет, так что
// ни e2e, ни тесты на настоящих данных их не видят. Проверено мутациями:
// строка регистрации `detail: DetailNode` в nodeTypes удалялась, подпись из
// DetailNode — тоже, и весь корпус оставался зелёным.
//   · Тип узла React Flow равен 'detail', то есть узел нарисован СВОИМ
//     компонентом: без регистрации React Flow молча подставил бы узел по
//     умолчанию (класс .react-flow__node-default и пустая карточка — у него
//     другой формат data).
//   · Текст подробности виден целиком, с абзацами: label склеен через \n
//     (решение владельца, process-map-9mn.31), и textContent обязан совпасть с
//     ним побайтово.
//
// Карточка-заглушка — не кнопка (шапка DetailNode.tsx), и тест это утверждает.
// Подмену компонента он ловит, но НЕ этой проверкой: подставь в регистрацию
// карточку шага — рендер упадёт раньше (StepNode ждёт другую форму data), и
// красным тест станет от падения. Когда задача process-map-9mn.36 сделает
// подробность кнопкой выбора узла, утверждение «кнопки нет» надо перевернуть
// вместе с ней.
//
// СТРАНИЦА ИЗ ФИКСТУР (tests/fixtures/pageMocks.ts): версия по умолчанию —
// двухуровневая фикстура с одной законной подробностью под первым шагом этапа
// 1, вторая версия — как у всех страниц из фикстур. Порядок и форма подмены —
// из шапки pageMocks.ts: vi.mock в этом файле, данные динамическим импортом.
// Константы подробности живут в vi.hoisted: фабрика исполняется раньше любого
// объявления в файле.
//
// jsdom не делает hit-testing: здесь проверяется, ЧТО нарисовано, а не то, что
// по этому можно кликнуть.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import App from '../src/App';
import { loadBaseProcessMap } from '../src/data/loader';
import { validateIntegrity } from '../src/data/schema';
import { createInitialState, useProcessStore } from '../src/store/useProcessStore';

const DETAIL = vi.hoisted(() => ({
  id: 'stage-1-detail',
  edgeId: 'stage-1-edge-detail',
  // Первый узел этапа 1 двухуровневой фикстуры — шаг (sample-process.ts);
  // tests/data.test.ts вешает подробность туда же.
  stepId: 'stage-1-node-1',
  label: 'Первый абзац\nВторой абзац',
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

describe('DetailNode на полотне уровня 2', () => {
  it('предпосылка: подмена сработала, и подробность в карте законна', () => {
    // Без неё красное ниже могло бы значить «подробности в данных нет вовсе»,
    // а зелёное — что проверялась битая карта.
    const map = loadBaseProcessMap();
    const detail = map.stages[0]?.nodes.find((node) => node.id === DETAIL.id);
    expect(detail?.type).toBe('detail');
    expect(validateIntegrity(map)).toEqual([]);
  });

  it('рисуется своим компонентом и показывает текст целиком, с абзацами', () => {
    const stage = loadBaseProcessMap().stages[0];
    expect(stage).toBeDefined();
    useProcessStore.getState().navigateToStage(stage!.id);
    const { container } = render(<App />);

    const wrapper = container.querySelector<HTMLElement>(
      `.react-flow__node-detail[data-id="${DETAIL.id}"]`,
    );
    expect(wrapper, 'узел подробности не нарисован типом detail').not.toBeNull();
    expect(wrapper?.textContent).toBe(DETAIL.label);
    expect(wrapper?.querySelector('button'), 'подробность — не кнопка').toBeNull();
  });
});
