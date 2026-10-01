// A live connection between this browser's copy of a workspace and the
// team's shared copy.
//
//   IndexedDB  ⇄  three-way merge  ⇄  Yjs document  ⇄  encrypted relay  ⇄  teammates
//
// Local edits (captures, filings, notes, claims) are merged into the shared
// Yjs document; updates from teammates are merged back into IndexedDB, so the
// side panel and map update by themselves. All merging runs one step at a time
// on fresh reads, so a teammate's update can never be mistaken for a deletion.
import { liveQuery, type Subscription } from 'dexie';
import * as Y from 'yjs';
import type { ThreadDB } from '../db';
import type { CollabLink, Member, Workspace } from '../types';
import { createMutex } from '../util';
import { importKey, open, openJson, seal, sealJson } from './crypto';
import {
  mergeFields,
  project,
  projectWorkspace,
  same,
  SYNC_TABLES,
  withLocalFields,
  type Rec,
  type SyncTable,
} from './merge';

export type SessionState = 'connecting' | 'live' | 'offline' | 'error';

export interface Peer extends Member {
  at: number;
}

export interface SessionStatus {
  state: SessionState;
  error?: string;
  peers: Peer[];
}

export interface SessionOptions {
  db: ThreadDB;
  wsId: string;
  link: CollabLink;
  me: Member;
  WebSocketImpl?: typeof WebSocket;
  onStatus?: (status: SessionStatus) => void;
}

const REMOTE = 'remote';
const RESTORE = 'restore';
const PRESENCE_EVERY = 15_000;
const PEER_TIMEOUT = 45_000;

type ServerMessage =
  | { t: 'welcome'; log: string[]; peers: number }
  | { t: 'update'; d: string }
  | { t: 'compact'; upTo: number }
  | { t: 'presence'; d: string; from: string }
  | { t: 'peer-joined'; id: string }
  | { t: 'peer-left'; id: string }
  | { t: 'error'; error: string };

export class CollabSession {
  readonly doc = new Y.Doc();
  private base = new Map<string, Rec>();
  private key!: CryptoKey;
  private socket: WebSocket | null = null;
  private state: SessionState = 'connecting';
  private error?: string;
  private peers = new Map<string, Peer>();
  private live = false;
  private stopped = false;
  private retry = 0;
  private logLength = 0;
  private timers: ReturnType<typeof setTimeout>[] = [];
  private presenceTimer?: ReturnType<typeof setInterval>;
  private syncTimer?: ReturnType<typeof setTimeout>;
  private syncDone: (() => void) | null = null;
  private saveTimer?: ReturnType<typeof setTimeout>;
  private sub?: Subscription;
  private run = createMutex();
  private outbox: Promise<unknown> = Promise.resolve();
  /** Resolves after the next completed merge; used by tests and callers that need to wait. */
  synced: Promise<void> = Promise.resolve();

  constructor(private opts: SessionOptions) {}

  get id() {
    return this.opts.wsId;
  }

  async start(): Promise<void> {
    const { db, wsId } = this.opts;
    this.key = await importKey(this.opts.link.key);
    const saved = await db.sync.get(wsId);
    if (saved) {
      Y.applyUpdate(this.doc, saved.doc, RESTORE);
      this.base = new Map(Object.entries(saved.base));
    }
    this.doc.on('update', (update: Uint8Array, origin: unknown) => {
      if (origin !== REMOTE && origin !== RESTORE) this.send(update);
      if (origin === REMOTE) this.scheduleSync(30);
    });
    this.sub = liveQuery(() =>
      Promise.all([
        db.workspaces.get(wsId),
        ...SYNC_TABLES.map((t) => db.table(t).where('wsId').equals(wsId).toArray()),
      ]),
    ).subscribe({ next: () => this.scheduleSync(120), error: (e) => console.warn('[thread.io] collab watch', e) });
    this.connect();
  }

  stop() {
    this.stopped = true;
    this.sub?.unsubscribe();
    clearInterval(this.presenceTimer);
    clearTimeout(this.syncTimer);
    this.timers.forEach(clearTimeout);
    this.socket?.close();
    this.socket = null;
    void this.persist();
  }

  setProfile(me: Member) {
    this.opts.me = me;
    void this.sendPresence();
  }

  status(): SessionStatus {
    return { state: this.state, error: this.error, peers: [...this.peers.values()] };
  }

  private report() {
    this.opts.onStatus?.(this.status());
  }

  // --- Network ----------------------------------------------------------------------

