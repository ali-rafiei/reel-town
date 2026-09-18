'use client';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { Button } from './primitives';
export type ChatLine = { id: number; name: string; text: string; system: boolean };
export function Chat({ log, onSend, inputRef, onFocusChange, onOpenChange, compact }: { log: ChatLine[]; onSend: (text: string) => void; inputRef: RefObject<HTMLInputElement | null>; onFocusChange: (focused: boolean) => void; onOpenChange: (open: boolean) => void; compact: boolean }) {
  const [text, setText] = useState('');
  const [collapsed, setCollapsed] = useState(compact);
  const [unread, setUnread] = useState(0);
  const seen = useRef(0);
  const logRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (collapsed) setUnread(log.length - seen.current);
    else {
      seen.current = log.length;
      setUnread(0);
      logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
    }
  }, [log, collapsed]);
  // The HUD needs to know: on a phone the open chat takes over the bottom strip.
  useEffect(() => {
    onOpenChange(!collapsed);
  }, [collapsed, onOpenChange]);
  return (
    <section className={`chat ${collapsed ? 'collapsed' : ''}`} aria-label="Harbor chat">
      <div className="log" ref={logRef} aria-live="polite">
        {log.slice(-40).map((m) => (
          <p key={m.id} className={m.system ? 'system' : ''}>
            {m.system ? m.text : <><b>{m.name}</b> {m.text}</>}
          </p>
        ))}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) onSend(text.trim());
          setText('');
          inputRef.current?.blur();
        }}
      >
        <Button size="icon" icon="chat" aria-label={collapsed ? `Open chat${unread ? `, ${unread} unread` : ''}` : 'Hide chat'} aria-expanded={!collapsed} onClick={() => setCollapsed((v) => !v)}>
          {collapsed && unread > 0 && <span className="badge">{unread > 9 ? '9+' : unread}</span>}
        </Button>
        {!collapsed && (
          <>
            <input
              ref={inputRef}
              aria-label="Chat message"
              placeholder="Say hello…"
              maxLength={200}
              value={text}
              enterKeyHint="send"
              autoComplete="off"
              onFocus={() => onFocusChange(true)}
              onBlur={() => onFocusChange(false)}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') inputRef.current?.blur();
              }}
            />
            <Button size="icon" icon="arrow" type="submit" aria-label="Send" />
          </>
        )}
      </form>
    </section>
  );
}
