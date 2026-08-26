# -*- coding: utf-8 -*-
"""
import-pptx.py — перенос содержимого «SNP Е2Е процесс.pptx» в src/data/process.json
(модель данных — SPEC.md §3, zod-схема — src/data/schema.ts).

Запуск (из корня репозитория):

    python scripts/import-pptx.py

Скрипт детерминирован: повторный прогон на той же презентации даёт побайтово
тот же JSON. Идентификаторы стабильны и не зависят от порядка обхода фигур:
при коллизии базового slug'а суффикс берётся из «номер слайда + shape_id»
(двухфазная генерация, см. IdFactory).

ЭТО ПЕРВАЯ ПОЛОВИНА КОНВЕЙЕРА
-----------------------------
Импорт кладёт в `position` СЫРУЮ геометрию слайда, на которой карточки
накладываются друг на друга (десятки пересекающихся пар). Пригодные к показу
координаты считает вторая половина — `npm run layout` (scripts/layout.ts,
dagre). Порядок обязателен и обратного не имеет.

Чтобы этот порядок не приходилось помнить, есть одна команда:

    npm run data          # import-pptx.py → layout.ts

Исходная геометрия слайда при этом не теряется: она пишется ещё и в
`node.slidePosition` (SPEC §3), и раскладка сидируется именно ею, а не своим
прошлым результатом. Если прогнать только импорт и закоммитить, `npm run check`
покраснеет: tests/layout.test.ts сверяет координаты файла с пересчётом.

Структура презентации (проверено на файле «SNP Е2Е процесс.pptx»):
  слайд 1 — титул, данных нет;
  слайд 2 — обзор уровня 1 (контейнеры этапов, боксы групп, боксы внешних систем,
            блоки выходов этапов, связи этап→этап и система→этап);
  слайды 3..6 — детализация этапов 1..4.

Явных связей (stCxn/endCxn) в презентации нет, поэтому принадлежность узла группе
и концы рёбер выводятся геометрически. Всё, что не распозналось однозначно,
не выдумывается, а печатается в отчёте-сверке.

ЧТО В ДОКУМЕНТЕ НЕ ИЗ ПРЕЗЕНТАЦИИ
---------------------------------
Ровно два места, и оба на виду — потому что правило проекта «не изобретать
процесс» иначе не проверить:

  · OWNER_DECISION_EDGES — рёбра по решению владельца процесса, которых на
    слайде нет (задача process-map-7bz). Отчёт печатает их отдельным блоком;
  · ручные поля `screen`/`owner` — их проставляет человек в редакторе, см.
    ниже.

Направление data-узлов (`node.direction`, задача process-map-24p) к этому
списку НЕ относится: оно читается из презентации так же, как всё прочее, —
по тому, из какой фигуры узел родился (левая колонка входов слайда детализации
против блока выходов этапа на слайде обзора). Из КООРДИНАТ оно не выводится:
блоки выходов этапов 1 и 2 нарисованы левее середины области шагов.

РУЧНЫЕ ПОЛЯ (`screen`, `owner`) ПЕРЕЖИВАЮТ ПЕРЕГЕНЕРАЦИЮ
---------------------------------------------------------
Ссылок на экраны In.Plan в презентации нет: их проставляет человек в редакторе,
и ради них карта вообще встроена в вики. Скрипт собирает документ из презентации
с нуля, поэтому перед записью он читает предыдущий src/data/process.json и
переносит на новые узлы поля, которых в презентации не существует
(PRESERVED_NODE_FIELDS / PRESERVED_STAGE_FIELDS). Сопоставление — по `id`;
id стабильны по построению (см. IdFactory). Всё, что перенести не удалось,
печатается поимённо — молчаливой потери ссылок быть не должно.

Самопроверка переноса (без презентации, только stdlib):

    python scripts/import-pptx.py --self-test
"""

from __future__ import annotations

import json
import math
import re
import sys
from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterable, Sequence

from lxml import etree
from pptx import Presentation
from pptx.enum.shapes import MSO_SHAPE_TYPE

# --------------------------------------------------------------------------------------
# Константы
# --------------------------------------------------------------------------------------

ROOT = Path(__file__).resolve().parent.parent
PPTX_PATH = ROOT / "SNP Е2Е процесс.pptx"
JSON_PATH = ROOT / "src" / "data" / "process.json"
REQUIRED_NODES_PATH = ROOT / "tests" / "fixtures" / "required-nodes.json"

MAP_VERSION = "1.0.0"
MAP_UPDATED_AT = "2026-08-24"
MAP_TITLE = "E2E процесс планирования In.Plan"

# 1 px = 9525 EMU (96 dpi). Слайд 12192000 EMU = 1280 px по ширине.
EMU_PER_PX = 9525

SLIDE_WIDTH_EMU = 12192000

# Геометрические пороги (EMU).
CONTAINER_MIN_WIDTH = 2_000_000      # контейнер группы — широкий бесфонный прямоугольник
GROUP_TITLE_MAX_GAP = 1_200_000      # заголовок группы лежит не выше этого над контейнером
CAPTION_MAX_GAP = 400_000            # подпись-выход лежит вплотную под узлом
CAPTION_MIN_OVERLAP = 0.6            # доля ширины подписи, перекрытая узлом
CAPTION_MIN_GAP = -100_000           # допускаем лёгкое налезание подписи на узел
CAPTION_MIN_NODE_HEIGHT = 250_000    # тонкие полосы подписываются сверху, а не снизу
EDGE_SNAP_DETAIL = 300_000           # конец линии «прилипает» к узлу (слайды детализации)
EDGE_SNAP_SECOND = 900_000           # второй проход для линий с одним разрешённым концом
EDGE_SECOND_RATIO = 1.8              # следующий кандидат должен быть настолько же дальше
EDGE_SNAP_OVERVIEW = 500_000         # то же для обзора: там геометрия заметно свободнее
PROMOTE_MIN_ENDPOINTS = 2            # столько концов линий должно упираться в текстбокс
PROMOTE_SNAP = 50_000                # и упираться вплотную: подпись рядом со стрелкой — не узел
LOOSE_DESC_MAX_DIST = 2_500_000      # предел для «свободной» подписи внутри группы
LEFT_MARGIN_LIMIT = SLIDE_WIDTH_EMU * 15 // 100  # левое поле — колонка входов
KEY_OUTPUT_TOP_OFFSET = 500_000      # блоки выходов — в нижней части контейнера этапа
KEY_OUTPUT_BOTTOM_OFFSET = 700_000
DECOR_ARROW_MAX_WIDTH = 400_000      # мелкие стрелки-коннекторы между боксами обзора

MAX_KEY_OUTPUTS = 3                  # ограничение zod-схемы
MAX_ID_LENGTH = 72                   # длиннее, чтобы различающая часть текста не срезалась

SYSTEM_CODES = ("DP", "PS", "IO", "ERP", "MRP", "INPLAN")

# --------------------------------------------------------------------------------------
# Контракт с src/data/schema.ts
# --------------------------------------------------------------------------------------
#
# NODE_KEY_ORDER / STAGE_KEY_ORDER повторяют ПОРЯДОК ключей zod-схем
# ProcessNodeSchema и StageSchema. Это не косметика: экспорт из приложения
# (src/utils/processTransfer.ts::serializeProcessMap) прогоняет карту через zod,
# который пересобирает объекты в порядке схемы, и обязан совпадать с этим файлом
# побайтово. Расхождение ловит tests/importPreserve.test.ts.
NODE_KEY_ORDER = (
    "id",
    "type",
    "label",
    "description",
    "group",
    "direction",
    "inputs",
    "outputs",
    "system",
    "owner",
    "screen",
    "position",
    "slidePosition",
)
STAGE_KEY_ORDER = (
    "id",
    "number",
    "title",
    "shortTitle",
    "keyOutputs",
    "warningsCount",
    "screen",
    "groups",
    "nodes",
    "edges",
    "inputs",
    "outputs",
)

# Поля модели, которых В ПРЕЗЕНТАЦИИ НЕТ: их заполняет человек (редактор ссылок —
# SPEC §4.4, `owner` — правкой файла). Импортёр их не создаёт, значит обязан
# переносить из предыдущего process.json, иначе перегенерация их стирает.
PRESERVED_NODE_FIELDS = ("owner", "screen")
PRESERVED_STAGE_FIELDS = ("screen",)

# Остальное импортёр строит сам из презентации.
IMPORTER_NODE_FIELDS = tuple(k for k in NODE_KEY_ORDER if k not in PRESERVED_NODE_FIELDS)
IMPORTER_STAGE_FIELDS = tuple(k for k in STAGE_KEY_ORDER if k not in PRESERVED_STAGE_FIELDS)

# Код возврата, когда ссылки на экраны потеряны: узла с таким id в презентации
# больше нет. Файл при этом записывается — импорт корректен, потерян только
# ручной слой, и его полный список напечатан в отчёте.
EXIT_LINKS_LOST = 2

# --------------------------------------------------------------------------------------
# РЁБРА ПО РЕШЕНИЮ ВЛАДЕЛЬЦА ПРОЦЕССА — ИХ НЕТ В ПРЕЗЕНТАЦИИ
# --------------------------------------------------------------------------------------
#
# ЧИТАТЬ ЦЕЛИКОМ, ПРЕЖДЕ ЧЕМ ДОБАВЛЯТЬ СЮДА СТРОКУ.
#
# Всё остальное в этом файле — чтение слайда: узел есть, потому что на слайде
# есть фигура; ребро есть, потому что на слайде есть линия. Этот список —
# ЕДИНСТВЕННОЕ исключение, и заведено оно ровно для того, чтобы исключение было
# видно. В `stage["edges"]` рёбра отсюда лежат вперемешку с прочитанными со
# слайда и внешне от них не отличаются; отличить их можно только здесь и по
# отчёту импортёра (блок «РЁБРА ПО РЕШЕНИЮ ВЛАДЕЛЬЦА ПРОЦЕССА»).
#
# Условие для новой строки — ЗАФИКСИРОВАННОЕ решение владельца процесса
# (номер задачи обязателен). Догадка «тут по смыслу должна быть стрелка» таким
# решением НЕ является: автоматическое правило «связать узлы группы публикации
# с расчётом» уже предлагалось (задача np4) и было откачено как выдумывание
# процесса. Разница между np4 и тем, что ниже, — не в содержании рёбер, а
# исключительно в источнике, и через полгода восстановить её будет неоткуда,
# кроме этого комментария.
#
# ПОЧЕМУ ПРАВИЛОМ В ИМПОРТЁРЕ, А НЕ ПРАВКОЙ process.json. Импортёр собирает
# документ с нуля, поэтому дописанное руками в JSON стирается следующим же
# прогоном `npm run data` — этот дефект уже чинила задача process-map-2dj для
# ссылок на экраны. Механизм переноса ручных полей (PRESERVED_NODE_FIELDS)
# здесь не подходит: он сопоставляет ПОЛЯ СУЩЕСТВУЮЩИХ узлов по id, а не
# добавляет новые сущности, и «перенос» рёбер означал бы, что импортёр молча
# тянет из старого файла связи, которых в презентации нет, — то есть ровно то,
# что запрещено. Объявление в коде переживает перегенерацию по построению и
# при этом остаётся на виду.
#
# `targets` перечисляет решение ЦЕЛИКОМ, включая концы, которые на слайде уже
# нарисованы: применяется только недостающее, а совпавшее печатается в отчёте
# как пришедшее из презентации. Так строка остаётся читаемой как формулировка
# решения («связать все четыре»), а не как дельта к текущему состоянию слайда,
# и правка презентации не превращает список в тихую ложь.
OWNER_DECISION_EDGES: tuple[dict, ...] = (
    {
        "task": "process-map-7bz",
        "stage": 3,
        "source": "raschet-ogranichennyh-planov",
        "targets": (
            "peredacha-ogranichennogo-prognoza-v-dp",
            "publikaciya-planovyh-zakazov",
            "publikaciya-zayavok-na-zakupku",
            "publikaciya-zayavok-na-peremeschenie",
        ),
        "kind": "process",
        "why": (
            "решение владельца процесса: все четыре узла группы «Публикация планов» "
            "выполняются по результату расчёта ограниченных планов. В презентации "
            "стрелка нарисована только к «Публикация плановых заказов» (линия [146]), "
            "остальные три узла остаются изолированными"
        ),
    },
)

