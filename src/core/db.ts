import Dexie, { type EntityTable } from 'dexie';
import type { Link, Question, Rule, StoredVector, TrailEvent, TrailNode, Workspace, WorkspaceSettings } from './types';
import { now, uid } from './util';

export class ThreadDB extends Dexie {
  workspaces!: EntityTable<Workspace, 'id'>;
  questions!: EntityTable<Question, 'id'>;
  nodes!: EntityTable<TrailNode, 'id'>;
  links!: EntityTable<Link, 'id'>;
  rules!: EntityTable<Rule, 'id'>;
  events!: EntityTable<TrailEvent, 'seq'>;
  vectors!: EntityTable<StoredVector, 'key'>;

  constructor(name = 'thread-io') {
    super(name);
    this.version(1).stores({
      workspaces: 'id, updatedAt',
      questions: 'id, wsId, [wsId+order]',
      nodes: 'id, wsId, kind, [wsId+url], createdAt',
      links: 'id, wsId, from, to',
      rules: 'id, wsId, nodeId',
      events: '++seq, wsId, [wsId+at]',
      vectors: 'key, at',
    });
  }
}

export const db = new ThreadDB();

export const DEFAULT_WS_SETTINGS: WorkspaceSettings = {
  aiMode: 'suggest',
  requireHighlight: true,
  staleMonths: 24,
};

export function newWorkspace(name: string, goal = ''): Workspace {
  const t = now();
  return {
    id: uid('ws_'),
    name,
    goal,
    mode: goal ? 'gps' : 'explore',
    settings: { ...DEFAULT_WS_SETTINGS },
    createdAt: t,
    updatedAt: t,
  };
}

export async function logEvent(event: Omit<TrailEvent, 'at' | 'seq'> & { at?: number }) {
  await db.events.add({ at: now(), ...event });
}

export async function touchWorkspace(wsId: string) {
  await db.workspaces.update(wsId, { updatedAt: now() });
}

export async function workspaceData(wsId: string) {
  const [ws, questions, nodes, links, rules] = await Promise.all([
    db.workspaces.get(wsId),
    db.questions.where('wsId').equals(wsId).sortBy('order'),
    db.nodes.where('wsId').equals(wsId).toArray(),
    db.links.where('wsId').equals(wsId).toArray(),
    db.rules.where('wsId').equals(wsId).toArray(),
  ]);
  return { ws, questions, nodes, links, rules };
}

export async function deleteWorkspace(wsId: string) {
  await db.transaction('rw', [db.workspaces, db.questions, db.nodes, db.links, db.rules, db.events], async () => {
    await db.questions.where('wsId').equals(wsId).delete();
    await db.nodes.where('wsId').equals(wsId).delete();
    await db.links.where('wsId').equals(wsId).delete();
    await db.rules.where('wsId').equals(wsId).delete();
    await db.events.where('[wsId+at]').between([wsId, Dexie.minKey], [wsId, Dexie.maxKey]).delete();
    await db.workspaces.delete(wsId);
  });
}
