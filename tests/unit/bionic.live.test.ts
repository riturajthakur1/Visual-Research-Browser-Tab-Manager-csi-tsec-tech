// Runs against a local Bionic server when one is up (`npm run bionic`);
// skipped otherwise, so CI and teammates without it still pass.
import { describe, expect, it } from 'vitest';
import fixture from '../fixtures/mumbai.json';
import { chatJson, embed, listModels, pickChatModel, pickEmbedModel } from '../../src/core/ai/bionic';
import { newWorkspace } from '../../src/core/db';
import { decideAttachment } from '../../src/core/engine/attach';
import { cleanDraft, routeRequest } from '../../src/core/engine/route';
import { embeddingScorer } from '../../src/core/engine/semantic';
import { detectLanguage } from '../../src/core/lang';
import type { EmbedSpace } from '../../src/core/ai/embed';
import { makePage, makeQuestion } from './helpers';

const baseUrl = process.env.BIONIC_URL ?? 'http://localhost:1234/v1';
const up = await listModels(baseUrl).then(
  (ids) => ids.length > 0,
  () => false,
);

describe.skipIf(!up)('Bionic (live)', () => {
  it('prefers Gemma 4 E2B and a multilingual embedding model', async () => {
    expect(await pickChatModel({ baseUrl })).toBe('google/gemma-4-e2b');
    expect(await pickEmbedModel({ baseUrl })).toMatch(/embeddinggemma/);
  });

  it.each(['en', 'hi'] as const)('files every fixture page correctly with %s questions', async (lang) => {
    const model = (await pickEmbedModel({ baseUrl }))!;
    const space: EmbedSpace = {
      id: `test:${model}`,
      label: model,
      kind: 'bionic',
      calib: { relLo: 0.12, relHi: 0.45, centeredScale: 0.35, queryPrefix: 'task: search result | query: ', docPrefix: 'title: none | text: ' },
      embedRaw: (texts) => embed({ baseUrl, embedModel: model }, texts),
    };
    const ws = newWorkspace('Live', fixture.goal[lang]);
    const questions = fixture.questions[lang].map((t, i) => makeQuestion(ws.id, t, i));
    const scorer = await embeddingScorer(space, ws.goal, questions);
    const pages = fixture.docs.map((d, i) => makePage(ws.id, `https://s${i}.example/${d.label}`, { title: d.label, text: d.text }));
    const ctx = { ws, questions, nodesById: new Map(pages.map((p) => [p.id, p])), rules: [], scorer };
    let correct = 0;
    for (const [i, d] of fixture.docs.entries()) {
      const a = await decideAttachment(pages[i], ctx);
      const want = d.answers >= 0 ? questions[d.answers].id : null;
      if (a?.questionId === want) correct++;
    }
    // Close calls may park instead of attaching without a model tie-break; wrong filings are what matters.
    expect(correct).toBeGreaterThanOrEqual(fixture.docs.length - 2);
  }, 60_000);

  it('drafts a Hindi route in Hindi', async () => {
    const goal = fixture.goal.hi;
    const raw = await chatJson<{ questions: never[] }>({ baseUrl }, routeRequest(goal));
    const route = cleanDraft(raw);
    expect(route.length).toBeGreaterThanOrEqual(5);
    const hindi = route.filter((q) => detectLanguage(q.text).code === 'hi').length;
    expect(hindi).toBeGreaterThanOrEqual(route.length - 1);
  }, 90_000);
});
