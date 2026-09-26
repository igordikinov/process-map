// Подписи и распределение по этапам выписаны из колоды L2 от 24.09.2026,
// независимо от генерируемых process.json и required-nodes.json.
import { describe, expect, it } from 'vitest';
import { ProcessMapSchema } from '../../src/data/schema.ts';
import processJson from '../../src/data/inplan/process.json';
import requiredNodes from '../fixtures/inplan/required-nodes.json';
import { readImporterSource, readOwnerExternalIo } from '../helpers/importerSource.ts';

const map = ProcessMapSchema.parse(processJson);
const nodes = map.stages.flatMap((s) => s.nodes);
const box = (...paragraphs: string[]) => paragraphs.join('\n');

// Порядок модулей — кнопки навигации: PS перед MRP, хотя слайды идут наоборот.
const stages: [string, string[], string[]][] = [
  [
    'Обеспечивающие процессы',
    ['Управление данными'],
    [box('Матрица ассортимента', 'Логистическая схема', 'Мэппинг DFU-SKU')],
  ],
  [
    'Работа с историей продаж и формирование стат. прогноза',
    ['Загрузка истории продаж', 'Очистка истории продаж', 'Прогнозирование базовой линии'],
    [
      box('Sell-In', 'Sell-Out', 'Off-Take', 'Данные для модели прогнозирования'),
      box(
        'Автоматическая очистка:',
        'Очистка по итогам сегментации',
        'OOS',
        'Outliers',
        'Промо',
        'Экспертная очистка данных',
      ),
      box(
        'Оценка эффективности моделей планирования',
        'Управление сегментами',
        'Управление моделями прогнозирования',
        'Сегментация и тестирование временных рядов',
      ),
    ],
  ],
  [
    'Обогащение прогноза и формирование консенсус плана',
    ['Обогащение прогноза', 'Формирование и утверждение итогового прогноза'],
    [
      box(
        'Планирование новинок/ листинг/делистинг',
        'Экспертное планирование эффектов Building Blocks',
        'Передача в NRM базового прогноза',
        'Получение плана промо из NRM',
      ),
      box(
        'Дашборды и аналитические отчеты для Demand Review Meeting',
        'Поддержка формирования консенсус-прогноза',
        'Версионность и сценарный анализ',
      ),
    ],
  ],
  [
    'Публикация и передача неограниченного прогноза',
    ['Публикация прогноза', 'Передача Неограниченного Плана Спроса в SP/MEIO'],
    [
      box(
        'Дезагрегация DFU-SKU',
        'Архив прогнозов на уровне DFU (с лагом)',
        'Архив прогнозов на уровне SKU (с лагом)',
      ),
    ],
  ],
  [
    'Получение данных',
    ['Основные данные', 'Получение неограниченного прогноза/истории продаж/истории прогнозов'],
    [],
  ],
  [
    'Подготовка к расчету',
    ['Настройка параметров для расчёта уровней запасов', 'ABC-XYZ сегментация'],
    [
      box(
        'Фактический клиентский SL',
        'Фактические лидтаймы и их отклонения (задержки)',
        'Фактические квоты',
        'Волатильность спроса',
      ),
      box('Сегментация групп клиент-продукт по признакам', 'Ведение целевого уровня сервиса'),
    ],
  ],
  [
    'Расчет и анализ',
    ['Расчет рекомендаций по уровням запасов', 'Анализ полученных значений'],
    [
      box(
        'Настройка параметров оптимизации',
        'Учет ограничений',
        'Расчет оптимального страхового запаса',
        'Расчет целевого запаса',
        'Расчет циклического запаса',
        'Расчет точки заказа',
        'Расчет рекомендованного уровня сервиса',
      ),
      box('Сценарное моделирование', 'Ручные корректировки'),
    ],
  ],
  [
    'Пересмотр и передача политик',
    [
      'Пересмотр политики управления запасами',
      'Передача нормативов по запасам в модули SNP/PS/ERP',
    ],
    ['Согласование политик с менеджментом'],
  ],
  [
    'Получение данных из смежных модулей',
    ['Получение неограниченного спроса', 'Получение результатов расчетов модуля MEIO'],
    [],
  ],
  [
    'Анализ и диагностика плана',
    ['Первичный анализ спроса и выявление проблем', 'Детальная диагностика возникших дефицитов'],
    [
      box(
        'Верхнеуровневый анализ предупреждений',
        'Детальный анализ предупреждений',
        'Анализ покрытия потребности',
      ),
      box('Анализ возникновения непокрытой потребности', 'Анализ загрузки мощностей'),
    ],
  ],
  [
    'Корректировки плана и повторный анализ',
    [
      'Внесение корректировок и перезапуск оптимизатора',
      'Повторный анализ плана с учетом корректировок',
    ],
    [
      box(
        'Внесение корректировок резервной мощности',
        'Запуск пересчета алгоритмов после внесения корректировок',
      ),
      box(
        'Повторный анализ загрузки мощностей',
        'Повторный анализ предупреждений',
        'Анализ покрытия потребности',
        'Анализ результатов работы оптимизатора',
      ),
    ],
  ],
  ['Передача планов в PS', ['Передача согласованного объемного плана в модуль PS'], []],
  [
    'Получение данных',
    [
      'Получение согласованного объемного плана производства из SNP',
      'Управление производством в ERP',
    ],
    [box('Производственные / Технологические заказы', 'Основные и транзакционные данные')],
  ],
  [
    'Календарное планирование и балансировка',
    [
      'Анализ плана SNP и потребностей в производстве',
      'Формирование Плана производства ГП и ПФ',
      'Балансировка загрузки линий пр-ва ГП и ПФ',
    ],
    [
      'Объемы в работу',
      'Детальный план производства по дням (план выпуска)',
      'Сбалансированный детальный план производства по дням/сменам и мощностям (план запуска)',
    ],
  ],
  ['Перепланирование', ['Анализ, перепланирование и корректировка'], ['Устранение отклонений']],
  [
    'Передача планов',
    [
      'Публикация плановых заказов в систему исполнения',
      'Передача графика производства в модуль SP',
    ],
    ['Передача плановых заказов'],
  ],
  [
    'Расчет потребности',
    [
      'Разузлование BOM, проверка аналогов и замен',
      'Расчет брутто- и нетто-потребностей',
      'Формирование заявок на закупку',
    ],
    [
      box('Спецификации (BOM)', 'Аналоги и замены компонентов'),
      box(
        'Остатки и страховые запасы',
        'Существующие заказы на поставку и заявки на закупку',
        'Перемещения (входящие/исходящие)',
        'Параметры партии (min/max/кратность, периодичность) и календари',
      ),
      box(
        'Параметры закупки:',
        'Lead time, MOQ, min/max партия, кратность, периодичность',
        'Источник поставки, квоты, цены',
        'Данные по поставщикам и логистическим ограничениям',
        'Календарь поставщика, окна отгрузки',
        'Ограничения по объемам/мощностям',
        'Транспортные ограничения',
      ),
    ],
  ],
  [
    'Обработка ошибок и предупреждений',
    ['Анализ предупреждений', 'Исправление данных'],
    ['Корректировка исходных данных, за которой следует перерасчет потребности'],
  ],
  [
    'Анализ и корректировка результатов',
    [
      'Проверка обеспеченности BOM',
      'Корректировка заявок',
      'Согласование изменений',
      'Согласование плана закупок',
    ],
    [],
  ],
  [
    'Сценарное планирование',
    [
      'Создание альтернативных сценариев',
      'Сравнение по KPI (стоимость, риски, запасы)',
      'Утверждение финального сценария',
    ],
    [],
  ],
];

