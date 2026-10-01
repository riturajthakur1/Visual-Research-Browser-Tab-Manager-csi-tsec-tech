// The Browse view's simulated browser: tabs, an address bar, a search engine
// over the sample web, and article pages. Every action goes through
// sim-capture.ts, which runs the extension's real capture code.
import { useEffect, useRef, useState, useSyncExternalStore, type MouseEvent } from 'react';
import { parseSearchUrl } from '../core/search-urls';
import { Icon } from '../ui/components/Icon';
import { useSettings } from '../ui/hooks';
import { findArticle, parseBody, searchCorpus } from './corpus';
import {
  activate,
  closeSplit,
  closeTab,
  ensureFirstTab,
  goBack,
  navigate,
  newTab,
  openLinkInNewTab,
  saveSelectionAsEvidence,
  setSelection,
  simBrowser,
  typeInAddressBar,
  type SimTab,
} from './sim-capture';

export function SimBrowser({ onToast }: { onToast: (m: string) => void }) {
  const state = useSyncExternalStore(simBrowser.subscribe, simBrowser.snapshot);
  const settings = useSettings();
  useEffect(ensureFirstTab, []);
  const active = state.tabs.find((t) => t.id === state.activeId);
  const split = state.split?.map((id) => state.tabs.find((t) => t.id === id)).filter(Boolean) as SimTab[] | undefined;

  return (
    <div className="sim" aria-label="Simulated browser">
      <div className="sim-tabs" role="tablist">
        {state.tabs.map((t) => (
          <div
            key={t.id}
            role="tab"
            aria-selected={t.id === state.activeId}
            className={`sim-tab${t.id === state.activeId ? ' on' : ''}`}
            onMouseDown={(e) => e.button === 0 && void activate(t.id)}
            title={t.title}
          >
            <span className={`sim-favicon${t.status === 'loading' ? ' loading' : ''}`} />
            <span className="sim-tab-title">{t.title}</span>
            <button
              className="sim-tab-close"
              aria-label={`Close ${t.title}`}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={() => void closeTab(t.id)}
            >
              <Icon name="x" size={12} />
            </button>
          </div>
        ))}
        <button className="sim-newtab" aria-label="New tab" onClick={newTab}>
          <Icon name="plus" size={14} />
        </button>
      </div>
      {active && <Toolbar tab={active} recording={settings.recording} />}
      <div className={`sim-content${split ? ' split' : ''}`}>
        {split?.length === 2 ? (
          <>
            {split.map((t) => (
              <div className="sim-pane" key={t.id}>
                <div className="sim-pane-bar">{t.title}</div>
                <Page tab={t} onToast={onToast} />
              </div>
            ))}
            <button className="sim-split-close btn small" onClick={closeSplit}>
              Close comparison
            </button>
          </>
        ) : active ? (
          <Page tab={active} onToast={onToast} />
        ) : (
          <div className="sim-empty">No tabs open</div>
        )}
      </div>
    </div>
  );
}

function Toolbar({ tab, recording }: { tab: SimTab; recording: boolean }) {
  const [text, setText] = useState(tab.url);
  useEffect(() => setText(tab.url === 'about:blank' ? '' : tab.url), [tab.url, tab.id]);
  return (
    <div className="sim-toolbar">
      <button aria-label="Back" disabled={tab.index <= 0} onClick={() => void goBack(tab.id, -1)}>
        ←
      </button>
      <button
        aria-label="Forward"
        disabled={tab.index >= tab.history.length - 1}
        onClick={() => void goBack(tab.id, 1)}
      >
        →
      </button>
      <form
        className="sim-address"
        onSubmit={(e) => {
          e.preventDefault();
          void typeInAddressBar(tab.id, text);
        }}
      >
        <input
          aria-label="Address bar"
          value={text}
          placeholder="Search or type a URL"
          onChange={(e) => setText(e.target.value)}
          onFocus={(e) => e.target.select()}
        />
      </form>
      <span
        className={`sim-ext${recording ? ' rec' : ''}`}
        title={recording ? 'Thread.io — recording' : 'Thread.io — paused'}
      >
        <img src="/icons/icon32.png" width={18} height={18} alt="Thread.io" />
        {recording && <span className="sim-badge">REC</span>}
      </span>
    </div>
  );
}

function Page({ tab, onToast }: { tab: SimTab; onToast: (m: string) => void }) {
  if (!tab.url || tab.url === 'about:blank') return <StartPage tab={tab} />;
  if (tab.url.includes('map.html'))
    return (
      <div className="sim-empty">The research map opens here in the extension. Use the playground’s Map view.</div>
    );
  const hit = parseSearchUrl(tab.url);
  if (hit) return <ResultsPage tab={tab} query={hit.query} />;
  const article = findArticle(tab.url);
  if (article) return <ArticlePage tab={tab} onToast={onToast} />;
  return (
    <div className="sim-empty">
      <strong>This site isn’t part of the sample web.</strong>
      <span>The Browse view only has the playground’s sample articles. Try searching instead.</span>
    </div>
  );
}

