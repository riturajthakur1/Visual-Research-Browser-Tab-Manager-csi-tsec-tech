// Renders the brief's Markdown (a known, simple subset) without any HTML injection.
import { Fragment, type ReactNode } from 'react';

function inline(text: string, key = ''): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|_[^_]+_|<https?:\/\/[^>]+>|\[\d+\])/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    const k = `${key}-${i++}`;
    if (tok.startsWith('**')) out.push(<strong key={k}>{tok.slice(2, -2)}</strong>);
    else if (tok.startsWith('<')) {
      const url = tok.slice(1, -1);
      out.push(
        <a key={k} href={url} target="_blank" rel="noreferrer">
          {url}
        </a>,
      );
    } else if (tok.startsWith('['))
      out.push(
        <sup key={k} className="cite">
          {tok}
        </sup>,
      );
    else out.push(<em key={k}>{tok.slice(1, -1)}</em>);
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Markdown({ source }: { source: string }) {
  const lines = source.split('\n');
  const blocks: ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const k = `b${i}`;
    if (!line.trim()) {
      i++;
      continue;
    }
    if (line.startsWith('# '))
      blocks.push(
        <h1 key={k} dir="auto">
          {inline(line.slice(2), k)}
        </h1>,
      );
    else if (line.startsWith('## '))
      blocks.push(
        <h2 key={k} dir="auto">
          {inline(line.slice(3), k)}
        </h2>,
      );
    else if (line.startsWith('|')) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i].startsWith('|')) {
        if (!/^\|[-|\s]+\|$/.test(lines[i]))
          rows.push(
            lines[i]
              .split('|')
              .slice(1, -1)
              .map((c) => c.trim()),
          );
        i++;
      }
      const [head, ...body] = rows;
      blocks.push(
        <table key={k}>
          <thead>
            <tr>
              {head.map((c, j) => (
                <th key={j}>{inline(c)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {body.map((r, ri) => (
              <tr key={ri}>
                {r.map((c, j) => (
                  <td key={j} dir="auto">
                    {inline(c, `${k}${ri}${j}`)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>,
      );
      continue;
    } else if (/^(- |\d+\. )/.test(line)) {
      const ordered = /^\d+\. /.test(line);
      const items: ReactNode[] = [];
      while (i < lines.length && (/^(- |\d+\. )/.test(lines[i]) || /^\s+> /.test(lines[i]))) {
        const l = lines[i];
        if (/^\s+> /.test(l) && items.length) {
          items.push(
            <blockquote key={`q${i}`} dir="auto">
              {inline(l.replace(/^\s+> /, ''), `q${i}`)}
            </blockquote>,
          );
        } else {
          items.push(
            <li key={`l${i}`} dir="auto">
              {inline(l.replace(/^(- |\d+\. )/, ''), `l${i}`)}
            </li>,
          );
        }
        i++;
      }
      blocks.push(ordered ? <ol key={k}>{items}</ol> : <ul key={k}>{items}</ul>);
      continue;
    } else
      blocks.push(
        <p key={k} dir="auto">
          {inline(line, k)}
        </p>,
      );
    i++;
  }
  return (
    <div className="markdown">
      {blocks.map((b, j) => (
        <Fragment key={j}>{b}</Fragment>
      ))}
    </div>
  );
}
