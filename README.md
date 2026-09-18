# Reel Town

A cozy multiplayer fishing island in the browser: a low-poly island about three times the size of the original harbour, with a plaza of community drawing boards, a bait shop and a wardrobe shop, a fishing pond, an orchard and garden, a picnic clearing, tide pools and a lighthouse lookout; animal villagers, Stardew-style reeling, a day/night and weather cycle, and seven Club Penguin-style pickup games. Server-authoritative, twelve players per harbor on the small profile.

## Live deployment

- Client: https://ali-rafiei.github.io/reel-town/ (GitHub Pages deployment of `dist/client`)
- The multiplayer endpoint is injected by the deployment workflow from a GitHub repository variable.

## What players get

- **Movement that feels immediate.** Client-side prediction with authoritative reconciliation, acceleration and deceleration, sliding along the shore, pier rails and props, a follow camera with look-ahead, orbit inertia and pinch zoom; keyboard, arrows and a touch joystick.
- **Living characters.** Nine animals, hats, outfits, accessories, and four colours to dress them in — the garment, the shirt under it, every accent on it (or the accents as painted) and a plain-cloth hat; an animation state machine (idle, walk, cast, wait, bite, reel, catch, wave, heart, dance, sit) with eased transitions and spring-driven ears, tails and hats. Remote players animate from synchronized state.
- **A pier worth standing on.** A boardwalk runs from the plaza across the sand and out over the water, opening into a wide crossbar with room for a dozen anglers, a lantern at each outer corner and gulls wheeling overhead by day.
- **An island to wander.** A star-shaped coast with a bay and a lobe, gentle hills, sand paths between the zones from the concept map: home and its fenced garden, the plaza with five drawing boards and a notice board, Threads the wardrobe shop, a pond with a plank dock, the orchard and three garden beds, the picnic clearing with its campfire, the tide pools, the railed lookout under the lighthouse, and a buoy course nine units off the coast.
- **A harbor with weather.** The server's 40-minute day and 15-minute weather rotation are rendered: sky, sun, stars, clouds, rain, fog, lantern glow at night, shader water with foam and glints, boat, smoke, fish shadows and swaying grass.
- **Fishing with depth.** Charged, aimed casts with a landing preview; 30 species across four rarities with reel personalities; bounded weather, night and distance modifiers; perfect catches worth double; a catch card with discoveries and personal bests; selling at the Bait Shop; a 30-species guide and records.
- **Things to do together.** Casting contest at the pier sign (three casts at a floating target, ranked results, gold); six pickup games with the same start, play, results and replay flow: Sort the Catch at the crates (90-second ramping conveyor), Orchard Catch (a basket under falling fruit), Tidepool Tidy (litter into bins, creatures left alone), Lighthouse Signals (repeat the lamp sequence), the Buoy Run (a real rowboat round eight buoys anticlockwise from the pier, a beam of light on the next one, visible to everyone) and Dockside Four (two-player four in a row with a Dockkeeper to play when alone). Five drawing boards in the plaza that sync through the server, where whoever holds the chalk can rub out any line or wipe the board. Shells to find, a garden to water, a dog to pet, three rotating daily challenges on the notice board, a daily harbor pin, benches and picnic seats, emotes and proximity chat.
- **A wardrobe and tackle worth earning.** Threads sells hats, clothes and accessories, including a hand lantern that lights the fog around you, and three pieces are earned by feats rather than bought. Each animal has its own coat colours. The Bait Shop sells rod, line and reel upgrades that ease every reel and a one-cast lucky bait that tilts the odds toward rare fish.
- **A cohesive interface.** Notice-board panels, pills, contextual prompts, onboarding tips, toasts, drawer panels, settings for graphics quality, crisp pixels, reduced motion, large text and public gold, recovery codes, and layouts for phones, tablets, landscape and ultrawide screens.

## Architecture

