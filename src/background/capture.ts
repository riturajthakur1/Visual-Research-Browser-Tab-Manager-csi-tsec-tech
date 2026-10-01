// Turns browsing into the trail: which search led to which page, which page
// opened which, and what each page says. Only runs while recording is on
// (or when the user explicitly adds a page), never in private windows, and
// never on blocklisted or sign-in pages.
import { db, logEvent } from '../core/db';
import { guessPageType } from '../core/page-type';
import { isBlocked } from '../core/privacy';
import { parseSearchUrl } from '../core/search-urls';
import { getSettings, updateSettings } from '../core/settings';
import { addHighlight, createWorkspace } from '../core/actions';
import type { ID, TrailNode } from '../core/types';
import { hostname, normalizeUrl, now, siteOf, uid } from '../core/util';
import { extractPage, type ExtractedPage } from './extract';
import { enqueue, queueHighlightRefresh } from './queue';
import { clearTab, getTab, setTab } from './tab-state';

// Navigations that start fresh instead of continuing a trail.
const FRESH_TRANSITIONS = new Set([
  'typed',
  'auto_bookmark',
  'generated',
  'keyword',
  'keyword_generated',
  'start_page',
]);

let hostAccess: boolean | null = null;
export async function hasHostAccess(): Promise<boolean> {
  hostAccess ??= await chrome.permissions.contains({ origins: ['<all_urls>'] });
  return hostAccess;
}
chrome.permissions.onAdded.addListener(() => (hostAccess = null));
chrome.permissions.onRemoved.addListener(() => (hostAccess = null));

/** The workspace captures go to; created on first use. */
export async function activeWorkspaceId(): Promise<ID> {
  const s = await getSettings();
  if (s.activeWsId && (await db.workspaces.get(s.activeWsId))) return s.activeWsId;
  const latest = await db.workspaces.orderBy('updatedAt').last();
  if (latest) {
    await updateSettings({ activeWsId: latest.id });
    return latest.id;
  }
  const ws = await createWorkspace(`Research · ${new Date().toLocaleDateString()}`);
  await updateSettings({ activeWsId: ws.id });
  return ws.id;
}

async function finder(): Promise<TrailNode['foundBy']> {
  const { profile } = await getSettings();
  return profile?.id ? { ...profile, name: profile.name.trim() || 'Teammate' } : undefined;
}

async function blankNode(wsId: ID, kind: TrailNode['kind'], url: string, title: string): Promise<TrailNode> {
  const t = now();
  return {
    foundBy: await finder(),
    id: uid('n_'),
    wsId,
    kind,
    url,
    canonicalUrl: normalizeUrl(url),
    title,
    site: siteOf(url),
    keyTerms: [],
    pageType: kind === 'search' ? 'search' : guessPageType(url, { title }),
    tags: [],
    notes: '',
    highlights: [],
    importance: 0,
    status: 'open',
    prov: { openedAt: t },
    visits: 1,
    timeSpentMs: 0,
    createdAt: t,
    updatedAt: t,
  };
}

async function findByUrl(wsId: ID, url: string): Promise<TrailNode | undefined> {
  return db.nodes
    .where('[wsId+canonicalUrl]')
    .equals([wsId, normalizeUrl(url)])
    .first();
}

async function upsertSearch(
  wsId: ID,
  url: string,
  engine: string,
  query: string,
  questionTag?: ID,
): Promise<TrailNode> {
  const existing = await findByUrl(wsId, url);
  if (existing) {
    const patch: Partial<TrailNode> = { visits: existing.visits + 1, updatedAt: now(), status: 'open' };
    if (questionTag && !existing.prov.questionTag) patch.prov = { ...existing.prov, questionTag };
    await db.nodes.update(existing.id, patch);
    return { ...existing, ...patch };
  }
  const node = { ...(await blankNode(wsId, 'search', url, query)), query, engine };
  node.prov.questionTag = questionTag;
  await db.nodes.add(node);
  await logEvent({ wsId, type: 'node.add', nodeId: node.id, data: { kind: 'search', query } });
  return node;
}

