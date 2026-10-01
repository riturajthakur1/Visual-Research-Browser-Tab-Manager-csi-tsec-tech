// Drafting the route: goal → 5–8 sub-questions, each with key terms and two
// prepared searches. The local model drafts it in the user's own language;
// without a model, a rules-based draft adapts to the kind of goal (why, how-to,
// comparison, decision, debugging…) and to a handful of common languages.
import type { JsonRequest } from '../ai/llm';
import { detectLanguage, languageInstruction, type LanguageInfo } from '../lang';
import { keyTerms, words } from '../text';

export interface DraftQuestion {
  text: string;
  keyTerms: string[];
  searches: string[];
}

export interface RouteDraft {
  questions: DraftQuestion[];
  source: 'model' | 'rules';
  goalType: GoalType;
  language: LanguageInfo;
}

export type GoalType =
  | 'debug'
  | 'compare'
  | 'decide'
  | 'howto'
  | 'why'
  | 'evaluate'
  | 'event'
  | 'define'
  | 'future'
  | 'list'
  | 'topic';

const ROUTE_SCHEMA = {
  type: 'object',
  properties: {
    questions: {
      type: 'array',
      minItems: 5,
      maxItems: 8,
      items: {
        type: 'object',
        properties: {
          text: { type: 'string' },
          keyTerms: { type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 5 },
          searches: { type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 2 },
        },
        required: ['text', 'keyTerms', 'searches'],
        additionalProperties: false,
      },
    },
  },
  required: ['questions'],
  additionalProperties: false,
};

const SHAPE_HINT: Record<GoalType, string> = {
  debug: 'It is a technical problem: cover what the error means, likely causes, environment/version factors, known fixes, workarounds and how to verify the fix.',
  compare: 'It is a comparison: cover what each option is, the criteria that matter, evidence on each criterion, costs/trade-offs, best fit per use case, and expert verdicts.',
  decide: 'It is a decision: cover the realistic options, the criteria, evidence and reviews, costs and risks, and what experts recommend for this situation.',
  howto: 'It is a how-to: cover prerequisites, the steps, tools needed, common mistakes, worked examples and how to check it worked.',
  why: 'It asks why: cover background, the main causes, the mechanism, the evidence, consequences, and what would change it.',
  evaluate: 'It asks whether a claim holds: cover what the claim says exactly, evidence for, evidence against, expert consensus, risks and context where the answer differs.',
  event: 'It is about an event: cover the timeline, causes, who was involved, impacts, responses and lasting consequences.',
  define: 'It asks what something is: cover the definition, how it works, its history, examples, uses and limitations.',
  future: 'It asks about the future: cover the current state, drivers of change, forecasts, scenarios, risks and expert views.',
  list: 'It asks for a survey: cover the categories, notable examples, how they differ, how to choose between them, and sources that compare them.',
  topic: 'It is a topic rather than a question: cover an overview, key concepts, current state, evidence and data, debates, and open problems.',
};

export function routeRequest(goal: string, lang = detectLanguage(goal), type = classifyGoal(goal)): JsonRequest {
  const searchRule =
    lang.code === 'en'
      ? 'exactly 2 web search queries (3-7 words, no quotes or operators) that would find good sources'
      : `exactly 2 web search queries (3-7 words, no quotes or operators): the first in ${lang.name}, the second in English, because many good sources are in English`;
  return {
    name: 'route',
    system:
      'You are a research planner for students. Break a research goal into 5 to 8 sub-questions that together answer it. ' +
      'Rules: each sub-question covers a distinct aspect; none of them restates the whole goal; each is answerable from ' +
      'web sources; order them as a reader would research them. If the goal is vague, very short or not phrased as a ' +
      'question, plan for the most likely research intent. For each sub-question give 2-5 short key terms a relevant ' +
      `page would mention, and ${searchRule}. ${languageInstruction(lang)}`,
    user: `Research goal: ${goal.trim().slice(0, 1500)}\n\nShape: ${SHAPE_HINT[type]}`,
    schema: ROUTE_SCHEMA,
    maxTokens: 1100,
    temperature: 0.3,
  };
}

