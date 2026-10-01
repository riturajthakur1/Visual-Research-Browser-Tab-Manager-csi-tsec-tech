// Orchestrates the engine against the database: attach → enrich → re-attach
// → conflicts → proposals. Runs in the service worker; each workspace is
// processed one job at a time so concurrent captures cannot race.
import { resolveEmbedSpace, resetEmbedSpace, embedTexts, type EmbedSpace } from '../ai/embed';
import { llmJson, type JsonRequest } from '../ai/llm';
import { db, logEvent, workspaceData } from '../db';
import { detectLanguage, type LanguageInfo } from '../lang';
import type { ID, Question, TrailNode, Workspace } from '../types';
import { createMutex, now } from '../util';
import { decideAttachment, type AttachContext } from './attach';
import { attachedSources, sourceSignature } from './coverage';
import { checkConflict } from './conflicts';
import { enrichNode, heuristicEnrichment } from './enrich';
import {
  clusterSignature,
  CLUSTER_MIN,
  findCluster,
  GOAL_AFTER_SEARCHES,
  proposeGoal,
  proposeQuestion,
} from './proposals';
import { embeddingScorer, lexicalScorer, nodeText, type SemanticScorer } from './semantic';

type Llm = <T>(req: JsonRequest) => Promise<T | null>;

export interface EngineDeps {
  llm: Llm;
  embedSpace: () => Promise<EmbedSpace | null>;
}

export const defaultDeps: EngineDeps = { llm: llmJson, embedSpace: () => resolveEmbedSpace() };

const locks = new Map<ID, ReturnType<typeof createMutex>>();
function locked<T>(wsId: ID, fn: () => Promise<T>): Promise<T> {
  let m = locks.get(wsId);
  if (!m) locks.set(wsId, (m = createMutex()));
  return m(fn);
}

export function workspaceLanguage(ws: Workspace, questions: Question[], nodes: TrailNode[]): LanguageInfo {
  const text =
    ws.goal ||
    questions.map((q) => q.text).join(' ') ||
    nodes
      .filter((n) => n.kind === 'search')
      .map((n) => n.query)
      .join(' ');
  return detectLanguage(text || 'en');
}

async function buildScorer(
  ws: Workspace,
  questions: Question[],
  nodes: TrailNode[],
  deps: EngineDeps,
): Promise<SemanticScorer> {
  const space = await deps.embedSpace().catch(() => null);
  if (space) {
    try {
      return await embeddingScorer(space, ws.goal, questions);
    } catch (e) {
      console.warn('[thread.io] embedding failed, using keyword matching:', e);
      resetEmbedSpace();
    }
  }
  return lexicalScorer(ws.goal, questions, nodes);
}

/** Re-decides attachments for the given pages (default: all pages in the workspace). */
export function attachNodes(wsId: ID, nodeIds?: ID[], deps: EngineDeps = defaultDeps): Promise<number> {
  return locked(wsId, async () => {
    const { ws, questions, nodes, rules } = await workspaceData(wsId);
    if (!ws) return 0;
    const nodesById = new Map(nodes.map((n) => [n.id, n]));
    let scorer = await buildScorer(ws, questions, nodes, deps);
    const ctx: AttachContext = { ws, questions, nodesById, rules, scorer, llm: deps.llm };
    const targets = nodes
      .filter((n) => n.kind === 'page' && (!nodeIds || nodeIds.includes(n.id)))
      .sort((a, b) => a.createdAt - b.createdAt);
    let changed = 0;
    for (const node of targets) {
      let next;
      try {
        next = await decideAttachment(node, ctx);
      } catch (e) {
        // An embedding call failed mid-run: finish the run on keyword matching.
        if (scorer.kind !== 'embedding') throw e;
        console.warn('[thread.io] switching to keyword matching:', e);
        resetEmbedSpace();
        scorer = lexicalScorer(ws.goal, questions, nodes);
        ctx.scorer = scorer;
        next = await decideAttachment(node, ctx);
      }
      if (!next) continue;
      const moved = next.questionId !== (node.attach?.questionId ?? undefined);
      node.attach = next;
      await db.nodes.update(node.id, { attach: next, updatedAt: now() });
      if (moved) {
        changed++;
        await logEvent({
          wsId,
          type: 'node.attach',
          nodeId: node.id,
          questionId: next.questionId,
          data: { method: next.method },
        });
      }
    }
    return changed;
  });
}

export async function enrichNodeById(nodeId: ID, deps: EngineDeps = defaultDeps): Promise<void> {
  const node = await db.nodes.get(nodeId);
  if (!node || node.kind !== 'page' || node.enriched) return;
  const { ws, questions, nodes } = await workspaceData(node.wsId);
  if (!ws) return;
  const e = await enrichNode(node, ws.goal, workspaceLanguage(ws, questions, nodes), deps.llm);
  await db.nodes.update(nodeId, {
    summary: e.summary,
    keyTerms: e.keyTerms,
    pageType: e.pageType,
    enriched: true,
    updatedAt: now(),
  });
}

