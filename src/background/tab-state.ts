// What each open tab is showing, as far as the trail is concerned. Kept in
// session storage because the service worker can be stopped at any moment.
import type { ID } from '../core/types';

export interface TabState {
  wsId?: ID;
  /** Node for the page currently shown in the tab. */
  nodeId?: ID;
  url?: string;
  /** Tab that opened this one (link click with a new tab). Consumed by the first navigation. */
  openerTabId?: number;
  /** Set by "fill gap": the next search in this tab belongs to this question. */
  pendingTag?: ID;
  /** Page waiting for its content to be read once loading completes. */
  pendingExtract?: boolean;
  activeSince?: number;
}

const KEY = 'tabState';
let cache: Map<number, TabState> | null = null;
let loading: Promise<Map<number, TabState>> | null = null;
let saveTimer: ReturnType<typeof setTimeout> | undefined;

async function load(): Promise<Map<number, TabState>> {
  if (cache) return cache;
  loading ??= chrome.storage.session.get(KEY).then((r) => {
    cache = new Map(Object.entries((r[KEY] as Record<string, TabState>) ?? {}).map(([k, v]) => [Number(k), v]));
    return cache;
  });
  return loading;
}

function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    if (cache) void chrome.storage.session.set({ [KEY]: Object.fromEntries(cache) });
  }, 50);
}

export async function getTab(tabId: number): Promise<TabState> {
  return (await load()).get(tabId) ?? {};
}

export async function setTab(tabId: number, patch: Partial<TabState>): Promise<TabState> {
  const map = await load();
  const next = { ...map.get(tabId), ...patch };
  map.set(tabId, next);
  persist();
  return next;
}

export async function clearTab(tabId: number) {
  const map = await load();
  map.delete(tabId);
  persist();
}

export async function allTabs(): Promise<Map<number, TabState>> {
  return load();
}

export async function tabsForNode(nodeId: ID): Promise<number[]> {
  const map = await load();
  return [...map.entries()].filter(([, s]) => s.nodeId === nodeId).map(([id]) => id);
}
