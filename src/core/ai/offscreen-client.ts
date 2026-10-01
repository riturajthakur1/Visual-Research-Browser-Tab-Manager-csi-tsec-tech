// The offscreen document hosts work that needs a DOM context: the in-browser
// embedding model and, from the service worker, the browser's built-in model.
import type { JsonRequest } from './bionic';
import type { BuiltinAvailability } from './builtin';

export type OffscreenRequest =
  | { target: 'offscreen'; type: 'embed'; texts: string[] }
  | { target: 'offscreen'; type: 'prompt'; req: JsonRequest }
  | { target: 'offscreen'; type: 'status' };

export interface OffscreenStatus {
  embedder: 'idle' | 'loading' | 'ready' | 'error';
  embedderError?: string;
  builtin: BuiltinAvailability;
}

const URL_PATH = 'offscreen.html';
let creating: Promise<void> | null = null;

export async function ensureOffscreen(): Promise<boolean> {
  if (typeof chrome === 'undefined' || !chrome.offscreen) return false;
  const url = chrome.runtime.getURL(URL_PATH);
  const contexts = await chrome.runtime.getContexts({
    contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
    documentUrls: [url],
  });
  if (contexts.length) return true;
  creating ??= chrome.offscreen
    .createDocument({
      url: URL_PATH,
      reasons: [chrome.offscreen.Reason.WORKERS],
      justification: 'Runs the on-device embedding model that matches pages to research questions.',
    })
    .catch((e: Error) => {
      if (!/single offscreen/i.test(e.message)) throw e;
    })
    .finally(() => {
      creating = null;
    });
  await creating;
  return true;
}

async function call<T>(msg: OffscreenRequest): Promise<T> {
  if (!(await ensureOffscreen())) throw new Error('Offscreen documents are not available here');
  const res = (await chrome.runtime.sendMessage(msg)) as { ok: boolean; value?: T; error?: string } | undefined;
  if (!res) throw new Error('Offscreen document did not answer');
  if (!res.ok) throw new Error(res.error ?? 'Offscreen request failed');
  return res.value as T;
}

export const offscreenEmbed = (texts: string[]) => call<number[][]>({ target: 'offscreen', type: 'embed', texts });
export const offscreenPrompt = <T>(req: JsonRequest) => call<T>({ target: 'offscreen', type: 'prompt', req });
export const offscreenStatus = () => call<OffscreenStatus>({ target: 'offscreen', type: 'status' });
