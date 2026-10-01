import { describe, expect, it } from 'vitest';
import { keyTerms, stem, tokens, words } from '../../src/core/text';

describe('words', () => {
  it('drops English stopwords and keeps content words', () => {
    expect(words('Why does Mumbai flood every monsoon?')).toEqual(['mumbai', 'flood', 'monsoon']);
  });

  it('keeps Devanagari vowel signs inside words', () => {
    expect(words('मुंबई में बाढ़ क्यों आती है')).toEqual(['मुंबई', 'बाढ़', 'आती']);
  });

  it('splits Chinese into character pairs', () => {
    expect(words('孟买洪水')).toEqual(['孟买', '买洪', '洪水']);
  });

  it('handles Arabic script', () => {
    expect(words('لماذا تغرق مومباي')).toContain('مومباي');
  });
});

describe('stem', () => {
  it('folds common English inflections', () => {
    expect(stem('flooding')).toBe(stem('floods'));
    expect(stem('flooded')).toBe('flood');
    expect(stem('cities')).toBe('city');
  });

  it('leaves non-Latin words untouched', () => {
    expect(stem('बाढ़ों')).toBe('बाढ़ों');
  });
});

describe('keyTerms', () => {
  it('finds repeated phrases', () => {
    const text = 'Storm drains in Mumbai. The storm drains overflow. Storm drains were built in 1860. Pumping stations help.';
    expect(keyTerms(text, 3)[0]).toBe('storm drains');
  });

  it('works on Hindi text', () => {
    const t = keyTerms('मुंबई की नालियाँ पुरानी हैं। नालियाँ बारिश का पानी नहीं निकाल पातीं। मुंबई में बाढ़ आती है।', 3);
    expect(t).toContain('नालियाँ');
  });
});

describe('tokens', () => {
  it('stems while tokenising', () => {
    expect(tokens('Flooding floods')).toEqual(['flood', 'flood']);
  });
});