/** Left click opens in this tab; middle-click or Ctrl/⌘-click opens a background tab. */
function linkHandlers(tab: SimTab, href: string) {
  return {
    href,
    onClick: (e: MouseEvent) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) void openLinkInNewTab(tab.id, href);
      else void navigate(tab.id, href, 'link');
    },
    onAuxClick: (e: MouseEvent) => {
      if (e.button !== 1) return;
      e.preventDefault();
      void openLinkInNewTab(tab.id, href);
    },
  };
}

function SearchBox({ tab, initial = '' }: { tab: SimTab; initial?: string }) {
  const [q, setQ] = useState(initial);
  useEffect(() => setQ(initial), [initial]);
  return (
    <form
      className="sim-searchbox"
      onSubmit={(e) => {
        e.preventDefault();
        void typeInAddressBar(tab.id, q);
      }}
    >
      <Icon name="search" size={16} />
      <input aria-label="Search the sample web" value={q} onChange={(e) => setQ(e.target.value)} />
    </form>
  );
}

function StartPage({ tab }: { tab: SimTab }) {
  return (
    <div className="sim-start">
      <div className="sim-start-logo">Sample web</div>
      <SearchBox tab={tab} />
      <p className="muted">
        A simulated web of sample articles. Searches and pages here are recorded like in the extension.
      </p>
    </div>
  );
}

function ResultsPage({ tab, query }: { tab: SimTab; query: string }) {
  const results = searchCorpus(query);
  return (
    <div className="sim-results">
      <SearchBox tab={tab} initial={query} />
      {results.length === 0 && <p className="muted">No sample pages match “{query}”.</p>}
      <ol>
        {results.map(({ article, snippet }) => (
          <li key={article.url}>
            <div className="sim-result-site">
              <span className="sim-favicon" /> {article.site} · <span className="muted">{article.url}</span>
            </div>
            <a className="sim-result-title" dir="auto" {...linkHandlers(tab, article.url)}>
              {article.title}
            </a>
            <p dir="auto">{snippet}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Reads a `#:~:text=` fragment (whole passage, or "start,end"). */
function fragmentOf(url: string): { start: string; end?: string } | null {
  const m = url.match(/#:~:text=([^&]+)/);
  if (!m) return null;
  const [start, end] = m[1].split(',').map(decodeURIComponent);
  return { start, end };
}

function ArticlePage({ tab, onToast }: { tab: SimTab; onToast: (m: string) => void }) {
  const article = findArticle(tab.url)!;
  const ref = useRef<HTMLElement>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; text: string } | null>(null);
  const fragment = fragmentOf(tab.url);

  useEffect(() => {
    ref.current?.querySelector('mark')?.scrollIntoView({ block: 'center' });
  }, [tab.url]);

  // Shows the browser's context menu entry for the selection.
  const offerSave = (e: MouseEvent) => {
    const sel = window.getSelection();
    const text = sel?.toString().trim() ?? '';
    setSelection(text);
    if (!text || !sel?.rangeCount || !ref.current?.contains(sel.anchorNode)) return setMenu(null);
    e.preventDefault();
    const host = ref.current.getBoundingClientRect();
    setMenu({ x: e.clientX - host.left, y: e.clientY - host.top + ref.current.scrollTop, text });
  };

  const save = async () => {
    if (!menu) return;
    const ok = await saveSelectionAsEvidence(tab.id, menu.text);
    setMenu(null);
    window.getSelection()?.removeAllRanges();
    onToast(ok ? 'Saved to Thread.io as evidence' : 'Already saved, or recording can’t read this page');
  };

  const marked = (plain: string) => {
    if (!fragment) return null;
    const from = plain.indexOf(fragment.start);
    if (from < 0) return null;
    const to = fragment.end ? plain.indexOf(fragment.end, from) + fragment.end.length : from + fragment.start.length;
    if (to <= from) return null;
    return (
      <>
        {plain.slice(0, from)}
        <mark>{plain.slice(from, to)}</mark>
        {plain.slice(to)}
      </>
    );
  };

  return (
    <article
      ref={ref}
      className="sim-article"
      lang={article.lang ?? 'en'}
      dir="auto"
      onContextMenu={offerSave}
      onMouseDown={(e) => e.button === 0 && setMenu(null)}
    >
      <div className="sim-article-site">{article.site}</div>
      <h1>{article.title}</h1>
      <div className="sim-article-meta muted">
        {article.author} · {article.publishedAt}
      </div>
      {article.body.map((p, i) => {
        const parts = parseBody(p);
        const plain = parts.map((x) => x.text).join('');
        return (
          <p key={i}>
            {marked(plain) ??
              parts.map((x, j) =>
                'href' in x ? (
                  <a key={j} {...linkHandlers(tab, x.href)}>
                    {x.text}
                  </a>
                ) : (
                  <span key={j}>{x.text}</span>
                ),
              )}
          </p>
        );
      })}
      {menu && (
        <div className="sim-menu" style={{ left: menu.x, top: menu.y }} role="menu">
          <button role="menuitem" onMouseDown={(e) => e.preventDefault()} onClick={() => void save()}>
            <img src="/icons/icon16.png" width={14} height={14} alt="" /> Save to Thread.io as evidence
          </button>
          <button role="menuitem" disabled>
            Copy
          </button>
        </div>
      )}
    </article>
  );
}
