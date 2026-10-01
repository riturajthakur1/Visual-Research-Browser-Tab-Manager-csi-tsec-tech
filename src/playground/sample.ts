// Sample research for the UI playground. Every state the UI has to handle
// appears at least once: covered, thin, gap, conflict and stale questions;
// accepted, suggested, prepared and model-decided filings; parked pages;
// teammates, claims, highlights, notes, a proposal; Hindi and Arabic routes.
// All sites are fictional (.example domains); content is sample text.
import { newKey } from '../core/collab/crypto';
import { db, newWorkspace } from '../core/db';
import { attachedSources, sourceSignature } from '../core/engine/coverage';
import { updateSettings } from '../core/settings';
import type { Attachment, Member, Question, TrailEvent, TrailNode, Workspace } from '../core/types';
import { siteOf, textFragmentUrl } from '../core/util';

export const ME: Member = { id: 'm_you', name: 'You', color: '#C8160C' };
export const RIYA: Member = { id: 'm_riya', name: 'Riya Shah', color: '#2563EB' };
export const ARJUN: Member = { id: 'm_arjun', name: 'Arjun Rao', color: '#16A34A' };

const MIN = 60_000;
let clock = 0;

function question(
  ws: Workspace,
  order: number,
  text: string,
  keyTerms: string[],
  searches: string[],
  extra: Partial<Question> = {},
): Question {
  const t = clock + order * MIN;
  return {
    id: `${ws.id}_q${order + 1}`,
    wsId: ws.id,
    text,
    keyTerms,
    searches,
    order,
    origin: 'ai',
    createdAt: t,
    updatedAt: t,
    ...extra,
  };
}

function attach(
  q: Question | null,
  method: Attachment['method'],
  reason: string,
  state: Attachment['state'] = 'accepted',
  score = 0.62,
): Attachment {
  return { questionId: q?.id ?? null, score, reason, method, state, alternatives: [], at: clock };
}

let seq = 0;
function page(
  ws: Workspace,
  minute: number,
  url: string,
  title: string,
  summary: string,
  opts: Partial<TrailNode> & { by?: Member; highlight?: string } = {},
): TrailNode {
  const t = clock + minute * MIN;
  const { by, highlight, ...rest } = opts;
  return {
    id: `${ws.id}_n${++seq}`,
    wsId: ws.id,
    kind: 'page',
    url,
    canonicalUrl: url,
    title,
    site: siteOf(url),
    description: summary,
    summary,
    text: summary,
    keyTerms: [],
    pageType: 'news',
    tags: [],
    notes: '',
    highlights: highlight
      ? [{ id: `h${seq}`, text: highlight, url: textFragmentUrl(url, highlight), at: t + MIN }]
      : [],
    importance: 0,
    status: 'open',
    prov: { openedAt: t, transition: 'link' },
    foundBy: by ?? ME,
    enriched: true,
    visits: 1,
    timeSpentMs: 90_000,
    createdAt: t,
    updatedAt: t,
    ...rest,
  };
}

function search(ws: Workspace, minute: number, query: string, extra: Partial<TrailNode> = {}): TrailNode {
  const url = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
  return {
    ...page(ws, minute, url, query, ''),
    kind: 'search',
    query,
    engine: 'Google',
    pageType: 'search',
    summary: undefined,
    description: undefined,
    text: undefined,
    ...extra,
  };
}

