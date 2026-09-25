// Zod-схемы и типы модели данных process.json (SPEC.md §3).
// Типы выводятся из схем через z.infer — интерфейсы SPEC не дублируются руками.
import { z } from 'zod';

// Тип узла уровня 2. Первые четыре значения — исходная модель, снятая с
// презентаций; следующие три добавлены импортом BPMN (эпик M6, задача
// process-map-70e.4); 'detail' — картой inplan (эпик M8, задача
// process-map-9mn.32).
//
// 'detail' — ПОДРОБНОСТЬ: блок текста под шагом на слайдах детализации колоды
// L2 («что именно делается на шаге»). Один узел на один блок, абзацы блока
// склеены в label через \n (решение владельца, process-map-9mn.31). Отдельный
// тип, а не description шага, потому что на слайде это отдельная фигура, и
// владелец решил: подробность — коробка целиком, один узел на полотне
// (process-map-9mn.2, следствие — process-map-9mn.26). Отдельный тип, а не
// 'data', потому что подробность не является ни входом, ни выходом этапа:
// 'data' попал бы в колонки splitStageDataNodes и в счётчик входов/выходов
// крошек. Шагом подробность тоже не считается (countStageNodes). Как она
// крепится к шагу, закреплено в validateIntegrity: ровно одно входящее ребро
// kind 'data' от узла потока, исходящих нет.
//
// ПОЧЕМУ ТРИ ЗНАЧЕНИЯ, А НЕ ДВЕНАДЦАТЬ. Вид шлюза и вид события живут в
// отдельных полях ниже, а не в самом перечислении. Тип узла отображается
// ОДИН В ОДИН в тип узла React Flow (tests/stageGraph.test.ts) и в пункт
// легенды: плоское перечисление вида gatewayExclusive | eventStartMessage дало
// бы дюжину почти одинаковых компонентов в nodeTypes и дюжину пунктов легенды
// под полотном шириной 1024.
//
// ПЕРЕЧИСЛЕНИЕ ЗАКРЫТОЕ, и открывать его в z.string() нельзя: единственный
// работающий сторож исчерпаемости — NODE_SIZE: Record<NodeType, Size> в
// src/layout/stageLayout.ts. При добавлении значения tsc падает и заставляет
// назначить размер; с открытым союзом сторож исчез бы, а React Flow на
// незнакомый тип молча нарисовал бы узел по умолчанию. Разбор BPMN обязан
// СВОДИТЬ элементы Camunda к этим значениям, а не изобретать новые в рантайме.
export const NodeTypeSchema = z.enum([
  'step',
  'data',
  'integration',
  'warning',
  'gateway',
  'event',
  'subprocess',
  'detail',
]);
export type NodeType = z.infer<typeof NodeTypeSchema>;

// Вид шлюза BPMN. Имеет смысл только при type === 'gateway'.
export const GatewayKindSchema = z.enum([
  'exclusive',
  'parallel',
  'inclusive',
  'eventBased',
  'complex',
]);
export type GatewayKind = z.infer<typeof GatewayKindSchema>;

// Место события в потоке. Имеет смысл только при type === 'event'.
//
// Значения 'boundary' в перечислении НЕТ намеренно: узел не может быть
// прикреплён к узлу, и в модели владельца (In.Plan Process Model v11)
// граничных событий нет ни одного — заводить значение под конструкцию,
// которую нечем показать и которая не встречается, значило бы обещать
// поддержку, которой не будет.
export const EventKindSchema = z.enum(['start', 'intermediate', 'end']);
export type EventKind = z.infer<typeof EventKindSchema>;

// Определение события: чем оно вызывается или что бросает. 'none' — простое
// событие без определения; в модели владельца такие все, кроме 'link'.
export const EventDefinitionSchema = z.enum([
  'none',
  'link',
  'message',
  'timer',
  'error',
  'signal',
  'escalation',
  'terminate',
]);
export type EventDefinition = z.infer<typeof EventDefinitionSchema>;

// Коды систем. 'NRM' добавлен картой inplan (process-map-9mn.31, п. 6):
// внешняя система, с которой обменивается модуль DP («Передача в NRM
// базового прогноза», «Получение плана промо из NRM»). Показывается кодом,
// как ERP, — расшифровки владелец не давал.
//
// Перечисление продублировано кортежем SYSTEM_CODES в scripts/import-pptx.py;
// расхождение ловит tests/snp/importPreserve.test.ts.
export const SystemCodeSchema = z.enum([
  'DP',
  'PS',
  'IO',
  'ERP',
  'MRP',
  'INPLAN',
  'BI',
  'EPM',
  'NRM',
]);
export type SystemCode = z.infer<typeof SystemCodeSchema>;

export const ScreenLinkSchema = z.object({
  title: z.string(),
  url: z.string(),
});
export type ScreenLink = z.infer<typeof ScreenLinkSchema>;

// Направление артефакта относительно этапа: 'in' — этап его потребляет,
// 'out' — производит. Одна схема на две сущности (ProcessNode.direction и
// ExternalIO.direction) — намеренно: вопрос у них дословно один и тот же
// («в какой колонке этапа стоит артефакт»), и разводить два одинаковых
// перечисления значило бы завести два словаря для одного понятия. Отличаются
// они не смыслом направления, а тем, ЧТО именно направлено: ExternalIO — это
// свимлейн внешней системы уровня 1, ProcessNode — карточка внутри этапа.
export const DirectionSchema = z.enum(['in', 'out']);
export type Direction = z.infer<typeof DirectionSchema>;

