import { sendToBackground } from '../../core/messages';
import type { GlobalSettings, ID, Workspace } from '../../core/types';
import { Icon } from '../components/Icon';
import { Switch } from '../components/common';
import { requestHostAccess, useAiStatus, useHostAccess, useWorkspaces } from '../hooks';
import type { View } from './App';

export function Header({
  settings,
  ws,
  onView,
  onActivate,
}: {
  settings: GlobalSettings;
  ws?: Workspace;
  onView: (v: View) => void;
  onActivate: (id: ID) => void;
}) {
  const workspaces = useWorkspaces();
  const access = useHostAccess();
  const { status } = useAiStatus();

  const toggleRecording = async (on: boolean) => {
    // Site access is requested in the same click: browsers require a user gesture.
    if (on && access === false) await requestHostAccess().catch(() => false);
    await sendToBackground({ type: 'recording.set', on });
  };

  const aiLabel = !status ? 'Checking AI…' : status.llm ? status.llm.label.replace(/^Bionic · /, '') : 'Rules only';
  const aiTitle = status
    ? `Language model: ${status.llm?.label ?? 'none (rules-based fallbacks)'}\nMatching: ${status.embed?.label ?? 'keyword matching'}`
    : 'Checking local AI…';

  return (
    <header className="panel-header">
      <div className="row">
        <img src="icons/icon32.png" width={22} height={22} alt="" className="logo" />
        <strong className="brand-name">Thread.io</strong>
        <div className="spacer" />
        <button className="ai-chip" title={aiTitle} onClick={() => onView({ name: 'settings' })}>
          <span className={`dot ${status?.llm ? 'covered' : status ? 'thin' : 'neutral'}`} />
          <span className="truncate">{aiLabel}</span>
        </button>
        <button
          className="btn ghost icon"
          title="Settings"
          aria-label="Settings"
          onClick={() => onView({ name: 'settings' })}
        >
          <Icon name="settings" />
        </button>
      </div>
      <div className="row header-controls">
        <select
          className="select ws-select"
          aria-label="Workspace"
          value={ws?.id ?? ''}
          onChange={(e) => (e.target.value === '__new' ? onView({ name: 'new' }) : onActivate(e.target.value))}
        >
          {!ws && <option value="">No research yet</option>}
          {workspaces.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
          <option value="__new">+ New research…</option>
        </select>
        <label className={`rec ${settings.recording ? 'on' : ''}`} title="Alt+Shift+R">
          <span className="rec-dot" />
          <span>{settings.recording ? 'Recording' : 'Paused'}</span>
          <Switch checked={settings.recording} onChange={(v) => void toggleRecording(v)} label="Record browsing" />
        </label>
      </div>
      {settings.recording && access === false && (
        <div className="banner">
          <Icon name="shield" size={14} />
          <span>Only titles and links are saved. Allow site access so pages can be read and filed by content.</span>
          <button className="btn small" onClick={() => void requestHostAccess()}>
            Allow
          </button>
        </div>
      )}
    </header>
  );
}
