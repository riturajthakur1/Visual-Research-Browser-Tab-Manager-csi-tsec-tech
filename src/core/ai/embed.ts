// Embedding providers. Order for "auto": Bionic's embedding model → the
// in-browser multilingual-e5 model (offscreen document) → none (lexical TF-IDF).
import { db } from '../db';
import { getSettings } from '../settings';
import type { GlobalSettings } from '../types';
import { hash } from '../util';
import { embed as bionicEmbed, pickEmbedModel } from './bionic';
import { offscreenEmbed } from './offscreen-client';

export type EmbedRole = 'query' | 'document';

/**
 * Per-model calibration, measured on recorded research sessions:
 * - relLo/relHi map raw similarity to the topic centroid onto 0..1 relevance
 * - centeredScale maps topic-centred similarity onto a 0..1 match score
 */
export interface Calibration {
  relLo: number;
  relHi: number;
  centeredScale: number;
  queryPrefix: string;
  docPrefix: string;
}

export interface EmbedSpace {
  id: string;
  label: string;
  kind: 'bionic' | 'browser';
  calib: Calibration;
  embedRaw(texts: string[]): Promise<number[][]>;
}

// Measured on tests/fixtures/mumbai.json (English, Hindi and Marathi pages
// against English and Hindi questions). See docs/ARCHITECTURE.md.
const CALIBRATIONS: [RegExp, Calibration][] = [
  [
    /embeddinggemma|embedding-gemma/i,
    {
      relLo: 0.12,
      relHi: 0.45,
      centeredScale: 0.35,
      queryPrefix: 'task: search result | query: ',
      docPrefix: 'title: none | text: ',
    },
  ],
  [
    /multilingual-e5|e5-/i,
    { relLo: 0.79, relHi: 0.87, centeredScale: 0.32, queryPrefix: 'query: ', docPrefix: 'passage: ' },
  ],
  [
    /nomic/i,
    { relLo: 0.62, relHi: 0.8, centeredScale: 0.35, queryPrefix: 'search_query: ', docPrefix: 'search_document: ' },
  ],
  [/minilm/i, { relLo: 0.2, relHi: 0.55, centeredScale: 0.4, queryPrefix: '', docPrefix: '' }],
];
const GENERIC: Calibration = { relLo: 0.2, relHi: 0.6, centeredScale: 0.35, queryPrefix: '', docPrefix: '' };

/** Multilingual model bundled with the extension (100 languages). */
export const BROWSER_MODEL = 'Xenova/multilingual-e5-small';

function calibrationFor(model: string): Calibration {
  return CALIBRATIONS.find(([re]) => re.test(model))?.[1] ?? GENERIC;
}

let cached: { at: number; key: string; space: EmbedSpace | null } | null = null;

export async function resolveEmbedSpace(settings?: GlobalSettings): Promise<EmbedSpace | null> {
  const s = settings ?? (await getSettings());
  const key = `${s.embedProvider}|${s.bionicUrl}|${s.bionicEmbedModel}`;
  if (cached && cached.key === key && Date.now() - cached.at < 30_000) return cached.space;

  let space: EmbedSpace | null = null;
  if (s.embedProvider === 'auto' || s.embedProvider === 'bionic') {
    try {
      const model = await pickEmbedModel({ baseUrl: s.bionicUrl, embedModel: s.bionicEmbedModel });
      if (model) {
        const cfg = { baseUrl: s.bionicUrl, embedModel: model };
        space = {
          id: `bionic:${model}`,
          label: `Bionic · ${model.replace(/^text-embedding-/, '')}`,
          kind: 'bionic',
          calib: calibrationFor(model),
          embedRaw: (texts) => bionicEmbed(cfg, texts),
        };
      }
    } catch {
      /* server not running */
    }
  }
  if (
    !space &&
    (s.embedProvider === 'auto' || s.embedProvider === 'browser') &&
    typeof chrome !== 'undefined' &&
    chrome.offscreen
  ) {
    space = {
      id: `browser:${BROWSER_MODEL}`,
      label: 'In-browser · multilingual-e5',
      kind: 'browser',
      calib: calibrationFor(BROWSER_MODEL),
      embedRaw: (texts) => offscreenEmbed(texts),
    };
  }
  cached = { at: Date.now(), key, space };
  return space;
}

export function resetEmbedSpace() {
  cached = null;
}

/** Embeds texts with caching in IndexedDB. Throws if the provider fails. */
export async function embedTexts(space: EmbedSpace, items: { text: string; role: EmbedRole }[]): Promise<number[][]> {
  const prefixed = items.map(
    ({ text, role }) => (role === 'query' ? space.calib.queryPrefix : space.calib.docPrefix) + text,
  );
  const keys = prefixed.map((t) => `${space.id}|${hash(t)}|${t.length}`);
  const stored = await db.vectors.bulkGet(keys);
  const out: number[][] = stored.map((v) => v?.vector ?? []);
  const missing = out.map((v, i) => (v.length ? -1 : i)).filter((i) => i >= 0);
  for (let start = 0; start < missing.length; start += 16) {
    const batch = missing.slice(start, start + 16);
    const vectors = await space.embedRaw(batch.map((i) => prefixed[i]));
    const at = Date.now();
    await db.vectors.bulkPut(batch.map((i, j) => ({ key: keys[i], vector: vectors[j], at })));
    batch.forEach((i, j) => (out[i] = vectors[j]));
  }
  return out;
}
