// Injected into a page with chrome.scripting.executeScript. It must be
// self-contained: no imports, no closures over module scope.
// Reads only what is visible to the user; hidden text is skipped so it cannot
// smuggle instructions into the model.

export interface ExtractedPage {
  title: string;
  description?: string;
  image?: string;
  siteName?: string;
  author?: string;
  publishedAt?: string;
  lang?: string;
  ogType?: string;
  canonical?: string;
  favicon?: string;
  text: string;
  outLinks: string[];
}

export function extractPage(): ExtractedPage {
  const meta = (selector: string) => document.querySelector(selector)?.getAttribute('content')?.trim() || undefined;

  let ldAuthor: string | undefined;
  let ldDate: string | undefined;
  for (const script of Array.from(document.querySelectorAll('script[type="application/ld+json"]')).slice(0, 5)) {
    try {
      const data = JSON.parse(script.textContent || 'null');
      const items = Array.isArray(data) ? data : (data?.['@graph'] ?? [data]);
      for (const item of items) {
        if (!item || typeof item !== 'object') continue;
        ldDate ??= item.datePublished || item.dateCreated;
        const author = Array.isArray(item.author) ? item.author[0] : item.author;
        ldAuthor ??= typeof author === 'string' ? author : author?.name;
      }
    } catch {
      /* malformed JSON-LD */
    }
  }

  const root =
    document.querySelector('article') ||
    document.querySelector('main') ||
    document.querySelector('[role="main"]') ||
    document.querySelector('#content, #main, .content, .post, .article') ||
    document.body;

  const SKIP =
    'nav, header, footer, aside, form, script, style, noscript, svg, button, [role="navigation"], [aria-hidden="true"]';
  const blocks = root
    ? Array.from(root.querySelectorAll('h1, h2, h3, h4, p, li, blockquote, pre, td, figcaption, dd'))
    : [];
  const parts: string[] = [];
  let length = 0;
  for (const el of blocks) {
    if (length > 14000) break;
    if (el.closest(SKIP)) continue;
    // Nested blocks (li inside li, p inside blockquote) would repeat text.
    if (el.parentElement?.closest('p, li, blockquote, td, dd') && !['P', 'LI'].includes(el.tagName)) continue;
    const visible = (el as HTMLElement).checkVisibility?.({ opacityProperty: true, visibilityProperty: true }) ?? true;
    if (!visible) continue;
    const text = (el as HTMLElement).innerText?.replace(/\s+/g, ' ').trim();
    if (!text || text.length < 25) continue;
    parts.push(text);
    length += text.length;
  }
  let text = [...new Set(parts)].join('\n');
  if (text.length < 200 && document.body) text = document.body.innerText.replace(/\s+/g, ' ').trim().slice(0, 8000);

  const outLinks = [
    ...new Set(
      Array.from((root ?? document).querySelectorAll('a[href]'))
        .map((a) => (a as HTMLAnchorElement).href.split('#')[0])
        .filter((h) => /^https?:/.test(h) && h !== location.href.split('#')[0]),
    ),
  ].slice(0, 200);

  const icon = document.querySelector('link[rel~="icon"]') as HTMLLinkElement | null;
  const canonical = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;

  return {
    title: (meta('meta[property="og:title"]') || document.title || location.hostname).trim(),
    description:
      meta('meta[name="description"]') ||
      meta('meta[property="og:description"]') ||
      meta('meta[name="twitter:description"]'),
    image: meta('meta[property="og:image"]') || meta('meta[name="twitter:image"]'),
    siteName: meta('meta[property="og:site_name"]') || meta('meta[name="application-name"]'),
    author: meta('meta[name="author"]') || meta('meta[property="article:author"]') || ldAuthor,
    publishedAt:
      meta('meta[property="article:published_time"]') ||
      meta('meta[name="date"]') ||
      meta('meta[name="citation_publication_date"]') ||
      meta('meta[itemprop="datePublished"]') ||
      ldDate ||
      document.querySelector('time[datetime]')?.getAttribute('datetime') ||
      undefined,
    lang: document.documentElement.lang || undefined,
    ogType: meta('meta[property="og:type"]'),
    canonical: canonical?.href,
    favicon: icon?.href,
    text: text.slice(0, 14000),
    outLinks,
  };
}

/** Injected to read the current selection for the highlight shortcut. */
export function readSelection(): string {
  return window.getSelection()?.toString() ?? '';
}