export const ProcessNodeSchema = z.object({
  id: z.string(),
  type: NodeTypeSchema,
  // Уточнение типа для узлов, пришедших из BPMN. Поля ставит разбор схемы по
  // элементу, а не человек: руками их не правят и в PRESERVED_NODE_FIELDS
  // импортёра они не входят — прецедент тот же, что у direction.
  //
  // Опциональны, а не обязательны при своём типе: zod не выражает зависимость
  // «поле обязательно, если type === X» без discriminatedUnion, а он
  // потребовал бы разбить ProcessNode на семь схем и переписать всех
  // потребителей. Цена — договорённость, а не проверка типом.
  gatewayKind: GatewayKindSchema.optional(),
  eventKind: EventKindSchema.optional(),
  eventDefinition: EventDefinitionSchema.optional(),
  label: z.string(),
  description: z.string().optional(),
  group: z.string().optional(),
  // Колонка, в которой стоит data-узел на экране детализации: 'in' — вход
  // этапа, 'out' — выход (SPEC §4.2). Для остальных типов узлов поле не имеет
  // смысла и не проставляется.
  //
  // ЗАЧЕМ ЯВНОЕ ПОЛЕ (задача process-map-24p). Раньше колонку выводили
  // геометрически: узел левее середины области шагов — вход. На реальных
  // слайдах это давало ноль выходов у этапов 1 и 2, хотя их карточки в обзоре
  // перечисляют по 2–3 ключевых выхода: блоки выходов презентация рисует не
  // справа от потока, а под контейнером этапа на слайде обзора, и по абсциссе
  // они попадали левее середины. Экран противоречил сам себе («15 входов ·
  // 0 выходов»), поэтому направление больше не выводится из координат.
  //
  // Значение ставит импортёр — не эвристикой, а ПО ПРОИСХОЖДЕНИЮ фигуры, см.
  // scripts/import-pptx.py::NodeDraft.direction: узлы левой колонки слайда
  // детализации — 'in', узлы блоков выходов этапа со слайда обзора — 'out'.
  // Других способов породить data-узел у импортёра нет, поэтому поле стоит
  // у всех узлов, и правкой руками это поле не является.
  //
  // Поле НЕОБЯЗАТЕЛЬНОЕ: документ без него (старый файл, экспорт из стороннего
  // инструмента) остаётся валидным, и такой узел раскладывается по прежнему
  // геометрическому правилу — src/utils/stageNodes.ts, единственный источник
  // правила. Сделать его обязательным значило бы сломать и такие документы,
  // и импорт JSON из §4.7.
  direction: DirectionSchema.optional(),
  inputs: z.array(z.string()).optional(),
  outputs: z.array(z.string()).optional(),
  system: SystemCodeSchema.optional(),
  owner: z.string().optional(),
  screen: ScreenLinkSchema.optional(),
  position: z.object({ x: z.number(), y: z.number() }),
  // Исходная геометрия слайда презентации (левый верхний угол фигуры, px).
  //
  // ЗАЧЕМ ОТДЕЛЬНОЕ ПОЛЕ. `position` — ПРОИЗВОДНАЯ величина: её перезаписывает
  // `npm run layout` (dagre). Если бы раскладка сидировалась `position`, она
  // после первого же прогона опиралась бы на результат собственной прошлой
  // работы, а геометрия слайда была бы потеряна навсегда (задача
  // process-map-cxn). Поэтому импортёр кладёт координаты фигуры ещё и сюда, а
  // scripts/layout.ts берёт исходный порядок узлов и деление data-узлов на
  // колонки входов/выходов именно отсюда.
  //
  // Поле СЛУЖЕБНОЕ: в UI не используется (React Flow получает только
  // `position`), в рантайме не читается. Оно опционально — карта без него
  // (старый файл, экспорт из стороннего инструмента) остаётся валидной, а
  // раскладка в этом случае откатывается на `position` и громко сообщает,
  // что исходная геометрия утрачена.
  //
  // Имя НЕ `sourcePosition`: у React Flow `Node.sourcePosition` — это сторона
  // хэндла ('left' | 'right' | ...), и совпадение имён в этом проекте читалось
  // бы как ошибка (см. components/edges/*).
  slidePosition: z.object({ x: z.number(), y: z.number() }).optional(),
});
export type ProcessNode = z.infer<typeof ProcessNodeSchema>;

export const GroupSchema = z.object({
  id: z.string(),
  label: z.string(),
});
export type Group = z.infer<typeof GroupSchema>;

export const EdgeSchema = z.object({
  id: z.string(),
  source: z.string(),
  target: z.string(),
  kind: z.enum(['process', 'integration', 'data']),
  label: z.string().optional(),
});
export type Edge = z.infer<typeof EdgeSchema>;

export const ExternalIOSchema = z.object({
  system: SystemCodeSchema,
  label: z.string(),
  stage: z.number(),
  direction: DirectionSchema,
});
export type ExternalIO = z.infer<typeof ExternalIOSchema>;

export const StageSchema = z.object({
  id: z.string(),
  // Номер этапа, начиная с единицы.
  //
  // БЫЛО z.union([1,2,3,4]) — жёсткая четвёрка, снятая с презентаций SNP и MRP.
  // Снято задачей process-map-70e.4: этапы загруженной схемы BPMN приходят из
  // подпроцессов верхнего уровня, и их столько, сколько в файле. В модели
  // владельца модулей двенадцать, из них непустых десять.
  //
  // Инвариант «ровно четыре» не исчез, а ПЕРЕЕХАЛ из tests/mapContract.test.ts
  // в tests/snp/content.test.ts и tests/mrp/content.test.ts: по таксономии
  // SPEC §7 это факт про поставляемые карты, а не про любую карту.
  number: z.number().int().min(1),
  title: z.string(),
  shortTitle: z.string(),
  keyOutputs: z.array(z.string()).max(4),
  warningsCount: z.number().optional(),
  screen: ScreenLinkSchema.optional(),
  groups: z.array(GroupSchema),
  nodes: z.array(ProcessNodeSchema),
  edges: z.array(EdgeSchema),
  inputs: z.array(ExternalIOSchema),
  outputs: z.array(ExternalIOSchema),
});
export type Stage = z.infer<typeof StageSchema>;