A = "{http://schemas.openxmlformats.org/drawingml/2006/main}"
P = "{http://schemas.openxmlformats.org/presentationml/2006/main}"

TRANSLIT = {
    "а": "a", "б": "b", "в": "v", "г": "g", "д": "d", "е": "e", "ё": "e",
    "ж": "zh", "з": "z", "и": "i", "й": "y", "к": "k", "л": "l", "м": "m",
    "н": "n", "о": "o", "п": "p", "р": "r", "с": "s", "т": "t", "у": "u",
    "ф": "f", "х": "h", "ц": "c", "ч": "ch", "ш": "sh", "щ": "sch",
    "ъ": "", "ы": "y", "ь": "", "э": "e", "ю": "yu", "я": "ya",
}


# --------------------------------------------------------------------------------------
# Вспомогательные структуры
# --------------------------------------------------------------------------------------


@dataclass
class Box:
    """Прямоугольник фигуры в EMU."""

    left: int
    top: int
    width: int
    height: int

    @property
    def right(self) -> int:
        return self.left + self.width

    @property
    def bottom(self) -> int:
        return self.top + self.height

    @property
    def cx(self) -> float:
        return self.left + self.width / 2

    @property
    def cy(self) -> float:
        return self.top + self.height / 2

    @property
    def area(self) -> int:
        return self.width * self.height

    def contains_point(self, x: float, y: float) -> bool:
        return self.left <= x <= self.right and self.top <= y <= self.bottom

    def distance_to_point(self, x: float, y: float) -> float:
        dx = max(self.left - x, 0.0, x - self.right)
        dy = max(self.top - y, 0.0, y - self.bottom)
        return math.hypot(dx, dy)


@dataclass
class Shape:
    """Нормализованное представление фигуры слайда."""

    sid: int
    kind: str            # 'auto' | 'line' | 'textbox' | 'placeholder' | 'other'
    box: Box
    paragraphs: list[str]
    fill: str | None     # 'srgb:RRGGBB' | 'scheme:name' | 'noFill' | None
    flip_h: bool
    flip_v: bool
    head_arrow: bool
    tail_arrow: bool
    consumed_by: str | None = None   # для отчёта: кто «съел» текстовую фигуру

    @property
    def text(self) -> str:
        return " ".join(self.paragraphs).strip()

    @property
    def has_text(self) -> bool:
        return bool(self.paragraphs)

    def sort_key(self) -> tuple[int, int, int]:
        return (self.box.top, self.box.left, self.sid)


@dataclass
class NodeDraft:
    node_id: str
    node_type: str
    label: str
    box: Box
    group: str | None = None
    # Колонка data-узла на экране детализации (SPEC §3/§4.2, задача
    # process-map-24p): 'in' — вход этапа, 'out' — выход.
    #
    # НЕ ЭВРИСТИКА И НЕ ГЕОМЕТРИЯ, а происхождение фигуры: у импортёра ровно
    # два места, где рождается data-узел, и каждое знает направление точно —
    #   · build_stage, шаг 4 «левая колонка входов» слайда детализации → 'in';
    #   · build_process_map, блоки выходов этапа под его контейнером на слайде
    #     обзора (слайд 2)                                             → 'out'.
    # Больше никакой путь data-узел не создаёт: node_type_for() возвращает
    # только step/integration/warning. Поэтому поле проставлено у всех
    # data-узлов, а у остальных типов его нет — там оно бессмысленно.
    #
    # Выводить направление из координат нельзя: блоки выходов этапов 1 и 2
    # презентация рисует под контейнером этапа на слайде обзора, и по абсциссе
    # они оказываются ЛЕВЕЕ середины области шагов — прежнее правило «левее
    # середины = вход» давало у этих этапов ноль выходов.
    direction: str | None = None
    description_parts: list[str] = field(default_factory=list)
    inputs: list[str] = field(default_factory=list)
    outputs: list[str] = field(default_factory=list)
    system: str | None = None

    @property
    def description(self) -> str | None:
        return "\n".join(self.description_parts) if self.description_parts else None


@dataclass
class SlideReport:
    slide_no: int
    nodes: int = 0
    data_nodes: int = 0
    groups: int = 0
    edges: int = 0
    lines_total: int = 0
    promoted: list[str] = field(default_factory=list)
    lines_skipped: list[str] = field(default_factory=list)
    text_skipped: list[str] = field(default_factory=list)
    loose_attachments: list[str] = field(default_factory=list)
    questions: list[str] = field(default_factory=list)
    # Артефакты, названные выходом этапа в обзоре, но уже существующие узлом
    # колонки входов на слайде детализации (задача process-map-24p).
    dedup_key_outputs: list[str] = field(default_factory=list)
    # Рёбра, добавленные не из презентации, а по решению владельца процесса
    # (OWNER_DECISION_EDGES, задача process-map-7bz).
    owner_edges: list[str] = field(default_factory=list)


# --------------------------------------------------------------------------------------
# Чтение презентации
# --------------------------------------------------------------------------------------


def normalize_text(value: str) -> str:
    """\x0b — мягкий перенос строки внутри абзаца PowerPoint; схлопываем пробелы."""
    value = value.replace("\x0b", " ").replace(" ", " ")
    return re.sub(r"\s+", " ", value).strip()


def read_paragraphs(shape) -> list[str]:
    """
    Абзацы текстовой фигуры.

    PowerPoint иногда разбивает одну фразу на два абзаца («Информация по будущим» /
    «заказам клиентов»). Признак продолжения — следующий абзац начинается со строчной
    буквы или со служебного символа продолжения; такие абзацы склеиваем.
    Списки (каждый пункт с заглавной буквы) при этом не страдают.
    """
    if not shape.has_text_frame:
        return []
    raw = [normalize_text(p.text) for p in shape.text_frame.paragraphs]
    raw = [p for p in raw if p]
    merged: list[str] = []
    for para in raw:
        first = para[0]
        if merged and (first.islower() or first in "/,;)"):
            merged[-1] = f"{merged[-1]} {para}".strip()
        else:
            merged.append(para)
    return merged


def read_fill(element) -> str | None:
    """Явная заливка из spPr (заливка по теме через p:style здесь не учитывается)."""
    sp_pr = element.find(P + "spPr")
    if sp_pr is None:
        return None
    for child in sp_pr:
        tag = etree.QName(child).localname
        if tag == "noFill":
            return "noFill"
        if tag == "solidFill":
            if len(child) == 0:
                return "solid"
            color = child[0]
            local = etree.QName(color).localname
            if local == "srgbClr":
                return "srgb:" + str(color.get("val")).upper()
            return "scheme:" + str(color.get("val"))
        if tag.endswith("Fill"):
            return tag
    return None


def read_line_ends(element) -> tuple[bool, bool]:
    """Наличие стрелок на концах линии (a:ln/a:headEnd, a:tailEnd)."""
    sp_pr = element.find(P + "spPr")
    if sp_pr is None:
        return (False, False)
    ln = sp_pr.find(A + "ln")
    if ln is None:
        return (False, False)

    def is_arrow(tag: str) -> bool:
        node = ln.find(A + tag)
        if node is None:
            return False
        return str(node.get("type") or "none") != "none"

    return (is_arrow("headEnd"), is_arrow("tailEnd"))


def read_flips(element) -> tuple[bool, bool]:
    sp_pr = element.find(P + "spPr")
    if sp_pr is None:
        return (False, False)
    node = sp_pr.find(A + "xfrm")
    if node is None:
        return (False, False)
    return (node.get("flipH") == "1", node.get("flipV") == "1")


def classify_shape_kind(shape) -> str:
    st = shape.shape_type
    if st == MSO_SHAPE_TYPE.LINE:
        return "line"
    if st == MSO_SHAPE_TYPE.TEXT_BOX:
        return "textbox"
    if st == MSO_SHAPE_TYPE.PLACEHOLDER:
        return "placeholder"
    if st == MSO_SHAPE_TYPE.AUTO_SHAPE:
        return "auto"
    return "other"


def read_slide(slide) -> list[Shape]:
    shapes: list[Shape] = []
    for shape in slide.shapes:
        if shape.left is None or shape.top is None:
            continue
        element = shape._element  # noqa: SLF001 — python-pptx не даёт публичного доступа к XML
        flip_h, flip_v = read_flips(element)
        head_arrow, tail_arrow = read_line_ends(element)
        shapes.append(
            Shape(
                sid=int(shape.shape_id),
                kind=classify_shape_kind(shape),
                box=Box(int(shape.left), int(shape.top), int(shape.width), int(shape.height)),
                paragraphs=read_paragraphs(shape),
                fill=read_fill(element),
                flip_h=flip_h,
                flip_v=flip_v,
                head_arrow=head_arrow,
                tail_arrow=tail_arrow,
            )
        )
    shapes.sort(key=Shape.sort_key)
    return shapes


# --------------------------------------------------------------------------------------
# Генерация идентификаторов
# --------------------------------------------------------------------------------------


def transliterate(value: str) -> str:
    return "".join(TRANSLIT.get(ch, ch) for ch in value.lower())


def slugify(value: str, max_length: int = MAX_ID_LENGTH) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", transliterate(value)).strip("-")
    if len(slug) > max_length:
        cut = slug[:max_length]
        if "-" in cut:
            cut = cut[: cut.rindex("-")]
        slug = cut.strip("-")
    return slug or "node"


class IdFactory:
    """
    Стабильные kebab-case id.

    Работает в двух фазах. В первой (collisions=None) фабрика только считает,
    сколько раз встретился каждый базовый slug. Во второй ей передают эту карту:
    уникальный slug становится id как есть, а ВСЕ участники коллизии получают
    суффикс «-<слайд>-<shape_id>». Благодаря этому id не зависит от порядка
    обхода фигур и не меняется, если удалить или переставить соседнюю фигуру.
    """

    def __init__(self, collisions: dict[str, int] | None = None, max_length: int = MAX_ID_LENGTH) -> None:
        self._collisions = collisions
        self._counts: Counter[str] = Counter()
        self._used: set[str] = set()
        self._max_length = max_length

    @property
    def counts(self) -> Counter[str]:
        return self._counts

    def make(self, source: str, slide: int, sid: int, index: int = 0) -> str:
        base = slugify(source, self._max_length)
        self._counts[base] += 1
        if self._collisions is None:
            candidate = f"{base}~{self._counts[base]}"
        else:
            candidate = base if self._collisions.get(base, 0) <= 1 else f"{base}-{slide}-{sid}"
            if candidate in self._used:
                candidate = f"{candidate}-{index}"
            extra = 2
            while candidate in self._used:
                candidate = f"{base}-{slide}-{sid}-{index}-{extra}"
                extra += 1
        self._used.add(candidate)
        return candidate


# --------------------------------------------------------------------------------------
# Правила классификации (SPEC §3: NodeType = step | data | integration | warning)
# --------------------------------------------------------------------------------------

INTEGRATION_FILL = "srgb:A6A6A6"
INTEGRATION_TEXT_RE = re.compile(r"^Передача\b.*\b(из|в)\s+модул", re.IGNORECASE)
WARNING_TEXT_RE = re.compile(r"предупрежден", re.IGNORECASE)
WARNING_ITEM_RE = re.compile(r"^Предупреждени", re.IGNORECASE)
SYSTEM_RE = re.compile(r"(?<![A-Za-zА-Яа-я])(" + "|".join(SYSTEM_CODES) + r")(?![A-Za-zА-Яа-я])")
DIRECTION_IN_RE = re.compile(r"\bиз\s+модул", re.IGNORECASE)
DIRECTION_OUT_RE = re.compile(r"(\bв\s+модул|Выгрузка\s+в\b)", re.IGNORECASE)


