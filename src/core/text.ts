// Lightweight text processing: tokenising, stemming, key terms and TF-IDF.
// This is also the always-available fallback when no embedding model runs.
// Works for any script: words keep their combining marks (Devanagari matras,
// Arabic diacritics), and scripts written without spaces (Chinese, Japanese,
// Thai…) are split into overlapping character pairs.

const STOPWORDS_EN = new Set(
  `a about above after again against all also am an and any are aren't as at be because been before being below between
  both but by can can't cannot could couldn't did didn't do does doesn't doing don't down during each few for from further
  had hadn't has hasn't have haven't having he her here hers herself him himself his how i if in into is isn't it its
  itself just let's me more most mustn't my myself no nor not of off on once only or other ought our ours ourselves out
  over own same shan't she should shouldn't so some such than that the their theirs them themselves then there these
  they this those through to too under until up very was wasn't we were weren't what when where which while who whom why
  will with won't would wouldn't you your yours yourself yourselves via per get got make made many much may might must
  one two three new use used using within without across among upon onto however therefore thus yet etc eg ie vs
  every like well still even way ways also says said say according including include includes rather whether
  com www http https html htm php org net amp nbsp page pages site home click read more news article view`
    .split(/\s+/)
    .filter(Boolean),
);

// Frequent function words in the other languages Thread.io is tested with.
const STOPWORDS_OTHER = new Set(
  `el la los las un una unos unas de del al y o que en por para con sin es son fue ser está están como qué cómo
  porque cuál cuáles más menos muy sobre entre hasta desde este esta estos estas ese esa eso lo le se su sus
  les une des du et ou qui est sont été être pour par avec sans dans sur pas plus comme pourquoi comment
  quel quelle quels quelles ce cette ces son sa ses leur leurs au aux il elle ils elles nous vous
  der die das den dem des ein eine einer eines und oder ist sind war wird werden mit ohne für auf aus bei von zu
  nicht auch wie warum was welche welcher dass im am es sie er wir ihr
  os as um uma do da dos das ou em no na nos nas com sem são foi qual quais mais muito seu sua seus suas ele ela eles elas
  है हैं था थे थी और या के का की को में से पर ने भी तो ही यह वह ये वे इस उस इन उन एक कि जो क्या क्यों कैसे कब कहाँ
  नहीं हो होता होती होते गया गई कर करने किया लिए साथ बाद तक द्वारा
  आहे आहेत होता होती होते आणि किंवा च्या चा ची चे ला ना मध्ये वर हे ते ही काय कसे कधी कुठे नाही
  असे असा अशी केले करण्यासाठी साठी पण`
    .split(/\s+/)
    .filter(Boolean),
);

const isStopword = (w: string) => STOPWORDS_EN.has(w) || STOPWORDS_OTHER.has(w);

// Scripts written without spaces between words.
const UNSPACED =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}\p{Script=Lao}\p{Script=Khmer}\p{Script=Myanmar}]/u;

