import type { SearchEngineId } from './types';

export interface SearchHit {
  engine: string;
  query: string;
}

interface EngineRule {
  engine: string;
  host: RegExp;
  path: RegExp;
  param: string;
}

const RULES: EngineRule[] = [
  { engine: 'Google Scholar', host: /^scholar\.google\./, path: /^\/scholar/, param: 'q' },
  { engine: 'Google', host: /(^|\.)google\.[a-z.]+$/, path: /^\/search/, param: 'q' },
  { engine: 'Bing', host: /(^|\.)bing\.com$/, path: /^\/search/, param: 'q' },
  { engine: 'DuckDuckGo', host: /(^|\.)duckduckgo\.com$/, path: /^\/(html\/?)?$/, param: 'q' },
  { engine: 'Brave', host: /^search\.brave\.com$/, path: /^\/search/, param: 'q' },
  { engine: 'Yahoo', host: /(^|\.)search\.yahoo\.com$/, path: /^\/search/, param: 'p' },
  { engine: 'Ecosia', host: /(^|\.)ecosia\.org$/, path: /^\/search/, param: 'q' },
  { engine: 'Startpage', host: /(^|\.)startpage\.com$/, path: /^\/(sp|do)\/search/, param: 'query' },
  { engine: 'Kagi', host: /(^|\.)kagi\.com$/, path: /^\/search/, param: 'q' },
  { engine: 'Perplexity', host: /(^|\.)perplexity\.ai$/, path: /^\/search/, param: 'q' },
  { engine: 'YouTube', host: /(^|\.)youtube\.com$/, path: /^\/results/, param: 'search_query' },
  { engine: 'Wikipedia', host: /\.wikipedia\.org$/, path: /^\/w\/index\.php/, param: 'search' },
  { engine: 'Semantic Scholar', host: /(^|\.)semanticscholar\.org$/, path: /^\/search/, param: 'q' },
  { engine: 'arXiv', host: /(^|\.)arxiv\.org$/, path: /^\/a?\/?search/, param: 'query' },
  { engine: 'PubMed', host: /^pubmed\.ncbi\.nlm\.nih\.gov$/, path: /^\/$/, param: 'term' },
];

/** Recognises a search-results URL and returns the engine and query. */
export function parseSearchUrl(raw: string): SearchHit | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  const host = url.hostname.replace(/^www\./, '');
  for (const rule of RULES) {
    if (!rule.host.test(host) || !rule.path.test(url.pathname)) continue;
    // Some engines put the query in the hash after client-side navigation.
    const q = url.searchParams.get(rule.param) ?? new URLSearchParams(url.hash.slice(1)).get(rule.param);
    if (q && q.trim()) return { engine: rule.engine, query: q.replace(/\s+/g, ' ').trim() };
  }
  return null;
}

const SEARCH_URLS: Record<SearchEngineId, string> = {
  google: 'https://www.google.com/search?q=',
  bing: 'https://www.bing.com/search?q=',
  duckduckgo: 'https://duckduckgo.com/?q=',
  brave: 'https://search.brave.com/search?q=',
};

export function buildSearchUrl(engine: SearchEngineId, query: string): string {
  return SEARCH_URLS[engine] + encodeURIComponent(query);
}