def is_integration(shape: Shape) -> bool:
    """
    Интеграция — серый бокс (заливка A6A6A6) либо текст вида
    «Передача … из/в модуль X». Оба признака взяты из презентации напрямую.
    """
    if shape.fill == INTEGRATION_FILL:
        return True
    return bool(INTEGRATION_TEXT_RE.search(shape.text))


def is_warning(shape: Shape) -> bool:
    """
    Предупреждение — узел, предметом которого является формирование/расчёт
    предупреждения (отдельной заливки для предупреждений в презентации нет,
    единственный однозначный признак — текст).
    """
    return bool(WARNING_TEXT_RE.search(shape.text))


def node_type_for(shape: Shape) -> str:
    if is_integration(shape):
        return "integration"
    if is_warning(shape):
        return "warning"
    return "step"


def detect_system(text: str) -> str | None:
    match = SYSTEM_RE.search(text)
    return match.group(1) if match else None


def detect_direction(text: str) -> str | None:
    if DIRECTION_IN_RE.search(text):
        return "in"
    if DIRECTION_OUT_RE.search(text):
        return "out"
    return None


def is_container(shape: Shape) -> bool:
    """Контейнер группы — широкий бесфонный прямоугольник без текста."""
    return (
        shape.kind == "auto"
        and not shape.has_text
        and shape.fill == "noFill"
        and shape.box.width >= CONTAINER_MIN_WIDTH
    )


def is_decor_arrow(shape: Shape) -> bool:
    """Мелкая стрелка-коннектор обзора: без текста, без явной заливки, узкая."""
    return (
        shape.kind == "auto"
        and not shape.has_text
        and shape.fill is None
        and shape.box.width <= DECOR_ARROW_MAX_WIDTH
    )


def is_caption_long_form(paragraphs: Sequence[str]) -> bool:
    """
    Подпись под узлом — либо перечень выходов, либо развёрнутое описание.
    Описание распознаём по двоеточию, маркерам списка «-» или очень длинному абзацу.
    """
    joined = " ".join(paragraphs)
    if ":" in joined:
        return True
    if any(p.startswith("-") for p in paragraphs):
        return True
    return any(len(p) > 90 for p in paragraphs)


# --------------------------------------------------------------------------------------
# Дедупликация ExternalIO
# --------------------------------------------------------------------------------------

IO_STOP_WORDS = {
    "передача", "передать", "из", "в", "во", "на", "и", "с", "до",
    "модуль", "модуля", "модулей", "выгрузка",
}
IO_MATCH_RATIO = 0.75
IO_MATCH_MIN_COMMON = 2


def io_tokens(text: str) -> set[str]:
    """
    Грубые «стемы» содержательных слов подписи интеграции: нижний регистр, ё→е,
    выброшены стоп-слова, остальное обрезано до 4 символов. Коды систем сохраняются
    целиком. Нужны, чтобы одна и та же передача, описанная на слайде обзора и на
    слайде детализации разными словами, не превратилась в две записи ExternalIO.
    """
    words = re.findall(r"[a-zа-я0-9]+", text.lower().replace("ё", "е"))
    tokens: set[str] = set()
    for word in words:
        if word.upper() in SYSTEM_CODES:
            tokens.add(word)
            continue
        if word in IO_STOP_WORDS or len(word) < 3:
            continue
        tokens.add(word[:4])
    return tokens


def same_transfer(first: str, second: str) -> bool:
    a, b = io_tokens(first), io_tokens(second)
    if not a or not b:
        return first == second
    common = len(a & b)
    if common < IO_MATCH_MIN_COMMON:
        return False
    return common / min(len(a), len(b)) >= IO_MATCH_RATIO


def add_external_io(bucket: list[dict], entry: dict) -> bool:
    """Добавляет ExternalIO, если такая же передача ещё не записана."""
    for existing in bucket:
        if existing["system"] == entry["system"] and same_transfer(existing["label"], entry["label"]):
            return False
    bucket.append(entry)
    return True


# --------------------------------------------------------------------------------------
# Геометрия: группы, подписи, рёбра
# --------------------------------------------------------------------------------------


def find_title_for_container(container: Shape, textboxes: Sequence[Shape]) -> Shape | None:
    """
    Заголовок группы — однострочный TEXT_BOX прямо над контейнером
    (горизонтальное пересечение, верх в окне [container.top - GAP, container.top)).
    Берём самый нижний из подходящих.
    """
    best: Shape | None = None
    for tb in textboxes:
        if tb.consumed_by is not None or len(tb.paragraphs) != 1:
            continue
        if not (container.box.top - GROUP_TITLE_MAX_GAP <= tb.box.top < container.box.top):
            continue
        if tb.box.right <= container.box.left or tb.box.left >= container.box.right:
            continue
        if best is None or tb.box.top > best.box.top:
            best = tb
    return best


def innermost_container(containers: Sequence[tuple[Shape, str]], box: Box) -> str | None:
    """Группа узла — самый маленький контейнер, содержащий центр узла."""
    best: tuple[int, str] | None = None
    for shape, group_id in containers:
        if shape.box.contains_point(box.cx, box.cy):
            if best is None or shape.box.area < best[0]:
                best = (shape.box.area, group_id)
    return best[1] if best else None


def line_endpoints(shape: Shape) -> tuple[tuple[float, float], tuple[float, float]]:
    """
    Начало и конец линии из left/top/width/height + флагов отражения.
    Стрелка на конце (a:tailEnd) означает направление начало→конец; стрелка
    на начале (a:headEnd) — обратное.
    """
    x1 = shape.box.right if shape.flip_h else shape.box.left
    x2 = shape.box.left if shape.flip_h else shape.box.right
    y1 = shape.box.bottom if shape.flip_v else shape.box.top
    y2 = shape.box.top if shape.flip_v else shape.box.bottom
    start = (float(x1), float(y1))
    end = (float(x2), float(y2))
    if shape.head_arrow and not shape.tail_arrow:
        return end, start
    return start, end


def rank_candidates(
    candidates: Sequence[tuple[Box, str]], point: tuple[float, float]
) -> list[tuple[float, str]]:
    best: dict[str, float] = {}
    for box, key in candidates:
        distance = box.distance_to_point(point[0], point[1])
        if key not in best or distance < best[key]:
            best[key] = distance
    # Узел и поглощённая им надпись дают один и тот же key, поэтому конкурентами
    # в проверке однозначности они быть не должны.
    ranked = sorted((distance, key) for key, distance in best.items())
    return ranked


def nearest_target(
    candidates: Sequence[tuple[Box, str]], point: tuple[float, float], snap: float
) -> str | None:
    ranked = rank_candidates(candidates, point)
    if ranked and ranked[0][0] <= snap:
        return ranked[0][1]
    return None


def resolve_second_pass(ranked: Sequence[tuple[float, str]], exclude: str) -> str | None:
    """
    Второй проход для линии, у которой разрешён ровно один конец: берём ближайший
    узел в пределах EDGE_SNAP_SECOND, но только если следующий кандидат заметно
    дальше — иначе конец считается неоднозначным и связь не выдумывается.
    """
    filtered = [item for item in ranked if item[1] != exclude]
    if not filtered:
        return None
    distance, key = filtered[0]
    if distance > EDGE_SNAP_SECOND:
        return None
    if len(filtered) > 1 and filtered[1][0] < distance * EDGE_SECOND_RATIO:
        return None
    return key


# --------------------------------------------------------------------------------------
# Обработка слайда детализации
# --------------------------------------------------------------------------------------


