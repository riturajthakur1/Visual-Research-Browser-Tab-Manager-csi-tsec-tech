import { useState } from 'react';
import { removeQuestion, updateQuestion } from '../../core/actions';
import { db } from '../../core/db';
import type { QuestionCoverage } from '../../core/engine/coverage';
import { sendToBackground } from '../../core/messages';
import type { Question, TrailNode } from '../../core/types';
import { Icon } from '../components/Icon';
import { PageRow } from '../components/PageRow';
import { StatusPill } from '../components/common';

export function QuestionCard({
  q,
  index,
  coverage,
  questions,
  nodesById,
  ranSearches,
}: {
  q: Question;
  index: number;
  coverage: QuestionCoverage;
  questions: Question[];
  nodesById: Map<string, TrailNode>;
  ranSearches: Set<string>;
}) {
  const [open, setOpen] = useState(true);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(q.text);
  const conflict = coverage.status === 'conflict' ? q.conflict : undefined;

  const fill = (query: string) => sendToBackground({ type: 'gap.fill', wsId: q.wsId, questionId: q.id, query });

  const compare = () => {
    if (!conflict || conflict.nodeIds.length !== 2) return;
    const s = screen as Screen & { availLeft?: number; availTop?: number };
    void sendToBackground({
      type: 'nodes.sideBySide',
      nodeIds: [conflict.nodeIds[0], conflict.nodeIds[1]],
      screen: { left: s.availLeft ?? 0, top: s.availTop ?? 0, width: s.availWidth, height: s.availHeight },
    });
  };

  const resolve = async () => {
    if (!q.conflict) return;
    await db.questions.update(q.id, {
      conflict: { ...q.conflict, verdict: 'agree', explanation: 'You marked this as resolved' },
    });
  };

  return (
    <article className={`qcard status-${coverage.status}`} id={`q-${q.id}`}>
      <header className="qcard-head">
        <button
          className="qnum-btn"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          title={open ? 'Collapse' : 'Expand'}
        >
          <span className={`qnum ${coverage.status}`}>{index + 1}</span>
        </button>
        <div className="qcard-title">
          {editing ? (
            <textarea
              className="textarea"
              dir="auto"
              rows={2}
              autoFocus
              value={text}
              onChange={(e) => setText(e.target.value)}
              onBlur={async () => {
                setEditing(false);
                if (text.trim() && text.trim() !== q.text) {
                  await updateQuestion(q.id, { text: text.trim() });
                  await sendToBackground({ type: 'engine.reattach', wsId: q.wsId });
                } else setText(q.text);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) (e.target as HTMLTextAreaElement).blur();
                if (e.key === 'Escape') {
                  setText(q.text);
                  setEditing(false);
                }
              }}
            />
          ) : (
            <h3 dir="auto" onDoubleClick={() => setEditing(true)}>
              {q.text}
            </h3>
          )}
          <div className="row qcard-meta">
            <StatusPill status={coverage.status} stale={coverage.stale} />
            <span className="hint">{coverage.detail}</span>
          </div>
        </div>
        <div className="qcard-tools">
          <button
            className="btn ghost small icon"
            title="Edit question"
            aria-label="Edit question"
            onClick={() => setEditing(true)}
          >
            <Icon name="edit" size={14} />
          </button>
          <button
            className="btn ghost small icon"
            title="Remove question"
            aria-label="Remove question"
            onClick={async () => {
              if (confirm(`Remove “${q.text}”? Its pages go back to matching.`)) {
                await removeQuestion(q.id);
                await sendToBackground({ type: 'engine.reattach', wsId: q.wsId });
              }
            }}
          >
            <Icon name="trash" size={14} />
          </button>
        </div>
      </header>

      {open && (
        <div className="qcard-body">
          {conflict && (
            <div className="conflict-box" dir="auto">
              <div className="row">
                <Icon name="alert" size={14} />
                <strong>Sources disagree</strong>
              </div>
              <p>{conflict.explanation}</p>
              {conflict.nodeIds.length === 2 && (
                <p className="hint">
                  {conflict.nodeIds
                    .map((id) => nodesById.get(id)?.site)
                    .filter(Boolean)
                    .join(' vs ')}
                </p>
              )}
              <div className="row">
                <button className="btn small" onClick={compare} disabled={conflict.nodeIds.length !== 2}>
                  <Icon name="split" size={14} /> Compare side by side
                </button>
                <button className="btn small ghost" onClick={() => void resolve()}>
                  Mark resolved
                </button>
              </div>
            </div>
          )}

          {coverage.sources.length > 0 && (
            <ul className="page-list">
              {coverage.sources.map((n) => (
                <PageRow key={n.id} node={n} questions={questions} />
              ))}
            </ul>
          )}

          {(coverage.status === 'gap' || coverage.status === 'thin') && coverage.next && (
            <p className="next-hint">{coverage.next}</p>
          )}
          {q.searches.length > 0 && (
            <div className="searches">
              {q.searches.map((s) => (
                <button
                  key={s}
                  className={`chip search-chip ${ranSearches.has(s.toLowerCase()) ? 'ran' : ''}`}
                  dir="auto"
                  onClick={() => void fill(s)}
                  title="Run this prepared search: pages you open from it file here automatically"
                >
                  <Icon name="search" size={12} />
                  <span className="truncate">{s}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </article>
  );
}
