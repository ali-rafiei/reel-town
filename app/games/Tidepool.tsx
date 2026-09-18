'use client';
import { art } from '../../client/art';
import { Conveyor } from './Conveyor';
import type { GameProps } from './registry';
// The same ten kinds the server deals, in the same order: litter first, creatures last.
const KINDS: Array<{ name: string; bin: number; art: string }> = [
  { name: 'Bottle', bin: 0, art: 'plastic-bottle' },
  { name: 'Bag', bin: 0, art: 'plastic-bag' },
  { name: 'Six-pack ring', bin: 0, art: 'six-pack-ring' },
  { name: 'Can', bin: 1, art: 'tin-can' },
  { name: 'Bottle cap', bin: 1, art: 'bottle-cap' },
  { name: 'Newspaper', bin: 2, art: 'newspaper' },
  { name: 'Cup', bin: 2, art: 'paper-cup' },
  { name: 'Shell', bin: -1, art: 'leave-alone-shell' },
  { name: 'Crab', bin: -1, art: 'orange-crab' },
  { name: 'Starfish', bin: -1, art: 'orange-starfish' },
];
const BINS = [
  { label: 'Plastic', color: '#4f8fc7', key: '1', art: art('shells-tidepool', 'plastic-crate') },
  { label: 'Metal', color: '#8e948c', key: '2', art: art('shells-tidepool', 'metal-bin') },
  { label: 'Paper', color: '#c9a35a', key: '3', art: art('shells-tidepool', 'paper-box') },
];
// Tidepool Tidy: litter into three bins, creatures left where they are.
export function TidepoolGame(props: GameProps) {
  return (
    <Conveyor
      {...props}
      bins={BINS}
      flashColor={(kind) => (KINDS[kind].bin < 0 ? '#e0574f' : BINS[KINDS[kind].bin].color)}
      correctBin={(kind) => (KINDS[kind].bin < 0 ? null : KINDS[kind].bin)}
      renderItem={(kind) => (
        <>
          <span className={`litter ${KINDS[kind].bin < 0 ? 'creature' : ''}`}>
            {/* oxlint-disable-next-line next/no-img-element -- static sprite */}
            <img src={art('shells-tidepool', KINDS[kind].art)} alt="" draggable={false} />
          </span>
          <span className="fishname">{KINDS[kind].name}</span>
        </>
      )}
    />
  );
}