def build_stage(
    slide_no: int,
    stage_number: int,
    shapes: Sequence[Shape],
    overview_title: str | None,
    ids: IdFactory,
    report: SlideReport,
    seen_signatures: set[tuple],
) -> dict:
    title_shape = next((s for s in shapes if s.kind == "placeholder" and s.has_text), None)
    title = normalize_text(title_shape.text) if title_shape else f"Этап {stage_number}"
    if title_shape:
        title_shape.consumed_by = "заголовок этапа"
    for s in shapes:
        if s.kind == "placeholder" and s.consumed_by is None:
            s.consumed_by = "номер слайда"

    textboxes = [s for s in shapes if s.kind == "textbox" and s.has_text]
    lines = [s for s in shapes if s.kind == "line"]

    # 0. Забытые при копировании слайда фигуры: полностью совпадают с фигурой
    #    предыдущего слайда (тот же shape_id, те же координаты, тот же текст).
    for tb in textboxes:
        signature = (tb.sid, tb.box.left, tb.box.top, tb.box.width, tb.box.height, tb.text)
        if signature in seen_signatures:
            tb.consumed_by = "дубликат фигуры предыдущего слайда"
            report.text_skipped.append(
                f"слайд {slide_no}: [{tb.sid}] «{tb.text[:70]}» — точная копия фигуры "
                f"предыдущего слайда (остаток вёрстки), пропущена"
            )
        else:
            seen_signatures.add(signature)

    # 1. Группы: контейнеры + заголовок над ними.
    containers: list[tuple[Shape, str]] = []
    groups: list[dict] = []
    group_ids: set[str] = set()
    for container in [s for s in shapes if is_container(s)]:
        title_tb = find_title_for_container(container, textboxes)
        if title_tb is None:
            report.questions.append(
                f"слайд {slide_no}: контейнер [{container.sid}] без заголовка — группа не создана"
            )
            continue
        title_tb.consumed_by = "заголовок группы"
        label = title_tb.text
        group_id = slugify(label)
        if group_id in group_ids:
            group_id = f"{group_id}-{container.sid}"
        group_ids.add(group_id)
        containers.append((container, group_id))
        groups.append({"id": group_id, "label": label})
    report.groups = len(groups)

    # 2. Узлы-фигуры: AUTO_SHAPE с текстом (кроме контейнеров и декоративных стрелок).
    node_shapes = [
        s
        for s in shapes
        if s.kind == "auto" and s.has_text and not is_container(s) and not is_decor_arrow(s)
    ]
    drafts: list[NodeDraft] = []
    for shape in node_shapes:
        drafts.append(
            NodeDraft(
                node_id=ids.make(shape.text, slide_no, shape.sid),
                node_type=node_type_for(shape),
                label=shape.text,
                box=shape.box,
                group=innermost_container(containers, shape.box),
            )
        )

    # 2.5. Промоушен текстбокса в узел: в презентации часть вершин графа нарисована
    #      не автофигурой, а надписью. Признак — однострочный текст, в bbox которого
    #      упираются минимум два конца линий (то есть он реально используется как
    #      вершина, а не как подпись).
    endpoint_points: list[tuple[float, float]] = []
    for line in lines:
        start, end = line_endpoints(line)
        endpoint_points.extend((start, end))
    for tb in sorted([t for t in textboxes if t.consumed_by is None], key=Shape.sort_key):
        if len(tb.paragraphs) != 1:
            continue
        hits = sum(
            1 for point in endpoint_points if tb.box.distance_to_point(*point) <= PROMOTE_SNAP
        )
        if hits < PROMOTE_MIN_ENDPOINTS:
            continue
        tb.consumed_by = "узел (промоушен из текстбокса)"
        drafts.append(
            NodeDraft(
                node_id=ids.make(tb.text, slide_no, tb.sid),
                node_type=node_type_for(tb),
                label=tb.text,
                box=tb.box,
                group=innermost_container(containers, tb.box),
            )
        )
        report.promoted.append(
            f"слайд {slide_no}: [{tb.sid}] «{tb.text[:60]}» — узел (концов линий: {hits})"
        )

    # Текстовые фигуры, поглощённые узлом (подпись-выход или описание), работают
    # как «продолжение» узла: стрелка, упирающаяся в такую надпись, упирается в узел.
    proxies: list[tuple[Box, str]] = []

    # 3. Подписи под узлами → outputs (или description для развёрнутого текста).
    for tb in textboxes:
        if tb.consumed_by is not None:
            continue
        # Текст, дословно повторяющий подпись другого узла этого же слайда, —
        # ссылка на узел, а не новый артефакт: привязка неоднозначна.
        if any(d.label == tb.text for d in drafts):
            report.questions.append(
                f"слайд {slide_no}: [{tb.sid}] «{tb.text[:60]}» дословно повторяет подпись узла "
                f"— как подпись-выход не привязан"
            )
            continue
        best: tuple[float, NodeDraft] | None = None
        for draft in drafts:
            # Тонкие полосы (слайд 5) подписываются сверху, а не снизу.
            if draft.node_type == "data" or draft.box.height < CAPTION_MIN_NODE_HEIGHT:
                continue
            gap = tb.box.top - draft.box.bottom
            if not (CAPTION_MIN_GAP <= gap <= CAPTION_MAX_GAP):
                continue
            overlap = min(tb.box.right, draft.box.right) - max(tb.box.left, draft.box.left)
            if overlap <= 0:
                continue
            covers_node = tb.box.left <= draft.box.left and tb.box.right >= draft.box.right
            coverage = overlap / draft.box.width if covers_node else overlap / tb.box.width
            if coverage < CAPTION_MIN_OVERLAP:
                continue
            score = (gap, abs(tb.box.left - draft.box.left))
            if best is None or score < (best[0], abs(tb.box.left - best[1].box.left)):
                best = (gap, draft)
        if best is None:
            continue
        draft = best[1]
        tb.consumed_by = f"подпись узла {draft.node_id}"
        proxies.append((tb.box, draft.node_id))
        if is_caption_long_form(tb.paragraphs):
            draft.description_parts.extend(tb.paragraphs)
        else:
            draft.outputs.extend(tb.paragraphs)

    # 4. Левая колонка входов → узлы типа data (SPEC §4.2: DataNode входов слева).
    #    Подписи-выходы к этому моменту уже разобраны шагом 3, поэтому здесь
    #    достаточно признака «текстбокс стоит в левом поле слайда».
    #    group у data-узлов не проставляется: входы стоят вне групп (SPEC §4.2).
    #    direction='in' — по происхождению, а не по координате: это и есть
    #    колонка входов слайда (см. NodeDraft.direction, задача process-map-24p).
    for tb in sorted([t for t in textboxes if t.consumed_by is None], key=Shape.sort_key):
        if tb.box.left > LEFT_MARGIN_LIMIT:
            continue
        tb.consumed_by = "колонка входов"
        unique: list[str] = []
        for para in tb.paragraphs:
            if para not in unique:
                unique.append(para)
        if len(unique) != len(tb.paragraphs):
            report.questions.append(
                f"слайд {slide_no}: в списке входов [{tb.sid}] "
                f"{len(tb.paragraphs) - len(unique)} повторяющихся строк — оставлены уникальные"
            )
        step = tb.box.height / max(len(unique), 1)
        for index, para in enumerate(unique):
            drafts.append(
                NodeDraft(
                    node_id=ids.make(para, slide_no, tb.sid, index),
                    node_type="data",
                    label=para,
                    box=Box(tb.box.left, int(tb.box.top + index * step), tb.box.width, int(step)),
                    direction="in",
                )
            )
            report.data_nodes += 1

    # 5. Оставшиеся подписи внутри контейнера → description ближайшего узла группы.
    #    Привязка нестрогая, поэтому каждая попадает в отчёт.
    for tb in sorted([t for t in textboxes if t.consumed_by is None], key=Shape.sort_key):
        group_id = innermost_container(containers, tb.box)
        if group_id is None:
            continue
        siblings = [d for d in drafts if d.group == group_id and d.node_type != "data"]
        if not siblings:
            continue

        def distance(draft: NodeDraft, anchor: Shape = tb) -> tuple[float, str]:
            return (
                math.hypot(draft.box.cx - anchor.box.cx, draft.box.cy - anchor.box.cy),
                draft.node_id,
            )

        # В презентации такие подписи стоят НАД своим узлом (ряды «повод — действие»
        # на слайде 5), поэтому сначала ищем ближайший узел ниже подписи.
        below = [d for d in siblings if d.box.cy > tb.box.cy]
        best_draft = min(below or siblings, key=distance)
        dist = distance(best_draft)[0]
        if len(siblings) > 1 and dist > LOOSE_DESC_MAX_DIST:
            continue
        tb.consumed_by = f"описание узла {best_draft.node_id}"
        proxies.append((tb.box, best_draft.node_id))
        best_draft.description_parts.extend(tb.paragraphs)
        report.loose_attachments.append(
            f"слайд {slide_no}: [{tb.sid}] «{tb.text[:70]}» → description узла «{best_draft.node_id}»"
        )

    # 6. Рёбра: концы линий геометрически «прилипают» к узлам (два прохода).
    by_id = {d.node_id: d for d in drafts}
    node_boxes = [(d.box, d.node_id) for d in drafts if d.node_type != "data"]
    node_boxes.extend(proxies)
    edges: list[dict] = []
    seen_pairs: set[tuple[str, str]] = set()
    report.lines_total = len(lines)
    for line in lines:
        start, end = line_endpoints(line)
        ranked_start = rank_candidates(node_boxes, start)
        ranked_end = rank_candidates(node_boxes, end)
        source = ranked_start[0][1] if ranked_start and ranked_start[0][0] <= EDGE_SNAP_DETAIL else None
        target = ranked_end[0][1] if ranked_end and ranked_end[0][0] <= EDGE_SNAP_DETAIL else None
        if source is not None and target is None:
            target = resolve_second_pass(ranked_end, source)
        elif target is not None and source is None:
            source = resolve_second_pass(ranked_start, target)
        if source is None or target is None or source == target:
            reason = "петля" if source is not None and source == target else "конец не определён"
            report.lines_skipped.append(f"слайд {slide_no}: линия [{line.sid}] — {reason}")
            continue
        if (source, target) in seen_pairs:
            continue
        seen_pairs.add((source, target))
        endpoint_types = {by_id[source].node_type, by_id[target].node_type}
        edges.append(
            {
                "id": f"e-{source}--{target}",
                "source": source,
                "target": target,
                "kind": "integration" if "integration" in endpoint_types else "process",
            }
        )
    report.edges = len(edges)

    # 7. Внешние системы этапа (ExternalIO): из текста интеграций и узлов публикации.
    inputs: list[dict] = []
    outputs: list[dict] = []
    for draft in drafts:
        if draft.node_type == "integration" and detect_system(draft.label) is None:
            report.questions.append(
                f"слайд {slide_no}: интеграция «{draft.label[:60]}» — система в тексте не названа"
            )
        for text in [draft.label] + draft.outputs:
            system = detect_system(text)
            direction = detect_direction(text)
            if system is None or direction is None:
                continue
            entry = {"system": system, "label": text, "stage": stage_number, "direction": direction}
            bucket = inputs if direction == "in" else outputs
            if add_external_io(bucket, entry) and draft.system is None:
                draft.system = system

    # 8. Отчёт по потерянным текстовым фигурам.
    for tb in textboxes:
        if tb.consumed_by is None:
            report.text_skipped.append(f"слайд {slide_no}: [{tb.sid}] «{tb.text[:80]}»")

    report.nodes = len(drafts)

    short_title = re.split(r"\s/|/\s|\s\+\s", title)[0].strip()
    return {
        "id": slugify(f"stage-{stage_number}-{overview_title or short_title}"),
        "number": stage_number,
        "title": title,
        "shortTitle": short_title,
        "keyOutputs": [],
        "warningsCount": 0,
        "groups": groups,
        "nodes": [serialize_node(d) for d in sorted(drafts, key=lambda d: (d.box.top, d.box.left, d.node_id))],
        "edges": edges,
        "inputs": inputs,
        "outputs": outputs,
    }


def serialize_node(draft: NodeDraft) -> dict:
    node: dict = {"id": draft.node_id, "type": draft.node_type, "label": draft.label}
    if draft.description:
        node["description"] = draft.description
    if draft.group:
        node["group"] = draft.group
    if draft.direction:
        node["direction"] = draft.direction
    if draft.inputs:
        node["inputs"] = draft.inputs
    if draft.outputs:
        node["outputs"] = draft.outputs
    if draft.system:
        node["system"] = draft.system
    slide_position = {
        "x": round(draft.box.left / EMU_PER_PX),
        "y": round(draft.box.top / EMU_PER_PX),
    }
    # position — то, что покажет приложение; его перезапишет `npm run layout`.
    # slidePosition — та же геометрия слайда, но НАВСЕГДА: раскладка сидируется
    # ею, а не собственным прошлым результатом (SPEC §3, задача process-map-cxn).
    # Два разных словаря, а не один и тот же объект: иначе правка одного поля
    # молча меняла бы второе.
    node["position"] = dict(slide_position)
    node["slidePosition"] = slide_position
    return node


# --------------------------------------------------------------------------------------
# Обработка слайда обзора
# --------------------------------------------------------------------------------------


@dataclass
class OverviewData:
    titles: list[str]
    output_blocks: list[list[tuple[list[str], Box, int]]]
    group_labels: list[list[str]]
    systems: list[dict]
    edges: list[dict]
    report: SlideReport


def build_overview(shapes: Sequence[Shape], report: SlideReport) -> OverviewData:
    textboxes = [s for s in shapes if s.kind == "textbox" and s.has_text]
    for s in shapes:
        if s.kind == "placeholder":
            s.consumed_by = "служебный текст слайда"

    containers = [s for s in shapes if is_container(s)]
    # Порядок этапов: верхний ряд, затем нижний слева направо.
    containers.sort(key=lambda s: (round(s.box.top / 1_000_000), s.box.left))

    titles: list[str] = []
    output_blocks: list[list[tuple[list[str], Box, int]]] = []
    group_labels: list[list[str]] = []

    boxed = [s for s in shapes if s.kind == "auto" and s.has_text]
    group_boxes = [s for s in boxed if s.fill == "scheme:accent1"]
    system_boxes = [s for s in boxed if s.fill in ("scheme:accent2", "scheme:bg1")]

    for container in containers:
        title_tb = find_title_for_container(container, textboxes)
        if title_tb is not None:
            title_tb.consumed_by = "заголовок этапа обзора"
            titles.append(title_tb.text)
        else:
            titles.append("")
            report.questions.append(
                f"слайд 2: контейнер этапа [{container.sid}] без подписи-заголовка "
                f"— заголовок берётся со слайда детализации"
            )

        group_labels.append(
            [
                b.text
                for b in sorted(group_boxes, key=Shape.sort_key)
                if container.box.contains_point(b.box.cx, b.box.cy)
            ]
        )

        lo = container.box.top + KEY_OUTPUT_TOP_OFFSET
        hi = container.box.bottom + KEY_OUTPUT_BOTTOM_OFFSET
        blocks: list[tuple[list[str], Box, int]] = []
        for tb in sorted(
            [t for t in textboxes if t.consumed_by is None], key=lambda s: (s.box.left, s.box.top)
        ):
            if not (lo <= tb.box.top <= hi):
                continue
            if tb.box.right <= container.box.left or tb.box.left >= container.box.right:
                continue
            tb.consumed_by = "блок выходов этапа"
            blocks.append((list(tb.paragraphs), tb.box, tb.sid))
        output_blocks.append(blocks)

    for b in group_boxes:
        if b.consumed_by is None:
            b.consumed_by = "бокс группы обзора"

    systems: list[dict] = []
    for shape in sorted(system_boxes, key=Shape.sort_key):
        code = detect_system(shape.text)
        if code is None:
            report.questions.append(
                f"слайд 2: бокс [{shape.sid}] «{shape.text[:60]}» — система не распознана"
            )
            continue
        systems.append(
            {
                "code": code,
                "label": shape.text,
                "direction": detect_direction(shape.text),
                "box": shape.box,
                "sid": shape.sid,
            }
        )
        shape.consumed_by = "внешняя система обзора"

    endpoints: list[tuple[Box, str]] = []
    for index, container in enumerate(containers, start=1):
        endpoints.append((container.box, f"@stage{index}"))
    for system in systems:
        endpoints.append((system["box"], f"@sys:{system['code']}:{system['sid']}"))

    connectors = [s for s in shapes if s.kind == "line"]
    arrows = [s for s in shapes if is_decor_arrow(s)]
    report.lines_total = len(connectors) + len(arrows)

    raw_edges: list[tuple[str, str]] = []
    for line in connectors:
        start, end = line_endpoints(line)
        source = nearest_target(endpoints, start, EDGE_SNAP_OVERVIEW)
        target = nearest_target(endpoints, end, EDGE_SNAP_OVERVIEW)
        if source is None or target is None or source == target:
            report.lines_skipped.append(
                f"слайд 2: линия [{line.sid}] — концы не привязались к этапу/системе"
            )
            continue
        raw_edges.append((source, target))

    for arrow in arrows:
        source = nearest_target(endpoints, (float(arrow.box.left), arrow.box.cy), EDGE_SNAP_OVERVIEW)
        target = nearest_target(endpoints, (float(arrow.box.right), arrow.box.cy), EDGE_SNAP_OVERVIEW)
        if source is None or target is None or source == target:
            # Стрелка между группами внутри одного этапа — не обзорное ребро.
            continue
        raw_edges.append((source, target))

    for tb in textboxes:
        if tb.consumed_by is None:
            report.text_skipped.append(f"слайд 2: [{tb.sid}] «{tb.text[:80]}»")

    return OverviewData(
        titles=titles,
        output_blocks=output_blocks,
        group_labels=group_labels,
        systems=systems,
        edges=[{"source": s, "target": t} for s, t in raw_edges],
        report=report,
    )


