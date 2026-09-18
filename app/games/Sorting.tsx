'use client';
import { FishArt } from '../ui/primitives';
import { fishCatalog, rarityColors, type Rarity } from '../../packages/shared/game';
import { Conveyor } from './Conveyor';
import { RARITY_CRATE, art } from '../../client/art';
import type { GameProps } from './registry';
const RARITIES: Rarity[] = ['Common', 'Uncommon', 'Rare', 'Legendary'];
const BINS = RARITIES.map((rarity, i) => ({ label: rarity, color: rarityColors[rarity], key: String(i + 1), art: art('minigames', RARITY_CRATE[rarity]) }));
// After this many fish the rarity flash gets shorter, so the late run asks for real recognition.
const QUICK_GLIMPSE_FROM = 30;
// Sort the Catch: fish by rarity into four crates.
export function SortingGame(props: GameProps) {
  return (
    <Conveyor
      {...props}
      bins={BINS}
      quickGlimpseFrom={QUICK_GLIMPSE_FROM}
      flashColor={(kind) => rarityColors[fishCatalog[kind].rarity]}
      correctBin={(kind) => RARITIES.indexOf(fishCatalog[kind].rarity)}
      renderItem={(kind) => (
        <>
          <FishArt name={fishCatalog[kind].name} silhouette size={44} />
          <span className="fishname">{fishCatalog[kind].name}</span>
        </>
      )}
    />
  );
}
