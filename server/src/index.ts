import { createServer } from 'node:http';
import { randomBytes, createHash, randomInt } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { WebSocketServer, WebSocket } from 'ws';
import { sanitizeAppearance } from '../../packages/shared/appearance.js';
import { profiles, colors, fishForSeed, reelStep, castLanding, seedForContext, isNight, REEL, startingBar } from '../../packages/shared/game.js';
import { SHOP_DOOR, SPAWN, benchSeat, inCastZone, props, withinLandmark } from '../../packages/shared/layout.js';
import { recordCatch, sanitizeStats } from '../../packages/shared/stats.js';
import { fishCatalog } from '../../packages/shared/game.js';
import { CastingContest } from './minigames/casting.js';
import { BINS } from './minigames/sorting.js';
import { SERVER_GAMES } from './minigames/registry.js';
import { FOUR, FourTable } from './minigames/four.js';
import { RPS, RpsPodium } from './minigames/rps.js';
import type { SoloRun } from './minigames/solo.js';
import { GAME_REWARDS, gameReward, isGameId, type GameId } from '../../packages/shared/games.js';
import { gameRecord, mirrorLegacySorting } from '../../packages/shared/stats.js';
import { PIN, pinForDay } from './pins.js';
import { enforceOwnership, grandfather, grantAll, purchase } from '../../packages/shared/cosmetics.js';
import { reelModifiers } from '../../packages/shared/gear.js';
import { WEATHERS, claimsAdmin, parseAdminCommand, type AdminState, type Weather } from '../../packages/shared/admin.js';
import { MOVE, stepMovement } from '../../packages/shared/movement.js';
import { EMOTES, PROTOCOL_VERSION, parseCast, parseMoveCommand } from '../../packages/shared/protocol.js';
import { createBoardStore, createPlayerStore, createSettingsStore, openDatabase } from './db.js';
import { Boards } from './boards.js';
import { collectShell, dailyState, petDog, waterGarden } from './activities.js';
import { CHALLENGE_REWARD, applyChallenge, challengeView, type ChallengeEvent } from '../../packages/shared/challenges.js';
import { checkFeats } from './feats.js';
import { GARDEN_PLOTS } from '../../packages/shared/activities.js';
import { BOARD, isBoard } from '../../packages/shared/boards.js';
import { createPlayer, type Player } from './player.js';
import { buildLegacySnapshot, buildSnapshot, buildYou, encode, rosterEntry } from './snapshots.js';
const profile = process.env.PROFILE === 'standard' ? 'standard' : 'small',
  config = profiles[profile];
const db = openDatabase(process.env.DB_PATH || 'data/reeltown.sqlite');
const store = createPlayerStore(db);
const settings = createSettingsStore(db);
const boards = new Boards(createBoardStore(db));
const players = new Map<WebSocket, Player>(),
  connections = new Set<WebSocket>();
let tickMs = 0,
  maxTickMs = 0,
  ticks = 0,
  simMs = 0,
  maxSimMs = 0,
  bytesOut = 0,
  castCounter = 0;
const started = Date.now();
const contest = new CastingContest();
// One counter for every game, so a run id never repeats and a stale message cannot match.
let runCounter = 0;
const four = new FourTable();
const rps = new RpsPodium();
const loopDelay = monitorEventLoopDelay({ resolution: 10 });
loopDelay.enable();
const sendRaw = (ws: WebSocket, bytes: Uint8Array) => {
  if (ws.readyState !== WebSocket.OPEN) return;
  if (ws.bufferedAmount > 262144) {
    ws.close(1013, 'Slow connection');
    return;
  }
  bytesOut += bytes.byteLength;
  ws.send(bytes);
};
const send = (ws: WebSocket, message: unknown) => sendRaw(ws, encode(message));
const clean = (value: unknown, max: number) =>
  typeof value === 'string' ? value.replace(/[\x00-\x1f\x7f]/g, '').trim().slice(0, max) : '';
