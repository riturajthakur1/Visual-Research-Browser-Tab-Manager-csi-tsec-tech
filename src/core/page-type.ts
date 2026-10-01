import type { PageType } from './types';
import { hostname } from './util';

const NEWS = /(^|\.)(bbc\.(co\.uk|com)|cnn\.com|nytimes\.com|theguardian\.com|reuters\.com|apnews\.com|aljazeera\.com|thehindu\.com|hindustantimes\.com|indianexpress\.com|timesofindia\.indiatimes\.com|ndtv\.com|livemint\.com|economictimes\.indiatimes\.com|scroll\.in|thewire\.in|theprint\.in|downtoearth\.org\.in|bloomberg\.com|ft\.com|wsj\.com|washingtonpost\.com|npr\.org|forbes\.com|businessinsider\.com|news\.yahoo\.com|mid-day\.com|deccanherald\.com|news18\.com)$/;
const PAPER = /(^|\.)(arxiv\.org|doi\.org|sciencedirect\.com|springer\.com|link\.springer\.com|nature\.com|wiley\.com|tandfonline\.com|ieeexplore\.ieee\.org|dl\.acm\.org|jstor\.org|researchgate\.net|ncbi\.nlm\.nih\.gov|pubmed\.ncbi\.nlm\.nih\.gov|semanticscholar\.org|mdpi\.com|frontiersin\.org|plos\.org|biorxiv\.org|ssrn\.com|scholar\.google\.com|academia\.edu|iopscience\.iop\.org|copernicus\.org)$/;
const QA = /(^|\.)(stackoverflow\.com|stackexchange\.com|superuser\.com|serverfault\.com|askubuntu\.com|quora\.com|reddit\.com|answers\.microsoft\.com)$/;
const VIDEO = /(^|\.)(youtube\.com|youtu\.be|vimeo\.com|ted\.com|dailymotion\.com)$/;
const REFERENCE = /(^|\.)(wikipedia\.org|britannica\.com|investopedia\.com|merriam-webster\.com|dictionary\.com|wikiwand\.com)$/;
const BLOG = /(^|\.)(medium\.com|substack\.com|dev\.to|hashnode\.dev|wordpress\.com|blogspot\.com)$/;
const DATA = /(^|\.)(data\.gov(\.in)?|kaggle\.com|ourworldindata\.org|statista\.com|worldbank\.org|data\.worldbank\.org|imf\.org)$/;
const GOV = /(\.gov(\.[a-z]{2})?|\.gov\.in|\.nic\.in|\.govt\.nz|\.gouv\.fr|\.europa\.eu|\.int|un\.org|who\.int)$/;

/** Fast, offline page-type guess from the URL and a few metadata hints. */
export function guessPageType(url: string, hints: { ogType?: string; title?: string } = {}): PageType {
  const host = hostname(url);
  let path = '';
  try {
    path = new URL(url).pathname.toLowerCase();
  } catch {
    /* keep empty */
  }
  if (path.endsWith('.pdf')) return 'paper';
  if (VIDEO.test(host)) return 'video';
  if (QA.test(host)) return 'qa';
  if (PAPER.test(host)) return 'paper';
  if (REFERENCE.test(host)) return 'reference';
  if (DATA.test(host) || /\/(dataset|datasets|data)\//.test(path)) return 'data';
  if (GOV.test(host)) return 'government';
  if (NEWS.test(host) || hints.ogType === 'article' && /\/(news|20\d\d)\//.test(path)) return 'news';
  if (/^(docs|developer|developers|learn|api)\./.test(host) || /\/(docs|documentation|reference|api)\//.test(path))
    return 'docs';
  if (/(tutorial|how-to|howto|guide|getting-started)/.test(path) || /\b(tutorial|how to|guide)\b/i.test(hints.title ?? ''))
    return 'tutorial';
  if (BLOG.test(host) || /\/(blog|posts?)\//.test(path)) return 'blog';
  if (/\/(product|products|pricing|shop|store)\b/.test(path)) return 'product';
  if (hints.ogType === 'article') return 'news';
  return 'other';
}

export const PAGE_TYPE_LABEL: Record<PageType, string> = {
  docs: 'Docs',
  tutorial: 'Tutorial',
  paper: 'Paper',
  video: 'Video',
  qa: 'Q&A',
  news: 'News',
  reference: 'Reference',
  blog: 'Blog',
  product: 'Product',
  government: 'Government',
  data: 'Data',
  search: 'Search',
  other: 'Web page',
};
