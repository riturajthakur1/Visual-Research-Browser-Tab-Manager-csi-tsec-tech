import { useMemo, useState } from 'react';
import { acceptProposedQuestion, dismissProposedQuestion, updateWorkspace } from '../../core/actions';
import { biggestGap, STATUS_LABEL } from '../../core/engine/coverage';
import { clusterSignature } from '../../core/engine/proposals';
import { sendToBackground } from '../../core/messages';
import type { CoverageStatus, TrailNode } from '../../core/types';
import { plural } from '../../core/util';
import { Icon } from '../components/Icon';
import { PageRow } from '../components/PageRow';
import { Empty } from '../components/common';
import { useSettings, type useWorkspace } from '../hooks';
import type { View } from './App';
import { QuestionCard } from './QuestionCard';
import { TeamCard } from './TeamCard';

type Data = ReturnType<typeof useWorkspace>;

export function RouteView({ data, onView }: { data: Data; onView: (v: View) => void }) {
  const { recording, profile } = useSettings();
  const ws = data.ws!;
  const questions = data.questions ?? [];
  const nodes = data.nodes ?? [];
  const coverage = data.coverage;
  const [parkingOpen, setParkingOpen] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const nodesById = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const pages = nodes.filter((n) => n.kind === 'page');
  const parked = pages.filter((n) => !n.attach?.questionId).sort((a, b) => b.createdAt - a.createdAt);
  const searches = nodes.filter((n) => n.kind === 'search');
  const ranSearches = useMemo(() => new Set(searches.map((s) => (s.query ?? '').toLowerCase())), [searches]);

  const counts = useMemo(() => {
    const c: Record<CoverageStatus, number> = { gap: 0, thin: 0, covered: 0, conflict: 0 };
    for (const q of questions) c[coverage.get(q.id)?.status ?? 'gap']++;
    return c;
  }, [questions, coverage]);

  const next = biggestGap(questions, coverage);
  const nextSearch = next && (next.searches.find((s) => !ranSearches.has(s.toLowerCase())) ?? next.searches[0]);
  const nextIndex = next ? questions.indexOf(next) : -1;

  const run = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(label);
    try {
      await fn();
    } finally {
      setBusy(null);
    }
  };

  // Explore mode: no route yet.
  if (!questions.length) {
    return (
      <section className="route">
        {ws.proposedGoal ? (
          <div className="proposal card">
            <div className="row">
              <Icon name="sparkle" size={14} />
              <strong>Looks like you’re researching</strong>
            </div>
            <p className="proposal-text" dir="auto">
              {ws.proposedGoal}
            </p>
            <div className="row">
              <button className="btn brand small" onClick={() => onView({ name: 'edit-route' })}>
                Use as goal &amp; draft route
              </button>
              <button
                className="btn small ghost"
                onClick={() => void updateWorkspace(ws.id, { proposedGoal: undefined })}
              >
                Not now
              </button>
            </div>
          </div>
        ) : (
          <div className="explore-status card">
            <Icon name="globe" />
            <div>
              <strong>Explore mode</strong>
              <p className="muted">
                {searches.length < 3
                  ? `Search as usual. After ${3 - searches.length} more search${3 - searches.length === 1 ? '' : 'es'} Thread.io suggests a goal.`
                  : 'Working out what you’re researching…'}
              </p>
            </div>
          </div>
        )}
        <button className="btn block" onClick={() => onView({ name: 'edit-route' })}>
          <Icon name="target" /> Set a goal now
        </button>
        <TeamCard ws={ws} />
        <h2 className="section-title">Trail so far · {plural(pages.length, 'page')}</h2>
        {pages.length ? (
          <ul className="page-list">
            {[...pages].reverse().map((n) => (
              <PageRow key={n.id} node={n} questions={questions} />
            ))}
          </ul>
        ) : (
          <Empty title="Nothing captured yet">Pages you open while recording appear here.</Empty>
        )}
        <Footer wsId={ws.id} hibernated={!!ws.hibernated} onView={onView} busy={busy} run={run} />
      </section>
    );
  }

  return (
    <section className="route">
      <div className="destination">
        <div className="row">
          <span className="eyebrow">Destination</span>
          <div className="spacer" />
          <button className="btn ghost small" onClick={() => onView({ name: 'edit-route' })}>
            <Icon name="edit" size={14} /> Edit route
          </button>
        </div>
        <p className="goal" dir="auto">
          {ws.goal || ws.name}
        </p>
      </div>

      <div className="coverage" aria-label="Coverage by question">
        <div className="strip">
          {questions.map((q, i) => {
            const st = coverage.get(q.id)?.status ?? 'gap';
            return (
              <button
                key={q.id}
                className={`seg ${st}`}
                title={`Q${i + 1} · ${STATUS_LABEL[st]} — ${q.text}`}
                aria-label={`Question ${i + 1}: ${STATUS_LABEL[st]}`}
                onClick={() =>
                  document.getElementById(`q-${q.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                }
              />
            );
          })}
        </div>
        <div className="row coverage-legend">
          {(['covered', 'thin', 'gap', 'conflict'] as CoverageStatus[])
            .filter((s) => counts[s])
            .map((s) => (
              <span key={s} className="row legend-item">
                <span className={`dot ${s}`} />
                {counts[s]} {STATUS_LABEL[s].toLowerCase()}
              </span>
            ))}
          <div className="spacer" />
          <span className="hint">{plural(pages.length, 'page')}</span>
        </div>
      </div>

      {next && nextSearch ? (
        <div className="next card">
          <div>
            <span className="eyebrow">Next stop · Q{nextIndex + 1}</span>
            <p dir="auto">
              {coverage.get(next.id)?.status === 'gap' ? 'No sources yet for: ' : 'Needs another source: '}
              {next.text}
            </p>
          </div>
          <button
            className="btn brand"
            onClick={() =>
              void sendToBackground({ type: 'gap.fill', wsId: ws.id, questionId: next.id, query: nextSearch })
            }
          >
            <Icon name="search" /> <span className="truncate">{nextSearch}</span>
          </button>
          {!recording && (
            <p className="hint">Recording is paused, so pages you open won’t be filed until you start it.</p>
          )}
        </div>
      ) : counts.covered + counts.conflict === questions.length ? (
        <div className="next card done">
          <div>
            <span className="eyebrow">Route complete</span>
            <p>Every question has independent sources. Time to write it up.</p>
          </div>
          <button className="btn brand" onClick={() => onView({ name: 'brief' })}>
            <Icon name="file" /> Brief
          </button>
        </div>
      ) : null}

      <TeamCard ws={ws} />

      {ws.proposedQuestion && (
        <div className="proposal card">
          <div className="row">
            <Icon name="sparkle" size={14} />
            <strong>New question from {plural(ws.proposedQuestion.nodeIds.length, 'parked page')}</strong>
          </div>
          <p className="proposal-text" dir="auto">
            {ws.proposedQuestion.text}
          </p>
          <div className="row">
            <button
              className="btn brand small"
              onClick={() =>
                void run('propose', async () => {
                  await acceptProposedQuestion(ws.id);
                  await sendToBackground({ type: 'engine.reattach', wsId: ws.id });
                })
              }
            >
              <Icon name="plus" size={14} /> Add to route
            </button>
            <button
              className="btn small ghost"
              onClick={() =>
                void dismissProposedQuestion(
                  ws.id,
                  clusterSignature(ws.proposedQuestion!.nodeIds.map((id) => ({ id }) as TrailNode)),
                )
              }
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      <div className="questions">
        {questions.map((q, i) => (
          <QuestionCard
            key={q.id}
            q={q}
            index={i}
            coverage={coverage.get(q.id)!}
            questions={questions}
            nodesById={nodesById}
            ranSearches={ranSearches}
            me={ws.collab ? profile : undefined}
          />
        ))}
      </div>

      <section className="parking">
        <button
          className="section-title as-button"
          aria-expanded={parkingOpen}
          onClick={() => setParkingOpen(!parkingOpen)}
        >
          <Icon name={parkingOpen ? 'chevronDown' : 'chevronRight'} size={14} />
          Parking lot · {parked.length}
        </button>
        {parkingOpen &&
          (parked.length ? (
            <ul className="page-list">
              {parked.map((n) => (
                <PageRow key={n.id} node={n} questions={questions} />
              ))}
            </ul>
          ) : (
            <p className="hint">Pages that don’t clearly answer a question wait here until you file them.</p>
          ))}
      </section>

      <Footer wsId={ws.id} hibernated={!!ws.hibernated} onView={onView} busy={busy} run={run} />
    </section>
  );
}

function Footer({
  wsId,
  hibernated,
  onView,
  busy,
  run,
}: {
  wsId: string;
  hibernated: boolean;
  onView: (v: View) => void;
  busy: string | null;
  run: (label: string, fn: () => Promise<unknown>) => Promise<void>;
}) {
  return (
    <footer className="panel-footer">
      <button className="btn" onClick={() => void sendToBackground({ type: 'map.open', wsId })}>
        <Icon name="map" /> Map
      </button>
      <button className="btn" onClick={() => onView({ name: 'brief' })}>
        <Icon name="file" /> Brief
      </button>
      {hibernated ? (
        <button
          className="btn"
          disabled={busy !== null}
          onClick={() => void run('restore', () => sendToBackground({ type: 'workspace.restore', wsId }))}
        >
          <Icon name="refresh" /> Restore tabs
        </button>
      ) : (
        <button
          className="btn"
          title="Close this research's tabs; restore them and the map exactly later"
          disabled={busy !== null}
          onClick={() =>
            void run('hibernate', async () => {
              const n = await sendToBackground<number>({ type: 'workspace.hibernate', wsId });
              if (!n) alert('No open tabs belong to this research yet.');
            })
          }
        >
          <Icon name="bed" /> Hibernate
        </button>
      )}
      <button
        className="btn ghost icon"
        title="Add the current tab"
        aria-label="Add the current tab"
        onClick={() => void sendToBackground({ type: 'capture.activeTab' })}
      >
        <Icon name="plus" />
      </button>
    </footer>
  );
}
