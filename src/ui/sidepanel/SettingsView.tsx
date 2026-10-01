import { useEffect, useState } from 'react';
import { updateWorkspace } from '../../core/actions';
import { builtinAvailability, downloadBuiltin, type BuiltinAvailability } from '../../core/ai/builtin';
import { deleteWorkspace } from '../../core/db';
import { DEFAULT_BLOCKLIST } from '../../core/privacy';
import { ensureProfile, MEMBER_COLORS, updateSettings } from '../../core/settings';
import type { AiMode, EmbedProviderId, LlmProviderId, SearchEngineId, Workspace } from '../../core/types';
import { Icon } from '../components/Icon';
import { Switch } from '../components/common';
import { requestHostAccess, useAiStatus, useHostAccess, useSettings } from '../hooks';

const LLM_OPTIONS: [LlmProviderId, string][] = [
  ['auto', 'Automatic (Bionic, then built-in browser AI)'],
  ['bionic', 'Bionic only'],
  ['builtin', 'Built-in browser AI only'],
  ['none', 'No language model (rules only)'],
];
const EMBED_OPTIONS: [EmbedProviderId, string][] = [
  ['auto', 'Automatic (Bionic, then in-browser model)'],
  ['bionic', 'Bionic only'],
  ['browser', 'In-browser model only (offline, 100 languages)'],
  ['lexical', 'Keyword matching only'],
];
const AI_MODES: [AiMode, string, string][] = [
  ['suggest', 'Suggest', 'Pages are filed as dashed suggestions you can keep or move.'],
  ['auto', 'Auto', 'Pages are filed directly. Undo by moving them.'],
  ['off', 'Off', 'Only prepared-search pages are filed; the rest wait in the parking lot.'],
];
const ENGINES: [SearchEngineId, string][] = [
  ['google', 'Google'],
  ['bing', 'Bing'],
  ['duckduckgo', 'DuckDuckGo'],
  ['brave', 'Brave Search'],
];

