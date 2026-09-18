import { DRAWING_BOARDS, type Landmark } from './layout.js';
// Community drawing boards around the plaza. A board is a list of strokes, each owned by
// the player who drew it; one person draws on a board at a time, and only the author can
// erase a fresh line. Drawings are not forever: a line older than a day can be cleared by
// whoever holds the chalk, a full board drops its oldest line, and nothing outlives a week,
// so a board never stays blocked by someone who drew once and never came back.
// Points are quantised to a small grid so a stroke fits in a single message.
export const BOARD = {
  count: DRAWING_BOARDS.length,
  width: 256,
  height: 192,
  widths: [2, 4, 7, 12],
  maxPoints: 64,
  maxStrokes: 300,
  lockMs: 90000,
  strokesPerSecond: 5,
  keepMs: 7 * 24 * 3600000,
};
export const BOARD_PALETTE = ['#27443a', '#e0574f', '#3f8f8a', '#e9b949', '#7b5ea7', '#5e9a4b', '#cf7744', '#4f8fc7', '#e78491', '#8c7265', '#f4ecd5', '#a8be75', '#555d83', '#cc9dcb', '#b9403a', '#87c4aa'];
// `t` is when the line was drawn, which is what ages a board out.
export type Stroke = { id: number; a: string; c: number; w: number; p: number[]; t: number };
export type StrokeInput = { c: number; w: number; p: number[] };
export const boardLandmark = (board: number): Landmark => DRAWING_BOARDS[board];
export const isBoard = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0 && (v as number) < BOARD.count;
// Validates a stroke from a client: a colour and width index, and an even list of grid
// coordinates with no repeated consecutive points. Anything else is dropped.
export function parseStroke(input: unknown): StrokeInput | null {
  if (!input || typeof input !== 'object') return null;
  const m = input as Record<string, unknown>;
  if (!Number.isInteger(m.c) || (m.c as number) < 0 || (m.c as number) >= BOARD_PALETTE.length) return null;
  if (!Number.isInteger(m.w) || (m.w as number) < 0 || (m.w as number) >= BOARD.widths.length) return null;
  if (!Array.isArray(m.p) || m.p.length < 2 || m.p.length > BOARD.maxPoints * 2 || m.p.length % 2) return null;
  const p: number[] = [];
  for (let i = 0; i < m.p.length; i += 2) {
    const x = m.p[i],
      y = m.p[i + 1];
    if (!Number.isInteger(x) || !Number.isInteger(y) || (x as number) < 0 || (x as number) >= BOARD.width || (y as number) < 0 || (y as number) >= BOARD.height) return null;
    if (p.length && p[p.length - 2] === x && p[p.length - 1] === y) continue;
    p.push(x as number, y as number);
  }
  return { c: m.c as number, w: m.w as number, p };
}
// The author tag that travels with a stroke: enough of the id to compare, none of it to recover.
export const authorTag = (id: string) => id.slice(0, 8);
// Distance from a point to a polyline, in grid units, for the eraser's hit test.
export function strokeDistance(stroke: Stroke, x: number, y: number) {
  const p = stroke.p;
  if (p.length === 2) return Math.hypot(x - p[0], y - p[1]);
  let best = Infinity;
  for (let i = 2; i < p.length; i += 2) {
    const x1 = p[i - 2],
      y1 = p[i - 1],
      x2 = p[i],
      y2 = p[i + 1];
    const dx = x2 - x1,
      dy = y2 - y1,
      len2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / len2));
    best = Math.min(best, Math.hypot(x - (x1 + dx * t), y - (y1 + dy * t)));
  }
  return best;
}
export type BoardClientMessage =
  | { type: 'board'; board: number; action: 'get' | 'lock' | 'unlock' | 'clear' | 'tidy' }
  | { type: 'board'; board: number; action: 'stroke'; stroke: unknown }
  | { type: 'board'; board: number; action: 'erase'; id: number };
export type BoardServerMessage =
  | { type: 'board'; board: number; event: 'state'; lock: number; strokes: Stroke[] }
  | { type: 'board'; board: number; event: 'stroke'; stroke: Stroke }
  | { type: 'board'; board: number; event: 'erase'; ids: number[] }
  | { type: 'board'; board: number; event: 'lock'; n: number };
