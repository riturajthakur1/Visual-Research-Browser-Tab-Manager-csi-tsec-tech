import { describe, expect, it } from 'vitest';
import fixture from '../fixtures/mumbai.json';
import { newWorkspace } from '../../src/core/db';
import { decideAttachment, type AttachContext } from '../../src/core/engine/attach';
import { lexicalScorer, type SemanticScorer } from '../../src/core/engine/semantic';
import type { Question, Rule, TrailNode } from '../../src/core/types';
import { makePage, makeQuestion } from './helpers';

const ws = newWorkspace('Mumbai', fixture.goal.en);
const KEY_TERMS = [
  ['monsoon', 'rainfall', 'flooding'],
  ['drainage', 'storm water', 'drains'],
  ['mangroves', 'wetlands', 'reclamation'],
  ['solutions', 'sponge city', 'mitigation'],
  ['climate change', 'extreme rainfall'],
  ['2005', 'deluge', 'casualties'],
];
const questions: Question[] = fixture.questions.en.map((text, i) => makeQuestion(ws.id, text, i, KEY_TERMS[i], []));
const englishDocs = fixture.docs.filter((d) => !d.label.includes('-'));
const pages = englishDocs.map((d, i) => makePage(ws.id, `https://site${i}.example/${d.label}`, { title: d.label, text: d.text, createdAt: i }));

function context(nodes: TrailNode[] = pages, rules: Rule[] = [], aiMode: 'off' | 'suggest' | 'auto' = 'suggest'): AttachContext {
  return {
    ws: { ...ws, settings: { ...ws.settings, aiMode } },
    questions,
    nodesById: new Map(nodes.map((n) => [n.id, n])),
    rules,
    scorer: lexicalScorer(ws.goal, questions, nodes),
  };
}

describe('decideAttachment (keyword matching)', () => {
  it.each(englishDocs.filter((d) => d.answers >= 0).map((d) => [d.label, d.answers] as const))('files %s under question index %i', async (label, answer) => {
    const node = pages.find((p) => p.title === label)!;
    const a = await decideAttachment(node, context());
    expect(a?.questionId).toBe(questions[answer].id);
    expect(a?.reason).toMatch(new RegExp(`^Answers Q${answer + 1}`));
    expect(a?.state).toBe('suggested');
  });

  it('parks off-topic pages', async () => {
    for (const label of ['offtopic', 'react']) {
      const a = await decideAttachment(pages.find((p) => p.title === label)!, context());
      expect(a?.questionId).toBeNull();
    }
  });

  it('files pages from a prepared search with certainty', async () => {
    const search: TrailNode = { ...makePage(ws.id, 'https://www.google.com/search?q=x'), kind: 'search', query: 'mumbai drains capacity', prov: { openedAt: 0, questionTag: questions[1].id } };
    const page = makePage(ws.id, 'https://unrelated.example', { title: 'Anything', prov: { searchId: search.id, questionTag: questions[1].id } });
    const a = await decideAttachment(page, context([...pages, search, page]));
    expect(a).toMatchObject({ questionId: questions[1].id, method: 'prepared', state: 'accepted', score: 1 });
    expect(a?.reason).toContain('mumbai drains capacity');
  });

  it('never moves a page the user filed', async () => {
    const node = { ...pages[0], attach: { questionId: questions[5].id, score: 1, reason: 'You filed this here', method: 'user' as const, state: 'accepted' as const, alternatives: [], at: 0 } };
    expect(await decideAttachment(node, context())).toBeUndefined();
  });

  it('respects a rejected question', async () => {
    const node = pages.find((p) => p.title === 'drainage')!;
    const rule: Rule = { id: 'r', wsId: ws.id, kind: 'cannot-attach', nodeId: node.id, questionId: questions[1].id, createdAt: 0 };
    const a = await decideAttachment(node, context(pages, [rule]));
    expect(a?.questionId).not.toBe(questions[1].id);
  });

  it('applies directly in auto mode and parks in off mode', async () => {
    const node = pages.find((p) => p.title === 'climate')!;
    expect((await decideAttachment(node, context(pages, [], 'auto')))?.state).toBe('accepted');
    expect((await decideAttachment(node, context(pages, [], 'off')))?.questionId).toBeNull();
  });

  it('inherits the question of the page it was opened from', async () => {
    const parent = { ...pages.find((p) => p.title === 'mangrove')! };
    parent.attach = { questionId: questions[2].id, score: 1, reason: '', method: 'user', state: 'accepted', alternatives: [], at: 0 };
    const child = makePage(ws.id, 'https://child.example', { title: 'Mahim creek reclamation history', text: 'Mahim creek was reclaimed in stages.', prov: { openerId: parent.id } });
    const a = await decideAttachment(child, context([...pages, parent, child]));
    expect(a?.questionId).toBe(questions[2].id);
    expect(a?.reason).toContain('opened from');
  });

  describe('close calls', () => {
    // Q1 and Q2 score almost the same: below the margin, above the tie-break floor.
    const closeScorer: SemanticScorer = {
      kind: 'embedding',
      label: 'stub',
      scoreNode: async () => ({ relevance: 0.9, perQuestion: [0.55, 0.53, 0.1, 0.1, 0.1, 0.1] }),
      scoreQuery: async () => ({ relevance: 0.9, perQuestion: [0, 0, 0, 0, 0, 0] }),
    };
    const vague = makePage(ws.id, 'https://vague.example', { title: 'Mumbai rains' });

    it('asks the model and records its reason', async () => {
      let candidates = '';
      const ctx = { ...context(), scorer: closeScorer, llm: async <T,>(req: { user: string }) => {
        candidates = req.user;
        return { question: 2, reason: 'Describes drain capacity problems.' } as T;
      } };
      const a = await decideAttachment(vague, ctx);
      expect(candidates).toContain('2. How does Mumbai');
      expect(a).toMatchObject({ questionId: questions[1].id, method: 'llm' });
      expect(a?.reason).toBe('Answers Q2 · Describes drain capacity problems');
    });

    it('parks the page when the model says it answers none', async () => {
      const ctx = { ...context(), scorer: closeScorer, llm: async <T,>() => ({ question: 0, reason: 'Neither.' }) as T };
      expect((await decideAttachment(vague, ctx))?.questionId).toBeNull();
    });

    it('parks the page when no model is available', async () => {
      const a = await decideAttachment(vague, { ...context(), scorer: closeScorer });
      expect(a?.questionId).toBeNull();
      expect(a?.reason).toMatch(/Too close to call between Q1 and Q2/);
    });
  });

  it('keeps an existing suggestion unless another question clearly wins', async () => {
    const stub: SemanticScorer = {
      kind: 'embedding',
      label: 'stub',
      scoreNode: async () => ({ relevance: 0.9, perQuestion: [0.6, 0.65, 0, 0, 0, 0] }),
      scoreQuery: async () => ({ relevance: 0.9, perQuestion: [0, 0, 0, 0, 0, 0] }),
    };
    const node = makePage(ws.id, 'https://sticky.example', { questionId: questions[0].id });
    const a = await decideAttachment(node, { ...context(), scorer: stub });
    expect(a?.questionId).toBe(questions[0].id);
  });
});
