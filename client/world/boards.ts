import { CanvasTexture, Mesh, MeshBasicMaterial, NearestFilter, PlaneGeometry, SRGBColorSpace, Scene } from 'three';
import { BOARD, BOARD_PALETTE, type Stroke } from '../../packages/shared/boards';
import { BOARD_SCALE, DRAWING_BOARDS, GROUND_Y, groundHeight } from '../../packages/shared/layout';
// The drawing boards' faces in the world: one small canvas per board, redrawn from its
// strokes whenever they change, so what is drawn in the panel hangs in the plaza.
export function drawStrokes(ctx: CanvasRenderingContext2D, strokes: Stroke[], scale: number) {
  ctx.clearRect(0, 0, BOARD.width * scale, BOARD.height * scale);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const s of strokes) {
    ctx.strokeStyle = BOARD_PALETTE[s.c] ?? '#27443a';
    ctx.fillStyle = ctx.strokeStyle;
    ctx.lineWidth = BOARD.widths[s.w] * scale;
    if (s.p.length === 2) {
      ctx.beginPath();
      ctx.arc(s.p[0] * scale, s.p[1] * scale, (BOARD.widths[s.w] * scale) / 2, 0, Math.PI * 2);
      ctx.fill();
      continue;
    }
    ctx.beginPath();
    ctx.moveTo(s.p[0] * scale, s.p[1] * scale);
    for (let i = 2; i < s.p.length; i += 2) ctx.lineTo(s.p[i] * scale, s.p[i + 1] * scale);
    ctx.stroke();
  }
}
export function createBoards(scene: Scene) {
  const strokes: Stroke[][] = Array.from({ length: BOARD.count }, () => []);
  const locks: number[] = Array.from({ length: BOARD.count }, () => 0);
  const geometry = new PlaneGeometry(2.28 * BOARD_SCALE, 1.71 * BOARD_SCALE);
  const faces = DRAWING_BOARDS.map((b) => {
    const canvas = document.createElement('canvas');
    canvas.width = BOARD.width;
    canvas.height = BOARD.height;
    const texture = new CanvasTexture(canvas);
    texture.magFilter = NearestFilter;
    texture.minFilter = NearestFilter;
    // The canvas holds the palette's own sRGB values; without this the renderer treats
    // them as linear and every chalk colour comes out paler than it was drawn.
    texture.colorSpace = SRGBColorSpace;
    // Tone mapping would shift them again, and the face is meant to be flat, unlit paint.
    const material = new MeshBasicMaterial({ map: texture, transparent: true, toneMapped: false });
    const mesh = new Mesh(geometry, material);
    // Just in front of the white board face, tilted back with it.
    mesh.position.set(b.x + Math.sin(b.heading) * 0.13 * BOARD_SCALE, GROUND_Y + groundHeight(b.x, b.z) + 1.95 * BOARD_SCALE, b.z + Math.cos(b.heading) * 0.13 * BOARD_SCALE);
    mesh.rotation.set(-0.12, b.heading, 0, 'YXZ');
    scene.add(mesh);
    return { canvas, texture, material, mesh };
  });
  let version = 0;
  function redraw(board: number) {
    const face = faces[board];
    const ctx = face.canvas.getContext('2d');
    if (!ctx) return;
    drawStrokes(ctx, strokes[board], 1);
    face.texture.needsUpdate = true;
    version++;
  }
  return {
    strokesOf: (board: number) => strokes[board],
    lockOf: (board: number) => locks[board],
    get version() {
      return version;
    },
    setState(board: number, list: Stroke[], lock: number) {
      strokes[board] = list;
      locks[board] = lock;
      redraw(board);
    },
    addStroke(board: number, stroke: Stroke) {
      strokes[board].push(stroke);
      redraw(board);
    },
    removeStrokes(board: number, ids: number[]) {
      const gone = new Set(ids);
      strokes[board] = strokes[board].filter((s) => !gone.has(s.id));
      redraw(board);
    },
    setLock(board: number, n: number) {
      locks[board] = n;
      version++;
    },
    dispose() {
      geometry.dispose();
      for (const f of faces) {
        f.texture.dispose();
        f.material.dispose();
        scene.remove(f.mesh);
      }
    },
  };
}
export type BoardsView = ReturnType<typeof createBoards>;
