'use client';
import { useState } from 'react';
import { Button, Panel, Segmented, Toggle } from './primitives';
import type { QualityLevel } from '../../client/world/quality';
export type SettingsState = { quality: QualityLevel | 'auto'; qualityLabel: string; crisp: boolean; reduceMotion: boolean; largeText: boolean; showGold: boolean; sound: boolean; fullscreen: boolean };
export function Settings({
  state,
  onChange,
  onClose,
  onCopyCode,
  onForget,
  canFullscreen,
}: {
  state: SettingsState;
  onChange: (patch: Partial<SettingsState>) => void;
  onClose: () => void;
  onCopyCode: () => void;
  onForget: () => void;
  canFullscreen: boolean;
}) {
  // Signing out is only safe once the code is saved somewhere, so it takes two taps.
  const [confirmForget, setConfirmForget] = useState(false);
  return (
    <Panel title="Settings" icon="gear" onClose={onClose}>
      <div className="field">
        <span className="label">
          Graphics
          <small>{state.qualityLabel || 'Adapts to your device'}</small>
        </span>
        <Segmented
          label="Graphics quality"
          value={state.quality}
          options={[
            ['auto', 'Auto'],
            ['low', 'Low'],
            ['medium', 'Med'],
            ['high', 'High'],
          ]}
          onChange={(quality) => onChange({ quality })}
        />
      </div>
      <div className="field">
        <span className="label">
          Full screen
          {/* An iPhone cannot put a tab in full screen at all, so say that rather than
              hiding the row and leaving someone hunting for a setting that is not there. */}
          <small>{canFullscreen ? 'Fills the display and hides the browser chrome' : 'This browser cannot full-screen a tab. Add Reel Town to your Home Screen for a window without the browser around it.'}</small>
        </span>
        {canFullscreen && <Toggle label="Full screen" checked={state.fullscreen} onChange={(fullscreen) => onChange({ fullscreen })} />}
      </div>
      <div className="field">
        <span className="label">
          Sound
          <small>Waves, rain, bites and little fanfares</small>
        </span>
        <Toggle label="Sound" checked={state.sound} onChange={(sound) => onChange({ sound })} />
      </div>
      <div className="field">
        <span className="label">
          Crisp rendering
          <small>Off keeps the chunky retro pixels</small>
        </span>
        <Toggle label="Crisp rendering" checked={state.crisp} onChange={(crisp) => onChange({ crisp })} />
      </div>
      <div className="field">
        <span className="label">
          Reduce motion
          <small>Calms interface animations</small>
        </span>
        <Toggle label="Reduce motion" checked={state.reduceMotion} onChange={(reduceMotion) => onChange({ reduceMotion })} />
      </div>
      <div className="field">
        <span className="label">
          Larger text
          <small>Scales the interface up</small>
        </span>
        <Toggle label="Larger text" checked={state.largeText} onChange={(largeText) => onChange({ largeText })} />
      </div>
      <div className="field">
        <span className="label">
          Show my gold
          <small>Displays your gold above your head</small>
        </span>
        <Toggle label="Show my gold to other players" checked={state.showGold} onChange={(showGold) => onChange({ showGold })} />
      </div>
      <div className="field">
        <span className="label">
          Recovery code
          <small>Paste it when joining to recover this character</small>
        </span>
        <Button icon="key" onClick={onCopyCode}>
          Copy
        </Button>
      </div>
      <div className="field">
        <span className="label">
          Play as someone else
          <small>{confirmForget ? 'Copy your recovery code first. You will need it to come back to this character.' : 'This browser stops opening straight into this character'}</small>
        </span>
        <Button tone={confirmForget ? 'primary' : undefined} onClick={() => (confirmForget ? onForget() : setConfirmForget(true))}>
          {confirmForget ? 'Confirm' : 'Sign out'}
        </Button>
      </div>
    </Panel>
  );
}
