import {
  Background,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  getNodesBounds,
  getViewportForBounds,
  useReactFlow,
  useViewport,
  type Edge,
  type Node,
  type NodeMouseHandler,
  type Viewport,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { toPng } from 'html-to-image';
import MiniSearch from 'minisearch';
import { useLiveQuery } from 'dexie-react-hooks';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { addNote, updateNode, updateWorkspace } from '../../core/actions';
import { db } from '../../core/db';
import { coverageMap } from '../../core/engine/coverage';
import { snapshotAt, timelineBounds } from '../../core/engine/replay';
import { toJsonCanvas } from '../../core/export/jsoncanvas';
import { STATUS_COLOR } from '../../core/layout';
import type { Question, TrailNode } from '../../core/types';
import { Icon } from '../components/Icon';
import { PageRow } from '../components/PageRow';
import { StatusPill } from '../components/common';
import { download, slug, useSettings, useWorkspace } from '../hooks';
import { TeamContext } from '../team-context';
import { Drawer } from './Drawer';
import { FloatingEdge } from './FloatingEdge';
import { buildGraph, type PageData, type QuestionData } from './graph';
import { nodeTypes } from './nodes';

const edgeTypes = { floating: FloatingEdge };
const params = new URLSearchParams(location.search);

export function MapApp() {
  return (
    <ReactFlowProvider>
      <MapScreen />
    </ReactFlowProvider>
  );
}

type Selection = { kind: 'node'; id: string } | { kind: 'question'; id: string } | null;

function MapScreen() {
  const settings = useSettings();
  const wsId = params.get('ws') ?? settings.activeWsId;
  const data = useWorkspace(wsId);
  const events = useLiveQuery(() => (wsId ? db.events.where('wsId').equals(wsId).toArray() : []), [wsId], []);
  const flow = useReactFlow();

  const [view, setView] = useState<'map' | 'outline'>('map');
  const [showSearches, setShowSearches] = useState(false);
  const [showTrail, setShowTrail] = useState(true);
  const [selection, setSelection] = useState<Selection>(
    params.get('focus') ? { kind: 'node', id: params.get('focus')! } : null,
  );
  const [replay, setReplay] = useState<{ t: number; playing: boolean } | null>(null);
  const [query, setQuery] = useState('');
  // Hovering a question (or one of its pages) brings that thread forward and fades the rest.
  const [hoverQ, setHoverQ] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const fitted = useRef(false);

  const ws = data.ws;
  const allQuestions = useMemo(() => data.questions ?? [], [data.questions]);
  const allNodes = useMemo(() => data.nodes ?? [], [data.nodes]);
  const [t0, t1] = useMemo(() => timelineBounds(allQuestions, allNodes, events), [allQuestions, allNodes, events]);

  // Replay rebuilds the map as it was at time t from the event log.
  const shown = useMemo(
    () =>
      replay ? snapshotAt(replay.t, allQuestions, allNodes, events) : { questions: allQuestions, nodes: allNodes },
    [replay, allQuestions, allNodes, events],
  );
  const coverage = useMemo(() => (ws ? coverageMap(shown.questions, shown.nodes, ws) : new Map()), [ws, shown]);
  const graph = useMemo(
    () =>
      ws
        ? buildGraph(ws, shown.questions, shown.nodes, data.links ?? [], coverage, { showSearches, showTrail })
        : { nodes: [], edges: [] },
    [ws, shown, data.links, coverage, showSearches, showTrail],
  );
  const focus = useMemo(() => {
    if (!hoverQ) return null;
    const ids = new Set<string>(['goal', hoverQ]);
    for (const n of shown.nodes) if (n.attach?.questionId === hoverQ) ids.add(n.id);
    return ids;
  }, [hoverQ, shown.nodes]);
  const nodes = useMemo(
    () =>
      graph.nodes.map((n) => ({
        ...n,
        selected: selection?.id === n.id,
        className: [n.className, focus && !focus.has(n.id) ? 'dim' : ''].filter(Boolean).join(' '),
      })),
    [graph.nodes, selection, focus],
  );
  const edges = useMemo<Edge[]>(
    () =>
      focus
        ? graph.edges.map((e) =>
            focus.has(e.source) && focus.has(e.target) ? e : { ...e, className: `${e.className ?? ''} dim` },
          )
        : graph.edges,
    [graph.edges, focus],
  );
  const onNodeMouseEnter: NodeMouseHandler = (_, n) => {
    if (n.type === 'question') setHoverQ(n.id);
    else if (n.type === 'page') setHoverQ((n.data as PageData).node.attach?.questionId ?? null);
  };

  useEffect(() => {
    if (!replay?.playing) return;
    const step = Math.max(1, (t1 - t0) / 160);
    const timer = setInterval(() => {
      setReplay((r) => {
        if (!r) return r;
        const t = r.t + step;
        return t >= t1 ? { t: t1, playing: false } : { ...r, t };
      });
    }, 60);
    return () => clearInterval(timer);
  }, [replay?.playing, t0, t1]);

  // First paint: restore the saved viewport, else fit everything.
  useEffect(() => {
    if (fitted.current || !graph.nodes.length) return;
    fitted.current = true;
    const focus = params.get('focus');
    setTimeout(() => {
      if (focus) focusNode(focus);
      else if (ws?.viewport) void flow.setViewport(ws.viewport);
      else void flow.fitView({ padding: 0.16, maxZoom: 1, duration: 300 });
    }, 50);
  });

  const focusNode = useCallback(
    (id: string) => {
      const n = flow.getNode(id);
      if (!n) return;
      const w = n.measured?.width ?? 240;
      const h = n.measured?.height ?? 80;
      void flow.setCenter(n.position.x + w / 2, n.position.y + h / 2, {
        zoom: Math.max(flow.getZoom(), 1),
        duration: 500,
      });
      setSelection(n.type === 'question' ? { kind: 'question', id } : { kind: 'node', id });
    },
    [flow],
  );

  const index = useMemo(() => {
    const ms = new MiniSearch<{ id: string; title: string; body: string; kind: string }>({
      fields: ['title', 'body'],
      storeFields: ['title', 'kind'],
      searchOptions: { prefix: true, fuzzy: 0.2, boost: { title: 3 } },
      tokenize: (s) => s.toLowerCase().match(/[\p{L}\p{M}\p{N}]+/gu) ?? [],
    });
    ms.addAll([
      ...allQuestions.map((q) => ({ id: q.id, title: q.text, body: q.keyTerms.join(' '), kind: 'question' })),
      ...allNodes.map((n) => ({
        id: n.id,
        title: n.kind === 'search' ? (n.query ?? '') : n.title,
        body: [
          n.url,
          n.summary,
          n.notes,
          n.tags.join(' '),
          n.highlights.map((h) => h.text).join(' '),
          (n.text ?? '').slice(0, 5000),
        ].join(' '),
        kind: n.kind,
      })),
    ]);
    return ms;
  }, [allQuestions, allNodes]);
  const results = useMemo(() => (query.trim() ? index.search(query).slice(0, 8) : []), [index, query]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchRef.current?.focus();
      }
      if (e.key === 'Escape') setSelection(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const onNodeClick: NodeMouseHandler = (_, n) => {
    if (n.type === 'question') setSelection({ kind: 'question', id: n.id });
    else if (n.type === 'page' || n.type === 'search' || n.type === 'note') setSelection({ kind: 'node', id: n.id });
    else setSelection(null);
  };

  const onNodeDragStop = (_: unknown, n: Node) => {
    if (replay) return;
    const pos = { x: Math.round(n.position.x), y: Math.round(n.position.y) };
    if (n.type === 'question') void db.questions.update(n.id, { pos, updatedAt: Date.now() });
    else if (n.type === 'page' || n.type === 'search' || n.type === 'note')
      void updateNode(n.id, { pos, pinned: true });
  };

  const saveViewport = useRef<ReturnType<typeof setTimeout>>(undefined);
  const onMoveEnd = (_: unknown, viewport: Viewport) => {
    if (!ws) return;
    clearTimeout(saveViewport.current);
    saveViewport.current = setTimeout(() => void updateWorkspace(ws.id, { viewport }), 800);
  };

  const exportPng = async () => {
    const el = document.querySelector<HTMLElement>('.react-flow__viewport');
    if (!el || !ws) return;
    const bounds = getNodesBounds(flow.getNodes());
    const width = Math.min(4000, Math.max(1200, bounds.width + 200));
    const height = Math.min(4000, Math.max(800, bounds.height + 200));
    const vp = getViewportForBounds(bounds, width, height, 0.1, 2, 0.08);
    const bg = getComputedStyle(document.body).backgroundColor;
    const url = await toPng(el, {
      backgroundColor: bg,
      width,
      height,
      style: {
        width: `${width}px`,
        height: `${height}px`,
        transform: `translate(${vp.x}px, ${vp.y}px) scale(${vp.zoom})`,
      },
    });
    const a = document.createElement('a');
    a.href = url;
    a.download = `${slug(ws.goal || ws.name)}.png`;
    a.click();
  };

  const selected = useMemo(() => {
    if (!selection) return null;
    if (selection.kind === 'question') {
      const index = allQuestions.findIndex((q) => q.id === selection.id);
      return index >= 0 ? { kind: 'question' as const, q: allQuestions[index], index } : null;
    }
    const node = allNodes.find((n) => n.id === selection.id);
    return node ? { kind: 'node' as const, node } : null;
  }, [selection, allQuestions, allNodes]);

  if (!settings.loaded) return null;
  if (!ws) {
    return (
      <div className="map-empty">
        <img src="icons/icon128.png" width={64} height={64} alt="" />
        <h1>No research yet</h1>
        <p className="muted">Open the Thread.io side panel and set a destination to start a map.</p>
      </div>
    );
  }

  return (
    <TeamContext.Provider value={{ shared: !!ws.collab, meId: settings.profile.id }}>
      <div className="map-shell">
        <header className="map-toolbar">
          <img src="icons/icon32.png" width={22} height={22} alt="" className="logo" />
          <div className="map-title">
            <strong dir="auto" className="truncate">
              {ws.goal || ws.name}
            </strong>
            <span className="hint">
              {allQuestions.length} questions · {allNodes.filter((n) => n.kind === 'page').length} pages
            </span>
          </div>
          <div className="search-box">
            <Icon name="search" size={14} />
            <input
              ref={searchRef}
              dir="auto"
              placeholder="Search pages, notes, highlights… (Ctrl+K)"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && results[0]) {
                  focusNode(results[0].id);
                  setQuery('');
                }
              }}
            />
            {results.length > 0 && (
              <ul className="search-results card">
                {results.map((r) => (
                  <li key={r.id}>
                    <button
                      onClick={() => {
                        setView('map');
                        setTimeout(() => focusNode(r.id), 30);
                        setQuery('');
                      }}
                    >
                      <span className="chip tiny">{r.kind}</span>
                      <span className="truncate" dir="auto">
                        {r.title as string}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="segmented small">
            <button className={view === 'map' ? 'on' : ''} onClick={() => setView('map')}>
              Map
            </button>
            <button className={view === 'outline' ? 'on' : ''} onClick={() => setView('outline')}>
              Outline
            </button>
          </div>
          <button
            className={`btn small ${replay ? 'primary' : ''}`}
            onClick={() => setReplay(replay ? null : { t: t0, playing: true })}
            title="Replay the session"
          >
            <Icon name="history" size={14} /> Replay
          </button>
          <details className="menu">
            <summary className="btn small">
              <Icon name="download" size={14} /> Export
            </summary>
            <div className="menu-list card">
              <button
                onClick={() =>
                  download(
                    `${slug(ws.goal || ws.name)}.canvas`,
                    JSON.stringify(toJsonCanvas(ws, allQuestions, allNodes, data.links ?? []), null, 2),
                    'application/json',
                  )
                }
              >
                <Icon name="layers" size={14} /> JSON Canvas (Obsidian)
              </button>
              <button onClick={() => void exportPng()}>
                <Icon name="file" size={14} /> Image (PNG)
              </button>
            </div>
          </details>
        </header>

        {view === 'map' ? (
          <div className="map-canvas">
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodeMouseEnter={onNodeMouseEnter}
              onNodeMouseLeave={() => setHoverQ(null)}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              onNodeClick={onNodeClick}
              onPaneClick={() => setSelection(null)}
              onNodeDragStop={onNodeDragStop}
              onMoveEnd={onMoveEnd}
              onPaneContextMenu={async (e) => {
                e.preventDefault();
                const text = prompt('New note');
                if (text?.trim())
                  await addNote(ws.id, text.trim(), flow.screenToFlowPosition({ x: e.clientX, y: e.clientY }));
              }}
              minZoom={0.1}
              maxZoom={2.5}
              nodesConnectable={false}
              proOptions={{ hideAttribution: true }}
            >
              <Background gap={24} size={1} />
              <MiniMap
                pannable
                zoomable
                nodeBorderRadius={14}
                maskColor="color-mix(in srgb, var(--bg) 70%, transparent)"
                bgColor="var(--surface)"
                nodeColor={(n) => {
                  if (n.type === 'question') return STATUS_COLOR[(n.data as QuestionData).coverage?.status ?? 'gap'];
                  if (n.type === 'page') {
                    const s = (n.data as PageData).status;
                    return s ? STATUS_COLOR[s] : '#a1a1aa';
                  }
                  return 'transparent';
                }}
              />
            </ReactFlow>
            <MapDock
              showTrail={showTrail}
              setShowTrail={setShowTrail}
              showSearches={showSearches}
              setShowSearches={setShowSearches}
            />
            {replay && (
              <div className="replay card">
                <button
                  className="btn small icon"
                  aria-label={replay.playing ? 'Pause' : 'Play'}
                  onClick={() => setReplay({ t: replay.t >= t1 ? t0 : replay.t, playing: !replay.playing })}
                >
                  <Icon name={replay.playing ? 'pause' : 'play'} size={14} />
                </button>
                <input
                  type="range"
                  min={t0}
                  max={t1}
                  value={replay.t}
                  onChange={(e) => setReplay({ t: Number(e.target.value), playing: false })}
                  aria-label="Session time"
                />
                <span className="hint replay-time">
                  {new Date(replay.t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
                <button className="btn small ghost" onClick={() => setReplay(null)}>
                  Done
                </button>
              </div>
            )}
          </div>
        ) : (
          <Outline questions={allQuestions} nodes={allNodes} coverage={coverage} />
        )}

        {selected && view === 'map' && !replay && (
          <Drawer
            selected={selected}
            questions={allQuestions}
            nodes={allNodes}
            coverage={coverage}
            onClose={() => setSelection(null)}
            onFocus={focusNode}
          />
        )}
      </div>
    </TeamContext.Provider>
  );
}

/** Floating glass dock: what the map shows, and zoom. */
function MapDock({
  showTrail,
  setShowTrail,
  showSearches,
  setShowSearches,
}: {
  showTrail: boolean;
  setShowTrail: (v: boolean) => void;
  showSearches: boolean;
  setShowSearches: (v: boolean) => void;
}) {
  const flow = useReactFlow();
  const { zoom } = useViewport();
  return (
    <div className="map-dock" role="toolbar" aria-label="Map controls">
      <button
        className={`dock-toggle ${showTrail ? 'on' : ''}`}
        aria-pressed={showTrail}
        onClick={() => setShowTrail(!showTrail)}
        title="Show which page opened which"
      >
        Trail links
      </button>
      <button
        className={`dock-toggle ${showSearches ? 'on' : ''}`}
        aria-pressed={showSearches}
        onClick={() => setShowSearches(!showSearches)}
        title="Show the searches pages came from"
      >
        Searches
      </button>
      <span className="dock-sep" />
      <button className="dock-btn" aria-label="Zoom out" onClick={() => void flow.zoomOut({ duration: 250 })}>
        <Icon name="minus" size={14} />
      </button>
      <button className="dock-zoom" title="Reset to 100%" onClick={() => void flow.zoomTo(1, { duration: 300 })}>
        {Math.round(zoom * 100)}%
      </button>
      <button className="dock-btn" aria-label="Zoom in" onClick={() => void flow.zoomIn({ duration: 250 })}>
        <Icon name="plus" size={14} />
      </button>
      <button className="dock-toggle" onClick={() => void flow.fitView({ padding: 0.16, duration: 400 })}>
        Fit
      </button>
      <span className="dock-hint">Right-click to add a note</span>
    </div>
  );
}

function Outline({
  questions,
  nodes,
  coverage,
}: {
  questions: Question[];
  nodes: TrailNode[];
  coverage: ReturnType<typeof coverageMap>;
}) {
  const parked = nodes.filter((n) => n.kind === 'page' && !n.attach?.questionId);
  return (
    <div className="outline">
      {questions.map((q, i) => {
        const c = coverage.get(q.id)!;
        return (
          <section key={q.id} className="outline-q card">
            <div className="row">
              <span className={`qnum ${c.status}`}>Q{i + 1}</span>
              <h3 dir="auto">{q.text}</h3>
              <span className="spacer" />
              <StatusPill status={c.status} stale={c.stale} />
            </div>
            <p className="hint">{c.detail}</p>
            <ul className="page-list">
              {c.sources.map((n) => (
                <PageRow key={n.id} node={n} questions={questions} />
              ))}
            </ul>
          </section>
        );
      })}
      {parked.length > 0 && (
        <section className="outline-q card">
          <h3>Parking lot</h3>
          <ul className="page-list">
            {parked.map((n) => (
              <PageRow key={n.id} node={n} questions={questions} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
