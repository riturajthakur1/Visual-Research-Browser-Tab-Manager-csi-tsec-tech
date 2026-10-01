// A stand-in for the extension APIs, so the side panel and map run in a normal
// browser tab with hot reload. Only what the UI touches is implemented.
// Requests the UI sends to the service worker are answered by `handleRequest`,
// or, once the Browse view is open, by the simulated browser (sim-capture.ts).
import type { AiStatus, BackgroundRequest } from '../core/messages';

type Listener = (changes: Record<string, { oldValue?: unknown; newValue?: unknown }>, area: string) => void;
const listeners = new Set<Listener>();

function area(name: 'local' | 'session') {
  const storageKey = `thread-io-playground:${name}`;
  const read = (): Record<string, unknown> => {
    if (name === 'session') return (window as unknown as { __session?: Record<string, unknown> }).__session ?? {};
    try {
      return JSON.parse(localStorage.getItem(storageKey) ?? '{}');
    } catch {
      return {};
    }
  };
  const write = (data: Record<string, unknown>) => {
    if (name === 'session') (window as unknown as { __session?: Record<string, unknown> }).__session = data;
    else localStorage.setItem(storageKey, JSON.stringify(data));
  };
  return {
    async get(keys?: string | string[] | null) {
      const all = read();
      if (keys == null) return all;
      const list = Array.isArray(keys) ? keys : [keys];
      return Object.fromEntries(list.filter((k) => k in all).map((k) => [k, all[k]]));
    },
    async set(items: Record<string, unknown>) {
      const all = read();
      const changes: Record<string, { oldValue?: unknown; newValue?: unknown }> = {};
      for (const [k, v] of Object.entries(items)) {
        changes[k] = { oldValue: all[k], newValue: v };
        all[k] = v;
      }
      write(all);
      listeners.forEach((l) => l(changes, name));
    },
    async remove(keys: string | string[]) {
      const all = read();
      for (const k of Array.isArray(keys) ? keys : [keys]) delete all[k];
      write(all);
    },
    clear: async () => write({}),
  };
}

export const playgroundState = {
  aiOnline: true,
  /** The Browse view was opened: tabs are simulated and the real engine runs. */
  browse: false,
  toast: (_message: string) => {},
  showMap: () => {},
  showBrowser: () => {},
};

// Loaded on first use: it pulls in the capture code, which needs `chrome` to exist.
const sim = () => import('./sim-capture');
// Requests that open pages; the playground switches to the Browse view for them.
const OPENS_PAGES = new Set(['gap.fill', 'node.open', 'url.open', 'nodes.sideBySide', 'workspace.restore']);

const status = (): AiStatus => ({
  llm: playgroundState.aiOnline ? { provider: 'bionic', label: 'Bionic · google/gemma-4-e2b' } : null,
  embed: playgroundState.aiOnline ? { kind: 'bionic', label: 'Bionic · embeddinggemma-300m' } : null,
  bionic: {
    reachable: playgroundState.aiOnline,
    url: 'http://localhost:1234/v1',
    chatModels: ['google/gemma-4-e2b', 'qwen/qwen3-vl-4b', 'qwen/qwen3-1.7b'],
    embedModels: ['text-embedding-embeddinggemma-300m', 'text-embedding-nomic-embed-text-v1.5'],
    chat: 'google/gemma-4-e2b',
    embedModel: 'text-embedding-embeddinggemma-300m',
  },
  builtin: 'unavailable',
});