def choose_key_outputs(blocks: Sequence[tuple[list[str], Box, int]]) -> list[str]:
    """
    Ключевые выходы этапа. Если среди блоков есть перечень с заголовком-двоеточием
    («Опубликованные планы:»), берём его пункты — это и есть выходы этапа.
    Иначе — первые три абзаца в порядке чтения.
    """
    for paragraphs, _box, _sid in blocks:
        if paragraphs and paragraphs[0].endswith(":"):
            return paragraphs[1 : 1 + MAX_KEY_OUTPUTS]
    flat = [p for paragraphs, _box, _sid in blocks for p in paragraphs]
    return flat[:MAX_KEY_OUTPUTS]


# --------------------------------------------------------------------------------------
# Сборка документа
# --------------------------------------------------------------------------------------


def count_warnings(stage: dict) -> int:
    """
    Число предупреждений этапа — по содержанию слайда (перечень типов
    предупреждений), а не по числу узлов типа warning.
    """
    distinct: set[str] = set()
    for node in stage["nodes"]:
        candidates = [node["label"], *node.get("outputs", [])]
        candidates.extend((node.get("description") or "").split("\n"))
        for text in candidates:
            text = text.strip()
            if text and WARNING_ITEM_RE.match(text):
                distinct.add(text)
    node_warnings = sum(1 for node in stage["nodes"] if node["type"] == "warning")
    return max(len(distinct), node_warnings)


def build_process_map(
    collisions: dict[str, int] | None,
) -> tuple[dict, list[SlideReport], list[str], Counter[str]]:
    if not PPTX_PATH.exists():
        raise SystemExit(f"Не найдена презентация: {PPTX_PATH}")

    presentation = Presentation(str(PPTX_PATH))
    if int(presentation.slide_width) != SLIDE_WIDTH_EMU:
        raise SystemExit(
            f"Неожиданная ширина слайда {presentation.slide_width} EMU (ожидалось {SLIDE_WIDTH_EMU})"
        )
    slides = list(presentation.slides)
    if len(slides) != 6:
        raise SystemExit(f"Ожидалось 6 слайдов, найдено {len(slides)}")

    reports: list[SlideReport] = []
    questions: list[str] = []

    overview_report = SlideReport(slide_no=2)
    overview = build_overview(read_slide(slides[1]), overview_report)

    ids = IdFactory(collisions)
    seen_signatures: set[tuple] = set()
    stages: list[dict] = []
    for index in range(4):
        slide_no = index + 3
        report = SlideReport(slide_no=slide_no)
        stage = build_stage(
            slide_no=slide_no,
            stage_number=index + 1,
            shapes=read_slide(slides[index + 2]),
            overview_title=overview.titles[index] if index < len(overview.titles) else None,
            ids=ids,
            report=report,
            seen_signatures=seen_signatures,
        )
        stages.append(stage)
        reports.append(report)

    # Рёбра, которых в презентации нет (OWNER_DECISION_EDGES) — досыпаются сразу
    # после разбора слайдов детализации, до сверок и отчётов: изолированные узлы
    # и целостность считаются уже по итоговому набору рёбер. reports здесь ещё
    # содержит ровно 4 отчёта этапов, отчёт обзора вставляется в начало ниже.
    #
    # Только во ВТОРОЙ фазе: в первой (collisions=None) IdFactory выдаёт
    # временные id вида «base~N» ради подсчёта коллизий, и сверять с ними id,
    # названные в решении владельца, бессмысленно — не нашлось бы ни одного.
    # Результат первой фазы всё равно выбрасывается, кроме карты коллизий, а
    # рёбра решения новых id не создают, так что пропуск ни на что не влияет.
    if collisions is not None:
        apply_owner_decision_edges(stages, reports)

    # Правая колонка выходов этапа (SPEC §4.2) — блоки под контейнером на слайде 2.
    # direction='out' — по происхождению: это блок выходов этапа в обзоре
    # (см. NodeDraft.direction, задача process-map-24p). Абсцисса такого блока
    # к колонке отношения не имеет: у этапов 1 и 2 она левее середины области
    # шагов, и прежнее геометрическое правило зачисляло эти узлы во входы.
    #
    # Артефакт, который уже есть среди узлов этапа, вторым узлом не заводится
    # (проверка по casefold ниже) и направления НЕ меняет: на слайде
    # детализации он нарисован в левой колонке входов, и переписать ему
    # direction на 'out' значило бы решить за владельца процесса, что
    # презентация в одном из двух мест ошибается. Такие узлы перечислены в
    # отчёте (report.dedup_key_outputs).
    for index, stage in enumerate(stages):
        blocks = overview.output_blocks[index] if index < len(overview.output_blocks) else []
        stage["keyOutputs"] = choose_key_outputs(blocks)
        existing = {node["label"].casefold() for node in stage["nodes"]}
        added: list[dict] = []
        for paragraphs, box, sid in blocks:
            step = box.height / max(len(paragraphs), 1)
            for para_index, para in enumerate(paragraphs):
                if para.casefold() in existing:
                    twin = next(
                        (n for n in stage["nodes"] if n["label"].casefold() == para.casefold()),
                        None,
                    )
                    if twin is not None and twin.get("direction") == "in":
                        overview_report.dedup_key_outputs.append(
                            f"этап {stage['number']}: «{para}» назван выходом этапа в обзоре "
                            f"(слайд 2), но на слайде детализации это узел «{twin['id']}» из "
                            f"колонки входов — оставлен входом, отдельный узел-выход не создан"
                        )
                    continue
                existing.add(para.casefold())
                added.append(
                    serialize_node(
                        NodeDraft(
                            node_id=ids.make(para, 2, sid, para_index),
                            node_type="data",
                            label=para,
                            box=Box(
                                box.left, int(box.top + para_index * step), box.width, int(step)
                            ),
                            direction="out",
                        )
                    )
                )
        stage["nodes"].extend(added)
        overview_report.data_nodes += len(added)
        stage["warningsCount"] = count_warnings(stage)

    # Сверка списка групп: обзор (слайд 2) против слайдов детализации.
    for index, stage in enumerate(stages):
        overview_groups = overview.group_labels[index] if index < len(overview.group_labels) else []
        detail_groups = [g["label"] for g in stage["groups"]]
        for label in [g for g in overview_groups if g not in detail_groups]:
            questions.append(
                f"этап {stage['number']}: группа «{label}» есть в обзоре (слайд 2), "
                f"но не найдена на слайде детализации"
            )
        for label in [g for g in detail_groups if g not in overview_groups]:
            questions.append(
                f"этап {stage['number']}: группа «{label}» есть на слайде детализации, "
                f"но не найдена в обзоре (слайд 2)"
            )

    # Обзорные рёбра: перевод внутренних ключей в id этапов и коды систем.
    stage_key_to_id = {f"@stage{stage['number']}": stage["id"] for stage in stages}
    system_by_sid = {f"@sys:{s['code']}:{s['sid']}": s for s in overview.systems}

    resolved: list[tuple[str, str, str]] = []
    for edge in overview.edges:
        source, target = edge["source"], edge["target"]
        s_key, t_key = stage_key_to_id.get(source), stage_key_to_id.get(target)
        s_sys, t_sys = system_by_sid.get(source), system_by_sid.get(target)
        if s_key and t_key:
            resolved.append((s_key, t_key, "process"))
        elif s_key and t_sys:
            direction = register_system(stages, t_sys, source, "out")
            resolved.append(
                (s_key, t_sys["code"], "integration")
                if direction == "out"
                else (t_sys["code"], s_key, "integration")
            )
        elif s_sys and t_key:
            direction = register_system(stages, s_sys, target, "in")
            resolved.append(
                (s_sys["code"], t_key, "integration")
                if direction == "in"
                else (t_key, s_sys["code"], "integration")
            )
        else:
            overview_report.lines_skipped.append(
                f"слайд 2: ребро {source} → {target} — не пара «этап/система»"
            )

    overview_edges: list[dict] = []
    seen: set[tuple[str, str]] = set()
    for source, target, kind in resolved:
        if (source, target) in seen:
            continue
        seen.add((source, target))
        overview_edges.append(
            {"id": f"ov-{source}--{target}", "source": source, "target": target, "kind": kind}
        )
    overview_report.edges = len(overview_edges)

    reports.insert(0, overview_report)
    for report in reports:
        questions.extend(report.questions)

    process_map = {
        "version": MAP_VERSION,
        "updatedAt": MAP_UPDATED_AT,
        "title": MAP_TITLE,
        "stages": stages,
        "overviewEdges": overview_edges,
    }
    return process_map, reports, questions, ids.counts