// Модуль In.Plan — верхний уровень ТРЁХУРОВНЕВОЙ карты (эпик M8, задача
// process-map-9mn.9): DP, MEIO, SNP, MRP, PS. Уровень добавлен СВЕРХУ над
// существующей парой «обзор этапов → детализация этапа», поэтому ни Stage, ни
// ProcessNode не изменились ни на поле.
//
// ПОЧЕМУ ССЫЛКИ (stageIds), А НЕ ВЛОЖЕНИЕ (stages внутри модуля). Доводы по
// убыванию веса:
//
// 1. Нумерация этапов остаётся СКВОЗНОЙ 1..N, и инвариант «номера без дыр»
//    (tests/mapContract.test.ts) продолжает держаться. На нём стоит
//    findStageByNumber, то есть deep-link ?stage=N (SPEC §4.7). При вложении
//    stage.number стал бы номером ВНУТРИ модуля, и все разосланные по вики
//    ссылки вида ?stage=2 тихо сменили бы смысл — экран при этом выглядел бы
//    совершенно рабочим.
// 2. Рекурсии в схеме не появляется: validateIntegrity, layoutStage,
//    mergeOverrides и findStageByNodeId как ходили по плоскому map.stages, так
//    и ходят. Вложение потребовало бы z.lazy, а z.lazy — руками написанного
//    интерфейса, вопреки принципу из шапки этого файла.
// 3. Три существующих файла (snp, mrp, inplan-model) остаются валидными без
//    единой правки: modules === undefined — это и есть «карта двухуровневая».
//
// Цена — три класса ошибок данных, которых при вложении быть не могло бы:
// ссылка на несуществующий этап, этап, заявленный двумя модулями, и
// этап-сирота. Все три ловит validateIntegrity, громко и поимённо.
export const ModuleSchema = z.object({
  // Попадает в адрес как ?module=<id>, поэтому ограничение то же, что у id
  // карты: строчная латиница и дефисы, ничего требующего экранирования в URL.
  // В SPEC §4.7 параметра ещё НЕТ — его заводит задача process-map-9mn.18;
  // здесь закреплена только форма значения.
  id: z.string().regex(/^[a-z][a-z0-9-]*$/),
  number: z.number().int().min(1),
  title: z.string(),
  shortTitle: z.string(),
  // Подпись рамки вокруг потока этапов на уровне 2. Поле здесь, а не одно на
  // документ, потому что на трёхуровневой карте рамка меняется при переходе
  // между модулями.
  //
  // ЗАМЕНА ЧАСТИЧНАЯ, а не полная: у ProcessMap.moduleLabel две роли — подпись
  // рамки (overviewGraph.ts) И корень хлебных крошек (StageDetail.tsx:
  // Breadcrumbs rootLabel={map.moduleLabel}). Это поле берёт на себя только
  // первую. Чем становится корень крошек на трёхуровневой карте — вопрос задачи
  // process-map-9mn.17, и moduleLabel до её решения остаётся обязательным
  // свойством документа.
  label: z.string(),
  // Верхняя граница та же, что у Stage.keyOutputs: карточка уровня 1 устроена
  // как карточка этапа. Нижней нет намеренно — у MRP на слайде обзора
  // выходного артефакта нет вовсе (process-map-9mn.5).
  keyOutputs: z.array(z.string()).max(4),
  screen: ScreenLinkSchema.optional(),
  // Этапы модуля — ССЫЛКИ на записи плоского ProcessMap.stages, см. выше.
  // Модуль без этапов невыразим: карточка уровня 1, из которой некуда
  // провалиться, — это тупик на экране, а не данные.
  stageIds: z.array(z.string()).min(1),
});
export type Module = z.infer<typeof ModuleSchema>;

// Полоса уровня 1 (эпик M8, решение владельца process-map-9mn.31, п. 5):
// сквозная лента на экране модулей с подписью — сегодня одна, «FP&A ·
// Финансовое планирование и анализ». Не кликается и в цепочку модулей не
// входит.
//
// ПОЧЕМУ НЕ МОДУЛЬ. Модуль — это карточка, в которую проваливаются
// (stageIds.min(1), ?module=<id>), и звено цепочки moduleEdges. У полосы нет
// ни этапов, ни провала: модулем её пришлось бы оформить с выдуманным этапом,
// то есть ровно тем тупиком на экране, который ModuleSchema запрещает, а
// инвариант «блоки этапов упорядочены по module.number» (validateIntegrity)
// потребовал бы для неё ещё и номера.
//
// ПОЧЕМУ НЕ КОД СИСТЕМЫ. SystemCodeSchema — закрытый список ВНЕШНИХ систем,
// с которыми модули обмениваются артефактами (ExternalIO, концы moduleEdges).
// FP&A — функция бизнеса, а не система, и расширять перечисление под неё
// значило бы назвать системой то, что ею не является, — тот же довод, что у
// артефактов между модулями в moduleEdges.
//
// id — та же форма, что у id модуля: полоса рисуется узлом на том же полотне
// уровня 1, и оба id живут в одном пространстве имён React Flow. Совпадение
// id полосы с id модуля ловит validateIntegrity.
export const LaneSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]*$/),
  title: z.string(),
});
export type Lane = z.infer<typeof LaneSchema>;

