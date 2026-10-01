// The Browse view's simulated browser: in-memory tabs that stand in for
// chrome.tabs, chrome.windows and chrome.scripting, and drive the extension's
// real capture code (background/capture.ts) and engine queue. Searching,
// opening links and saving a selection do what the browser events would do
// in the extension.
import { listModels, isEmbeddingModel, pickChatModel, pickEmbedModel } from '../core/ai/bionic';
import { resetEmbedSpace, resolveEmbedSpace } from '../core/ai/embed';
import { resolveLlm } from '../core/ai/llm';
import type { AiStatus, BackgroundRequest } from '../core/messages';
import { buildSearchUrl, parseSearchUrl } from '../core/search-urls';
import { getSettings, updateSettings } from '../core/settings';
import {
  activeWorkspaceId,
  addHighlightFromTab,
  captureTab,
  captureWindow,
  onNavigation,
  onPageLoaded,
  onTabActivated,
  onTabRemoved,
} from '../background/capture';
import { extractPage, readSelection } from '../background/extract';
import { enqueue } from '../background/queue';
import { fillGap, hibernate, openNode, openUrl, restore, sideBySide } from '../background/tabs';
import { setTab } from '../background/tab-state';
import { extractArticle, findArticle } from './corpus';

export interface SimTab {
  id: number;
  url: string;
  title: string;
  status: 'loading' | 'complete';
  pinned: boolean;
  history: string[];
  index: number;
}

interface SimState {
  tabs: SimTab[];
  activeId?: number;
  /** Two tabs shown side by side ("Compare side by side"). */
  split?: [number, number];
  version: number;
}

const WINDOW_ID = 1;
/** How long a simulated page takes to "load". */
const LOAD_MS = 350;

let state: SimState = { tabs: [], version: 0 };
let nextId = 100;
let selection = '';
const subscribers = new Set<() => void>();

function commit(patch: Partial<SimState>) {
  state = { ...state, ...patch, version: state.version + 1 };
  subscribers.forEach((s) => s());
}

function patchTab(id: number, patch: Partial<SimTab>) {
  commit({ tabs: state.tabs.map((t) => (t.id === id ? { ...t, ...patch } : t)) });
}

export const simBrowser = {
  subscribe(fn: () => void) {
    subscribers.add(fn);
    return () => subscribers.delete(fn);
  },
  snapshot: () => state,
};

export function titleFor(url: string): string {
  if (!url || url === 'about:blank') return 'New tab';
  if (url.includes('map.html')) return 'Thread.io map';
  const hit = parseSearchUrl(url);
  if (hit) return `${hit.query} - Search`;
  return findArticle(url)?.title ?? new URL(url).hostname;
}

const isWeb = (url: string) => /^https?:/.test(url);

function toChromeTab(t: SimTab): chrome.tabs.Tab {
  return {
    id: t.id,
    url: t.url,
    title: t.title,
    status: t.status,
    active: t.id === state.activeId,
    pinned: t.pinned,
    windowId: WINDOW_ID,
    index: state.tabs.indexOf(t),
    incognito: false,
    highlighted: t.id === state.activeId,
    selected: t.id === state.activeId,
    discarded: false,
    autoDiscardable: true,
    groupId: -1,
    frozen: false,
  } as chrome.tabs.Tab;
}

const tabById = (id: number) => state.tabs.find((t) => t.id === id);

// --- Browser actions -------------------------------------------------------------

/** A navigation commits, then the page "loads": the same order the extension sees. */
export async function navigate(tabId: number, url: string, transition = 'link', qualifiers: string[] = []) {
  const tab = tabById(tabId);
  if (!tab) return;
  const back = qualifiers.includes('forward_back');
  const history = back ? tab.history : [...tab.history.slice(0, tab.index + 1), url];
  const index = back ? tab.history.indexOf(url) : history.length - 1;
  patchTab(tabId, { url, title: titleFor(url), status: 'loading', history, index });
  if (isWeb(url)) await onNavigation(tabId, url, transition, qualifiers).catch((e) => console.warn('[sim] capture', e));
  await new Promise((r) => setTimeout(r, LOAD_MS));
  if (tabById(tabId)?.url !== url) return; // navigated away meanwhile
  patchTab(tabId, { status: 'complete' });
  if (isWeb(url)) await onPageLoaded(tabId, toChromeTab(tabById(tabId)!)).catch((e) => console.warn('[sim] read', e));
}

