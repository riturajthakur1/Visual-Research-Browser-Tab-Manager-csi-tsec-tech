import { useEffect, useState } from 'react';
import {
  acceptAttachment,
  addLink,
  deleteNode,
  moveNode,
  rejectAttachment,
  removeHighlight,
  updateNode,
  updateQuestion,
} from '../../core/actions';
import type { QuestionCoverage } from '../../core/engine/coverage';
import { sendToBackground } from '../../core/messages';
import { PAGE_TYPE_LABEL } from '../../core/page-type';
import type { LinkType, Question, TrailNode } from '../../core/types';
import { timeAgo } from '../../core/util';
import { Favicon, StatusPill } from '../components/common';
import { Icon } from '../components/Icon';

const LINK_TYPES: LinkType[] = ['related', 'supports', 'contradicts', 'prerequisite', 'example-of'];

export function Drawer({
  selected,
  questions,
  nodes,
  coverage,
  onClose,
  onFocus,
}: {
  selected: { kind: 'node'; node: TrailNode } | { kind: 'question'; q: Question; index: number };
  questions: Question[];
  nodes: TrailNode[];
  coverage: Map<string, QuestionCoverage>;
  onClose: () => void;
  onFocus: (id: string) => void;
}) {
  return (
    <aside className="drawer" aria-label="Details">
      <div className="row drawer-head">
        <span className="eyebrow">
          {selected.kind === 'question'
            ? `Question ${selected.index + 1}`
            : selected.node.kind === 'search'
              ? 'Search'
              : selected.node.kind === 'note'
                ? 'Note'
                : 'Page'}
        </span>
        <div className="spacer" />
        <button className="btn ghost small icon" aria-label="Close" onClick={onClose}>
          <Icon name="x" size={14} />
        </button>
      </div>
      {selected.kind === 'question' ? (
        <QuestionDetails q={selected.q} coverage={coverage.get(selected.q.id)} onFocus={onFocus} />
      ) : (
        <NodeDetails node={selected.node} questions={questions} nodes={nodes} onClose={onClose} onFocus={onFocus} />
      )}
    </aside>
  );
}