export const ProcessMapSchema = z.object({
  version: z.string(),
  // Идентификатор карты (process-map-3wh.4). Совпадает с именем каталога
  // src/data/<id>/ и задаёт ключ overrides в localStorage.
  //
  // ПОЧЕМУ В ДАННЫХ, А НЕ В СБОРКЕ. Ключ хранилища выводится из этого поля, то
  // есть из того самого файла, который реально попал в бандл: забытый MAP=mrp
  // даст карту SNP с ключом SNP, а не данные MRP под чужим ключом. Плюс
  // выгруженный process.json (он ходит из браузера в репозиторий руками —
  // docs/ссылки-на-экраны.md) становится самоописывающимся.
  id: z.string().regex(/^[a-z][a-z0-9-]*$/),
  // Формат закреплён (process-map-vjz.10): формально это строка, но шапка
  // обзора гонит её через formatIsoDate, а тот при непопадании в ISO отдаёт
  // вход как есть — то есть пустое значение или «вчера» уехали бы на экран
  // сырьём. Экспорт всегда пишет date-only, поэтому времени в шаблоне нет.
  updatedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  title: z.string(),
  // Подпись рамки вокруг всего потока этапов на обзоре: «Модуль SNP»,
  // «Модуль MRP». Была строкой интерфейса (ru.overview.laneFlow), но меняется
  // от карты к карте — значит это свойство документа, как title и updatedAt.
  //
  // ОБЯЗАТЕЛЬНОЕ. Опциональное с фолбэком на i18n дешевле на коммит, но
  // позволило бы второй карте уехать в прод с подписью первой, и никто бы не
  // заметил.
  moduleLabel: z.string(),
  // Модули верхнего уровня. ОТСУТСТВИЕ ПОЛЯ и означает «карта двухуровневая»
  // (эпик M8) — отсутствие, а не пустой массив: modules: [] невыразимо
  // намеренно (.min(1)), иначе у документа было бы два разных способа сказать
  // «модулей нет» и два места, где их надо различать. Один модуль — случай
  // законный: уровень 1 с единственной карточкой. Пропускать его нельзя, иначе
  // документ терял бы и обретал целый экран от добавления второго модуля.
  //
  // Число уровней — свойство ДОКУМЕНТА, как id и moduleLabel (SPEC §3): не
  // map.id === '...', не флаг сборки, не import.meta.env. Единственный ответ на
  // вопрос «сколько у карты уровней» даёт src/data/modules.ts (задача
  // process-map-9mn.10).
  modules: z.array(ModuleSchema).min(1).optional(),
  // Связи уровня 1: модуль → модуль и система → модуль. Артефакт, который один
  // модуль передаёт другому («Итоговый неограниченный прогноз», «Страховые и
  // целевые запасы»), — это Edge.label, а НЕ ExternalIO: ExternalIO требует
  // system из закрытого SystemCodeSchema, а артефакт системой не является, и
  // расширять перечисление под него значило бы назвать системой то, что ею не
  // является.
  moduleEdges: z.array(EdgeSchema).optional(),
  // Полосы уровня 1 (LaneSchema выше). ОТСУТСТВИЕ ПОЛЯ и означает «полос
  // нет», пустой массив невыразим (.min(1)) — тот же довод, что у modules:
  // одного способа сказать «нет» достаточно.
  //
  // Полосы рисуются только на экране модулей, поэтому без modules они
  // бессмысленны: такой документ отвергает validateIntegrity, а не схема —
  // зависимость «поле допустимо, если есть другое поле» zod без refine не
  // выражает, а refine здесь спрятал бы ошибку данных в сообщение разбора
  // вместо поимённого списка проблем.
  //
  // МЕСТО КЛЮЧА — после moduleEdges, и это часть контракта: zod пересобирает
  // объект в порядке ключей схемы, а экспорт (serializeProcessMap) обязан
  // совпадать с process.json побайтово. Сторож — round-trip в
  // tests/mapContract.test.ts.
  lanes: z.array(LaneSchema).min(1).optional(),
  stages: z.array(StageSchema),
  overviewEdges: z.array(EdgeSchema),
});
export type ProcessMap = z.infer<typeof ProcessMapSchema>;

// Overrides (localStorage), SPEC.md §3 «Overrides».
// null у screen — значимое значение (явно удалённая ссылка), поэтому нельзя
// использовать .optional() для самого поля screen внутри записи: undefined
// («не трогали») и null («удалили») должны различаться.
export const OverrideEntrySchema = z.object({
  screen: ScreenLinkSchema.nullable().optional(),
});
export type OverrideEntry = z.infer<typeof OverrideEntrySchema>;

export const OverridesSchema = z.record(z.string(), OverrideEntrySchema);
export type Overrides = z.infer<typeof OverridesSchema>;

/**
 * Ключ overrides в localStorage — СВОЙ У КАЖДОЙ КАРТЫ (process-map-3wh.5).
 *
 * ЗАЧЕМ. Карты раздаются с одного origin (корень и подкаталог /mrp/), а
 * localStorage общий на origin. С единым ключом обе карты писали бы правки в
 * одно пространство имён по nodeId. Визуально это не ломается: mergeOverrides
 * молча игнорирует неизвестные id, поэтому чужие правки просто «не работают».
 * Но «Сбросить правки» на одной карте стирал бы черновик другой, а «Экспорт
 * JSON» отдавал бы чистый файл сразу после правки. Такое ловится жалобой, а не
 * тестом.
 */
export function overridesStorageKey(mapId: string): string {
  return `inplan-process-map:${mapId}:overrides:v1`;
}

/**
 * Ключ до разделения карт. Оставлен ТОЛЬКО для миграции: под ним лежат правки,
 * сделанные владельцем до этой задачи (docs/ссылки-на-экраны.md — черновик,
 * который переносят в репозиторий руками). Новых записей под ним не бывает,
 * и loader его НЕ УДАЛЯЕТ: удаление необратимо, а решение о сбросе принимает
 * пользователь кнопкой (SPEC §4.4).
 */
export const LEGACY_OVERRIDES_STORAGE_KEY = 'inplan-process-map:overrides:v1';

/** Карта, которой принадлежал легаси-ключ: мигрируем правки только в неё. */
export const LEGACY_OVERRIDES_MAP_ID = 'snp';