export async function activate(tabId: number) {
  if (state.activeId === tabId || !tabById(tabId)) return;
  const previous = state.activeId;
  commit({ activeId: tabId, split: state.split?.includes(tabId) ? state.split : undefined });
  await onTabActivated(tabId, previous);
}

/** A blank tab next to the active one; navigate it to load a page. */
function addTab(active: boolean, pinned = false): SimTab {
  const tab: SimTab = { id: nextId++, url: '', title: 'New tab', status: 'complete', pinned, history: [], index: -1 };
  const at =
    state.activeId !== undefined ? state.tabs.findIndex((t) => t.id === state.activeId) + 1 : state.tabs.length;
  const tabs = [...state.tabs];
  tabs.splice(at, 0, tab);
  commit({ tabs });
  if (active) void activate(tab.id);
  return tab;
}

/** Address bar: a URL opens directly, anything else is searched. */
export async function typeInAddressBar(tabId: number, input: string) {
  const text = input.trim();
  if (!text) return;
  const looksLikeUrl = /^https?:\/\//.test(text) || /^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(text);
  if (looksLikeUrl) return navigate(tabId, /^https?:/.test(text) ? text : `https://${text}`, 'typed');
  const { searchEngine } = await getSettings();
  return navigate(tabId, buildSearchUrl(searchEngine, text), 'generated');
}

/** A link opened in a new background tab (middle-click or Ctrl-click). */
export async function openLinkInNewTab(sourceTabId: number, url: string) {
  const tab = addTab(false);
  await setTab(tab.id, { openerTabId: sourceTabId }); // webNavigation.onCreatedNavigationTarget
  await navigate(tab.id, url, 'link');
}

export function newTab() {
  addTab(true);
}

export async function closeTab(tabId: number) {
  const i = state.tabs.findIndex((t) => t.id === tabId);
  if (i < 0) return;
  const tabs = state.tabs.filter((t) => t.id !== tabId);
  const activeId = state.activeId === tabId ? (tabs[i] ?? tabs[i - 1])?.id : state.activeId;
  commit({ tabs, split: state.split?.includes(tabId) ? undefined : state.split });
  if (activeId !== state.activeId && activeId !== undefined) await activate(activeId);
  else if (activeId === undefined) commit({ activeId: undefined });
  await onTabRemoved(tabId);
}

export async function goBack(tabId: number, step: -1 | 1) {
  const tab = tabById(tabId);
  const url = tab?.history[tab.index + step];
  if (!tab || url === undefined) return;
  patchTab(tabId, { index: tab.index + step });
  await navigate(tabId, url, 'link', ['forward_back']);
}

export function setSelection(text: string) {
  selection = text;
}

/** The context menu's "Save to Thread.io as evidence". */
export async function saveSelectionAsEvidence(tabId: number, text: string): Promise<boolean> {
  const tab = tabById(tabId);
  return tab ? addHighlightFromTab(toChromeTab(tab), text) : false;
}

export function closeSplit() {
  commit({ split: undefined });
}

/** The Browse view starts with one blank tab. */
export function ensureFirstTab() {
  if (!state.tabs.length) addTab(true);
}

// --- chrome.* stand-ins ------------------------------------------------------------

let splitQueue: number[] = [];