async function mumbai(): Promise<string> {
  const ws: Workspace = {
    ...newWorkspace('Mumbai monsoon floods', 'Why does Mumbai flood every monsoon, and what would fix it?'),
    id: 'ws_sample_mumbai',
    createdAt: clock,
    updatedAt: clock + 60 * MIN,
  };
  ws.collab = { server: 'ws://localhost:4545', room: ws.id, key: newKey(), role: 'owner', since: clock };
  const qs = [
    question(
      ws,
      0,
      'What makes Mumbai’s monsoon rainfall so intense?',
      ['rainfall intensity', 'arabian sea', 'extreme rain'],
      ['mumbai extreme rainfall trend', 'arabian sea warming monsoon'],
    ),
    question(
      ws,
      1,
      'Why do the city’s storm drains overflow?',
      ['storm drains', 'drain capacity', 'pumping stations'],
      ['mumbai storm drain capacity', 'brimstowad project progress'],
    ),
    question(
      ws,
      2,
      'How did losing mangroves and wetlands change flooding?',
      ['mangroves', 'wetlands', 'reclamation'],
      ['mumbai mangrove loss flooding', 'mithi river reclamation'],
      { claimedBy: RIYA },
    ),
    question(
      ws,
      3,
      'What happened in the 26 July 2005 deluge?',
      ['26 july 2005', '944 mm', 'santacruz'],
      ['mumbai 2005 flood timeline', '26 july 2005 rainfall record'],
    ),
    question(
      ws,
      4,
      'Which fixes have worked in other coastal cities?',
      ['sponge city', 'retention basins', 'flood barriers'],
      ['sponge city results coastal', 'jakarta flood barrier lessons'],
      { claimedBy: ME },
    ),
    question(
      ws,
      5,
      'What is the city doing now, and is it enough?',
      ['flood action plan', 'budget', 'progress'],
      ['mumbai flood mitigation plan 2026', 'bmc monsoon preparedness audit'],
    ),
  ];
  const [q1, q2, q3, q4] = qs;
  const s1 = search(ws, 2, 'mumbai extreme rainfall trend');
  const s2 = search(ws, 9, 'mumbai storm drain capacity', { foundBy: RIYA });
  const s3 = search(ws, 21, 'mumbai mangrove loss flooding', {
    prov: { openedAt: clock + 21 * MIN, questionTag: q3.id },
  });
  const nodes: TrailNode[] = [
    page(
      ws,
      3,
      'https://climate-journal.example/extreme-rainfall-india',
      'Extreme rainfall over central India has tripled since 1950',
      'Extreme rain events over central India have tripled since 1950, linked to a warming Arabian Sea.',
      {
        attach: attach(
          q1,
          'trail',
          'Answers Q1 · opened from your search “mumbai extreme rainfall trend” · mentions extreme rain',
        ),
        prov: { openedAt: clock + 3 * MIN, searchId: s1.id },
        highlight: 'extreme rainfall events over central India have tripled since 1950',
        publishedAt: '2023-10-03',
        pageType: 'paper',
      },
    ),
    page(
      ws,
      6,
      'https://monsoon-desk.example/why-mumbai-rain-is-heavier',
      'Why Mumbai’s rain arrives in shorter, heavier bursts',
      'Meteorologists say the city now gets more of its seasonal rain in a few intense spells.',
      {
        attach: attach(q1, 'semantic', 'Answers Q1 · 71% match · mentions rainfall intensity', 'suggested', 0.43),
        by: ARJUN,
        publishedAt: '2025-06-18',
      },
    ),
    page(
      ws,
      10,
      'https://city-drains.example/storm-water-capacity',
      'Why Mumbai’s storm water drains overflow',
      'British-era drains were built for 25 mm of rain an hour; upgrades target 50 mm.',
      {
        attach: attach(q2, 'trail', 'Answers Q2 · opened from your search “mumbai storm drain capacity”'),
        prov: { openedAt: clock + 10 * MIN, searchId: s2.id },
        by: RIYA,
        highlight: 'designed to carry 25 mm of rain per hour',
        notes: 'Check this against the 2024 BMC report.',
        publishedAt: '2024-07-02',
      },
    ),
    page(
      ws,
      14,
      'https://ward-watch.example/drain-upgrade-claims',
      'Drain upgrades now handle 55 mm an hour, says civic body',
      'The civic body claims most of the network has been upgraded to carry 55 mm per hour.',
      {
        attach: attach(q2, 'llm', 'Answers Q2 · reports the current drain capacity after upgrades', 'accepted', 0.38),
        by: RIYA,
        publishedAt: '2025-08-30',
      },
    ),
    page(
      ws,
      22,
      'https://coast-watch.example/mangroves-mumbai',
      'Mangroves: the flood buffer Mumbai paved over',
      'Reclamation along the Mithi river and Mahim creek destroyed wetlands that once absorbed floodwater.',
      {
        attach: attach(q3, 'prepared', 'Answers Q3 · opened from your prepared search “mumbai mangrove loss flooding”'),
        prov: { openedAt: clock + 22 * MIN, searchId: s3.id, questionTag: q3.id },
        by: RIYA,
        publishedAt: '2023-05-11',
      },
    ),
    page(
      ws,
      27,
      'https://monsoon-archive.example/26-july-2005',
      '26 July 2005: the day Mumbai drowned',
      'Santacruz recorded 944 mm of rain in 24 hours; the Mithi river overflowed and the airport shut.',
      {
        attach: attach(q4, 'user', 'You filed this here'),
        highlight: '944 mm of rain in 24 hours at Santacruz',
        publishedAt: '2005-08-01',
        pageType: 'reference',
      },
    ),
    page(
      ws,
      31,
      'https://city-history.example/2005-floods-report',
      'Fact-finding committee report on the 2005 floods',
      'The committee blamed drainage, encroachment on the Mithi river and poor warnings.',
      {
        attach: attach(q4, 'semantic', 'Answers Q4 · 64% match · mentions 26 july 2005', 'accepted', 0.51),
        by: ARJUN,
        publishedAt: '2006-03-15',
        pageType: 'government',
      },
    ),
    page(
      ws,
      35,
      'https://gadget-reviews.example/budget-phones',
      'Best budget phones of 2026',
      'We compare battery life, cameras and displays across ten phones.',
      {
        attach: attach(null, 'semantic', 'Looks off-topic for this goal (0% relevant)', 'suggested', 0.05),
        pageType: 'product',
      },
    ),
    page(
      ws,
      38,
      'https://transit-news.example/metro-line-3',
      'Metro Line 3 opens its underground stretch',
      'The new line runs beneath the city with stations designed to keep water out.',
      {
        attach: attach(null, 'semantic', 'No question matched clearly (best: Q6, 24%)', 'suggested', 0.24),
        by: ARJUN,
      },
    ),
    page(
      ws,
      40,
      'https://transit-news.example/metro-station-flooding',
      'Why metro stations flooded during the first heavy rain',
      'Water entered two stations through construction openings.',
      {
        attach: attach(null, 'semantic', 'No question matched clearly (best: Q6, 21%)', 'suggested', 0.21),
      },
    ),
    {
      ...page(ws, 44, '', 'Idea', ''),
      kind: 'note',
      title: 'Idea: compare drain capacity numbers across sources',
      notes: 'Idea: compare drain capacity numbers across sources before writing the brief.',
      pos: { x: -900, y: -120 },
      pinned: true,
    },
  ];
  // The opened-from trail: the upgrade-claims page was opened from the drains article.
  nodes[3].prov.openerId = nodes[2].id;

  const drainSources = attachedSources(q2.id, nodes);
  q2.conflict = {
    verdict: 'conflict',
    explanation: 'One source says the drains carry 25 mm an hour; the civic body says 55 mm after upgrades.',
    nodeIds: [nodes[2].id, nodes[3].id],
    signature: sourceSignature(drainSources),
    checkedAt: clock + 15 * MIN,
  };
  ws.proposedQuestion = {
    text: 'How did metro construction affect flooding?',
    keyTerms: ['metro', 'construction', 'stations'],
    searches: ['mumbai metro flooding stations', 'metro construction drainage mumbai'],
    nodeIds: [nodes[8].id, nodes[9].id],
  };

  const events: TrailEvent[] = [];
  for (const n of [...nodes, s1, s2, s3]) {
    events.push({ wsId: ws.id, at: n.createdAt, type: 'node.add', nodeId: n.id });
    if (n.attach)
      events.push({
        wsId: ws.id,
        at: n.createdAt + 20_000,
        type: 'node.attach',
        nodeId: n.id,
        questionId: n.attach.questionId,
      });
  }
  for (const q of qs) events.push({ wsId: ws.id, at: q.createdAt, type: 'question.add', questionId: q.id });

  await db.workspaces.add(ws);
  await db.questions.bulkAdd(qs);
  await db.nodes.bulkAdd([...nodes, s1, s2, s3]);
  await db.events.bulkAdd(events);
  return ws.id;
}