// Encodes once for protocol-2 clients; legacy clients receive the mapped legacy shape.
function broadcast(message: Record<string, unknown>, legacy?: Record<string, unknown>) {
  const bytes = encode(message);
  const legacyBytes = legacy ? encode(legacy) : bytes;
  for (const v of players.values()) sendRaw(v.ws, v.protocol === 2 ? bytes : legacyBytes);
}
function broadcastRoster(add?: Player, remove?: Player) {
  const message = {
    type: 'roster',
    add: add ? [rosterEntry(add)] : undefined,
    remove: remove ? [remove.n] : undefined,
  };
  const bytes = encode(message);
  for (const v of players.values()) if (v.protocol === 2) sendRaw(v.ws, bytes);
}
// Protocol-2 only: messages older clients never asked for.
function broadcastV2(message: Record<string, unknown>) {
  const bytes = encode(message);
  for (const v of players.values()) if (v.protocol === 2) sendRaw(v.ws, bytes);
}
function systemChat(text: string) {
  broadcast({ type: 'chat', n: 0, name: 'Dockkeeper', text }, { type: 'chat', id: 'system', name: 'Dockkeeper', text });
}
// A dev can hold the clock or the weather; the choice outlives a restart.
const storedTime = settings.get('world_time');
let forcedTime: number | null = storedTime !== null && Number.isFinite(Number(storedTime)) ? Number(storedTime) : null;
let forcedWeather = (settings.get('world_weather') as Weather | null) ?? null;
const world = () => ({
  time: forcedTime ?? (Date.now() % 2400000) / 2400000,
  weather: forcedWeather ?? WEATHERS[Math.floor(Date.now() / 900000) % 4],
});
const adminState = (): AdminState => ({ time: forcedTime, weather: forcedWeather, banned: store.banned() });
const server = createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json');
  if (req.url === '/health' || req.url === '/') {
    const memory = process.memoryUsage();
    res.end(
      JSON.stringify({
        ok: true,
        protocol: PROTOCOL_VERSION,
        profile,
        players: players.size,
        cap: config.cap,
        snapshotHz: config.hz,
        tickHz: MOVE.tickHz,
        tickMs,
        maxTickMs,
        simMs,
        maxSimMs,
        ticks,
        eventLoopP99Ms: +(loopDelay.percentile(99) / 1e6).toFixed(2),
        eventLoopMaxMs: +(loopDelay.max / 1e6).toFixed(2),
        rssMB: Math.round(memory.rss / 1048576),
        heapUsedMB: Math.round(memory.heapUsed / 1048576),
        bytesOut,
        uptimeSeconds: Math.round((Date.now() - started) / 1000),
        ...world(),
      }),
    );
  } else {
    res.writeHead(404);
    res.end('{}');
  }
});
const wss = new WebSocketServer({ noServer: true, maxPayload: 2048, perMessageDeflate: false });
server.on('upgrade', (req, socket, head) => {
  if (connections.size >= config.cap + 4) {
    socket.end('HTTP/1.1 503 Service Unavailable\r\n\r\n');
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
});
function join(ws: WebSocket, m: Record<string, any>) {
  if (players.size >= config.cap) {
    send(ws, { type: 'error', message: 'The dock is full. Try again soon.' });
    ws.close(1013);
    return;
  }
  const token = clean(m.token, 64);
  if (token && !/^[a-f0-9]{48}$/.test(token)) {
    ws.close(1008, 'Invalid recovery code');
    return;
  }
  const code = token || randomBytes(24).toString('hex'),
    id = createHash('sha256').update(code).digest('hex');
  for (const v of players.values())
    if (v.id === id) {
      send(ws, { type: 'error', message: 'This recovery code is already playing.' });
      ws.close(1008);
      return;
    }
  const row = store.load(id);
  if (row?.banned) {
    send(ws, { type: 'error', message: 'This character is banned from the harbor.' });
    ws.close(1008);
    return;
  }
  if (token && !row) {
    send(ws, { type: 'error', message: 'Recovery code not found.' });
    ws.close(1008);
    return;
  }
  const name = clean(m.name, 20) || 'Wanderer',
    color = colors.includes(m.color) ? m.color : colors[0];
  if (!row) store.create(id, name, color);
  const stats = sanitizeStats(row?.stats ? JSON.parse(row.stats) : {});
  let appearance = sanitizeAppearance(row ? { color: row.color, ...JSON.parse(row.appearance) } : { ...m.appearance, color: m.appearance?.color || color });
  // Existing players keep whatever they already wore; new players start with the free items.
  if (row) grandfather(stats.owned, appearance);
  appearance = enforceOwnership(appearance, stats.owned);
  // The dev role goes to the first player who claims the name, and then stays with
  // that recovery code: a second person typing the same name gets nothing.
  let adminId = settings.get('admin_id');
  if (!adminId && claimsAdmin(name)) {
    adminId = id;
    settings.set('admin_id', id);
    console.log(JSON.stringify({ event: 'admin-claimed', name }));
  }
  // The dockkeeper owns the whole catalogue and all the gear; consumables such as bait are
  // still bought one at a time, for nothing.
  if (adminId === id) {
    grantAll(stats.owned);
    appearance = enforceOwnership(appearance, stats.owned);
  }
  const p = createPlayer(
    {
      id,
      name,
      color: appearance.color,
      appearance,
      protocol: m.protocol === PROTOCOL_VERSION ? 2 : 1,
      admin: adminId === id,
      muted: !!row?.muted,
      coins: row?.coins || 0,
      inventory: row ? JSON.parse(row.inventory) : [],
      stats,
      ws,
    },
    SPAWN.x + randomInt(-SPAWN.jitter, SPAWN.jitter + 1),
    SPAWN.z,
  );
  players.set(ws, p);
  store.save(p);
  send(ws, {
    type: 'welcome',
    protocol: PROTOCOL_VERSION,
    n: p.n,
    id,
    token: code,
    cap: config.cap,
    profile,
    coins: p.coins,
    inventory: p.inventory,
    stats: p.stats,
    appearance: p.appearance,
    admin: p.admin,
    // Gold never runs out for the dockkeeper, and purchases cost nothing.
    unlimitedGold: p.admin,
    adminState: p.admin ? adminState() : undefined,
    pin: pinState(p, Date.now()),
    daily: dailyState(p.stats, Date.now()),
    challenges: challengeView(p.stats, Date.now()),
    snapshotHz: config.hz,
    tickHz: MOVE.tickHz,
  });
  if (p.protocol === 2) send(ws, { type: 'roster', full: true, add: [...players.values()].map(rosterEntry) });
  for (const v of players.values()) if (v !== p && v.protocol === 2) sendRaw(v.ws, encode({ type: 'roster', add: [rosterEntry(p)] }));
  systemChat(`${name} arrived at the harbor.`);
}
function pinState(p: Player, now: number) {
  const pin = pinForDay(now);
  return { x: pin.x, z: pin.z, collected: !!p.stats.pins[pin.day] };
}
function emptyFishing(now: number, landing: { x: number; z: number }, power: number) {
  return { castId: ++castCounter, castAt: now, waterX: landing.x, waterZ: landing.z, power, at: now, seed: 1, held: false, bar: 0.5, velocity: 0, progress: REEL.startProgress, perfect: true } as const;
}
function handle(p: Player, m: Record<string, any>, now: number) {
  switch (m.type) {
    case 'move': {
      const command = parseMoveCommand(m);
      if (command) p.commands.push(command, now);
      return;
    }
    case 'input': {
      if (typeof m.dx !== 'number' || typeof m.dz !== 'number' || !Number.isFinite(m.dx) || !Number.isFinite(m.dz)) return;
      p.legacyInput.dx = Math.max(-1, Math.min(1, m.dx));
      p.legacyInput.dz = Math.max(-1, Math.min(1, m.dz));
      p.legacyInput.at = now;
      if (p.fishing && typeof m.held === 'boolean') p.fishing.held = m.held;
      return;
    }
    case 'reelInput':
      if (typeof m.held === 'boolean' && p.fishing) p.fishing.held = m.held;
      return;
    case 'admin': {
      if (!p.admin) return;
      const command = parseAdminCommand(m);
      if (!command) return;
      const target = command.action === 'time' || command.action === 'weather' || command.action === 'unban' ? undefined : byN(command.target);
      switch (command.action) {
        case 'time':
          forcedTime = command.value;
          settings.set('world_time', command.value === null ? null : String(command.value));
          break;
        case 'weather':
          forcedWeather = command.value;
          settings.set('world_weather', command.value);
          break;
        case 'mute':
          if (!target) return;
          target.muted = command.value;
          store.setFlag(target.id, 'muted', command.value);
          send(target.ws, { type: 'notice', message: command.value ? 'A dockkeeper muted you.' : 'You can speak again.' });
          break;
        case 'kick':
          if (!target || target === p) return;
          send(target.ws, { type: 'error', message: 'A dockkeeper asked you to take a break.' });
          target.ws.close(1008, 'Kicked');
          break;
        case 'ban':
          if (!target || target === p) return;
          store.setFlag(target.id, 'banned', true);
          send(target.ws, { type: 'error', message: 'A dockkeeper banned you from the harbor.' });
          target.ws.close(1008, 'Banned');
          systemChat(`${target.name} was banned from the harbor.`);
          break;
        case 'unban':
          store.setFlag(command.id, 'banned', false);
          break;
      }
      send(p.ws, { type: 'admin', state: adminState() });
      return;
    }
    case 'buy': {
      const result = purchase(p.admin ? Infinity : p.coins, p.stats.owned, m.kind, m.item, p.stats.bait);
      if (!result.ok) {
        send(p.ws, { type: 'error', message: result.reason });
        return;
      }
      if (!p.admin) p.coins -= result.price;
      if (result.consumable) p.stats.bait = 1;
      p.mods = reelModifiers(p.stats.owned);
      store.save(p);
      send(p.ws, { type: 'inventory', coins: p.coins, inventory: p.inventory, stats: p.stats, bought: { kind: m.kind, item: m.item, price: result.price } });
      if (p.appearance.showGold) broadcastRoster(p);
      return;
    }
    case 'appearance':
      p.appearance = enforceOwnership(sanitizeAppearance(m.appearance), p.stats.owned);
      p.color = p.appearance.color;
      store.save(p);
      send(p.ws, { type: 'appearance', appearance: p.appearance });
      broadcastRoster(p);
      return;
    case 'chat': {
      if (now - p.lastChat < 1500) {
        send(p.ws, { type: 'error', message: 'One message every 1.5 seconds.' });
        return;
      }
      const text = clean(m.text, 200);
      if (!text) return;
      p.lastChat = now;
      if (p.muted) {
        send(p.ws, { type: 'error', message: 'You are muted in this harbor.' });
        return;
      }
      broadcast({ type: 'chat', n: p.n, name: p.name, text }, { type: 'chat', id: p.id, name: p.name, text });
      return;
    }
    case 'emote': {
      const emote = EMOTES.includes(m.emote) && m.emote ? m.emote : 'wave';
      if (p.move.mode === 'boat') return;
      // Asking to sit while already seated stands you up.
      if (emote === 'sit' && p.emote === 'sit') {
        p.emote = '';
        return;
      }
      let onBench = false;
      if (emote === 'sit' && !p.fishing && !four.isSeated(p.n) && !rps.isSeated(p.n)) {
        for (const bench of props.benches)
          if (Math.hypot(p.move.x - bench.x, p.move.z - bench.z) < bench.r + 1.4) {
            onBench = true;
            // Sitting next to a bench seats the player on it, facing the way it faces.
            const seat = benchSeat(bench);
            p.move.x = seat.x;
            p.move.z = seat.z;
            p.move.vx = 0;
            p.move.vz = 0;
            p.move.heading = seat.heading;
            p.commands.clear();
          }
      }
      p.emote = emote;
      p.emoteStarted = now;
      // A bench seat is kept until you walk off it; a sit on the grass is a short rest.
      p.emoteUntil = now + (onBench ? 30 * 60000 : emote === 'sit' || emote === 'dance' ? 12000 : 5000);
      return;
    }
    case 'cast': {
      const { power, aim } = parseCast(m);
      if (p.move.mode === 'boat' || four.isSeated(p.n) || rps.isSeated(p.n)) return;
      if (contest.isPlaying(p.n)) {
        // A contest throw only blocks until the rate limit allows the next one.
        if (p.fishing && p.fishing.phase !== 'contest') return;
        const refused = contest.castAllowed(p.n, now);
        if (refused) {
          send(p.ws, { type: 'error', message: refused });
          return;
        }
        const landing = castLanding(p.move.x, p.move.z, power, aim, true);
        const result = contest.scoreCast(p.n, landing.x, landing.z, now)!;
        p.fishing = null;
        p.move.heading = Math.atan2(landing.x - p.move.x, landing.z - p.move.z);
        p.move.vx = 0;
        p.move.vz = 0;
        p.fishing = { ...emptyFishing(now, landing, power), phase: 'contest', at: now + 2200 };
        broadcast({ type: 'effect', kind: 'contestCast', n: p.n, id: p.id, waterX: landing.x, waterZ: landing.z, score: result.score, castsLeft: result.castsLeft });
        return;
      }
      if (p.fishing) return;
      if (!inCastZone(p.move.x, p.move.z)) {
        send(p.ws, { type: 'error', message: 'Cast from the pier.' });
        return;
      }
      const landing = castLanding(p.move.x, p.move.z, power, aim);
      p.move.heading = Math.atan2(landing.x - p.move.x, landing.z - p.move.z);
      p.move.vx = 0;
      p.move.vz = 0;
      p.emote = '';
      p.casts++;
      const state = world();
      // Lucky bait is spent by the cast that carries it, whatever bites.
      const lucky = p.stats.bait > 0;
      p.fishing = {
        ...emptyFishing(now, landing, power),
        phase: 'waiting',
        at: now + randomInt(2500, 7000) - Math.round(power * 800),
        seed: seedForContext({ weather: state.weather, night: isNight(state.time), power, lucky }, Math.random),
      };
      if (lucky) {
        p.stats.bait = 0;
        store.save(p);
        send(p.ws, { type: 'inventory', coins: p.coins, inventory: p.inventory, stats: p.stats });
      }
      return;
    }
    case 'contest': {
      if (m.action === 'leave') {
        contest.leave(p.n);
        return;
      }
      if (m.action !== 'join') return;
      if (p.fishing) {
        send(p.ws, { type: 'error', message: 'Reel in first.' });
        return;
      }
      if (p.run || p.move.mode === 'boat' || four.isSeated(p.n) || rps.isSeated(p.n)) return;
      const refused = contest.join(p.n, p.move.x, p.move.z, now);
      if (refused) send(p.ws, { type: 'error', message: refused });
      else if (contest.participants.size === 1) systemChat(`${p.name} started a casting contest at the end of the pier!`);
      return;
    }
    case 'sort': {
      // A client published before the games envelope: rewrite its messages and remember to mirror the replies.
      p.legacySort = true;
      handle(p, m.action === 'answer' ? { type: 'game', game: 'sorting', action: 'input', runId: m.runId, i: m.i, bin: m.bin } : { type: 'game', game: 'sorting', action: m.action }, now);
      return;
    }
    case 'activity': {
      if (m.action === 'water') {
        const result = waterGarden(p.stats, p.move.x, p.move.z, now);
        if (typeof result === 'string') {
          send(p.ws, { type: 'error', message: result });
          return;
        }
        p.coins += result.gold;
        const plot = GARDEN_PLOTS[result.plot];
        broadcast({ type: 'effect', kind: 'water', n: p.n, waterX: plot.x, waterZ: plot.z, score: result.gold, plot: result.plot });
        afterActivity(p, now);
        return;
      }
      if (m.action === 'pet') {
        const result = petDog(p.stats, p.move.x, p.move.z, now);
        if (typeof result === 'string') {
          send(p.ws, { type: 'error', message: result });
          return;
        }
        p.coins += result.gold;
        broadcast({ type: 'effect', kind: 'heart', n: p.n, waterX: p.move.x, waterZ: p.move.z, score: result.gold });
        send(p.ws, { type: 'notice', message: result.gold ? 'The dog wags like anything. Good dog.' : 'The dog is already happy today, but leans in anyway.' });
        afterActivity(p, now);
        return;
      }
      return;
    }
    case 'board': {
      if (!isBoard(m.board)) return;
      const board = m.board as number;
      switch (m.action) {
        case 'get':
          send(p.ws, { type: 'board', ...boards.state(board) });
          return;
        case 'lock': {
          const refused = boards.lock(board, p.n, p.id, p.move.x, p.move.z, now);
          if (refused) {
            send(p.ws, { type: 'error', message: refused });
            return;
          }
          broadcastV2({ type: 'board', board, event: 'lock', n: p.n });
          return;
        }
        case 'unlock':
          if (boards.holder(board) !== p.n) return;
          boards.unlock(board, p.n);
          broadcastV2({ type: 'board', board, event: 'lock', n: 0 });
          return;
        case 'stroke': {
          // Drawing has its own small budget so a flurry of strokes cannot crowd out movement.
          if (now - p.boardRate.at > 1000) {
            p.boardRate.at = now;
            p.boardRate.count = 0;
          }
          if (++p.boardRate.count > BOARD.strokesPerSecond) return;
          const result = boards.stroke(board, p.n, p.id, m.stroke, now);
          if (typeof result === 'string') {
            send(p.ws, { type: 'error', message: result });
            return;
          }
          if (result.dropped.length) broadcastV2({ type: 'board', board, event: 'erase', ids: result.dropped });
          broadcastV2({ type: 'board', board, event: 'stroke', stroke: result.stroke });
          return;
        }
        case 'tidy': {
          const ids = boards.tidy(board, p.n, now);
          if (ids.length) broadcastV2({ type: 'board', board, event: 'erase', ids });
          else send(p.ws, { type: 'notice', message: 'This board is already empty.' });
          return;
        }
        case 'erase': {
          const ids = boards.erase(board, p.n, m.id);
          if (ids.length) broadcastV2({ type: 'board', board, event: 'erase', ids });
          return;
        }
        case 'clear': {
          // A dockkeeper may wipe a board; everyone else clears only their own lines.
          const ids = boards.clear(board, p.id, p.admin && m.everything === true);
          if (ids.length) broadcastV2({ type: 'board', board, event: 'erase', ids });
          return;
        }
        default:
          return;
      }
    }
    case 'game': {
      if (!isGameId(m.game)) return;
      if (m.game === 'four') {
        if (m.action === 'sit' && (p.fishing || p.run || p.move.mode === 'boat')) return;
        const refused = four.handle(p.n, p.name, p.move.x, p.move.z, m.action, m.col, now, p.coins, m.stake);
        if (refused) send(p.ws, { type: 'error', message: refused });
        pushFour(now);
        // Someone who just left is no longer sent the table's views, so they get a last one.
        if (!four.involves(p.n)) send(p.ws, { type: 'game', game: 'four', event: 'update', runId: 0, view: four.view(p.n) });
        return;
      }
      if (m.game === 'rps') {
        if (m.action === 'sit' && (p.fishing || p.run || p.move.mode === 'boat')) return;
        const refused = rps.handle(p.n, p.name, p.move.x, p.move.z, m.action, m.move, now, p.coins, m.stake, m.length);
        if (refused) send(p.ws, { type: 'error', message: refused });
        pushRps(now);
        // Someone who just left is no longer sent the podium's views, so they get a last one.
        if (!rps.involves(p.n)) send(p.ws, { type: 'game', game: 'rps', event: 'update', runId: 0, view: rps.view(p.n) });
        return;
      }
      const def = SERVER_GAMES[m.game];
      if (!def) return;
      if (m.action === 'start') {
        startRun(p, m.game, now);
        return;
      }
      if (m.action === 'quit') {
        if (p.run?.game === m.game && (m.runId === undefined || m.runId === p.run.runId)) settleRun(p, now, true);
        return;
      }
      if (m.action !== 'input' || !p.run || p.run.game !== m.game || m.runId !== p.run.runId) return;
      const update = p.run.input(m, now);
      if (update) sendGame(p, 'update', update);
      if (p.run.finished(now)) settleRun(p, now, false);
      return;
    }
    case 'hook':
      if (p.fishing?.phase === 'bite') {
        p.fishing.phase = 'reeling';
        p.fishing.at = now;
        p.fishing.bar = startingBar(p.fishing.seed);
        p.fishing.velocity = 0;
      }
      return;
    case 'cancel':
      p.fishing = null;
      return;
    case 'sell': {
      if (!withinLandmark(SHOP_DOOR, p.move.x, p.move.z)) {
        send(p.ws, { type: 'error', message: 'Sell at the Bait Shop.' });
        return;
      }
      const total = p.inventory.reduce((a, f) => a + f.price, 0);
      p.coins += total;
      p.inventory = [];
      store.save(p);
      send(p.ws, { type: 'inventory', coins: p.coins, inventory: [], sold: total });
      if (!total) send(p.ws, { type: 'notice', message: 'Your tackle box is empty.' });
      if (p.appearance.showGold) broadcastRoster(p);
      return;
    }
  }
}
wss.on('connection', (ws) => {
  connections.add(ws);
  const deadline = setTimeout(() => {
    if (!players.has(ws)) ws.close(1008, 'Join required');
  }, 10000);
  let alive = true;
  ws.on('pong', () => {
    alive = true;
  });
  const heartbeat = setInterval(() => {
    if (!alive) {
      ws.terminate();
      return;
    }
    alive = false;
    ws.ping();
  }, 30000);
  ws.on('message', (raw, isBinary) => {
    if (isBinary) return;
    try {
      const m = JSON.parse(raw.toString());
      if (!m || typeof m !== 'object' || typeof m.type !== 'string') return;
      const p = players.get(ws);
      if (!p) {
        if (m.type === 'join') {
          clearTimeout(deadline);
          join(ws, m);
        }
        return;
      }
      const now = Date.now();
      // Movement commands have their own token bucket; everything else shares a per-second budget.
      if (m.type !== 'move') {
        if (now - p.budgetAt > 1000) {
          p.budgetAt = now;
          p.budget = 0;
        }
        if (++p.budget > 40) {
          ws.close(1008, 'Too many messages');
          return;
        }
      }
      handle(p, m, now);
    } catch {
      ws.close(1008, 'Invalid message');
    }
  });
  ws.on('error', () => {});
  ws.on('close', () => {
    clearTimeout(deadline);
    clearInterval(heartbeat);
    const p = players.get(ws);
    players.delete(ws);
    connections.delete(ws);
    if (p) {
      contest.leave(p.n);
      // A run cut off by a disconnect counts as played and pays nothing; a seat is forfeited.
      if (p.run) settleRun(p, Date.now(), true);
      if (four.involves(p.n)) {
        four.handle(p.n, p.name, p.move.x, p.move.z, 'leave', undefined, Date.now());
        pushFour(Date.now());
      }
      if (rps.involves(p.n)) {
        rps.handle(p.n, p.name, p.move.x, p.move.z, 'leave', undefined, Date.now());
        pushRps(Date.now());
      }
      for (const board of boards.release(p.n)) broadcastV2({ type: 'board', board, event: 'lock', n: 0 });
      store.save(p);
      broadcastRoster(undefined, p);
    }
  });
});
function simulate(p: Player, now: number, dt: number) {
  const held = !!p.fishing || (!!p.run && !!SERVER_GAMES[p.run.game]?.freeze) || four.isSeated(p.n) || rps.isSeated(p.n);
  const before = p.move.vx !== 0 || p.move.vz !== 0;
  if (p.protocol === 2) {
    p.commands.drain(dt, (c) => {
      // Sitting holds you still until you try to walk; the first step stands you up.
      if (p.emote === 'sit' && (c.dx || c.dz)) p.emote = '';
      stepMovement(p.move, c.dx, c.dz, MOVE.dt, held || p.emote === 'sit');
    });
    // A stalled client keeps decelerating so nobody glides on after a disconnect or lag spike.
    if (!p.commands.pending && now - p.commands.lastReceived > 200 && (p.move.vx || p.move.vz))
      stepMovement(p.move, 0, 0, dt, true);
  } else {
    if (now - p.legacyInput.at > 500) {
      p.legacyInput.dx = 0;
      p.legacyInput.dz = 0;
      if (p.fishing) p.fishing.held = false;
    }
    if (p.emote === 'sit' && (p.legacyInput.dx || p.legacyInput.dz)) p.emote = '';
    const frozen = held || p.emote === 'sit';
    stepMovement(p.move, p.legacyInput.dx, p.legacyInput.dz, dt, frozen);
  }
  const moving = p.move.vx !== 0 || p.move.vz !== 0;
  if ((moving || before) && p.emote && p.emote !== 'sit') p.emote = '';
  if (moving && p.emote === 'sit') p.emote = '';
  if (now > p.emoteUntil) p.emote = '';
  if (p.protocol === 2) {
    collectPin(p, now);
    const shell = collectShell(p.stats, p.move.x, p.move.z, now);
    if (shell) {
      p.coins += shell.gold;
      broadcast({ type: 'effect', kind: 'shell', n: p.n, waterX: shell.spot.x, waterZ: shell.spot.z, score: shell.gold, fish: shell.name });
      send(p.ws, { type: 'notice', message: `${shell.isNew ? 'A new kind of shell for the journal: ' : 'A shell: '}${shell.name}. +${shell.gold} gold` });
      challengeEvent(p, now, { kind: 'shell' });
      afterActivity(p, now);
    }
  }
  if (p.run) {
    const update = p.run.tick(now, p.move);
    if (update) sendGame(p, 'update', update);
    if (p.run?.finished(now)) settleRun(p, now, false);
  }
  const f = p.fishing;
  if (!f) return;
  if (f.phase === 'contest') {
    if (now >= f.at) p.fishing = null;
    return;
  }
  if (f.phase === 'waiting' && now >= f.at) {
    f.phase = 'bite';
    f.at = now;
  } else if (f.phase === 'bite' && now - f.at > 1200) {
    p.fishing = null;
    send(p.ws, { type: 'notice', message: 'It slipped away.' });
  } else if (f.phase === 'reeling') {
    reelStep(f, f.held, f.seed, (now - f.at) / 1000, dt, p.mods);
    if (f.progress >= 1) {
      const species = fishForSeed(f.seed);
      const fish = { name: species.name, size: randomInt(10, 80), price: species.price * (f.perfect ? 2 : 1), perfect: f.perfect };
      const { isNew, record } = recordCatch(p.stats, fish.name, fish.size, f.perfect);
      challengeEvent(p, now, { kind: 'catch', rarity: species.rarity, perfect: f.perfect });
      broadcast(
        { type: 'effect', kind: 'catch', n: p.n, id: p.id, waterX: f.waterX, waterZ: f.waterZ, fish: fish.name, perfect: f.perfect, rarity: species.rarity },
        { type: 'effect', kind: 'catch', id: p.id, waterX: f.waterX, waterZ: f.waterZ, fish: fish.name },
      );
      if (p.inventory.length < 500) p.inventory.push(fish);
      store.save(p);
      send(p.ws, { type: 'inventory', coins: p.coins, inventory: p.inventory, stats: p.stats, caught: { ...fish, rarity: species.rarity, isNew, record, streak: p.stats.streak } });
      systemChat(`${p.name} caught ${species.rarity === 'Legendary' ? 'a LEGENDARY' : /^[aeiou]/i.test(fish.name) ? 'an' : 'a'} ${fish.name}!${f.perfect ? ' Perfect catch!' : ''}`);
      p.fishing = null;
    } else if (f.progress <= 0 || now - f.at > 60000) {
      p.fishing = null;
      send(p.ws, { type: 'notice', message: 'The fish got away.' });
    }
  }
}
const GAME_TITLES: Record<GameId, string> = { sorting: 'sorted the catch', tidepool: 'tidied the tide pools', orchard: 'caught fruit in the orchard', signals: 'read the lighthouse signals', buoy: 'ran the buoys', four: 'won at Dockside Four', rps: 'won at rock paper scissors' };
// Sends a game event, and the old `sorting` shape alongside for a client that still expects it.
function sendGame(p: Player, event: 'start' | 'update' | 'end', payload: Record<string, unknown>, run: SoloRun | null = p.run) {
  if (!run) return;
  send(p.ws, { type: 'game', game: run.game, event, runId: run.runId, ...payload });
  if (p.legacySort && run.game === 'sorting') send(p.ws, { type: 'sorting', event: event === 'update' ? 'answer' : event, runId: run.runId, ...payload });
}
function startRun(p: Player, game: GameId, now: number) {
  const def = SERVER_GAMES[game];
  if (!def) return;
  if (p.run) {
    if (p.run.finished(now)) settleRun(p, now, false);
    else if (p.run.game === game && def.allowRestart) settleRun(p, now, true);
    else return;
  }
  if (p.fishing) {
    send(p.ws, { type: 'error', message: 'Reel in your line first.' });
    return;
  }
  if (contest.isPlaying(p.n) || four.isSeated(p.n) || rps.isSeated(p.n)) return;
  // A restart from the water is allowed; anything else must start on foot at the landmark.
  const afloat = p.move.mode === 'boat';
  if (afloat && !def.allowRestart) return;
  if (!afloat && !withinLandmark(def.landmark, p.move.x, p.move.z)) {
    send(p.ws, { type: 'error', message: def.refusal });
    return;
  }
  if (now - p.lastGameStart < 3000) return;
  p.lastGameStart = now;
  p.emote = '';
  def.onStart?.(p);
  p.run = def.create(++runCounter, randomInt(1, 2 ** 31 - 1), now + def.countdownMs);
  sendGame(p, 'start', { startAt: p.run.startAt, durationMs: p.run.durationMs, ...(p.run.game === 'sorting' ? { bins: BINS } : {}), ...p.run.startPayload() });
}
// Everyone at the picnic table gets a fresh view of the board; finished games are paid.
function pushFour(now: number) {
  for (const p of players.values()) if (four.involves(p.n)) send(p.ws, { type: 'game', game: 'four', event: 'update', runId: 0, view: four.view(p.n) });
  // Wagers are collected the moment a game starts, so the pot cannot be spent twice.
  for (const charge of four.takeCharges()) {
    const p = byN(charge.n);
    if (!p) continue;
    p.coins = Math.max(0, p.coins - charge.amount);
    store.save(p);
    if (p.appearance.showGold) broadcastRoster(p);
    send(p.ws, { type: 'inventory', coins: p.coins, inventory: p.inventory, stats: p.stats });
  }
  for (const result of four.takeResults()) {
    const p = byN(result.n);
    if (!p) continue;
    const record = gameRecord(p.stats, 'four');
    record.plays++;
    if (result.outcome === 'win') record.wins++;
    if (!result.forfeit) challengeEvent(p, now, { kind: 'four', won: result.outcome === 'win' });
    const points = result.forfeit ? 0 : result.outcome === 'win' ? (result.vsAi ? FOUR.reward.ai : FOUR.reward.human) : result.outcome === 'draw' ? FOUR.reward.draw : 0;
    const gold = gameReward('four', points, record.rewardedAt, now);
    if (gold > 0) {
      p.coins += gold;
      record.rewardedAt.push(now);
      if (p.appearance.showGold) broadcastRoster(p);
    }
    // The wager, settled: the winner takes both stakes, a draw hands each theirs back,
    // and whoever lost — or walked away mid-game — has already paid.
    const wager = result.wager > 0 ? (result.outcome === 'win' ? result.wager * 2 : result.outcome === 'draw' ? result.wager : 0) : 0;
    if (wager > 0) {
      p.coins += wager;
      if (p.appearance.showGold) broadcastRoster(p);
    }
    store.save(p);
    send(p.ws, { type: 'game', game: 'four', event: 'end', runId: 0, score: points, gold, best: record.wins, quit: result.forfeit, outcome: result.outcome, vsAi: result.vsAi, wager: result.wager, wagerPaid: wager });
    send(p.ws, { type: 'inventory', coins: p.coins, inventory: p.inventory, stats: p.stats });
    if (result.outcome === 'win' && !result.vsAi && !result.forfeit) systemChat(result.wager > 0 ? `${p.name} won ${result.wager} gold at Dockside Four!` : `${p.name} won a game of Dockside Four at the picnic table!`);
  }
}
// Everyone at the podium gets a fresh view; finished matches are paid.
function pushRps(now: number) {
  for (const p of players.values()) if (rps.involves(p.n)) send(p.ws, { type: 'game', game: 'rps', event: 'update', runId: 0, view: rps.view(p.n) });
  // Wagers are collected the moment a match starts, so the pot cannot be spent twice.
  for (const charge of rps.takeCharges()) {
    const p = byN(charge.n);
    if (!p) continue;
    p.coins = Math.max(0, p.coins - charge.amount);
    store.save(p);
    if (p.appearance.showGold) broadcastRoster(p);
    send(p.ws, { type: 'inventory', coins: p.coins, inventory: p.inventory, stats: p.stats });
  }
  for (const result of rps.takeResults()) {
    const p = byN(result.n);
    if (!p) continue;
    const record = gameRecord(p.stats, 'rps');
    record.plays++;
    if (result.outcome === 'win') record.wins++;
    const points = result.forfeit ? 0 : result.outcome === 'win' ? RPS.reward.human : result.outcome === 'draw' ? RPS.reward.draw : 0;
    const gold = gameReward('rps', result.vsAi && result.outcome === 'win' ? RPS.reward.ai : points, record.rewardedAt, now);
    if (gold > 0) {
      p.coins += gold;
      record.rewardedAt.push(now);
      if (p.appearance.showGold) broadcastRoster(p);
    }
    // The wager, settled: the winner takes both stakes, a dead heat hands each theirs
    // back, and whoever lost — or walked away mid-match — has already paid.
    const wager = result.wager > 0 ? (result.outcome === 'win' ? result.wager * 2 : result.outcome === 'draw' ? result.wager : 0) : 0;
    if (wager > 0) {
      p.coins += wager;
      if (p.appearance.showGold) broadcastRoster(p);
    }
    store.save(p);
    send(p.ws, { type: 'game', game: 'rps', event: 'end', runId: 0, score: points, gold, best: record.wins, quit: result.forfeit, outcome: result.outcome, vsAi: result.vsAi, wager: result.wager, wagerPaid: wager });
    send(p.ws, { type: 'inventory', coins: p.coins, inventory: p.inventory, stats: p.stats });
    if (result.outcome === 'win' && !result.vsAi && !result.forfeit && result.wager > 0) systemChat(`${p.name} won ${result.wager} gold at rock paper scissors!`);
  }
}
// Ends a run once: best and plays are recorded, gold is paid under the game's caps, and
// the player hears how it went. A quit or a disconnect counts as played and pays nothing.
function settleRun(p: Player, now: number, quit: boolean) {
  const run = p.run;
  if (!run || run.settled) return;
  run.settled = true;
  p.run = null;
  SERVER_GAMES[run.game]?.onSettle?.(p);
  const summary = run.summary();
  const record = gameRecord(p.stats, run.game);
  const gold = quit ? 0 : gameReward(run.game, summary.score, record.rewardedAt, now);
  record.plays++;
  if (!quit) record.best = Math.max(record.best, summary.score);
  if (run.game === 'buoy' && !quit && typeof summary.timeMs === 'number' && summary.timeMs > 0) record.bestTimeMs = record.bestTimeMs ? Math.min(record.bestTimeMs, summary.timeMs) : summary.timeMs;
  if (run.game === 'sorting') mirrorLegacySorting(p.stats);
  if (gold > 0) {
    p.coins += gold;
    record.rewardedAt.push(now);
    if (p.appearance.showGold) broadcastRoster(p);
  }
  if (!quit) {
    for (const earned of checkFeats(p.stats, run.game, summary)) send(p.ws, { type: 'notice', message: `You earned the ${earned.key.split(':')[1]}! ${earned.feat}. Try it on at Threads.` });
    challengeEvent(p, now, { kind: 'game', game: run.game, score: summary.score });
    if (run.game === 'buoy') challengeEvent(p, now, { kind: 'buoy', timeMs: Number(summary.timeMs) });
  }
  store.save(p);
  sendGame(p, 'end', { ...summary, gold, best: record.best, quit }, run);
  send(p.ws, { type: 'inventory', coins: p.coins, inventory: p.inventory, stats: p.stats });
  if (!quit && summary.score >= GAME_REWARDS[run.game].brag && GAME_REWARDS[run.game].brag > 0) systemChat(`${p.name} ${GAME_TITLES[run.game]} for ${summary.score} points!`);
}
function collectPin(p: Player, now: number) {
  const pin = pinForDay(now);
  if (p.stats.pins[pin.day]) return;
  if (Math.hypot(p.move.x - pin.x, p.move.z - pin.z) > PIN.radius) return;
  p.stats.pins[pin.day] = 1;
  p.coins += PIN.reward;
  store.save(p);
  send(p.ws, { type: 'pin', collected: true, gold: PIN.reward, x: pin.x, z: pin.z });
  send(p.ws, { type: 'inventory', coins: p.coins, inventory: p.inventory, stats: p.stats });
  if (p.appearance.showGold) broadcastRoster(p);
  systemChat(`${p.name} found today's harbor pin!`);
}
// Progress today's challenges; pays and announces any that just completed.
function challengeEvent(p: Player, now: number, event: ChallengeEvent) {
  const completed = applyChallenge(p.stats, now, event);
  for (const c of completed) {
    p.coins += CHALLENGE_REWARD;
    send(p.ws, { type: 'notice', message: `Challenge complete: ${c.text}. +${CHALLENGE_REWARD} gold` });
    send(p.ws, { type: 'effect', kind: 'gold', n: p.n, waterX: 0, waterZ: 0, score: CHALLENGE_REWARD });
  }
  if (completed.length && p.appearance.showGold) broadcastRoster(p);
  send(p.ws, { type: 'challenges', list: challengeView(p.stats, now) });
}
// Saves and refreshes the client after a shell, a watering or a pat.
function afterActivity(p: Player, now: number) {
  store.save(p);
  send(p.ws, { type: 'inventory', coins: p.coins, inventory: p.inventory, stats: p.stats });
  send(p.ws, { type: 'daily', ...dailyState(p.stats, now) });
  if (p.appearance.showGold) broadcastRoster(p);
}
function byN(n: number) {
  for (const p of players.values()) if (p.n === n) return p;
  return undefined;
}
function settleContest(results: Array<{ n: number; best: number; rank: number; gold: number }>, now: number) {
  const winner = results[0];
  const winnerPlayer = winner && byN(winner.n);
  if (winnerPlayer && winner.best > 0) systemChat(`${winnerPlayer.name} won the casting contest with ${winner.best} points!`);
  for (const r of results) {
    const p = byN(r.n);
    if (!p) continue;
    p.stats.casting.plays++;
    p.stats.casting.best = Math.max(p.stats.casting.best, r.best);
    if (r.rank === 1 && r.best > 0) p.stats.casting.wins++;
    if (r.gold > 0) {
      p.coins += r.gold;
      p.stats.casting.rewardedAt.push(now);
      if (p.appearance.showGold) broadcastRoster(p);
    }
    store.save(p);
    send(p.ws, { type: 'inventory', coins: p.coins, inventory: p.inventory, stats: p.stats, contest: { best: r.best, rank: r.rank, gold: r.gold, players: results.length } });
  }
}
let previousTick = performance.now();
const timer = setInterval(() => {
  const begin = performance.now(),
    now = Date.now();
  const dt = Math.min((begin - previousTick) / 1000, 0.1);
  previousTick = begin;
  for (const p of players.values()) simulate(p, now, dt);
  // Aim the round at wherever the contestants gathered along the pier head.
  if (contest.phase === 'lobby') {
    let sum = 0,
      count = 0;
    for (const p of players.values())
      if (contest.participants.has(p.n)) {
        sum += p.move.x;
        count++;
      }
    contest.anchorX = count ? sum / count : 0;
  }
  const results = contest.update(now, (n) => byN(n)?.stats.casting.rewardedAt || []);
  if (results) settleContest(results, now);
  if (four.tick(now, (n) => byN(n)?.move)) pushFour(now);
  if (rps.tick(now, (n) => byN(n)?.move)) pushRps(now);
  for (const board of boards.tick(now, (n) => byN(n)?.move)) broadcastV2({ type: 'board', board, event: 'lock', n: 0 });
  for (const gone of boards.maintain(now)) broadcastV2({ type: 'board', board: gone.board, event: 'erase', ids: gone.ids });
  simMs = +(performance.now() - begin).toFixed(3);
  maxSimMs = Math.max(maxSimMs, simMs);
}, 1000 / 60);
const snapshotTimer = setInterval(() => {
  const begin = performance.now(),
    now = Date.now();
  const state = world();
  let shared: Uint8Array | null = null;
  for (const p of players.values()) {
    if (p.protocol === 2) {
      shared ??= buildSnapshot(players.values(), now, config.cap, players.size, state, contest.state(), [four.snapshot(), rps.snapshot()]);
      sendRaw(p.ws, shared);
      sendRaw(p.ws, buildYou(p, now));
    } else sendRaw(p.ws, buildLegacySnapshot(p, players.values(), now, config.cap, players.size, state));
  }
  tickMs = +(performance.now() - begin).toFixed(3);
  maxTickMs = Math.max(maxTickMs, tickMs);
  ticks++;
}, 1000 / config.hz);
server.listen(Number(process.env.PORT || 3001), '127.0.0.1', () =>
  console.log(JSON.stringify({ event: 'listening', profile, protocol: PROTOCOL_VERSION, ...config, tickHz: MOVE.tickHz })),
);
process.on('SIGTERM', () => {
  clearInterval(timer);
  clearInterval(snapshotTimer);
  for (const p of players.values()) {
    store.save(p);
    p.ws.close(1001, 'Server restarting');
  }
  server.close(() => {
    db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 4000).unref();
});