def apply_owner_decision_edges(
    stages: list[dict],
    stage_reports: Sequence[SlideReport],
    decisions: Sequence[dict] = OWNER_DECISION_EDGES,
) -> None:
    """
    Досыпает в этапы рёбра из OWNER_DECISION_EDGES — единственные рёбра
    документа, которых нет в презентации (см. комментарий у самой константы).

    Инварианты те же, что у прочитанных со слайда рёбер, и проверяются здесь,
    а не только в src/data/schema.ts::validateIntegrity: оба конца — узлы ТОГО
    ЖЕ этапа, id ребра уникален (формат `e-{source}--{target}` общий с
    построенными по линиям, поэтому «уже есть такое ребро» и «дубль id» — одно
    и то же условие и разбирается одинаково).

    Узел, названный в решении, но исчезнувший из презентации, — ОСТАНОВКА
    импорта, а не пропуск: пропустить значило бы тихо потерять решение
    владельца, а именно ради того, чтобы оно не терялось, список и заведён.
    """
    by_number = {stage["number"]: stage for stage in stages}
    for decision in decisions:
        report = stage_reports[decision["stage"] - 1]
        stage = by_number.get(decision["stage"])
        if stage is None:
            raise SystemExit(
                f"OWNER_DECISION_EDGES ({decision['task']}): этапа {decision['stage']} нет "
                f"в презентации — решение владельца применить не к чему"
            )
        node_ids = {node["id"] for node in stage["nodes"]}
        existing = {edge["id"] for edge in stage["edges"]}
        endpoints = (decision["source"], *decision["targets"])
        missing = [node_id for node_id in endpoints if node_id not in node_ids]
        if missing:
            raise SystemExit(
                f"OWNER_DECISION_EDGES ({decision['task']}): на этапе {decision['stage']} нет "
                f"узлов {', '.join(missing)} — презентация изменилась. Импорт остановлен, чтобы "
                f"решение владельца не потерялось молча: обновите список в scripts/import-pptx.py."
            )
        for target in decision["targets"]:
            edge_id = f"e-{decision['source']}--{target}"
            if edge_id in existing:
                report.owner_edges.append(
                    f"этап {decision['stage']}: {decision['source']} → {target} — уже есть "
                    f"в презентации (стрелка нарисована), решение владельца её подтверждает"
                )
                continue
            existing.add(edge_id)
            stage["edges"].append(
                {
                    "id": edge_id,
                    "source": decision["source"],
                    "target": target,
                    "kind": decision["kind"],
                }
            )
            report.owner_edges.append(
                f"этап {decision['stage']}: {decision['source']} → {target} — ДОБАВЛЕНО "
                f"по решению владельца ({decision['task']}), в презентации стрелки нет"
            )


def register_system(stages: list[dict], system: dict, stage_key: str, direction_hint: str) -> str:
    """
    Внешняя система обзора попадает в ExternalIO этапа, к которому её ведёт стрелка.
    Направление берём из текста бокса («из модуля X» / «в модуль X»); если текст
    направления не содержит (бокс «ERP»), используем направление самой стрелки.
    """
    direction = system["direction"] or direction_hint
    stage = next((s for s in stages if f"@stage{s['number']}" == stage_key), None)
    if stage is None:
        return direction
    bucket = stage["inputs"] if direction == "in" else stage["outputs"]
    add_external_io(
        bucket,
        {
            "system": system["code"],
            "label": system["label"],
            "stage": stage["number"],
            "direction": direction,
        },
    )
    return direction


# --------------------------------------------------------------------------------------
# Отчёт-сверка
# --------------------------------------------------------------------------------------


def isolated_nodes(stage: dict) -> list[dict]:
    """
    Не-data узлы этапа без единого ребра.

    Это НЕ дефект импорта: изолированный узел означает, что соответствующей
    связи нет и в самой презентации. Связи не достраиваются (CLAUDE.md запрещает
    изобретать процесс), поэтому список печатается поимённо — по нему владелец
    процесса видит, где связь нужно проставить вручную.
    """
    connected: set[str] = set()
    for edge in stage["edges"]:
        connected.add(edge["source"])
        connected.add(edge["target"])
    return [n for n in stage["nodes"] if n["type"] != "data" and n["id"] not in connected]


def print_report(process_map: dict, reports: Sequence[SlideReport], questions: Sequence[str]) -> None:
    print("=" * 78)
    print("ОТЧЁТ-СВЕРКА  scripts/import-pptx.py")
    print(f"источник: {PPTX_PATH.name}")
    print("=" * 78)

    for report in reports:
        print(f"\n--- слайд {report.slide_no} " + "-" * 55)
        if report.slide_no == 2:
            print(f"  этапов (контейнеров): {len(process_map['stages'])}")
            print(f"  обзорных рёбер:       {report.edges}")
            print(f"  узлов-выходов (data): {report.data_nodes}")
        else:
            print(f"  узлов:                {report.nodes} (из них data: {report.data_nodes})")
            print(f"  групп:                {report.groups}")
            print(f"  рёбер:                {report.edges} из {report.lines_total} линий/стрелок")
        if report.promoted:
            print(f"  узлы из текстбоксов ({len(report.promoted)}):")
            for item in report.promoted:
                print(f"    + {item}")
        if report.lines_skipped:
            print(f"  линии без однозначных концов ({len(report.lines_skipped)}):")
            for item in report.lines_skipped:
                print(f"    · {item}")
        if report.loose_attachments:
            print(f"  нестрогие привязки текста ({len(report.loose_attachments)}):")
            for item in report.loose_attachments:
                print(f"    · {item}")
        if report.text_skipped:
            print(f"  ПРОПУЩЕННЫЕ ФИГУРЫ С ТЕКСТОМ ({len(report.text_skipped)}):")
            for item in report.text_skipped:
                print(f"    ! {item}")
        elif report.slide_no != 2:
            print("  пропущенных фигур с текстом: нет")

    print("\n" + "=" * 78)
    print("ИТОГО ПО ДОКУМЕНТУ")
    print("=" * 78)
    total_nodes = sum(len(s["nodes"]) for s in process_map["stages"])
    by_type: Counter[str] = Counter()
    for stage in process_map["stages"]:
        for node in stage["nodes"]:
            by_type[node["type"]] += 1
    print(f"  узлов всего: {total_nodes}")
    for key in ("step", "data", "integration", "warning"):
        print(f"    {key:<12} {by_type.get(key, 0)}")
    print(f"  рёбер в этапах: {sum(len(s['edges']) for s in process_map['stages'])}")
    print(f"  обзорных рёбер: {len(process_map['overviewEdges'])}")
    print(f"  групп:          {sum(len(s['groups']) for s in process_map['stages'])}")
    for stage in process_map["stages"]:
        print(
            f"  этап {stage['number']} «{stage['shortTitle']}»: "
            f"{len(stage['nodes'])} узлов, {len(stage['edges'])} рёбер, "
            f"{len(stage['groups'])} групп, {len(stage['inputs'])} входов, "
            f"{len(stage['outputs'])} выходов, warningsCount={stage['warningsCount']}"
        )
    # Направление data-узлов (SPEC §3, задача process-map-24p). Печатается
    # отдельным блоком, потому что это ответ на вопрос «почему на экране этапа
    # столько-то входов и столько-то выходов», а прежний ответ («так легли
    # координаты») больше не действует.
    print("\n" + "=" * 78)
    print("НАПРАВЛЕНИЕ data-УЗЛОВ (node.direction) — КОЛОНКИ ВХОДОВ И ВЫХОДОВ")
    print("=" * 78)
    print("  Ставится по происхождению фигуры, не по координатам:")
    print("    'in'  — левая колонка входов слайда детализации;")
    print("    'out' — блок выходов этапа под его контейнером на слайде обзора.")
    unset = 0
    for stage in process_map["stages"]:
        data_nodes = [n for n in stage["nodes"] if n["type"] == "data"]
        ins = sum(1 for n in data_nodes if n.get("direction") == "in")
        outs = sum(1 for n in data_nodes if n.get("direction") == "out")
        unset += len(data_nodes) - ins - outs
        flow = len(stage["nodes"]) - len(data_nodes)
        print(
            f"  этап {stage['number']} «{stage['shortTitle']}»: поток {flow}, "
            f"входов {ins}, выходов {outs}"
        )
    if unset:
        print(f"  ВНИМАНИЕ: data-узлов без direction: {unset} — это ошибка импортёра:")
        print("  все data-узлы рождаются в одном из двух мест, и оба знают направление.")
    else:
        print("  data-узлов без direction: нет")
    dedup = [item for report in reports for item in report.dedup_key_outputs]
    if dedup:
        print(f"  артефакт назван выходом в обзоре, но существует входом ({len(dedup)}):")
        for item in dedup:
            print(f"    · {item}")

    # Рёбра, которых в презентации НЕТ. Отдельный блок и есть то место, по
    # которому через полгода видно, что источник этих связей — решение
    # владельца процесса, а не стрелка на слайде (задача process-map-7bz).
    owner_edges = [item for report in reports for item in report.owner_edges]
    print("\n" + "=" * 78)
    print("РЁБРА ПО РЕШЕНИЮ ВЛАДЕЛЬЦА ПРОЦЕССА — В ПРЕЗЕНТАЦИИ ИХ НЕТ")
    print("=" * 78)
    if owner_edges:
        print("  Источник этих связей — OWNER_DECISION_EDGES в scripts/import-pptx.py,")
        print("  а НЕ линия на слайде. Всё остальное в документе прочитано из презентации.")
        for item in owner_edges:
            print(f"    · {item}")
    else:
        print("  список OWNER_DECISION_EDGES пуст — все рёбра прочитаны из презентации")

    print("\n" + "=" * 78)
    print("ИЗОЛИРОВАННЫЕ не-data УЗЛЫ — где в презентации связи нет")
    print("=" * 78)
    print("  Связи для них не достраиваются: в исходнике их действительно нет.")
    print("  Эти узлы нужно связать вручную или подтвердить, что связи быть не должно.")
    total_orphans = 0
    for stage in process_map["stages"]:
        orphans = isolated_nodes(stage)
        total_orphans += len(orphans)
        print(f"\n  этап {stage['number']} «{stage['shortTitle']}»: {len(orphans)}")
        for node in orphans:
            group = node.get("group")
            print(f"    · {node['id']}")
            print(
                f"        {node['type']:<11} «{node['label']}»"
                + (f"   [группа: {group}]" if group else "")
            )
    print(f"\n  всего изолированных не-data узлов: {total_orphans}")

    if questions:
        print("\n" + "=" * 78)
        print("ОТКРЫТЫЕ ВОПРОСЫ (нужны задачи -t question)")
        print("=" * 78)
        for item in questions:
            print(f"  ? {item}")


# --------------------------------------------------------------------------------------
# Перенос ручных полей из предыдущего process.json
# --------------------------------------------------------------------------------------


@dataclass
class CarryOverReport:
    """Что произошло с полями, которых в презентации нет."""

    had_previous: bool = False
    previous_nodes: int = 0
    transferred: list[str] = field(default_factory=list)
    cleared: list[str] = field(default_factory=list)
    invalid: list[str] = field(default_factory=list)
    lost: list[str] = field(default_factory=list)
    screens_transferred: int = 0
    screens_lost: int = 0


def is_screen_link(value: object) -> bool:
    """ScreenLink из schema.ts: ровно { title: string, url: string }."""
    return (
        isinstance(value, dict)
        and set(value) == {"title", "url"}
        and isinstance(value.get("title"), str)
        and isinstance(value.get("url"), str)
    )


def is_owner(value: object) -> bool:
    return isinstance(value, str)


FIELD_VALIDATORS = {"screen": is_screen_link, "owner": is_owner}


def reorder_keys(payload: dict, order: Sequence[str]) -> dict:
    """
    Пересобирает словарь в порядке ключей zod-схемы. Нужен, потому что перенос
    добавляет `owner`/`screen` уже после `position`, а порядок ключей влияет на
    байты файла (см. NODE_KEY_ORDER).
    """
    result = {key: payload[key] for key in order if key in payload}
    # Ключей вне схемы быть не должно; если появились — не теряем их молча.
    result.update({key: value for key, value in payload.items() if key not in result})
    return result


def load_previous_map(path: Path) -> dict | None:
    """
    Предыдущий process.json. Отсутствие файла — норма (первый запуск на чистом
    репозитории). А вот битый файл — НЕ норма: перезаписать его молча значит
    ровно то, ради чего эта функция написана, поэтому импорт останавливается.
    """
    if not path.exists():
        return None
    try:
        previous = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as error:
        raise SystemExit(
            f"Предыдущий {path} не читается ({error}). Импорт остановлен, чтобы не "
            f"затереть ручные ссылки на экраны: почините или удалите файл вручную."
        ) from error
    if not isinstance(previous, dict):
        raise SystemExit(f"Предыдущий {path} — не объект карты процесса. Импорт остановлен.")
    return previous


