// Two people, two databases, one encrypted relay: checks that a shared route
// stays in sync both ways, merges field by field, and never leaks plaintext.
import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startRelay, type Relay } from '../../collab-server/server.mjs';
import { fromB64, newKey } from '../../src/core/collab/crypto';
import { decodeInvite, encodeInvite } from '../../src/core/collab/invite';
import { mergeFields } from '../../src/core/collab/merge';
import { CollabSession } from '../../src/core/collab/session';
import { newWorkspace, ThreadDB } from '../../src/core/db';
import type { CollabLink, Member, Question, TrailNode, Workspace } from '../../src/core/types';
import { makePage, makeQuestion } from './helpers';

const alice: Member = { id: 'm_alice', name: 'Alice', color: '#C8160C' };
const bob: Member = { id: 'm_bob', name: 'Bob', color: '#2563EB' };

async function until<T>(read: () => Promise<T>, ok: (v: T) => boolean, timeout = 8000): Promise<T> {
  const start = Date.now();
  for (;;) {
    const v = await read();
    if (ok(v)) return v;
    if (Date.now() - start > timeout) throw new Error(`timed out; last value: ${JSON.stringify(v)?.slice(0, 300)}`);
    await new Promise((r) => setTimeout(r, 50));
  }
}

describe('merge', () => {
  it('keeps each side’s change to different fields', () => {
    const base = { id: 'n', notes: '', tags: [], updatedAt: 1 };
    const local = { ...base, notes: 'mine', updatedAt: 2 };
    const remote = { ...base, tags: ['flood'], updatedAt: 3 };
    expect(mergeFields(local, remote, base)).toEqual({ id: 'n', notes: 'mine', tags: ['flood'], updatedAt: 3 });
  });

  it('lets the newer record win when both changed the same field', () => {
    const base = { id: 'n', notes: '', updatedAt: 1 };
    expect(mergeFields({ ...base, notes: 'a', updatedAt: 5 }, { ...base, notes: 'b', updatedAt: 4 }, base).notes).toBe(
      'a',
    );
    expect(mergeFields({ ...base, notes: 'a', updatedAt: 4 }, { ...base, notes: 'b', updatedAt: 5 }, base).notes).toBe(
      'b',
    );
  });
});

describe('invite codes', () => {
  it('round-trip and reject junk', () => {
    const invite = { server: 'ws://192.168.1.20:4545', room: 'ws_abc123', key: newKey(), name: 'Mumbai floods' };
    expect(decodeInvite(encodeInvite(invite))).toEqual(invite);
    expect(decodeInvite('  ' + encodeInvite(invite) + '\n')).toEqual(invite);
    expect(decodeInvite('hello')).toBeNull();
    expect(decodeInvite('thread-io:' + btoa('{"s":"http://x","r":"ws_abc","k":"k"}'))).toBeNull();
  });
});