/**
 * Проверка ссылочной целостности ProcessMap:
 * - все edge.source/edge.target указывают на существующие id: для stage.edges —
 *   на узлы ТОГО ЖЕ этапа, для overviewEdges — см. ниже;
 * - id узлов уникальны глобально по всему документу (не только внутри этапа);
 * - id рёбер уникальны глобально (React Flow требует уникальных id в пределах
 *   отрисовываемого графа);
 * - node.group, если задан, ссылается на существующую group своего этапа;
 * - подробность (type 'detail') висит ровно на одном узле потока: одно
 *   входящее ребро kind 'data' от узла, который не 'data' и не 'detail', и ни
 *   одного исходящего (process-map-9mn.32);
 * - модули, если поле modules есть: id и номера модулей уникальны, stageIds
 *   ссылаются на существующие этапы, ни один этап не заявлен двумя модулями и
 *   ни один не остался без модуля; номера этапов каждого модуля — сплошной
 *   блок, и блоки идут в порядке module.number (process-map-9mn.24);
 * - обзорное ребро не соединяет этапы разных модулей, и хотя бы один его
 *   конец — этап (process-map-9ow);
 * - оба конца moduleEdges — id модуля либо код системы, и хотя бы один из них
 *   модуль; конец-система не совпадает с id модуля без учёта регистра — как и
 *   система ExternalIO в документе с модулями (process-map-9mn.23);
 * - полосы уровня 1 (lanes) есть только при модулях, их id уникальны и не
 *   совпадают с id модулей.
 *
 * Для overviewEdges допустимыми source/target считаются:
 *   - id любого этапа (stage.id) — рёбра этап → этап;
 *   - код внешней системы (SystemCode), присутствующий хотя бы в одном
 *     ExternalIO (stage.inputs/stage.outputs) какого-либо этапа — рёбра
 *     система → этап (SPEC §3, §4.1: свимлейны уровня 1 — это внешние
 *     системы, а не узлы графа с собственным id).
 * Это два разных пространства идентификаторов (kebab-case id этапов и
 * короткие коды систем DP/PS/IO/ERP/MRP/INPLAN/BI/EPM/NRM), поэтому конфликтов
 * имён не возникает и ложных ошибок не даёт.
 */
