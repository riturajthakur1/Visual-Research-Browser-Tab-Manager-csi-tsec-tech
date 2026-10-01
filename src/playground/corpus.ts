// A small simulated web for the playground's Browse view: sample articles on
// fictional .example sites, and a search engine over them. Pages are written
// so the real engine has something to match: the Mumbai flood topics, a pair
// of sources that disagree on drain capacity, a Hindi page and an off-topic one.
import type { ExtractedPage } from '../background/extract';

export interface Article {
  url: string;
  title: string;
  site: string;
  author?: string;
  publishedAt?: string;
  lang?: string;
  description: string;
  /** Body paragraphs. `[text](url)` marks an in-page link. */
  body: string[];
}

export const ARTICLES: Article[] = [
  {
    url: 'https://monsoon-archive.example/2005-deluge',
    title: 'The 26 July 2005 deluge: a history of Mumbai’s worst flood',
    site: 'Monsoon Archive',
    author: 'Meera Kulkarni',
    publishedAt: '2025-07-26',
    description:
      'The background and history of the day 944 mm of rain fell on Mumbai, and what it revealed about the city.',
    body: [
      'On 26 July 2005 the Santacruz weather station recorded 944 mm of rain in 24 hours, one of the heaviest single-day totals ever measured in an Indian city. More than 1,000 people died across Maharashtra and the suburban railway stopped for two days.',
      'The history of Mumbai flooding is older than 2005. Low-lying neighbourhoods such as Hindmata, Milan Subway and Kurla have flooded in almost every heavy monsoon since the 1970s, as the city built over its old creeks and salt pans.',
      'The 2005 flood became the background for every flood plan since. The Chitale fact-finding committee blamed [overloaded storm drains](https://city-drains.example/brimstowad) and the [loss of mangroves along the Mithi river](https://coast-watch.example/mithi-mangroves).',
      'Twenty years later the same streets still go under water when heavy rain meets high tide. For the wider [causes behind the floods](https://ward-watch.example/five-causes), the city’s ward reports are a good place to start.',
    ],
  },
  {
    url: 'https://city-history.example/seven-islands',
    title: 'From seven islands to one city: the history behind Mumbai’s floods',
    site: 'City History',
    author: 'Farhan Siddiqui',
    publishedAt: '2024-11-02',
    description: 'How land reclamation joined seven islands into Mumbai, and why the old low ground still floods.',
    body: [
      'Mumbai was once seven islands separated by tidal creeks and marshes. Between the 1700s and the 1840s the British joined them with causeways and reclamation, filling the low ground in between.',
      'That history matters for flooding: much of central Mumbai sits barely above high-tide level on filled land. Rain that falls there has nowhere natural to go once the sea is high.',
      'Later reclamation for Bandra-Kurla and the airport pushed the city further into the Mithi river’s flood plain. The [2005 flood](https://monsoon-archive.example/2005-deluge) showed how much of that ground still belongs to the water.',
    ],
  },
  {
    url: 'https://ward-watch.example/five-causes',
    title: 'Five causes behind Mumbai’s monsoon floods',
    site: 'Ward Watch',
    author: 'Ward Watch desk',
    publishedAt: '2026-06-18',
    description:
      'Extreme rain, old drains, high tide, lost mangroves and blocked nullahs: the main causes and factors explained.',
    body: [
      'Mumbai floods for several reasons at once. The first of the main causes is the rain itself: monsoon bursts of more than 100 mm in a few hours are becoming more common, as [a recent study of rainfall data](https://climate-journal.example/extreme-rain-days) shows.',
      'The second factor is drainage. Much of the network dates from British times and was designed for far less rain than now falls, as the [storm drain project](https://city-drains.example/brimstowad) explains.',
      'Third, high tide closes the outfalls: when the sea is high the drains cannot empty, and water backs up into the streets. Fourth, [mangroves and wetlands](https://coast-watch.example/mithi-mangroves) that once absorbed water have been reclaimed.',
      'Fifth, plastic and garbage choke the nullahs before every monsoon, despite desilting drives. Together these factors and causes explain why the same wards flood year after year.',
    ],
  },
  {
    url: 'https://city-drains.example/brimstowad',
    title: 'Inside BRIMSTOWAD: why Mumbai’s storm drains overflow',
    site: 'City Drains',
    author: 'Rohan Desai',
    publishedAt: '2026-05-30',
    description:
      'Mumbai’s storm drains were built to carry 25 mm of rain an hour. Here is how the network works, step by step, and why it overflows.',
    body: [
      'Mumbai’s storm water drains were designed in British times to carry 25 mm of rain per hour. On a heavy monsoon day the rain can arrive at four times that rate.',
      'The process works step by step: rain runs off roofs and roads into roadside gutters, then into larger mains and open nullahs, and finally out through 45 outfalls into the sea and creeks.',
      'The BRIMSTOWAD project, started after the 2005 flood, aims to raise drain capacity to 50 mm per hour and to add pumping stations at Haji Ali, Irla and Love Grove. Several stations are working; others are still delayed.',
      'Engineers say the mechanism of failure is simple: once the outfalls are shut by [high tide](https://tide-tables.example/high-tide-drains), the drains fill and overflow, whatever their capacity.',
    ],
  },
  {
    url: 'https://infra-audit.example/drain-capacity-audit',
    title: 'Audit: most of Mumbai’s storm drains already carry 50 mm an hour',
    site: 'Infra Audit',
    author: 'Infra Audit team',
    publishedAt: '2026-08-11',
    description:
      'An audit finds most storm drains already carry 50 mm of rain an hour, and says blocked nullahs, not capacity, make them overflow.',
    body: [
      'An independent audit of Mumbai’s storm drain system finds that most of the network already carries 50 mm of rain per hour, not the 25 mm often quoted from British-era designs.',
      'The audit argues the drains overflow because they are blocked: silt, plastic and construction debris cut the working capacity of nullahs by up to a third before the monsoon starts.',
      'Its authors say widening drains further will not help until desilting is done properly and outfalls get tide gates that keep the sea out.',
    ],
  },
  {
    url: 'https://tide-tables.example/high-tide-drains',
    title: 'High tide plus heavy rain: how the sea locks Mumbai’s drains shut',
    site: 'Tide Tables',
    author: 'Ananya Iyer',
    publishedAt: '2026-07-04',
    description:
      'Step by step: how a high tide above 4.5 metres closes the storm drain outfalls and turns heavy rain into a flood.',
    body: [
      'Most of Mumbai’s storm drains empty into the sea. When a tide higher than 4.5 metres coincides with heavy rain, the outfall flap gates close to stop seawater coming in.',
      'This is how a flood happens, step by step: the gates close, rainwater fills the drains with nowhere to go, the pumping stations take over, and if the rain is faster than the pumps the water rises in the streets.',
      'The city publishes a list of high-tide days before every monsoon so that people can avoid travel when heavy rain is forecast.',
    ],
  },
  {
    url: 'https://coast-watch.example/mithi-mangroves',
    title: 'Lost mangroves and the Mithi river: how reclamation made floods worse',
    site: 'Coast Watch',
    author: 'Sana Pathan',
    publishedAt: '2025-12-09',
    description:
      'Mangroves and wetlands along the Mithi river once absorbed floodwater. Reclamation removed many of them.',
    body: [
      'Mangroves act as a sponge and a buffer: they slow storm surge from the sea and soak up water from the land. Along the Mithi river and Mahim creek, a large share of them has been cut and filled since the 1990s.',
      'Reclamation for housing, roads and the Bandra-Kurla Complex narrowed the river’s mouth, so floodwater drains more slowly into the sea.',
      'Ecologists count the loss of wetlands among the main causes of Mumbai’s floods, alongside [extreme rain](https://climate-journal.example/extreme-rain-days) and ageing drains.',
    ],
  },
  {
    url: 'https://climate-journal.example/extreme-rain-days',
    title: 'Study: extreme rain days over Mumbai have tripled since 1950',
    site: 'Climate Journal',
    author: 'Dr. Vikram Nair',
    publishedAt: '2026-03-15',
    description:
      'Rainfall data from 1950 to 2025 show extreme monsoon rain events over Mumbai and the west coast have become three times as frequent.',
    body: [
      'A new study of daily rainfall data from 1950 to 2025 finds that extreme rain events of more than 150 mm a day over Mumbai and the Konkan coast have tripled.',
      'The authors link the trend to a warming Arabian Sea, which feeds more moisture into monsoon storms. Total seasonal rainfall has changed little; the rain is arriving in shorter, heavier bursts.',
      'The data suggest drains and pumps sized on past rainfall will be overwhelmed more often. The study is based on India Meteorological Department records and satellite estimates.',
    ],
  },
  {
    url: 'https://transit-news.example/when-the-trains-stop',
    title: 'When the trains stop: who is affected when Mumbai floods',
    site: 'Transit News',
    author: 'Kabir Menon',
    publishedAt: '2026-07-21',
    description:
      'The impact of floods on commuters, daily-wage workers and small businesses when the suburban railway stops.',
    body: [
      'Mumbai’s suburban railway carries more than seven million people a day. When the tracks at Sion, Kurla and Parel flood, the city’s economy stops with them.',
      'The people most affected are daily-wage workers and small traders who lose a day’s income for every day of flooding. The impact on low-lying slums is worst: homes flood first and dry last.',
      'Estimates put the cost of a single day of citywide flooding at several hundred crore rupees in lost work and damaged goods.',
    ],
  },
  {
    url: 'https://health-desk.example/leptospirosis-after-floods',
    title: 'Leptospirosis cases rise after every Mumbai flood',
    site: 'Health Desk',
    author: 'Dr. Priya Bhatt',
    publishedAt: '2026-08-02',
    description:
      'Wading through floodwater spreads leptospirosis; hospitals see a rise in cases two weeks after heavy flooding.',
    body: [
      'Two weeks after every major flood, Mumbai’s hospitals report a rise in leptospirosis, a bacterial infection spread through water contaminated by rat urine.',
      'People affected most are those who wade through floodwater on their way to work. The city now hands out preventive doses to people exposed to floodwater.',
      'Doctors say the health impact of floods is underestimated because cases appear after the water has gone.',
    ],
  },
  {
    url: 'https://policy-review.example/what-would-fix-mumbai-floods',
    title: 'What would fix Mumbai’s floods? Solutions on the table',
    site: 'Policy Review',
    author: 'Aditi Joshi',
    publishedAt: '2026-06-05',
    description:
      'Solutions and policy options: finishing BRIMSTOWAD, holding tanks, mangrove protection, tide gates and sponge-city design.',
    body: [
      'There is no single fix. Planners list five solutions: finish the BRIMSTOWAD pumping stations, build underground holding tanks, protect the remaining mangroves, fit tide gates to outfalls, and adopt sponge-city policy for new buildings.',
      'Holding tanks have already been tried: the [tanks under Hindmata](https://urban-lab.example/hindmata-holding-tanks) store floodwater until the tide falls.',
      'Policy experts say the cheapest solution is protecting the wetlands that still exist, because rebuilding them later costs far more.',
    ],
  },
  {
    url: 'https://urban-lab.example/hindmata-holding-tanks',
    title: 'Did the Hindmata holding tanks work? A first-season review',
    site: 'Urban Lab',
    author: 'Urban Lab Mumbai',
    publishedAt: '2026-09-10',
    description:
      'Underground holding tanks at Hindmata stored floodwater during the 2026 monsoon. A review of how well this solution worked.',
    body: [
      'Underground holding tanks near Hindmata and Dadar store up to 100 million litres of floodwater and release it after the tide falls. In the 2026 monsoon the junction flooded for 2 hours instead of the usual 8.',
      'The review calls holding tanks one of the most effective local solutions, but notes they only protect the streets around them.',
      'It recommends the same policy for Milan Subway, Andheri Subway and Kings Circle.',
    ],
  },
  {
    url: 'https://hindi-news.example/mumbai-baadh-kaaran',
    title: 'मुंबई में हर मानसून में बाढ़ क्यों आती है?',
    site: 'हिंदी समाचार',
    author: 'संवाददाता',
    publishedAt: '2026-07-12',
    lang: 'hi',
    description: 'मुंबई में बाढ़ के मुख्य कारण: भारी बारिश, पुराने नाले, ऊँचा ज्वार और मैंग्रोव का नुकसान।',
    body: [
      'मुंबई में हर मानसून में बाढ़ के कई कारण हैं। सबसे बड़ा कारण कुछ ही घंटों में होने वाली भारी बारिश है।',
      'शहर के कई नाले अंग्रेज़ों के समय के हैं और प्रति घंटे 25 मिलीमीटर बारिश के लिए बनाए गए थे। ऊँचे ज्वार के समय नालों का पानी समुद्र में नहीं जा पाता।',
      'मीठी नदी के किनारे मैंग्रोव और आर्द्रभूमि के नष्ट होने से भी बाढ़ का ख़तरा बढ़ा है।',
    ],
  },
  {
    url: 'https://gadget-reviews.example/pixel-camera-review',
    title: 'Phone camera review: the best low-light shots of 2026',
    site: 'Gadget Reviews',
    author: 'Tech desk',
    publishedAt: '2026-09-01',
    description: 'We tested the new phone camera at night, in portrait mode and in video. Here is how it compares.',
    body: [
      'The new camera’s night mode is the best we have tested this year, with clean shadows and accurate colour.',
      'Portrait mode still struggles with hair against busy backgrounds, and video stabilisation lags behind last year’s flagship.',
      'Battery life is a full day of heavy use. At its price, it is the phone to beat for photography.',
    ],
  },
];