/** Tiny English suffix-stripping stemmer; good enough to match "floods/flooding/flooded". Other scripts pass through. */
export function stem(word: string): string {
  let w = word;
  if (w.length <= 3 || !/^[a-z][a-z'-]*$/.test(w)) return w;
  if (w.endsWith('ies') && w.length > 4) return w.slice(0, -3) + 'y';
  if (w.endsWith('sses')) return w.slice(0, -2);
  if (w.endsWith('ness') && w.length > 6) w = w.slice(0, -4);
  else if (w.endsWith('ments') && w.length > 7) w = w.slice(0, -5);
  else if (w.endsWith('ment') && w.length > 6) w = w.slice(0, -4);
  else if (w.endsWith('ings') && w.length > 6) w = w.slice(0, -4);
  else if (w.endsWith('ing') && w.length > 5) w = w.slice(0, -3);
  else if (w.endsWith('ed') && w.length > 4) w = w.slice(0, -2);
  else if (w.endsWith('es') && w.length > 4 && /(sh|ch|x|z|ss)es$/.test(w)) w = w.slice(0, -2);
  else if (w.endsWith('s') && !w.endsWith('ss') && !w.endsWith('us') && !w.endsWith('is') && w.length > 3)
    w = w.slice(0, -1);
  // Collapse doubled final consonant left behind by -ing/-ed (e.g. "mapp" → "map").
  if (/([bdfgmnprt])\1$/.test(w)) w = w.slice(0, -1);
  return w;
}

/** Overlapping character pairs for text written without spaces. */
function bigrams(run: string): string[] {
  const chars = [...run];
  if (chars.length < 2) return chars;
  const out: string[] = [];
  for (let i = 0; i < chars.length - 1; i++) out.push(chars[i] + chars[i + 1]);
  return out;
}

/** Lower-cased word tokens (letters in any script with their marks, digits), without stopwords. */
export function words(text: string): string[] {
  const raw =
    text
      .normalize('NFC')
      .toLowerCase()
      .match(/[\p{L}\p{N}][\p{L}\p{M}\p{N}'’-]*/gu) ?? [];
  const out: string[] = [];
  for (const token of raw) {
    if (UNSPACED.test(token)) {
      out.push(...bigrams(token));
      continue;
    }
    const w = token.replace(/['’]s$/, '').replace(/^-+|-+$/g, '');
    if ([...w].length > 1 && !isStopword(w) && !/^\d{1,2}$/.test(w)) out.push(w);
  }
  return out;
}

export function tokens(text: string): string[] {
  return words(text).map(stem);
}

export type TermVector = Map<string, number>;

/** Weighted term-frequency vector over several fields. */
export function termFrequencies(fields: { text: string; weight: number }[]): TermVector {
  const tf: TermVector = new Map();
  for (const { text, weight } of fields) {
    if (!text) continue;
    for (const t of tokens(text)) tf.set(t, (tf.get(t) ?? 0) + weight);
  }
  // Sub-linear scaling so one repeated word does not dominate.
  for (const [t, v] of tf) tf.set(t, 1 + Math.log(v));
  return tf;
}

export class Corpus {
  private df = new Map<string, number>();
  private n = 0;

  add(tf: TermVector) {
    this.n++;
    for (const t of tf.keys()) this.df.set(t, (this.df.get(t) ?? 0) + 1);
  }

  idf(term: string): number {
    return Math.log(1 + (this.n + 1) / ((this.df.get(term) ?? 0) + 1));
  }

  weigh(tf: TermVector): TermVector {
    const out: TermVector = new Map();
    for (const [t, v] of tf) out.set(t, v * this.idf(t));
    return out;
  }
}

export function cosineSparse(a: TermVector, b: TermVector): number {
  if (!a.size || !b.size) return 0;
  const [small, large] = a.size < b.size ? [a, b] : [b, a];
  let dot = 0;
  for (const [t, v] of small) {
    const w = large.get(t);
    if (w) dot += v * w;
  }
  if (!dot) return 0;
  let na = 0;
  let nb = 0;
  for (const v of a.values()) na += v * v;
  for (const v of b.values()) nb += v * v;
  return dot / Math.sqrt(na * nb);
}

export function cosine(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

/**
 * Top key terms of a document: frequent, distinctive words plus repeated
 * two-word phrases ("storm drains", "mithi river").
 */
export function keyTerms(text: string, limit = 6, corpus?: Corpus): string[] {
  const ws = words(text);
  const counts = new Map<string, { n: number; surface: string }>();
  const bump = (key: string, surface: string, by: number) => {
    const cur = counts.get(key);
    if (cur) cur.n += by;
    else counts.set(key, { n: by, surface });
  };
  for (let i = 0; i < ws.length; i++) {
    const w = ws[i];
    if ([...w].length < 2 || /^\d+$/.test(w)) continue;
    bump(stem(w), w, 1);
    const next = ws[i + 1];
    if (next && [...next].length >= 2 && !/^\d+$/.test(next)) bump(`${stem(w)} ${stem(next)}`, `${w} ${next}`, 1.6);
  }
  const scored = [...counts.entries()]
    .filter(([key, v]) => (key.includes(' ') ? v.n >= 3.2 : true))
    .map(([key, v]) => {
      const idf = corpus ? key.split(' ').reduce((s, t) => s + corpus.idf(t), 0) / key.split(' ').length : 1;
      return { key, surface: v.surface, score: v.n * idf };
    })
    .sort((a, b) => b.score - a.score);
  const picked: string[] = [];
  const used = new Set<string>();
  for (const s of scored) {
    const parts = s.key.split(' ');
    if (parts.every((p) => used.has(p))) continue;
    picked.push(s.surface);
    parts.forEach((p) => used.add(p));
    if (picked.length >= limit) break;
  }
  return picked;
}

/** Same word, or one is a prefix of the other ("drain" / "drainage", "storm" / "stormwater"). */
function tokenMatches(token: string, tokenSet: Set<string>, prefixes: string[]): boolean {
  if (tokenSet.has(token)) return true;
  if ([...token].length < 4) return false;
  return prefixes.some((p) => (p.length >= 4 && token.startsWith(p)) || (token.length >= 4 && p.startsWith(token)));
}

/** Fraction of a term's words found in the text (0..1), with prefix matching for word variants. */
export function termCoverage(term: string, tokenSet: Set<string>, prefixes = [...tokenSet]): number {
  const parts = tokens(term);
  if (!parts.length) return 0;
  return parts.filter((p) => tokenMatches(p, tokenSet, prefixes)).length / parts.length;
}

/** Terms whose words mostly appear in the token set. */
export function matchedTerms(terms: string[], tokenSet: Set<string>): string[] {
  const prefixes = [...tokenSet];
  return terms.filter((term) => termCoverage(term, tokenSet, prefixes) >= 0.5);
}

export function overlapScore(a: string, b: string): number {
  const ta = new Set(tokens(a));
  const tb = new Set(tokens(b));
  if (!ta.size || !tb.size) return 0;
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared++;
  return shared / Math.min(ta.size, tb.size);
}
