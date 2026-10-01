import type { Question, TrailNode } from '../../src/core/types';
import { siteOf, uid } from '../../src/core/util';

export function makeQuestion(wsId: string, text: string, order: number, keyTerms: string[] = [], searches: string[] = []): Question {
  return { id: uid('q_'), wsId, text, keyTerms, searches, order, origin: 'user', createdAt: order, updatedAt: order };
}

export function makePage(
  wsId: string,
  url: string,
  opts: { title?: string; text?: string; questionId?: string | null; createdAt?: number; prov?: Partial<TrailNode['prov']> } = {},
): TrailNode {
  const t = opts.createdAt ?? Date.now();
  return {
    id: uid('n_'),
    wsId,
    kind: 'page',
    url,
    title: opts.title ?? url,
    site: siteOf(url),
    text: opts.text,
    keyTerms: [],
    pageType: 'other',
    tags: [],
    notes: '',
    highlights: [],
    importance: 0,
    status: 'open',
    prov: { openedAt: t, ...opts.prov },
    attach:
      opts.questionId === undefined
        ? undefined
        : { questionId: opts.questionId, score: 1, reason: '', method: 'semantic', state: 'suggested', alternatives: [], at: t },
    visits: 1,
    timeSpentMs: 0,
    createdAt: t,
    updatedAt: t,
  };
}
