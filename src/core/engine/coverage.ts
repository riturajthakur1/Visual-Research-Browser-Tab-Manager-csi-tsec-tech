// Coverage rules for each question. Coverage measures breadth, independent
// sources and disagreement; it does not claim the answer is right.
//   gap      no sources
//   thin     one source, or every source from one site
//   covered  two or more independent sites (+ a highlight, if required)
//   conflict the language model found the sources disagree
import type { CoverageStatus, ID, Question, TrailNode, Workspace } from '../types';
import { hash, siteOf } from '../util';

export interface QuestionCoverage {
  questionId: ID;
  status: CoverageStatus;
  sources: TrailNode[];
  sites: string[];
  highlights: number;
  stale: boolean;
  newest?: string;
  /** Why the status is what it is, in plain words. */
  detail: string;
  /** What would move it forward. */
  next?: string;
}

export function attachedSources(questionId: ID, nodes: TrailNode[]): TrailNode[] {
  return nodes
    .filter((n) => n.kind === 'page' && n.attach?.questionId === questionId)
    .sort((a, b) => (b.attach?.score ?? 0) - (a.attach?.score ?? 0));
}

/** Changes whenever the set of sources (or their highlights) changes. */
export function sourceSignature(sources: TrailNode[]): string {
  return hash(
    sources
      .map((s) => `${s.id}:${s.highlights.length}:${s.summary ? 1 : 0}`)
      .sort()
      .join('|'),
  );
}

function parseDate(s?: string): number | undefined {
  if (!s) return undefined;
  const t = Date.parse(s);
  return Number.isNaN(t) ? undefined : t;
}

export function coverageFor(q: Question, nodes: TrailNode[], ws: Workspace, ref = Date.now()): QuestionCoverage {
  const sources = attachedSources(q.id, nodes);
  const sites = [...new Set(sources.map((s) => s.site || siteOf(s.url)))];
  const highlights = sources.reduce((sum, s) => sum + s.highlights.length, 0);
  const dates = sources.map((s) => parseDate(s.publishedAt)).filter((t): t is number => t !== undefined);
  const newestTs = dates.length ? Math.max(...dates) : undefined;
  const staleMs = ws.settings.staleMonths * 30.4 * 24 * 3600 * 1000;
  const stale = !!newestTs && ws.settings.staleMonths > 0 && ref - newestTs > staleMs;
  const newest = newestTs ? new Date(newestTs).toISOString().slice(0, 10) : undefined;
  const base = { questionId: q.id, sources, sites, highlights, stale, newest };

  const conflict = q.conflict;
  if (conflict?.verdict === 'conflict' && conflict.signature === sourceSignature(sources)) {
    return {
      ...base,
      status: 'conflict',
      detail: conflict.explanation,
      next: 'Open both sources side by side and decide',
    };
  }
  if (!sources.length) {
    return { ...base, status: 'gap', detail: 'No sources yet', next: 'Run a prepared search' };
  }
  if (sources.length === 1 || sites.length === 1) {
    const detail = sources.length === 1 ? 'One source' : `${sources.length} sources, all from ${sites[0]}`;
    return { ...base, status: 'thin', detail, next: 'Find a second, independent site' };
  }
  if (ws.settings.requireHighlight && highlights === 0) {
    return {
      ...base,
      status: 'thin',
      detail: `${sources.length} sources from ${sites.length} sites, no highlights yet`,
      next: 'Highlight the passage that answers it',
    };
  }
  return {
    ...base,
    status: 'covered',
    detail: `${sources.length} sources from ${sites.length} sites${highlights ? `, ${highlights} highlight${highlights === 1 ? '' : 's'}` : ''}`,
  };
}

export function coverageMap(questions: Question[], nodes: TrailNode[], ws: Workspace, ref = Date.now()) {
  return new Map(questions.map((q) => [q.id, coverageFor(q, nodes, ws, ref)]));
}

export const STATUS_LABEL: Record<CoverageStatus, string> = {
  gap: 'Gap',
  thin: 'Thin',
  covered: 'Covered',
  conflict: 'Conflict',
};

/** The question to tackle next: gaps first (in route order), then thin ones. */
export function biggestGap(questions: Question[], coverage: Map<ID, QuestionCoverage>): Question | undefined {
  return (
    questions.find((q) => coverage.get(q.id)?.status === 'gap') ??
    questions.find((q) => coverage.get(q.id)?.status === 'thin')
  );
}
