import { useState } from 'react';
import { inviteFor, leaveWorkspace, shareWorkspace } from '../../core/actions';
import { ensureProfile, updateSettings } from '../../core/settings';
import type { Member, Workspace } from '../../core/types';
import { Avatar, AvatarStack } from '../components/Avatar';
import { Icon } from '../components/Icon';
import { useCollab, useSettings } from '../hooks';

const STATE_LABEL = {
  connecting: 'Connecting…',
  live: 'Live',
  offline: 'Offline · retrying',
  error: 'Cannot connect',
} as const;

/** Share a route live, show who is online, and hand out the invite code. */
export function TeamCard({ ws }: { ws: Workspace }) {
  const settings = useSettings();
  const status = useCollab(ws.id);
  const [name, setName] = useState('');
  const [server, setServer] = useState('');
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const profile = settings.profile;
  const needsName = !profile.name.trim();

  const saveName = async () => {
    const p = await ensureProfile();
    if (name.trim()) await updateSettings({ profile: { ...p, name: name.trim() } });
  };

  const copy = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setOpen(true); // clipboard blocked: show the code so it can be copied by hand
    }
  };

  if (!ws.collab) {
    if (!open) {
      return (
        <button className="team-cta card" onClick={() => setOpen(true)}>
          <Icon name="globe" size={16} />
          <span>
            <strong>Research together</strong>
            <span className="hint block">Share this route live with teammates</span>
          </span>
          <Icon name="chevronRight" size={14} />
        </button>
      );
    }
    return (
      <div className="team card">
        <div className="row">
          <Icon name="globe" size={16} />
          <strong>Research together</strong>
          <div className="spacer" />
          <button className="btn ghost small icon" aria-label="Close" onClick={() => setOpen(false)}>
            <Icon name="x" size={14} />
          </button>
        </div>
        <p className="hint">
          Teammates’ pages, filings, notes and claims appear here as they browse. Everything is end-to-end encrypted:
          the relay only passes on scrambled data.
        </p>
        {needsName && (
          <>
            <label className="label" htmlFor="team-name">
              Your name, as teammates see it
            </label>
            <input id="team-name" className="input" dir="auto" value={name} onChange={(e) => setName(e.target.value)} />
          </>
        )}
        <label className="label" htmlFor="team-server">
          Relay
        </label>
        <input
          id="team-server"
          className="input mono"
          value={server || settings.collabServer}
          onChange={(e) => setServer(e.target.value)}
        />
        <p className="hint">
          Run <code>npm run collab:server</code> on any laptop on this network and use the address it prints.
        </p>
        <button
          className="btn brand"
          disabled={busy || (needsName && !name.trim())}
          onClick={async () => {
            setBusy(true);
            try {
              await saveName();
              const relay = (server || settings.collabServer).trim();
              if (server) await updateSettings({ collabServer: relay });
              const invite = await shareWorkspace(ws.id, relay);
              setOpen(true); // show the invite and who joins
              await copy(invite);
            } finally {
              setBusy(false);
            }
          }}
        >
          <Icon name="link" /> Share live &amp; copy invite
        </button>
      </div>
    );
  }

  const state = status?.state ?? 'connecting';
  const me: Member = { ...profile, name: profile.name || 'You' };
  const online = status?.peers ?? [];
  const invite = inviteFor(ws)!;

  return (
    <div className="team card">
      <div className="row">
        <span className={`live-dot ${state}`} />
        <strong>{STATE_LABEL[state]}</strong>
        {state === 'live' && <span className="hint">· {online.length + 1} online</span>}
        <div className="spacer" />
        <AvatarStack members={[me, ...online]} />
        <button
          className="btn ghost small icon"
          aria-label="Team details"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          <Icon name={open ? 'chevronDown' : 'chevronRight'} size={14} />
        </button>
      </div>
      {state === 'error' && status?.error && <p className="error">{status.error}</p>}
      {state === 'offline' && <p className="hint">Changes are kept and sent when the relay is back.</p>}
      {open && (
        <div className="team-details">
          <ul className="team-list">
            <li className="row">
              <Avatar member={me} size={22} />
              <span>{me.name} (you)</span>
            </li>
            {online.map((p) => (
              <li key={p.id} className="row">
                <Avatar member={p} size={22} />
                <span dir="auto">{p.name}</span>
              </li>
            ))}
          </ul>
          <label className="label">Invite code</label>
          <div className="row">
            <input className="input mono" readOnly value={invite} onFocus={(e) => e.target.select()} />
            <button className="btn" onClick={() => void copy(invite)}>
              <Icon name={copied ? 'check' : 'link'} size={14} /> {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <p className="hint">Anyone with this code can join and read this research. Share it privately.</p>
          <p className="hint">
            Relay: <code>{ws.collab.server}</code>
          </p>
          <button
            className="btn small ghost"
            onClick={async () => {
              if (confirm('Stop sharing on this computer? Your copy of the research stays here.'))
                await leaveWorkspace(ws.id);
            }}
          >
            Leave shared research
          </button>
        </div>
      )}
    </div>
  );
}
