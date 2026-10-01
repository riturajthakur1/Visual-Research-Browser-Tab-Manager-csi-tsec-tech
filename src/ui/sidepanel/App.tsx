import { useEffect, useState } from 'react';
import { db } from '../../core/db';
import { sendToBackground } from '../../core/messages';
import { updateSettings } from '../../core/settings';
import type { ID } from '../../core/types';
import { useSettings, useWorkspace } from '../hooks';
import { BriefView } from './BriefView';
import { GoalSetup } from './GoalSetup';
import { Header } from './Header';
import { RouteView } from './RouteView';
import { SettingsView } from './SettingsView';

export type View =
  { name: 'main' } | { name: 'settings' } | { name: 'brief' } | { name: 'edit-route' } | { name: 'new' };

export function App() {
  const settings = useSettings();
  const [view, setView] = useState<View>({ name: 'main' });
  const wsId = settings.activeWsId;
  const data = useWorkspace(wsId);

  // Forget a workspace id that no longer exists (deleted elsewhere).
  useEffect(() => {
    if (!settings.loaded || !wsId) return;
    void db.workspaces.get(wsId).then((ws) => {
      if (!ws) void updateSettings({ activeWsId: undefined });
    });
  }, [settings.loaded, wsId]);

  const activate = async (id: ID) => {
    await sendToBackground({ type: 'workspace.activate', wsId: id });
    setView({ name: 'main' });
  };

  if (!settings.loaded) return null;

  const ws = data.ws;
  const needsSetup = view.name === 'new' || !ws || (!ws.goal && !data.questions?.length && !data.nodes?.length);

  let body;
  if (view.name === 'settings') body = <SettingsView ws={ws} onBack={() => setView({ name: 'main' })} />;
  else if (view.name === 'brief' && ws && data.questions && data.nodes)
    body = (
      <BriefView
        ws={ws}
        questions={data.questions}
        nodes={data.nodes}
        links={data.links ?? []}
        onBack={() => setView({ name: 'main' })}
      />
    );
  else if (view.name === 'edit-route' && ws)
    body = (
      <GoalSetup
        ws={ws}
        questions={data.questions ?? []}
        onDone={() => setView({ name: 'main' })}
        onCancel={() => setView({ name: 'main' })}
      />
    );
  else if (needsSetup)
    body = (
      <GoalSetup
        ws={view.name === 'new' ? undefined : ws}
        questions={view.name === 'new' ? [] : (data.questions ?? [])}
        onDone={(id) => void activate(id)}
        onCancel={ws && view.name === 'new' ? () => setView({ name: 'main' }) : undefined}
      />
    );
  else body = <RouteView data={data} onView={setView} />;

  return (
    <div className="panel">
      <Header settings={settings} ws={ws} onView={setView} onActivate={(id) => void activate(id)} />
      <main className="panel-body">{body}</main>
    </div>
  );
}