Browser (static GitHub Pages export) → WSS / Caddy → Node 22 WebSocket service → SQLite (WAL).

| Path | Role |
|---|---|
| `app/page.tsx`, `app/ui/*`, `app/games/*` | React HUD: panels, toasts, joystick, catch card, contest, the minigame shell and each game's board, drawing board, notice board, Threads |
| `app/globals.css` | Design system: tokens, HUD regions, components, responsive and accessibility rules |
| `client/world/*` | Three.js world: displaced polar terrain and buildings in one mesh, sky/weather, water shader with the shared shoreline, props (boat, dog, buoys, shells, lamps), drawing board faces, entities, camera, quality presets |
| `client/animation.ts`, `client/avatar.ts` | Character animator with pose blending and springs; batched avatar builder |
| `client/connection.ts`, `client/Reel.tsx`, `client/preview.ts` | WebSocket session, reel panel, wardrobe turntable |
| `packages/shared/*` | Deterministic simulation shared by client and server: island layout (shoreline, elevation, zones, landmarks), movement with a boat mode, prediction, interpolation, protocol, fish tables and reel modifiers, gear and cosmetics, game identity and rewards, boards, activities, challenges, stats |
| `server/src/index.ts` | Authoritative service: join, commands, fishing, selling, contest and sorting messages, snapshots |
| `server/src/minigames/*` | Casting contest; the `SoloRun`/`ConveyorRun` bases and the seven games; the Dockside Four table |
| `server/src/boards.ts`, `activities.ts`, `feats.ts`, `pins.ts` | Drawing boards, shells/garden/dog, earned cosmetics, daily pin |
| `server/src/db.ts`, `snapshots.ts`, `commands.ts`, `player.ts` | Migrations (4: strokes table) and stores, compact snapshot encoding, command rate limiting, player model |
| `tools/models/*.py` | Blender build of every 3D asset: a kit of metaball and primitive helpers in game coordinates, the nine animals as rigged parts with colour roles, the island's props and cosmetics; `blender -b -P tools/models/build.py -- public/models [names…] [--preview dir]` |
| `public/models/*.glb` | The built assets the client loads before the world is made; `client/world/models.ts` parses them, bakes roles into vertex colours and merges parts |
| `public/fish/*.png` | The thirty fish, cut out of the concept sheet: the guide, bag, conveyor, catch card and the held-up prize all show these paintings. |
| `public/art/<sheet>/*.png` | The painted art pack (`client/art.ts` names them): UI icons, minigame pieces, shells and litter, tackle, cosmetic thumbnails, species portraits, and the cards the world shows through `client/world/sprites.ts` |
| `scripts/*.test.mjs` | 108 deterministic tests; `load-test.mjs`, `fishing-proof.mjs` and `games-proof.mjs` exercise a live server; `make-icons.py` builds the app icons |
| `deploy/` | Provisioning, Caddy, systemd unit, redeploy and backup scripts |

### Protocol 2

Client → server messages are JSON: `join {protocol: 2, name, appearance, token}`, `move {seq, dx, dz}` at 30 Hz while moving, `cast {power, aim}`, `hook`, `cancel`, `reelInput {held}`, `sell`, `buy {kind, item}` (cosmetics, gear, bait), `chat`, `emote`, `appearance`, `contest {action}`, `game {game, action: start | quit | input, runId, …}` for every pickup game (Dockside Four uses `sit | solo | drop | leave | rematch | watch`), `board {board, action: get | lock | unlock | stroke | erase | clear}`, `activity {action: water | pet}`, `admin`. The old `sort` message is still accepted and rewritten into the `game` envelope. Every field is validated; movement is executed through a per-player token bucket (30 commands/s plus a burst of 8) so a flooding client is corrected rather than accelerated; other messages share a 40/s budget, and strokes have their own 5/s.

