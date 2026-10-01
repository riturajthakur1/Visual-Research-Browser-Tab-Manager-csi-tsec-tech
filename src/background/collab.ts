// Keeps one live session per shared workspace and publishes their status and
// who is online to session storage, where the side panel and map read it.
// An open WebSocket with regular presence messages keeps the worker alive.
import { liveQuery } from 'dexie';
import { CollabSession, type SessionStatus } from '../core/collab/session';
import { db } from '../core/db';
import { ensureProfile, onSettingsChanged } from '../core/settings';
import type { CollabLink, ID, Member, Workspace } from '../core/types';

export const COLLAB_STATUS_KEY = 'collab';

const sessions = new Map<ID, { session: CollabSession; link: CollabLink }>();
const statuses: Record<ID, SessionStatus> = {};
let publishTimer: ReturnType<typeof setTimeout> | undefined;
let queue: Promise<unknown> = Promise.resolve();

function publish() {
  clearTimeout(publishTimer);
  publishTimer = setTimeout(() => void chrome.storage.session.set({ [COLLAB_STATUS_KEY]: statuses }), 100);
}

const displayed = (m: Member): Member => ({ ...m, name: m.name.trim() || 'Teammate' });
const sameLink = (a: CollabLink, b: CollabLink) => a.server === b.server && a.room === b.room && a.key === b.key;

function reconcile(list: Workspace[]) {
  queue = queue
    .then(async () => {
      const wanted = new Map(list.filter((w) => w.collab).map((w) => [w.id, w.collab!]));
      for (const [id, entry] of sessions) {
        const link = wanted.get(id);
        if (!link || !sameLink(link, entry.link)) {
          entry.session.stop();
          sessions.delete(id);
          delete statuses[id];
        }
      }
      if (wanted.size) {
        const me = displayed(await ensureProfile());
        for (const [id, link] of wanted) {
          if (sessions.has(id)) continue;
          const session = new CollabSession({
            db,
            wsId: id,
            link,
            me,
            onStatus: (s) => {
              statuses[id] = s;
              publish();
            },
          });
          sessions.set(id, { session, link });
          await session.start();
        }
      }
      publish();
    })
    .catch((e) => console.warn('[thread.io] collab', e));
}

export function startCollab() {
  liveQuery(() => db.workspaces.toArray()).subscribe({
    next: reconcile,
    error: (e) => console.warn('[thread.io] collab watch', e),
  });
  onSettingsChanged((s) => {
    if (!s.profile?.id) return;
    for (const { session } of sessions.values()) session.setProfile(displayed(s.profile));
  });
}
