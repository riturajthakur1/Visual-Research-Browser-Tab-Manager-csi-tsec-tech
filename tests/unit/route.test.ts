import { describe, expect, it } from 'vitest';
import {
  classifyGoal,
  cleanDraft,
  draftRoute,
  goalTopic,
  rulesRoute,
  type GoalType,
} from '../../src/core/engine/route';
import { detectLanguage } from '../../src/core/lang';

const cases: [string, GoalType][] = [
  ['Why does Mumbai flood every monsoon, and what would fix it?', 'why'],
  ['What causes inflation in India?', 'why'],
  ['How do I set up a React project with Vite?', 'howto'],
  ['how to make sourdough starter', 'howto'],
  ['React vs Vue for a beginner', 'compare'],
  ['difference between TCP and UDP', 'compare'],
  ['Which laptop should I buy under 60000 rupees?', 'decide'],
  ['best budget phone 2026', 'decide'],
  ['Is intermittent fasting safe for teenagers?', 'evaluate'],
  ['Does homework improve learning?', 'evaluate'],
  ['What happened in the 2005 Mumbai floods?', 'event'],
  ['What is quantum computing?', 'define'],
  ['How does a transformer model work?', 'define'],
  ['future of electric vehicles in India', 'future'],
  ['types of renewable energy', 'list'],
  ["TypeError: Cannot read properties of undefined (reading 'map')", 'debug'],
  ['npm ERR! code ERESOLVE unable to resolve dependency tree', 'debug'],
  ['Mumbai coastal road', 'topic'],
  ['मुंबई में हर मानसून में बाढ़ क्यों आती है?', 'why'],
  ['आईफोन और सैमसंग की तुलना', 'compare'],
  ['¿Por qué sube el precio del aguacate?', 'why'],
  ['Pourquoi le ciel est-il bleu ?', 'why'],
  ['Wie kann ich Deutsch schneller lernen?', 'howto'],
];

describe('classifyGoal', () => {
  it.each(cases)('%s → %s', (goal, type) => expect(classifyGoal(goal)).toBe(type));
});

describe('goalTopic', () => {
  it('strips question words and follow-up clauses', () => {
    expect(goalTopic('Why does Mumbai flood every monsoon, and what would fix it?')).toBe('Mumbai flood every monsoon');
    expect(goalTopic('What is quantum computing?')).toBe('quantum computing');
  });
});

describe('rulesRoute', () => {
  it('drafts six editable questions with two searches each', () => {
    const route = rulesRoute('Why does Mumbai flood every monsoon, and what would fix it?');
    expect(route).toHaveLength(6);
    for (const q of route) {
      expect(q.text.endsWith('?')).toBe(true);
      expect(q.searches).toHaveLength(2);
      expect(q.searches.every((s) => s.length > 2)).toBe(true);
    }
  });

  it('writes Hindi goals in Hindi', () => {
    for (const q of rulesRoute('मुंबई में हर मानसून में बाढ़ क्यों आती है?'))
      expect(detectLanguage(q.text).code).toBe('hi');
  });

  it('writes Marathi goals in Marathi', () => {
    for (const q of rulesRoute('मुंबईत दर पावसाळ्यात पूर का येतो आणि त्यावर उपाय काय आहे?')) {
      expect(detectLanguage(q.text).code).toBe('mr');
    }
  });

  it('writes Spanish goals in Spanish', () => {
    expect(rulesRoute('¿Por qué se inunda Mumbai cada monzón?')[1].text).toMatch(/causas/);
  });

  it('keeps the error text as the search for debugging goals', () => {
    const route = rulesRoute("TypeError: Cannot read properties of undefined (reading 'map')");
    expect(route[0].searches[0]).toContain('Cannot read properties of undefined');
  });

  it('shapes comparisons around criteria', () => {
    expect(rulesRoute('React vs Vue for a beginner').some((q) => /criteria/i.test(q.text))).toBe(true);
  });

  it('survives one-word and punctuation-only goals', () => {
    expect(rulesRoute('floods').length).toBeGreaterThan(3);
    expect(rulesRoute('?').length).toBeGreaterThan(3);
  });

  it('falls back to English facets for languages without templates', () => {
    const route = rulesRoute('なぜムンバイは毎年洪水になるのですか？');
    expect(route.length).toBeGreaterThan(3);
    expect(route[0].text).toContain('ムンバイ');
  });
});

describe('cleanDraft', () => {
  it('dedupes, trims and adds question marks', () => {
    const out = cleanDraft({
      questions: [
        { text: ' What causes it ', keyTerms: ['A', 'a', 'b'], searches: ['"x y"', 'z', 'extra'] },
        { text: 'what causes it', keyTerms: [], searches: [] },
        { text: 'मानसून के कारण क्या हैं।', keyTerms: [], searches: [] },
      ],
    });
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({ text: 'What causes it?', keyTerms: ['a', 'b'], searches: ['x y', 'z'] });
    expect(out[1].text.endsWith('?')).toBe(true);
  });

  it('copes with a null model answer', () => expect(cleanDraft(null)).toEqual([]));
});

describe('draftRoute', () => {
  it('falls back to rules when no model answers', async () => {
    const draft = await draftRoute('What is quantum computing?', async () => null);
    expect(draft.source).toBe('rules');
    expect(draft.goalType).toBe('define');
    expect(draft.questions.length).toBeGreaterThan(4);
  });

  it('uses the model draft and asks for the goal language', async () => {
    let system = '';
    const draft = await draftRoute('मुंबई में बाढ़ क्यों आती है?', async (req) => {
      system = req.system;
      const questions = [1, 2, 3, 4, 5].map((i) => ({
        text: `प्रश्न संख्या ${i}`,
        keyTerms: ['क', 'ख'],
        searches: ['a', 'b'],
      }));
      return { questions } as never;
    });
    expect(draft.source).toBe('model');
    expect(system).toContain('Hindi');
    expect(system).toContain('second in English');
  });
});
