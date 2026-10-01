import { describe, expect, it } from 'vitest';
import { newWorkspace } from '../../src/core/db';
import { buildBrief, formatReference, validateFindings } from '../../src/core/export/brief';
import { toJsonCanvas } from '../../src/core/export/jsoncanvas';
import { detectLanguage } from '../../src/core/lang';
import { makePage, makeQuestion } from './helpers';

const ws = {
  ...newWorkspace('Mumbai', 'Why does Mumbai flood every monsoon?'),
  settings: { aiMode: 'suggest' as const, requireHighlight: false, staleMonths: 0 },
};
const q1 = makeQuestion(ws.id, 'How do the drains fail?', 0, [], ['mumbai drain capacity', 'brimstowad']);
const q2 = makeQuestion(ws.id, 'What solutions exist?', 1, [], ['mumbai flood solutions', 'sponge city mumbai']);
const a = makePage(ws.id, 'https://a.example/drains', { title: 'Drains of Mumbai', questionId: q1.id });
a.summary = 'Drains carry 25 mm of rain per hour.';
a.author = 'MCGM';
a.publishedAt = '2021-06-01';
const b = makePage(ws.id, 'https://b.example/brim', { title: 'BRIMSTOWAD project', questionId: q1.id });
b.summary = 'The project raises capacity to 50 mm per hour.';
b.highlights.push({
  id: 'h1',
  text: 'capacity of 50 mm per hour',
  url: 'https://b.example/brim#:~:text=capacity',
  at: 0,
});

describe('validateFindings', () => {
  it('drops uncited findings and citations to sources that were not given', () => {
    const out = validateFindings(
      [
        { text: 'Drains carry 25 mm/h [1].', refs: [1] },
        { text: 'Invented claim.', refs: [9] },
        { text: 'No citation.', refs: [] },
      ],
      new Set([1, 2]),
    );
    expect(out).toEqual([{ text: 'Drains carry 25 mm/h.', refs: [1] }]);
  });
});

describe('formatReference', () => {
  it('builds the entry from metadata only', () => {
    expect(formatReference(a, 1, 'accessed')).toMatch(
      /^1\. MCGM \(2021\)\. \*Drains of Mumbai\*\. a\.example\. <https:\/\/a\.example\/drains> \(accessed \d{4}-\d{2}-\d{2}\)$/,
    );
  });
});

describe('buildBrief', () => {
  it('cites sources, lists gaps as open questions and builds references', async () => {
    const md = await buildBrief({
      ws,
      questions: [q1, q2],
      nodes: [a, b],
      lang: detectLanguage(ws.goal),
      date: new Date('2026-10-01'),
    });
    expect(md).toContain('# Why does Mumbai flood every monsoon?');
    expect(md).toContain('- Drains carry 25 mm of rain per hour. [1]');
    expect(md).toContain('“capacity of 50 mm per hour” [2]');
    expect(md).toContain('## Open questions');
    expect(md).toContain('**What solutions exist?** — Gap');
    expect(md).toContain('Try: “mumbai flood solutions”');
    expect(md).toMatch(/## References\n\n1\. MCGM/);
  });

  it('uses model findings only when they cite given sources', async () => {
    const md = await buildBrief({
      ws,
      questions: [q1, q2],
      nodes: [a, b],
      lang: detectLanguage(ws.goal),
      llm: async <T>() =>
        ({
          findings: [
            { text: 'Capacity is doubling from 25 to 50 mm per hour.', refs: [1, 2] },
            { text: 'Made up.', refs: [7] },
          ],
        }) as T,
    });
    expect(md).toContain('- Capacity is doubling from 25 to 50 mm per hour. [1][2]');
    expect(md).not.toContain('Made up');
  });

  it('labels the brief in the goal language', async () => {
    const hiWs = { ...ws, goal: 'मुंबई में बाढ़ क्यों आती है?' };
    const md = await buildBrief({ ws: hiWs, questions: [q1, q2], nodes: [a, b], lang: detectLanguage(hiWs.goal) });
    expect(md).toContain('## संदर्भ');
    expect(md).toContain('## खुले प्रश्न');
  });
});

describe('toJsonCanvas', () => {
  it('produces valid JSON Canvas nodes and edges', () => {
    const canvas = toJsonCanvas(ws, [q1, q2], [a, b], []);
    const ids = new Set(canvas.nodes.map((n) => n.id));
    expect(canvas.nodes.find((n) => n.id === a.id)).toMatchObject({ type: 'link', url: a.url });
    expect(canvas.nodes.find((n) => n.id === q2.id)?.color).toBe('1');
    for (const e of canvas.edges) {
      expect(ids.has(e.fromNode)).toBe(true);
      expect(ids.has(e.toNode)).toBe(true);
    }
  });
});
