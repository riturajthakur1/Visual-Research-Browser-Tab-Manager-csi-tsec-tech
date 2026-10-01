import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import { STATUS_LABEL } from '../../core/engine/coverage';
import { SIZE } from '../../core/layout';
import { PAGE_TYPE_LABEL } from '../../core/page-type';
import { Avatar } from '../components/Avatar';
import { Favicon } from '../components/common';
import { useTeam } from '../team-context';
import { Icon } from '../components/Icon';
import type { GoalData, NoteData, PageData, ParkingData, QuestionData, SearchData } from './graph';

// Edges are drawn between card borders (FloatingEdge); handles only anchor them.
function Anchors() {
  return (
    <>
      <Handle type="target" position={Position.Top} className="anchor" isConnectable={false} />
      <Handle type="source" position={Position.Bottom} className="anchor" isConnectable={false} />
    </>
  );
}

export function GoalNode({ data }: NodeProps<Node<GoalData>>) {
  const { ws, questions, coverage } = data;
  return (
    <div className="n-goal" style={{ width: SIZE.goal.w, minHeight: SIZE.goal.h }}>
      <Anchors />
      <span className="eyebrow">{ws.goal ? 'Destination' : 'Exploring'}</span>
      <p dir="auto">{ws.goal || ws.name}</p>
      {questions.length > 0 && (
        <div className="mini-strip">
          {questions.map((q) => (
            <span key={q.id} className={`seg ${coverage.get(q.id)?.status ?? 'gap'}`} />
          ))}
        </div>
      )}
    </div>
  );
}

export function QuestionNode({ data, selected }: NodeProps<Node<QuestionData>>) {
  const { q, index, coverage } = data;
  const status = coverage?.status ?? 'gap';
  return (
    <div
      className={`n-question ${status} ${selected ? 'selected' : ''}`}
      style={{ width: SIZE.question.w, minHeight: SIZE.question.h }}
    >
      <Anchors />
      <div className="row">
        <span className={`qnum ${status}`}>{index + 1}</span>
        <span className={`pill ${status}`}>
          {STATUS_LABEL[status]}
          {coverage?.stale && ' · stale'}
        </span>
        <span className="spacer" />
        {q.claimedBy && <Avatar member={q.claimedBy} size={18} title={`${q.claimedBy.name} is on it`} />}
        <span className="hint">{coverage?.sources.length ?? 0} src</span>
      </div>
      <p className="clamp-3" dir="auto">
        {q.text}
      </p>
    </div>
  );
}

export function PageNode({ data, selected }: NodeProps<Node<PageData>>) {
  const { node, status } = data;
  const team = useTeam();
  const byTeammate = team.shared && node.foundBy && node.foundBy.id !== team.meId ? node.foundBy : undefined;
  const suggested = node.attach?.state === 'suggested' && !!node.attach.questionId;
  return (
    <div
      className={`n-page ${status ?? 'parked'} ${suggested ? 'suggested' : ''} ${node.status} ${selected ? 'selected' : ''}`}
      style={{ width: SIZE.page.w, minHeight: SIZE.page.h }}
      title={node.attach?.reason}
    >
      <Anchors />
      <div className="row">
        <Favicon node={node} size={14} />
        <span className="n-site truncate">{node.site}</span>
        <span className="spacer" />
        {byTeammate && <Avatar member={byTeammate} size={16} title={`Found by ${byTeammate.name}`} />}
        {node.highlights.length > 0 && (
          <span className="badge">
            <Icon name="highlight" size={11} />
            {node.highlights.length}
          </span>
        )}
        {node.notes && <Icon name="note" size={12} className="muted" />}
      </div>
      <p className="clamp-2" dir="auto">
        {node.title}
      </p>
      <span className="n-type">{PAGE_TYPE_LABEL[node.pageType]}</span>
    </div>
  );
}

export function SearchNode({ data, selected }: NodeProps<Node<SearchData>>) {
  return (
    <div className={`n-search ${selected ? 'selected' : ''}`}>
      <Anchors />
      <Icon name="search" size={13} />
      <span className="clamp-2" dir="auto">
        {data.node.query}
      </span>
    </div>
  );
}

export function NoteNode({ data, selected }: NodeProps<Node<NoteData>>) {
  return (
    <div className={`n-note ${selected ? 'selected' : ''}`} style={{ width: SIZE.note.w, minHeight: SIZE.note.h }}>
      <Anchors />
      <p dir="auto">{data.node.notes || 'Empty note'}</p>
    </div>
  );
}

export function ParkingNode({ data }: NodeProps<Node<ParkingData>>) {
  return (
    <div className="n-parking">
      <span className="eyebrow">
        Parking lot · {data.count} {data.count === 1 ? 'page' : 'pages'}
      </span>
    </div>
  );
}

export const nodeTypes = {
  goal: GoalNode,
  question: QuestionNode,
  page: PageNode,
  search: SearchNode,
  note: NoteNode,
  parking: ParkingNode,
};
