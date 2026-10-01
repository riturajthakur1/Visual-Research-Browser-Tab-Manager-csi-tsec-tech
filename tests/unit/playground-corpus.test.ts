import { describe, expect, test } from 'vitest';
import { draftRoute } from '../../src/core/engine/route';
import { extractArticle, searchCorpus } from '../../src/playground/corpus';

describe('playground sample web', () => {
  test('prepared searches from the template route find the page for their question', async () => {
    const route = await draftRoute('Why does Mumbai flood every monsoon, and what would fix it?', async () => null);
    const top = (q: string) => searchCorpus(q)[0]?.article.url;
    const byTerm = (term: string) => route.questions.find((q) => q.keyTerms.includes(term))!.searches[0];
    expect(top(byTerm('causes'))).toContain('five-causes');
    expect(top(byTerm('data'))).toContain('extreme-rain-days');
    expect(top(byTerm('impact'))).toContain('when-the-trains-stop');
    expect(top(byTerm('solutions'))).toContain('what-would-fix');
  });

  test('Hindi searches find the Hindi page', () => {
    expect(searchCorpus('मुंबई बाढ़ कारण')[0]?.article.lang).toBe('hi');
  });

  test('articles read like extracted pages, with their links', () => {
    const page = extractArticle('https://ward-watch.example/five-causes#:~:text=drainage')!;
    expect(page.text).toContain('storm drain project');
    expect(page.outLinks).toContain('https://city-drains.example/brimstowad');
  });
});
