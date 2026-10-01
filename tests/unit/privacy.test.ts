import { describe, expect, it } from 'vitest';
import { DEFAULT_BLOCKLIST, isBlocked, sanitizeForModel } from '../../src/core/privacy';

describe('isBlocked', () => {
  it.each([
    'https://mail.google.com/mail/u/0/#inbox',
    'https://netbanking.hdfcbank.com/netbanking/',
    'https://accounts.google.com/signin',
    'https://example.com/login?next=/',
    'https://shop.example.com/checkout',
    'chrome://settings',
    'file:///C:/secret.txt',
  ])('blocks %s', (url) => expect(isBlocked(url, DEFAULT_BLOCKLIST)).toBe(true));

  it.each([
    'https://en.wikipedia.org/wiki/Mumbai',
    'https://www.thehindu.com/news/cities/mumbai/',
    'https://arxiv.org/abs/2401.00001',
  ])('allows %s', (url) => expect(isBlocked(url, DEFAULT_BLOCKLIST)).toBe(false));
});

describe('sanitizeForModel', () => {
  it('removes zero-width characters and tags', () => {
    expect(sanitizeForModel('a\u200Bb <span>c</span>')).toBe('ab c');
  });
});
