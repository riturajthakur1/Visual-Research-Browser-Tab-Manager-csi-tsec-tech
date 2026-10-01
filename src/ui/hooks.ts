import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useState } from 'react';
import { db, workspaceData } from '../core/db';
import { coverageMap, type QuestionCoverage } from '../core/engine/coverage';
import { workspaceLanguage } from '../core/engine/pipeline';
import { sendToBackground, type AiStatus } from '../core/messages';
import { DEFAULT_SETTINGS, getSettings, onSettingsChanged } from '../core/settings';
import type { SessionStatus } from '../core/collab/session';
import type { GlobalSettings, ID } from '../core/types';

export function useSettings(): GlobalSettings & { loaded: boolean } {
  const [s, setS] = useState<GlobalSettings & { loaded: boolean }>({ ...DEFAULT_SETTINGS, loaded: false });
  useEffect(() => {
    void getSettings().then((v) => setS({ ...v, loaded: true }));
    return onSettingsChanged((v) => setS({ ...v, loaded: true }));
  }, []);
  return s;
}

export function useWorkspaces() {
  return useLiveQuery(() => db.workspaces.orderBy('updatedAt').reverse().toArray(), [], []);
}

export function useWorkspace(wsId: ID | undefined) {
  const data = useLiveQuery(() => (wsId ? workspaceData(wsId) : undefined), [wsId]);
  const coverage = useMemo(
    () => (data?.ws ? coverageMap(data.questions, data.nodes, data.ws) : new Map<string, QuestionCoverage>()),
    [data?.ws, data?.questions, data?.nodes],
  );
  const language = useMemo(
    () => (data?.ws ? workspaceLanguage(data.ws, data.questions, data.nodes) : undefined),
    [data?.ws, data?.questions, data?.nodes],
  );
  return { ...data, coverage, language, loading: data === undefined && !!wsId };
}

export function useAiStatus(pollMs = 20_000) {
  const [status, setStatus] = useState<AiStatus | null>(null);
  const [checking, setChecking] = useState(false);
  const refresh = async (fresh = false) => {
    setChecking(true);
    try {
      setStatus(await sendToBackground<AiStatus>({ type: 'ai.status', fresh }));
    } catch {
      setStatus(null);
    } finally {
      setChecking(false);
    }
  };
  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), pollMs);
    return () => clearInterval(t);
  }, [pollMs]);
  return { status, checking, refresh };
}

/** Live-sharing status and who is online, published by the service worker. */
export function useCollab(wsId: ID | undefined): SessionStatus | undefined {
  const [all, setAll] = useState<Record<ID, SessionStatus>>({});
  useEffect(() => {
    if (!chrome.storage?.session) return;
    void chrome.storage.session.get('collab').then((r) => setAll((r.collab as Record<ID, SessionStatus>) ?? {}));
    const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === 'session' && changes.collab) setAll((changes.collab.newValue as Record<ID, SessionStatus>) ?? {});
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, []);
  return wsId ? all[wsId] : undefined;
}

export function useHostAccess() {
  const [granted, setGranted] = useState<boolean | null>(null);
  useEffect(() => {
    const check = () => chrome.permissions.contains({ origins: ['<all_urls>'] }).then(setGranted);
    void check();
    chrome.permissions.onAdded.addListener(check);
    chrome.permissions.onRemoved.addListener(check);
    return () => {
      chrome.permissions.onAdded.removeListener(check);
      chrome.permissions.onRemoved.removeListener(check);
    };
  }, []);
  return granted;
}

/** Must be called straight from a click handler: the browser requires a user gesture. */
export function requestHostAccess(): Promise<boolean> {
  return chrome.permissions.request({ origins: ['<all_urls>'] });
}

export function download(filename: string, content: string, type = 'text/markdown') {
  const url = URL.createObjectURL(new Blob([content], { type: `${type};charset=utf-8` }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function slug(text: string) {
  return (
    text
      .normalize('NFKD')
      .replace(/[^\p{L}\p{N}]+/gu, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase()
      .slice(0, 60) || 'thread-io'
  );
}
