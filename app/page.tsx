'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { SERVER_WSS_URL } from '../client/config';
import { Connection } from '../client/connection';
import { defaultAppearance, sanitizeAppearance, type Appearance } from '../packages/shared/appearance';
import { CharacterEditor } from '../client/CharacterEditor';
import { CAST, isNight } from '../packages/shared/game';
import { GEAR, type GearId } from '../packages/shared/gear';
import { inCastZone } from '../packages/shared/layout';
import { sanitizeStats, type Stats } from '../packages/shared/stats';
import type { ContestState } from '../packages/shared/protocol';
import { Reel, type ReelSnapshot } from '../client/Reel';
import type { World } from '../client/world';
import type { QualityLevel } from '../client/world/quality';
import { BENCH_RADIUS, CONTEST_SIGN, SHOP_DOOR, SORTING_CRATES, THREADS_DOOR } from '../client/world/places';
import { Threads } from './ui/Threads';
import { Icon, weatherIcon } from './ui/icons';
import { Button, Pill } from './ui/primitives';
import { Toasts, useToasts } from './ui/Toasts';
import { Joystick } from './ui/Joystick';
import { CatchCard, type Caught } from './ui/CatchCard';
import { TackleBox, type Fish } from './ui/TackleBox';
import { Shop } from './ui/Shop';
import { Settings, type SettingsState } from './ui/Settings';
import { ContestPanel, type ContestResult } from './ui/Contest';
import { Chat, type ChatLine } from './ui/Chat';
import { GameHost } from './games/GameHost';
import { RunPill } from './games/RunPill';
import { GAMES } from './games/registry';
import type { GameEnd, GameId, GameStart, GameUpdate } from '../packages/shared/games';
import type { FourView } from './games/Four';
import { LANDMARKS } from '../packages/shared/landmarks';
import { DrawingBoard } from './ui/DrawingBoard';
import { BOARD, authorTag, type Stroke } from '../packages/shared/boards';
import { DRAWING_BOARDS } from '../packages/shared/layout';
import { NoticeBoard, type Daily } from './ui/NoticeBoard';
import type { ChallengeView } from '../packages/shared/challenges';
import { Help } from './ui/Help';
import { DevPanel } from './ui/DevPanel';
import type { AdminState } from '../packages/shared/admin';
import { harbourphone } from '../client/audio';
type PanelName = 'box' | 'threads' | 'settings' | 'shop' | 'contest' | 'game' | 'board' | 'notice' | 'help' | 'players' | 'dev' | null;
type Near = { shop: boolean; threads: boolean; contestSign: boolean; bench: boolean; seated: boolean; four: boolean; board: number; garden: boolean; dog: boolean; notice: boolean; games: Record<GameId, boolean> };
const NO_NEAR: Near = { shop: false, threads: false, contestSign: false, bench: false, seated: false, four: false, board: -1, garden: false, dog: false, notice: false, games: {} as Record<GameId, boolean> };
function serverUrl() {
  if (typeof location !== 'undefined' && ['localhost', '127.0.0.1'].includes(location.hostname)) {
    const override = localStorage.getItem('reeltown-server');
    if (override) return override;
  }
  return SERVER_WSS_URL;
}
// Safari only gained the unprefixed Fullscreen API in 16.4, and an iPhone has never
// had it for anything but video, so both spellings have to be tried before deciding a
// browser cannot do this.
type FullscreenTarget = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void };
type FullscreenOwner = Document & { webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => Promise<void> | void };
function canFullscreen() {
  if (typeof document === 'undefined') return false;
  const root = document.documentElement as FullscreenTarget;
  return !!(root.requestFullscreen || root.webkitRequestFullscreen);
}
function fullscreenElement() {
  const owner = document as FullscreenOwner;
  return owner.fullscreenElement || owner.webkitFullscreenElement || null;
}
function setFullscreen(on: boolean) {
  const root = document.documentElement as FullscreenTarget;
  const owner = document as FullscreenOwner;
  if (on) return root.requestFullscreen ? root.requestFullscreen() : root.webkitRequestFullscreen?.();
  if (!fullscreenElement()) return;
  return owner.exitFullscreen ? owner.exitFullscreen() : owner.webkitExitFullscreen?.();
}
function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}
// Ping-pong 0 → 1 → 0 so a held cast button sweeps the power meter.
function chargePower(seconds: number) {
  const k = (seconds / CAST.chargeSeconds) % 2;
  return k <= 1 ? k : 2 - k;
}
export default function Home() {
  const host = useRef<HTMLDivElement>(null),
    labels = useRef<HTMLDivElement>(null),
    world = useRef<World | null>(null),
    connection = useRef<Connection | null>(null),
    keys = useRef(new Set<string>()),
    stick = useRef({ dx: 0, dz: 0 }),
    held = useRef(false),
    chatInput = useRef<HTMLInputElement>(null),
    chatFocused = useRef(false),
    phase = useRef(''),
    reelListeners = useRef(new Set<(s: ReelSnapshot) => void>()),
    charge = useRef<{ start: number; frame: number } | null>(null),
    meterFill = useRef<HTMLDivElement>(null),
    names = useRef(new Map<number, string>()),
    selfN = useRef(0),
    serverOffset = useRef(0),
    lastContestKey = useRef(''),
    nearRef = useRef<Near>(NO_NEAR),
    selfId = useRef(''),
    reconnectAttempts = useRef(0),
    reconnectTimer = useRef(0),
    intentionalClose = useRef(false),
    hadSession = useRef(false),
    freshGuest = useRef(false),

    rosterRef = useRef(new Map<number, { name: string; species: string }>()),
    gameListeners = useRef(new Set<(m: GameUpdate) => void>()),
    gameActive = useRef(false),
    fourSeated = useRef(false),
    catchTimer = useRef(0);
  const { toasts, push: toast, dismiss } = useToasts();
  const [name, setName] = useState(''),
    [appearance, setAppearance] = useState<Appearance>(defaultAppearance),
    [recovery, setRecovery] = useState(''),
    [joined, setJoined] = useState(false),
    [returning, setReturning] = useState(false),
    [ready, setReady] = useState(false),

    [connecting, setConnecting] = useState(false),
    [reconnecting, setReconnecting] = useState(false),
    [admin, setAdmin] = useState<AdminState | null>(null),
    [unlimitedGold, setUnlimitedGold] = useState(false),
    [muted, setMuted] = useState<number[]>([]),
    [status, setStatus] = useState({ count: 0, cap: 12, weather: 'clear', night: false }),
    [log, setLog] = useState<ChatLine[]>([]),
    [coins, setCoins] = useState(0),
    [coinDelta, setCoinDelta] = useState(0),
    [inventory, setInventory] = useState<Fish[]>([]),
    [stats, setStats] = useState<Stats>(() => sanitizeStats({})),
    [panel, setPanel] = useState<PanelName>(null),
    [emotesOpen, setEmotesOpen] = useState(false),
    [chatOpen, setChatOpen] = useState(false),
    [fishingPhase, setFishingPhase] = useState(''),
    [reelStart, setReelStart] = useState<ReelSnapshot | null>(null),
    [charging, setCharging] = useState(false),
    [caught, setCaught] = useState<Caught | null>(null),
    [contest, setContest] = useState<ContestState>(null),
    [contestResult, setContestResult] = useState<ContestResult | null>(null),
    [near, setNear] = useState<Near>(NO_NEAR),
    [daily, setDaily] = useState<Daily | null>(null),
    [challenges, setChallenges] = useState<ChallengeView[]>([]),
    [board, setBoard] = useState(-1),
    [boardVersion, setBoardVersion] = useState(0),
    [activeGame, setActiveGame] = useState<GameId | null>(null),
    [run, setRun] = useState<GameStart | null>(null),
    [runEnd, setRunEnd] = useState<GameEnd | null>(null),
    [fourView, setFourView] = useState<FourView | null>(null),
    [table, setTable] = useState<[number, number, number]>([0, 0, 0]),
    [selling, setSelling] = useState(false),
    [shopTab, setShopTab] = useState<'sell' | 'tackle'>('sell'),
    [settings, setSettings] = useState<SettingsState>(() => ({ quality: 'auto', qualityLabel: '', crisp: false, reduceMotion: false, largeText: false, showGold: false, sound: true, fullscreen: false }));
  const coarse = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
  const send = useCallback((m: Record<string, unknown>) => connection.current?.send(m), []);
  // An open chat and the emote wheel want the same strip at the bottom of a phone.
  const onChatOpenChange = useCallback((open: boolean) => {
    setChatOpen(open);
    if (open) setEmotesOpen(false);
  }, []);
  const pushInput = useCallback(() => {
    const k = keys.current;
    let dx = Number(k.has('KeyD') || k.has('ArrowRight')) - Number(k.has('KeyA') || k.has('ArrowLeft'));
    let dz = Number(k.has('KeyS') || k.has('ArrowDown')) - Number(k.has('KeyW') || k.has('ArrowUp'));
    if (!dx && !dz) {
      dx = stick.current.dx;
      dz = stick.current.dz;
    }
    world.current?.setInput(dx, dz);
  }, []);
  const hold = useCallback(
    (value: boolean) => {
      if (held.current === value) return;
      held.current = value;
      send({ type: 'reelInput', held: value });
    },
    [send],
  );
  // Casting: hold to charge, steer left/right to aim, release to throw.
  const startCharge = useCallback(() => {
    if (charge.current || phase.current || !world.current) return;
    const p = world.current.selfPosition();
    const contestNow = world.current.contest();
    const playing = contestNow?.phase === 'active' && contestNow.players.some((row) => row[0] === selfN.current);
    if (!inCastZone(p.x, p.z) && !playing) {
      toast('Walk down the wooden pier to cast your line.', 'info', 3500);
      return;
    }
    const start = performance.now();
    const loop = () => {
      if (!charge.current) return;
      const power = chargePower((performance.now() - start) / 1000);
      const k = keys.current;
      const aim = (Number(k.has('KeyD') || k.has('ArrowRight')) - Number(k.has('KeyA') || k.has('ArrowLeft'))) * 0.8 + stick.current.dx;
      world.current?.setCastPreview(power, Math.max(-1, Math.min(1, aim)));
      if (meterFill.current) meterFill.current.style.height = `${power * 100}%`;
      charge.current.frame = requestAnimationFrame(loop);
    };
    charge.current = { start, frame: requestAnimationFrame(loop) };
    setCharging(true);
  }, [toast]);
  const releaseCast = useCallback(() => {
    const c = charge.current;
    if (!c) return;
    cancelAnimationFrame(c.frame);
    charge.current = null;
    setCharging(false);
    const power = chargePower((performance.now() - c.start) / 1000);
    const k = keys.current;
    const aim = Math.max(-1, Math.min(1, (Number(k.has('KeyD') || k.has('ArrowRight')) - Number(k.has('KeyA') || k.has('ArrowLeft'))) * 0.8 + stick.current.dx));
    world.current?.setCastPreview(-1, 0);
    world.current?.freeze(400);
    send({ type: 'cast', power, aim });
    harbourphone.play('cast');
  }, [send]);
  const primaryDown = useCallback(() => {
    if (phase.current === 'bite') {
      send({ type: 'hook' });
      harbourphone.play('hook');
    } else if (phase.current === 'reeling') hold(true);
    else if (!phase.current) startCharge();
  }, [send, hold, startCharge]);
  const primaryUp = useCallback(() => {
    if (charge.current) releaseCast();
    hold(false);
  }, [releaseCast, hold]);
  const openGame = useCallback((id: GameId) => {
    setActiveGame(id);
    setRunEnd(null);
    setPanel((p) => (p === 'game' ? null : 'game'));
  }, []);
  const interact = useCallback(() => {
    const n = nearRef.current;
    const game = GAMES.find((g) => n.games[g.id]);
    if (n.shop) setPanel((p) => (p === 'shop' ? null : 'shop'));
    else if (n.threads) setPanel((p) => (p === 'threads' ? null : 'threads'));
    else if (game) openGame(game.id);
    else if (n.four) openGame('four');
    else if (n.board >= 0) {
      setBoard(n.board);
      setPanel((p) => (p === 'board' ? null : 'board'));
    } else if (n.notice) setPanel((p) => (p === 'notice' ? null : 'notice'));
    else if (n.garden) send({ type: 'activity', action: 'water' });
    else if (n.dog) send({ type: 'activity', action: 'pet' });
    else if (n.contestSign) setPanel((p) => (p === 'contest' ? null : 'contest'));
    else if (n.bench) send({ type: 'emote', emote: 'sit' });
  }, [send, openGame]);
  const emote = useCallback(
    (kind: string) => {
      send({ type: 'emote', emote: kind });
      setEmotesOpen(false);
    },
    [send],
  );
  const applySettings = useCallback(
    (patch: Partial<SettingsState>) => {
      setSettings((s) => {
        const next = { ...s, ...patch };
        localStorage.setItem('reeltown-settings', JSON.stringify({ quality: next.quality, crisp: next.crisp, reduceMotion: next.reduceMotion, largeText: next.largeText, sound: next.sound }));
        return next;
      });
      if (patch.quality !== undefined) world.current?.setQuality(patch.quality);
      if (patch.crisp !== undefined) {
        world.current?.setCrisp(patch.crisp);
        host.current?.classList.toggle('crisp', patch.crisp);
      }
      if (patch.sound !== undefined) harbourphone.setEnabled(patch.sound);
      // Full screen needs the click that turned it on, so it is never restored from storage.
      if (patch.fullscreen !== undefined)
        void Promise.resolve(setFullscreen(patch.fullscreen)).catch(() => toast('Your browser would not switch to full screen.', 'error', 4000));
      if (patch.reduceMotion !== undefined) document.documentElement.classList.toggle('reduce-motion', patch.reduceMotion);
      if (patch.largeText !== undefined) document.documentElement.classList.toggle('large-text', patch.largeText);
      if (patch.showGold !== undefined)
        setAppearance((a) => {
          const next = { ...a, showGold: patch.showGold! };
          send({ type: 'appearance', appearance: next });
          return next;
        });
    },
    [send, toast],
  );
  useEffect(() => {
    let disposed = false;
    const stored = readJson('reeltown-settings', { quality: 'auto' as QualityLevel | 'auto', crisp: false, reduceMotion: matchMedia('(prefers-reduced-motion: reduce)').matches, largeText: false, sound: true });
    harbourphone.enabled = stored.sound;
    // Audio contexts need a gesture; the first press or click after load unlocks the harbour sounds.
    const unlock = () => harbourphone.unlock();
    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('keydown', unlock);
    const onFullscreen = () => setSettings((s) => ({ ...s, fullscreen: !!fullscreenElement() }));
    document.addEventListener('fullscreenchange', onFullscreen);
    document.addEventListener('webkitfullscreenchange', onFullscreen);
    const clickCue = (e: PointerEvent) => {
      if ((e.target as HTMLElement | null)?.closest('.btn, .tabs button, .crate, .guidetile, .option-group button, .swatch')) harbourphone.play('click');
    };
    window.addEventListener('pointerdown', clickCue, { passive: true });
    import('../client/world')
      .then(async ({ createWorld, preloadModels, MODEL_NAMES }) => {
        await preloadModels(MODEL_NAMES);
        if (disposed || !host.current || !labels.current) return;
        world.current = createWorld(host.current, labels.current, {
          onCommand: (command) => send({ type: 'move', ...command }),
          onQuality: (level, auto) => setSettings((s) => ({ ...s, qualityLabel: `${auto ? 'Auto · ' : ''}${level}` })),
        });
        applySettings(stored);
        if (location.search.includes('perf')) (window as unknown as { __reeltown: World }).__reeltown = world.current;
      })
      .catch(() => toast('The 3D world could not load. Please reload.', 'error', 10000));
    const storedName = localStorage.getItem('reeltown-name');
    if (storedName) setName(storedName);
    // This browser already holds a character, so the welcome card takes the place of
    // the join form. Going in is still a decision the player makes.
    if (storedName && localStorage.getItem('reeltown-token')) setReturning(true);
    setReady(true);
    const down = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (!connection.current?.open || chatFocused.current || target?.closest('input,textarea,select')) return;
      if (e.code === 'Enter') {
        e.preventDefault();
        chatInput.current?.focus();
        return;
      }
      if (e.code === 'Escape') {
        if (gameActive.current) return;
        // Closing the Dockside Four card while waiting at the table stands you up too.
        if (fourSeated.current) {
          send({ type: 'game', game: 'four', action: 'leave' });
          setFourView(null);
        }
        setPanel(null);
        setEmotesOpen(false);
        setCaught(null);
        return;
      }
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      if (target?.tagName === 'BUTTON' && (e.code === 'Space' || e.code === 'Enter')) return;
      keys.current.add(e.code);
      pushInput();
      if (e.repeat) return;
      if (e.code === 'Space') primaryDown();
      if (e.code === 'KeyE') interact();
      if (!gameActive.current) {
        if (e.code === 'Digit1') emote('wave');
        if (e.code === 'Digit2') emote('heart');
        if (e.code === 'Digit3') emote('dance');
        if (e.code === 'Digit4') emote('sit');
        if (e.code === 'KeyI') setPanel((p) => (p === 'box' ? null : 'box'));
      }
    };
    const up = (e: KeyboardEvent) => {
      keys.current.delete(e.code);
      pushInput();
      if (e.code === 'Space') primaryUp();
    };
    const blur = () => {
      keys.current.clear();
      pushInput();
      primaryUp();
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    const proximity = setInterval(() => {
      const w = world.current;
      if (!w || !connection.current?.open) return;
      const d = w.nearby();
      const games = {} as Record<GameId, boolean>;
      for (const g of GAMES) games[g.id] = (d as Record<string, number>)[g.id] < g.landmark.radius;
      const nearBoard = d.board >= 0 && d.boardDistance < DRAWING_BOARDS[d.board].radius ? d.board : -1;
      const next: Near = { shop: d.shop < SHOP_DOOR.radius, threads: d.threads < THREADS_DOOR.radius, contestSign: d.contestSign < CONTEST_SIGN.radius, bench: d.bench < BENCH_RADIUS, seated: world.current?.selfEmote() === 'sit', four: d.four < LANDMARKS.four.radius, board: nearBoard, garden: d.garden < LANDMARKS.garden.radius, dog: d.dog < LANDMARKS.dog.radius, notice: d.notice < LANDMARKS.notice.radius, games };
      nearRef.current = next;
      setNear((prev) => ((Object.keys(next) as Array<keyof Near>).every((k) => (k === 'games' ? GAMES.every((g) => prev.games[g.id] === next.games[g.id]) : prev[k] === next[k])) ? prev : next));
      const t = w.tables()[0] ?? [0, 0, 0];
      setTable((prev) => (prev[0] === t[0] && prev[1] === t[1] && prev[2] === t[2] ? prev : t));
      const c = w.contest();
      const key = c ? `${c.phase}:${c.endsAt}:${c.players.map((row) => row.join('/')).join(',')}` : '';
      if (key !== lastContestKey.current) {
        lastContestKey.current = key;
        setContest(c ? { ...c } : null);
      }
    }, 200);
    return () => {
      disposed = true;
      clearInterval(proximity);
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
      window.removeEventListener('pointerdown', clickCue);
      document.removeEventListener('fullscreenchange', onFullscreen);
      document.removeEventListener('webkitfullscreenchange', onFullscreen);
      clearTimeout(reconnectTimer.current);
      intentionalClose.current = true;
      connection.current?.close();
      world.current?.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!coinDelta) return;
    const t = setTimeout(() => setCoinDelta(0), 2500);
    return () => clearTimeout(t);
  }, [coinDelta]);
  // Hand the browser back: the saved character stays on the server, reachable with its
  // recovery code, but this device stops walking straight into it.
  function forget() {
    localStorage.removeItem('reeltown-token');
    localStorage.removeItem('reeltown-name');
    sessionStorage.removeItem('reeltown-token');
    freshGuest.current = false;
    hadSession.current = false;
    reconnectAttempts.current = 0;
    window.clearTimeout(reconnectTimer.current);
    if (connection.current?.open) {
      intentionalClose.current = true;
      connection.current.close();
    }
    setReturning(false);
    setJoined(false);
    setConnecting(false);
    setReconnecting(false);
    setName('');
    setRecovery('');
    setPanel(null);
  }
  // Today's shells and watered plots, for the world and the notice board.
  function applyDaily(d: Daily) {
    setDaily(d);
    world.current?.setShells(d.shells, d.collected);
    world.current?.setWatered(d.garden);
  }
  function join(asName?: string) {
    if (connection.current?.open) return;
    const joinName = asName ?? name;
    setConnecting(true);
    const c = new Connection();
    connection.current = c;
    let lastStatus = '';
    c.on('timeout', () => {
      toast('The harbor is unreachable. Please try again.', 'error');
      setConnecting(false);
    });
    c.on('welcome', (m) => {
      if (reconnectAttempts.current) toast('Back at the harbor.', 'success', 3000);
      reconnectAttempts.current = 0;
      hadSession.current = true;
      setReconnecting(false);
      selfN.current = m.n;
      selfId.current = m.id;
      // The boards load one at a time so a slow connection is never flooded.
      send({ type: 'board', board: 0, action: 'get' });
      setAdmin(m.admin ? (m.adminState as AdminState) : null);
      setUnlimitedGold(m.unlimitedGold === true);
      world.current?.setSelf(m.n);
      sessionStorage.setItem('reeltown-token', m.token);
      localStorage.setItem('reeltown-token', m.token);
      localStorage.setItem('reeltown-name', joinName);
      setJoined(true);
      setConnecting(false);
      setCoins(m.coins);
      setInventory(m.inventory);
      setStats(sanitizeStats(m.stats));
      if (m.appearance) {
        const a = sanitizeAppearance(m.appearance);
        setAppearance(a);
        setSettings((s) => ({ ...s, showGold: a.showGold }));
      }
      if (!localStorage.getItem('reeltown-helped')) {
        localStorage.setItem('reeltown-helped', '1');
        setPanel('help');
      }
      if (m.pin) world.current?.setPin(m.pin.x, m.pin.z, !m.pin.collected);
      if (m.daily) applyDaily(m.daily as Daily);
      if (Array.isArray(m.challenges)) setChallenges(m.challenges as ChallengeView[]);
    });
    c.on('daily', (m) => applyDaily(m as Daily));
    c.on('challenges', (m) => setChallenges(m.list as ChallengeView[]));
    c.on('pin', (m) => {
      world.current?.setPin(m.x, m.z, false);
      world.current?.effect({ kind: 'pin', n: selfN.current, waterX: m.x, waterZ: m.z, score: m.gold });
      toast(`Harbor pin · +${m.gold} gold`, 'gold', 6000);
      harbourphone.play('pin');
    });
    c.on('game', (m: GameStart | GameUpdate | GameEnd) => {
      if (m.game === 'four') {
        // The table pushes whole views; a finished game arrives as an end with the outcome.
        if (m.event === 'update') setFourView(m.view as FourView);
        else if (m.event === 'end') {
          const outcome = m.outcome as string;
          if (m.gold > 0) {
            toast(`Dockside Four · you ${outcome === 'win' ? 'won' : 'drew'} · +${m.gold} gold`, 'gold', 6000);
            world.current?.effect({ kind: 'gold', n: selfN.current, waterX: 0, waterZ: 0, score: m.gold });
          } else if (!m.quit) toast(outcome === 'win' ? 'Dockside Four · you won!' : outcome === 'draw' ? 'Dockside Four · a draw.' : 'Dockside Four · better luck next time.', 'info', 4000);
        }
        return;
      }
      const def = GAMES.find((g) => g.id === m.game);
      if (!def) return;
      if (m.event === 'start') {
        if (m.game === 'buoy') world.current?.setNextBuoy(0);
        setRunEnd(null);
        setRun(m);
        setActiveGame(m.game);
        // A roaming run starts with its card already put away; the pill is enough, and a
        // tap on it brings the card back.
        setPanel(def?.free ? null : 'game');
        // The start button keeps focus otherwise, and the next Space would press "Give up".
        (document.activeElement as HTMLElement | null)?.blur?.();
        // A panel game takes the keyboard; the boat is steered on your feet.
        world.current?.setBusy(!def.free);
      } else if (m.event === 'update') {
        if (m.game === 'buoy' && typeof m.next === 'number') {
          world.current?.setNextBuoy(m.finished ? -1 : (m.next as number));
          harbourphone.play(m.finished ? 'catch' : 'pin');
        }
        if (typeof m.correct === 'boolean') harbourphone.play(m.correct ? 'toss' : 'wrong');
        else if (typeof m.ok === 'boolean') harbourphone.play(m.ok ? 'toss' : 'wrong');
        else if (m.wanted) harbourphone.play('coin');
        for (const l of gameListeners.current) l(m);
      } else if (m.event === 'end') {
        setRun(null);
        setRunEnd(m);
        world.current?.setBusy(false);
        if (m.game === 'buoy') world.current?.setNextBuoy(-1);
        if (m.gold > 0) {
          toast(`${def.title} · ${m.score} points · +${m.gold} gold`, 'gold', 6000);
          world.current?.effect({ kind: 'gold', n: selfN.current, waterX: 0, waterZ: 0, score: m.gold });
        }
      }
    });
    c.on('board', (m) => {
      const w = world.current;
      if (!w) return;
      if (m.event === 'state') {
        w.boards.setState(m.board, m.strokes as Stroke[], m.lock);
        if (m.board + 1 < BOARD.count) send({ type: 'board', board: m.board + 1, action: 'get' });
      } else if (m.event === 'stroke') w.boards.addStroke(m.board, m.stroke as Stroke);
      else if (m.event === 'erase') w.boards.removeStrokes(m.board, m.ids as number[]);
      else if (m.event === 'lock') w.boards.setLock(m.board, m.n);
      setBoardVersion(w.boards.version);
    });
    c.on('admin', (m) => setAdmin(m.state as AdminState));
    c.on('roster', (m) => {
      for (const entry of m.add || []) {
        names.current.set(entry.n, entry.name);
        rosterRef.current.set(entry.n, { name: entry.name, species: entry.appearance?.species ?? 'cat' });
      }
      for (const n of m.remove || []) {
        names.current.delete(n);
        rosterRef.current.delete(n);
      }
      world.current?.applyRoster(m);
    });
    c.on('snapshot', (m) => {
      world.current?.applySnapshot(m);
      const next = `${m.count}/${m.cap}/${m.weather}/${isNight(m.time)}`;
      if (next !== lastStatus) {
        lastStatus = next;
        setStatus({ count: m.count, cap: m.cap || 12, weather: m.weather, night: isNight(m.time) });
        harbourphone.setWeather(m.weather === 'rain' ? 1 : 0, isNight(m.time) ? 1 : 0);
      }
    });
    c.on('you', (m) => {
      world.current?.applyYou(m);
      serverOffset.current += (m.st - Date.now() - serverOffset.current) * 0.2;
      const nextPhase = m.fishing?.phase || '';
      if (nextPhase !== phase.current) {
        phase.current = nextPhase;
        setFishingPhase(nextPhase);
        if (nextPhase === 'reeling') {
          setReelStart(m.fishing);
          // The reel panel replaces whatever was open so it can never be hidden behind a drawer.
          setPanel((p) => (p === 'game' || p === 'contest' ? p : null));
        }
        if (nextPhase === 'bite') {
          navigator.vibrate?.(60);
          harbourphone.play('bite');
          world.current?.effect({ kind: 'bite', n: selfN.current, waterX: 0, waterZ: 0 });
        }
      }
      if (m.fishing?.phase === 'reeling') for (const l of reelListeners.current) l(m.fishing);
    });
    c.on('effect', (m) => {
      world.current?.effect(m);
      if (m.n === selfN.current && (m.kind === 'shell' || m.kind === 'water')) harbourphone.play(m.kind === 'shell' ? 'pin' : 'splash');
      if (m.kind === 'heart') harbourphone.play('bark');
      if (m.kind === 'catch') harbourphone.play(m.n === selfN.current ? (m.rarity === 'Legendary' ? 'legendary' : 'catch') : 'splash');
      if (m.kind === 'contestCast') harbourphone.play('splash');
      if (m.kind === 'contestCast' && m.n === selfN.current) toast(`${m.score} points · ${m.castsLeft} cast${m.castsLeft === 1 ? '' : 's'} left`, m.score >= 90 ? 'gold' : 'info', 2500);
    });
    c.on('chat', (m) => {
      setLog((v) => [...v.slice(-79), { id: Date.now() + Math.random(), name: m.name, text: m.text, system: m.n === 0 }]);
      if (m.n) world.current?.say(m.n, m.text);
      if (m.n && m.n !== selfN.current) harbourphone.play('chat');
    });
    c.on('appearance', (m) => {
      const a = sanitizeAppearance(m.appearance);
      setAppearance(a);
      setSettings((s) => ({ ...s, showGold: a.showGold }));
    });
    c.on('inventory', (m) => {
      setCoins((prev) => {
        if (m.coins > prev) setCoinDelta(m.coins - prev);
        return m.coins;
      });
      setInventory(m.inventory);
      if (m.stats) setStats(sanitizeStats(m.stats));
      if (m.caught) {
        setCaught(m.caught);
        clearTimeout(catchTimer.current);
        catchTimer.current = window.setTimeout(() => setCaught(null), 7000);
      }
      if (typeof m.sold === 'number' && m.sold > 0) {
        setSelling(false);
        toast(`Sold your catch for ${m.sold} gold!`, 'gold');
        harbourphone.play('coin');
        world.current?.effect({ kind: 'gold', n: selfN.current, waterX: 0, waterZ: 0, score: m.sold });
      }
      if (m.bought) {
        harbourphone.play('coin');
        if (m.bought.kind === 'bait') toast('Lucky bait on the hook.', 'success', 4000);
        else if (m.bought.kind === 'gear') toast(`${GEAR[m.bought.item as GearId]?.name ?? m.bought.item} · −${m.bought.price} gold`, 'success', 4000);
        else {
          toast(`${m.bought.item} · −${m.bought.price} gold`, 'success', 4000);
          setAppearance((a) => {
            const next = { ...a, [m.bought.kind]: m.bought.item };
            send({ type: 'appearance', appearance: next });
            return next;
          });
        }
      }
      if (m.contest) {
        setContestResult(m.contest);
        setPanel('contest');
        if (m.contest.gold > 0) {
          harbourphone.play('coin');
          toast(`Contest finished #${m.contest.rank} · +${m.contest.gold} gold`, 'gold', 6000);
          world.current?.effect({ kind: 'gold', n: selfN.current, waterX: 0, waterZ: 0, score: m.contest.gold });
        } else toast(`Contest finished #${m.contest.rank} of ${m.contest.players}`, 'info', 5000);
      }
    });
    c.on('error', (m) => {
      setSelling(false);
      if (!m?.message && reconnectAttempts.current) return; // socket-level errors during a retry are expected
      if (m?.message && /Recovery code|full/.test(m.message)) {
        reconnectAttempts.current = 4;
        hadSession.current = false;
      }
      // The character this browser remembers is gone or barred: fall back to the
      // welcome form rather than leaving them staring at a spinner.
      if (m?.message && /Recovery code not found|banned/.test(m.message)) {
        if (/not found/.test(m.message)) {
          localStorage.removeItem('reeltown-token');
          sessionStorage.removeItem('reeltown-token');
        }
        setReturning(false);
      }
      // The same character is open in another tab: continue as a fresh guest in this tab.
      if (m?.message && /already playing/.test(m.message) && !recovery) {
        sessionStorage.setItem('reeltown-token', '');
        freshGuest.current = true;
        toast('Already playing in another tab. Joining as a guest.', 'info', 6000);
        window.setTimeout(() => join(joinName), 400);
        return;
      }
      toast(m?.message || 'Could not reach the harbor. Check your connection and try again.', 'error');
    });
    c.on('notice', (m) => {
      toast(m.message, 'info');
      if (/got away|slipped/.test(m.message)) harbourphone.play('escape');
    });
    c.on('malformed', () => toast('A network message could not be read.', 'error'));
    c.on('close', () => {
      setConnecting(false);
      const wasPlaying = hadSession.current;
      // Dropped mid-game (backgrounded tab, flaky mobile radio): retry with the same recovery token.
      if (wasPlaying && !intentionalClose.current && reconnectAttempts.current < 4) {
        reconnectAttempts.current++;
        setReconnecting(true);
        toast(`Connection lost. Reconnecting (${reconnectAttempts.current}/4)…`, 'info', 4000);
        reconnectTimer.current = window.setTimeout(() => join(joinName), 1200 * reconnectAttempts.current);
      } else if (wasPlaying) {
        toast('Disconnected. Join again when ready.', 'error', 8000);
        hadSession.current = false;
        reconnectAttempts.current = 0;
      }
      intentionalClose.current = false;
      setJoined(false);
      setAdmin(null);
      setUnlimitedGold(false);
      selfN.current = 0;
      phase.current = '';
      setFishingPhase('');
      setPanel(null);
      setContest(null);
      setRun(null);
      setRunEnd(null);
      setActiveGame(null);
      setFourView(null);
      world.current?.setBusy(false);
      world.current?.setNextBuoy(-1);
      world.current?.setSelf(0);
    });
    c.connect(serverUrl(), { name: joinName, color: appearance.color, appearance, token: recovery || (freshGuest.current ? undefined : sessionStorage.getItem('reeltown-token') || localStorage.getItem('reeltown-token') || undefined) });
  }
  gameActive.current = (!!run && !GAMES.find((g) => g.id === run.game)?.free) || (!!fourView && fourView.you >= 0 && fourView.phase === 'playing');
  const nearGame = GAMES.find((g) => near.games[g.id]);
  const tablePrompt = table[0] === 2 ? (table[1] === selfN.current || table[2] === selfN.current ? 'Dockside Four · your game' : 'Dockside Four · watch the game') : table[0] === 1 ? (table[1] === selfN.current || table[2] === selfN.current ? 'Dockside Four · your table' : 'Dockside Four · one seat free') : 'Dockside Four · take a seat';
  const contestJoined = !!contest?.players.some((row) => row[0] === selfN.current);
  // While a run holds the player still, or they sit at the picnic table, the walking and
  // fishing controls do nothing, so they leave the screen; the boat keeps the joystick.
  fourSeated.current = !!fourView && fourView.you >= 0 && fourView.phase !== 'playing';
  const pinned = (!!run && run.game !== 'buoy') || (!!fourView && fourView.you >= 0);
  const canSteer = !pinned || run?.game === 'buoy';
  const primaryLabel = charging ? 'Release!' : fishingPhase === 'bite' ? 'Hook it!' : fishingPhase === 'reeling' ? 'Hold to reel' : fishingPhase === 'waiting' ? 'Waiting…' : fishingPhase === 'contest' ? 'Nice throw' : 'Cast';
  const primaryIcon = fishingPhase === 'bite' ? 'hook' : fishingPhase === 'reeling' ? 'hook' : fishingPhase === 'waiting' ? 'hourglass' : 'rod';
  const prompt = fishingPhase
    ? null
    : near.shop
      ? { icon: 'shop' as const, text: 'Bait Shop · sell your catch' }
      : near.threads && panel !== 'threads'
      ? { icon: 'hanger' as const, text: 'Threads · try on a new look' }
      : nearGame && !(panel === 'game' && activeGame === nearGame.id)
        ? { icon: nearGame.icon, text: nearGame.prompt }
        : near.four
        ? panel === 'game' && activeGame === 'four'
          ? null
          : { icon: 'grid' as const, text: tablePrompt }
        : near.board >= 0 && panel !== 'board'
        ? { icon: 'pixel' as const, text: world.current?.boards.lockOf(near.board) ? 'Drawing board · watch' : 'Drawing board · draw something' }
        : near.notice && panel !== 'notice'
        ? { icon: 'star' as const, text: 'Notice board · today’s challenges' }
        : near.garden
        ? { icon: 'sparkle' as const, text: daily && daily.garden === (1 << daily.plots) - 1 ? 'The garden is watered for today' : 'Water the garden' }
        : near.dog
        ? { icon: 'heart' as const, text: 'Pet the dog' }
        : near.contestSign && !contestJoined
          ? { icon: 'target' as const, text: contest ? 'Casting contest · join in!' : 'Casting contest · start a round' }
          : near.bench
            ? { icon: 'chair' as const, text: near.seated ? 'Stand up' : 'Take a seat' }
            : null;
  return (
    <main>
      <div ref={host} className="world" />
      <div ref={labels} className="labels" />
      <div className={`hud${chatOpen ? ' chat-open' : ''}`}>
        <header className="sign tl">
          <Icon name="cat" />
          <h1>Reel Town</h1>
        </header>
        <div className="tc">
          <Toasts toasts={toasts} onDismiss={dismiss} />
        </div>
        <div className="tr">
          {joined && (
            <>
              <button type="button" className="pill" aria-label={`${status.count} of ${status.cap} players. Show who is here`} aria-expanded={panel === 'players'} onClick={() => setPanel((p) => (p === 'players' ? null : 'players'))}>
                <Icon name="users" />
                {status.count}/{status.cap}
              </button>
              <Pill icon={weatherIcon(status.weather, status.night)} title={`${status.weather}, ${status.night ? 'night' : 'day'}`}>
                {status.weather}
              </Pill>
              <Pill icon="coin" tone="gold" title={unlimitedGold ? 'The dockkeeper never runs short' : 'Your gold'}>
                {unlimitedGold ? '∞' : coins}
                {!unlimitedGold && coinDelta > 0 && <span className="delta">+{coinDelta}</span>}
              </Pill>
              {stats.bait > 0 && (
                <Pill icon="sparkle" tone="gold" title="Lucky bait is on the hook for your next cast">
                  bait
                </Pill>
              )}
              {admin && <Button size="icon" icon="key" aria-label="Dockkeeper tools" aria-expanded={panel === 'dev'} onClick={() => setPanel((p) => (p === 'dev' ? null : 'dev'))} />}
              <Button size="icon" icon="info" aria-label="How to play" aria-expanded={panel === 'help'} onClick={() => setPanel((p) => (p === 'help' ? null : 'help'))} />
              <Button size="icon" icon="gear" aria-label="Settings" aria-expanded={panel === 'settings'} onClick={() => setPanel((p) => (p === 'settings' ? null : 'settings'))} />
            </>
          )}
        </div>
        {!joined && returning ? (
          <div className="panel join welcome-back">
            <header>
              <Icon name="fish" />
              <h2>Welcome back{name ? `, ${name}` : ''}</h2>
            </header>
            <div className="body">
              <p className="intro">This browser remembers you. Your fish, gold and outfit are where you left them.</p>
            </div>
            <footer>
              <Button tone="primary" size="big" icon="arrow" disabled={connecting} className={connecting ? 'busy' : ''} onClick={() => join()}>
                {connecting ? (reconnecting ? 'Reconnecting…' : 'Returning…') : 'Back to the harbor'}
              </Button>
              <Button onClick={forget}>Play as someone else</Button>
            </footer>
          </div>
        ) : !joined ? (
          <form
            className={`panel join${ready ? '' : ' pending'}`}
            onSubmit={(e) => {
              e.preventDefault();
              join();
            }}
          >
            <header>
              <Icon name="fish" />
              <h2>Welcome to the harbor</h2>
            </header>
            <div className="body">
              <p className="intro">Fish, wander and chat together on a tiny island. Pick a look, choose a name, and hop on the pier.</p>
              <div className="field-block">
                <label htmlFor="name">Your name</label>
                <input id="name" className="text" autoComplete="off" placeholder="Captain Whiskers" maxLength={20} required value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <CharacterEditor value={appearance} onChange={setAppearance} />
              <details className="recovery">
                <summary>Returning with a recovery code?</summary>
                <input className="text" aria-label="Recovery code" value={recovery} onChange={(e) => setRecovery(e.target.value.trim())} placeholder="Paste your recovery code" />
              </details>
            </div>
            <footer>
              <Button tone="primary" size="big" type="submit" icon="arrow" disabled={connecting} className={connecting ? 'busy' : ''}>
                {connecting ? (reconnecting ? 'Reconnecting…' : 'Sailing over…') : 'Join the harbor'}
              </Button>
            </footer>
          </form>
        ) : (
          <>
            <div className="mr">
              {panel === 'box' && <TackleBox inventory={inventory} coins={coins} stats={stats} nearShop={near.shop} onClose={() => setPanel(null)} onSell={() => setPanel('shop')} />}
              {panel === 'shop' && (
                <Shop
                  inventory={inventory}
                  coins={unlimitedGold ? Infinity : coins}
                  owned={stats.owned}
                  bait={stats.bait}
                  tab={shopTab}
                  onTab={setShopTab}
                  selling={selling}
                  onClose={() => setPanel(null)}
                  onSell={() => {
                    setSelling(true);
                    send({ type: 'sell' });
                  }}
                  onBuy={(kind, item) => send({ type: 'buy', kind, item })}
                />
              )}
              {panel === 'settings' && (
                <Settings
                  state={settings}
                  onChange={applySettings}
                  onClose={() => setPanel(null)}
                  onForget={forget}
                  canFullscreen={canFullscreen()}
                  onCopyCode={async () => {
                    try {
                      await navigator.clipboard.writeText(sessionStorage.getItem('reeltown-token') || '');
                      toast('Recovery code copied.', 'success');
                    } catch {
                      toast('Clipboard unavailable. Try again in your browser.', 'error');
                    }
                  }}
                />
              )}
              {panel === 'contest' && (
                <ContestPanel
                  state={contest}
                  selfN={selfN.current}
                  names={(n) => names.current.get(n) ?? 'Someone'}
                  nearSign={near.contestSign}
                  joined={contestJoined}
                  result={contestResult}
                  serverOffset={serverOffset.current}
                  onJoin={() => {
                    setContestResult(null);
                    send({ type: 'contest', action: 'join' });
                  }}
                  onLeave={() => send({ type: 'contest', action: 'leave' })}
                  onClose={() => setPanel(null)}
                />
              )}
              {panel === 'help' && <Help onClose={() => setPanel(null)} coarse={coarse} />}
              {panel === 'dev' && admin && (
                <DevPanel
                  state={admin}
                  selfN={selfN.current}
                  players={[...rosterRef.current.entries()].map(([n, entry]) => ({ n, name: entry.name, muted: muted.includes(n) }))}
                  onCommand={(command) => {
                    if (command.action === 'mute') setMuted((list) => (command.value ? [...list, command.target as number] : list.filter((n) => n !== command.target)));
                    send({ type: 'admin', ...command });
                  }}
                  onClose={() => setPanel(null)}
                />
              )}
              {panel === 'players' && (
                <section className="panel drawer players" aria-label="Who is here">
                  <header>
                    <Icon name="users" />
                    <h2>Who’s here</h2>
                    <Button size="icon" icon="close" aria-label="Close" onClick={() => setPanel(null)} />
                  </header>
                  <div className="body">
                    <ul className="list">
                      {[...rosterRef.current.entries()].map(([n, entry]) => (
                        <li className="row" key={n}>
                          <span className="avatarchip">{entry.species.slice(0, 1).toUpperCase()}</span>
                          <span className="name">
                            {entry.name}
                            <span className="meta">{n === selfN.current ? 'you' : entry.species}</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                    <p className="muted" style={{ marginTop: 10 }}>
                      {status.cap - status.count} of {status.cap} spots free. Press Enter to say hello.
                    </p>
                  </div>
                </section>
              )}
              {panel === 'notice' && <NoticeBoard challenges={challenges} daily={daily} onClose={() => setPanel(null)} />}
              {panel === 'board' && board >= 0 && world.current && (
                <DrawingBoard
                  board={board}
                  strokes={world.current.boards.strokesOf(board)}
                  version={boardVersion}
                  lock={world.current.boards.lockOf(board)}
                  selfN={selfN.current}
                  selfTag={authorTag(selfId.current)}
                  holderName={names.current.get(world.current.boards.lockOf(board)) ?? null}
                  send={send}
                  onClose={() => setPanel(null)}
                />
              )}
              {panel === 'game' && activeGame && (
                <GameHost
                  game={activeGame}
                  run={run && run.game === activeGame ? run : null}
                  end={runEnd && runEnd.game === activeGame ? runEnd : null}
                  best={activeGame === 'four' ? stats.games.four?.wins ?? 0 : stats.games[activeGame]?.best ?? 0}
                  near={activeGame === 'four' ? near.four : !!near.games[activeGame]}
                  coarse={coarse}
                  serverOffset={serverOffset.current}
                  fourView={fourView}
                  coins={coins}
                  setBusy={(busy) => world.current?.setBusy(busy)}
                  send={send}
                  subscribe={(fn) => {
                    gameListeners.current.add(fn);
                    return () => gameListeners.current.delete(fn);
                  }}
                  onClose={() => {
                    setPanel(null);
                    setRunEnd(null);
                    if (activeGame === 'four') setFourView(null);
                  }}
                />
              )}
              {panel === 'threads' && (
                <Threads
                  appearance={appearance}
                  owned={stats.owned}
                  coins={unlimitedGold ? Infinity : coins}
                  onChange={setAppearance}
                  onBuy={(kind, item) => send({ type: 'buy', kind, item })}
                  onSave={() => {
                    send({ type: 'appearance', appearance });
                    setPanel(null);
                    toast('Your new look is saved.', 'success', 3000);
                  }}
                  onClose={() => setPanel(null)}
                />
              )}
              {fishingPhase === 'reeling' && reelStart && panel === null && (
                <Reel
                  initial={reelStart}
                  subscribe={(fn) => {
                    reelListeners.current.add(fn);
                    return () => reelListeners.current.delete(fn);
                  }}
                  held={held}
                  onHold={hold}
                  onCancel={() => {
                    hold(false);
                    send({ type: 'cancel' });
                  }}
                />
              )}
            </div>
            {caught && (
              <div className="mc">
                <CatchCard caught={caught} onClose={() => setCaught(null)} />
              </div>
            )}
            <div className="bl">
              <Chat log={log} inputRef={chatInput} compact={coarse} onOpenChange={onChatOpenChange} onSend={(text) => send({ type: 'chat', text })} onFocusChange={(focused) => {
                chatFocused.current = focused;
                if (focused) {
                  keys.current.clear();
                  pushInput();
                }
              }} />
              <div style={{ height: 8 }} />
              {canSteer && (
              <Joystick
                onChange={(dx, dz) => {
                  stick.current.dx = dx;
                  stick.current.dz = dz;
                  pushInput();
                }}
              />
              )}
            </div>
            <div className="bc">
              {run && panel !== 'game' && run.game === 'buoy' && (
                <RunPill
                  run={run}
                  subscribe={(fn) => {
                    gameListeners.current.add(fn);
                    return () => gameListeners.current.delete(fn);
                  }}
                  onOpen={() => {
                    setActiveGame(run.game);
                    setPanel('game');
                  }}
                />
              )}
              {prompt ? (
                <button type="button" className="prompt" onClick={interact}>
                  <Icon name={prompt.icon} />
                  <span className="text">{prompt.text}</span>
                  {!coarse && <kbd>E</kbd>}
                </button>
              ) : null}
            </div>
            <div className="br">
              {emotesOpen && (
                <div className="emotes" role="group" aria-label="Emotes">
                  <Button size="icon" icon="wave" aria-label="Wave" onClick={() => emote('wave')} />
                  <Button size="icon" icon="heart" aria-label="Heart" onClick={() => emote('heart')} />
                  <Button size="icon" icon="music" aria-label="Dance" onClick={() => emote('dance')} />
                  <Button size="icon" icon="chair" aria-label="Sit" onClick={() => emote('sit')} />
                </div>
              )}
              {!pinned && (
              <div className="actions">
                <div className="stack">
                  <Button icon="wave" aria-label="Emotes" aria-expanded={emotesOpen} onClick={() => setEmotesOpen((v) => !v)}>
                    <span className="label">Emotes</span>
                  </Button>
                  <Button icon="box" aria-label={`Tackle box, ${inventory.length} fish`} onClick={() => setPanel((p) => (p === 'box' ? null : 'box'))}>
                    <span className="label">Tackle box</span>
                    {inventory.length > 0 && <span className="badge">{inventory.length}</span>}
                  </Button>
                </div>
                <div className="action-primary">
                  {charging && (
                    <div className="meter" aria-label="Cast power">
                      <div className="sweet" />
                      <div className="fill" ref={meterFill} />
                    </div>
                  )}
                  <Button
                    tone="primary"
                    size="big"
                    icon={primaryIcon}
                    className={fishingPhase === 'bite' ? 'pressed' : ''}
                    style={fishingPhase === 'bite' ? { animation: 'pulse 0.4s ease-in-out infinite' } : undefined}
                    disabled={fishingPhase === 'waiting' || fishingPhase === 'contest'}
                    onPointerDown={(e) => {
                      e.preventDefault();
                      e.currentTarget.setPointerCapture(e.pointerId);
                      primaryDown();
                    }}
                    onPointerUp={primaryUp}
                    onPointerCancel={primaryUp}
                    onKeyDown={(e) => {
                      if ((e.code === 'Space' || e.code === 'Enter') && !e.repeat) primaryDown();
                    }}
                    onKeyUp={(e) => {
                      if (e.code === 'Space' || e.code === 'Enter') primaryUp();
                    }}
                  >
                    {primaryLabel}
                  </Button>
                </div>
              </div>
              )}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
