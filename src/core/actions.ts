// User-initiated changes. Every edit here is a rule the engine respects:
// moved pages stay where the user put them, rejected questions are never
// suggested again for that page, edited questions are never overwritten.
import { db, logEvent, newWorkspace } from './db';
import type { DraftQuestion } from './engine/route';
import type { Highlight, ID, Link, LinkType, Question, TrailNode, Workspace } from './types';
import { now, siteOf, textFragmentUrl, uid } from './util';

export async function createWorkspace(name: string, goal = ''): Promise<Workspace> {
  const ws = newWorkspace(name.trim() || 'Untitled research', goal.trim());
  await db.workspaces.add(ws);
  if (ws.goal) await logEvent({ wsId: ws.id, type: 'goal.set', data: { goal: ws.goal } });
  return ws;
}

export async function updateWorkspace(wsId: ID, patch: Partial<Workspace>) {
  await db.workspaces.update(wsId, { ...patch, updatedAt: now() });
}

export async function setGoal(wsId: ID, goal: string) {
  const g = goal.trim();
  await db.workspaces.update(wsId, { goal: g, mode: g ? 'gps' : 'explore', proposedGoal: undefined, updatedAt: now() });
  await logEvent({ wsId, type: 'goal.set', data: { goal: g } });
}

/**
 * Saves a drafted route. Questions the user edited by hand survive a re-draft;
 * questions whose text is unchanged keep their id (and so their pages).
 */
export async function saveRoute(wsId: ID, drafts: (DraftQuestion & { id?: ID; edited?: boolean })[], origin: Question['origin']) {
  const existing = await db.questions.where('wsId').equals(wsId).toArray();
  const byText = new Map(existing.map((q) => [q.text.trim().toLowerCase(), q]));
  const t = now();
  const next: Question[] = drafts.map((d, order) => {
    const prev = (d.id && existing.find((q) => q.id === d.id)) || byText.get(d.text.trim().toLowerCase());
    return {
      id: prev?.id ?? uid('q_'),
      wsId,
      text: d.text.trim(),
      keyTerms: d.keyTerms,
      searches: d.searches,
      order,
      origin: prev?.origin ?? origin,
      edited: d.edited || prev?.edited || (prev ? prev.text !== d.text.trim() : false),
      conflict: prev?.text === d.text.trim() ? prev?.conflict : undefined,
      createdAt: prev?.createdAt ?? t,
      updatedAt: t,
    };
  });
  const keep = new Set(next.map((q) => q.id));
  const removed = existing.filter((q) => !keep.has(q.id));
  await db.transaction('rw', [db.questions, db.nodes, db.events], async () => {
    await db.questions.bulkDelete(removed.map((q) => q.id));
    await db.questions.bulkPut(next);
    if (removed.length) await detachFrom(wsId, removed.map((q) => q.id));
    for (const q of next) if (!existing.some((e) => e.id === q.id)) await logEvent({ wsId, type: 'question.add', questionId: q.id, data: { text: q.text } });
    for (const q of removed) await logEvent({ wsId, type: 'question.remove', questionId: q.id });
  });
  await db.workspaces.update(wsId, { mode: 'gps', updatedAt: t });
  return next;
}

async function detachFrom(wsId: ID, questionIds: ID[]) {
  const ids = new Set(questionIds);
  const nodes = await db.nodes.where('wsId').equals(wsId).toArray();
  for (const n of nodes) {
    if (n.attach?.questionId && ids.has(n.attach.questionId)) {
      await db.nodes.update(n.id, { attach: undefined, prov: { ...n.prov, questionTag: ids.has(n.prov.questionTag ?? '') ? undefined : n.prov.questionTag } });
    }
  }
}

export async function addQuestion(wsId: ID, draft: DraftQuestion, origin: Question['origin'] = 'user'): Promise<Question> {
  const count = await db.questions.where('wsId').equals(wsId).count();
  const t = now();
  const q: Question = {
    id: uid('q_'),
    wsId,
    text: draft.text.trim(),
    keyTerms: draft.keyTerms,
    searches: draft.searches,
    order: count,
    origin,
    edited: origin === 'user',
    createdAt: t,
    updatedAt: t,
  };
  await db.questions.add(q);
  await logEvent({ wsId, type: 'question.add', questionId: q.id, data: { text: q.text } });
  return q;
}

export async function updateQuestion(qid: ID, patch: Partial<Pick<Question, 'text' | 'keyTerms' | 'searches'>>) {
  const q = await db.questions.get(qid);
  if (!q) return;
  const textChanged = patch.text !== undefined && patch.text.trim() !== q.text;
  await db.questions.update(qid, { ...patch, edited: q.edited || textChanged, updatedAt: now() });
  if (textChanged) await logEvent({ wsId: q.wsId, type: 'question.edit', questionId: qid, data: { text: patch.text } });
}

export async function removeQuestion(qid: ID) {
  const q = await db.questions.get(qid);
  if (!q) return;
  await db.questions.delete(qid);
  await detachFrom(q.wsId, [qid]);
  const rest = await db.questions.where('wsId').equals(q.wsId).sortBy('order');
  await Promise.all(rest.map((r, i) => db.questions.update(r.id, { order: i })));
  await logEvent({ wsId: q.wsId, type: 'question.remove', questionId: qid });
}

export async function reorderQuestions(wsId: ID, orderedIds: ID[]) {
  await db.transaction('rw', db.questions, async () => {
    await Promise.all(orderedIds.map((id, order) => db.questions.update(id, { order })));
  });
  await db.workspaces.update(wsId, { updatedAt: now() });
}

