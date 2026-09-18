// Live multiplayer load test: N protocol-2 bots wander, chat and fish for the given seconds.
// usage: node scripts/load-test.mjs wss://host 12 30
import WebSocket from '../server/node_modules/ws/wrapper.mjs';
import { decode } from '../server/node_modules/@msgpack/msgpack/dist.esm/index.mjs';
const url = process.argv[2];
if (!url) throw new Error('Usage: node scripts/load-test.mjs wss://host [players] [seconds]');
const n = Number(process.argv[3] || 12),
  seconds = Number(process.argv[4] || 30);
const ROW = { n: 0, x: 1, z: 2 };
const bots = [];
let messages = 0,
  bytes = 0,
  catches = 0;
const started = Date.now();
function waitFor(fn, ms = 15000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const t = setInterval(() => {
      if (fn()) {
        clearInterval(t);
        resolve();
      } else if (Date.now() - start > ms) {
        clearInterval(t);
        reject(new Error('Timed out waiting for test condition'));
      }
    }, 50);
  });
}
try {
  for (let i = 0; i < n; i++) {
    const b = { ws: new WebSocket(url), n: 0, seq: 0, snapshot: null, you: null, seenChat: new Set(), positions: new Map(), snapshots: 0, intervals: [], lastSnapshot: 0 };
    bots.push(b);
    b.ws.on('open', () => b.ws.send(JSON.stringify({ type: 'join', protocol: 2, name: `LoadBot${i + 1}` })));
    b.ws.on('message', (raw) => {
      const m = decode(raw);
      messages++;
      bytes += raw.length;
      if (m.type === 'welcome') b.n = m.n;
      if (m.type === 'you') b.you = m;
      if (m.type === 'effect' && m.kind === 'catch') catches++;
      if (m.type === 'snapshot') {
        const now = performance.now();
        if (b.lastSnapshot) b.intervals.push(now - b.lastSnapshot);
        b.lastSnapshot = now;
        b.snapshot = m;
        b.snapshots++;
        for (const row of m.players) {
          const v = b.positions.get(row[ROW.n]) || new Set();
          v.add(`${row[ROW.x]},${row[ROW.z]}`);
          b.positions.set(row[ROW.n], v);
        }
      }
      if (m.type === 'chat') b.seenChat.add(m.text);
    });
    b.ws.on('error', (e) => console.error('WebSocket error:', e.message));
  }
  await waitFor(() => bots.every((b) => b.n && b.snapshot?.count === n && b.you));
  const timer = setInterval(() => {
    for (let i = 0; i < n; i++) {
      const b = bots[i];
      if (b.ws.readyState !== 1) continue;
      const me = b.you,
        f = me?.fishing;
      const fishingBot = i < Math.ceil(n / 3);
      let dx = 0,
        dz = 0;
      if (fishingBot && me) {
        dx = Math.abs(me.x) > 0.3 ? -Math.sign(me.x) : 0;
        dz = Math.abs(me.x) < 0.4 && me.z < 16 ? 1 : 0;
        if (me.z >= 16 && !f) b.ws.send(JSON.stringify({ type: 'cast' }));
        if (f?.phase === 'bite') b.ws.send(JSON.stringify({ type: 'hook' }));
        if (f?.phase === 'reeling') b.ws.send(JSON.stringify({ type: 'reelInput', held: f.bar < f.fish }));
      } else dx = Math.sin((Date.now() - started) / 1700 + i) > 0 ? 1 : -1;
      b.ws.send(JSON.stringify({ type: 'move', seq: ++b.seq, dx, dz }));
    }
  }, 1000 / 30);
  for (let i = 0; i < n; i++) bots[i].ws.send(JSON.stringify({ type: 'chat', text: `multiplayer-proof-${i + 1}` }));
  await new Promise((r) => setTimeout(r, seconds * 1000));
  clearInterval(timer);
  const health = await (await fetch(url.replace(/^wss:/, 'https:').replace(/^ws:/, 'http:') + '/health')).json();
  const allSeeMovement = bots.every((b) => [...b.positions].some(([id, v]) => id !== b.n && v.size > 4));
  const allSeeChat = bots.every((b) => b.seenChat.has('multiplayer-proof-1'));
  const intervals = bots.flatMap((b) => b.intervals).sort((a, b) => a - b);
  const report = {
    timestamp: new Date().toISOString(),
    url,
    protocol: 2,
    clients: n,
    durationSeconds: seconds,
    allSeeMovement,
    allSeeChat,
    catches,
    messages,
    inboundKBps: +(bytes / 1024 / seconds).toFixed(1),
    snapshotIntervalMs: { p50: +intervals[Math.floor(intervals.length / 2)].toFixed(1), p99: +intervals[Math.floor(intervals.length * 0.99)].toFixed(1) },
    snapshotCounts: bots.map((b) => b.snapshots),
    health,
  };
  console.log(JSON.stringify(report, null, 2));
  if (!allSeeMovement || !allSeeChat || health.rssMB >= 400 || health.players !== n) process.exitCode = 1;
} finally {
  for (const b of bots) b.ws.close();
}
