// Scores how well a page matches each research question.
//
// Broad questions ("What causes X?") sit close to every on-topic page, so raw
// similarity favours them. Both scorers therefore remove what all questions
// share before comparing: the embedding scorer subtracts the questions'
// centroid, and the lexical scorer's IDF down-weights words every question uses.
import { embedTexts, type EmbedSpace } from '../ai/embed';
import { Corpus, cosine, cosineSparse, termFrequencies, type TermVector } from '../text';
import type { Question, TrailNode } from '../types';
import { clamp } from '../util';

export interface SemanticScores {
  /** 0..1: how on-topic the text is for the whole route. */
  relevance: number;
  /** 0..1 per question, aligned with the questions array. */
  perQuestion: number[];
}

export interface SemanticScorer {
  kind: 'embedding' | 'lexical';
  label: string;
  scoreNode(node: TrailNode): Promise<SemanticScores>;
  scoreQuery(query: string): Promise<SemanticScores>;
}

export const questionText = (q: Question) => [q.text, q.keyTerms.join(', ')].filter(Boolean).join(' — ');

export function nodeText(n: TrailNode, max = 1600): string {
  const parts = [n.title, n.description, n.summary, n.keyTerms.join(', '), n.highlights.map((h) => h.text).join(' ')];
  const head = parts.filter(Boolean).join('. ');
  const rest = n.text ? n.text.slice(0, Math.max(0, max - head.length)) : '';
  return (head + ' ' + rest).trim();
}

function mean(vectors: number[][]): number[] {
  const m = new Array<number>(vectors[0].length).fill(0);
  for (const v of vectors) for (let i = 0; i < m.length; i++) m[i] += v[i] / vectors.length;
  return m;
}

const minus = (a: number[], b: number[]) => a.map((x, i) => x - b[i]);

export async function embeddingScorer(space: EmbedSpace, goal: string, questions: Question[]): Promise<SemanticScorer> {
  const { calib } = space;
  const qVecs = questions.length ? await embedTexts(space, questions.map((q) => ({ text: questionText(q), role: 'query' as const }))) : [];
  const [goalVec] = goal ? await embedTexts(space, [{ text: goal, role: 'query' }]) : [];
  const anchors = goalVec ? [...qVecs, goalVec] : qVecs;
  const centroid = anchors.length ? mean(anchors) : null;
  const centred = qVecs.length >= 3 && centroid;
  const qCentred = centred ? qVecs.map((v) => minus(v, centroid)) : qVecs;
  const rel = (raw: number) => clamp((raw - calib.relLo) / (calib.relHi - calib.relLo));

  const score = (v: number[]): SemanticScores => ({
    relevance: centroid ? rel(cosine(centroid, v)) : 1,
    perQuestion: centred
      ? qCentred.map((q) => clamp(cosine(q, minus(v, centroid)) / calib.centeredScale))
      : qVecs.map((q) => rel(cosine(q, v))),
  });

  return {
    kind: 'embedding',
    label: space.label,
    async scoreNode(node) {
      const [v] = await embedTexts(space, [{ text: nodeText(node), role: 'document' }]);
      return score(v);
    },
    async scoreQuery(query) {
      const [v] = await embedTexts(space, [{ text: query, role: 'query' }]);
      return score(v);
    },
  };
}

const nodeFields = (n: TrailNode) => [
  { text: n.title, weight: 3 },
  { text: n.description ?? '', weight: 2 },
  { text: n.summary ?? '', weight: 2 },
  { text: n.keyTerms.join(' '), weight: 2 },
  { text: n.highlights.map((h) => h.text).join(' '), weight: 2 },
  { text: (n.text ?? '').slice(0, 4000), weight: 1 },
];

const LEX = { qLo: 0.02, qHi: 0.22, relLo: 0.02, relHi: 0.16 };

export function lexicalScorer(goal: string, questions: Question[], nodes: TrailNode[]): SemanticScorer {
  const corpus = new Corpus();
  const qTfs = questions.map((q) =>
    termFrequencies([
      { text: q.text, weight: 3 },
      { text: q.keyTerms.join(' '), weight: 2 },
      { text: q.searches.join(' '), weight: 1 },
    ]),
  );
  qTfs.forEach((tf) => corpus.add(tf));
  for (const n of nodes.slice(-300)) if (n.kind === 'page') corpus.add(termFrequencies(nodeFields(n)));
  const qVecs = qTfs.map((tf) => corpus.weigh(tf));
  const topic = corpus.weigh(
    termFrequencies([{ text: goal, weight: 3 }, ...questions.map((q) => ({ text: `${q.text} ${q.keyTerms.join(' ')}`, weight: 1 }))]),
  );

  const score = (tf: TermVector): SemanticScores => {
    const v = corpus.weigh(tf);
    return {
      relevance: topic.size ? clamp((cosineSparse(topic, v) - LEX.relLo) / (LEX.relHi - LEX.relLo)) : 1,
      perQuestion: qVecs.map((q) => clamp((cosineSparse(q, v) - LEX.qLo) / (LEX.qHi - LEX.qLo))),
    };
  };

  return {
    kind: 'lexical',
    label: 'Keyword match',
    scoreNode: async (node) => score(termFrequencies(nodeFields(node))),
    scoreQuery: async (query) => score(termFrequencies([{ text: query, weight: 1 }])),
  };
}