async function upsertPage(
  wsId: ID,
  url: string,
  title: string,
  prov: Partial<TrailNode['prov']>,
): Promise<{ node: TrailNode; created: boolean }> {
  const existing = await findByUrl(wsId, url);
  if (existing) {
    const patch: Partial<TrailNode> = { visits: existing.visits + 1, status: 'open', updatedAt: now() };
    // A page first seen without context keeps the first real trail it gets.
    if (!existing.prov.openerId && !existing.prov.searchId && (prov.openerId || prov.searchId)) {
      patch.prov = { ...existing.prov, ...prov };
    }
    // Reopening a page from a gap's prepared search is deliberate: file it there,
    // unless the user already placed it themselves.
    const firm = existing.attach?.method === 'user' || existing.attach?.method === 'prepared';
    if (prov.questionTag && prov.questionTag !== existing.prov.questionTag && !firm) {
      patch.prov = { ...existing.prov, ...prov };
    }
    await db.nodes.update(existing.id, patch);
    return { node: { ...existing, ...patch }, created: false };
  }
  const node = await blankNode(wsId, 'page', url, title || hostname(url));
  node.prov = { ...node.prov, ...prov };
  await db.nodes.add(node);
  await logEvent({ wsId, type: 'node.add', nodeId: node.id, data: { kind: 'page' } });
  return { node, created: true };
}

async function capturable(tabId: number, url: string): Promise<boolean> {
  const s = await getSettings();
  if (isBlocked(url, s.blocklist)) return false;
  try {
    const tab = await chrome.tabs.get(tabId);
    return !tab.incognito;
  } catch {
    return false;
  }
}

/**
 * A top-level navigation committed in a tab. Records search pages as search
 * nodes and other pages as page nodes linked to whatever led to them.
 */
export async function onNavigation(
  tabId: number,
  url: string,
  transition: string,
  qualifiers: string[],
  force = false,
): Promise<void> {
  const settings = await getSettings();
  if (!force && !settings.recording) return;
  if (!(await capturable(tabId, url))) {
    // Leaving the trail: the next page in this tab starts fresh.
    await setTab(tabId, { nodeId: undefined, url, openerTabId: undefined, pendingExtract: false });
    return;
  }
  const wsId = await activeWorkspaceId();
  const state = await getTab(tabId);
  if (transition === 'reload' || qualifiers.includes('forward_back')) {
    const known = await findByUrl(wsId, url);
    await setTab(tabId, { wsId, nodeId: known?.id, url, openerTabId: undefined });
    return;
  }

  // What led here: the previous page in this tab, or the page in the tab that opened it.
  const fresh = FRESH_TRANSITIONS.has(transition) && !state.pendingTag;
  let previousId: ID | undefined;
  if (!fresh) {
    if (state.openerTabId !== undefined) previousId = (await getTab(state.openerTabId)).nodeId;
    else if (state.url !== url) previousId = state.nodeId;
  }
  const previous = previousId ? await db.nodes.get(previousId) : undefined;
  const sameWorkspace = previous?.wsId === wsId ? previous : undefined;

  const hit = parseSearchUrl(url);
  if (hit) {
    const tag = state.pendingTag ?? (sameWorkspace?.kind === 'search' ? sameWorkspace.prov.questionTag : undefined);
    const search = await upsertSearch(wsId, url, hit.engine, hit.query, tag);
    await setTab(tabId, {
      wsId,
      nodeId: search.id,
      url,
      openerTabId: undefined,
      pendingTag: undefined,
      pendingExtract: false,
    });
    enqueue({ kind: 'proposals', wsId });
    return;
  }

  const prov: Partial<TrailNode['prov']> = { transition, openedAt: now() };
  if (sameWorkspace?.kind === 'search') {
    prov.searchId = sameWorkspace.id;
    prov.questionTag = sameWorkspace.prov.questionTag;
  } else if (sameWorkspace?.kind === 'page') {
    prov.openerId = sameWorkspace.id;
  }
  const tab = await chrome.tabs.get(tabId).catch(() => undefined);
  const { node } = await upsertPage(wsId, url, tab?.title ?? '', prov);
  await setTab(tabId, {
    wsId,
    nodeId: node.id,
    url,
    openerTabId: undefined,
    pendingTag: undefined,
    pendingExtract: true,
  });
  // Fast or cached pages can finish loading before we get here; read them now.
  const latest = await chrome.tabs.get(tabId).catch(() => undefined);
  if (latest?.status === 'complete' && latest.url?.split('#')[0] === url.split('#')[0])
    await onPageLoaded(tabId, latest);
}

/** Reads the page once it finished loading, then hands it to the engine. */
export async function onPageLoaded(tabId: number, tab: chrome.tabs.Tab): Promise<void> {
  const state = await getTab(tabId);
  if (!state.pendingExtract || !state.nodeId) return;
  await setTab(tabId, { pendingExtract: false });
  await readIntoNode(tabId, state.nodeId, tab);
}