def index_previous(previous: dict) -> tuple[dict[str, dict], dict[str, dict]]:
    """id → узел и id → этап предыдущего документа."""
    nodes: dict[str, dict] = {}
    stages: dict[str, dict] = {}
    for stage in previous.get("stages") or []:
        if not isinstance(stage, dict):
            continue
        if isinstance(stage.get("id"), str):
            stages[stage["id"]] = stage
        for node in stage.get("nodes") or []:
            if isinstance(node, dict) and isinstance(node.get("id"), str):
                nodes[node["id"]] = node
    return nodes, stages


def carry_field(target: dict, source: dict, name: str, where: str, report: CarryOverReport) -> None:
    """
    Переносит одно поле. Три РАЗЛИЧИМЫХ состояния источника:

      · ключа нет           — поля никогда не было, переносить нечего, молчим;
      · значение null       — человек СОЗНАТЕЛЬНО удалил ссылку (SPEC §4.4,
                              кнопка «Удалить ссылку» пишет screen: null).
                              В сам JSON null не попадает: ProcessNodeSchema
                              объявляет screen как .optional(), а не .nullable(),
                              и «ссылки нет» кодируется отсутствием ключа.
                              Поэтому поле не переносим, но и не считаем потерей —
                              печатаем отдельной строкой, чтобы отличать от
                              «ссылки не было»;
      · значение есть       — переносим, если оно валидно по schema.ts.
    """
    if name not in source:
        return
    value = source[name]
    if value is None:
        report.cleared.append(f"{where}: {name} — было явно удалено (null), оставлено пустым")
        return
    if not FIELD_VALIDATORS[name](value):
        report.invalid.append(f"{where}: {name} = {value!r} — не проходит schema.ts, НЕ перенесено")
        return
    target[name] = value
    if name == "screen":
        report.screens_transferred += 1
        report.transferred.append(f"{where}: screen → «{value['title']}» {value['url']}")
    else:
        report.transferred.append(f"{where}: {name} → «{value}»")


def describe_lost(node: dict, field_name: str) -> str:
    value = node.get(field_name)
    if field_name == "screen" and isinstance(value, dict):
        return f"screen «{value.get('title')}» {value.get('url')}"
    return f"{field_name} «{value}»"


def carry_over_manual_fields(fresh: dict, previous: dict | None) -> CarryOverReport:
    """
    Переносит PRESERVED_* поля из предыдущего документа в свежесобранный.
    Сопоставление строго по `id` (узлы — глобально по документу, этапы — по
    stage.id): id стабильны по построению, а привязка по порядку обхода или по
    подписи развалилась бы при первой же правке презентации.

    Возвращает отчёт: что перенесено, что было явно очищено, что невалидно и
    что потеряно вместе с исчезнувшим узлом.
    """
    report = CarryOverReport()
    if previous is None:
        return report
    report.had_previous = True

    prev_nodes, prev_stages = index_previous(previous)
    report.previous_nodes = len(prev_nodes)

    fresh_node_ids: set[str] = set()
    fresh_labels: dict[str, list[str]] = {}
    for stage in fresh["stages"]:
        prev_stage = prev_stages.get(stage["id"])
        if prev_stage is not None:
            for name in PRESERVED_STAGE_FIELDS:
                carry_field(stage, prev_stage, name, f"этап «{stage['id']}»", report)
        for node in stage["nodes"]:
            fresh_node_ids.add(node["id"])
            fresh_labels.setdefault(node["label"], []).append(node["id"])
            prev_node = prev_nodes.get(node["id"])
            if prev_node is None:
                continue
            for name in PRESERVED_NODE_FIELDS:
                carry_field(node, prev_node, name, f"узел «{node['id']}»", report)

    # Узлы, которых в презентации больше нет. Молча потерять ссылку нельзя —
    # печатаем id, подпись и сам url, чтобы её можно было проставить заново,
    # и подсказываем узел с такой же подписью, если он появился под новым id.
    for node_id, prev_node in sorted(prev_nodes.items()):
        if node_id in fresh_node_ids:
            continue
        for name in PRESERVED_NODE_FIELDS:
            if prev_node.get(name) is None:
                continue
            if name == "screen":
                report.screens_lost += 1
            hint = ""
            twins = [i for i in fresh_labels.get(prev_node.get("label", ""), []) if i != node_id]
            if twins:
                hint = f"; возможно, это теперь {', '.join(twins)}"
            report.lost.append(
                f"узла «{node_id}» больше нет в презентации — потеряно "
                f"{describe_lost(prev_node, name)} (подпись: «{prev_node.get('label', '')}»){hint}"
            )

    for stage in fresh["stages"]:
        stage["nodes"] = [reorder_keys(node, NODE_KEY_ORDER) for node in stage["nodes"]]
    fresh["stages"] = [reorder_keys(stage, STAGE_KEY_ORDER) for stage in fresh["stages"]]
    return report


def print_carry_over(report: CarryOverReport) -> None:
    print("\n" + "=" * 78)
    print("РУЧНЫЕ ПОЛЯ (ссылки на экраны, ответственные) — ПЕРЕНОС ИЗ ПРЕДЫДУЩЕГО JSON")
    print("=" * 78)
    if not report.had_previous:
        print(f"  предыдущего {JSON_PATH.name} нет — первый запуск, переносить нечего")
        return
    print(f"  узлов в предыдущем файле: {report.previous_nodes}")
    print(f"  перенесено ссылок (screen): {report.screens_transferred}")
    print(f"  потеряно ссылок (screen):   {report.screens_lost}")
    if report.transferred:
        print(f"  перенесено полей ({len(report.transferred)}):")
        for item in report.transferred:
            print(f"    + {item}")
    else:
        print("  перенесённых полей нет")
    if report.cleared:
        print(f"  явно удалённые ранее ссылки ({len(report.cleared)}) — это НЕ потеря:")
        for item in report.cleared:
            print(f"    · {item}")
    if report.invalid:
        print(f"  НЕВАЛИДНЫЕ ЗНАЧЕНИЯ ({len(report.invalid)}):")
        for item in report.invalid:
            print(f"    ! {item}")
    if report.lost:
        print(f"  ПОТЕРЯННЫЕ РУЧНЫЕ ПОЛЯ ({len(report.lost)}) — проставить заново:")
        for item in report.lost:
            print(f"    ! {item}")
    else:
        print("  потерянных ручных полей нет")


def print_layout_required(process_map: dict, in_pipeline: bool) -> None:
    """
    Импорт — ПЕРВАЯ половина конвейера. Требование прогнать раскладку печатается
    последним блоком (его видно, даже если отчёт-сверку пролистали) и говорит,
    что именно сейчас лежит в файле, а не просто «не забудьте».

    `in_pipeline` — скрипт запущен из scripts/data.ts, раскладка стартует сразу
    после: пугать нечем, но сказать, что файл ещё сырой, всё равно надо.
    """
    nodes = sum(len(stage["nodes"]) for stage in process_map["stages"])
    without_slide = sum(
        1
        for stage in process_map["stages"]
        for node in stage["nodes"]
        if "slidePosition" not in node
    )
    print("\n" + "=" * 78)
    if in_pipeline:
        print("ШАГ 1 ИЗ 2 ГОТОВ — ДАЛЬШЕ РАСКЛАДКА (scripts/layout.ts, запускается сейчас)")
    else:
        print("КОНВЕЙЕР НЕ ЗАВЕРШЁН — ОБЯЗАТЕЛЬНО: npm run layout")
    print("=" * 78)
    print(f"  узлов: {nodes}; в position сейчас СЫРАЯ геометрия слайда — карточки")
    print("  на ней накладываются друг на друга и показывать её нельзя;")
    print("  пригодные координаты считает scripts/layout.ts (dagre).")
    print("  исходная геометрия сохранена в node.slidePosition, раскладка сидируется ею")
    if without_slide:
        print(f"  ВНИМАНИЕ: узлов без slidePosition: {without_slide} — это ошибка импортёра")
    if not in_pipeline:
        print("\n  одной командой:   npm run data     (import-pptx.py → layout.ts)")
        print("  сторож в тестах:  tests/layout.test.ts сверяет координаты с пересчётом,")
        print("                    так что незавершённый конвейер делает npm run check красным")


# --------------------------------------------------------------------------------------
# Запись файлов
# --------------------------------------------------------------------------------------


def write_json(path: Path, payload: object) -> None:
    text = json.dumps(payload, ensure_ascii=False, indent=2) + "\n"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8", newline="\n")


def check_unique_ids(process_map: dict) -> None:
    node_ids: set[str] = set()
    edge_ids: set[str] = set()
    for stage in process_map["stages"]:
        for node in stage["nodes"]:
            if node["id"] in node_ids:
                raise SystemExit(f"Неуникальный id узла: {node['id']}")
            node_ids.add(node["id"])
        for edge in stage["edges"]:
            if edge["id"] in edge_ids:
                raise SystemExit(f"Неуникальный id ребра: {edge['id']}")
            edge_ids.add(edge["id"])
    for edge in process_map["overviewEdges"]:
        if edge["id"] in edge_ids:
            raise SystemExit(f"Неуникальный id ребра: {edge['id']}")
        edge_ids.add(edge["id"])


def collect_required_node_ids(process_map: dict) -> list[str]:
    """
    SPEC §7: обязательный минимум — id ШАГОВ (step/warning/integration).
    data-узлы получаются дроблением текстбоксов-списков, их состав — эвристика,
    и фиксировать его тестом нельзя.
    """
    ids: list[str] = []
    for stage in process_map["stages"]:
        ids.extend(n["id"] for n in stage["nodes"] if n["type"] != "data")
    return ids


# --------------------------------------------------------------------------------------
# Самопроверка переноса (python scripts/import-pptx.py --self-test)
# --------------------------------------------------------------------------------------


def _fresh_fixture() -> dict:
    """Свежесобранный документ в том виде, в каком его отдаёт build_process_map."""
    return {
        "version": MAP_VERSION,
        "updatedAt": MAP_UPDATED_AT,
        "title": MAP_TITLE,
        "stages": [
            {
                "id": "stage-1",
                "number": 1,
                "title": "Этап 1",
                "shortTitle": "Этап 1",
                "keyOutputs": [],
                "warningsCount": 0,
                "groups": [],
                "nodes": [
                    {"id": "kept", "type": "step", "label": "Шаг", "position": {"x": 1, "y": 2}},
                    {"id": "cleared", "type": "step", "label": "Ш2", "position": {"x": 3, "y": 4}},
                    {"id": "never", "type": "step", "label": "Ш3", "position": {"x": 5, "y": 6}},
                    {"id": "bad", "type": "step", "label": "Ш4", "position": {"x": 7, "y": 8}},
                    {"id": "renamed-2-9", "type": "step", "label": "Ушёл", "position": {"x": 9, "y": 9}},
                ],
                "edges": [],
                "inputs": [],
                "outputs": [],
            }
        ],
        "overviewEdges": [],
    }


def _previous_fixture() -> dict:
    link = {"title": "Экран плана", "url": "https://inplan.example/plan"}
    return {
        "version": MAP_VERSION,
        "updatedAt": MAP_UPDATED_AT,
        "title": MAP_TITLE,
        "stages": [
            {
                "id": "stage-1",
                "number": 1,
                "title": "Этап 1",
                "shortTitle": "Этап 1",
                "keyOutputs": [],
                "warningsCount": 0,
                "screen": {"title": "Обзор этапа", "url": "https://inplan.example/stage-1"},
                "groups": [],
                "nodes": [
                    {
                        "id": "kept",
                        "type": "step",
                        "label": "Шаг",
                        "owner": "Планировщик спроса",
                        "screen": link,
                        "position": {"x": 0, "y": 0},
                    },
                    # null — «пользователь удалил ссылку», а не «ссылки не было».
                    {
                        "id": "cleared",
                        "type": "step",
                        "label": "Ш2",
                        "screen": None,
                        "position": {"x": 0, "y": 0},
                    },
                    # ключа screen нет вовсе.
                    {"id": "never", "type": "step", "label": "Ш3", "position": {"x": 0, "y": 0}},
                    # значение не проходит ScreenLinkSchema.
                    {
                        "id": "bad",
                        "type": "step",
                        "label": "Ш4",
                        "screen": {"url": "https://inplan.example/x"},
                        "position": {"x": 0, "y": 0},
                    },
                    # узел, которого в презентации больше нет, но ссылка была.
                    {
                        "id": "gone",
                        "type": "step",
                        "label": "Ушёл",
                        "screen": {"title": "Старый экран", "url": "https://inplan.example/old"},
                        "position": {"x": 0, "y": 0},
                    },
                ],
                "edges": [],
                "inputs": [],
                "outputs": [],
            }
        ],
        "overviewEdges": [],
    }