async function hindi() {
  const ws: Workspace = {
    ...newWorkspace('मुंबई बाढ़ (हिंदी)', 'मुंबई में हर मानसून में बाढ़ क्यों आती है?'),
    id: 'ws_sample_hindi',
    createdAt: clock,
    updatedAt: clock,
  };
  const qs = [
    question(
      ws,
      0,
      'मानसून में बारिश इतनी तेज़ क्यों होती है?',
      ['बारिश', 'मानसून'],
      ['मुंबई तेज़ बारिश कारण', 'mumbai extreme rainfall'],
    ),
    question(
      ws,
      1,
      'शहर की नालियाँ पानी क्यों नहीं निकाल पातीं?',
      ['नालियाँ', 'जल निकासी'],
      ['मुंबई नाली क्षमता', 'mumbai storm drain capacity'],
    ),
    question(
      ws,
      2,
      'मैंग्रोव खत्म होने से बाढ़ पर क्या असर पड़ा?',
      ['मैंग्रोव', 'आर्द्रभूमि'],
      ['मुंबई मैंग्रोव बाढ़', 'mumbai mangrove loss'],
    ),
    question(
      ws,
      3,
      'दूसरे तटीय शहरों में कौन-से उपाय काम आए?',
      ['उपाय', 'स्पंज सिटी'],
      ['तटीय शहर बाढ़ उपाय', 'sponge city results'],
    ),
  ];
  const nodes = [
    page(
      ws,
      4,
      'https://city-drains.example/storm-water-capacity',
      'Why Mumbai’s storm water drains overflow',
      'British-era drains were built for 25 mm of rain an hour.',
      {
        attach: attach(qs[1], 'semantic', 'Answers Q2 · 58% match · mentions नालियाँ', 'suggested', 0.41),
      },
    ),
    page(
      ws,
      9,
      'https://hindi-news.example/mumbai-nale',
      'मुंबई की नालियाँ प्रति घंटे केवल 25 मिमी बारिश झेल सकती हैं',
      'ब्रिटिश काल की नालियाँ प्रति घंटे 25 मिमी बारिश के लिए बनी थीं।',
      {
        attach: attach(qs[1], 'trail', 'Answers Q2 · opened from your search “मुंबई नाली क्षमता”'),
        highlight: 'प्रति घंटे केवल 25 मिमी बारिश',
      },
    ),
  ];
  await db.workspaces.add(ws);
  await db.questions.bulkAdd(qs);
  await db.nodes.bulkAdd(nodes);
}

