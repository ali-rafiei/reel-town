'use client';
import { Button, Panel, Pill } from './primitives';
import { CharacterEditor } from '../../client/CharacterEditor';
import type { Appearance } from '../../packages/shared/appearance';
import type { WearableKind } from '../../packages/shared/cosmetics';
// Threads, the wardrobe shop: try things on at the turntable, buy what you like, save the look.
export function Threads({
  appearance,
  owned,
  coins,
  onChange,
  onBuy,
  onSave,
  onClose,
}: {
  appearance: Appearance;
  owned: Record<string, number>;
  coins: number;
  onChange: (value: Appearance) => void;
  onBuy: (kind: WearableKind, item: string) => void;
  onSave: () => void;
  onClose: () => void;
}) {
  return (
    <Panel
      title="Threads"
      icon="hanger"
      className="threads"
      onClose={onClose}
      extra={
        <Pill icon="coin" tone="gold">
          {coins}
        </Pill>
      }
      footer={
        <>
          <Button tone="primary" icon="check" onClick={onSave}>
            Save look
          </Button>
          <Button tone="ghost" onClick={onClose}>
            Just browsing
          </Button>
        </>
      }
    >
      <p className="muted">Starred pieces are earned, not sold.</p>
      <CharacterEditor mode="shop" value={appearance} onChange={onChange} owned={owned} coins={coins} onBuy={onBuy} />
    </Panel>
  );
}