/** Files a page under a question (or the parking lot) by hand. Overrides the engine permanently. */
export async function moveNode(nodeId: ID, questionId: ID | null) {
  const n = await db.nodes.get(nodeId);
  if (!n) return;
  const from = n.attach?.questionId;
  if (from && from !== questionId) {
    await db.rules.add({ id: uid('r_'), wsId: n.wsId, kind: 'cannot-attach', nodeId, questionId: from, createdAt: now() });
  }
  if (questionId) await db.rules.where('nodeId').equals(nodeId).filter((r) => r.questionId === questionId).delete();
  await db.nodes.update(nodeId, {
    attach: {
      questionId,
      score: 1,
      reason: questionId ? 'You filed this here' : 'You parked this page',
      method: 'user',
      state: 'accepted',
      alternatives: [],
      at: now(),
    },
    updatedAt: now(),
  });
  await logEvent({ wsId: n.wsId, type: 'node.attach', nodeId, questionId, data: { method: 'user' } });
}

/** Confirms an AI suggestion: it becomes a user decision that later runs never undo. */
export async function acceptAttachment(nodeId: ID) {
  const n = await db.nodes.get(nodeId);
  if (!n?.attach?.questionId) return;
  await db.nodes.update(nodeId, {
    attach: { ...n.attach, method: 'user', state: 'accepted', reason: n.attach.reason.replace(/^Answers/, 'Confirmed: answers'), at: now() },
  });
}

/** "Not this question": remembers the rejection and lets the engine look elsewhere. */
export async function rejectAttachment(nodeId: ID) {
  const n = await db.nodes.get(nodeId);
  if (!n?.attach?.questionId) return;
  await db.rules.add({ id: uid('r_'), wsId: n.wsId, kind: 'cannot-attach', nodeId, questionId: n.attach.questionId, createdAt: now() });
  await db.nodes.update(nodeId, { attach: undefined, prov: { ...n.prov, questionTag: undefined } });
  await logEvent({ wsId: n.wsId, type: 'node.attach', nodeId, questionId: null, data: { method: 'user', rejected: n.attach.questionId } });
}

export async function updateNode(nodeId: ID, patch: Partial<Pick<TrailNode, 'notes' | 'tags' | 'importance' | 'pos' | 'pinned' | 'title'>>) {
  await db.nodes.update(nodeId, { ...patch, updatedAt: now() });
}

export async function addHighlight(nodeId: ID, text: string): Promise<Highlight | undefined> {
  const n = await db.nodes.get(nodeId);
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!n || !clean) return undefined;
  if (n.highlights.some((h) => h.text === clean)) return undefined;
  const h: Highlight = { id: uid('h_'), text: clean.slice(0, 2000), url: textFragmentUrl(n.url, clean), at: now() };
  await db.nodes.update(nodeId, { highlights: [...n.highlights, h], updatedAt: now() });
  await logEvent({ wsId: n.wsId, type: 'highlight.add', nodeId, data: { text: h.text.slice(0, 120) } });
  return h;
}

export async function removeHighlight(nodeId: ID, highlightId: ID) {
  const n = await db.nodes.get(nodeId);
  if (!n) return;
  await db.nodes.update(nodeId, { highlights: n.highlights.filter((h) => h.id !== highlightId), updatedAt: now() });
}

export async function addNote(wsId: ID, text: string, pos?: { x: number; y: number }): Promise<TrailNode> {
  const t = now();
  const note: TrailNode = {
    id: uid('n_'),
    wsId,
    kind: 'note',
    url: '',
    title: text.split('\n')[0].slice(0, 80) || 'Note',
    keyTerms: [],
    pageType: 'other',
    tags: [],
    notes: text,
    highlights: [],
    importance: 0,
    status: 'open',
    pos,
    pinned: !!pos,
    prov: { openedAt: t },
    visits: 0,
    timeSpentMs: 0,
    createdAt: t,
    updatedAt: t,
  };
  await db.nodes.add(note);
  return note;
}

export async function deleteNode(nodeId: ID) {
  const n = await db.nodes.get(nodeId);
  if (!n) return;
  await db.nodes.delete(nodeId);
  await db.links.where('from').equals(nodeId).delete();
  await db.links.where('to').equals(nodeId).delete();
  await logEvent({ wsId: n.wsId, type: 'node.remove', nodeId });
}

export async function addLink(wsId: ID, from: ID, to: ID, type: LinkType): Promise<Link> {
  const link: Link = { id: uid('l_'), wsId, from, to, type, origin: 'user', confidence: 1, reason: 'Added by you', state: 'accepted', createdAt: now() };
  await db.links.add(link);
  return link;
}

export async function setLinkState(linkId: ID, state: Link['state']) {
  await db.links.update(linkId, { state });
}

export async function acceptProposedQuestion(wsId: ID): Promise<Question | undefined> {
  const ws = await db.workspaces.get(wsId);
  const p = ws?.proposedQuestion;
  if (!p) return undefined;
  const q = await addQuestion(wsId, p, 'ai');
  // The pages that suggested it are released from the parking lot for re-matching.
  for (const id of p.nodeIds) {
    const n = await db.nodes.get(id);
    if (n?.attach?.questionId === null && n.attach.method !== 'user') await db.nodes.update(id, { attach: undefined });
  }
  await db.workspaces.update(wsId, { proposedQuestion: undefined, updatedAt: now() });
  return q;
}

export async function dismissProposedQuestion(wsId: ID, signature: string) {
  const ws = await db.workspaces.get(wsId);
  if (!ws) return;
  await db.workspaces.update(wsId, {
    proposedQuestion: undefined,
    dismissedProposals: [...(ws.dismissedProposals ?? []), signature],
    updatedAt: now(),
  });
}

/** Number of independent sites, for display. */
export const countSites = (nodes: TrailNode[]) => new Set(nodes.map((n) => n.site || siteOf(n.url))).size;
