// Service worker: wires browser events to the trail and answers the pages.
import { isEmbeddingModel, listModels, pickChatModel, pickEmbedModel } from '../core/ai/bionic';
import { resetEmbedSpace, resolveEmbedSpace } from '../core/ai/embed';
import { resolveLlm } from '../core/ai/llm';
import { offscreenStatus } from '../core/ai/offscreen-client';
import type { AiStatus, BackgroundRequest, BackgroundResponse, PermissionStatus } from '../core/messages';
import { getSettings, onSettingsChanged, updateSettings } from '../core/settings';
import { readSelection } from './extract';
import {
  activeWorkspaceId,
  addHighlightFromTab,
  captureTab,
  captureWindow,
  hasHostAccess,
  onNavigation,
  onPageLoaded,
  onTabActivated,
  onTabRemoved,
} from './capture';
import { startCollab } from './collab';
import { enqueue } from './queue';
import { fillGap, hibernate, openMap, openNode, openUrl, restore, sideBySide } from './tabs';
import { getTab, setTab } from './tab-state';

const MENU_HIGHLIGHT = 'thread-highlight';
const MENU_ADD_PAGE = 'thread-add-page';

// --- Setup -----------------------------------------------------------------------

async function setBadge() {
  const { recording } = await getSettings();
  await chrome.action.setBadgeText({ text: recording ? 'REC' : '' });
  await chrome.action.setBadgeBackgroundColor({ color: '#C8160C' });
  await chrome.action.setTitle({ title: recording ? 'Thread.io — recording' : 'Open Thread.io' });
}

chrome.runtime.onInstalled.addListener(async () => {
  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: MENU_HIGHLIGHT, title: 'Save to Thread.io as evidence', contexts: ['selection'] });
    chrome.contextMenus.create({ id: MENU_ADD_PAGE, title: 'Add this page to Thread.io', contexts: ['page'] });
  });
  await setBadge();
});
chrome.runtime.onStartup.addListener(setBadge);
onSettingsChanged(() => {
  resetEmbedSpace();
  void setBadge();
});

// Live team research: one encrypted session per shared workspace.
startCollab();

// --- Trail capture ---------------------------------------------------------------

chrome.webNavigation.onCreatedNavigationTarget.addListener(({ sourceTabId, tabId }) => {
  void setTab(tabId, { openerTabId: sourceTabId });
});

chrome.tabs.onCreated.addListener(async (tab) => {
  if (tab.id === undefined || tab.openerTabId === undefined) return;
  const state = await getTab(tab.id);
  if (state.openerTabId === undefined && !state.pendingTag) await setTab(tab.id, { openerTabId: tab.openerTabId });
});

chrome.webNavigation.onCommitted.addListener((d) => {
  if (d.frameId !== 0 || !/^https?:/.test(d.url)) return;
  void onNavigation(d.tabId, d.url, d.transitionType, d.transitionQualifiers).catch((e) =>
    console.warn('[thread.io] capture', e),
  );
});

// Single-page apps change the URL without a new document; treat it as a link click.
chrome.webNavigation.onHistoryStateUpdated.addListener(async (d) => {
  if (d.frameId !== 0 || !/^https?:/.test(d.url)) return;
  const state = await getTab(d.tabId);
  if (state.url && state.url.split('#')[0] === d.url.split('#')[0]) return;
  await onNavigation(d.tabId, d.url, 'link', []);
  // No load event follows; give the app a moment to render, then read it.
  setTimeout(() => {
    chrome.tabs.get(d.tabId).then(
      (tab) => onPageLoaded(d.tabId, tab),
      () => undefined,
    );
  }, 1500);
});

chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  if (info.status === 'complete') void onPageLoaded(tabId, tab).catch((e) => console.warn('[thread.io] read', e));
});

chrome.tabs.onRemoved.addListener((tabId) => void onTabRemoved(tabId));

let lastActive: number | undefined;
chrome.tabs.onActivated.addListener(({ tabId }) => {
  void onTabActivated(tabId, lastActive);
  lastActive = tabId;
});

// --- Highlights, menus and shortcuts -------------------------------------------------

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab) return;
  if (info.menuItemId === MENU_HIGHLIGHT && info.selectionText) await addHighlightFromTab(tab, info.selectionText);
  if (info.menuItemId === MENU_ADD_PAGE) await captureTab(tab);
});

chrome.commands.onCommand.addListener(async (command, tab) => {
  if (command === 'toggle-recording') {
    const s = await getSettings();
    await updateSettings({ recording: !s.recording });
  } else if (command === 'open-map') {
    await openMap(await activeWorkspaceId());
  } else if (command === 'save-highlight' && tab?.id) {
    const [res] = await chrome.scripting
      .executeScript({ target: { tabId: tab.id }, func: readSelection })
      .catch(() => []);
    const text = (res?.result as string | undefined) ?? '';
    if (text.trim()) await addHighlightFromTab(tab, text);
  }
});

// --- Messages from the side panel and map ---------------------------------------------

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
    /* not running */
  }
  const cfg = { baseUrl: s.bionicUrl, model: s.bionicModel, embedModel: s.bionicEmbedModel };
  const builtin = await offscreenStatus()
    .then((st) => st.builtin)
    .catch(() => 'unavailable' as const);
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
    builtin,
  };
}

async function handle(req: BackgroundRequest): Promise<unknown> {
  switch (req.type) {
    case 'recording.set': {
      if (req.on) await activeWorkspaceId();
      await updateSettings({ recording: req.on });
      return req.on;
    }
    case 'workspace.activate':
      await updateSettings({ activeWsId: req.wsId });
      return true;
    case 'capture.activeTab': {
      const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      return tab ? captureTab(tab) : undefined;
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
    case 'map.open':
      return openMap(req.wsId, req.focus);
    case 'ai.status':
      return aiStatus(req.fresh);
    case 'permissions.status':
      return { allSites: await hasHostAccess() } satisfies PermissionStatus;
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.target !== 'background') return false;
  handle(msg as BackgroundRequest).then(
    (value) => sendResponse({ ok: true, value } satisfies BackgroundResponse),
    (e: Error) => sendResponse({ ok: false, error: e?.message ?? String(e) } satisfies BackgroundResponse),
  );
  return true;
});
