import { useMemo, useState } from 'react';
import { createWorkspace, saveRoute, setGoal, updateWorkspace } from '../../core/actions';
import { llmJson } from '../../core/ai/llm';
import { classifyGoal, draftRoute, type DraftQuestion, type GoalType } from '../../core/engine/route';
import { detectLanguage } from '../../core/lang';
import { sendToBackground } from '../../core/messages';
import type { ID, Question, Workspace } from '../../core/types';
import { truncate } from '../../core/util';
import { Icon } from '../components/Icon';
import { Spinner } from '../components/common';
import { requestHostAccess, useAiStatus } from '../hooks';

type Row = DraftQuestion & { id?: ID; edited?: boolean; key: string };

const EXAMPLES = [
  'Why does Mumbai flood every monsoon, and what would fix it?',
  'मुंबई में हर मानसून में बाढ़ क्यों आती है?',
  'React vs Vue for a first web project',
  '¿Es seguro el ayuno intermitente para adolescentes?',
];

const SHAPE_LABEL: Record<GoalType, string> = {
  debug: 'Debugging',
  compare: 'Comparison',
  decide: 'Decision',
  howto: 'How-to',
  why: 'Why / causes',
  evaluate: 'Is it true?',
  event: 'Event',
  define: 'Explainer',
  future: 'Outlook',
  list: 'Survey',
  topic: 'Topic',
};

let keySeq = 0;
const toRow = (q: DraftQuestion & { id?: ID; edited?: boolean }): Row => ({ ...q, key: `r${keySeq++}` });

