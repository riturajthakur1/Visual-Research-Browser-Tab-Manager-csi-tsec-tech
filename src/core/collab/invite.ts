// Invite codes carry everything a teammate needs to join: relay address, room
// and the encryption key. Share them privately; anyone with the code can join.
import { fromB64, toB64 } from './crypto';

export interface Invite {
  server: string;
  room: string;
  key: string;
  /** Workspace name, shown while joining. */
  name?: string;
}

const PREFIX = 'thread-io:';

export function encodeInvite(i: Invite): string {
  const json = JSON.stringify({ s: i.server, r: i.room, k: i.key, n: i.name });
  return PREFIX + toB64(new TextEncoder().encode(json));
}

export function decodeInvite(code: string): Invite | null {
  const raw = code
    .trim()
    .replace(/^thread-io:/i, '')
    .replace(/\s+/g, '');
  try {
    const j = JSON.parse(new TextDecoder().decode(fromB64(raw))) as { s?: string; r?: string; k?: string; n?: string };
    if (!j.s || !j.r || !j.k || !/^wss?:\/\//.test(j.s) || !/^[A-Za-z0-9_-]{4,80}$/.test(j.r)) return null;
    return { server: j.s, room: j.r, key: j.k, name: j.n };
  } catch {
    return null;
  }
}
