import { describe, expect, it } from 'vitest';
import { newWorkspace } from '../../src/core/db';
import { biggestGap, coverageFor, sourceSignature } from '../../src/core/engine/coverage';
import { makePage, makeQuestion } from './helpers';

const ws = newWorkspace('Test', 'Why does Mumbai flood?');
const q = makeQuestion(ws.id, 'What causes it?', 0);
const page = (url: string) => makePage(ws.id, url, { questionId: q.id });

describe('coverageFor', () => {
  it('is a gap with no sources', () => {
    expect(coverageFor(q, [], ws).status).toBe('gap');
  });

  it('is thin with one source', () => {
    expect(coverageFor(q, [page('https://a.com/1')], ws).status).toBe('thin');
  });

  it('is thin when every source is from one site', () => {
    const c = coverageFor(q, [page('https://news.a.com/1'), page('https://www.a.com/2')], ws);
    expect(c.status).toBe('thin');
    expect(c.sites).toEqual(['a.com']);
  });

  it('counts gov.in subdomains of different bodies as different sites', () => {
    const c = coverageFor(q, [page('https://mcgm.gov.in/a'), page('https://imd.gov.in/b')], {
      ...ws,
      settings: { ...ws.settings, requireHighlight: false },
    });
    expect(c.status).toBe('covered');
  });

  it('needs a highlight to be covered by default', () => {
    const ps = [page('https://a.com/1'), page('https://b.org/2')];
    expect(coverageFor(q, ps, ws).status).toBe('thin');
    ps[0].highlights.push({ id: 'h', text: 'Drains carry 25 mm/hour', url: 'https://a.com/1', at: 0 });
    expect(coverageFor(q, ps, ws).status).toBe('covered');
  });

  it('is covered without highlights when the setting is off', () => {
    const relaxed = { ...ws, settings: { ...ws.settings, requireHighlight: false } };
    expect(coverageFor(q, [page('https://a.com/1'), page('https://b.org/2')], relaxed).status).toBe('covered');
  });

  it('ignores pages filed under other questions or parked', () => {
    const other = makePage(ws.id, 'https://c.com', { questionId: 'q_other' });
    const parked = makePage(ws.id, 'https://d.com', { questionId: null });
    expect(coverageFor(q, [other, parked], ws).status).toBe('gap');
  });

  it('shows a conflict only while the checked sources are unchanged', () => {
    const ps = [page('https://a.com/1'), page('https://b.org/2')];
    const conflicted = {
      ...q,
      conflict: {
        verdict: 'conflict' as const,
        explanation: 'Rainfall figures differ',
        nodeIds: [ps[0].id, ps[1].id],
        signature: sourceSignature(ps),
        checkedAt: 0,
      },
    };
    expect(coverageFor(conflicted, ps, ws).status).toBe('conflict');
    expect(coverageFor(conflicted, [...ps, page('https://c.net/3')], ws).status).not.toBe('conflict');
  });

  it('flags stale sources', () => {
    const p = page('https://a.com/1');
    p.publishedAt = '2010-01-01';
    expect(coverageFor(q, [p], ws, Date.parse('2026-10-01')).stale).toBe(true);
    p.publishedAt = '2026-01-01';
    expect(coverageFor(q, [p], ws, Date.parse('2026-10-01')).stale).toBe(false);
  });
});

describe('biggestGap', () => {
  it('prefers gaps over thin questions, in route order', () => {
    const q2 = makeQuestion(ws.id, 'Second', 1);
    const cov = new Map([
      [q.id, coverageFor(q, [page('https://a.com')], ws)],
      [q2.id, coverageFor(q2, [], ws)],
    ]);
    expect(biggestGap([q, q2], cov)?.id).toBe(q2.id);
  });
});