export function validateIntegrity(map: ProcessMap): string[] {
  const problems: string[] = [];

  const allNodeIds = new Set<string>();
  const duplicateNodeIds = new Set<string>();
  for (const stage of map.stages) {
    for (const node of stage.nodes) {
      if (allNodeIds.has(node.id)) {
        duplicateNodeIds.add(node.id);
      }
      allNodeIds.add(node.id);
    }
  }
  for (const id of duplicateNodeIds) {
    problems.push(`Дублирующийся id узла: "${id}"`);
  }

  const stageIds = new Set(map.stages.map((stage) => stage.id));
  const systemCodes = new Set<string>();
  for (const stage of map.stages) {
    for (const io of [...stage.inputs, ...stage.outputs]) {
      systemCodes.add(io.system);
    }
  }

  const seenEdgeIds = new Set<string>();
  const checkEdgeId = (edge: Edge, scope: string): void => {
    if (seenEdgeIds.has(edge.id)) {
      problems.push(`Дублирующийся id ребра: "${edge.id}" (${scope})`);
    }
    seenEdgeIds.add(edge.id);
  };

  for (const stage of map.stages) {
    const groupIds = new Set(stage.groups.map((group) => group.id));

    for (const node of stage.nodes) {
      if (node.group !== undefined && !groupIds.has(node.group)) {
        problems.push(
          `Узел "${node.id}" (этап "${stage.id}") ссылается на несуществующую группу "${node.group}"`,
        );
      }
    }

    // Рёбра этапа проверяются против узлов ЭТОГО этапа, а не против глобального
    // множества: stage.edges рисуются внутри одного экрана детализации (SPEC §4.2),
    // и ссылка на узел чужого этапа — ошибка данных, а не допустимая связь.
    const stageNodeIds = new Set(stage.nodes.map((node) => node.id));

    for (const edge of stage.edges) {
      checkEdgeId(edge, `этап "${stage.id}"`);
      if (!stageNodeIds.has(edge.source)) {
        problems.push(
          `Ребро "${edge.id}" (этап "${stage.id}"): source "${edge.source}" не найден среди узлов этого этапа`,
        );
      }
      if (!stageNodeIds.has(edge.target)) {
        problems.push(
          `Ребро "${edge.id}" (этап "${stage.id}"): target "${edge.target}" не найден среди узлов этого этапа`,
        );
      }
    }

    problems.push(...detailProblems(stage));
  }

  // ───────────────────────── уровень 1: модули (эпик M8) ─────────────────────
  // Всё до конца блока включается наличием map.modules: у двухуровневой карты
  // предмета проверки нет, и молчание здесь — не пропуск, а отсутствие модулей.
  //
  // Карта «этап → заявивший его модуль» строится один раз: ниже по ней же
  // проверяются обзорные рёбра.
  const moduleIdByStageId = new Map<string, string>();
  if (map.modules !== undefined) {
    // Уникальность id и номеров модулей проверяется ЗДЕСЬ, а не в
    // tests/mapContract.test.ts, потому что карту приносит не только диск:
    // загруженную пользователем модель BPMN разбирает src/data/bpmn/adapter.ts,
    // и весь её контроль — это ProcessMapSchema.safeParse плюс эта функция.
    // Тест по src/data/*/process.json такую карту не видит вовсе.
    //
    // Дублирующийся id — того же класса, что дублирующиеся id узлов и рёбер
    // выше: на уровне 1 id модуля становится id узла React Flow, а ?module=<id>
    // открывал бы из двух одноимённых произвольный.
    //
    // Номера: дубль — это две карточки уровня 1 под одним номером. СПЛОШНОСТЬ
    // номеров не проверяется намеренно, в отличие от номеров этапов: номер
    // модуля никуда не адресуется, а карта, берущая пять модулей презентации из
    // восьми (process-map-9mn: без TPM и DRP/TLB), имеет право сохранить
    // исходную нумерацию с дырами. Дыра осмысленна, дубль — нет.
    const seenModuleIds = new Set<string>();
    const seenModuleNumbers = new Set<number>();

    for (const module of map.modules) {
      if (seenModuleIds.has(module.id)) {
        problems.push(`Дублирующийся id модуля: "${module.id}"`);
      }
      seenModuleIds.add(module.id);

      if (seenModuleNumbers.has(module.number)) {
        problems.push(`Дублирующийся номер модуля: ${module.number} (модуль "${module.id}")`);
      }
      seenModuleNumbers.add(module.number);

      for (const stageId of module.stageIds) {
        if (!stageIds.has(stageId)) {
          problems.push(`Модуль "${module.id}" ссылается на несуществующий этап "${stageId}"`);
          continue;
        }
        const claimedBy = moduleIdByStageId.get(stageId);
        if (claimedBy === module.id) {
          // Повтор ВНУТРИ одного модуля. Отдельная ветка нужна ради диагноза:
          // общая формулировка про «два модуля» отправила бы читателя искать
          // второй модуль, которого нет.
          problems.push(`Модуль "${module.id}" заявляет этап "${stageId}" дважды`);
          continue;
        }
        if (claimedBy !== undefined) {
          problems.push(
            `Этап "${stageId}" заявлен сразу двумя модулями: "${claimedBy}" и "${module.id}"`,
          );
          continue;
        }
        moduleIdByStageId.set(stageId, module.id);
      }
    }

    // Этап-сирота. Схема его не ловит и поймать не может: stageIds — ссылки, а
    // не вложение, и ничто в типе не требует, чтобы ссылки покрыли весь stages.
    // Без этой проверки этап просто исчез бы с экранов — на уровень 1 он не
    // попадает, а на уровень 2 попадает только через свой модуль, — и заметить
    // пропажу можно было бы только пересчитав карточки глазами.
    for (const stage of map.stages) {
      if (!moduleIdByStageId.has(stage.id)) {
        problems.push(`Этап "${stage.id}" не заявлен ни одним модулем`);
      }
    }

    problems.push(...moduleBlockProblems(map.modules, map.stages, moduleIdByStageId));
  }

  // Полосы уровня 1 (LaneSchema). Проверяются ВСЕГДА, а не внутри блока
  // модулей выше: главная ошибка здесь — как раз полосы БЕЗ модулей. Полоса
  // рисуется только на экране модулей, и у двухуровневой карты такого экрана
  // нет вовсе: без этой строки полоса молча нигде бы не появилась.
  const moduleIds = new Set((map.modules ?? []).map((module) => module.id));
  if (map.lanes !== undefined) {
    if (moduleIds.size === 0) {
      problems.push(
        `Полосы уровня 1 заданы, а модулей нет: полосы рисуются только на экране модулей ` +
          `(${map.lanes.map((lane) => `"${lane.id}"`).join(', ')})`,
      );
    }
    const seenLaneIds = new Set<string>();
    for (const lane of map.lanes) {
      if (seenLaneIds.has(lane.id)) {
        problems.push(`Дублирующийся id полосы: "${lane.id}"`);
      }
      seenLaneIds.add(lane.id);
      // Полоса и модуль — узлы ОДНОГО полотна уровня 1, и id узла React Flow
      // обязан быть уникальным: при совпадении один из двух просто не
      // нарисовался бы, а ?module=<id> указывал бы на полосу.
      if (moduleIds.has(lane.id)) {
        problems.push(`Полоса "${lane.id}" совпадает по id с модулем`);
      }
    }
  }

  const isValidOverviewEndpoint = (value: string): boolean =>
    stageIds.has(value) || systemCodes.has(value);

  for (const edge of map.overviewEdges) {
    checkEdgeId(edge, 'обзор');
    if (!isValidOverviewEndpoint(edge.source)) {
      problems.push(
        `Ребро обзора "${edge.id}": source "${edge.source}" не является ни id этапа, ни кодом системы`,
      );
    }
    if (!isValidOverviewEndpoint(edge.target)) {
      problems.push(
        `Ребро обзора "${edge.id}": target "${edge.target}" не является ни id этапа, ни кодом системы`,
      );
    }

    // Хотя бы один конец — этап (process-map-9ow). Проверка каждого конца по
    // отдельности выше пропускала ребро «система → система»: оба конца
    // законны сами по себе, но на обзоре такое ребро соединяло бы два
    // свимлейна внешних систем в обход всех этапов — связь, которой на этом
    // экране нет смысла. Правило то же, что у рёбер уровня 1 ниже («хотя бы
    // один конец — модуль»), на уровень ниже. Сообщение своё, а не общее с
    // тем: читатель должен сразу понять, про какой экран речь.
    //
    // Срабатывает независимо от проверок концов выше, как и правило уровня 1:
    // ребро с ненайденными концами получает по строке на каждую причину, а не
    // одну, за которой прячутся остальные.
    if (!stageIds.has(edge.source) && !stageIds.has(edge.target)) {
      problems.push(
        `Ребро обзора "${edge.id}": ни один конец не является этапом ("${edge.source}" → "${edge.target}")`,
      );
    }

    // Обзорное ребро рисуется на уровне 2, то есть ВНУТРИ одного модуля: экран
    // получает рёбра только своего модуля. Ребро между этапами разных модулей —
    // не «связь, которую забыли показать», а связь, которой на этом экране нет
    // места: ей место в moduleEdges. Сравнение касается только пар «этап →
    // этап»: конец-система ничьему модулю не принадлежит и сравнивать его не с
    // чем. У этапа без модуля владелец не определён, и ребро молчит намеренно —
    // про такой этап уже сказано отдельной строкой выше, и повторять то же
    // самое ещё и на каждом его ребре значило бы утопить диагноз.
    const sourceModuleId = moduleIdByStageId.get(edge.source);
    const targetModuleId = moduleIdByStageId.get(edge.target);
    if (
      sourceModuleId !== undefined &&
      targetModuleId !== undefined &&
      sourceModuleId !== targetModuleId
    ) {
      problems.push(
        `Ребро обзора "${edge.id}" соединяет этапы разных модулей: ` +
          `"${edge.source}" из "${sourceModuleId}" и "${edge.target}" из "${targetModuleId}"`,
      );
    }
  }

  // Связи уровня 1. Проверяются ВСЕГДА, а не только при наличии modules: в
  // двухуровневом документе id модулей нет ни одного, поэтому правило «хотя бы
  // один конец — модуль» (ниже) отвергает там ЛЮБОЕ ребро уровня 1 поимённо,
  // вместо того чтобы дать ему молча нигде не рисоваться.
  //
  // Код системы сверяется с ПЕРЕЧИСЛЕНИЕМ, а не с множеством кодов, реально
  // встреченных в ExternalIO, — в отличие от обзорных рёбер выше. Причина в
  // том, что ExternalIO привязан к этапу (поле stage: number), то есть
  // описывает свимлейны уровня 2; реестра систем уровня 1 в документе нет, и
  // требовать, чтобы систему уровня 1 кто-то упомянул ещё и на уровне 2,
  // значило бы запрещать связь только за то, что ниже ей нет соответствия.
  //
  // РЕГИСТРОВАЯ КОЛЛИЗИЯ (process-map-9mn.23). Модули карты inplan зовут dp,
  // meio, snp, ps, mrp, а коды систем — DP, PS, MRP: три из пяти различаются
  // одним регистром. "DP" на месте "dp" проходит проверку выше как код
  // системы — это не опечатка, а валидная ДРУГАЯ сущность, и связь тихо
  // уехала бы к свимлейну внешней системы вместо карточки модуля. Поэтому
  // конец-система, совпадающий с id модуля этой карты без учёта регистра, —
  // ошибка: модуль уже нарисован карточкой на том же экране, и рисовать его
  // же ещё и внешней системой бессмысленно по построению. Решение владельца —
  // process-map-9mn.31.
  //
  // Сравнение — БЕЗ учёта регистра, и это вся суть проверки: с учётом регистра
  // "DP" и "dp" различны, и она не поймала бы ровно тот случай, ради которого
  // заведена. Коды, ни с одним модулем не совпадающие (ERP, BI, NRM), концами
  // остаются законными.
  //
  // source и target — ОТДЕЛЬНЫМИ ветками и отдельными тестами (урок
  // process-map-9mn.11: один тест на оба конца оставлял целую ветку
  // непроверенной).
  const moduleIdByLowerCase = new Map(
    (map.modules ?? []).map((module) => [module.id.toLowerCase(), module.id] as const),
  );
  const moduleCollidingWithSystem = (value: string): string | undefined =>
    SystemCodeSchema.safeParse(value).success
      ? moduleIdByLowerCase.get(value.toLowerCase())
      : undefined;
  const isValidModuleEndpoint = (value: string): boolean =>
    moduleIds.has(value) || SystemCodeSchema.safeParse(value).success;

  for (const edge of map.moduleEdges ?? []) {
    checkEdgeId(edge, 'модули');
    if (!isValidModuleEndpoint(edge.source)) {
      problems.push(
        `Ребро модулей "${edge.id}": source "${edge.source}" не является ни id модуля, ни кодом системы`,
      );
    }
    if (!isValidModuleEndpoint(edge.target)) {
      problems.push(
        `Ребро модулей "${edge.id}": target "${edge.target}" не является ни id модуля, ни кодом системы`,
      );
    }

    const sourceCollision = moduleCollidingWithSystem(edge.source);
    if (sourceCollision !== undefined) {
      problems.push(
        `Ребро модулей "${edge.id}": source "${edge.source}" — код системы, совпадающий ` +
          `с id модуля "${sourceCollision}" без учёта регистра`,
      );
    }
    const targetCollision = moduleCollidingWithSystem(edge.target);
    if (targetCollision !== undefined) {
      problems.push(
        `Ребро модулей "${edge.id}": target "${edge.target}" — код системы, совпадающий ` +
          `с id модуля "${targetCollision}" без учёта регистра`,
      );
    }

    // Хотя бы один конец — модуль. Связь «система → система» на уровне 1
    // бессмысленна по построению: экран уровня 1 рисует модули, а системы
    // существуют на нём только как то, с чем модуль обменивается. Ребро между
    // двумя системами не соединяет ничего из нарисованного и не нарисовалось бы
    // само — его надо увидеть в данных.
    if (!moduleIds.has(edge.source) && !moduleIds.has(edge.target)) {
      problems.push(
        `Ребро модулей "${edge.id}": ни один конец не является модулем ("${edge.source}" → "${edge.target}")`,
      );
    }
  }

  // Та же регистровая коллизия в свимлейнах уровня 2 (ExternalIO). В карте с
  // модулями обмен между модулями — это moduleEdges, а свимлейн — только
  // ВНЕШНЯЯ система (решение владельца process-map-9mn.31, п. 6: «модули
  // In.Plan полосами не бывают»). Свимлейн PS в этапе карты, где ps — модуль,
  // рисовал бы модуль этой же карты внешней системой. У двухуровневой карты
  // модулей нет, словарь пуст, и проверка молчит: в картах snp и mrp свимлейны
  // DP, PS, IO, MRP законны — там это действительно соседние системы.
  for (const stage of map.stages) {
    for (const io of [...stage.inputs, ...stage.outputs]) {
      const collision = moduleIdByLowerCase.get(io.system.toLowerCase());
      if (collision !== undefined) {
        problems.push(
          `Этап "${stage.id}": внешняя система "${io.system}" («${io.label}») совпадает ` +
            `с id модуля "${collision}" без учёта регистра`,
        );
      }
    }
  }

  return problems;
}

