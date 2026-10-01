import type { GlobalSettings } from './types';
import { DEFAULT_BLOCKLIST } from './privacy';

export const DEFAULT_SETTINGS: GlobalSettings = {
  recording: false,
  llmProvider: 'auto',
  embedProvider: 'auto',
  bionicUrl: 'http://localhost:1234/v1',
  bionicModel: '',
  bionicThinking: false,
  bionicEmbedModel: '',
  searchEngine: 'google',
  blocklist: DEFAULT_BLOCKLIST,
  onboarded: false,
};

const KEY = 'settings';
const hasChromeStorage = () => typeof chrome !== 'undefined' && !!chrome.storage?.local;
let memory: GlobalSettings = { ...DEFAULT_SETTINGS };

export async function getSettings(): Promise<GlobalSettings> {
  if (!hasChromeStorage()) return memory;
  const stored = (await chrome.storage.local.get(KEY))[KEY] as Partial<GlobalSettings> | undefined;
  return { ...DEFAULT_SETTINGS, ...stored };
}

export async function updateSettings(patch: Partial<GlobalSettings>): Promise<GlobalSettings> {
  const next = { ...(await getSettings()), ...patch };
  if (hasChromeStorage()) await chrome.storage.local.set({ [KEY]: next });
  else memory = next;
  return next;
}

export function onSettingsChanged(cb: (s: GlobalSettings) => void): () => void {
  if (!hasChromeStorage()) return () => undefined;
  const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area === 'local' && changes[KEY]) cb({ ...DEFAULT_SETTINGS, ...(changes[KEY].newValue as object) });
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}