const transfers = [
  ['dp', 'meio', 'Итоговый неограниченный прогноз'],
  ['meio', 'snp', 'Страховые и целевые запасы'],
  ['snp', 'ps', 'Итоговый ограниченный прогноз'],
  ['ps', 'mrp', 'Детальный план операций'],
] as const;
const mrpOutput = 'Передача плана в виде заявок на закупку в систему исполнения закупок';

describe('inplan: содержание колоды L2', () => {
  it('пять модулей в порядке навигации и двадцать этапов', () => {
    expect(map.id).toBe('inplan');
    expect(map.title).toBe('Карта процессов In.Plan');
    expect(map.moduleLabel).toBe('Все процессы In.Plan');
    expect(map.modules?.map((m) => [m.id, m.title])).toEqual([
      ['dp', 'Планирование спроса'],
      ['meio', 'Мультиэшелонная оптимизация запасов'],
      ['snp', 'Планирование сети поставок'],
      ['ps', 'Производственное планирование и графикование'],
      ['mrp', 'Планирование потребности в материалах'],
    ]);
    expect(map.stages).toHaveLength(20);
    map.modules!.forEach((m, i) => {
      expect(m.number).toBe(i + 1);
      expect(m.stageIds).toEqual(map.stages.slice(i * 4, i * 4 + 4).map((s) => s.id));
      expect(m.shortTitle).toBe(`${m.id.toUpperCase()} · ${m.title}`);
      expect(m.label).toBe(`Модуль ${m.id.toUpperCase()}`);
    });
    expect(map.lanes).toEqual([{ id: 'fpa', title: 'FP&A · Финансовое планирование и анализ' }]);
  });

  it.each(
    stages.map((entry, i) => ({
      number: i + 1,
      title: entry[0],
      steps: entry[1],
      details: entry[2],
    })),
  )('этап $number: $title — шаги и коробки подробностей', ({ number, title, steps, details }) => {
    const stage = map.stages[number - 1]!;
    expect(stage.number).toBe(number);
    expect(stage.title).toBe(title);
    expect(
      stage.nodes
        .filter((n) => !['data', 'detail'].includes(n.type))
        .map((n) => n.label)
        .sort(),
    ).toEqual([...steps].sort());
    expect(
      stage.nodes
        .filter((n) => n.type === 'detail')
        .map((n) => n.label)
        .sort(),
    ).toEqual([...details].sort());
  });

  it('43 шага, 26 подробностей, 14 артефактов; required-nodes включает подробности', () => {
    expect(nodes.filter((n) => !['data', 'detail'].includes(n.type))).toHaveLength(43);
    expect(nodes.filter((n) => n.type === 'detail')).toHaveLength(26);
    expect(nodes.filter((n) => n.type === 'data')).toHaveLength(14);
    expect([...requiredNodes].sort()).toEqual(
      nodes
        .filter((n) => n.type !== 'data')
        .map((n) => n.id)
        .sort(),
    );
    expect(nodes.some((n) => /TPM|DRP|TLB/.test(n.label))).toBe(false);
  });

  it('интеграции и предупреждение определяются текстом, серый DP остаётся шагом', () => {
    expect(
      nodes
        .filter((n) => n.type === 'integration')
        .map((n) => n.label)
        .sort(),
    ).toEqual(
      [
        'Передача нормативов по запасам в модули SNP/PS/ERP',
        'Передача согласованного объемного плана в модуль PS',
        'Передача графика производства в модуль SP',
      ].sort(),
    );
    expect(nodes.filter((n) => n.type === 'warning').map((n) => n.label)).toEqual([
      'Анализ предупреждений',
    ]);
    expect(nodes.find((n) => n.label === 'Управление данными')?.type).toBe('step');
    expect(nodes.every((n) => n.system === undefined)).toBe(true);
  });

  it('четыре передачи: выход последнего и вход первого этапа, плюс вход DP вне цепочки', () => {
    expect(map.moduleEdges).toEqual(
      transfers.map(([source, target, label]) => ({
        id: `mod-${source}--${target}`,
        source,
        target,
        kind: 'process',
        label,
      })),
    );
    transfers.forEach(([source, target, label], i) => {
      expect(
        map.stages[i * 4 + 3]!.nodes.filter((n) => n.type === 'data').map((n) => [
          n.label,
          n.direction,
        ]),
      ).toEqual([[label, 'out']]);
      expect(
        map.stages[i * 4 + 4]!.nodes.some((n) => n.label === label && n.direction === 'in'),
      ).toBe(true);
      expect(map.modules!.find((m) => m.id === source)!.keyOutputs).toEqual([label]);
      expect(map.modules!.find((m) => m.id === target)).toBeDefined();
    });
    expect(
      map.stages[0]!.nodes.filter((n) => n.type === 'data').map((n) => [n.label, n.direction]),
    ).toEqual([['История продаж и план промо', 'in']]);
    expect(
      map.stages[16]!.nodes.filter((n) => n.type === 'data')
        .map((n) => n.label)
        .sort(),
    ).toEqual(
      [
        'Плановые заказы из SNP, PS',
        'Основные и транзакционные данные из ERP',
        'Рекомендованные уровни запасов из MEIO',
        'Плановые первичные потребности и другие виды потребностей',
        'Детальный план операций',
      ].sort(),
    );
    expect(
      map.stages[18]!.nodes.filter((n) => n.type === 'data').map((n) => [n.label, n.direction]),
    ).toEqual([[mrpOutput, 'out']]);
    expect(map.modules![4]!.keyOutputs).toEqual([mrpOutput]);
  });

  it('семь объявленных полос ERP/NRM, включая две строки подробности DP', () => {
    const expected = [
      { stage: 3, system: 'NRM', label: 'Получение плана промо из NRM', direction: 'in' },
      { stage: 3, system: 'NRM', label: 'Передача в NRM базового прогноза', direction: 'out' },
      {
        stage: 8,
        system: 'ERP',
        label: 'Передача нормативов по запасам в модули SNP/PS/ERP',
        direction: 'out',
      },
      { stage: 13, system: 'ERP', label: 'Управление производством в ERP', direction: 'in' },
      {
        stage: 16,
        system: 'ERP',
        label: 'Публикация плановых заказов в систему исполнения',
        direction: 'out',
      },
      {
        stage: 17,
        system: 'ERP',
        label: 'Основные и транзакционные данные из ERP',
        direction: 'in',
      },
      { stage: 19, system: 'ERP', label: mrpOutput, direction: 'out' },
    ];
    const actual = map.stages.flatMap((s) => [...s.inputs, ...s.outputs]);
    expect(actual).toEqual(expected);
    const declarations = readOwnerExternalIo(readImporterSource(), 'inplan');
    expect(
      declarations.map(({ stage, system, label, direction }) => ({
        stage,
        system,
        label,
        direction,
      })),
    ).toEqual(expect.arrayContaining(expected));
    expect(declarations).toHaveLength(7);
    for (const io of actual) {
      const stage = map.stages[io.stage - 1]!;
      const [source, target] =
        io.direction === 'in' ? [io.system, stage.id] : [stage.id, io.system];
      expect(map.overviewEdges).toContainEqual({
        id: `ov-${source}--${target}`,
        source,
        target,
        kind: 'integration',
      });
    }
  });
});
