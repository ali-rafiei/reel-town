import { Decoder } from '@msgpack/msgpack';
import { PROTOCOL_VERSION } from '../packages/shared/protocol';
// WebSocket session: JSON out, MessagePack in, typed listeners by message type.
type Listener = (message: any) => void;
export class Connection {
  private ws: WebSocket | null = null;
  private listeners = new Map<string, Set<Listener>>();
  private decoder = new Decoder();
  private timeout = 0;
  on(type: string, listener: Listener) {
    let set = this.listeners.get(type);
    if (!set) this.listeners.set(type, (set = new Set()));
    set.add(listener);
    return () => set!.delete(listener);
  }
  private emit(type: string, message: unknown) {
    const set = this.listeners.get(type);
    if (set) for (const l of set) l(message);
  }
  get open() {
    return this.ws?.readyState === WebSocket.OPEN;
  }
  connect(url: string, join: Record<string, unknown>, timeoutMs = 15000) {
    this.close();
    const ws = new WebSocket(url);
    this.ws = ws;
    ws.binaryType = 'arraybuffer';
    this.timeout = window.setTimeout(() => {
      if (ws.readyState !== WebSocket.OPEN) {
        ws.close();
        this.emit('timeout', null);
      }
    }, timeoutMs);
    ws.onopen = () => {
      clearTimeout(this.timeout);
      ws.send(JSON.stringify({ ...join, type: 'join', protocol: PROTOCOL_VERSION }));
      this.emit('open', null);
    };
    ws.onmessage = (e) => {
      let message: { type?: string };
      try {
        message = this.decoder.decode(new Uint8Array(e.data as ArrayBuffer)) as { type?: string };
      } catch {
        this.emit('malformed', null);
        return;
      }
      if (message && typeof message.type === 'string') this.emit(message.type, message);
    };
    ws.onclose = (e) => {
      clearTimeout(this.timeout);
      if (this.ws === ws) this.ws = null;
      this.emit('close', e);
    };
    ws.onerror = () => this.emit('error', null);
  }
  send(message: Record<string, unknown>) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(message));
  }
  close() {
    clearTimeout(this.timeout);
    const ws = this.ws;
    this.ws = null;
    if (ws) {
      ws.onclose = null;
      ws.close();
    }
  }
}
