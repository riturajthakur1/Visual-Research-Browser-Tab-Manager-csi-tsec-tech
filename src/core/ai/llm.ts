// Picks a local language model and runs schema-constrained prompts on it.
// Order for "auto": Bionic (local server) → the browser's built-in model → none.
// Every caller must cope with `null`: Thread.io keeps working on rules alone.
import { getSettings } from '../settings';
import type { GlobalSettings } from '../types';
import { chatJson, invalidateModelCache, pickChatModel, type JsonRequest } from './bionic';
import { builtinAvailability, builtinJson } from './builtin';
import { offscreenPrompt, offscreenStatus } from './offscreen-client';

export type { JsonRequest } from './bionic';

export interface LlmInfo {
  provider: 'bionic' | 'builtin';
  label: string;
}

const inServiceWorker = () => typeof window === 'undefined' && typeof (globalThis as { importScripts?: unknown }).importScripts === 'function';

let cached: { at: number; key: string; info: LlmInfo | null } | null = null;

async function builtinReady(): Promise<boolean> {
  if (!inServiceWorker()) return (await builtinAvailability()) === 'available';
  try {
    return (await offscreenStatus()).builtin === 'available';
  } catch {
    return false;
  }
}

export async function resolveLlm(settings?: GlobalSettings, fresh = false): Promise<LlmInfo | null> {
  const s = settings ?? (await getSettings());
  const key = `${s.llmProvider}|${s.bionicUrl}|${s.bionicModel}`;
  if (!fresh && cached && cached.key === key && Date.now() - cached.at < 20_000) return cached.info;
  if (fresh) invalidateModelCache();

  let info: LlmInfo | null = null;
  if (s.llmProvider === 'auto' || s.llmProvider === 'bionic') {
    try {
      const model = await pickChatModel({ baseUrl: s.bionicUrl, model: s.bionicModel });
      if (model) info = { provider: 'bionic', label: `Bionic · ${model}` };
    } catch {
      /* server not running */
    }
  }
  if (!info && (s.llmProvider === 'auto' || s.llmProvider === 'builtin') && (await builtinReady())) {
    info = { provider: 'builtin', label: 'Built-in browser AI' };
  }
  cached = { at: Date.now(), key, info };
  return info;
}

/** Runs a JSON task on the best available local model. Returns null when none is available or the call fails. */
export async function llmJson<T>(req: JsonRequest): Promise<T | null> {
  const s = await getSettings();
  const info = await resolveLlm(s);
  if (!info) return null;
  try {
    if (info.provider === 'bionic') {
      return await chatJson<T>({ baseUrl: s.bionicUrl, model: s.bionicModel, thinking: s.bionicThinking }, req);
    }
    if (inServiceWorker()) return await offscreenPrompt<T>(req);
    return await builtinJson<T>(req);
  } catch (e) {
    console.warn(`[thread.io] ${req.name} failed on ${info.label}:`, e);
    cached = null;
    return null;
  }
}