export function cleanDraft(raw: { questions?: DraftQuestion[] } | null): DraftQuestion[] {
  const seen = new Set<string>();
  return (raw?.questions ?? [])
    .map((q) => ({
      text: String(q.text ?? '').replace(/\s+/g, ' ').trim(),
      keyTerms: [...new Set((q.keyTerms ?? []).map((t) => String(t).trim().toLowerCase()).filter(Boolean))].slice(0, 5),
      searches: (q.searches ?? []).map((s) => String(s).replace(/["“”«»]/g, '').trim()).filter(Boolean).slice(0, 2),
    }))
    .filter((q) => [...q.text].length > 5 && !seen.has(q.text.toLowerCase()) && seen.add(q.text.toLowerCase()))
    .map((q) => ({ ...q, text: /[?？؟]$/.test(q.text) ? q.text : q.text.replace(/[.!。！]*$/, '') + '?' }))
    .slice(0, 8);
}

// --- Goal classification ---------------------------------------------------

const PATTERNS: [GoalType, RegExp][] = [
  [
    'debug',
    /(\b(error|exception|traceback|stack ?trace|segfault|undefined is not|cannot find module|not working|doesn'?t work|fails? to|crash(es|ing)?|bug|warning:|enoent|eacces|npm err|errno)\b|\b[A-Z][a-z]+Error\b|::|=>|\.(js|ts|py|java|cpp|go|rs)\b|त्रुटि|काम नहीं|error en|ne fonctionne pas|funktioniert nicht|não funciona)/i,
  ],
  [
    'compare',
    /(\bvs\.?\b|\bversus\b|\bcompar(e|ed|ing|ison)\b|\bdifferences? between\b|\bbetter than\b|\bpros and cons\b|तुलना|बनाम|अंतर|फरक|फ़र्क|comparar|comparación|diferencia entre|comparer|différence entre|vergleich|unterschied zwischen|diferença entre)/i,
  ],
  [
    'decide',
    /(\bshould (i|we)\b|\bwhich (one|is (the )?best|should)\b|\bbest\b|\brecommend|\bchoose\b|\bworth it\b|\bbuy\b|चाहिए|सबसे अच्छा|कौन सा|कोणता|सर्वोत्तम|debería|¿cuál es (el|la) mejor|recomiend|devrais|devrions|meilleur|sollte ich|welche[rs]? ist (der|die|das) beste|devo|qual é o melhor)/i,
  ],
  [
    'howto',
    /(^\s*how (do|can|should|would) (i|we|you|one)\b|^\s*how to\b|\bsteps? to\b|\bguide to\b|\btutorial\b|कैसे करें|कैसे बनाएं|कसे करावे|cómo (hacer|puedo|se hace)|comment (faire|puis-je)|wie kann ich|wie macht man|como (fazer|posso))/i,
  ],
  [
    'why',
    /(^\s*why\b|\bwhat causes?\b|\breasons? (for|why|behind)\b|\bcauses? of\b|क्यों|कारण|का होतो|का होते|का आहे|por qué|pourquoi|warum|wieso|por que|perché)/i,
  ],
  [
    'event',
    /(\bwhat happened\b|\bhistory of\b|\btimeline\b|\bwhen did\b|क्या हुआ|काय झाले|qué pasó|que s'est-il passé|was geschah|o que aconteceu)/i,
  ],
  [
    'future',
    /(\bfuture of\b|\bwill\b.*\b(be|happen|replace|change)\b|\bpredict|\bforecast|\bby 20\d\d\b|\bnext (decade|years?)\b|भविष्य|futuro|avenir|zukunft)/i,
  ],
  [
    'list',
    /(\btypes of\b|\bexamples of\b|\blist of\b|\bkinds of\b|\bways to\b|प्रकार|उदाहरण|tipos de|ejemplos de|types de|exemples de|arten von|beispiele für)/i,
  ],
  [
    'evaluate',
    /(^\s*(is|are|does|do|can|did|was|were|has|have)\b.*\??$|\b(safe|effective|true|myth|harmful|legit)\b|क्या .* (सच|सुरक्षित|प्रभावी)|¿es (cierto|seguro|verdad)|est-ce (vrai|sûr)|ist es (wahr|sicher)|é (verdade|seguro))/i,
  ],
  [
    'define',
    /(^\s*what (is|are)\b|^\s*how (does|do|did)\b.+\bwork|\bdefin(e|ition)\b|\bmeaning of\b|\bexplain\b|क्या है|म्हणजे काय|qu['’]est-ce que|^\s*qué es|^\s*was ist|^\s*o que é)/i,
  ],
];

export function classifyGoal(goal: string): GoalType {
  const g = goal.trim();
  for (const [type, re] of PATTERNS) if (re.test(g)) return type;
  return 'topic';
}

/** The subject of a goal, without question words and follow-up clauses (English goals). */
export function goalTopic(goal: string): string {
  let t = goal.trim().replace(/[?？؟.!]+$/, '');
  t = t.split(/,?\s+and\s+(what|how|why|which|who|whether)\b/i)[0];
  t = t.replace(
    /^(why|how|what|which|who|when|where|whether|is|are|does|do|did|can|could|should|would|will)\b\s*(is|are|does|do|did|can|could|should|would|will|has|have|to|i|we)?\b\s*/i,
    '',
  );
  return t.trim() || goal.trim();
}

// --- Rules-based fallback ------------------------------------------------------

type Facet = [question: string, extraTerms: string[], search1: string, search2: string];

const EN_FACETS: Record<GoalType, Facet[]> = {
  debug: [
    ['What does this error actually mean?', ['error', 'meaning'], '{k}', '{k} meaning'],
    ['What usually causes it?', ['cause', 'reason'], '{k} cause', 'why {k}'],
    ['Which versions, settings or environments trigger it?', ['version', 'config'], '{k} version', '{k} configuration'],
    ['What fixes have worked for others?', ['fix', 'solution'], '{k} fix', '{k} solved'],
    ['Are there workarounds if the fix is not possible?', ['workaround'], '{k} workaround', '{k} alternative'],
    ['How can I confirm the problem is fixed?', ['test', 'verify'], '{k} test', 'verify {k} fixed'],
  ],
  compare: [
    ['What exactly are the options being compared in {t}?', ['overview'], '{k} overview', '{k} explained'],
    ['Which criteria matter most when comparing {t}?', ['criteria', 'factors'], '{k} comparison criteria', '{k} key differences'],
    ['What does the evidence say on performance or quality?', ['benchmark', 'evidence'], '{k} benchmark', '{k} study results'],
    ['How do costs and trade-offs differ?', ['cost', 'trade-off'], '{k} cost', '{k} pros cons'],
    ['Which option fits which situation?', ['use case'], '{k} use cases', 'when to use {k}'],
    ['What do experts and experienced users conclude?', ['review', 'expert'], '{k} review', '{k} expert opinion'],
  ],
  decide: [
    ['What are the realistic options for {t}?', ['options'], '{k} options', '{k} alternatives'],
    ['Which criteria should drive the choice?', ['criteria'], 'how to choose {k}', '{k} buying guide'],
    ['What do reviews and evidence say about each option?', ['review', 'evidence'], '{k} reviews', '{k} comparison'],
    ['What are the costs and risks?', ['cost', 'risk'], '{k} cost', '{k} problems'],
    ['What do experts recommend for my situation?', ['recommendation'], 'best {k}', '{k} recommendation'],
    ['What do people regret or wish they had known?', ['regret', 'mistakes'], '{k} mistakes to avoid', '{k} regret'],
  ],
  howto: [
    ['What do I need before starting {t}?', ['prerequisites', 'requirements'], '{k} requirements', '{k} before you start'],
    ['What are the steps, in order?', ['steps'], '{k} step by step', 'how to {k}'],
    ['Which tools or resources help most?', ['tools'], '{k} tools', '{k} resources'],
    ['What are the common mistakes?', ['mistakes'], '{k} common mistakes', '{k} tips'],
    ['Where is a good worked example?', ['example'], '{k} example', '{k} tutorial'],
    ['How do I check that it worked?', ['check', 'result'], '{k} check results', '{k} troubleshooting'],
  ],
  why: [
    ['What is the background of {t}?', ['background', 'history'], '{k} background', '{k} explained'],
    ['What are the main causes?', ['causes', 'factors'], '{k} causes', 'why {k}'],
    ['How does it happen, step by step?', ['mechanism', 'process'], 'how {k} happens', '{k} mechanism'],
    ['What data and evidence support each explanation?', ['data', 'study'], '{k} data', '{k} study'],
    ['What are the consequences, and who is affected?', ['impact', 'affected'], '{k} impact', '{k} effects'],
    ['What would fix or change it?', ['solutions', 'policy'], '{k} solutions', 'how to fix {k}'],
  ],
  evaluate: [
    ['What exactly does the claim say: {t}?', ['claim'], '{k}', '{k} claim'],
    ['What evidence supports it?', ['evidence', 'study'], '{k} evidence', '{k} study'],
    ['What evidence goes against it?', ['criticism', 'debunk'], '{k} myth', '{k} criticism'],
    ['What is the expert or scientific consensus?', ['consensus', 'experts'], '{k} expert consensus', '{k} review'],
    ['What are the risks or side effects?', ['risk'], '{k} risks', '{k} side effects'],
    ['When does the answer change (context, dose, place)?', ['context'], '{k} depends', '{k} exceptions'],
  ],
  event: [
    ['What happened, in order: {t}?', ['timeline'], '{k} timeline', '{k} what happened'],
    ['What caused it?', ['causes'], '{k} causes', 'why {k}'],
    ['Who was involved and responsible?', ['people', 'organisations'], '{k} who', '{k} responsibility'],
    ['What were the impacts?', ['impact', 'damage'], '{k} impact', '{k} damage'],
    ['How did authorities and people respond?', ['response'], '{k} response', '{k} relief'],
    ['What changed afterwards?', ['lessons', 'aftermath'], '{k} aftermath', '{k} lessons learned'],
  ],
  define: [
    ['What is {t}, in plain words?', ['definition'], 'what is {k}', '{k} definition'],
    ['How does it work?', ['how it works'], 'how {k} works', '{k} explained'],
    ['Where did it come from?', ['history', 'origin'], '{k} history', '{k} origin'],
    ['What are good examples?', ['examples'], '{k} examples', '{k} case study'],
    ['What is it used for?', ['applications'], '{k} applications', '{k} uses'],
    ['What are its limits and criticisms?', ['limitations'], '{k} limitations', '{k} criticism'],
  ],
  future: [
    ['What is the current state of {t}?', ['current state'], '{k} today', '{k} current status'],
    ['What is driving change?', ['drivers', 'trends'], '{k} trends', '{k} drivers'],
    ['What do forecasts predict?', ['forecast'], '{k} forecast', '{k} prediction'],
    ['What are the possible scenarios?', ['scenarios'], '{k} scenarios', '{k} outlook'],
    ['What are the main risks and uncertainties?', ['risks'], '{k} risks', '{k} challenges'],
    ['What do experts expect?', ['experts'], '{k} expert view', '{k} future'],
  ],
  list: [
    ['What are the main categories of {t}?', ['types', 'categories'], 'types of {k}', '{k} categories'],
    ['What are notable examples of each?', ['examples'], '{k} examples', 'best {k}'],
    ['How do they differ?', ['differences'], '{k} differences', '{k} comparison'],
    ['How should I choose between them?', ['choose'], 'how to choose {k}', '{k} guide'],
    ['Which sources compare them well?', ['review'], '{k} review', '{k} overview'],
  ],
  topic: [
    ['What is the big picture of {t}?', ['overview'], '{k} overview', '{k} explained'],
    ['What are the key concepts and terms?', ['concepts'], '{k} key concepts', '{k} basics'],
    ['What is the current situation?', ['current'], '{k} latest', '{k} current situation'],
    ['What data and evidence exist?', ['data', 'evidence'], '{k} statistics', '{k} research'],
    ['What are the main debates?', ['debate'], '{k} debate', '{k} criticism'],
    ['What are the open problems or next steps?', ['challenges'], '{k} challenges', '{k} future'],
  ],
};

// Generic facets for languages without a model. `{t}` is the goal itself.
const LOCAL_FACETS: Record<string, Facet[]> = {
  hi: [
    ['{t} — पृष्ठभूमि और वर्तमान स्थिति क्या है?', ['पृष्ठभूमि'], '{k}', '{k} जानकारी'],
    ['इसके मुख्य कारण क्या हैं?', ['कारण'], '{k} कारण', '{k} क्यों'],
    ['इस पर कौन-से आँकड़े और प्रमाण उपलब्ध हैं?', ['आँकड़े', 'अध्ययन'], '{k} आँकड़े', '{k} रिपोर्ट'],
    ['इसका किस पर और कैसा प्रभाव पड़ता है?', ['प्रभाव'], '{k} प्रभाव', '{k} असर'],
    ['कौन-से समाधान सुझाए या आज़माए गए हैं?', ['समाधान'], '{k} समाधान', '{k} उपाय'],
    ['विशेषज्ञ किन बातों पर असहमत हैं?', ['विशेषज्ञ', 'बहस'], '{k} विशेषज्ञ राय', '{k} बहस'],
  ],
  mr: [
    ['{t} — पार्श्वभूमी आणि सद्यस्थिती काय आहे?', ['पार्श्वभूमी'], '{k}', '{k} माहिती'],
    ['याची मुख्य कारणे कोणती आहेत?', ['कारणे'], '{k} कारणे', '{k} का'],
    ['यावर कोणती आकडेवारी आणि पुरावे उपलब्ध आहेत?', ['आकडेवारी', 'अभ्यास'], '{k} आकडेवारी', '{k} अहवाल'],
    ['याचा कोणावर आणि कसा परिणाम होतो?', ['परिणाम'], '{k} परिणाम', '{k} प्रभाव'],
    ['कोणते उपाय सुचवले किंवा वापरले गेले आहेत?', ['उपाय'], '{k} उपाय', '{k} उपाययोजना'],
    ['तज्ज्ञ कोणत्या मुद्द्यांवर असहमत आहेत?', ['तज्ज्ञ'], '{k} तज्ज्ञ मत', '{k} वाद'],
  ],
  es: [
    ['¿Cuál es el contexto y la situación actual de {t}?', ['contexto'], '{k}', '{k} explicación'],
    ['¿Cuáles son las causas principales?', ['causas'], '{k} causas', 'por qué {k}'],
    ['¿Qué datos y evidencias existen?', ['datos', 'estudio'], '{k} datos', '{k} estudio'],
    ['¿A quién afecta y cómo?', ['impacto'], '{k} impacto', '{k} efectos'],
    ['¿Qué soluciones se han propuesto o probado?', ['soluciones'], '{k} soluciones', '{k} medidas'],
    ['¿En qué no están de acuerdo los expertos?', ['expertos', 'debate'], '{k} debate', '{k} opinión expertos'],
  ],
  fr: [
    ['Quel est le contexte et la situation actuelle de {t} ?', ['contexte'], '{k}', '{k} explication'],
    ['Quelles en sont les causes principales ?', ['causes'], '{k} causes', 'pourquoi {k}'],
    ['Quelles données et preuves existent ?', ['données', 'étude'], '{k} données', '{k} étude'],
    ['Qui est touché, et comment ?', ['impact'], '{k} impact', '{k} conséquences'],
    ['Quelles solutions ont été proposées ou essayées ?', ['solutions'], '{k} solutions', '{k} mesures'],
    ['Sur quoi les experts sont-ils en désaccord ?', ['experts', 'débat'], '{k} débat', '{k} avis experts'],
  ],
  de: [
    ['Was ist der Hintergrund und die aktuelle Lage bei {t}?', ['Hintergrund'], '{k}', '{k} erklärt'],
    ['Was sind die Hauptursachen?', ['Ursachen'], '{k} Ursachen', 'warum {k}'],
    ['Welche Daten und Belege gibt es?', ['Daten', 'Studie'], '{k} Daten', '{k} Studie'],
    ['Wer ist betroffen, und wie?', ['Auswirkungen'], '{k} Auswirkungen', '{k} Folgen'],
    ['Welche Lösungen wurden vorgeschlagen oder erprobt?', ['Lösungen'], '{k} Lösungen', '{k} Maßnahmen'],
    ['Worüber sind sich Fachleute uneinig?', ['Experten', 'Debatte'], '{k} Debatte', '{k} Expertenmeinung'],
  ],
  pt: [
    ['Qual é o contexto e a situação atual de {t}?', ['contexto'], '{k}', '{k} explicação'],
    ['Quais são as principais causas?', ['causas'], '{k} causas', 'por que {k}'],
    ['Que dados e evidências existem?', ['dados', 'estudo'], '{k} dados', '{k} estudo'],
    ['Quem é afetado, e como?', ['impacto'], '{k} impacto', '{k} efeitos'],
    ['Que soluções foram propostas ou testadas?', ['soluções'], '{k} soluções', '{k} medidas'],
    ['Em que os especialistas discordam?', ['especialistas', 'debate'], '{k} debate', '{k} opinião especialistas'],
  ],
};

function coreKeywords(goal: string, type: GoalType): string {
  if (type === 'debug') {
    // Keep the error text itself: it is the best search there is.
    const line = goal.split('\n').find((l) => /error|exception|failed|cannot|not/i.test(l)) ?? goal;
    return line.replace(/\s+/g, ' ').trim().slice(0, 90);
  }
  const terms = keyTerms(goal, 4);
  return (terms.length ? terms : words(goal).slice(0, 5)).join(' ');
}

/** Offline fallback: an editable route shaped by the kind of goal and its language. */
export function rulesRoute(goal: string, lang = detectLanguage(goal), type = classifyGoal(goal)): DraftQuestion[] {
  const local = LOCAL_FACETS[lang.code];
  const facets = local ?? EN_FACETS[type];
  const topic = local ? goal.trim().replace(/[?？؟.!]+$/, '') : goalTopic(goal);
  const k = coreKeywords(goal, type);
  const fill = (s: string) => s.replace('{t}', topic).replace('{k}', k).replace(/\s+/g, ' ').trim();
  const goalTerms = keyTerms(goal, 3);
  return facets.map(([text, extra, s1, s2]) => ({
    text: fill(text),
    keyTerms: [...new Set([...goalTerms.slice(0, 2), ...extra].map((t) => t.toLowerCase()))].slice(0, 5),
    searches: [fill(s1), fill(s2)],
  }));
}

export async function draftRoute(goal: string, llm: <T>(req: JsonRequest) => Promise<T | null>): Promise<RouteDraft> {
  const language = detectLanguage(goal);
  const goalType = classifyGoal(goal);
  const fromModel = cleanDraft(await llm<{ questions: DraftQuestion[] }>(routeRequest(goal, language, goalType)));
  if (fromModel.length >= 3) return { questions: fromModel, source: 'model', goalType, language };
  return { questions: rulesRoute(goal, language, goalType), source: 'rules', goalType, language };
}
