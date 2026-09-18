// Exercises the pickup-game frame and the shop against a live server using protocol 2:
// a run settles exactly once however it ends, a run cut off by a disconnect pays nothing,
// gear and bait are bought once and change the reel, and a dockkeeper has everything.
//
//   node scripts/games-proof.mjs ws://127.0.0.1:3101 [path/to/reeltown.sqlite]
//
// The database path is optional and local only: it lets the proof hand a bot some gold.
import WebSocket from '../server/node_modules/ws/wrapper.mjs';
import { decode } from '../server/node_modules/@msgpack/msgpack/dist.esm/index.mjs';
import { fishCatalog } from '../server/dist/packages/shared/game.js';
import { BAIT, GEAR } from '../server/dist/packages/shared/gear.js';
import { LANDMARKS } from '../server/dist/packages/shared/landmarks.js';
import { PIER } from '../server/dist/packages/shared/layout.js';
const [url = 'ws://127.0.0.1:3101', dbPath] = process.argv.slice(2);
const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ' · ' + detail : ''}`);
};
class Bot {
  constructor(name, token, appearance) {
    this.name = name;
    this.token = token;
    this.appearance = appearance;
    this.seq = 0;
    this.you = null;
    this.welcome = null;
    this.coins = 0;
    this.stats = null;
    this.waiters = [];
  }
  connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(url);
      this.ws.on('open', () => this.ws.send(JSON.stringify({ type: 'join', protocol: 2, name: this.name, token: this.token, appearance: this.appearance })));
      this.ws.on('message', (raw) => {
        const m = decode(raw);
        if (m.type === 'welcome') {
          this.welcome = m;
          this.token = m.token;
          this.coins = m.coins;
          this.stats = m.stats;
          resolve(m);
        }
        if (m.type === 'you') this.you = m;
        if (m.type === 'inventory') {
          this.coins = m.coins;
          if (m.stats) this.stats = m.stats;
        }
        const matched = this.waiters.filter((w) => w.test(m));
        this.waiters = this.waiters.filter((w) => !matched.includes(w));
        for (const w of matched) w.resolve(m);
      });
      this.ws.on('error', reject);
      this.ws.on('close', () => {
        for (const w of this.waiters) w.resolve(null);
        this.waiters = [];
      });
    });
  }
  send(m) {
    this.ws.send(JSON.stringify(m));
  }
  // Resolves with the next message passing the test, or null after the timeout.
  next(test, ms = 8000) {
    return new Promise((resolve) => {
      const w = { test, resolve };
      this.waiters.push(w);
      setTimeout(() => {
        const i = this.waiters.indexOf(w);
        if (i >= 0) {
          this.waiters.splice(i, 1);
          resolve(null);
        }
      }, ms);
    });
  }
  // Walks toward a point with 30 Hz move commands until within the radius.
  async walkTo(x, z, within = 1, ms = 20000) {
    const start = Date.now();
    while (Date.now() - start < ms) {
      const p = this.you;
      if (p) {
        const dx = x - p.x,
          dz = z - p.z,
          d = Math.hypot(dx, dz);
        if (d < within) break;
        this.send({ type: 'move', seq: ++this.seq, dx: dx / d, dz: dz / d });
      }
      await sleep(1000 / 30);
    }
    for (let i = 0; i < 6; i++) {
      this.send({ type: 'move', seq: ++this.seq, dx: 0, dz: 0 });
      await sleep(1000 / 30);
    }
    return this.you;
  }
  close() {
    this.ws.close();
    return new Promise((r) => this.ws.once('close', r));
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const bins = ['Common', 'Uncommon', 'Rare', 'Legendary'];
// Plays the first `count` sorting items correctly, one at a time, as they appear.
async function sortSome(bot, start, count) {
  let last = null;
  for (const [i, species, at] of start.items.slice(0, count)) {
    const wait = start.startAt + at + 250 - Date.now();
    if (wait > 0) await sleep(wait);
    bot.send({ type: 'game', game: 'sorting', action: 'input', runId: start.runId, i, bin: bins.indexOf(fishCatalog[species].rarity) });
    last = await bot.next((m) => m.type === 'game' && m.event === 'update' && m.i === i);
  }
  return last;
}
const crates = { x: LANDMARKS.sorting.x - 2, z: LANDMARKS.sorting.z };
// 1. A run settles once, however many times it is told to end.
const a = new Bot('Proof A');
await a.connect();
await a.walkTo(crates.x, crates.z);
a.send({ type: 'game', game: 'sorting', action: 'start' });
let start = await a.next((m) => m.type === 'game' && m.event === 'start');
check('a run starts at the crates', !!start && start.game === 'sorting', start && `${start.items.length} items`);
const scored = await sortSome(a, start, 3);
check('correct throws score', !!scored && scored.score >= 30, scored && `score ${scored.score}`);
const coinsBefore = a.coins;
a.send({ type: 'game', game: 'sorting', action: 'quit', runId: start.runId });
a.send({ type: 'game', game: 'sorting', action: 'quit', runId: start.runId });
a.send({ type: 'game', game: 'sorting', action: 'input', runId: start.runId, i: 5, bin: 0 });
const end = await a.next((m) => m.type === 'game' && m.event === 'end');
const second = await a.next((m) => m.type === 'game' && m.event === 'end', 1500);
await sleep(300);
check('exactly one end message, quit pays nothing', !!end && end.quit === true && end.gold === 0 && second === null, end && `score ${end.score}, best ${end.best}`);
check('coins unchanged after a quit', a.coins === coinsBefore, `${a.coins}`);
check('plays counted once', a.stats.games.sorting.plays === 1, `${a.stats.games.sorting.plays}`);
// 2. Disconnect mid-run: the run is settled as a quit, nothing is paid, nothing lingers.
await sleep(3200);
a.send({ type: 'game', game: 'sorting', action: 'start' });
start = await a.next((m) => m.type === 'game' && m.event === 'start');
await sortSome(a, start, 2);
const token = a.token;
await a.close();
await sleep(500);
const a2 = new Bot('Proof A', token);
const back = await a2.connect();
check('reconnect finds the run settled as a play with no gold', back.stats.games.sorting.plays === 2 && back.coins === coinsBefore, `plays ${back.stats.games.sorting.plays}, coins ${back.coins}`);
const pending = await a2.next((m) => m.type === 'game', 1500);
check('no game message follows a reconnect', pending === null);
await a2.close();
// 3. Gear and bait, when the proof may hand the bot some gold.
if (dbPath) {
  const { DatabaseSync } = await import('node:sqlite');
  const db = new DatabaseSync(dbPath);
  db.prepare('UPDATE players SET coins=2000 WHERE id=?').run(back.id);
  db.close();
  const b = new Bot('Proof A', token);
  const w = await b.connect();
  check('the bot has its gold', w.coins === 2000, `${w.coins}`);
  b.send({ type: 'buy', kind: 'gear', item: 'sturdyRod' });
  const bought = await b.next((m) => m.type === 'inventory' && m.bought);
  check('a rod is bought once', !!bought && bought.bought.item === 'sturdyRod' && bought.coins === 2000 - GEAR.sturdyRod.price && bought.stats.owned['gear:sturdyRod'] === 1, bought && `coins ${bought.coins}`);
  b.send({ type: 'buy', kind: 'gear', item: 'sturdyRod' });
  const twice = await b.next((m) => m.type === 'error', 3000);
  check('a rod cannot be bought twice', !!twice && /already/.test(twice.message), twice && twice.message);
  b.send({ type: 'buy', kind: 'bait', item: 'luckyBait' });
  const bait = await b.next((m) => m.type === 'inventory' && m.bought);
  check('bait goes on the hook', !!bait && bait.stats.bait === 1 && bait.coins === 2000 - GEAR.sturdyRod.price - BAIT.price, bait && `coins ${bait.coins}, bait ${bait.stats.bait}`);
  b.send({ type: 'buy', kind: 'bait', item: 'luckyBait' });
  const again = await b.next((m) => m.type === 'error', 3000);
  check('one bait at a time', !!again && /already have bait/.test(again.message), again && again.message);
  await b.walkTo(0, PIER.end - 2, 1.2, 30000);
  b.send({ type: 'cast', power: 0.9, aim: 0 });
  const spent = await b.next((m) => m.type === 'inventory' && m.stats && m.stats.bait === 0);
  check('the cast spends the bait', !!spent, spent && `bait ${spent.stats.bait}`);
  const fishing = await b.next((m) => m.type === 'you' && m.fishing && m.fishing.mods, 3000);
  check('the reel state carries the rod\'s modifiers', !!fishing && fishing.fishing.mods.halfWidth > 0 && fishing.fishing.mods.gainScale === 1, fishing && JSON.stringify(fishing.fishing.mods));
  b.send({ type: 'cancel' });
  await b.close();
  // 4. The dockkeeper, if the name is unclaimed on this server.
  const ali = new Bot('Ali');
  const aw = await ali.connect();
  if (aw.admin) {
    check('the dockkeeper has unlimited gold and the whole catalogue', aw.unlimitedGold === true && aw.stats.owned['hat:straw'] === 1 && aw.stats.owned['gear:deepReel'] === 1, `owned ${Object.keys(aw.stats.owned).length}`);
    ali.send({ type: 'buy', kind: 'accessory', item: 'lantern' });
    const free = await ali.next((m) => m.type === 'error' || (m.type === 'inventory' && m.bought), 3000);
    check('the dockkeeper already owns everything, so the shop has nothing to sell them', !!free && free.type === 'error' && /already own/.test(free.message), free && (free.message || 'bought'));
    if (aw.stats.bait === 0) {
      ali.send({ type: 'buy', kind: 'bait', item: 'luckyBait' });
      const freeBait = await ali.next((m) => m.type === 'inventory' && m.bought, 3000);
      check('bait is still bought one at a time, and costs the dockkeeper nothing', !!freeBait && freeBait.coins === aw.coins && freeBait.stats.bait === 1, freeBait && `coins ${freeBait.coins}, bait ${freeBait.stats.bait}`);
      ali.send({ type: 'buy', kind: 'bait', item: 'luckyBait' });
      const secondBait = await ali.next((m) => m.type === 'error', 3000);
      check('one bait at a time for the dockkeeper too', !!secondBait && /already have bait/.test(secondBait.message));
    } else check('dockkeeper bait check skipped: bait already on the hook', true);
  } else check('dockkeeper check skipped: the name is claimed on this server', true);
  await ali.close();
}
const failed = results.filter((r) => !r.ok);
console.log(JSON.stringify({ passed: results.length - failed.length, failed: failed.length }));
process.exit(failed.length ? 1 : 0);
