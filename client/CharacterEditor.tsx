'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { species, hats, outfits, accessories, clothesPalette, shirtPalette, trimPalette, TRIM_AUTO, hasTrim, isLayered, isTintedHat, speciesPalettes, type Appearance, type Species } from '../packages/shared/appearance';
import { cosmeticPrices, ownsCosmetic, isEarned, FEATS, ownedKey, type WearableKind as CosmeticKind } from '../packages/shared/cosmetics';
import { Icon } from '../app/ui/icons';
import { COSMETIC_ART, art } from './art';
type Pending = { kind: CosmeticKind; item: string; price: number } | null;
// One editor, two rooms. The welcome card is the creator: pick an animal and its
// colours. Threads is the shop: the same editor with hats, clothes and accessories,
// prices, and a turntable that tries things on before you buy.
export function CharacterEditor({
  value,
  onChange,
  mode = 'creator',
  owned = {},
  coins = 0,
  onBuy,
}: {
  value: Appearance;
  onChange: (value: Appearance) => void;
  mode?: 'creator' | 'shop';
  owned?: Record<string, number>;
  coins?: number;
  onBuy?: (kind: CosmeticKind, item: string) => void;
}) {
  const preview = useRef<HTMLDivElement>(null),
    previewFoot = useRef<HTMLDivElement>(null),
    setModel = useRef<((a: Appearance) => void) | null>(null),
    latest = useRef(value);
  const [pendingChoice, setPending] = useState<Pending>(null);
  // A pending item stops being pending the moment the purchase lands (the page applies it to the look).
  const pending = pendingChoice && !ownsCosmetic(owned, pendingChoice.kind, pendingChoice.item) ? pendingChoice : null;
  // The turntable previews a locked item while the player decides whether to buy it.
  const shown = useMemo(() => (pending ? { ...value, [pending.kind]: pending.item } : value), [pending, value]);
  useEffect(() => {
    latest.current = shown;
    setModel.current?.(shown);
  }, [shown]);
  useEffect(() => {
    let disposed = false,
      cleanup = () => {};
    void import('./preview').then(({ createPreview }) => {
      if (disposed || !preview.current) return;
      // The shop's list is long, so a second turntable stands at the foot of it: the look
      // is in view whichever end of the panel you are reading.
      const hosts = [preview.current, ...(previewFoot.current ? [previewFoot.current] : [])];
      const turntables = hosts.map((host) => createPreview(host, latest.current));
      setModel.current = (a) => {
        for (const turntable of turntables) turntable.set(a);
      };
      cleanup = () => {
        for (const turntable of turntables) turntable.dispose();
        setModel.current = null;
      };
    });
    return () => {
      disposed = true;
      cleanup();
    };
  }, [mode]);
  const furPalette = speciesPalettes[value.species as Species] ?? speciesPalettes.cat;
  const speciesGroup = (
    <fieldset className="option-group">
      <legend>Animal</legend>
      <div className="options">
        {species.map((option) => (
          <button
            type="button"
            key={option}
            aria-pressed={value.species === option}
            onClick={() => {
              // Each animal has its own coat colours; an old colour it never had falls back to its first.
              const next = speciesPalettes[option];
              onChange({ ...value, species: option, color: next.includes(value.color) ? value.color : next[0] });
            }}
          >
            {/* oxlint-disable-next-line next/no-img-element -- static sprite */}
            <img className="thumb portrait" src={art('portraits-emotes', option)} alt="" draggable={false} />
            {option}
          </button>
        ))}
      </div>
    </fieldset>
  );
  const shopGroup = (kind: CosmeticKind, options: readonly string[], label: string) => (
    <fieldset className="option-group">
      <legend>{label}</legend>
      <div className="options">
        {options.map((option) => {
          const price = cosmeticPrices[kind][option] ?? 0;
          const earned = isEarned(kind, option);
          const has = ownsCosmetic(owned, kind, option);
          const selected = (pending?.kind === kind ? pending.item : value[kind]) === option;
          return (
            <button
              type="button"
              key={option}
              aria-pressed={selected}
              className={has ? '' : 'locked'}
              aria-label={has ? option : earned ? `${option}, earned by a feat` : `${option}, ${price} gold`}
              onClick={() => {
                if (has) {
                  setPending(null);
                  onChange({ ...value, [kind]: option });
                } else setPending({ kind, item: option, price });
              }}
            >
              {COSMETIC_ART[kind]?.[option] && (
                // oxlint-disable-next-line next/no-img-element -- static sprite
                <img className="thumb" src={art('cosmetics', COSMETIC_ART[kind][option])} alt="" draggable={false} />
              )}
              {!has && <Icon name={earned ? 'star' : 'coin'} />}
              {option}
              {!has && !earned && <small>{price}</small>}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
  const swatches = (key: 'color' | 'outfitColor' | 'shirtColor' | 'trimColor' | 'hatColor', label: string, colours: readonly string[]) => (
    <fieldset className="option-group">
      <legend>{label}</legend>
      <div className="palette">
        {colours.map((c) => (
          // The trim's first swatch is not a colour but a choice to leave each piece the
          // colour it was painted, so it is drawn as a chip rather than a dot of paint.
          <button
            type="button"
            key={c}
            aria-label={c === TRIM_AUTO ? `${label} as painted` : `${label} ${c}`}
            aria-pressed={value[key] === c}
            className={c === TRIM_AUTO ? 'swatch auto' : 'swatch'}
            style={c === TRIM_AUTO ? undefined : { background: c }}
            onClick={() => onChange({ ...value, [key]: c })}
          >
            {c === TRIM_AUTO ? 'As painted' : null}
          </button>
        ))}
      </div>
    </fieldset>
  );
  const feat = pending ? FEATS[ownedKey(pending.kind, pending.item)] : undefined;
  return (
    <div className="character-editor">
      <div className="character-preview" ref={preview} aria-label={`Preview of your ${shown.species} wearing a ${shown.hat === 'none' ? 'bare head' : shown.hat} and ${shown.outfit}`} />
      {speciesGroup}
      {mode === 'shop' && shopGroup('hat', hats, 'Hat')}
      {mode === 'shop' && shopGroup('outfit', outfits, 'Clothes')}
      {mode === 'shop' && shopGroup('accessory', accessories, 'Accessory')}
      {swatches('color', 'Fur colour', furPalette)}
      {swatches('outfitColor', isLayered(shown.outfit) ? 'Coat colour' : 'Clothing colour', clothesPalette)}
      {/* The shirt only shows under a coat, and only plain cloth hats take a colour, so
          neither is asked for unless it would do something. */}
      {isLayered(shown.outfit) && swatches('shirtColor', 'Shirt under it', shirtPalette)}
      {hasTrim(shown.outfit) && swatches('trimColor', 'Trim', trimPalette)}
      {isTintedHat(shown.hat) && swatches('hatColor', 'Hat colour', clothesPalette)}
      {mode === 'shop' && <div className="character-preview foot" ref={previewFoot} aria-hidden="true" />}
      {mode === 'creator' && <p className="muted editor-note">Hats and clothes are at Threads, the purple shop.</p>}
      {pending && (
        <output className="buybar">
          <span>
            <b style={{ textTransform: 'capitalize' }}>{pending.item}</b>
            {feat ? ` · earned: ${feat}` : ` · ${pending.price} gold${onBuy ? ` · you have ${coins}` : ''}`}
          </span>
          <span className="buttons">
            {feat ? null : onBuy && coins >= pending.price ? (
              <button type="button" className="btn gold" onClick={() => onBuy(pending.kind, pending.item)}>
                <Icon name="coin" /> Buy
              </button>
            ) : (
              <span className="muted">{onBuy ? `${pending.price - coins} more gold` : 'Earn gold to unlock'}</span>
            )}
            <button type="button" className="btn ghost" onClick={() => setPending(null)}>
              {feat ? 'Got it' : 'Cancel'}
            </button>
          </span>
        </output>
      )}
    </div>
  );
}