async function arabic() {
  const ws: Workspace = {
    ...newWorkspace('فيضانات مومباي (عربي)', 'لماذا تغرق مومباي في كل موسم أمطار، وما الحل؟'),
    id: 'ws_sample_arabic',
    createdAt: clock,
    updatedAt: clock,
  };
  const qs = [
    question(
      ws,
      0,
      'ما الذي يجعل أمطار الرياح الموسمية شديدة إلى هذا الحد؟',
      ['الأمطار', 'الرياح الموسمية'],
      ['أمطار مومباي الغزيرة', 'mumbai extreme rainfall'],
    ),
    question(
      ws,
      1,
      'لماذا تفيض مصارف مياه الأمطار في المدينة؟',
      ['المصارف', 'تصريف المياه'],
      ['قدرة مصارف مومباي', 'mumbai storm drain capacity'],
    ),
    question(
      ws,
      2,
      'ما الحلول التي نجحت في مدن ساحلية أخرى؟',
      ['حلول', 'مدينة إسفنجية'],
      ['حلول الفيضانات المدن الساحلية', 'sponge city results'],
    ),
  ];
  const nodes = [
    page(
      ws,
      5,
      'https://city-drains.example/storm-water-capacity',
      'Why Mumbai’s storm water drains overflow',
      'British-era drains were built for 25 mm of rain an hour.',
      {
        attach: attach(qs[1], 'semantic', 'Answers Q2 · 61% match', 'suggested', 0.44),
      },
    ),
  ];
  await db.workspaces.add(ws);
  await db.questions.bulkAdd(qs);
  await db.nodes.bulkAdd(nodes);
}

/** Clears the playground's database and writes the sample research. */
export async function seedSample(): Promise<string> {
  clock = Date.now() - 2 * 60 * MIN;
  seq = 0;
  await Promise.all(db.tables.map((t) => t.clear()));
  await hindi();
  await arabic();
  const id = await mumbai();
  await updateSettings({
    activeWsId: id,
    recording: true,
    profile: ME,
    onboarded: true,
  });
  return id;
}

/** What the service worker would publish for a live shared route. */
export function sampleTeamStatus(wsId: string, online: boolean) {
  const at = Date.now();
  return {
    [wsId]: online
      ? {
          state: 'live',
          peers: [
            { ...RIYA, at },
            { ...ARJUN, at },
          ],
        }
      : { state: 'offline', peers: [] },
  };
}
