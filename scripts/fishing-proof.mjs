// Exercises one complete fishing cycle against a live server using protocol 2.
import WebSocket from '../server/node_modules/ws/wrapper.mjs';
import { decode } from '../server/node_modules/@msgpack/msgpack/dist.esm/index.mjs';
if (!process.argv[2]) throw new Error('Usage: node scripts/fishing-proof.mjs wss://host');
const ws = new WebSocket(process.argv[2]);
let n = 0,
  you = null,
  seq = 0,
  casts = 0,
  hooked = 0,
  finished = false;
const deadline = setTimeout(() => finish(new Error('Fishing proof timed out')), 90000);
const timer = setInterval(() => {
  if (!n || !you || ws.readyState !== 1) return;
  const f = you.fishing;
  let dx = 0,
    dz = 0;
  if (!f) {
    dx = Math.abs(you.x) > 0.2 ? -Math.sign(you.x) : 0;
    // The pier stem is a boardwalk until the sand ends; casting starts over the water.
    dz = Math.abs(you.x) < 0.3 && you.z < 27 ? 1 : 0;
    if (you.z >= 27) {
      ws.send(JSON.stringify({ type: 'cast' }));
      casts++;
    }
  }
  if (f?.phase === 'bite') {
    ws.send(JSON.stringify({ type: 'hook' }));
    hooked++;
  }
  if (f?.phase === 'reeling') ws.send(JSON.stringify({ type: 'reelInput', held: f.bar + (f.velocity || 0) * 0.24 < f.fish }));
  ws.send(JSON.stringify({ type: 'move', seq: ++seq, dx, dz }));
}, 1000 / 30);
function finish(error) {
  if (finished) return;
  finished = true;
  clearInterval(timer);
  clearTimeout(deadline);
  ws.close();
  if (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
ws.on('open', () =>
  ws.send(
    JSON.stringify({
      type: 'join',
      protocol: 2,
      name: 'Animation QA',
      appearance: { species: 'monkey', hat: 'none', color: '#eea373', outfit: 'overalls', outfitColor: '#486967', accessory: 'none' },
    }),
  ),
);
ws.on('message', (raw) => {
  const m = decode(raw);
  if (m.type === 'welcome') n = m.n;
  if (m.type === 'you') you = m;
  if (m.type === 'effect' && m.kind === 'catch' && m.n === n) {
    console.log(JSON.stringify({ passed: true, event: 'server-confirmed-catch', fish: m.fish, perfect: m.perfect, waterX: m.waterX, waterZ: m.waterZ, casts, hooked, timestamp: new Date().toISOString() }));
    setTimeout(() => finish(), 2500);
  }
});
ws.on('error', finish);