export const simChrome = {
  tabs: {
    async get(id: number) {
      const t = tabById(id);
      if (!t) throw new Error(`No tab with id: ${id}.`);
      return toChromeTab(t);
    },
    async query(q: { active?: boolean; url?: string } = {}) {
      return state.tabs
        .filter((t) => q.active === undefined || (t.id === state.activeId) === q.active)
        .filter((t) => !q.url || t.url.startsWith(q.url.replace(/\*$/, '')))
        .map(toChromeTab);
    },
    async create(props: { url?: string; active?: boolean; pinned?: boolean }) {
      const tab = addTab(props.active ?? true, props.pinned);
      const url = props.url ?? '';
      if (url && url !== 'about:blank') void navigate(tab.id, url, 'link');
      return toChromeTab(tabById(tab.id)!);
    },
    async update(id: number, props: { url?: string; active?: boolean }) {
      if (props.active) await activate(id);
      if (props.url) void navigate(id, props.url, 'link');
      return toChromeTab(tabById(id)!);
    },
    async remove(ids: number | number[]) {
      for (const id of Array.isArray(ids) ? ids : [ids]) await closeTab(id);
    },
  },
  windows: {
    async update() {
      return { id: WINDOW_ID };
    },
    async getLastFocused() {
      return { id: WINDOW_ID };
    },
    /** Only "Compare side by side" opens windows: show the two pages split instead. */
    async create(props: { url?: string }) {
      const tab = await simChrome.tabs.create({ url: props.url, active: true });
      splitQueue.push(tab.id!);
      if (splitQueue.length === 2) {
        commit({ split: [splitQueue[0], splitQueue[1]] });
        splitQueue = [];
      }
      return { id: WINDOW_ID };
    },
  },
  scripting: {
    async executeScript({ target, func }: { target: { tabId: number }; func: () => unknown }) {
      const tab = tabById(target.tabId);
      if (!tab) throw new Error('No tab');
      if (func === extractPage) {
        const page = extractArticle(tab.url);
        if (!page) throw new Error('Cannot read this page');
        return [{ result: page }];
      }
      if (func === readSelection) return [{ result: selection }];
      throw new Error('Unsupported script');
    },
  },
};

// --- Requests from the side panel and map ------------------------------------------

async function aiStatus(fresh = false): Promise<AiStatus> {
  const s = await getSettings();
  if (fresh) resetEmbedSpace();
  const [llm, embed] = await Promise.all([resolveLlm(s, fresh), resolveEmbedSpace(s)]);
  let models: string[] = [];
  let reachable = false;
  try {
    models = await listModels(s.bionicUrl);
    reachable = true;
  } catch {
    /* not running, or started without --cors */
  }
  const cfg = { baseUrl: s.bionicUrl, model: s.bionicModel, embedModel: s.bionicEmbedModel };
  return {
    llm,
    embed: embed ? { kind: embed.kind, label: embed.label } : null,
    bionic: {
      reachable,
      url: s.bionicUrl,
      chatModels: models.filter((m) => !isEmbeddingModel(m)),
      embedModels: models.filter(isEmbeddingModel),
      chat: reachable ? ((await pickChatModel(cfg).catch(() => null)) ?? undefined) : undefined,
      embedModel: reachable ? ((await pickEmbedModel(cfg).catch(() => null)) ?? undefined) : undefined,
    },
    builtin: 'unavailable',
  };
}

export const NOT_HANDLED = Symbol('not handled');

/** What the service worker would do for each request, against the simulated tabs. */
export async function handleBrowseRequest(req: BackgroundRequest): Promise<unknown> {
  switch (req.type) {
    case 'recording.set':
      if (req.on) await activeWorkspaceId();
      await updateSettings({ recording: req.on });
      return req.on;
    case 'workspace.activate':
      await updateSettings({ activeWsId: req.wsId });
      return true;
    case 'capture.activeTab': {
      const tab = state.activeId !== undefined ? tabById(state.activeId) : undefined;
      return tab && isWeb(tab.url) ? captureTab(toChromeTab(tab)) : undefined;
    }
    case 'capture.window':
      return captureWindow();
    case 'gap.fill':
      return fillGap(req.wsId, req.questionId, req.query);
    case 'node.open':
      return openNode(req.nodeId);
    case 'url.open':
      return openUrl(req.url);
    case 'nodes.sideBySide':
      return sideBySide(req.nodeIds, req.screen);
    case 'workspace.hibernate':
      return hibernate(req.wsId);
    case 'workspace.restore':
      return restore(req.wsId);
    case 'engine.reattach':
      enqueue({ kind: 'reattach', wsId: req.wsId, nodeIds: req.nodeIds });
      return true;
    case 'engine.conflicts':
      enqueue({ kind: 'conflicts', wsId: req.wsId, force: req.force });
      return true;
    case 'engine.proposals':
      enqueue({ kind: 'proposals', wsId: req.wsId });
      return true;
    case 'ai.status':
      return aiStatus(req.fresh);
    case 'permissions.status':
      return { allSites: true };
    default:
      return NOT_HANDLED; // map.open: the playground shows its own map
  }
}
