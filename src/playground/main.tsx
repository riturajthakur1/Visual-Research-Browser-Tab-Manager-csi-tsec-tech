// UI playground: the real side panel and map, running in a normal browser tab
// on sample data, with hot reload. Start it with `npm run ui`.
import './mock-chrome'; // must load before the app modules
import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../ui/styles/base.css';
import '../ui/map/map.css';
import './playground.css';
import { db } from '../core/db';
import { newKey } from '../core/collab/crypto';
import { MapApp } from '../ui/map/MapApp';
import { App as SidePanel } from '../ui/sidepanel/App';
import { playgroundState } from './mock-chrome';
import { sampleTeamStatus, seedSample } from './sample';

type View = 'panel' | 'map' | 'both';
type Theme = 'system' | 'light' | 'dark';
type Team = 'live' | 'offline' | 'solo';

const PREFS = 'thread-io-playground:prefs';
const SAMPLE_WS = 'ws_sample_mumbai';
const saved = (() => {
  try {
    return JSON.parse(localStorage.getItem(PREFS) ?? '{}') as Partial<{ view: View; theme: Theme; width: number }>;
  } catch {
    return {};
  }
})();

// React runs effects twice in development; seed only once.
let seeding: Promise<unknown> | null = null;
const seedOnce = () => (seeding ??= db.workspaces.get(SAMPLE_WS).then((ws) => (ws ? undefined : seedSample())));

function Playground() {
  const [ready, setReady] = useState(false);
  const [view, setView] = useState<View>(saved.view ?? 'both');
  const [theme, setTheme] = useState<Theme>(saved.theme ?? 'system');
  const [width, setWidth] = useState(saved.width ?? 400);
  const [ai, setAi] = useState(true);
  const [team, setTeam] = useState<Team>('live');
  const [toast, setToast] = useState('');
  const [epoch, setEpoch] = useState(0);

  useEffect(() => {
    playgroundState.toast = (m) => {
      setToast(m);
      setTimeout(() => setToast((t) => (t === m ? '' : t)), 3500);
    };
    playgroundState.showMap = () => setView((v) => (v === 'panel' ? 'map' : v));
    void (async () => {
      await seedOnce();
      setReady(true);
    })();
  }, []);

  useEffect(() => {
    localStorage.setItem(PREFS, JSON.stringify({ view, theme, width }));
    if (theme === 'system') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = theme;
  }, [view, theme, width]);

  useEffect(() => {
    playgroundState.aiOnline = ai;
    setEpoch((e) => e + 1); // remount so the AI status is read again
  }, [ai]);

  useEffect(() => {
    if (!ready) return;
    void (async () => {
      const ws = await db.workspaces.get(SAMPLE_WS);
      if (!ws) return;
      if (team === 'solo') await db.workspaces.update(SAMPLE_WS, { collab: undefined });
      else if (!ws.collab) {
        await db.workspaces.update(SAMPLE_WS, {
          collab: { server: 'ws://localhost:4545', room: SAMPLE_WS, key: newKey(), role: 'owner', since: Date.now() },
        });
      }
      await chrome.storage.session.set({ collab: team === 'solo' ? {} : sampleTeamStatus(SAMPLE_WS, team === 'live') });
    })();
  }, [team, ready]);

  if (!ready) return <div className="pg-loading">Preparing sample research…</div>;

  return (
    <div className="pg">
      <header className="pg-bar">
        <img src="/icons/icon32.png" width={20} height={20} alt="" />
        <strong>Thread.io UI playground</strong>
        <span className="pg-sep" />
        <Segmented label="View" value={view} options={['panel', 'map', 'both']} onChange={setView} />
        {view !== 'map' && (
          <label className="pg-field">
            Panel
            <select value={width} onChange={(e) => setWidth(Number(e.target.value))}>
              {[320, 360, 400, 480, 560].map((w) => (
                <option key={w} value={w}>
                  {w}px
                </option>
              ))}
            </select>
          </label>
        )}
        <Segmented label="Theme" value={theme} options={['system', 'light', 'dark']} onChange={setTheme} />
        <label className="pg-field">
          <input type="checkbox" checked={ai} onChange={(e) => setAi(e.target.checked)} /> Local AI online
        </label>
        <label className="pg-field">
          Team
          <select value={team} onChange={(e) => setTeam(e.target.value as Team)}>
            <option value="live">Shared · live</option>
            <option value="offline">Shared · offline</option>
            <option value="solo">Not shared</option>
          </select>
        </label>
        <span className="pg-spacer" />
        <button
          className="pg-reset"
          onClick={async () => {
            await seedSample();
            location.reload();
          }}
        >
          Reset sample data
        </button>
      </header>
      <main className={`pg-main view-${view}`} key={epoch}>
        {view !== 'map' && (
          <div className="pg-panel" style={{ width }}>
            <SidePanel />
          </div>
        )}
        {view !== 'panel' && (
          <div className="pg-map">
            <MapApp />
          </div>
        )}
      </main>
      {toast && (
        <div className="pg-toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: T[];
  onChange: (v: T) => void;
}) {
  return (
    <span className="pg-field" role="radiogroup" aria-label={label}>
      {label}
      <span className="pg-seg">
        {options.map((o) => (
          <button
            key={o}
            role="radio"
            aria-checked={value === o}
            className={value === o ? 'on' : ''}
            onClick={() => onChange(o)}
          >
            {o}
          </button>
        ))}
      </span>
    </span>
  );
}

// Hot reload re-runs this file; reuse the root instead of creating a second one.
const host = window as unknown as { __playgroundRoot?: ReturnType<typeof createRoot> };
host.__playgroundRoot ??= createRoot(document.getElementById('root')!);
host.__playgroundRoot.render(
  <StrictMode>
    <Playground />
  </StrictMode>,
);