  private connect() {
    if (this.stopped) return;
    const WS = this.opts.WebSocketImpl ?? WebSocket;
    this.state = 'connecting';
    this.report();
    let socket: WebSocket;
    try {
      socket = new WS(this.opts.link.server);
    } catch (e) {
      this.fail((e as Error).message);
      return;
    }
    this.socket = socket;
    socket.onopen = () => {
      this.retry = 0;
      socket.send(JSON.stringify({ t: 'join', room: this.opts.link.room, id: this.opts.me.id }));
    };
    socket.onmessage = (ev) => {
      let msg: ServerMessage;
      try {
        msg = JSON.parse(String(ev.data)) as ServerMessage;
      } catch {
        return;
      }
      void this.run(() => this.handle(msg)).catch((e) => console.warn('[thread.io] collab message', e));
    };
    socket.onclose = () => {
      if (this.socket !== socket) return;
      this.live = false;
      this.socket = null;
      clearInterval(this.presenceTimer);
      this.peers.clear();
      if (this.stopped) return;
      if (this.state !== 'error') this.state = 'offline';
      this.report();
      const delay = Math.min(15_000, 1000 * 2 ** this.retry++);
      this.timers.push(setTimeout(() => this.connect(), delay));
    };
    socket.onerror = () => {
      this.error = `Cannot reach ${this.opts.link.server}`;
    };
  }

  private fail(error: string) {
    this.state = 'error';
    this.error = error;
    this.report();
  }

  private async handle(msg: ServerMessage) {
    switch (msg.t) {
      case 'welcome': {
        // Apply what the room already has, then send only what the room is missing.
        const roomDoc = new Y.Doc();
        for (const sealed of msg.log) {
          try {
            const update = await open(this.key, sealed);
            Y.applyUpdate(roomDoc, update);
            Y.applyUpdate(this.doc, update, REMOTE);
          } catch {
            this.fail('This invite’s key does not match the room. Ask for a fresh invite.');
            return;
          }
        }
        this.logLength = msg.log.length;
        this.live = true;
        this.state = 'live';
        this.error = undefined;
        const missing = Y.encodeStateAsUpdate(this.doc, Y.encodeStateVector(roomDoc));
        if (missing.length > 2) this.send(missing);
        roomDoc.destroy();
        this.report();
        await this.sendPresence();
        clearInterval(this.presenceTimer);
        this.presenceTimer = setInterval(() => void this.sendPresence(), PRESENCE_EVERY);
        this.scheduleSync(0);
        return;
      }
      case 'update': {
        try {
          Y.applyUpdate(this.doc, await open(this.key, msg.d), REMOTE);
          this.logLength++;
        } catch {
          /* not for us (wrong key); ignore */
        }
        return;
      }
      case 'compact': {
        const snapshot = await seal(this.key, Y.encodeStateAsUpdate(this.doc));
        this.socket?.send(JSON.stringify({ t: 'snapshot', d: snapshot, upTo: msg.upTo }));
        return;
      }
      case 'presence': {
        try {
          const p = await openJson<Peer>(this.key, msg.d);
          if (p.id && p.id !== this.opts.me.id) this.peers.set(p.id, { ...p, at: Date.now() });
          this.report();
        } catch {
          /* ignore */
        }
        return;
      }
      case 'peer-joined':
        await this.sendPresence();
        return;
      case 'peer-left':
        this.peers.delete(msg.id);
        this.report();
        return;
      case 'error':
        this.fail(msg.error);
        return;
    }
  }

  private send(update: Uint8Array) {
    if (!this.live || !this.socket) return; // reconnecting: the welcome handshake sends whatever is missing
    const socket = this.socket;
    this.outbox = this.outbox.then(async () => {
      const d = await seal(this.key, update);
      if (socket.readyState === 1) socket.send(JSON.stringify({ t: 'update', d }));
    });
  }

  private async sendPresence() {
    const now = Date.now();
    for (const [id, p] of this.peers) if (now - p.at > PEER_TIMEOUT) this.peers.delete(id);
    if (!this.live || !this.socket) return;
    const { id, name, color } = this.opts.me;
    const d = await sealJson(this.key, { id, name, color, at: now });
    this.socket?.send(JSON.stringify({ t: 'presence', d }));
    this.report();
  }

  // --- Merging ----------------------------------------------------------------------

