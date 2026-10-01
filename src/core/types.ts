// Shared data model. Everything is stored locally in IndexedDB (see db.ts).

export type ID = string;

export type AiMode = 'off' | 'suggest' | 'auto';
export type WorkspaceMode = 'gps' | 'explore';

export interface WorkspaceSettings {
  /** How automatic attachment behaves: off = park everything, suggest = attach as dashed suggestion, auto = attach directly. */
  aiMode: AiMode;
  /** "Covered" also needs at least one highlight among the question's sources. */
  requireHighlight: boolean;
  /** A question gets a stale badge when its newest source is older than this. 0 disables. */
  staleMonths: number;
}

export interface HibernatedTab {
  url: string;
  title?: string;
  pinned: boolean;
  active: boolean;
}

export interface ProposedQuestion {
  text: string;
  keyTerms: string[];
  searches: string[];
  nodeIds: ID[];
}

export interface Workspace {
  id: ID;
  name: string;
  /** The destination: the question the user needs answered. Empty in explore mode. */
  goal: string;
  mode: WorkspaceMode;
  settings: WorkspaceSettings;
  /** Goal proposed from the first few searches while in explore mode. */
  proposedGoal?: string;
  /** New question proposed from a cluster of parked pages. */
  proposedQuestion?: ProposedQuestion;
  dismissedProposals?: string[];
  hibernated?: { at: number; tabs: HibernatedTab[] };
  viewport?: { x: number; y: number; zoom: number };
  createdAt: number;
  updatedAt: number;
}

export type CoverageStatus = 'gap' | 'thin' | 'covered' | 'conflict';

export interface ConflictCheck {
  verdict: 'agree' | 'conflict' | 'unclear';
  explanation: string;
  /** The two nodes that disagree, when verdict is conflict. */
  nodeIds: ID[];
  /** Hash of the source set that was checked, so a new source triggers a re-check. */
  signature: string;
  checkedAt: number;
}

export interface Question {
  id: ID;
  wsId: ID;
  text: string;
  keyTerms: string[];
  /** Two prepared searches that would fill this question. */
  searches: string[];
  order: number;
  origin: 'ai' | 'rules' | 'user';
  /** True once the user edited the text; re-drafting the route never overwrites it. */
  edited?: boolean;
  conflict?: ConflictCheck;
  /** Position on the map once the user dragged it. */
  pos?: { x: number; y: number };
  createdAt: number;
  updatedAt: number;
}

export type NodeKind = 'page' | 'search' | 'note';

export type PageType =
  | 'docs'
  | 'tutorial'
  | 'paper'
  | 'video'
  | 'qa'
  | 'news'
  | 'reference'
  | 'blog'
  | 'product'
  | 'government'
  | 'data'
  | 'search'
  | 'other';

export interface Highlight {
  id: ID;
  text: string;
  /** Link that reopens the page scrolled to this passage (#:~:text=). */
  url: string;
  at: number;
}

export type AttachMethod = 'prepared' | 'trail' | 'semantic' | 'llm' | 'user';

export interface Attachment {
  questionId: ID | null;
  score: number;
  /** Human-readable answer to "why is this here?" */
  reason: string;
  method: AttachMethod;
  /** suggested = dashed until the user accepts it; accepted = solid. */
  state: 'suggested' | 'accepted';
  alternatives: { questionId: ID; score: number }[];
  at: number;
}

export interface Provenance {
  /** Page or search node that led here. */
  openerId?: ID;
  /** Search node whose results page led here. */
  searchId?: ID;
  /** Set when the page came from a prepared gap-filling search: the question it belongs to. */
  questionTag?: ID;
  transition?: string;
  openedAt: number;
}

export interface TrailNode {
  id: ID;
  wsId: ID;
  kind: NodeKind;
  url: string;
  canonicalUrl?: string;
  title: string;
  favicon?: string;
  image?: string;
  site?: string;
  description?: string;
  author?: string;
  publishedAt?: string;
  lang?: string;
  /** Readable text, trimmed to a few thousand characters. */
  text?: string;
  summary?: string;
  keyTerms: string[];
  pageType: PageType;
  /** Absolute URLs this page links to (capped), for links-to edges. */
  outLinks?: string[];
  /** For search nodes. */
  query?: string;
  engine?: string;
  tags: string[];
  notes: string;
  highlights: Highlight[];
  importance: 0 | 1 | 2;
  status: 'open' | 'hibernated' | 'closed';
  pos?: { x: number; y: number };
  pinned?: boolean;
  prov: Provenance;
  attach?: Attachment;
  /** True once summary and embedding have been computed. */
  enriched?: boolean;
  visits: number;
  timeSpentMs: number;
  createdAt: number;
  updatedAt: number;
}

export type LinkType =
  'related' | 'supports' | 'contradicts' | 'links-to' | 'duplicate' | 'prerequisite' | 'example-of';

export interface Link {
  id: ID;
  wsId: ID;
  from: ID;
  to: ID;
  type: LinkType;
  origin: 'trail' | 'ai' | 'user';
  confidence: number;
  reason: string;
  state: 'suggested' | 'accepted' | 'rejected';
  createdAt: number;
}

export type RuleKind = 'cannot-attach';

export interface Rule {
  id: ID;
  wsId: ID;
  kind: RuleKind;
  nodeId: ID;
  questionId: ID;
  createdAt: number;
}

export type EventType =
  | 'goal.set'
  | 'question.add'
  | 'question.edit'
  | 'question.remove'
  | 'node.add'
  | 'node.attach'
  | 'node.remove'
  | 'highlight.add'
  | 'conflict.found';

export interface TrailEvent {
  seq?: number;
  wsId: ID;
  at: number;
  type: EventType;
  nodeId?: ID;
  questionId?: ID | null;
  data?: Record<string, unknown>;
}

export interface StoredVector {
  /** `${model}|${hash of text}` */
  key: string;
  vector: number[];
  at: number;
}

export type LlmProviderId = 'auto' | 'bionic' | 'builtin' | 'none';
export type EmbedProviderId = 'auto' | 'bionic' | 'browser' | 'lexical';
export type SearchEngineId = 'google' | 'bing' | 'duckduckgo' | 'brave';

export interface GlobalSettings {
  activeWsId?: ID;
  recording: boolean;
  llmProvider: LlmProviderId;
  embedProvider: EmbedProviderId;
  bionicUrl: string;
  /** Empty = pick the best available chat model automatically (Gemma 4 E2B first). */
  bionicModel: string;
  /** Let reasoning models think before answering: slower, sometimes better. */
  bionicThinking: boolean;
  /** Empty = pick the best multilingual embedding model automatically. */
  bionicEmbedModel: string;
  searchEngine: SearchEngineId;
  blocklist: string[];
  onboarded: boolean;
}
