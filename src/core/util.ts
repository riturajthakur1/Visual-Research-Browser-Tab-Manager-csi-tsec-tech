export const now = () => Date.now();

export function uid(prefix = ''): string {
  const rand = crypto.getRandomValues(new Uint32Array(2));
  return prefix + Date.now().toString(36) + rand[0].toString(36) + rand[1].toString(36).slice(0, 4);
}

export const clamp = (x: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, x));

/** FNV-1a 32-bit hash, hex encoded. Used for cache keys and change signatures. */
export function hash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

const TRACKING_PARAMS = /^(utm_|fbclid$|gclid$|mc_cid$|mc_eid$|ref$|ref_src$|igshid$|si$|spm$)/i;

/** Stable form of a URL for de-duplication: no hash, no tracking params, no trailing slash. */
export function normalizeUrl(raw: string): string {
  try {
    const u = new URL(raw);
    u.hash = '';
    for (const key of [...u.searchParams.keys()]) if (TRACKING_PARAMS.test(key)) u.searchParams.delete(key);
    u.hostname = u.hostname.replace(/^www\./, '');
    let s = u.toString();
    if (s.endsWith('/') && u.pathname !== '/') s = s.slice(0, -1);
    return s;
  } catch {
    return raw;
  }
}

export function hostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

// Second-level public suffixes common in the sources students use, plus
// hosting platforms where each subdomain is a different author.
const TWO_LEVEL_SUFFIXES = new Set([
  'co.uk',
  'ac.uk',
  'gov.uk',
  'org.uk',
  'nhs.uk',
  'co.in',
  'ac.in',
  'gov.in',
  'nic.in',
  'org.in',
  'net.in',
  'edu.in',
  'res.in',
  'ernet.in',
  'com.au',
  'edu.au',
  'gov.au',
  'org.au',
  'co.nz',
  'govt.nz',
  'ac.nz',
  'co.jp',
  'ac.jp',
  'go.jp',
  'com.br',
  'gov.br',
  'com.cn',
  'edu.cn',
  'gov.cn',
  'co.za',
  'ac.za',
  'gov.za',
  'com.sg',
  'edu.sg',
  'gov.sg',
  'com.my',
  'edu.my',
  'com.pk',
  'edu.pk',
  'gov.pk',
  'com.bd',
  'gov.bd',
  'com.np',
  'gov.lk',
]);
const PLATFORM_SUFFIXES = new Set([
  'github.io',
  'blogspot.com',
  'substack.com',
  'medium.com',
  'wordpress.com',
  'notion.site',
  'vercel.app',
  'netlify.app',
]);

/** Approximate registrable domain ("eTLD+1"), used to count independent sites. */
export function siteOf(url: string): string {
  const host = hostname(url);
  if (!host || /^\d+\.\d+\.\d+\.\d+$/.test(host) || !host.includes('.')) return host;
  const parts = host.split('.');
  const last2 = parts.slice(-2).join('.');
  if (PLATFORM_SUFFIXES.has(last2) && parts.length >= 3) return parts.slice(-3).join('.');
  if (TWO_LEVEL_SUFFIXES.has(last2) && parts.length >= 3) return parts.slice(-3).join('.');
  return last2;
}

/** A link that reopens the page scrolled to and highlighting `text`. */
export function textFragmentUrl(url: string, text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  const base = url.split('#')[0];
  if (!clean) return base;
  const words = clean.split(' ');
  const enc = (s: string) => encodeURIComponent(s).replace(/-/g, '%2D');
  // Long passages use the start,end form so the fragment stays short and robust.
  const fragment =
    words.length > 12 ? `${enc(words.slice(0, 5).join(' '))},${enc(words.slice(-5).join(' '))}` : enc(clean);
  return `${base}#:~:text=${fragment}`;
}

export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut) + '…';
}

export function firstSentences(text: string, count: number, maxChars = 320): string {
  const sentences = text.replace(/\s+/g, ' ').match(/[^.!?]+[.!?]+(\s|$)/g) ?? [text];
  return truncate(sentences.slice(0, count).join('').trim(), maxChars);
}

export function plural(n: number, one: string, many = one + 's') {
  return `${n} ${n === 1 ? one : many}`;
}

export function timeAgo(ts: number, ref = Date.now()): string {
  const s = Math.max(0, Math.round((ref - ts) / 1000));
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return `${d} d ago`;
}

/** Serialises async work: each call waits for the previous one to finish. */
export function createMutex() {
  let tail: Promise<unknown> = Promise.resolve();
  return function run<T>(fn: () => Promise<T>): Promise<T> {
    const next = tail.then(fn, fn);
    tail = next.catch(() => undefined);
    return next;
  };
}

export function withTimeout<T>(promise: Promise<T>, ms: number, label = 'operation'): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms} ms`)), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}
