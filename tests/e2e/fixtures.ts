// Offline web for end-to-end tests: a fake search results page and a handful
// of articles on example domains. Content comes from tests/fixtures/mumbai.json.
import fixture from '../fixtures/mumbai.json' with { type: 'json' };

const doc = (label: string) => fixture.docs.find((d) => d.label === label)!.text;

export const ARTICLES: Record<string, { title: string; body: string; date?: string; links?: string[] }> = {
  'https://city-drains.example/storm-water-capacity': {
    title: "Why Mumbai's storm water drains overflow",
    body: doc('drainage'),
    date: '2024-07-02',
    links: ['https://city-drains.example/pumping-stations'],
  },
  'https://city-drains.example/pumping-stations': {
    title: 'Pumping stations at Haji Ali and Irla explained',
    body: 'The pumping stations at Haji Ali and Irla push storm water out to sea at high tide, when the British-era drains cannot discharge by gravity. Drain capacity and pumping together decide how fast streets clear.',
  },
  'https://coast-watch.example/mangroves-mumbai': {
    title: 'Mangroves: the flood buffer Mumbai paved over',
    body: doc('mangrove'),
    date: '2023-05-11',
  },
  'https://monsoon-archive.example/26-july-2005': {
    title: '26 July 2005: the day Mumbai drowned',
    body: doc('2005'),
    date: '2015-07-26',
  },
  'https://climate-journal.example/extreme-rainfall-india': {
    title: 'Extreme rainfall over central India has tripled',
    body: doc('climate'),
    date: '2023-10-03',
  },
  'https://urban-futures.example/sponge-city-mumbai': {
    title: 'Could Mumbai become a sponge city?',
    body: doc('solutions'),
    date: '2025-02-14',
  },
  'https://gadget-reviews.example/budget-phones': {
    title: 'Best budget phones of 2026',
    body: doc('offtopic'),
  },
};

export function articleHtml(url: string): string | undefined {
  const a = ARTICLES[url];
  if (!a) return undefined;
  const paragraphs = a.body
    .split(/(?<=\.)\s+/)
    .map((s) => `<p>${s}</p>`)
    .join('\n');
  const links = (a.links ?? [])
    .map((l) => `<p><a id="related" href="${l}" target="_blank">Related: ${ARTICLES[l]?.title}</a></p>`)
    .join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${a.title}</title>
<meta name="description" content="${a.body.slice(0, 150)}">
${a.date ? `<meta property="article:published_time" content="${a.date}">` : ''}
<meta property="og:type" content="article"></head>
<body><nav>Home · News · About</nav><article><h1>${a.title}</h1>${paragraphs}${links}</article><footer>© Example</footer></body></html>`;
}

/** Results pages: every query lists the articles whose text shares a word with it. */
export function searchHtml(query: string): string {
  const words = query
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 3);
  const hits = Object.entries(ARTICLES).filter(([, a]) =>
    words.some((w) => `${a.title} ${a.body}`.toLowerCase().includes(w)),
  );
  const list = (hits.length ? hits : Object.entries(ARTICLES).slice(0, 3))
    .map(
      ([url, a], i) =>
        `<div class="g"><a class="result" id="r${i}" href="${url}"><h3>${a.title}</h3></a><span>${a.body.slice(0, 120)}</span></div>`,
    )
    .join('\n');
  return `<!doctype html><html><head><meta charset="utf-8"><title>${query} - Search</title></head><body><div id="search">${list}</div></body></html>`;
}