const byUrl = new Map(ARTICLES.map((a) => [a.url, a]));
export const findArticle = (url: string) => byUrl.get(url.split('#')[0]);

/** Splits a paragraph into text and link parts. */
export function parseBody(paragraph: string): ({ text: string } | { text: string; href: string })[] {
  const parts: ({ text: string } | { text: string; href: string })[] = [];
  const re = /\[([^\]]+)\]\(([^)]+)\)/g;
  let last = 0;
  for (let m = re.exec(paragraph); m; m = re.exec(paragraph)) {
    if (m.index > last) parts.push({ text: paragraph.slice(last, m.index) });
    parts.push({ text: m[1], href: m[2] });
    last = m.index + m[0].length;
  }
  if (last < paragraph.length) parts.push({ text: paragraph.slice(last) });
  return parts;
}

const plain = (p: string) =>
  parseBody(p)
    .map((x) => x.text)
    .join('');

/** What `extractPage` would read from the article if it were a real page. */
export function extractArticle(url: string): ExtractedPage | undefined {
  const a = findArticle(url);
  if (!a) return undefined;
  const outLinks = [...new Set(a.body.flatMap((p) => parseBody(p).flatMap((x) => ('href' in x ? [x.href] : []))))];
  return {
    title: a.title,
    description: a.description,
    siteName: a.site,
    author: a.author,
    publishedAt: a.publishedAt,
    lang: a.lang ?? 'en',
    ogType: 'article',
    text: [a.title, ...a.body.map(plain)].join('\n'),
    outLinks,
  };
}