async function handleRequest(req: BackgroundRequest): Promise<unknown> {
  if (playgroundState.browse) {
    const { handleBrowseRequest, NOT_HANDLED } = await sim();
    if (OPENS_PAGES.has(req.type)) playgroundState.showBrowser();
    const value = await handleBrowseRequest(req);
    if (value !== NOT_HANDLED) return value;
  }
  const { updateSettings } = await import('../core/settings');
  const { db } = await import('../core/db');
  switch (req.type) {
    case 'ai.status':
      return status();
    case 'workspace.activate':
      await updateSettings({ activeWsId: req.wsId });
      return true;
    case 'recording.set':
      await updateSettings({ recording: req.on });
      return req.on;
    case 'map.open':
      playgroundState.showMap();
      return true;
    case 'workspace.hibernate': {
      await db.workspaces.update(req.wsId, {
        hibernated: { at: Date.now(), tabs: [{ url: 'https://example.org', pinned: false, active: true }] },
      });
      playgroundState.toast('Hibernated: in the extension this closes the research tabs.');
      return 3;
    }
    case 'workspace.restore':
      await db.workspaces.update(req.wsId, { hibernated: undefined });
      playgroundState.toast('Restored: in the extension the tabs reopen.');
      return 3;
    case 'gap.fill':
      playgroundState.toast(`Would open a search for “${req.query}”. Pages opened from it file under that question.`);
      return true;
    case 'node.open':
    case 'url.open':
      playgroundState.toast('Would open or focus that page in a browser tab.');
      return true;
    case 'nodes.sideBySide':
      playgroundState.toast('Would open both sources side by side.');
      return true;
    case 'capture.activeTab':
    case 'capture.window':
      playgroundState.toast('Would add the current tab to the research.');
      return undefined;
    case 'permissions.status':
      return { allSites: true };
    default:
      return true; // engine runs are no-ops here
  }
}

const noopEvent = { addListener() {}, removeListener() {}, hasListener: () => false };

const chromeMock = {
  runtime: {
    id: 'playground',
    getURL: (path: string) => `/${path.replace(/^\//, '')}`,
    sendMessage: async (msg: { target?: string } & BackgroundRequest) => {
      if (msg.target !== 'background') return undefined;
      try {
        return { ok: true, value: await handleRequest(msg) };
      } catch (e) {
        return { ok: false, error: (e as Error).message };
      }
    },
    onMessage: noopEvent,
    getContexts: async () => [],
    ContextType: { OFFSCREEN_DOCUMENT: 'OFFSCREEN_DOCUMENT' },
  },
  storage: {
    local: area('local'),
    session: area('session'),
    onChanged: {
      addListener: (l: Listener) => listeners.add(l),
      removeListener: (l: Listener) => listeners.delete(l),
    },
  },
  permissions: {
    contains: async () => true,
    request: async () => true,
    onAdded: noopEvent,
    onRemoved: noopEvent,
  },
  // Only the Browse view has tabs; these forward to its simulated browser.
  tabs: {
    get: async (id: number) => (await sim()).simChrome.tabs.get(id),
    query: async (q?: { active?: boolean; url?: string }) => (await sim()).simChrome.tabs.query(q),
    create: async (p: { url?: string; active?: boolean; pinned?: boolean }) => (await sim()).simChrome.tabs.create(p),
    update: async (id: number, p: { url?: string; active?: boolean }) => (await sim()).simChrome.tabs.update(id, p),
    remove: async (ids: number | number[]) => (await sim()).simChrome.tabs.remove(ids),
  },
  windows: {
    update: async () => (await sim()).simChrome.windows.update(),
    getLastFocused: async () => (await sim()).simChrome.windows.getLastFocused(),
    create: async (p: { url?: string }) => (await sim()).simChrome.windows.create(p),
  },
  scripting: {
    executeScript: async (opts: { target: { tabId: number }; func: () => unknown }) =>
      (await sim()).simChrome.scripting.executeScript(opts),
  },
  commands: {
    getAll: async () => [
      { name: 'save-highlight', description: 'Save the selected text as evidence', shortcut: 'Alt+Shift+H' },
      { name: 'toggle-recording', description: 'Start or pause recording', shortcut: 'Alt+Shift+R' },
      { name: 'open-map', description: 'Open the research map', shortcut: 'Alt+Shift+M' },
    ],
  },
};

(globalThis as unknown as { chrome: unknown }).chrome = chromeMock;
