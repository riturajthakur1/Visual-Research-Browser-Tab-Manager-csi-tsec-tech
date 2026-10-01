// Browser side effects: opening and focusing pages, the gap-filling search,
// side-by-side comparison, and hibernating a workspace's tabs.
import { db } from '../core/db';
import type { ScreenBox } from '../core/messages';
import { buildSearchUrl } from '../core/search-urls';
import { getSettings } from '../core/settings';
import type { HibernatedTab, ID } from '../core/types';
import { now } from '../core/util';
import { allTabs, setTab, tabsForNode } from './tab-state';

async function focusTab(tabId: number) {
  const tab = await chrome.tabs.update(tabId, { active: true });
  if (tab?.windowId !== undefined) await chrome.windows.update(tab.windowId, { focused: true });
}

export async function openNode(nodeId: ID) {
  const node = await db.nodes.get(nodeId);
  if (!node?.url) return;
  for (const tabId of await tabsForNode(nodeId)) {
    try {
      await focusTab(tabId);
      return;
    } catch {
      /* tab is gone */
    }
  }
  await chrome.tabs.create({ url: node.url, active: true });
}

export async function openUrl(url: string) {
  await chrome.tabs.create({ url, active: true });
}

/** Runs a prepared search; pages opened from it are filed under the question with certainty. */
export async function fillGap(wsId: ID, questionId: ID, query: string) {
  const { searchEngine } = await getSettings();
  // Tag the tab before it navigates so the commit cannot race the tag.
  const tab = await chrome.tabs.create({ url: 'about:blank', active: true });
  if (!tab.id) return;
  await setTab(tab.id, { wsId, pendingTag: questionId });
  await chrome.tabs.update(tab.id, { url: buildSearchUrl(searchEngine, query) });
}

export async function sideBySide(nodeIds: [ID, ID], screen: ScreenBox) {
  const nodes = await Promise.all(nodeIds.map((id) => db.nodes.get(id)));
  const half = Math.floor(screen.width / 2);
  await Promise.all(
    nodes.map((n, i) =>
      n?.url
        ? chrome.windows.create({
            url: n.url,
            left: screen.left + i * half,
            top: screen.top,
            width: half,
            height: screen.height,
            focused: true,
          })
        : undefined,
    ),
  );
}

export async function openMap(wsId?: ID, focus?: ID) {
  const base = chrome.runtime.getURL('map.html');
  const params = new URLSearchParams();
  if (wsId) params.set('ws', wsId);
  if (focus) params.set('focus', focus);
  const url = params.size ? `${base}?${params}` : base;
  const [existing] = await chrome.tabs.query({ url: `${base}*` });
  if (existing?.id) {
    await chrome.tabs.update(existing.id, { url, active: true });
    if (existing.windowId !== undefined) await chrome.windows.update(existing.windowId, { focused: true });
  } else {
    await chrome.tabs.create({ url, active: true });
  }
}

/** Closes the workspace's tabs and remembers them, so the user can close tabs without fear. */
export async function hibernate(wsId: ID): Promise<number> {
  const states = await allTabs();
  const tabs = await chrome.tabs.query({});
  const mine = tabs.filter(
    (t) => t.id !== undefined && states.get(t.id)?.wsId === wsId && /^https?:/.test(t.url ?? ''),
  );
  if (!mine.length) return 0;
  const saved: HibernatedTab[] = mine.map((t) => ({
    url: t.url!,
    title: t.title,
    pinned: !!t.pinned,
    active: !!t.active,
  }));
  const ws = await db.workspaces.get(wsId);
  const previous = ws?.hibernated?.tabs ?? [];
  const known = new Set(previous.map((t) => t.url));
  await db.workspaces.update(wsId, {
    hibernated: { at: now(), tabs: [...previous, ...saved.filter((t) => !known.has(t.url))] },
    updatedAt: now(),
  });

  const nodeIds = new Set(mine.map((t) => states.get(t.id!)?.nodeId).filter(Boolean) as ID[]);
  await Promise.all([...nodeIds].map((id) => db.nodes.update(id, { status: 'hibernated' })));

  // Never close a window by emptying it: leave the map open in its place.
  const byWindow = new Map<number, number>();
  for (const t of tabs) byWindow.set(t.windowId, (byWindow.get(t.windowId) ?? 0) + 1);
  for (const [windowId, total] of byWindow) {
    const closing = mine.filter((t) => t.windowId === windowId).length;
    if (closing && closing === total) {
      await chrome.tabs.create({ windowId, url: chrome.runtime.getURL(`map.html?ws=${wsId}`) });
    }
  }
  await chrome.tabs.remove(mine.map((t) => t.id!));
  return mine.length;
}

export async function restore(wsId: ID): Promise<number> {
  const ws = await db.workspaces.get(wsId);
  const saved = ws?.hibernated?.tabs ?? [];
  if (!saved.length) return 0;
  const win = await chrome.windows.getLastFocused();
  let activeId: number | undefined;
  for (const t of saved) {
    const tab = await chrome.tabs.create({ url: t.url, pinned: t.pinned, active: false, windowId: win.id });
    if (tab.id !== undefined) {
      await setTab(tab.id, { wsId });
      if (t.active) activeId = tab.id;
    }
  }
  if (activeId !== undefined) await focusTab(activeId);
  const nodes = await db.nodes.where('wsId').equals(wsId).toArray();
  await Promise.all(
    nodes.filter((n) => n.status === 'hibernated').map((n) => db.nodes.update(n.id, { status: 'open' })),
  );
  await db.workspaces.update(wsId, { hibernated: undefined, updatedAt: now() });
  return saved.length;
}
