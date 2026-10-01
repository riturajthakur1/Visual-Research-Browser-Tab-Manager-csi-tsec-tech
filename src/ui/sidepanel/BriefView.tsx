import { useState } from 'react';
import { llmJson } from '../../core/ai/llm';
import { db } from '../../core/db';
import { workspaceLanguage } from '../../core/engine/pipeline';
import { buildBrief } from '../../core/export/brief';
import { toJsonCanvas } from '../../core/export/jsoncanvas';
import type { Link, Question, TrailNode, Workspace } from '../../core/types';
import { Icon } from '../components/Icon';
import { Markdown } from '../components/Markdown';
import { Spinner, Switch } from '../components/common';
import { download, slug, useAiStatus } from '../hooks';

export function BriefView({
  ws,
  questions,
  nodes,
  links,
  onBack,
}: {
  ws: Workspace;
  questions: Question[];
  nodes: TrailNode[];
  links: Link[];
  onBack: () => void;
}) {
  const { status } = useAiStatus(60_000);
  const [useModel, setUseModel] = useState(true);
  const [md, setMd] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const name = slug(ws.goal || ws.name);

  const write = async () => {
    setBusy(true);
    try {
      const lang = workspaceLanguage(ws, questions, nodes);
      setMd(await buildBrief({ ws, questions, nodes, lang, llm: useModel && status?.llm ? llmJson : undefined }));
    } finally {
      setBusy(false);
    }
  };

  const backup = async () => {
    const events = await db.events.where('wsId').equals(ws.id).toArray();
    const rules = await db.rules.where('wsId').equals(ws.id).toArray();
    download(
      `${name}.thread.json`,
      JSON.stringify({ format: 'thread-io', version: 1, ws, questions, nodes, links, rules, events }, null, 2),
      'application/json',
    );
  };

  return (
    <section className="brief">
      <div className="row">
        <button className="btn ghost small" onClick={onBack}>
          <Icon name="chevronLeft" size={14} /> Back
        </button>
        <div className="spacer" />
      </div>
      <h1>Research brief</h1>
      <p className="muted">
        A cited outline of what you found and what is still open. References come only from page details (title, site,
        author, date, link); the model never writes them.
      </p>

      <div className="card brief-options">
        <label className="row">
          <Switch
            checked={useModel && !!status?.llm}
            onChange={setUseModel}
            label="Draft findings with the local model"
          />
          <span>
            Draft findings with{' '}
            {status?.llm ? status.llm.label.replace(/^Bionic · /, '') : 'a local model (none running)'}
          </span>
        </label>
        <button className="btn brand" disabled={busy} onClick={() => void write()}>
          {busy ? <span className="spinner" /> : <Icon name="file" />} {md ? 'Rewrite' : 'Write brief'}
        </button>
      </div>
      {busy && <Spinner label={`Writing findings for ${questions.length} questions…`} />}

      <div className="row export-row">
        <button className="btn small" disabled={!md} onClick={() => download(`${name}.md`, md)}>
          <Icon name="download" size={14} /> Markdown
        </button>
        <button
          className="btn small"
          disabled={!md}
          onClick={async () => {
            await navigator.clipboard.writeText(md);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          <Icon name="check" size={14} /> {copied ? 'Copied' : 'Copy'}
        </button>
        <button
          className="btn small"
          title="Open in Obsidian as a canvas"
          onClick={() =>
            download(
              `${name}.canvas`,
              JSON.stringify(toJsonCanvas(ws, questions, nodes, links), null, 2),
              'application/json',
            )
          }
        >
          <Icon name="layers" size={14} /> JSON Canvas
        </button>
        <button className="btn small" title="Everything in this research, as JSON" onClick={() => void backup()}>
          <Icon name="download" size={14} /> Backup
        </button>
      </div>

      {md && (
        <div className="card brief-preview">
          <Markdown source={md} />
        </div>
      )}
    </section>
  );
}
