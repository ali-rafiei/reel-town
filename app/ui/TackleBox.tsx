'use client';
import { useState } from 'react';
import { Button, Chip, FishArt, Panel } from './primitives';
import { Icon } from './icons';
import { DIFFICULTY_NAMES, fishCatalog, rarityColors, type FishSpecies, type Rarity } from '../../packages/shared/game';
import type { Stats } from '../../packages/shared/stats';
import { SHELL_TYPES } from '../../packages/shared/activities';
import { GAME_IDS, type GameId } from '../../packages/shared/games';
import { SHELL_ART, art } from '../../client/art';
export type Fish = { name: string; size: number; price: number; perfect?: boolean };
type Tab = 'bag' | 'guide' | 'journal' | 'records';
const GAME_NAMES: Record<GameId, string> = { sorting: 'Sort the catch', tidepool: 'Tidepool tidy', orchard: 'Orchard catch', signals: 'Lighthouse signals', buoy: 'Buoy run', four: 'Dockside Four' };
const RARITIES: Rarity[] = ['Common', 'Uncommon', 'Rare', 'Legendary'];
export function TackleBox({ inventory, coins, stats, onClose, nearShop, onSell }: { inventory: Fish[]; coins: number; stats: Stats; onClose: () => void; nearShop: boolean; onSell: () => void }) {
  const [tab, setTab] = useState<Tab>('bag');
  const [selected, setSelected] = useState<FishSpecies | null>(null);
  const total = inventory.reduce((a, f) => a + f.price, 0);
  const speciesOf = (name: string) => fishCatalog.find((f) => f.name === name);
  const discovered = fishCatalog.filter((f) => stats.species[f.name] > 0).length;
  // Bag is grouped by species so twenty anchovies read as one tile with a count.
  const groups = new Map<string, { species: FishSpecies; count: number; value: number; biggest: number; perfect: number }>();
  for (const f of inventory) {
    const species = speciesOf(f.name);
    if (!species) continue;
    const g = groups.get(f.name) ?? { species, count: 0, value: 0, biggest: 0, perfect: 0 };
    g.count++;
    g.value += f.price;
    g.biggest = Math.max(g.biggest, f.size);
    if (f.perfect) g.perfect++;
    groups.set(f.name, g);
  }
  const tiles = [...groups.values()].sort((a, b) => b.value - a.value);
  return (
    <Panel
      title="Tackle box"
      icon="box"
      onClose={onClose}
      className="tacklebox"
      tabs={
        <div className="tabs" role="tablist">
          {(
            [
              ['bag', 'Bag', inventory.length],
              ['guide', 'Guide', `${discovered}/${fishCatalog.length}`],
              ['journal', 'Journal', null],
              ['records', 'Records', null],
            ] as Array<[Tab, string, string | number | null]>
          ).map(([key, label, count]) => (
            <button type="button" key={key} role="tab" aria-selected={tab === key} onClick={() => setTab(key)}>
              {label}
              {count !== null && <small>{count}</small>}
            </button>
          ))}
        </div>
      }
      footer={
        tab === 'bag' ? (
          <div className="sellbar">
            <div>
              <b>
                <Icon name="coin" /> {total}
              </b>
              <small>{nearShop ? 'The shopkeeper is ready.' : inventory.length ? 'Sell at the Bait Shop (red roof).' : 'Catch something first.'}</small>
            </div>
            <Button tone="gold" icon="shop" disabled={!inventory.length || !nearShop} onClick={onSell}>
              Sell all
            </Button>
          </div>
        ) : undefined
      }
    >
      {tab === 'bag' &&
        (tiles.length === 0 ? (
          <div className="empty">
            <Icon name="rod" />
            <p>Your bag is empty. Head to the end of the pier and cast a line.</p>
          </div>
        ) : (
          <div className="fishgrid">
            {tiles.map((g) => (
              <div className="fishtile" key={g.species.name} style={{ ['--rarity' as string]: rarityColors[g.species.rarity] }}>
                {g.count > 1 && <span className="count">×{g.count}</span>}
                <FishArt name={g.species.name} />
                <b>{g.species.name}</b>
                <span className="meta">
                  {g.biggest} cm{g.perfect ? ` · ${g.perfect} perfect` : ''}
                </span>
                <span className="value">
                  <Icon name="coin" />
                  {g.value}
                </span>
              </div>
            ))}
          </div>
        ))}
      {tab === 'guide' && (
        <>
          {selected ? (
            <div className="species" style={{ ['--rarity' as string]: rarityColors[selected.rarity] }}>
              <button type="button" className="btn ghost back" onClick={() => setSelected(null)}>
                ← All fish
              </button>
              <div className="art">
                <FishArt name={selected.name} silhouette={!stats.species[selected.name]} />
              </div>
              <h3>{stats.species[selected.name] ? selected.name : 'Not yet caught'}</h3>
              <div className="chips">
                <Chip className={`rarity-${selected.rarity}`}>{selected.rarity}</Chip>
                <Chip icon="hook">{DIFFICULTY_NAMES[selected.difficulty]}</Chip>
                <Chip icon="coin">{selected.price} gold</Chip>
              </div>
              <dl>
                <dt>Best time</dt>
                <dd>{selected.habitat}</dd>
                <dt>On the line</dt>
                <dd>{{ smooth: 'Glides calmly', mixed: 'Wanders up and down', dart: 'Darts suddenly', sinker: 'Hugs the bottom', floater: 'Stays near the top' }[selected.behavior]}</dd>
                <dt>Caught</dt>
                <dd>{stats.species[selected.name] ? `${stats.species[selected.name]} · biggest ${stats.biggest[selected.name]} cm` : 'Never'}</dd>
              </dl>
            </div>
          ) : (
            RARITIES.map((rarity) => {
              const list = fishCatalog.filter((f) => f.rarity === rarity);
              const seen = list.filter((f) => stats.species[f.name] > 0).length;
              return (
                <section className="guidegroup" key={rarity}>
                  <h3>
                    <span className="dot" style={{ background: rarityColors[rarity] }} />
                    {rarity}
                    <small>
                      {seen}/{list.length}
                    </small>
                  </h3>
                  <div className="guidegrid">
                    {list.map((f) => {
                      const known = stats.species[f.name] > 0;
                      return (
                        <button type="button" key={f.name} className={`guidetile ${known ? '' : 'locked'}`} onClick={() => setSelected(f)} aria-label={known ? f.name : 'Undiscovered fish'}>
                          <FishArt name={f.name} silhouette={!known} />
                          <span>{known ? f.name : '???'}</span>
                        </button>
                      );
                    })}
                  </div>
                </section>
              );
            })
          )}
        </>
      )}
      {tab === 'journal' && (
        <>
          <div className="stat-grid">
            <div className="stat">
              <b>
                {discovered}/{fishCatalog.length}
              </b>
              <span>fish found</span>
            </div>
            <div className="stat">
              <b>
                {SHELL_TYPES.filter((s) => stats.journal[s] > 0).length}/{SHELL_TYPES.length}
              </b>
              <span>shells</span>
            </div>
            <div className="stat">
              <b>{Object.values(stats.games).reduce((a, g) => a + g.plays, 0)}</b>
              <span>games played</span>
            </div>
          </div>
          <h3 className="sub">Shell collection</h3>
          <div className="shellgrid">
            {SHELL_TYPES.map((name) => {
              const count = stats.journal[name] || 0;
              return (
                <div key={name} className={`shelltile ${count ? '' : 'locked'}`} aria-label={count ? `${name}, found ${count}` : 'Not yet found'}>
                  {/* oxlint-disable-next-line next/no-img-element -- static sprite */}
                  <img src={art('shells-tidepool', SHELL_ART[name])} alt="" draggable={false} />
                  <span>{count ? name : '???'}</span>
                  {count > 1 && <small>×{count}</small>}
                </div>
              );
            })}
          </div>
          <h3 className="sub">Activity records</h3>
          <ul className="list">
            {GAME_IDS.map((id) => {
              const g = stats.games[id];
              const value = id === 'four' ? `${g.wins} won` : id === 'buoy' ? (g.bestTimeMs ? `${(g.bestTimeMs / 1000).toFixed(1)} s` : '—') : g.best ? `${g.best} pts` : '—';
              return (
                <li className="row" key={id}>
                  <span className="name">
                    {GAME_NAMES[id]}
                    <span className="meta">
                      {g.plays} {g.plays === 1 ? 'round' : 'rounds'}
                    </span>
                  </span>
                  <span className="value">{value}</span>
                </li>
              );
            })}
          </ul>
        </>
      )}
      {tab === 'records' && (
        <>
          <div className="stat-grid">
            <div className="stat">
              <b>{coins}</b>
              <span>gold</span>
            </div>
            <div className="stat">
              <b>{stats.catches}</b>
              <span>catches</span>
            </div>
            <div className="stat">
              <b>{stats.perfects}</b>
              <span>perfect</span>
            </div>
            <div className="stat">
              <b>{stats.bestStreak}</b>
              <span>best streak</span>
            </div>
            <div className="stat">
              <b>{stats.casting.best}</b>
              <span>contest best</span>
            </div>
            <div className="stat">
              <b>{stats.sorting.best}</b>
              <span>sorting best</span>
            </div>
          </div>
          {Object.keys(stats.biggest).length ? (
            <>
              <h3 className="sub">Biggest catches</h3>
              <ul className="list">
                {Object.entries(stats.biggest)
                  .sort((a, b) => b[1] - a[1])
                  .slice(0, 6)
                  .map(([name, size]) => (
                    <li className="row" key={name}>
                      <span className="fishicon">
                        <FishArt name={name} />
                      </span>
                      <span className="name">{name}</span>
                      <span className="value">{size} cm</span>
                    </li>
                  ))}
              </ul>
            </>
          ) : (
            <p className="muted">Records appear here once you land your first fish.</p>
          )}
        </>
      )}
    </Panel>
  );
}
