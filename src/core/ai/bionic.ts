// Client for Bionic (LM Studio) — a local, OpenAI-compatible model server.
// Default endpoint: http://localhost:1234/v1. Nothing leaves the machine.

export interface BionicConfig {
  baseUrl: string;
  /** Chat model id; empty = pick the best available one. */
  model?: string;
  /** Allow reasoning models to think before answering. */
  thinking?: boolean;
  embedModel?: string;
}

export interface JsonRequest {
  name: string;
  system: string;
  user: string;
  schema: object;
  maxTokens?: number;
  temperature?: number;
}

// Models that follow JSON schemas well on a 6 GB laptop GPU, best first.
// Gemma 4 E2B is the default: multilingual, fast with thinking turned off.
const CHAT_PREFERENCE = [
  'google/gemma-4-e2b',
  'google/gemma-4-e4b',
  'qwen/qwen3-vl-4b',
  'qwen/qwen3-4b-2507',
  'qwen/qwen3-4b',
  'google/gemma-3-4b',
  'ibm/granite-4-h-tiny',
  'qwen/qwen3-1.7b',
];

let modelCache: { at: number; baseUrl: string; ids: string[] } | null = null;

const base = (url: string) => url.replace(/\/+$/, '');

export async function listModels(baseUrl: string, timeoutMs = 2500): Promise<string[]> {
  if (modelCache && modelCache.baseUrl === baseUrl && Date.now() - modelCache.at < 15_000) return modelCache.ids;
  const res = await fetch(`${base(baseUrl)}/models`, { signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`Bionic /models returned ${res.status}`);
  const body = (await res.json()) as { data?: { id: string }[] };
  const ids = (body.data ?? []).map((m) => m.id);
  modelCache = { at: Date.now(), baseUrl, ids };
  return ids;
}

export function invalidateModelCache() {
  modelCache = null;
}

export const isEmbeddingModel = (id: string) => /embed|nomic|bge|e5-|gte-|minilm/i.test(id);

export async function pickChatModel(cfg: BionicConfig): Promise<string | null> {
  const ids = await listModels(cfg.baseUrl);
  if (cfg.model && ids.includes(cfg.model)) return cfg.model;
  for (const pref of CHAT_PREFERENCE) if (ids.includes(pref)) return pref;
  return ids.find((id) => !isEmbeddingModel(id)) ?? null;
}

// Multilingual embedding models first: research goals and pages can be in any language.
const EMBED_PREFERENCE = [/embeddinggemma/i, /qwen3-embedding/i, /multilingual-e5/i, /bge-m3/i, /nomic-embed/i];

export async function pickEmbedModel(cfg: BionicConfig): Promise<string | null> {
  const ids = await listModels(cfg.baseUrl);
  if (cfg.embedModel && ids.includes(cfg.embedModel)) return cfg.embedModel;
  for (const re of EMBED_PREFERENCE) {
    const hit = ids.find((id) => re.test(id));
    if (hit) return hit;
  }
  return ids.find(isEmbeddingModel) ?? null;
}

function stripFences(text: string): string {
  const t = text.trim();
  const fenced = t.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  if (fenced) return fenced[1];
  // Some models think out loud first; keep the outermost JSON object.
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  return start >= 0 && end > start ? t.slice(start, end + 1) : t;
}

export async function chatJson<T>(cfg: BionicConfig, req: JsonRequest, timeoutMs = 90_000): Promise<T> {
  const model = await pickChatModel(cfg);
  if (!model) throw new Error('No chat model is available in Bionic');
  // Qwen3 hybrid models reason before answering unless told not to.
  const noThink = !cfg.thinking && /qwen3(?!.*(2507|vl|instruct))/i.test(model) ? ' /no_think' : '';
  const res = await fetch(`${base(cfg.baseUrl)}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(timeoutMs),
    body: JSON.stringify({
      model,
      temperature: req.temperature ?? 0.2,
      max_tokens: req.maxTokens ?? 800,
      // Reasoning models think for hundreds of tokens first; most tasks here don't need it.
      reasoning_effort: cfg.thinking ? 'medium' : 'none',
      messages: [
        { role: 'system', content: req.system + noThink },
        { role: 'user', content: req.user },
      ],
      response_format: { type: 'json_schema', json_schema: { name: req.name, strict: true, schema: req.schema } },
    }),
  });
  if (!res.ok) throw new Error(`Bionic chat returned ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const content = body.choices?.[0]?.message?.content ?? '';
  return JSON.parse(stripFences(content)) as T;
}

export async function embed(cfg: BionicConfig, inputs: string[], timeoutMs = 30_000): Promise<number[][]> {
  const model = await pickEmbedModel(cfg);
  if (!model) throw new Error('No embedding model is available in Bionic');
  const res = await fetch(`${base(cfg.baseUrl)}/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(timeoutMs),
    body: JSON.stringify({ model, input: inputs }),
  });
  if (!res.ok) throw new Error(`Bionic embeddings returned ${res.status}`);
  const body = (await res.json()) as { data: { index: number; embedding: number[] }[] };
  return body.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
}