Server → client messages are MessagePack: `welcome` (session number `n`, recovery token, coins, inventory, stats, pin, today's shells and chores, challenges), `roster`, `snapshot` (shared, encoded once per tick: integer rows per player including a movement mode column, world time/weather, contest state, the picnic table's occupancy), `you` (private: acknowledged sequence, authoritative position and mode, reel state with the player's tackle modifiers), `effect`, `chat`, `inventory`, `game {game, event: start | update | end}`, `board {event: state | stroke | erase | lock}`, `daily`, `challenges`, `pin`, `notice`, `error`. Clients that join without `protocol: 2` receive the legacy snapshot shape; the mode column is appended so a protocol-2 client published before boats ignores it.

### Economy bounds

Fish sell for 12–1000 gold (perfect catches double); cosmetics cost 60–320 gold once, three are earned by feats, gear costs 250–800 once and lucky bait 90 per cast. Contest rewards are at most 30 gold per round and eight rewarded rounds per hour per player. Every pickup game pays score over a divisor, capped per run (8–40 gold) and per rolling hour (6–8 rewarded runs), from one table in `packages/shared/games.ts`. Shells pay 5, a watering 3, the dog 5, a challenge 20, the daily pin 15, each once a day. Rarity multipliers from weather, night and distance are capped per rarity so legendaries stay under 8% of catches even in ideal conditions; lucky bait raises the cap for one cast and legendaries still stay under 20%.

## Development

Install client dependencies with `npm ci` and server dependencies with `npm ci --prefix server`.

```sh
npm run build --prefix server                       # compiles server and shared packages
node --test scripts/*.test.mjs                       # 108 tests
npx tsc --noEmit                                    # client and shared type check
npm run build                                       # static client export in dist/client
DB_PATH=/tmp/reeltown-dev.sqlite PORT=3001 node server/dist/server/src/index.js
```

`npm run dev` points the client at the live VM. For local play, open the built client (or dev server) on localhost and set `localStorage.reeltown-server = 'ws://127.0.0.1:3001'` once; the override is honoured only on localhost. Appending `?perf` to the URL exposes `window.__reeltown` with `stats()` (draw calls, frame time, quality, interpolation delay, prediction error) and `override(time, weather)` for visual QA.

Live checks: `node scripts/load-test.mjs wss://host 12 30` (occupies all slots; run when real players are absent), `node scripts/fishing-proof.mjs wss://host`, and `node scripts/games-proof.mjs wss://host [db path]` (a run settles once however it ends, a disconnect pays nothing; with a local database path it also buys gear and bait and checks the dockkeeper's perks).

## Server redeployment: one command

Deployment targets and credentials are intentionally not stored in this public repository. Operators provide `REELTOWN_SSH_KEY`, `REELTOWN_SSH_TARGET`, and `REELTOWN_PUBLIC_HOST` in their local environment, then run:

```sh
bash deploy/backup.sh      # consistent SQLite backup on the VM (recommended before schema migrations)
bash deploy/redeploy.sh
```

Redeploy bundles committed source, transfers it over SSH, clones it into a new release directory, imports the npm lockfile for pnpm, installs and builds only the server package on the VM, atomically switches the `current` symlink, restarts the service and checks `/health`. Migrations run at startup and are idempotent (`PRAGMA user_version`: 1 = players table and appearance column, 2 = stats column, 3 = moderation flags and settings, 4 = drawing-board strokes); existing players, recovery codes, coins, inventories and cosmetics are preserved, and a player's old sorting record seeds the new per-game record on their next login.

Releases before protocol 2 ignore the `stats` column, so rolling back the server keeps the database usable. Client publishing is handled by the GitHub Pages workflow. Deploy the server first; it serves both client generations.

Service: `reeltown.service` runs as the unprivileged `reeltown` user with a 256 MB JS heap and `MemoryHigh=350M` / `MemoryMax=400M`; measured RSS is about 80 MB with twelve players, so the limits are unchanged. Caddy terminates TLS; Node binds only to 127.0.0.1:3001.

## Data and backups

SQLite runs in WAL mode. Never copy only the live database file; use the backup script to create a consistent on-server backup.

## Profiles and capacity

`PROFILE=small` (12 players, 10 Hz snapshots) is deployed. `PROFILE=standard` (60 players, 20 Hz) exists but production stays on small; a longer soak on the VM is required before raising the cap.

## Known limits

Single harbor (no rooms), no moderation beyond rate limits and the dockkeeper tools, no passkeys (recovery codes are bearer secrets; only SHA-256 hashes are stored). Sound is procedural and off until the player turns it on. Fog and rain are client renderings of server weather; they do not change collision. The conveyor games trust client timing within a 300 ms grace window around the server's item schedule, and Orchard Catch within 250 ms plus a basket-speed check. Elevation is cosmetic: the sim is two-dimensional.

## Round 15: a bigger island (2026-09-13)

The island grew to about three times its original area. The coast is a star shape from four harmonics of the bearing, so one shared function decides where the land ends for collision, foam, terrain and everything that orbits the island; gentle hills lift the lighthouse onto a lookout; sand paths connect a paved plaza to home, Threads, the pond, the orchard and garden, the picnic clearing, the tide pools and the lookout. A test suite walks the whole map: every inland point is walkable unless it is pond or prop, the shore slide works at every bearing, and every landmark, seat, pin spot and path is reachable on foot from the spawn.

Fishing changed at both ends. Every reel opens with the fish still in the middle of the track for half a second, so the bar and the fish start together; legendary fish got a slightly wider bar and a gentler drain; and the Bait Shop sells rod, line and reel upgrades plus a one-cast lucky bait. Sort the Catch runs ninety seconds and sixty fish with a belt that speeds up.

The wardrobe moved out of the button row into Threads, a shop building. The welcome card keeps only the animal and its colours. The catalogue grew to the wardrobe sheet, each animal got its own coat palette and its sheet details, three pieces are earned by feats, and a hand lantern lights and thins the fog around whoever carries it. The base fog is as heavy as before, on purpose.

Five new pickup games share one frame on both sides of the wire (a seeded, validated, once-settled run on the server; a briefing, play, results and replay shell on the client), plus five drawing boards, shells, a garden, a dog, daily challenges and a journal. Drawings belonged to whoever drew them for a day (round 19 opened that up: the chalk holder may rub out anything), a full board drops its oldest line, and nothing outlives a week, so a board is never held hostage by someone who drew once and left. The Buoy Run is a real boat: movement has a mode, and the rower is seen by everyone. The course starts at the buoy nearest the mooring and runs anticlockwise as seen on screen; a beam of light stands over the next buoy that fog cannot hide, and the card can be put away while you row.

The characters were rebuilt against the model sheet rather than patched: about two heads tall with the head wider than the body, flat-shaded facets under a five-step toon ramp, big dark eyes with a catchlight, pale muzzles, cheeks and bellies, clothes as thin shells over the upper body so fur, feathers or scales show below, and a silhouette per animal (the cat's ears, stripes and ringed tail, the monkey's face mask and curl, the frog's dome eyes and wide grin, the bird's crest, beak and zigzag chest, the axolotl's branching gills and tail fin, the bear's round ears and muzzle, the rabbit's long ears and blush, the fish's side eyes, lips and spines, the blob's two-tone teardrop). Faces are placed on the head's surface by bearing, so every hat, accessory and species palette still fits.

## Round 18: the painted art pack (2026-09-15)

Seven sprite sheets were generated from the fish sheet's style (on flat magenta, so they key cleanly) and cut into `public/art`. Everything the interface used to draw as a line icon, a CSS shape or a coloured span is now a painting: the icon set (the plain close, tick, arrow and copy glyphs stay as lines), species portraits and cosmetic thumbnails in the creator and Threads, one painting per collectible shell in the journal, the shop's tackle, the reel marker, the catch card's rarity ribbon, and every minigame's pieces (fruit and basket, litter and bins, rarity crates, signal lamps, game discs). In the world the grass and flower tufts, the fish shadows under the water, the gulls, the clouds, the chimney smoke, the shop sign, the daily pin, the dog's hearts, the campfire flame, the splash rings and the rare-catch sparkles are the same paintings on cards; the ones that move turn to face the camera each frame. The fish cut-outs lost the pale ring of sheet background they carried along every edge. The nine lamp posts that could not afford a real point light were removed, leaving the two lit lanterns at the pier head.

## Round 17: real 3D assets (2026-09-13)

Everything the player sees is now a modelled asset built headlessly in Blender by `tools/models` and shipped as GLB in `public/models`. The nine animals are rigged as parts on the same pivots the animator already drives (body, head, arms, legs, ears, tail, a hat anchor); their faces carry colour roles (coat, pale, deep, outfit, eye…) that the client bakes into vertex colours per player, so one file serves every palette. Hats and accessories come from `cosmetics.glb`, the fish a player holds up is its painting from the fish sheet on a card that turns to face the camera, and the island's trees, boulders, buildings, lamps, boards, benches, the boat, the buoys, the dog and the shells are props merged into one flat-shaded mesh under a five-step toon ramp. The lighthouse beam and a hand lantern now clear the fog only in a bubble around your own character (`client/world/foghole.ts` patches three's fog chunks); the rest of the island keeps its weather and other players see nothing change. The sky and water palette moved toward the concept sheet. `scripts/models.test.mjs` reads every GLB and checks the rig parts, pivots, roles and budgets.

## Round 13: the bottom of a phone screen (2026-09-13)

On a portrait phone the chat row and the right-hand buttons were fighting over the same strip: opening the chat put the emote wheel on top of its log, and the send button shared a band with the emote button (12384 square pixels of overlap at 390x844). While the chat is open that strip now belongs to the chat - the wheel closes and the three secondary buttons stand aside, the cast button stays, and everything comes back when the chat closes. Desktop is untouched; the rule lives inside the narrow-screen media query, where the two never had room to coexist.

Full screen was missing on mobile for two different reasons, one of them a bug. The capability check only looked for the unprefixed `requestFullscreen`, so any WebKit browser without it - Safari before 16.4, older Android WebViews - hid the row entirely; both spellings are now tried, and the prefixed path is exercised in QA against a stubbed browser. The other reason is real: an iPhone cannot put a tab in full screen at all. Rather than hiding the row and leaving someone hunting for a setting that is not there, it now says so and points at the thing that does work - Reel Town is installable, with a manifest that declares `display: standalone`, home-screen icons, and `viewport-fit=cover` so the safe-area padding the HUD already carries is actually filled in.

## Round 12: the lighthouse earns its keep, and the harbour remembers you (2026-09-13)

Fog used to be scenery the lighthouse happened to stand in. Now the two are connected. On foggy days the lamp burns around the clock rather than only after dark, the shaft thickens and carries further because there is something in the air to catch it, the lamp flares as it comes round to face you, and the fog it sweeps through thins for a moment before rolling back in: you can see about seventy percent further at the height of a pass, and the murk is fully back before the next one nine seconds later. The sweep and the clearing live in `packages/shared/lighthouse.ts` as pure functions of elapsed time and one decaying number, so the renderer and the tests agree on where the light is pointing; `scripts/lighthouse.test.mjs` asserts the heading actually aims at the place it names, that there is exactly one crest per revolution, that the fog is back before the next pass, and that a pass never makes it clearer than a clear day. Clear weather is untouched, because the clearing is scaled by how foggy it is. Measurements and before/after shots are in `evidence/round12/`.

That work turned up a second problem: fog was measured from the camera, so pulling the camera back in thick weather left you staring at a blank wall of it rather than at the harbour. The fog planes now follow the camera past its resting distance (`CAMERA_REST_DISTANCE`), which leaves the tuned look at the default zoom alone and keeps the world visible when you pull back.

A browser that has played before no longer asks who you are. The recovery token was already saved locally, so a return visit gets a "welcome back" card in place of the join form: no name to retype, no look to pick, one button to press. Going in stays a decision the player makes rather than something that happens to them, so the card waits as long as it needs to and opens no socket until it is pressed. The name travels with the connection, so a reconnect cannot rename anyone, a saved character the server no longer knows falls back to the form instead of stranding someone on a spinner, and Settings gained a two-tap sign-out that hands the browser back without touching the character on the server. The join form is hidden until the browser has been checked, so it cannot flash up in front of a returning player.

## Round 11: the lighthouse beam, and the clouds in front of it (2026-09-13)

The beam was a cone of flat added colour, so it ended in a hard bright rim that read as the end of a cone rather than light running out. It is now a shader that fades three ways: along its length so it dissolves at its reach, by viewing angle across the surface so it has no hard silhouette, and as it swings toward the camera so a sweep never washes the harbour out. It is longer than before, 32 units, and still gone by the end.

Fixing that exposed an older bug behind it. The clouds sat at y 26 to 32 while the follow camera rides between 13 and 38, so a ninety-percent-opaque cloud would drift straight between the camera and the harbour and grey out the whole frame. They now sit at 44 to 54, and each carries its own material so it thins as it approaches the camera and is gone before it can pass through the view.

## Round 10: dock fixtures and bigger ears (2026-09-13)

The contest sign was hovering about a metre over the planks and the lanterns about half that, because each was placed against a hardcoded height rather than the deck. `PIER.deckTop` and `DECK_STAND_Y` now own that line, the sign is built from its own base so it plants on the boards, and a test asserts nothing standing on the pier hovers. Lanterns went from two at the pier head to seven down the whole dock, mounted on the pilings, with the head listed first so the presets that can only afford a couple of real lights spend them where people fish. The glass was being drawn twice, an opaque copy from the environment sitting outside the emissive one from the sky, which is why the lamps never lit up; the sky owns it now. The monkey got the big round ears it should have had: the width the old dog ears had, and turned to face forward so you see the whole ear rather than its edge. Its face was rebuilt too, since a small round snout with a pair of nostrils read as a pig: a wide pale muzzle that blends into the face, one small nose and a soft mouth, both sitting proud of the muzzle so they do not sink into it.

## Round 9: thirty fish, thirty looks (2026-09-13)

Every species used to be drawn as the same ellipse in a rarity colour. `packages/shared/fishlook.ts` now gives each of the 30 its own body, tail, dorsal fin, pattern, palette and, where it earns one, an extra: the catfish and koi have barbels, the sailfish and marlin have bills, the angler has a lure, the octopus has tentacles, the coelacanth, oarfish and dragonfish have crests, and the Grumpfish frowns. The art is assembled from that table in `FishArt`, so the guide, the bag, the shop, the sorting conveyor and the catch card all show the same creature, and undiscovered fish stay silhouettes whose shape is still a clue. The fish a player holds up after a catch takes its colour and proportions from the same entry. A test asserts every species has a look, that no two are drawn identically, and that none of them is paper-white against the panels.

## Round 8: dockkeeper tools (2026-09-13)

A player named Ali may *claim* the dev role, and from then on it belongs to that recovery code: a second person typing the same name gets nothing, and the holder keeps it if they rename themselves. Gating on the typed name alone would have let any visitor ban the harbor. The tools live behind the key button and cover the clock (a slider plus dawn/midday/sunset/night and back to auto), the weather, and moderation: mute, kick and ban, with an unban list. Every command is validated server-side in `packages/shared/admin.ts` and re-checked against the role before it runs, world overrides are shared through the normal snapshot so everyone sees the same sky, and they outlive a restart. Bans and mutes are stored against the recovery code (migration 3). A ban locks that character and its gold out for good; as with any unauthenticated guest, the person behind it can still start over as a brand new visitor, which the panel says plainly.

The dockkeeper also has the run of the place: the whole catalogue including earned pieces and every piece of gear is granted on joining, purchases cost nothing, and the coin pill reads ∞. Consumables such as lucky bait are still bought one at a time and spent by the next cast, so the ordinary flow can be tested.

Transferring or resetting the role: it is stored as one row, so clearing it lets the next player named Ali claim it.

Run `DELETE FROM settings WHERE key='admin_id';` against the production database from an authenticated server session.

Settings gained a full-screen toggle where the browser supports it, and your own nametag no longer says "· you" — the camera already follows you.

## Round 7: the pier head, the gulls and the perfect catch (2026-09-13)

The pier is now an upside-down T: an 18-unit crossbar at the seaward end, with its boards running across the stem's, bollards around the edge and the lanterns moved to its outer corners. `packages/shared/layout.ts` owns the shape, so collision, the cast zone, the water's foam and the minigames all follow it. Anyone standing on the crossbar casts out to sea; from the stem the line still goes over the side. The casting contest now floats its target in front of wherever the contestants gathered, so a group at an arm end gets a fair round.

Interaction landmarks (contest sign, sorting crates, shop door) moved into shared code as well. They had drifted: the contest's trigger sat at the pier centre with a five-unit radius while its sign stood a metre and a half to the side, so the prompt covered the whole fishing spot. The trigger is now on the sign itself at a 1.3-unit radius, off the centre line, and a test walks the length of the pier asserting the prompt stays clear.

The fish cruising under the surface got a real silhouette too, and one that points where it is going: the old one was a scaled disc whose Euler spin came out radial, so every fish swam broadside to its own path. `packages/shared/orientation.ts` now owns that little piece of maths for anything circling the island.

Seagulls got a real model (body, grey mantle, amber beak, forked tail, two-segment wings with dark tips) drawn as three instanced meshes no matter how many fly. At dusk they shrink away on the same schedule as the underwater fish silhouettes, which used to keep drifting after dark and read as shadows with no birds. The dog was replaced by a monkey with round ears, a pale face and a curling tail; looks saved as a dog load as a monkey instead of resetting.

Perfect catches were close to impossible: the bar always opened at the middle of the track while the fish spawned wherever its behaviour put it, so 53% of casts lost the bonus on the first server tick, and the star in the panel was a client-side guess. The bar now opens on top of the fish, a short grace covers the round trip when you hook, and the server sends the authoritative flag.

## Round 6: cosmetic shop (2026-09-12)

Gold now has a purpose: hats, outfits and accessories carry prices in `packages/shared/cosmetics.ts` (60–320 gold; species, colours, tee and bare head stay free). Purchases are validated and persisted server-side in the player's stats (`buy {kind, item}`), submitted looks are filtered to owned items, and players who already wore an item before the shop existed keep it. Locked items show a lock and price in the wardrobe and on the join screen with a two-step buy.

## Round 4–5 polish (2026-09-12)

Reel fairness: the hit test lives in `packages/shared/game.ts` (`reelInside`, with a small visual margin) and the tension meter shows only authoritative progress; reeling is harder per difficulty tier (timing tests in `scripts/fishing.test.mjs`). Guidance moved behind a ? button (`app/ui/Help.tsx`, shown once on first join). The tackle box was redesigned with species tiles, a rarity guide browser and records. Procedural WebAudio sound (`client/audio.ts`) with a settings toggle. Night life: lighthouse beam, fireflies, seagulls by day. Bobbers nibble before a bite; rods bend and lines tighten while reeling; escaped fish splash and say so. Connections drop and recover automatically (up to four retries with the same recovery token), identities persist across tabs and sessions in local storage (a duplicate tab becomes a fresh guest), and the players pill lists who is in the harbor.

## Milestone 2: atmosphere, fishing depth, UI and the casting contest (2026-09-11)

The synchronized server time and weather are now rendered: a sky dome with sun glow and stars, clouds, rain streaks, fog, and pier lanterns that glow (with point lights on medium/high) at night. Water is a custom shader with waves, toon banding, shoreline foam, sun glints and rain speckles. The island gained a rowboat, chimney smoke, fish shadows, swaying grass, signs and shoreline rocks (`client/world/sky.ts`, `water.ts`, `props.ts`).

Fishing: hold the cast button to charge power and steer to aim (landing preview ring); the server validates power/aim and picks the species with bounded weather, time-of-day and distance modifiers (`fishWeights`, `seedForContext`). Fish have reel personalities (smooth, mixed, dart, sinker, floater). Catches show a card with rarity, size, value, new-species and personal-best chips, and rare catches sparkle. Fish are sold at the Bait Shop (proximity checked server-side). Progression is persisted in a new `stats` column (migration 2): catches, perfects, streaks, discoveries, biggest sizes and minigame records.

Casting contest (`server/src/minigames/casting.ts`): join at the bullseye sign at the end of the pier, 15 s lobby, 30 s round, three rate-limited casts, authoritative scoring by distance to a floating target, ranked results, gold capped per round and to eight rewarded rounds per hour. The contest state travels in the shared snapshot; casts are broadcast as effects with score popups.

UI: a design system in `app/globals.css` (tokens, panels, pills, prompts, toasts, drawer panels, joystick, reduced motion and large text) replaces the Tailwind/shadcn styling (CSS 139 KB → 21 KB). The page is composed from `app/ui/*` panels (tackle box with bag/guide/records, shop, settings, contest, chat with unread badge, catch card).

## Milestone 1: movement, animation and performance (2026-09-11)

Protocol 2. Clients join with `protocol: 2` and send fixed-step `move` commands (30 Hz, sequence numbered). The server executes them through a per-player token bucket (30/s plus a burst of 8) so flooding cannot speed a player up; excess commands are acknowledged but never executed. The client predicts its own movement immediately and reconciles against the acknowledged authoritative state in the private `you` message, smoothing small corrections and snapping only beyond 1.6 m. Remote players are rendered from a timestamped interpolation buffer at an adaptive delay (snapshot interval plus measured jitter). The shared world `snapshot` is encoded once per tick as compact integer rows and identical bytes go to every client; names, cosmetics and public gold travel in `roster` messages only when they change. Clients published before protocol 2 still receive the previous snapshot shape until they reload.

Movement uses acceleration and deceleration, slides along the shoreline, pier rails and prop colliders, and shares its layout with the renderer (`packages/shared/layout.ts`). Characters are driven by an animation state machine (`client/animation.ts`) with eased transitions between idle, walk, cast, wait, bite, reel, catch, wave, heart, dance, sit, sell and minigame poses, plus spring-driven ears, tails, hats and squash. The harbour is baked into one vertex-coloured mesh and each avatar into a handful of merged meshes sharing one material. Quality presets (low, medium, high) pick shadows, water detail and render resolution and adapt to measured frame time.

Tests: `node --test scripts/game.test.mjs scripts/movement.test.mjs scripts/fishing.test.mjs scripts/casting.test.mjs` (32 tests) after building the server. The load test and fishing proof scripts speak protocol 2.

## Animation update

Buffered movement interpolation, eased turning and limb motion, pointed cat ears and floppy dog ears, shoulder-driven waving, animated rod and line casts, bobber landing ripples, and server-confirmed catch splashes are shared with nearby players. Particle instances are pooled to keep mobile rendering light. Run `node scripts/fishing-proof.mjs` to exercise a real fishing cycle against the live server.

The tackle box includes a 30-species fish guide with four rarity/difficulty tiers, fixed gold values (12–1000), a perfect-catch double-value bonus, and an optional persistent public gold display. Gold is earned by selling fish and its visible value always comes from the server.
