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

Структура презентации (проверено на файле «SNP Е2Е процесс.pptx»):
  слайд 1 — титул, данных нет;
  слайд 2 — обзор уровня 1 (контейнеры этапов, боксы групп, боксы внешних систем,
            блоки выходов этапов, связи этап→этап и система→этап);
  слайды 3..6 — детализация этапов 1..4.

Явных связей (stCxn/endCxn) в презентации нет, поэтому принадлежность узла группе
и концы рёбер выводятся геометрически. Всё, что не распозналось однозначно,
не выдумывается, а печатается в отчёте-сверке.
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
    if draft.inputs:
        node["inputs"] = draft.inputs
    if draft.outputs:
        node["outputs"] = draft.outputs
    if draft.system:
        node["system"] = draft.system
    node["position"] = {
        "x": round(draft.box.left / EMU_PER_PX),
        "y": round(draft.box.top / EMU_PER_PX),
    }
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

    # Правая колонка выходов этапа (SPEC §4.2) — блоки под контейнером на слайде 2.
    for index, stage in enumerate(stages):
        blocks = overview.output_blocks[index] if index < len(overview.output_blocks) else []
        stage["keyOutputs"] = choose_key_outputs(blocks)
        existing = {node["label"].casefold() for node in stage["nodes"]}
        added: list[dict] = []
        for paragraphs, box, sid in blocks:
            step = box.height / max(len(paragraphs), 1)
            for para_index, para in enumerate(paragraphs):
                if para.casefold() in existing:
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


def main(argv: Iterable[str]) -> int:
    del argv
    # Отчёт содержит кириллицу и стрелки: на консоли с cp866/cp1251 печать иначе
    # падает с UnicodeEncodeError уже после записи файлов.
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")

    # Фаза 1 — подсчёт коллизий базовых slug'ов, фаза 2 — стабильные id.
    _, _, _, collisions = build_process_map(None)
    process_map, reports, questions, _ = build_process_map(dict(collisions))

    check_unique_ids(process_map)
    write_json(JSON_PATH, process_map)
    write_json(REQUIRED_NODES_PATH, collect_required_node_ids(process_map))
    print_report(process_map, reports, questions)
    print(f"\nзаписано: {JSON_PATH.relative_to(ROOT).as_posix()}")
    print(f"записано: {REQUIRED_NODES_PATH.relative_to(ROOT).as_posix()}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
