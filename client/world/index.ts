import { DirectionalLight, HemisphereLight, PCFShadowMap, PointLight, Scene, Vector3, WebGLRenderer } from 'three';
import { createSplashes } from '../splashes';
import { disposeAvatarCaches, setLanternGlow } from '../avatar';
import { buildEnvironment } from './environment';
import { CameraRig } from './camera';
import { PlayerEntity, viewpoint } from './entities';
import { createProps } from './props';
import { createBoards } from './boards';
import { AdaptiveQuality, detectQuality, presets, type QualityLevel } from './quality';
import { createSky } from './sky';
import { setFogHole } from './foghole';
import { createWater } from './water';
import { ClockSync } from '../../packages/shared/interpolation';
import { castLanding } from '../../packages/shared/game';
import { DRAWING_BOARDS, SPAWN, groundHeight, props as layoutProps } from '../../packages/shared/layout';
import { CONTEST_SIGN, SHOP_DOOR, SORTING_CRATES, THREADS_DOOR } from './places';
import { LANDMARKS, LANDMARK_IDS, type LandmarkId } from '../../packages/shared/landmarks';
import { MOVE, speedOf, type MoveCommand } from '../../packages/shared/movement';
import { Predictor } from '../../packages/shared/prediction';
import { ROW, type ContestState, type PlayerRow, type RosterEntry, type TableState } from '../../packages/shared/protocol';
export type SnapshotMessage = { st: number; count: number; cap: number; players: PlayerRow[]; time: number; weather: string; contest?: ContestState; tables?: TableState[] };
export type YouMessage = { st: number; ack: number; x: number; z: number; vx: number; vz: number; heading: number; mode?: 'walk' | 'boat'; fishing: { phase: string } | null };
export type WorldEffect = { kind: string; n: number; waterX: number; waterZ: number; fish?: string; perfect?: boolean; rarity?: string; score?: number; castsLeft?: number };
export type WorldOptions = {
  onCommand: (command: MoveCommand) => void;
  onQuality?: (level: QualityLevel, auto: boolean) => void;
};
const projected = new Vector3();
const POPUP_POOL = 14;
import { model } from './models';
export { preloadModels } from './models';
export { ASSET_NAMES as MODEL_NAMES } from './models';
export function createWorld(host: HTMLElement, labels: HTMLElement, options: WorldOptions) {
  const scene = new Scene();
  const renderer = new WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
  renderer.shadowMap.type = PCFShadowMap;
  host.appendChild(renderer.domElement);
  const rig = new CameraRig(host);
  const hemi = new HemisphereLight(0xfff0c5, 0x54775f, 2.4);
  scene.add(hemi);
  const sun = new DirectionalLight(0xffdd9a, 2.3);
  sun.position.set(-20, 35, 10);
  sun.shadow.camera.left = sun.shadow.camera.bottom = -26;
  sun.shadow.camera.right = sun.shadow.camera.top = 30;
  sun.shadow.camera.near = 5;
  sun.shadow.camera.far = 130;
  sun.shadow.bias = -0.0015;
  sun.shadow.normalBias = 0.02;
  scene.add(sun);
  scene.add(sun.target);
  // The light of your own hand lantern, if you carry one. Other players' lanterns glow
  // without casting light, which keeps the low preset to no point lights at all.
  const lanternLight = new PointLight('#ffb85c', 0, 9, 1.6);
  lanternLight.visible = false;
  scene.add(lanternLight);
  const detected = detectQuality();
  let settings = presets[detected];
  const environment = buildEnvironment(settings.terrain);
  scene.add(environment.group);
  let water = createWater(settings.waterSegments);
  scene.add(water.mesh);
  const sky = createSky(scene, sun, hemi, settings.lanternLights, settings.rainDrops);
  const props = createProps(scene, settings.grass);
  const boards = createBoards(scene);
  const splashes = createSplashes(scene);
  const entities = new Map<number, PlayerEntity>();
  const roster = new Map<number, RosterEntry>();
  const predictor = new Predictor({ x: SPAWN.x, z: SPAWN.z, heading: Math.PI });
  const clock = new ClockSync(100);
  let self = 0,
    frame = 0,
    crisp = false,
    frozenUntil = 0,
    selfFishing = false,
    selfSitting = false,
    // A panel game has the keyboard: walking input is ignored until it ends.
    busy = false,
    accumulator = 0,
    lastFrame = performance.now(),
    elapsed = 0,
    firstFrame = true,
    frameMs = 16,
    predictionError = 0,
    contest: ContestState = null,
    tables: TableState[] = [],
    pinX = 0,
    pinZ = 0,
    pinVisible = false,
    overrideTime: number | null = null,
    overrideWeather: string | null = null,
    previewPower = -1,
    previewAim = 0;
  const input = { dx: 0, dz: 0 },
    axes = { dx: 0, dz: 0 };
  // Floating text popups (scores, gold, perfect catches) pooled in the label layer.
  const popups = Array.from({ length: POPUP_POOL }, () => {
    const el = document.createElement('div');
    el.className = 'popup';
    el.hidden = true;
    labels.appendChild(el);
    return { el, x: 0, y: 0, z: 0, until: 0 };
  });
  let popupCursor = 0;
  function popup(x: number, y: number, z: number, text: string, tone = '') {
    const p = popups[popupCursor];
    popupCursor = (popupCursor + 1) % POPUP_POOL;
    p.x = x;
    p.y = y;
    p.z = z;
    p.until = performance.now() + 1600;
    p.el.textContent = text;
    p.el.className = `popup ${tone}`;
    p.el.hidden = false;
    // Restart the CSS animation.
    p.el.style.animation = 'none';
    void p.el.offsetWidth;
    p.el.style.animation = '';
  }
  function applyQuality(level: QualityLevel) {
    const shadowsChanged = settings.shadows !== presets[level].shadows;
    settings = presets[level];
    renderer.shadowMap.enabled = settings.shadows;
    sun.castShadow = settings.shadows;
    if (settings.shadows && sun.shadow.mapSize.x !== settings.shadowMapSize) {
      sun.shadow.mapSize.set(settings.shadowMapSize, settings.shadowMapSize);
      sun.shadow.map?.dispose();
      sun.shadow.map = null;
    }
    if (water.geometry.parameters.widthSegments !== settings.waterSegments) {
      scene.remove(water.mesh);
      water.dispose();
      water = createWater(settings.waterSegments);
      scene.add(water.mesh);
    }
    sky.setRain(settings.rainDrops);
    sky.setLanternLights(settings.lanternLights);
    // Shader programs only need rebuilding when shadow support toggles; avoid a compile hitch otherwise.
    if (shadowsChanged)
      scene.traverse((o) => {
        const material = (o as { material?: { needsUpdate: boolean } }).material;
        if (material) material.needsUpdate = true;
      });
    resize();
    options.onQuality?.(level, adaptive.auto);
  }
  const adaptive = new AdaptiveQuality(detected, detected, applyQuality);
  function resize() {
    const w = host.clientWidth || 1,
      h = host.clientHeight || 1;
    if (crisp) {
      renderer.setPixelRatio(Math.min(devicePixelRatio || 1, settings.maxPixelRatio));
      renderer.setSize(w, h, false);
    } else {
      renderer.setPixelRatio(1);
      // A fraction of the canvas, not a fixed number of pixels: a narrow window or a
      // zoomed-in page used to fall under the cap and lose the effect entirely.
      const width = Math.max(240, Math.min(settings.retroWidth, Math.round(w / settings.retroScale)));
      renderer.setSize(width, Math.max(1, Math.round((width * h) / w)), false);
    }
    rig.resize(w / h);
  }
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  applyQuality(detected);
  function entityFor(n: number) {
    let e = entities.get(n);
    if (!e) {
      e = new PlayerEntity(n, roster.get(n), labels);
      scene.add(e.model.group);
      entities.set(n, e);
    }
    return e;
  }
  function removeEntity(n: number) {
    const e = entities.get(n);
    if (!e) return;
    e.dispose();
    entities.delete(n);
  }
  const seen = new Set<number>();
  const api = {
    setSelf(n: number) {
      self = n;
      firstFrame = true;
    },
    applyRoster(message: { full?: boolean; add?: RosterEntry[]; remove?: number[] }) {
      if (message.full) roster.clear();
      for (const entry of message.add || []) {
        roster.set(entry.n, entry);
        entities.get(entry.n)?.applyRoster(entry);
      }
      for (const n of message.remove || []) {
        roster.delete(n);
        removeEntity(n);
      }
    },
    applySnapshot(message: SnapshotMessage) {
      const now = performance.now();
      clock.observe(message.st, now);
      sky.set(overrideTime ?? message.time, overrideWeather ?? message.weather);
      contest = message.contest ?? null;
      tables = message.tables ?? [];
      seen.clear();
      for (const row of message.players) {
        const n = row[ROW.n];
        seen.add(n);
        const e = entityFor(n);
        e.applyRow(row, message.st, now, n === self);
        if (n === self) {
          selfFishing = row[ROW.fishPhase] !== 0;
          selfSitting = row[ROW.emote] === 4;
        }
      }
      for (const n of entities.keys()) if (!seen.has(n)) removeEntity(n);
    },
    applyYou(message: YouMessage) {
      selfFishing = !!message.fishing;
      const own = entities.get(self);
      if (own && message.fishing && 'progress' in message.fishing) own.tension = (message.fishing as { progress: number }).progress;
      predictionError = predictor.reconcile(message.ack, message, selfFishing || busy);
    },
    say(n: number, text: string) {
      entities.get(n)?.say(text, performance.now());
    },
    effect(event: WorldEffect) {
      const e = entities.get(event.n);
      if (event.kind === 'catch') {
        const rare = event.rarity === 'Rare' || event.rarity === 'Legendary';
        splashes.burst(event.waterX, event.waterZ, true);
        if (rare) splashes.sparkle(event.waterX, event.waterZ, event.rarity === 'Legendary' ? 48 : 24);
        if (e) {
          e.celebrate(elapsed, event.waterX, event.waterZ, !!event.perfect, event.fish);
          popup(e.model.group.position.x, e.model.group.position.y + 2.2, e.model.group.position.z, event.perfect ? 'Perfect!' : 'Caught!', event.perfect ? 'gold' : '');
        }
      } else if (event.kind === 'contestCast') {
        splashes.burst(event.waterX, event.waterZ);
        popup(event.waterX, 0.6, event.waterZ, `${event.score ?? 0}`, (event.score ?? 0) >= 90 ? 'gold' : '');
        if (e) {
          e.waterX = event.waterX;
          e.waterZ = event.waterZ;
        }
      } else if (event.kind === 'pin') {
        splashes.sparkle(event.waterX, event.waterZ, 36);
        popup(event.waterX, 2.4 + groundHeight(event.waterX, event.waterZ), event.waterZ, `+${event.score ?? 0} gold`, 'gold');
      } else if (event.kind === 'shell') {
        splashes.sparkle(event.waterX, event.waterZ, 20);
        popup(event.waterX, 1.6 + groundHeight(event.waterX, event.waterZ), event.waterZ, `${event.fish ?? 'Shell'} · +${event.score ?? 0}`, 'gold');
      } else if (event.kind === 'water') {
        splashes.burst(event.waterX, event.waterZ);
        popup(event.waterX, 1.8 + groundHeight(event.waterX, event.waterZ), event.waterZ, `Watered · +${event.score ?? 0}`, 'gold');
      } else if (event.kind === 'heart') {
        props.petDog(elapsed);
        if (e) popup(e.model.group.position.x, e.model.group.position.y + 2.4, e.model.group.position.z, '♥', 'gold');
      } else if (event.kind === 'bite' && e) popup(e.model.group.position.x, e.model.group.position.y + 2.4, e.model.group.position.z, '!', 'gold');
      else if (event.kind === 'gold' && e) popup(e.model.group.position.x, e.model.group.position.y + 2.2, e.model.group.position.z, `+${event.score ?? 0} gold`, 'gold');
    },
    // Raw screen-space axes from keyboard or touch; rotated into world space at each fixed tick.
    setInput(dx: number, dz: number) {
      input.dx = dx;
      input.dz = dz;
    },
    freeze(ms: number) {
      frozenUntil = performance.now() + ms;
    },
    selfPosition() {
      return predictor.state;
    },
    // A loaded asset, for inspection.
    asset(name: string) {
      return model(name);
    },
    // What the player is doing with their hands, as the server last said.
    selfEmote() {
      return entities.get(self)?.emote ?? '';
    },
    // Distances used by the HUD to show contextual prompts: one per landmark, plus benches and the pin.
    nearby() {
      const s = predictor.state;
      let bench = Infinity;
      for (const b of layoutProps.benches) bench = Math.min(bench, Math.hypot(s.x - b.x, s.z - b.z));
      const distances = {} as Record<LandmarkId, number>;
      for (const id of LANDMARK_IDS) distances[id] = Math.hypot(s.x - LANDMARKS[id].x, s.z - LANDMARKS[id].z);
      // The nearest drawing board, and how far it is.
      let board = -1,
        boardDistance = Infinity;
      DRAWING_BOARDS.forEach((b, i) => {
        const d = Math.hypot(s.x - b.x, s.z - b.z);
        if (d < boardDistance) {
          boardDistance = d;
          board = i;
        }
      });
      return {
        ...distances,
        board,
        boardDistance,
        shop: Math.hypot(s.x - SHOP_DOOR.x, s.z - SHOP_DOOR.z),
        threads: Math.hypot(s.x - THREADS_DOOR.x, s.z - THREADS_DOOR.z),
        contestSign: Math.hypot(s.x - CONTEST_SIGN.x, s.z - CONTEST_SIGN.z),
        sorting: Math.hypot(s.x - SORTING_CRATES.x, s.z - SORTING_CRATES.z),
        bench,
        pin: pinVisible ? Math.hypot(s.x - pinX, s.z - pinZ) : Infinity,
      };
    },
    setBusy(value: boolean) {
      busy = value;
    },
    boards,
    setPin(x: number, z: number, visible: boolean) {
      pinX = x;
      pinZ = z;
      pinVisible = visible;
      props.setPin(x, z, visible);
    },
    // Shows where a charging cast would land; power < 0 hides it.
    setCastPreview(power: number, aim: number) {
      previewPower = power;
      previewAim = aim;
    },
    contest() {
      return contest;
    },
    tables() {
      return tables;
    },
    setNextBuoy(index: number) {
      props.setNextBuoy(index);
    },
    setShells(spots: Array<{ i: number; x: number; z: number; type: number }>, collected: number) {
      props.setShells(spots, collected);
    },
    setWatered(mask: number) {
      props.setWatered(mask);
    },
    // QA hook: force a time of day and weather regardless of the server.
    override(time: number | null, weather: string | null) {
      overrideTime = time;
      overrideWeather = weather;
      if (time !== null || weather !== null) sky.set(time ?? 0.5, weather ?? 'clear');
    },
    setCrisp(value: boolean) {
      crisp = value;
      resize();
    },
    setQuality(level: QualityLevel | 'auto') {
      adaptive.setManual(level, detected);
    },
    quality() {
      return { level: adaptive.level, auto: adaptive.auto, detected };
    },
    stats() {
      return {
        drawCalls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
        programs: renderer.info.programs?.length ?? 0,
        geometries: renderer.info.memory.geometries,
        textures: renderer.info.memory.textures,
        entities: entities.size,
        frameMs: +frameMs.toFixed(2),
        averageFrameMs: +adaptive.averageFrameMs.toFixed(2),
        quality: adaptive.level,
        renderDelayMs: +clock.renderDelay().toFixed(1),
        snapshotIntervalMs: +clock.intervalMs.toFixed(1),
        jitterMs: +clock.jitterMs.toFixed(1),
        predictionError: +predictionError.toFixed(4),
        pendingCommands: predictor.pending.length,
        time: sky.atmosphere.night,
        fog: +sky.atmosphere.fog.toFixed(3),
        beamClear: +sky.atmosphere.beamClear.toFixed(3),
        fogFar: +sky.atmosphere.fogFar.toFixed(1),
      };
    },
    dispose() {
      cancelAnimationFrame(frame);
      observer.disconnect();
      rig.dispose();
      splashes.dispose();
      for (const e of entities.values()) e.dispose();
      entities.clear();
      environment.dispose();
      boards.dispose();
      water.dispose();
      sky.dispose();
      props.dispose();
      disposeAvatarCaches();
      renderer.dispose();
      renderer.domElement.remove();
      labels.replaceChildren();
    },
  };
  function tickInput() {
    const now = performance.now();
    // Sitting is not a freeze: the first step stands you up, so input goes through.
    const frozen = selfFishing || busy || now < frozenUntil || previewPower >= 0;
    rig.worldAxes(input.dx, input.dz, axes);
    const command = predictor.tick(axes.dx, axes.dz, frozen);
    if (command) options.onCommand(command);
  }
  function animate(now: number) {
    frame = requestAnimationFrame(animate);
    const rawDt = (now - lastFrame) / 1000;
    lastFrame = now;
    frameMs = rawDt * 1000;
    adaptive.update(frameMs);
    const dt = Math.min(rawDt, 0.1);
    elapsed += dt;
    if (self) {
      accumulator = Math.min(accumulator + dt, MOVE.dt * 4);
      while (accumulator >= MOVE.dt) {
        accumulator -= MOVE.dt;
        tickInput();
      }
      predictor.relax(dt);
    }
    const alpha = accumulator / MOVE.dt;
    const renderTime = clock.renderTime(now);
    viewpoint.copy(rig.camera.position);
    const own = entities.get(self);
    let focusX = SPAWN.x,
      focusZ = SPAWN.z;
    if (own) {
      focusX = predictor.renderX(alpha);
      focusZ = predictor.renderZ(alpha);
      const speed = Math.min(1, speedOf(predictor.state) / MOVE.speed);
      rig.update(dt, focusX, focusZ, predictor.state.vx, predictor.state.vz, firstFrame);
      firstFrame = false;
      own.boating = predictor.state.mode === 'boat';
      props.setMooredVisible(!own.boating);
      own.update(dt, elapsed, focusX, focusZ, predictor.state.heading, speed, splashes, settings.shadows);
    } else rig.update(dt, SPAWN.x, SPAWN.z, 0, 0, firstFrame);
    for (const e of entities.values()) {
      if (e === own) continue;
      if (e.interpolator.sample(renderTime, e.pose)) e.update(dt, elapsed, e.pose.x, e.pose.z, e.pose.heading, Math.min(1, e.pose.speed / MOVE.speed), splashes, settings.shadows);
    }
    const carrying = !!own && own.appearance.accessory === 'lantern';
    sky.update(dt, elapsed, focusX, focusZ, rig.camera.position, carrying);
    const a = sky.atmosphere;
    // The beam's sweep and a hand lantern open the fog in a bubble around you alone.
    rig.camera.updateMatrixWorld();
    setFogHole(focusX, 1, focusZ, 13, Math.max(a.beamClear * 0.9, a.lanternClear * 0.55) * a.fog, rig.camera);
    setLanternGlow(0.3 + a.night * 1.4 + a.fog * 0.8);
    lanternLight.visible = carrying && settings.lanternLights > 0 && a.night + a.fog > 0.05;
    if (lanternLight.visible && own) {
      lanternLight.position.set(own.model.group.position.x - 0.4, own.model.group.position.y + 0.7, own.model.group.position.z + 0.2);
      lanternLight.intensity = (a.night * 0.7 + a.fog * 0.5) * 18;
    }
    water.update(elapsed, a.shallow, a.deep, a.horizon, a.sun, a.sunDir, a.rain, a.night);
    props.update(dt, elapsed, a.night, a.fog, a.beamSweep);
    props.setTarget(contest?.target[0] ?? 0, contest?.target[1] ?? 0, !!contest && contest.phase !== 'lobby');
    if (previewPower >= 0 && own) {
      const playing = contest?.phase === 'active' && contest.players.some((row) => row[0] === self);
      const landing = castLanding(predictor.state.x, predictor.state.z, previewPower, previewAim, playing ? true : undefined);
      props.setPreview(landing.x, landing.z, true);
    } else props.setPreview(0, 0, false);
    const w = host.clientWidth,
      h = host.clientHeight,
      nowMs = performance.now();
    for (const e of entities.values()) {
      if (e.escapeUntil && e.escapeUntil > nowMs - 50 && e.escapeUntil <= nowMs + 1200 && !e.escapeShown) {
        e.escapeShown = true;
        splashes.burst(e.waterX, e.waterZ);
        popup(e.waterX, 0.6, e.waterZ, 'Got away…', '');
      }
      if (e.escapeUntil && e.escapeUntil <= nowMs) {
        e.escapeUntil = 0;
        e.escapeShown = false;
      }
      projected.copy(e.model.group.position);
      projected.y += 2.7;
      projected.project(rig.camera);
      const visible = projected.z < 1;
      e.label.style.transform = `translate3d(${((projected.x * 0.5 + 0.5) * w).toFixed(1)}px, ${((-projected.y * 0.5 + 0.5) * h).toFixed(1)}px, 0) translate(-50%, -100%)`;
      if (e.label.hidden === visible) e.label.hidden = !visible;
      e.updateLabel(e.n === self, nowMs);
    }
    for (const p of popups) {
      if (p.el.hidden) continue;
      if (p.until <= nowMs) {
        p.el.hidden = true;
        continue;
      }
      projected.set(p.x, p.y, p.z).project(rig.camera);
      p.el.style.transform = `translate3d(${((projected.x * 0.5 + 0.5) * w).toFixed(1)}px, ${((-projected.y * 0.5 + 0.5) * h).toFixed(1)}px, 0) translate(-50%, -100%)`;
    }
    splashes.update(dt);
    renderer.render(scene, rig.camera);
  }
  frame = requestAnimationFrame(animate);
  return api;
}
export type World = ReturnType<typeof createWorld>;