describe('live session', () => {
  let relay: Relay;
  let dataDir: string;
  let wsId: string;
  let link: CollabLink;
  const dbA = new ThreadDB('collab-alice');
  const dbB = new ThreadDB('collab-bob');
  const sessions: CollabSession[] = [];
  let q1: Question;
  let q2: Question;
  let page: TrailNode;

  const start = async (db: ThreadDB, me: Member) => {
    const s = new CollabSession({ db, wsId, link, me });
    sessions.push(s);
    await s.start();
    return s;
  };

  beforeAll(async () => {
    dataDir = mkdtempSync(join(tmpdir(), 'thread-relay-'));
    relay = await startRelay({ port: 0, dataDir, quiet: true });

    const ws = newWorkspace('Mumbai floods', 'Why does Mumbai flood every monsoon?');
    wsId = ws.id;
    link = { server: `ws://localhost:${relay.port}`, room: ws.id, key: newKey(), role: 'owner', since: Date.now() };
    await dbA.workspaces.add({ ...ws, collab: link });
    q1 = makeQuestion(ws.id, 'How do the drains fail?', 0, ['drains'], ['mumbai drain capacity']);
    q2 = makeQuestion(ws.id, 'What would fix it?', 1, ['solutions'], ['sponge city mumbai']);
    await dbA.questions.bulkAdd([q1, q2]);
    page = {
      ...makePage(ws.id, 'https://city-drains.example/a', { title: 'Drains overflow', questionId: q1.id }),
      foundBy: alice,
    };
    await dbA.nodes.add(page);
    await start(dbA, alice);

    // Bob joins with a placeholder workspace; the shared one replaces it.
    const placeholder: Workspace = {
      ...newWorkspace('Joining…'),
      id: ws.id,
      updatedAt: 0,
      collab: { ...link, role: 'member' },
    };
    await dbB.workspaces.add(placeholder);
    await start(dbB, bob);
  });

  afterAll(async () => {
    sessions.forEach((s) => s.stop());
    await relay.close();
  });

  it('gives a joining teammate the route, pages and who found them', async () => {
    const ws = await until(
      () => dbB.workspaces.get(wsId),
      (w) => w?.goal === 'Why does Mumbai flood every monsoon?',
    );
    expect(ws?.name).toBe('Mumbai floods');
    const qs = await until(
      () => dbB.questions.where('wsId').equals(wsId).toArray(),
      (q) => q.length === 2,
    );
    expect(qs.map((q) => q.text).sort()).toEqual(['How do the drains fail?', 'What would fix it?']);
    const n = await until(
      () => dbB.nodes.get(page.id),
      (x) => !!x,
    );
    expect(n?.foundBy).toEqual(alice);
    expect(n?.attach?.questionId).toBe(q1.id);
    expect(n?.status).toBe('closed'); // tab state is per machine
  });

  it('streams new captures to teammates', async () => {
    const fresh = {
      ...makePage(wsId, 'https://coast.example/b', { title: 'Mangroves', questionId: q2.id }),
      foundBy: bob,
    };
    await dbB.nodes.add(fresh);
    const got = await until(
      () => dbA.nodes.get(fresh.id),
      (x) => !!x,
    );
    expect(got?.foundBy?.name).toBe('Bob');
  });

  it('merges concurrent edits to different fields of the same page', async () => {
    const t = Date.now();
    await Promise.all([
      dbA.nodes.update(page.id, {
        attach: { ...page.attach!, questionId: q2.id, method: 'user', state: 'accepted' },
        updatedAt: t,
      }),
      dbB.nodes.update(page.id, { notes: 'Check the 2005 rainfall figure', updatedAt: t + 1 }),
    ]);
    const both = (n?: TrailNode) => n?.attach?.questionId === q2.id && n?.notes === 'Check the 2005 rainfall figure';
    await until(() => dbA.nodes.get(page.id), both);
    await until(() => dbB.nodes.get(page.id), both);
  });

  it('shares claims on questions', async () => {
    await dbB.questions.update(q1.id, { claimedBy: bob, updatedAt: Date.now() });
    const q = await until(
      () => dbA.questions.get(q1.id),
      (x) => !!x?.claimedBy,
    );
    expect(q?.claimedBy?.name).toBe('Bob');
  });

  it('propagates deletions', async () => {
    const extra = makePage(wsId, 'https://junk.example/c', { title: 'Junk' });
    await dbA.nodes.add(extra);
    await until(
      () => dbB.nodes.get(extra.id),
      (x) => !!x,
    );
    await dbA.nodes.delete(extra.id);
    await until(
      () => dbB.nodes.get(extra.id),
      (x) => !x,
    );
  });

  it('shows who is online', async () => {
    const s = sessions[1];
    await until(
      async () => s.status().peers.map((p) => p.name),
      (names) => names.includes('Alice'),
    );
  });

  it('merges edits made while offline when the teammate reconnects', async () => {
    const bobSession = sessions[1];
    bobSession.stop();
    await new Promise((r) => setTimeout(r, 1200)); // let the final save land
    await dbB.questions.update(q2.id, { text: 'Which fixes have worked elsewhere?', updatedAt: Date.now() });
    await start(dbB, bob);
    await until(
      () => dbA.questions.get(q2.id),
      (q) => q?.text === 'Which fixes have worked elsewhere?',
    );
  });

  it('never gives the relay readable research', async () => {
    await new Promise((r) => setTimeout(r, 700)); // the relay saves on a short delay
    const log = relay.rooms.get(wsId)!.log;
    expect(log.length).toBeGreaterThan(0);
    const blob = log.map((d) => new TextDecoder('latin1').decode(fromB64(d))).join('');
    for (const secret of ['Mumbai', 'drains', 'Mangroves', 'Bob', 'city-drains.example'])
      expect(blob).not.toContain(secret);
    const saved = readdirSync(dataDir)
      .map((f) => readFileSync(join(dataDir, f), 'utf8'))
      .join('');
    expect(saved).not.toContain('Mumbai');
  });
});