/**
 * Подробности этапа (type 'detail', process-map-9mn.32): каждая висит ровно на
 * одном узле потока.
 *
 * Подробность — текст под шагом, а не звено процесса. Её место на полотне,
 * смысл и то, к какому шагу она относится, выражены ЕДИНСТВЕННЫМ ребром
 * «узел → подробность» kind 'data'; поэтому каждое отклонение — отдельная
 * ошибка со своим сообщением:
 *  - входящих нет — подробность ни к чему не относится и повисла бы на полотне
 *    сама по себе;
 *  - входящих больше одного — неясно, чей это текст;
 *  - kind не 'data' — 'process' нарисовал бы подробность звеном потока, а
 *    'integration' — передачей между системами;
 *  - источник 'data' или 'detail' — подробность описывает то, что ДЕЛАЕТСЯ, а
 *    вход/выход этапа и другая подробность ничего не делают; цепочка
 *    подробностей к тому же сделала бы порядок текста зависимым от рёбер;
 *  - исходящее ребро — подробность не звено: ребро из неё продолжило бы поток
 *    через текст.
 *
 * Источник, которого нет среди узлов этапа, здесь не обсуждается: висящий конец
 * уже назван проверкой рёбер этапа, и повторять его значило бы утопить диагноз.
 */
function detailProblems(stage: Stage): string[] {
  const problems: string[] = [];
  const nodeById = new Map(stage.nodes.map((node) => [node.id, node]));

  for (const detail of stage.nodes) {
    if (detail.type !== 'detail') {
      continue;
    }
    const where = `Подробность "${detail.id}" (этап "${stage.id}")`;
    const incoming = stage.edges.filter((edge) => edge.target === detail.id);
    const outgoing = stage.edges.filter((edge) => edge.source === detail.id);

    if (incoming.length === 0) {
      problems.push(`${where} не привязана ни к одному узлу: входящих рёбер нет`);
    }
    if (incoming.length > 1) {
      problems.push(
        `${where} привязана сразу к нескольким узлам: входящих рёбер ${incoming.length} ` +
          `(${incoming.map((edge) => `"${edge.id}"`).join(', ')})`,
      );
    }
    for (const edge of incoming) {
      if (edge.kind !== 'data') {
        problems.push(`${where}: входящее ребро "${edge.id}" вида "${edge.kind}", а не "data"`);
      }
      const source = nodeById.get(edge.source);
      if (source !== undefined && (source.type === 'data' || source.type === 'detail')) {
        problems.push(
          `${where}: входящее ребро "${edge.id}" идёт от узла "${source.id}" типа ` +
            `"${source.type}" — подробность крепится к узлу потока`,
        );
      }
    }
    for (const edge of outgoing) {
      problems.push(`${where}: исходящее ребро "${edge.id}" — у подробности исходящих не бывает`);
    }
  }
  return problems;
}

