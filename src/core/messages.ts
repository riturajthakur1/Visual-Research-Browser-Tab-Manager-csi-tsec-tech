// Message contract between the extension pages (side panel, map) and the
// service worker. Database edits go straight to IndexedDB from the pages;
// messages are for browser side effects (tabs, windows) and engine runs.
import type { BuiltinAvailability } from './ai/builtin';
import type { ID } from './types';

export interface ScreenBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

export type BackgroundRequest =
  | { type: 'recording.set'; on: boolean }
  | { type: 'workspace.activate'; wsId: ID }
  | { type: 'capture.activeTab' }
  | { type: 'capture.window' }
  | { type: 'gap.fill'; wsId: ID; questionId: ID; query: string }
  | { type: 'node.open'; nodeId: ID }
  | { type: 'url.open'; url: string }
  | { type: 'nodes.sideBySide'; nodeIds: [ID, ID]; screen: ScreenBox }
  | { type: 'workspace.hibernate'; wsId: ID }
  | { type: 'workspace.restore'; wsId: ID }
  | { type: 'engine.reattach'; wsId: ID; nodeIds?: ID[] }
  | { type: 'engine.conflicts'; wsId: ID; force?: boolean }
  | { type: 'engine.proposals'; wsId: ID }
  | { type: 'map.open'; wsId?: ID; focus?: ID }
  | { type: 'ai.status'; fresh?: boolean }
  | { type: 'permissions.status' };

export interface AiStatus {
  llm: { provider: 'bionic' | 'builtin'; label: string } | null;
  embed: { kind: 'bionic' | 'browser'; label: string } | null;
  bionic: {
    reachable: boolean;
    url: string;
    chatModels: string[];
    embedModels: string[];
    chat?: string;
    embedModel?: string;
  };
  builtin: BuiltinAvailability;
}

export interface PermissionStatus {
  allSites: boolean;
}

export type BackgroundResponse<T = unknown> = { ok: true; value: T } | { ok: false; error: string };

export async function sendToBackground<T = unknown>(req: BackgroundRequest): Promise<T> {
  const res = (await chrome.runtime.sendMessage({ target: 'background', ...req })) as BackgroundResponse<T> | undefined;
  if (!res) throw new Error('The background worker did not answer');
  if (!res.ok) throw new Error(res.error);
  return res.value;
}
