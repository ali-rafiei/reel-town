'use client';
import { Button, Chip, FishArt } from './primitives';
import { Icon } from './icons';
import { type Rarity } from '../../packages/shared/game';
import { RARITY_RIBBON, art } from '../../client/art';
export type Caught = { name: string; size: number; price: number; perfect?: boolean; rarity: Rarity; isNew?: boolean; record?: boolean; streak?: number };
export function CatchCard({ caught, onClose }: { caught: Caught; onClose: () => void }) {
  return (
    <section className="panel catchcard" aria-label={`You caught a ${caught.name}`} role="dialog">
      <span className="ribbon" style={{ backgroundImage: `url(${art('fishing-shop', RARITY_RIBBON[caught.rarity])})` }}>
        {caught.rarity}
      </span>
      <div className="art">
        <FishArt name={caught.name} />
      </div>
      <h2>{caught.name}</h2>
      <div className="chips">
        {caught.perfect && <Chip icon="star" className="rarity-Legendary">Perfect catch · double value</Chip>}
        {caught.isNew && <Chip icon="sparkle" className="new">New species!</Chip>}
        {caught.record && !caught.isNew && <Chip icon="ruler" className="record">Personal best</Chip>}
        {(caught.streak ?? 0) > 1 && <Chip icon="trophy">Perfect streak {caught.streak}</Chip>}
      </div>
      <div className="facts">
        <span>
          <Icon name="ruler" /> {caught.size} cm
        </span>
        <span>
          <Icon name="coin" /> {caught.price} gold
        </span>
      </div>
      <p className="muted" style={{ marginTop: 10 }}>
        Sell it at the Bait Shop by the pier.
      </p>
      <Button tone="primary" onClick={onClose} autoFocus>
        Nice!
      </Button>
    </section>
  );
}