function QuestionDetails({
  q,
  coverage,
  onFocus,
}: {
  q: Question;
  coverage?: QuestionCoverage;
  onFocus: (id: string) => void;
}) {
  const [text, setText] = useState(q.text);
  useEffect(() => setText(q.text), [q.text]);
  return (
    <div className="drawer-body">
      <textarea
        className="textarea q-edit"
        dir="auto"
        rows={3}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={async () => {
          if (text.trim() && text.trim() !== q.text) {
            await updateQuestion(q.id, { text: text.trim() });
            await sendToBackground({ type: 'engine.reattach', wsId: q.wsId });
          }
        }}
      />
      {coverage && (
        <div className="row">
          <StatusPill status={coverage.status} stale={coverage.stale} />
          <span className="hint">{coverage.detail}</span>
        </div>
      )}
      {q.conflict?.verdict === 'conflict' && coverage?.status === 'conflict' && (
        <p className="conflict-note" dir="auto">
          {q.conflict.explanation}
        </p>
      )}
      <h4>Sources</h4>
      {coverage?.sources.length ? (
        <ul className="drawer-list">
          {coverage.sources.map((s) => (
            <li key={s.id}>
              <button className="link-btn row" onClick={() => onFocus(s.id)}>
                <Favicon node={s} size={14} />
                <span className="truncate" dir="auto">
                  {s.title}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="hint">None yet.</p>
      )}
      <h4>Prepared searches</h4>
      <div className="searches">
        {q.searches.map((s) => (
          <button
            key={s}
            className="chip search-chip"
            dir="auto"
            onClick={() => void sendToBackground({ type: 'gap.fill', wsId: q.wsId, questionId: q.id, query: s })}
          >
            <Icon name="search" size={12} /> {s}
          </button>
        ))}
      </div>
      {q.keyTerms.length > 0 && (
        <>
          <h4>Key terms</h4>
          <div className="searches">
            {q.keyTerms.map((t) => (
              <span key={t} className="chip" dir="auto">
                {t}
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function NodeDetails({
  node,
  questions,
  nodes,
  onClose,
  onFocus,
}: {
  node: TrailNode;
  questions: Question[];
  nodes: TrailNode[];
  onClose: () => void;
  onFocus: (id: string) => void;
}) {
  const [notes, setNotes] = useState(node.notes);
  const [tags, setTags] = useState(node.tags.join(', '));
  const [linkTo, setLinkTo] = useState('');
  const [linkType, setLinkType] = useState<LinkType>('related');
  useEffect(() => {
    setNotes(node.notes);
    setTags(node.tags.join(', '));
  }, [node.id, node.notes, node.tags]);

  const a = node.attach;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const opener = node.prov.openerId ? byId.get(node.prov.openerId) : undefined;
  const search = node.prov.searchId ? byId.get(node.prov.searchId) : undefined;
  const qLabel = (id: string) => {
    const i = questions.findIndex((q) => q.id === id);
    return i >= 0 ? `Q${i + 1}. ${questions[i].text}` : 'removed question';
  };

  if (node.kind === 'note') {
    return (
      <div className="drawer-body">
        <textarea
          className="textarea"
          dir="auto"
          rows={8}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={() => void updateNode(node.id, { notes, title: notes.split('\n')[0].slice(0, 80) || 'Note' })}
        />
        <button className="btn danger small" onClick={() => void deleteNode(node.id).then(onClose)}>
          <Icon name="trash" size={14} /> Delete note
        </button>
      </div>
    );
  }

  return (
    <div className="drawer-body">
      <div className="row">
        <Favicon node={node} size={18} />
        <h3 className="drawer-title" dir="auto">
          {node.kind === 'search' ? node.query : node.title}
        </h3>
      </div>
      <p className="hint">
        {node.site}
        {node.kind === 'page' && ` · ${PAGE_TYPE_LABEL[node.pageType]}`}
        {node.publishedAt && ` · ${node.publishedAt.slice(0, 10)}`} · seen {timeAgo(node.createdAt)}
      </p>
      <div className="row wrap">
        <button className="btn small" onClick={() => void sendToBackground({ type: 'node.open', nodeId: node.id })}>
          <Icon name="external" size={14} /> {node.status === 'open' ? 'Go to tab' : 'Open'}
        </button>
      </div>

      {node.kind === 'page' && (
        <>
          <h4>Why is this here?</h4>
          <div className="why">
            {a?.reason ? <p dir="auto">{a.reason}</p> : <p className="hint">Still being matched…</p>}
            {search && (
              <button className="link-btn row" onClick={() => onFocus(search.id)}>
                <Icon name="search" size={12} /> <span dir="auto">Found via “{search.query}”</span>
              </button>
            )}
            {opener && (
              <button className="link-btn row" onClick={() => onFocus(opener.id)}>
                <Icon name="link" size={12} />{' '}
                <span className="truncate" dir="auto">
                  Opened from {opener.title}
                </span>
              </button>
            )}
            {a?.alternatives?.length ? (
              <p className="hint">
                Runner-up: {qLabel(a.alternatives[0].questionId)} ({Math.round(a.alternatives[0].score * 100)}%)
              </p>
            ) : null}
          </div>
          <div className="row wrap">
            {a?.state === 'suggested' && a.questionId && (
              <button className="btn small" onClick={() => void acceptAttachment(node.id)}>
                <Icon name="check" size={14} /> Keep here
              </button>
            )}
            {a?.questionId && (
              <button
                className="btn small ghost"
                onClick={async () => {
                  await rejectAttachment(node.id);
                  await sendToBackground({ type: 'engine.reattach', wsId: node.wsId, nodeIds: [node.id] });
                }}
              >
                <Icon name="x" size={14} /> Not this question
              </button>
            )}
          </div>
          <label className="label">File under</label>
          <select
            className="select"
            value={a?.questionId ?? ''}
            onChange={(e) => void moveNode(node.id, e.target.value || null)}
          >
            <option value="">Parking lot</option>
            {questions.map((q, i) => (
              <option key={q.id} value={q.id}>
                Q{i + 1}. {q.text}
              </option>
            ))}
          </select>

          {node.summary && (
            <>
              <h4>Summary</h4>
              <p dir="auto">{node.summary}</p>
            </>
          )}

          <h4>Highlights</h4>
          {node.highlights.length ? (
            <ul className="drawer-list highlights">
              {node.highlights.map((h) => (
                <li key={h.id}>
                  <blockquote dir="auto">{h.text}</blockquote>
                  <div className="row">
                    <button
                      className="link-btn"
                      onClick={() => void sendToBackground({ type: 'url.open', url: h.url })}
                    >
                      Show in page
                    </button>
                    <button className="link-btn danger" onClick={() => void removeHighlight(node.id, h.id)}>
                      Remove
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="hint">
              Select text on the page, then right-click → “Save to Thread.io as evidence” (or Alt+Shift+H).
            </p>
          )}
        </>
      )}

      <h4>Notes</h4>
      <textarea
        className="textarea"
        dir="auto"
        rows={4}
        placeholder="Your thoughts on this source…"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        onBlur={() => notes !== node.notes && void updateNode(node.id, { notes })}
      />
      <label className="label">Tags</label>
      <input
        className="input"
        dir="auto"
        placeholder="comma, separated"
        value={tags}
        onChange={(e) => setTags(e.target.value)}
        onBlur={() =>
          void updateNode(node.id, {
            tags: tags
              .split(',')
              .map((t) => t.trim())
              .filter(Boolean),
          })
        }
      />

      <h4>Connect</h4>
      <div className="row">
        <select className="select" value={linkType} onChange={(e) => setLinkType(e.target.value as LinkType)}>
          {LINK_TYPES.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
        <select className="select" value={linkTo} onChange={(e) => setLinkTo(e.target.value)}>
          <option value="">choose a page…</option>
          {nodes
            .filter((n) => n.kind === 'page' && n.id !== node.id)
            .map((n) => (
              <option key={n.id} value={n.id}>
                {n.title}
              </option>
            ))}
        </select>
        <button
          className="btn small"
          disabled={!linkTo}
          onClick={() => void addLink(node.wsId, node.id, linkTo, linkType).then(() => setLinkTo(''))}
        >
          Link
        </button>
      </div>

      <button
        className="btn danger small"
        onClick={async () => {
          if (confirm('Remove this page from the map?')) {
            await deleteNode(node.id);
            onClose();
          }
        }}
      >
        <Icon name="trash" size={14} /> Remove from map
      </button>
    </div>
  );
}
