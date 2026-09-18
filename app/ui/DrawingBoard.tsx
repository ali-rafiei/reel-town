'use client';
import { useEffect, useRef, useState } from 'react';
import { Button, Panel } from './primitives';
import { Icon } from './icons';
import { BOARD, BOARD_PALETTE, strokeDistance, type Stroke } from '../../packages/shared/boards';
import { drawStrokes } from '../../client/world/boards';
const SCALE = 2;
// A drawing board up close: pick a colour and a width, draw, rub out any line, and
// hand the chalk back. Someone else's board is view-only while they hold it.
export function DrawingBoard({
  board,
  strokes,
  version,
  lock,
  selfN,
  selfTag,
  holderName,
  send,
  onClose,
}: {
  board: number;
  strokes: Stroke[];
  version: number;
  lock: number;
  selfN: number;
  selfTag: string;
  holderName: string | null;
  send: (message: Record<string, unknown>) => void;
  onClose: () => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef<number[] | null>(null);
  const [colour, setColour] = useState(0);
  const [width, setWidth] = useState(1);
  const [erasing, setErasing] = useState(false);
  const mine = lock === selfN;
  const someoneElse = lock !== 0 && !mine;
  const act = (action: string, extra: Record<string, unknown> = {}) => send({ type: 'board', board, action, ...extra });
  // Take the chalk on arrival and hand it back on the way out.
  useEffect(() => {
    if (!someoneElse) act('lock');
    return () => act('unlock');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board]);
  useEffect(() => {
    const ctx = canvas.current?.getContext('2d');
    if (!ctx) return;
    drawStrokes(ctx, strokes, SCALE);
    // The line being drawn shows before the server has it.
    const live = drawing.current;
    if (live && live.length >= 2) {
      ctx.strokeStyle = BOARD_PALETTE[colour];
      ctx.lineWidth = BOARD.widths[width] * SCALE;
      ctx.beginPath();
      ctx.moveTo(live[0] * SCALE, live[1] * SCALE);
      for (let i = 2; i < live.length; i += 2) ctx.lineTo(live[i] * SCALE, live[i + 1] * SCALE);
      ctx.stroke();
    }
  }, [strokes, version, colour, width]);
  const gridPoint = (e: React.PointerEvent) => {
    const rect = canvas.current!.getBoundingClientRect();
    const x = Math.max(0, Math.min(BOARD.width - 1, Math.round(((e.clientX - rect.left) / rect.width) * BOARD.width)));
    const y = Math.max(0, Math.min(BOARD.height - 1, Math.round(((e.clientY - rect.top) / rect.height) * BOARD.height)));
    return [x, y];
  };
  const flush = () => {
    const p = drawing.current;
    if (p && p.length >= 2) act('stroke', { stroke: { c: colour, w: width, p } });
    drawing.current = null;
  };
  const own = strokes.filter((s) => s.a === selfTag).length;
  return (
    <Panel
      title={`Drawing board ${board + 1}`}
      icon="pixel"
      className="game wide board"
      onClose={onClose}
      footer={
        <>
          {mine ? (
            <>
              <Button tone="ghost" icon="close" disabled={!own} onClick={() => act('clear')}>
                Clear mine
              </Button>
              <Button tone="ghost" icon="hourglass" disabled={!strokes.length} title="Every line on this board, whoever drew it" onClick={() => act('tidy')}>
                Clear the board
              </Button>
              <Button tone="primary" icon="check" onClick={onClose}>
                Done
              </Button>
            </>
          ) : (
            <Button tone="ghost" onClick={onClose}>
              Close
            </Button>
          )}
        </>
      }
    >
      {someoneElse && (
        <p className="muted">
          <Icon name="eye" style={{ width: 14, height: 14 }} /> {holderName ?? 'Someone'} is drawing.
        </p>
      )}
      {mine && <p className="muted">Rub out any line on the board, whoever drew it.</p>}
      <div className={`boardwrap ${mine ? 'live' : ''}`}>
        <canvas
          ref={canvas}
          width={BOARD.width * SCALE}
          height={BOARD.height * SCALE}
          onPointerDown={(e) => {
            if (!mine) return;
            e.preventDefault();
            e.currentTarget.setPointerCapture(e.pointerId);
            const [x, y] = gridPoint(e);
            if (erasing) {
              // The nearest line under the finger goes, whoever drew it.
              let best: Stroke | null = null,
                bestD = 6;
              for (const s of strokes) {
                const d = strokeDistance(s, x, y) - BOARD.widths[s.w] / 2;
                if (d < bestD) {
                  bestD = d;
                  best = s;
                }
              }
              if (best) act('erase', { id: best.id });
              return;
            }
            drawing.current = [x, y];
          }}
          onPointerMove={(e) => {
            const p = drawing.current;
            if (!p || !mine || erasing) return;
            const [x, y] = gridPoint(e);
            if (p[p.length - 2] === x && p[p.length - 1] === y) return;
            p.push(x, y);
            // Long lines are split so each stays inside one message.
            if (p.length >= BOARD.maxPoints * 2) {
              flush();
              drawing.current = [x, y];
            }
            const ctx = canvas.current?.getContext('2d');
            if (ctx) {
              ctx.strokeStyle = BOARD_PALETTE[colour];
              ctx.lineWidth = BOARD.widths[width] * SCALE;
              ctx.lineCap = 'round';
              ctx.beginPath();
              ctx.moveTo(p[p.length - 4] * SCALE, p[p.length - 3] * SCALE);
              ctx.lineTo(x * SCALE, y * SCALE);
              ctx.stroke();
            }
          }}
          onPointerUp={flush}
          onPointerCancel={flush}
        />
      </div>
      {mine && (
        <div className="chalk">
          <div className="palette board-palette" role="group" aria-label="Colours">
            {BOARD_PALETTE.map((c, i) => (
              <button
                type="button"
                key={c}
                className="swatch"
                style={{ background: c }}
                aria-label={`Colour ${i + 1}`}
                aria-pressed={!erasing && colour === i}
                onClick={() => {
                  setColour(i);
                  setErasing(false);
                }}
              />
            ))}
          </div>
          <div className="widths" role="group" aria-label="Line width">
            {BOARD.widths.map((w, i) => (
              <button type="button" key={w} aria-pressed={!erasing && width === i} aria-label={`Width ${w}`} onClick={() => setWidth(i)}>
                <i style={{ width: w * 1.6, height: w * 1.6 }} />
              </button>
            ))}
            <button type="button" className={erasing ? 'on' : ''} aria-pressed={erasing} onClick={() => setErasing((v) => !v)}>
              Erase
            </button>
          </div>
        </div>
      )}
    </Panel>
  );
}
