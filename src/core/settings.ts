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
  profile: { id: '', name: '', color: '' },
  collabServer: 'ws://localhost:4545',
};

export const MEMBER_COLORS = ['#C8160C', '#2563EB', '#16A34A', '#9333EA', '#EA580C', '#0891B2', '#DB2777', '#4D7C0F'];

/** The local person's profile, created on first use. */
export async function ensureProfile(): Promise<GlobalSettings['profile']> {
  const s = await getSettings();
  if (s.profile?.id) return s.profile;
  const id =
    'm_' + Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => b.toString(16).padStart(2, '0')).join('');
  const color = MEMBER_COLORS[crypto.getRandomValues(new Uint8Array(1))[0] % MEMBER_COLORS.length];
  const profile = { id, name: s.profile?.name ?? '', color };
  await updateSettings({ profile });
  return profile;
}

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