// --- Search -------------------------------------------------------------------

const words = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFC')
    .split(/[^\p{L}\p{M}\p{N}]+/u)
    .filter((w) => w.length > 1);

// Common words that would otherwise make every page match.
const STOP = new Set(
  'the a an and or of to in on for is are was were be how why what does do it its with by from at as that this which who'.split(
    ' ',
  ),
);
const same = (a: string, b: string) =>
  a === b || (a.length >= 5 && b.length >= 5 && (a.startsWith(b.slice(0, 5)) || b.startsWith(a.slice(0, 5))));

export interface SearchResult {
  article: Article;
  snippet: string;
  score: number;
}

const indexed = ARTICLES.map((article) => ({
  article,
  head: words(`${article.title} ${article.description}`),
  body: words(article.body.map(plain).join(' ')),
}));

/** Rare words decide the ranking: "mumbai flood data" should find the data page, not every Mumbai page. */
function rarity(word: string): number {
  const df = indexed.filter((d) => d.head.some((h) => same(h, word)) || d.body.some((b) => same(b, word))).length;
  return Math.log(1 + ARTICLES.length / (1 + df));
}

/** Ranks the sample articles for a query: title and description words count more than body words. */
export function searchCorpus(query: string, limit = 6): SearchResult[] {
  const q = [...new Set(words(query).filter((w) => !STOP.has(w)))];
  if (!q.length) return [];
  const weights = q.map(rarity);
  const results = indexed.map(({ article, head, body }) => {
    let score = 0;
    let hits = 0;
    q.forEach((w, i) => {
      const inHead = head.some((h) => same(h, w));
      const inBody = body.filter((b) => same(b, w)).length;
      if (inHead || inBody) hits++;
      score += weights[i] * ((inHead ? 3 : 0) + Math.min(inBody, 3));
    });
    // Pages matching only one word of a longer query are noise.
    if (hits < Math.min(2, q.length)) score = 0;
    return { article, snippet: article.description, score };
  });
  return results
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