export function GoalSetup({
  ws,
  questions,
  onDone,
  onCancel,
}: {
  ws?: Workspace;
  questions: Question[];
  onDone: (wsId: ID) => void;
  onCancel?: () => void;
}) {
  const { status } = useAiStatus(60_000);
  const [goal, setGoalText] = useState(ws?.goal ?? ws?.proposedGoal ?? '');
  const [rows, setRows] = useState<Row[] | null>(questions.length ? questions.map((q) => toRow(q)) : null);
  const [source, setSource] = useState<'model' | 'rules' | 'saved'>(questions.length ? 'saved' : 'model');
  const [busy, setBusy] = useState<'draft' | 'save' | null>(null);
  const [error, setError] = useState('');

  const lang = useMemo(() => detectLanguage(goal || 'en'), [goal]);
  const shape = goal.trim() ? SHAPE_LABEL[classifyGoal(goal)] : null;
  const editing = !!ws && questions.length > 0;

  const draft = async () => {
    if (!goal.trim()) return;
    setBusy('draft');
    setError('');
    try {
      const d = await draftRoute(goal, llmJson);
      setRows(d.questions.map((q) => toRow(q)));
      setSource(d.source);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const start = async () => {
    if (!rows?.length) return;
    // Ask for site access first, while the click still counts as a user gesture.
    const wantsRecording = !ws;
    if (wantsRecording) await requestHostAccess().catch(() => false);
    setBusy('save');
    try {
      const name = truncate(goal.trim(), 48) || 'Untitled research';
      let id = ws?.id;
      if (!id) id = (await createWorkspace(name, goal)).id;
      else {
        if (goal.trim() !== ws!.goal) await setGoal(id, goal);
        if (!ws!.goal || /^(Research|Exploring) ·/.test(ws!.name)) await updateWorkspace(id, { name });
      }
      const clean = rows
        .map(({ key: _key, ...q }) => ({
          ...q,
          text: q.text.trim(),
          searches: q.searches.map((s) => s.trim()).filter(Boolean),
        }))
        .filter((q) => q.text);
      await saveRoute(id, clean, source === 'rules' ? 'rules' : 'ai');
      await sendToBackground({ type: 'workspace.activate', wsId: id });
      await sendToBackground({ type: 'engine.reattach', wsId: id });
      if (wantsRecording) await sendToBackground({ type: 'recording.set', on: true });
      onDone(id);
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    }
  };

  const explore = async () => {
    await requestHostAccess().catch(() => false);
    const w = await createWorkspace(`Exploring · ${new Date().toLocaleDateString()}`);
    await sendToBackground({ type: 'workspace.activate', wsId: w.id });
    await sendToBackground({ type: 'recording.set', on: true });
    onDone(w.id);
  };

  const update = (key: string, patch: Partial<Row>) =>
    setRows((rs) =>
      rs!.map((r) => (r.key === key ? { ...r, ...patch, edited: r.edited || patch.text !== undefined } : r)),
    );
  const move = (key: string, dir: -1 | 1) =>
    setRows((rs) => {
      const i = rs!.findIndex((r) => r.key === key);
      const j = i + dir;
      if (j < 0 || j >= rs!.length) return rs;
      const next = [...rs!];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  return (
    <section className="setup">
      <div className="setup-intro">
        <h1>{editing ? 'Edit your route' : 'Where are you headed?'}</h1>
        {!editing && (
          <p className="muted">
            Type the question you need answered, in any language. Thread.io drafts the sub-questions; you browse
            normally and each page files itself.
          </p>
        )}
      </div>

      <label className="label" htmlFor="goal">
        Destination
      </label>
      <textarea
        id="goal"
        className="textarea goal-input"
        dir="auto"
        lang={lang.code}
        rows={3}
        placeholder="e.g. Why does Mumbai flood every monsoon, and what would fix it?"
        value={goal}
        onChange={(e) => setGoalText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void draft();
        }}
      />
      <div className="row goal-meta">
        {shape && <span className="chip">{shape}</span>}
        {goal.trim() && lang.code !== 'en' && <span className="chip">{lang.name}</span>}
        <div className="spacer" />
        <button className="btn primary" disabled={!goal.trim() || busy !== null} onClick={() => void draft()}>
          {busy === 'draft' ? <span className="spinner" /> : <Icon name="sparkle" />}
          {rows ? 'Re-draft route' : 'Draft my route'}
        </button>
      </div>
      {busy === 'draft' && (
        <div className="drafting">
          <Spinner
            label={status?.llm ? `Drafting with ${status.llm.label.replace(/^Bionic · /, '')}…` : 'Drafting offline…'}
          />
        </div>
      )}

      {!rows && !busy && (
        <>
          <div className="examples">
            <span className="hint">Try one:</span>
            {EXAMPLES.map((ex) => (
              <button key={ex} className="chip example" dir="auto" onClick={() => setGoalText(ex)}>
                {ex}
              </button>
            ))}
          </div>
          {!ws && (
            <div className="explore card">
              <div>
                <strong>No goal yet?</strong>
                <p className="muted">Just browse. After three searches Thread.io suggests a goal you can accept.</p>
              </div>
              <button className="btn" onClick={() => void explore()}>
                <Icon name="globe" /> Explore mode
              </button>
            </div>
          )}
        </>
      )}

      {rows && (
        <div className="draft">
          <div className="row draft-head">
            <strong>Route · {rows.length} questions</strong>
            {source === 'rules' && (
              <span
                className="pill thin"
                title="No local model answered, so this draft came from templates. Edit it freely."
              >
                Drafted offline
              </span>
            )}
            {source === 'model' && <span className="pill covered">Drafted locally</span>}
          </div>
          <p className="hint">Edit anything. Your wording is kept even if you re-draft later.</p>
          <ol className="draft-list">
            {rows.map((r, i) => (
              <li key={r.key} className="draft-q card">
                <div className="row">
                  <span className="qnum">{i + 1}</span>
                  <textarea
                    className="textarea q-input"
                    dir="auto"
                    rows={2}
                    value={r.text}
                    aria-label={`Question ${i + 1}`}
                    onChange={(e) => update(r.key, { text: e.target.value })}
                  />
                </div>
                <details>
                  <summary className="hint">Key terms &amp; prepared searches</summary>
                  <label className="label">Key terms</label>
                  <input
                    className="input"
                    dir="auto"
                    value={r.keyTerms.join(', ')}
                    onChange={(e) =>
                      update(r.key, {
                        keyTerms: e.target.value
                          .split(',')
                          .map((t) => t.trim())
                          .filter(Boolean),
                      })
                    }
                  />
                  <label className="label">Prepared searches</label>
                  {[0, 1].map((k) => (
                    <input
                      key={k}
                      className="input search-input"
                      dir="auto"
                      value={r.searches[k] ?? ''}
                      placeholder="search query"
                      onChange={(e) => {
                        const searches = [...r.searches];
                        searches[k] = e.target.value;
                        update(r.key, { searches });
                      }}
                    />
                  ))}
                </details>
                <div className="row draft-actions">
                  <button
                    className="btn ghost small icon"
                    aria-label="Move up"
                    disabled={i === 0}
                    onClick={() => move(r.key, -1)}
                  >
                    <Icon name="chevronDown" className="flip" />
                  </button>
                  <button
                    className="btn ghost small icon"
                    aria-label="Move down"
                    disabled={i === rows.length - 1}
                    onClick={() => move(r.key, 1)}
                  >
                    <Icon name="chevronDown" />
                  </button>
                  <div className="spacer" />
                  <button className="btn ghost small" onClick={() => setRows(rows.filter((x) => x.key !== r.key))}>
                    <Icon name="trash" size={14} /> Remove
                  </button>
                </div>
              </li>
            ))}
          </ol>
          <button
            className="btn block"
            onClick={() => setRows([...rows, toRow({ text: '', keyTerms: [], searches: [], edited: true })])}
          >
            <Icon name="plus" /> Add a question
          </button>
        </div>
      )}

      {error && <p className="error">{error}</p>}

      {rows && (
        <div className="setup-footer">
          {onCancel && (
            <button className="btn" onClick={onCancel}>
              Cancel
            </button>
          )}
          <button
            className="btn brand"
            disabled={busy !== null || !rows.some((r) => r.text.trim())}
            onClick={() => void start()}
          >
            {busy === 'save' ? <span className="spinner" /> : <Icon name="route" />}
            {editing ? 'Save route' : ws ? 'Start route' : 'Start route & record'}
          </button>
        </div>
      )}
      {!rows && onCancel && (
        <button className="btn ghost" onClick={onCancel}>
          Cancel
        </button>
      )}
    </section>
  );
}