/** Full pipeline for a page that was just captured or re-read. */
export async function processNode(nodeId: ID, deps: EngineDeps = defaultDeps): Promise<void> {
  const node = await db.nodes.get(nodeId);
  if (!node || node.kind !== 'page') return;
  const wsId = node.wsId;
  if (!node.keyTerms.length || !node.summary) {
    const h = heuristicEnrichment(node);
    await db.nodes.update(nodeId, {
      keyTerms: node.keyTerms.length ? node.keyTerms : h.keyTerms,
      summary: node.summary || h.summary,
      pageType: h.pageType,
    });
  }
  await attachNodes(wsId, [nodeId], deps);
  await enrichNodeById(nodeId, deps);
  const after = await db.nodes.get(nodeId);
  // The summary can tip a parked page over the line; children opened from it gain trail evidence.
  const children = (await db.nodes.where('wsId').equals(wsId).toArray())
    .filter((n) => n.prov.openerId === nodeId && n.attach?.questionId === null)
    .map((n) => n.id);
  if (after?.attach?.questionId === null || children.length) await attachNodes(wsId, [nodeId, ...children], deps);
  await refreshConflicts(wsId, deps);
  await refreshProposals(wsId, deps);
}

/** Re-checks questions whose set of sources changed since the last check. */
export function refreshConflicts(wsId: ID, deps: EngineDeps = defaultDeps, force = false): Promise<void> {
  return locked(wsId, async () => {
    const { ws, questions, nodes } = await workspaceData(wsId);
    if (!ws) return;
    const lang = workspaceLanguage(ws, questions, nodes);
    for (const q of questions) {
      const sources = attachedSources(q.id, nodes);
      if (sources.length < 2) continue;
      // Wait until every source has a summary: comparing raw titles produces false alarms.
      if (!force && sources.some((s) => !s.enriched)) continue;
      const signature = sourceSignature(sources);
      if (!force && q.conflict?.signature === signature) continue;
      const check = await checkConflict(q, sources, lang, deps.llm);
      if (!check) continue;
      await db.questions.update(q.id, { conflict: check, updatedAt: now() });
      if (check.verdict === 'conflict' && q.conflict?.verdict !== 'conflict') {
        await logEvent({ wsId, type: 'conflict.found', questionId: q.id, data: { nodeIds: check.nodeIds } });
      }
    }
  });
}

function clusterThreshold(space: EmbedSpace | null): number {
  return space ? space.calib.relHi : 0.18;
}

/** Goal proposal in explore mode; new-question proposal from clustered parked pages. */
export function refreshProposals(wsId: ID, deps: EngineDeps = defaultDeps): Promise<void> {
  return locked(wsId, async () => {
    const { ws, questions, nodes } = await workspaceData(wsId);
    if (!ws) return;

    if (!ws.goal) {
      const searches = nodes.filter((n) => n.kind === 'search').sort((a, b) => a.createdAt - b.createdAt);
      if (searches.length >= GOAL_AFTER_SEARCHES && !ws.proposedGoal) {
        const titles = nodes.filter((n) => n.kind === 'page').map((n) => n.title);
        const goal = await proposeGoal(searches.map((s) => s.query!).filter(Boolean), titles, deps.llm);
        if (goal) await db.workspaces.update(wsId, { proposedGoal: goal, updatedAt: now() });
      }
      return;
    }

    if (!questions.length) return;
    const parked = nodes.filter(
      (n) => n.kind === 'page' && n.attach?.questionId === null && n.attach.method !== 'user',
    );
    if (parked.length < CLUSTER_MIN) return;
    const space = await deps.embedSpace().catch(() => null);
    let vectors: number[][] | undefined;
    if (space) {
      try {
        vectors = await embedTexts(
          space,
          parked.map((n) => ({ text: nodeText(n), role: 'document' as const })),
        );
      } catch {
        vectors = undefined;
      }
    }
    const cluster = findCluster(
      parked.map((node, i) => ({ node, vector: vectors?.[i] })),
      vectors ? clusterThreshold(space) : clusterThreshold(null),
    );
    if (!cluster) return;
    const signature = clusterSignature(cluster);
    if (ws.dismissedProposals?.includes(signature)) return;
    if (
      ws.proposedQuestion &&
      clusterSignature(cluster.filter((n) => ws.proposedQuestion!.nodeIds.includes(n.id))) === signature
    )
      return;
    const proposal = await proposeQuestion(ws.goal, questions, cluster, deps.llm);
    await db.workspaces.update(wsId, { proposedQuestion: proposal, updatedAt: now() });
  });
}
