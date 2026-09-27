// Геометрия рёбер уровня 1 трёхуровневой карты: путь, точка подписи и отступ
// пути от карточки (задача process-map-9mn.19).
//
// Отдельным модулем, а не в ArtifactEdge.tsx, по двум причинам: числа отсюда
// читает раскладка (BELOW_CARDS_GAP в modulesGraph.ts), а функцию пути — тест
// геометрии подписей (tests/artifactLabelGeometry.test.ts). Файл компонента,
// экспортирующий ещё и функцию, ломал бы Fast Refresh (правило
// react-refresh/only-export-components в eslint.config.js).
//
// ─────────────── отступ пути от карточки ───────────────
//
// ДЕФЕКТ, КОТОРЫЙ ЗДЕСЬ ЗАКРЫТ. Ребро, ведомое СНИЗУ карточки (обратная связь
// соседей, связь через модуль — правило в modulesGraph.ts), getSmoothStepPath
// строит так: вниз на `offset` от нижнего хэндла источника, горизонтальный
// отрезок к цели, вверх до её левого хэндла. Подпись getPoints в
// @xyflow/system ставит на середину самого длинного отрезка, то есть на этот
// горизонтальный, по высоте ровно `offset` ниже карточек. По умолчанию offset
// = 20, а трёхстрочная подпись — 45 px, и её верхние 2 px ложились на низ
// карточки, над которой оказывался центр отрезка: у обратной связи соседей это
// карточка-цель, у связи через модуль — промежуточная (центр — полусумма x
// двух концов длинного отрезка). Текст читался, закрыт был край рамки.
//
// Лечится отступом пути, а не зазором под карточками: зазор двигает полосу
// FP&A, а подпись остаётся где была. Зазор под карточками при этом выведен из
// отступа (BELOW_CARDS_GAP в modulesGraph.ts), и полоса уехала вниз ровно
// настолько, чтобы до неё осталось не меньше прежнего.
//
// Прямая связь соседей (правый хэндл → левый, одна высота) от offset не
// зависит: отрезок один, подпись в середине зазора. Условие только одно —
// промежуток между хэндлами шире двух отступов, иначе «выступы» у хэндлов
// встретились бы и путь развернулся бы петлёй. Это касается и зазора между
// карточками, и пути от свимлейна входа к верху карточки; оба сторожит
// tests/artifactLabelGeometry.test.ts, чтобы рост отступа не сломал их молча.
import { getSmoothStepPath, type Position } from '@xyflow/react';
import { EDGE_LABEL_LINE_HEIGHT, EDGE_LABEL_WRAP_MAX_LINES } from '../../../theme/sizes';
import { EDGE_BORDER_RADIUS } from '../edgeGeometry';

/**
 * Наибольшая высота подписи-артефакта, которую обязана уместить раскладка
 * уровня 1: бюджет строк на высоту строки (src/theme/sizes.ts). По вертикали у
 * подложки отступов нет (EdgeLabel.module.css), поэтому высота — ровно строки.
 */
export const ARTIFACT_LABEL_MAX_HEIGHT = EDGE_LABEL_WRAP_MAX_LINES * EDGE_LABEL_LINE_HEIGHT;

/**
 * Просвет между низом карточки и верхом подписи ребра, ведомого снизу: линия
 * должна успеть выйти из-под карточки, прежде чем её закроет подложка
 * подписи, — иначе подпись читалась бы приклеенной к карточке, а не к ребру.
 */
export const ARTIFACT_LABEL_CARD_CLEARANCE = 8;

/**
 * offset для getSmoothStepPath у рёбер уровня 1: полвысоты подписи (подпись
 * центрирована на отрезке) плюс просвет. Math.ceil — чтобы отрезок лёг на
 * целый пиксель: полпикселя дали бы размытую линию. Он же поглощает
 * полпикселя хэндла: хэндл в 1 px стоит серединой на рамке карточки
 * (Overview.module.css), и путь начинается на 0.5 px ниже её низа.
 */
export const ARTIFACT_EDGE_OFFSET =
  Math.ceil(ARTIFACT_LABEL_MAX_HEIGHT / 2) + ARTIFACT_LABEL_CARD_CLEARANCE;

/** Концы ребра так, как их отдаёт React Flow в EdgeProps. */
export interface ArtifactEdgeEnds {
  readonly sourceX: number;
  readonly sourceY: number;
  readonly sourcePosition: Position;
  readonly targetX: number;
  readonly targetY: number;
  readonly targetPosition: Position;
}

/**
 * Путь smoothstep и точка подписи — геометрия рёбер уровня 2 плюс свой отступ
 * (ARTIFACT_EDGE_OFFSET выше).
 *
 * Тест геометрии кладёт подпись туда же, куда её кладёт ребро, — этой самой
 * функцией, а не своей копией формулы getPoints, которая разошлась бы с
 * библиотекой молча.
 */
export function artifactEdgePath({
  sourceX,
  sourceY,
  sourcePosition,
  targetX,
  targetY,
  targetPosition,
}: ArtifactEdgeEnds): { path: string; labelX: number; labelY: number } {
  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: EDGE_BORDER_RADIUS,
    offset: ARTIFACT_EDGE_OFFSET,
  });
  return { path, labelX, labelY };
}
