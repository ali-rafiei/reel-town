'use client';
import { Button, FishArt, Panel } from './primitives';
import { Icon } from './icons';
import { fishCatalog, type Rarity } from '../../packages/shared/game';
import { BAIT, GEAR, GEAR_IDS, ownsGear } from '../../packages/shared/gear';
import type { Fish } from './TackleBox';
import { GEAR_ART, art } from '../../client/art';
type Tab = 'sell' | 'tackle';
// The Bait Shop buys the catch and sells the tackle that makes the next one easier.
export function Shop({
  inventory,
  coins,
  owned,
  bait,
  tab,
  onTab,
  onSell,
  onBuy,
  onClose,
  selling,
}: {
  inventory: Fish[];
  coins: number;
  owned: Record<string, number>;
  bait: number;
  tab: Tab;
  onTab: (tab: Tab) => void;
  onSell: () => void;
  onBuy: (kind: 'gear' | 'bait', item: string) => void;
  onClose: () => void;
  selling: boolean;
}) {
  const total = inventory.reduce((a, f) => a + f.price, 0);
  const byName = new Map<string, { count: number; value: number; rarity: Rarity }>();
  for (const f of inventory) {
    const entry = byName.get(f.name) ?? { count: 0, value: 0, rarity: (fishCatalog.find((c) => c.name === f.name)?.rarity ?? 'Common') as Rarity };
    entry.count++;
    entry.value += f.price;
    byName.set(f.name, entry);
  }
  const buyButton = (kind: 'gear' | 'bait', item: string, price: number, held: boolean, heldLabel: string) =>
    held ? (
      <span className="chip">
        <Icon name="check" /> {heldLabel}
      </span>
    ) : (
      <Button tone={coins >= price ? 'gold' : 'ghost'} icon="coin" disabled={coins < price} onClick={() => onBuy(kind, item)} aria-label={`Buy ${item} for ${price} gold`}>
        {price}
      </Button>
    );
  return (
    <Panel
      title="Bait Shop"
      icon="shop"
      onClose={onClose}
      className="shop"
      tabs={
        <div className="tabs" role="tablist">
          {(
            [
              ['sell', 'Sell', inventory.length],
              ['tackle', 'Tackle', null],
            ] as Array<[Tab, string, number | null]>
          ).map(([key, label, count]) => (
            <button type="button" key={key} role="tab" aria-selected={tab === key} onClick={() => onTab(key)}>
              {label}
              {count !== null && count > 0 && <small>{count}</small>}
            </button>
          ))}
        </div>
      }
      footer={
        tab === 'sell' ? (
          <>
            <Button tone="gold" icon="coin" disabled={!inventory.length || selling} className={selling ? 'busy' : ''} onClick={onSell}>
              Sell everything · {total}
            </Button>
            <Button tone="ghost" onClick={onClose}>
              Maybe later
            </Button>
          </>
        ) : (
          <Button tone="ghost" onClick={onClose}>
            Done
          </Button>
        )
      }
    >
      {tab === 'sell' ? (
        <>
          <p>You have {coins} gold.</p>
          {inventory.length === 0 ? (
            <div className="empty">
              <Icon name="fish" />
              <p>Nothing to sell yet.</p>
            </div>
          ) : (
            <ul className="list">
              {[...byName.entries()].map(([name, entry]) => (
                <li className="row" key={name}>
                  <span className="fishicon">
                    <FishArt name={name} />
                  </span>
                  <span className="name">
                    {name}
                    <span className="meta">× {entry.count}</span>
                  </span>
                  <span className="value">
                    <Icon name="coin" />
                    {entry.value}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <>
          <ul className="list">
            {GEAR_IDS.map((id) => (
              <li className="row" key={id}>
                <span className="fishicon tackle">
                  {/* oxlint-disable-next-line next/no-img-element -- static sprite */}
                  <img src={art('fishing-shop', GEAR_ART[id])} alt="" draggable={false} />
                </span>
                <span className="name">
                  {GEAR[id].name}
                  <span className="meta">{GEAR[id].blurb}</span>
                </span>
                {buyButton('gear', id, GEAR[id].price, ownsGear(owned, id), 'Yours')}
              </li>
            ))}
            <li className="row" key={BAIT.id}>
              <span className="fishicon tackle">
                {/* oxlint-disable-next-line next/no-img-element -- static sprite */}
                <img src={art('fishing-shop', GEAR_ART[BAIT.id])} alt="" draggable={false} />
              </span>
              <span className="name">
                {BAIT.name}
                <span className="meta">{BAIT.blurb}</span>
              </span>
              {buyButton('bait', BAIT.id, BAIT.price, bait > 0, 'On the hook')}
            </li>
          </ul>
        </>
      )}
    </Panel>
  );
}