  private scheduleSync(delay: number) {
    clearTimeout(this.syncTimer);
    if (!this.syncDone) this.synced = new Promise((r) => (this.syncDone = r));
    this.syncTimer = setTimeout(() => {
      const done = this.syncDone;
      this.syncDone = null;
      void this.run(() => this.sync())
        .catch((e) => console.warn('[thread.io] collab sync', e))
        .finally(() => done?.());
    }, delay);
  }

  /** Merges local records and the shared document; runs one at a time on fresh reads. */
  private async sync() {
    if (this.stopped) return;
    const { db, wsId } = this.opts;
    const ws = await db.workspaces.get(wsId);
    if (!ws) return;
    const local = new Map<SyncTable, Map<string, Rec>>();
    for (const t of SYNC_TABLES) {
      const rows = (await db.table(t).where('wsId').equals(wsId).toArray()) as Rec[];
      local.set(t, new Map(rows.map((r) => [r.id as string, r])));
    }

    const puts: { table: SyncTable; rec: Rec }[] = [];
    const deletes: { table: SyncTable; id: string }[] = [];
    let wsPatch: Rec | null = null;

    this.doc.transact(() => {
      // Workspace meta (goal, name, mode, settings).
      const yws = this.doc.getMap<unknown>('ws');
      const L = projectWorkspace(ws as unknown as Rec);
      const R = yws.size ? (yws.toJSON() as Rec) : undefined;
      const B = this.base.get('ws');
      const merged = R ? (same(L, R) ? L : mergeFields(L, R, B)) : L;
      if (!same(merged, R)) writeMap(yws, merged);
      if (!same(merged, L)) wsPatch = merged;
      this.base.set('ws', merged);

      for (const table of SYNC_TABLES) {
        const ymap = this.doc.getMap<Y.Map<unknown>>(table);
        const rows = local.get(table)!;
        const ids = new Set([...rows.keys(), ...ymap.keys()]);
        for (const id of ids) {
          const key = `${table}:${id}`;
          const localRow = rows.get(id);
          const L = localRow ? project(table, localRow) : undefined;
          const ym = ymap.get(id);
          const R = ym instanceof Y.Map ? (ym.toJSON() as Rec) : undefined;
          const B = this.base.get(key);
          if (L && !R) {
            if (B)
              deletes.push({ table, id }); // a teammate deleted it
            else ymap.set(id, toYMap(L)); // new here: share it
            if (B) this.base.delete(key);
            else this.base.set(key, L);
          } else if (!L && R) {
            if (B) {
              ymap.delete(id); // deleted here: delete for everyone
              this.base.delete(key);
            } else {
              puts.push({ table, rec: withLocalFields(table, R, undefined) }); // a teammate's new record
              this.base.set(key, R);
            }
          } else if (L && R) {
            if (same(L, R)) {
              this.base.set(key, L);
              continue;
            }
            const merged = mergeFields(L, R, B);
            if (!same(merged, R)) writeMap(ym as Y.Map<unknown>, merged);
            if (!same(merged, L)) puts.push({ table, rec: withLocalFields(table, merged, localRow) });
            this.base.set(key, merged);
          }
        }
      }
    });

    if (puts.length || deletes.length || wsPatch) {
      await db.transaction('rw', [db.workspaces, ...SYNC_TABLES.map((t) => db.table(t))], async () => {
        if (wsPatch) await db.workspaces.update(wsId, wsPatch as Partial<Workspace>);
        for (const { table, rec } of puts) await db.table(table).put(rec);
        for (const { table, id } of deletes) await db.table(table).delete(id);
      });
    }
    this.schedulePersist();
  }

  private schedulePersist() {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => void this.persist(), 1000);
  }

  private async persist() {
    await this.opts.db.sync.put({
      wsId: this.opts.wsId,
      doc: Y.encodeStateAsUpdate(this.doc),
      base: Object.fromEntries(this.base),
      at: Date.now(),
    });
  }

  /** Room log length seen so far (diagnostics). */
  get logSize() {
    return this.logLength;
  }
}

function toYMap(rec: Rec): Y.Map<unknown> {
  const m = new Y.Map<unknown>();
  for (const [k, v] of Object.entries(rec)) m.set(k, v);
  return m;
}

function writeMap(m: Y.Map<unknown>, rec: Rec) {
  for (const [k, v] of Object.entries(rec)) {
    if (JSON.stringify(m.get(k)) !== JSON.stringify(v)) m.set(k, v);
  }
  for (const k of [...m.keys()]) if (!(k in rec)) m.delete(k);
}
