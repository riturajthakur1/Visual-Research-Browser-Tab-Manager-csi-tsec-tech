import { describe, expect, it } from 'vitest';
import { buildSearchUrl, parseSearchUrl } from '../../src/core/search-urls';

describe('parseSearchUrl', () => {
  it.each([
    ['https://www.google.com/search?q=mumbai+floods&oq=mumbai', 'Google', 'mumbai floods'],
    ['https://www.google.co.in/search?q=mithi+river', 'Google', 'mithi river'],
    ['https://www.bing.com/search?q=stormwater+drains', 'Bing', 'stormwater drains'],
    ['https://duckduckgo.com/?q=mangroves+mumbai&ia=web', 'DuckDuckGo', 'mangroves mumbai'],
    ['https://search.brave.com/search?q=sponge+city', 'Brave', 'sponge city'],
    ['https://www.youtube.com/results?search_query=mumbai+rain', 'YouTube', 'mumbai rain'],
    ['https://scholar.google.com/scholar?q=urban+flooding', 'Google Scholar', 'urban flooding'],
    [
      'https://www.google.com/search?q=%E0%A4%AE%E0%A5%81%E0%A4%82%E0%A4%AC%E0%A4%88+%E0%A4%AC%E0%A4%BE%E0%A4%A2%E0%A4%BC',
      'Google',
      'मुंबई बाढ़',
    ],
  ])('%s', (url, engine, query) => {
    expect(parseSearchUrl(url)).toEqual({ engine, query });
  });

  it('ignores pages that are not search results', () => {
    expect(parseSearchUrl('https://www.google.com/maps/place/Mumbai')).toBeNull();
    expect(parseSearchUrl('https://en.wikipedia.org/wiki/2005_Maharashtra_floods')).toBeNull();
    expect(parseSearchUrl('chrome://newtab')).toBeNull();
  });

  it('round-trips with buildSearchUrl', () => {
    expect(parseSearchUrl(buildSearchUrl('bing', 'मुंबई बाढ़ कारण'))?.query).toBe('मुंबई बाढ़ कारण');
  });
});