export async function readIntoNode(tabId: number, nodeId: ID, tab?: chrome.tabs.Tab): Promise<void> {
  const node = await db.nodes.get(nodeId);
  if (!node || node.kind !== 'page') return;
  let page: ExtractedPage | undefined;
  // Works with full site access, or for one tab via activeTab (menu, shortcut, toolbar).
  try {
    const [res] = await chrome.scripting.executeScript({ target: { tabId }, func: extractPage });
    page = res?.result as ExtractedPage | undefined;
  } catch {
    /* no access to this site yet, a restricted page (web store, PDF viewer), or a closed tab */
  }
  const t = tab ?? (await chrome.tabs.get(tabId).catch(() => undefined));
  const patch: Partial<TrailNode> = {
    title: page?.title || t?.title || node.title,
    favicon: t?.favIconUrl || page?.favicon || node.favicon,
    updatedAt: now(),
  };
  if (page) {
    Object.assign(patch, {
      description: page.description,
      image: page.image,
      author: page.author,
      publishedAt: page.publishedAt,
      lang: page.lang,
      text: page.text,
      outLinks: page.outLinks,
      site: siteOf(node.url),
      pageType: guessPageType(node.url, { ogType: page.ogType, title: page.title }),
      // Content changed (or arrived for the first time): summarise again.
      enriched: node.text === page.text ? node.enriched : false,
    });
  }
  await db.nodes.update(nodeId, patch);
  enqueue({ kind: 'node', nodeId });
}

/** "Add this page": captures the active tab even when recording is off. */
export async function captureTab(tab: chrome.tabs.Tab): Promise<ID | undefined> {
  if (!tab.id || !tab.url || !(await capturable(tab.id, tab.url))) return undefined;
  const wsId = await activeWorkspaceId();
  const state = await getTab(tab.id);
  const known = state.nodeId ? await db.nodes.get(state.nodeId) : undefined;
  if (known && known.wsId === wsId && normalizeUrl(known.url) === normalizeUrl(tab.url)) {
    await readIntoNode(tab.id, known.id, tab);
    return known.id;
  }
  const hit = parseSearchUrl(tab.url);
  if (hit) {
    const s = await upsertSearch(wsId, tab.url, hit.engine, hit.query);
    await setTab(tab.id, { wsId, nodeId: s.id, url: tab.url });
    return s.id;
  }
  const { node } = await upsertPage(wsId, tab.url, tab.title ?? '', { transition: 'manual', openedAt: now() });
  await setTab(tab.id, { wsId, nodeId: node.id, url: tab.url, pendingExtract: false });
  await readIntoNode(tab.id, node.id, tab);
  return node.id;
}

/** Maps every tab in the window, keeping opener relationships between them. */
export async function captureWindow(windowId?: number): Promise<number> {
  const tabs = await chrome.tabs.query(windowId ? { windowId } : { currentWindow: true });
  let count = 0;
  const ordered = tabs.sort((a, b) => (a.openerTabId === b.id ? 1 : b.openerTabId === a.id ? -1 : a.index - b.index));
  for (const tab of ordered) {
    if (!tab.id || !tab.url || !/^https?:/.test(tab.url)) continue;
    if (tab.openerTabId !== undefined) await setTab(tab.id, { openerTabId: tab.openerTabId });
    if (await captureTab(tab)) count++;
  }
  return count;
}

export async function addHighlightFromTab(tab: chrome.tabs.Tab, text: string): Promise<boolean> {
  if (!tab.id || !text.trim()) return false;
  const nodeId = await captureTab(tab);
  if (!nodeId) return false;
  const h = await addHighlight(nodeId, text);
  const node = await db.nodes.get(nodeId);
  if (h && node) queueHighlightRefresh(node.wsId);
  return !!h;
}

export async function onTabRemoved(tabId: number) {
  const state = await getTab(tabId);
  await clearTab(tabId);
  if (!state.nodeId) return;
  const node = await db.nodes.get(state.nodeId);
  if (node && node.status === 'open') await db.nodes.update(state.nodeId, { status: 'closed' });
}

/** Rough reading time per page: time its tab spent in front. */
export async function onTabActivated(tabId: number, previousTabId?: number) {
  const t = now();
  if (previousTabId !== undefined) {
    const prev = await getTab(previousTabId);
    if (prev.nodeId && prev.activeSince) {
      const node = await db.nodes.get(prev.nodeId);
      if (node)
        await db.nodes.update(prev.nodeId, {
          timeSpentMs: node.timeSpentMs + Math.min(t - prev.activeSince, 30 * 60_000),
        });
    }
    await setTab(previousTabId, { activeSince: undefined });
  }
  await setTab(tabId, { activeSince: t });
}