export function SettingsView({ ws, onBack }: { ws?: Workspace; onBack: () => void }) {
  const s = useSettings();
  const access = useHostAccess();
  const { status, checking, refresh } = useAiStatus(30_000);
  const [url, setUrl] = useState(s.bionicUrl);
  const [blocklist, setBlocklist] = useState(s.blocklist.join('\n'));
  const [builtin, setBuiltin] = useState<BuiltinAvailability>('unavailable');
  const [download, setDownload] = useState<number | null>(null);
  const [name, setName] = useState(ws?.name ?? '');
  const [profileName, setProfileName] = useState(s.profile.name);
  const [relay, setRelay] = useState(s.collabServer);
  useEffect(() => setProfileName(s.profile.name), [s.profile.name]);
  useEffect(() => setRelay(s.collabServer), [s.collabServer]);
  const [shortcuts, setShortcuts] = useState<chrome.commands.Command[]>([]);

  useEffect(() => setUrl(s.bionicUrl), [s.bionicUrl]);
  useEffect(() => setBlocklist(s.blocklist.join('\n')), [s.blocklist]);
  useEffect(() => {
    void builtinAvailability().then(setBuiltin);
    void chrome.commands.getAll().then(setShortcuts);
  }, []);

  const save = async (patch: Parameters<typeof updateSettings>[0]) => {
    await updateSettings(patch);
    await refresh(true);
  };

  const bionic = status?.bionic;

  return (
    <section className="settings">
      <div className="row">
        <button className="btn ghost small" onClick={onBack}>
          <Icon name="chevronLeft" size={14} /> Back
        </button>
      </div>
      <h1>Settings</h1>

      <fieldset className="card group">
        <legend>Local AI</legend>
        <div className="status-lines">
          <div className="row">
            <span className={`dot ${status?.llm ? 'covered' : 'thin'}`} />
            <span>Language model: {status?.llm?.label ?? 'none — rules-based fallbacks'}</span>
          </div>
          <div className="row">
            <span className={`dot ${status?.embed ? 'covered' : 'thin'}`} />
            <span>Matching: {status?.embed?.label ?? 'keyword matching'}</span>
          </div>
          <button className="btn small" disabled={checking} onClick={() => void refresh(true)}>
            {checking ? <span className="spinner" /> : <Icon name="refresh" size={14} />} Check again
          </button>
        </div>

        <label className="label" htmlFor="llm-provider">
          Language model
        </label>
        <select
          id="llm-provider"
          className="select"
          value={s.llmProvider}
          onChange={(e) => void save({ llmProvider: e.target.value as LlmProviderId })}
        >
          {LLM_OPTIONS.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>

        <label className="label" htmlFor="bionic-url">
          Bionic server
        </label>
        <div className="row">
          <input id="bionic-url" className="input" value={url} onChange={(e) => setUrl(e.target.value)} />
          <button className="btn" onClick={() => void save({ bionicUrl: url.trim() || 'http://localhost:1234/v1' })}>
            Save
          </button>
        </div>
        <p className="hint">
          {bionic?.reachable
            ? `Connected · ${bionic.chatModels.length} chat and ${bionic.embedModels.length} embedding models`
            : 'Not reachable. Open Bionic and set Local Model API → Local API server to Running, or run npm run bionic.'}
        </p>

        <label className="label" htmlFor="chat-model">
          Chat model
        </label>
        <select
          id="chat-model"
          className="select"
          value={s.bionicModel}
          disabled={!bionic?.reachable}
          onChange={(e) => void save({ bionicModel: e.target.value })}
        >
          <option value="">Automatic{bionic?.chat && !s.bionicModel ? ` (${bionic.chat})` : ''}</option>
          {bionic?.chatModels.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
          {s.bionicModel && !bionic?.chatModels.includes(s.bionicModel) && (
            <option value={s.bionicModel}>{s.bionicModel} (not found)</option>
          )}
        </select>

        <label className="row toggle-row">
          <Switch
            checked={s.bionicThinking}
            onChange={(v) => void save({ bionicThinking: v })}
            label="Let the model think first"
          />
          <span>
            Let the model think first
            <span className="hint block">Slower (about 2×), sometimes better routes and conflict checks.</span>
          </span>
        </label>

        <label className="label" htmlFor="embed-provider">
          Page matching
        </label>
        <select
          id="embed-provider"
          className="select"
          value={s.embedProvider}
          onChange={(e) => void save({ embedProvider: e.target.value as EmbedProviderId })}
        >
          {EMBED_OPTIONS.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>

        <label className="label" htmlFor="embed-model">
          Embedding model
        </label>
        <select
          id="embed-model"
          className="select"
          value={s.bionicEmbedModel}
          disabled={!bionic?.reachable}
          onChange={(e) => void save({ bionicEmbedModel: e.target.value })}
        >
          <option value="">
            Automatic{bionic?.embedModel && !s.bionicEmbedModel ? ` (${bionic.embedModel})` : ''}
          </option>
          {bionic?.embedModels.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <p className="hint">
          Multilingual models (EmbeddingGemma) let a question in one language match pages in another.
        </p>

        {builtin !== 'unavailable' && (
          <div className="row">
            <span className="hint">Built-in browser AI: {builtin}</span>
            {builtin === 'downloadable' && (
              <button
                className="btn small"
                onClick={async () => {
                  setDownload(0);
                  await downloadBuiltin((f) => setDownload(f));
                  setDownload(null);
                  setBuiltin(await builtinAvailability());
                }}
              >
                {download !== null ? `${Math.round(download * 100)}%` : 'Download'}
              </button>
            )}
          </div>
        )}
      </fieldset>

      {ws && (
        <fieldset className="card group">
          <legend>This research</legend>
          <label className="label" htmlFor="ws-name">
            Name
          </label>
          <input
            id="ws-name"
            className="input"
            dir="auto"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => name.trim() && name !== ws.name && void updateWorkspace(ws.id, { name: name.trim() })}
          />
          <span className="label">Auto-organise</span>
          <div className="segmented" role="radiogroup">
            {AI_MODES.map(([v, l]) => (
              <button
                key={v}
                role="radio"
                aria-checked={ws.settings.aiMode === v}
                className={ws.settings.aiMode === v ? 'on' : ''}
                onClick={() => void updateWorkspace(ws.id, { settings: { ...ws.settings, aiMode: v } })}
              >
                {l}
              </button>
            ))}
          </div>
          <p className="hint">{AI_MODES.find(([v]) => v === ws.settings.aiMode)?.[2]}</p>
          <label className="row toggle-row">
            <Switch
              checked={ws.settings.requireHighlight}
              onChange={(v) => void updateWorkspace(ws.id, { settings: { ...ws.settings, requireHighlight: v } })}
              label="Covered needs a highlight"
            />
            <span>“Covered” needs at least one highlight</span>
          </label>
          <label className="label" htmlFor="stale">
            Mark sources stale after
          </label>
          <div className="row">
            <input
              id="stale"
              className="input narrow"
              type="number"
              min={0}
              value={ws.settings.staleMonths}
              onChange={(e) =>
                void updateWorkspace(ws.id, {
                  settings: { ...ws.settings, staleMonths: Math.max(0, Number(e.target.value) || 0) },
                })
              }
            />
            <span className="hint">months (0 = never)</span>
          </div>
          <button
            className="btn danger"
            onClick={async () => {
              if (!confirm(`Delete “${ws.name}” and everything in it? This cannot be undone.`)) return;
              await deleteWorkspace(ws.id);
              await updateSettings({ activeWsId: undefined });
              onBack();
            }}
          >
            <Icon name="trash" /> Delete this research
          </button>
        </fieldset>
      )}

      <fieldset className="card group">
        <legend>Team</legend>
        <label className="label" htmlFor="profile-name">
          Your name, as teammates see it
        </label>
        <input
          id="profile-name"
          className="input"
          dir="auto"
          value={profileName}
          onChange={(e) => setProfileName(e.target.value)}
          onBlur={async () => {
            const p = await ensureProfile();
            if (profileName.trim() !== p.name) await updateSettings({ profile: { ...p, name: profileName.trim() } });
          }}
        />
        <span className="label">Colour</span>
        <div className="row swatches" role="radiogroup" aria-label="Avatar colour">
          {MEMBER_COLORS.map((c) => (
            <button
              key={c}
              role="radio"
              aria-checked={s.profile.color === c}
              aria-label={c}
              className="swatch"
              style={{ background: c }}
              onClick={async () => {
                const p = await ensureProfile();
                await updateSettings({ profile: { ...p, color: c } });
              }}
            />
          ))}
        </div>
        <label className="label" htmlFor="relay">
          Default relay for shared research
        </label>
        <div className="row">
          <input id="relay" className="input mono" value={relay} onChange={(e) => setRelay(e.target.value)} />
          <button className="btn" onClick={() => void save({ collabServer: relay.trim() || 'ws://localhost:4545' })}>
            Save
          </button>
        </div>
        <p className="hint">
          Start one with <code>npm run collab:server</code>. Teammates on the same Wi-Fi use the LAN address it prints.
        </p>
      </fieldset>

      <fieldset className="card group">
        <legend>Capture &amp; privacy</legend>
        <div className="row">
          <span className={`dot ${access ? 'covered' : 'thin'}`} />
          <span className="spacer">
            {access
              ? 'Site access granted: pages are read on this device.'
              : 'No site access: only titles and links are saved.'}
          </span>
          {!access && (
            <button className="btn small" onClick={() => void requestHostAccess()}>
              Allow
            </button>
          )}
        </div>
        <p className="hint">
          Private windows are never recorded. Nothing leaves this computer: models run in Bionic or in the browser.
          Thread.io only reads pages; it never clicks, types or submits anything.
        </p>
        <label className="label" htmlFor="engine">
          Search engine for prepared searches
        </label>
        <select
          id="engine"
          className="select"
          value={s.searchEngine}
          onChange={(e) => void save({ searchEngine: e.target.value as SearchEngineId })}
        >
          {ENGINES.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
        <label className="label" htmlFor="blocklist">
          Never record these sites (one per line)
        </label>
        <textarea
          id="blocklist"
          className="textarea mono"
          rows={6}
          value={blocklist}
          onChange={(e) => setBlocklist(e.target.value)}
        />
        <div className="row">
          <button
            className="btn small"
            onClick={() =>
              void save({
                blocklist: blocklist
                  .split('\n')
                  .map((l) =>
                    l
                      .trim()
                      .replace(/^https?:\/\//, '')
                      .replace(/\/.*$/, ''),
                  )
                  .filter(Boolean),
              })
            }
          >
            Save list
          </button>
          <button className="btn small ghost" onClick={() => void save({ blocklist: DEFAULT_BLOCKLIST })}>
            Reset to defaults
          </button>
        </div>
      </fieldset>

      <fieldset className="card group">
        <legend>Shortcuts</legend>
        <ul className="shortcuts">
          {shortcuts
            .filter((c) => c.description)
            .map((c) => (
              <li key={c.name} className="row">
                <span className="spacer">{c.description}</span>
                <kbd>{c.shortcut || 'not set'}</kbd>
              </li>
            ))}
        </ul>
        <p className="hint">Change them at chrome://extensions/shortcuts.</p>
      </fieldset>
    </section>
  );
}
