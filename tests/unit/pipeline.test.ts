import { beforeEach, describe, expect, it } from 'vitest';
import fixture from '../fixtures/mumbai.json';
import { addHighlight, createWorkspace, moveNode, rejectAttachment, saveRoute } from '../../src/core/actions';
import { db } from '../../src/core/db';
import { coverageFor } from '../../src/core/engine/coverage';
import { attachNodes, processNode, refreshProposals, type EngineDeps } from '../../src/core/engine/pipeline';
import { snapshotAt } from '../../src/core/engine/replay';
import { makePage } from './helpers';

const KEY_TERMS = [
  ['monsoon', 'rainfall'],
  ['drainage', 'storm water', 'drains'],
  ['mangroves', 'wetlands'],
  ['solutions', 'sponge city'],
  ['climate change', 'extreme rainfall'],
  ['2005', 'deluge'],
];

const offline: EngineDeps = { llm: async () => null, embedSpace: async () => null };

async function setup() {
  const ws = await createWorkspace('Mumbai floods', fixture.goal.en);
  const questions = await saveRoute(
    ws.id,
    fixture.questions.en.map((text, i) => ({ text, keyTerms: KEY_TERMS[i], searches: [] })),
    'ai',
  );
  return { ws, questions };
}

async function capture(wsId: string, label: string, url: string, createdAt: number) {
  const doc = fixture.docs.find((d) => d.label === label)!;
  const node = makePage(wsId, url, { title: label, text: doc.text, createdAt });
  await db.nodes.add(node);
  await processNode(node.id, offline);
  return (await db.nodes.get(node.id))!;
}

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
});

describe('pipeline', () => {
  it('files captured pages and fills coverage', async () => {
    const { ws, questions } = await setup();
    const d1 = await capture(ws.id, 'drainage', 'https://mcgm.gov.in/drains', 1);
    const d2 = await capture(ws.id, 'solutions', 'https://downtoearth.org.in/sponge', 2);
    expect(d1.attach?.questionId).toBe(questions[1].id);
    expect(d2.attach?.questionId).toBe(questions[3].id);
    expect(d1.summary).toBeTruthy();
    expect(d1.enriched).toBe(true);

    const nodes = await db.nodes.toArray();
    const fresh = (await db.workspaces.get(ws.id))!;
    expect(coverageFor(questions[1], nodes, fresh).status).toBe('thin');
    expect(coverageFor(questions[0], nodes, fresh).status).toBe('gap');
  });

  it('keeps user decisions across re-runs', async () => {
    const { ws, questions } = await setup();
    const d = await capture(ws.id, 'climate', 'https://nature.com/x', 1);
    await moveNode(d.id, questions[0].id);
    await attachNodes(ws.id, undefined, offline);
    expect((await db.nodes.get(d.id))?.attach).toMatchObject({ questionId: questions[0].id, method: 'user' });
  });

  it('looks elsewhere after a rejection and never returns', async () => {
    const { ws, questions } = await setup();
    const d = await capture(ws.id, 'mangrove', 'https://a.org/m', 1);
    expect(d.attach?.questionId).toBe(questions[2].id);
    await rejectAttachment(d.id);
    await attachNodes(ws.id, [d.id], offline);
    expect((await db.nodes.get(d.id))?.attach?.questionId).not.toBe(questions[2].id);
  });

  it('records highlights and replays the session', async () => {
    const { ws, questions } = await setup();
    const d = await capture(ws.id, 'drainage', 'https://a.org/d', Date.now() - 1000);
    await addHighlight(d.id, 'designed to carry 25 mm of rain per hour');
    const events = await db.events.toArray();
    const all = await db.nodes.toArray();
    const before = snapshotAt(d.createdAt - 1, questions, all, events);
    const after = snapshotAt(Date.now() + 1, questions, all, events);
    expect(before.nodes).toHaveLength(0);
    expect(after.nodes[0].attach?.questionId).toBe(questions[1].id);
    expect(after.nodes[0].highlights).toHaveLength(1);
  });

  it('proposes a goal after three searches in explore mode', async () => {
    const ws = await createWorkspace('Exploring');
    for (const [i, q] of ['mumbai floods 2005', 'mumbai drains capacity', 'mithi river floods'].entries()) {
      await db.nodes.add({
        ...makePage(ws.id, `https://www.google.com/search?q=${i}`, { createdAt: i }),
        kind: 'search',
        query: q,
      });
    }
    await refreshProposals(ws.id, offline);
    expect((await db.workspaces.get(ws.id))?.proposedGoal).toMatch(/mumbai|mithi/i);
  });

  it('proposes a new question from a cluster of parked pages', async () => {
    const { ws } = await setup();
    const cricket = [
      'Mumbai Indians win IPL final at Wankhede stadium cricket match',
      'IPL cricket: Mumbai Indians beat Chennai at Wankhede stadium',
      'Wankhede stadium hosts IPL cricket final, Mumbai Indians celebrate',
    ];
    for (const [i, text] of cricket.entries()) {
      await db.nodes.add({
        ...makePage(ws.id, `https://cricket${i}.example`, { title: text, text, createdAt: i }),
        attach: {
          questionId: null,
          score: 0,
          reason: '',
          method: 'semantic',
          state: 'suggested',
          alternatives: [],
          at: 0,
        },
      });
    }
    await refreshProposals(ws.id, offline);
    const proposal = (await db.workspaces.get(ws.id))?.proposedQuestion;
    expect(proposal?.nodeIds).toHaveLength(3);
    expect(proposal?.text).toMatch(/\?$/);
  });
});
