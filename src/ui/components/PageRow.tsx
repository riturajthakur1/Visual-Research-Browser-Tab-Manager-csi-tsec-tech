import { useState } from 'react';
import { acceptAttachment, moveNode, rejectAttachment } from '../../core/actions';
import { PAGE_TYPE_LABEL } from '../../core/page-type';
import { sendToBackground } from '../../core/messages';
import type { Question, TrailNode } from '../../core/types';
import { Favicon } from './common';
import { Icon } from './Icon';

/** One page inside a question (or the parking lot), with "why is this here?" and quick fixes. */
export function PageRow({ node, questions, compact }: { node: TrailNode; questions: Question[]; compact?: boolean }) {
  const [moving, setMoving] = useState(false);
  const a = node.attach;
  const suggested = a?.state === 'suggested' && !!a.questionId;
  const firm = a && (a.method === 'user' || a.method === 'prepared');

  const reattach = () => sendToBackground({ type: 'engine.reattach', wsId: node.wsId, nodeIds: [node.id] });

  return (
    <li className={`page-row ${suggested ? 'suggested' : ''}`}>
      <div className="row page-main">
        <Favicon node={node} />
        <button
          className="page-title"
          dir="auto"
          title={node.url}
          onClick={() => void sendToBackground({ type: 'node.open', nodeId: node.id })}
        >
          {node.title}
        </button>
        {node.highlights.length > 0 && (
          <span className="badge" title={`${node.highlights.length} highlight${node.highlights.length > 1 ? 's' : ''}`}>
            <Icon name="highlight" size={12} />
            {node.highlights.length}
          </span>
        )}
      </div>
      {!compact && (
        <div className="page-meta">
          <span>{node.site}</span>
          <span>·</span>
          <span>{PAGE_TYPE_LABEL[node.pageType]}</span>
          {node.status === 'hibernated' && <span className="chip tiny">hibernated</span>}
        </div>
      )}
      {a?.reason && (
        <div className={`reason ${firm ? 'firm' : ''}`} dir="auto">
          <Icon
            name={a.method === 'prepared' || a.method === 'trail' ? 'route' : a.method === 'user' ? 'check' : 'sparkle'}
            size={12}
          />
          <span>{a.reason}</span>
        </div>
      )}
      <div className="row page-actions">
        {suggested && (
          <button className="btn small" title="Keep it here" onClick={() => void acceptAttachment(node.id)}>
            <Icon name="check" size={14} /> Keep
          </button>
        )}
        {moving ? (
          <select
            className="select small-select"
            autoFocus
            aria-label="File under"
            value={a?.questionId ?? ''}
            onBlur={() => setMoving(false)}
            onChange={async (e) => {
              setMoving(false);
              await moveNode(node.id, e.target.value || null);
            }}
          >
            <option value="">Parking lot</option>
            {questions.map((q, i) => (
              <option key={q.id} value={q.id}>
                Q{i + 1}. {q.text}
              </option>
            ))}
          </select>
        ) : (
          <button className="btn small ghost" onClick={() => setMoving(true)}>
            <Icon name="chevronRight" size={14} /> {a?.questionId ? 'Move' : 'File under…'}
          </button>
        )}
        {a?.questionId && (
          <button
            className="btn small ghost"
            title="Not this question — find a better one"
            onClick={async () => {
              await rejectAttachment(node.id);
              await reattach();
            }}
          >
            <Icon name="x" size={14} /> Not this
          </button>
        )}
      </div>
    </li>
  );
}