/**
 * Этапы модуля — сплошной блок номеров, и блоки идут в порядке module.number
 * (process-map-9mn.24, утверждён вариант «а» — process-map-9mn.31).
 *
 * ЗАЧЕМ. Довод №1 всей конструкции ModuleSchema — сквозная нумерация этапов
 * 1..N, которая делится на модули ДИАПАЗОНАМИ: ?stage=N, бейдж «Этап k из n»
 * уровня 3, порядок карточек уровня 2. Схема этого не требует — модуль A вправе
 * заявить этапы 1 и 4, модуль B — 2 и 3, — и тогда уровень 2 модуля A показал
 * бы этапы 1 и 4, а сквозной номер перестал бы что-либо значить.
 *
 * СПЛОШНЫМ ОБЯЗАНО БЫТЬ МНОЖЕСТВО номеров, а не ПОРЯДОК stageIds. Объявленный
 * порядок остаётся авторитетом для экранов (stagesOfModule отдаёт этапы в
 * порядке stageIds), и {5, 4, 3} — законный модуль. Формулировка «stageIds
 * перечислены по возрастанию номеров» (вариант «б») отвергнута: она отняла бы
 * у объявленного порядка смысл, и 9mn.17 пришлось бы считать бейдж по номеру.
 *
 * Порядок блоков сравнивается по module.number, а НЕ по соседству номеров:
 * дыра в номерах модулей (1, 2, 4) законна (см. проверку уникальности выше),
 * поэтому «следующий» — это следующий по возрастанию, а не number + 1.
 *
 * Номера считаются только у этапов, которыми модуль ВЛАДЕЕТ (moduleIdByStageId):
 * висящая ссылка и этап, заявленный вторым модулем, уже названы поимённо, и
 * пересчитывать их ещё и здесь значило бы приписать модулю чужой этап.
 */
function moduleBlockProblems(
  modules: readonly Module[],
  stages: readonly Stage[],
  moduleIdByStageId: ReadonlyMap<string, string>,
): string[] {
  const problems: string[] = [];
  const numberByStageId = new Map(stages.map((stage) => [stage.id, stage.number]));

  const blocks: { module: Module; first: number; last: number }[] = [];
  for (const module of modules) {
    const numbers = [
      ...new Set(
        module.stageIds
          .filter((stageId) => moduleIdByStageId.get(stageId) === module.id)
          .map((stageId) => numberByStageId.get(stageId))
          .filter((number): number is number => number !== undefined),
      ),
    ].sort((a, b) => a - b);
    const first = numbers[0];
    const last = numbers[numbers.length - 1];
    if (first === undefined || last === undefined) {
      continue;
    }
    if (last - first + 1 !== numbers.length) {
      problems.push(
        `Номера этапов модуля "${module.id}" не образуют сплошной блок: ${numbers.join(', ')}`,
      );
    }
    blocks.push({ module, first, last });
  }

  // Сортировка устойчива: при дубле номера модуля (он уже назван выше) пары
  // сравниваются в порядке документа, а не как придётся.
  const ordered = [...blocks].sort((a, b) => a.module.number - b.module.number);
  for (let index = 1; index < ordered.length; index += 1) {
    const previous = ordered[index - 1];
    const next = ordered[index];
    if (previous === undefined || next === undefined || previous.last < next.first) {
      continue;
    }
    problems.push(
      `Блоки этапов модулей идут не в порядке номеров модулей: модуль ` +
        `"${previous.module.id}" (№${previous.module.number}) доходит до этапа ${previous.last}, ` +
        `а модуль "${next.module.id}" (№${next.module.number}) начинается с этапа ${next.first}`,
    );
  }
  return problems;
}