def run_self_test() -> int:
    """Проверки переноса ручных полей. Только stdlib, презентация не нужна."""
    checks = 0

    def check(condition: bool, message: str) -> None:
        nonlocal checks
        checks += 1
        if not condition:
            raise SystemExit(f"САМОПРОВЕРКА ПРОВАЛЕНА: {message}")

    # 1. Контракт с serialize_node: импортёр не создаёт ручных полей.
    produced = serialize_node(NodeDraft(node_id="x", node_type="step", label="L", box=Box(0, 0, 1, 1)))
    check(
        set(produced) <= set(IMPORTER_NODE_FIELDS),
        f"serialize_node отдаёт ключи вне IMPORTER_NODE_FIELDS: {set(produced) - set(IMPORTER_NODE_FIELDS)}",
    )
    check(
        not (set(PRESERVED_NODE_FIELDS) & set(IMPORTER_NODE_FIELDS)),
        "PRESERVED_NODE_FIELDS пересекается с IMPORTER_NODE_FIELDS",
    )

    # 1b. Исходная геометрия слайда сохраняется отдельным полем и совпадает с
    # position В МОМЕНТ ИМПОРТА (дальше position перезапишет npm run layout).
    box = Box(2 * EMU_PER_PX, 3 * EMU_PER_PX, 10 * EMU_PER_PX, 10 * EMU_PER_PX)
    laid = serialize_node(NodeDraft(node_id="y", node_type="step", label="L", box=box))
    check("slidePosition" in laid, "serialize_node не пишет slidePosition")
    check(
        laid["slidePosition"] == {"x": 2, "y": 3},
        f"slidePosition не равен геометрии слайда: {laid['slidePosition']}",
    )
    check(laid["position"] == laid["slidePosition"], "position при импорте ≠ slidePosition")
    # Разные объекты: раскладка меняет position и не должна задеть slidePosition.
    laid["position"]["x"] = 999
    check(laid["slidePosition"]["x"] == 2, "position и slidePosition — один и тот же объект")

    # 1c. direction (задача process-map-24p): поле пишется у data-узлов и
    # только у них, и стоит на своём месте в NODE_KEY_ORDER.
    step_node = serialize_node(NodeDraft(node_id="s", node_type="step", label="L", box=Box(0, 0, 1, 1)))
    check("direction" not in step_node, "direction проставлен не-data узлу")
    for value in ("in", "out"):
        data_node = serialize_node(
            NodeDraft(node_id="d", node_type="data", label="L", box=Box(0, 0, 1, 1), direction=value)
        )
        check(data_node.get("direction") == value, f"direction={value} не записан")
        check(
            list(data_node) == [k for k in NODE_KEY_ORDER if k in data_node],
            f"порядок ключей data-узла нарушен: {list(data_node)}",
        )
    check("direction" in NODE_KEY_ORDER, "direction отсутствует в NODE_KEY_ORDER")
    check("direction" in IMPORTER_NODE_FIELDS, "direction не объявлен полем импортёра")

    # 1d. Рёбра по решению владельца процесса (задача process-map-7bz).
    def _stage_fixture() -> list[dict]:
        return [
            {
                "number": 3,
                "nodes": [{"id": "src"}, {"id": "a"}, {"id": "b"}],
                "edges": [{"id": "e-src--a", "source": "src", "target": "a", "kind": "process"}],
            }
        ]

    # Решение-фикстура передаётся параметром, а не подменой глобали: константу
    # OWNER_DECISION_EDGES читает ещё и tests/importPreserve.test.ts (регуляркой
    # по исходнику, без Python), и второй похожий литерал в файле сбил бы разбор.
    fake_decisions = (
        {
            "task": "self-test",
            "stage": 3,
            "source": "src",
            "targets": ("a", "b"),
            "kind": "process",
            "why": "самопроверка",
        },
    )
    reports = [SlideReport(slide_no=n + 3) for n in range(4)]
    stages = _stage_fixture()
    apply_owner_decision_edges(stages, reports, fake_decisions)
    edge_ids = [e["id"] for e in stages[0]["edges"]]
    check(edge_ids == ["e-src--a", "e-src--b"], f"недостающее ребро не добавлено: {edge_ids}")
    check(len(reports[2].owner_edges) == 2, "в отчёт попали не все концы решения")
    check(
        any("уже есть в презентации" in item for item in reports[2].owner_edges),
        "совпавшее со слайдом ребро не отмечено как пришедшее из презентации",
    )
    check(
        any("ДОБАВЛЕНО" in item for item in reports[2].owner_edges),
        "добавленное ребро не отмечено как решение владельца",
    )

    # Повтор ничего не дублирует: id ребра — функция концов.
    apply_owner_decision_edges(stages, [SlideReport(slide_no=n + 3) for n in range(4)], fake_decisions)
    check(
        [e["id"] for e in stages[0]["edges"]] == edge_ids,
        "повторное применение решения продублировало рёбра",
    )

    # Исчезнувший узел — остановка импорта, а не тихий пропуск.
    broken = _stage_fixture()
    broken[0]["nodes"] = [{"id": "src"}, {"id": "a"}]
    try:
        apply_owner_decision_edges(
            broken, [SlideReport(slide_no=n + 3) for n in range(4)], fake_decisions
        )
    except SystemExit as error:
        check("b" in str(error), "в сообщении нет id пропавшего узла")
    else:
        check(False, "пропавший узел решения не остановил импорт")

    # Объявление верхнего уровня разбирается тем же способом, что и в vitest:
    # у каждого решения есть основание-задача и непустой список концов.
    for decision in OWNER_DECISION_EDGES:
        check(
            decision["task"].startswith("process-map-"),
            f"решение без задачи-основания: {decision['task']}",
        )
        check(bool(decision["targets"]), f"решение {decision['task']} без концов")

    # 2. Первый запуск: предыдущего файла нет.
    fresh = _fresh_fixture()
    empty = carry_over_manual_fields(fresh, None)
    check(not empty.had_previous and not empty.transferred and not empty.lost, "пустой перенос")
    check(fresh == _fresh_fixture(), "перенос без предыдущего файла изменил документ")

    # 3. Основной случай.
    fresh = _fresh_fixture()
    report = carry_over_manual_fields(fresh, _previous_fixture())
    nodes = {n["id"]: n for n in fresh["stages"][0]["nodes"]}

    check(
        nodes["kept"].get("screen") == {"title": "Экран плана", "url": "https://inplan.example/plan"},
        "screen не перенесён по совпадающему id",
    )
    check(nodes["kept"].get("owner") == "Планировщик спроса", "owner не перенесён")
    # 1 ссылка узла + 1 ссылка этапа (stage.screen считается тем же счётчиком).
    check(report.screens_transferred == 2, f"screens_transferred={report.screens_transferred}, ожидалось 2")

    # 4. null отличается от отсутствия ключа.
    check("screen" not in nodes["cleared"], "screen: null попал в JSON (схема его не примет)")
    check(len(report.cleared) == 1, f"явных удалений {len(report.cleared)}, ожидалось 1")
    check("cleared" in report.cleared[0], "явное удаление не названо поимённо")
    check(
        all("«never»" not in item for item in report.cleared + report.transferred + report.lost),
        "узел без ключа screen попал в отчёт — «не было» перепутано с «удалили»",
    )
    check("screen" not in nodes["never"], "узлу без ссылки ссылка приписана")

    # 5. Невалидное значение не переносится и не молчит.
    check("screen" not in nodes["bad"], "невалидный screen перенесён в JSON")
    check(len(report.invalid) == 1, f"невалидных {len(report.invalid)}, ожидалось 1")

    # 6. Исчезнувший узел: громкая потеря, url в отчёте, подсказка по подписи.
    check(report.screens_lost == 1, f"screens_lost={report.screens_lost}, ожидалось 1")
    check(len(report.lost) == 1, f"потерь {len(report.lost)}, ожидалось 1")
    check("https://inplan.example/old" in report.lost[0], "url потерянной ссылки не напечатан")
    check("renamed-2-9" in report.lost[0], "подсказка по совпадающей подписи не выдана")

    # 7. Этап.
    check(
        fresh["stages"][0].get("screen") == {"title": "Обзор этапа", "url": "https://inplan.example/stage-1"},
        "stage.screen не перенесён",
    )

    # 8. Порядок ключей — иначе экспорт из приложения перестанет совпадать побайтово.
    check(
        list(nodes["kept"]) == [k for k in NODE_KEY_ORDER if k in nodes["kept"]],
        f"порядок ключей узла нарушен: {list(nodes['kept'])}",
    )
    check(
        list(fresh["stages"][0]) == [k for k in STAGE_KEY_ORDER if k in fresh["stages"][0]],
        f"порядок ключей этапа нарушен: {list(fresh['stages'][0])}",
    )

    # 9. Идемпотентность: перенос из уже перенесённого документа ничего не меняет.
    again = json.loads(json.dumps(fresh, ensure_ascii=False))
    carry_over_manual_fields(again, json.loads(json.dumps(fresh, ensure_ascii=False)))
    check(
        json.dumps(again, ensure_ascii=False, indent=2) == json.dumps(fresh, ensure_ascii=False, indent=2),
        "повторный перенос изменил документ — идемпотентность нарушена",
    )

    print(f"САМОПРОВЕРКА ПРОЙДЕНА: {checks} проверок")
    return 0


def main(argv: Iterable[str]) -> int:
    args = list(argv)
    # Отчёт содержит кириллицу и стрелки: на консоли с cp866/cp1251 печать иначе
    # падает с UnicodeEncodeError уже после записи файлов.
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")

    if "--self-test" in args:
        return run_self_test()

    # --in-pipeline ставит scripts/data.ts (npm run data): раскладка стартует
    # сразу после импорта, и требовать её отдельно уже не надо. На сам импорт
    # флаг не влияет — только на текст финального блока.

    # Ручной слой читаем ДО сборки: если предыдущий файл битый, лучше упасть
    # раньше, чем после разбора презентации.
    previous = load_previous_map(JSON_PATH)

    # Фаза 1 — подсчёт коллизий базовых slug'ов, фаза 2 — стабильные id.
    _, _, _, collisions = build_process_map(None)
    process_map, reports, questions, _ = build_process_map(dict(collisions))

    carry_over = carry_over_manual_fields(process_map, previous)

    check_unique_ids(process_map)
    write_json(JSON_PATH, process_map)
    write_json(REQUIRED_NODES_PATH, collect_required_node_ids(process_map))
    print_report(process_map, reports, questions)
    print_carry_over(carry_over)
    print(f"\nзаписано: {JSON_PATH.relative_to(ROOT).as_posix()}")
    print(f"записано: {REQUIRED_NODES_PATH.relative_to(ROOT).as_posix()}")
    print_layout_required(process_map, "--in-pipeline" in args)
    if carry_over.lost:
        print(
            f"\nВНИМАНИЕ: потеряно ручных полей: {len(carry_over.lost)} "
            f"(из них ссылок на экраны: {carry_over.screens_lost}). "
            f"Список выше — проставьте их заново в редакторе. Код возврата {EXIT_LINKS_LOST}."
        )
        return EXIT_LINKS_LOST
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
