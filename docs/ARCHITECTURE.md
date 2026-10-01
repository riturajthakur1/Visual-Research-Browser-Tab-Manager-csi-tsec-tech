# Architecture

Thread.io is a Manifest V3 extension with four parts:

| Part               | Runs in            | Job                                                                     |
| ------------------ | ------------------ | ----------------------------------------------------------------------- |
| `src/background`   | Service worker     | Records the trail, reads pages, runs engine jobs, opens and closes tabs |
| `src/offscreen`    | Offscreen document | Hosts the in-browser embedding model (WebAssembly)                      |
| `src/ui/sidepanel` | Side panel         | The Research GPS: goal, route, coverage, filing, brief, settings        |
| `src/ui/map`       | Extension tab      | The canvas, details drawer, outline, search and replay                  |

All of them share `src/core`, which has no framework code and is covered by unit tests. Data lives in IndexedDB (Dexie). The pages read and write it directly, and Dexie's live queries keep every open surface in sync. Messages to the service worker exist only for browser side effects (tabs, windows) and engine runs.

## The loop

```
goal ──▶ route (5–8 sub-questions, key terms, 2 prepared searches each)
           │
browse ──▶ capture ──▶ read page ──▶ match ──▶ summarise ──▶ conflicts ──▶ proposals
           │ trail                     │ reason                                │
           ▼                           ▼                                       ▼
      search → result            "Answers Q3 · opened from          new question from
      page → page                 your search … · mentions …"      3+ parked pages
```

### 1. Capture (`background/capture.ts`)

- `webNavigation.onCommitted` sees every top-level navigation with its transition type (link, typed, form…).
- `webNavigation.onCreatedNavigationTarget` and `tabs.onCreated` record which tab opened which.
- Search results pages (Google, Bing, DuckDuckGo, Brave, Scholar, YouTube and others) become **search** nodes with their query. Everything else becomes a **page** node linked to whatever led there.
- When a page finishes loading, an injected function (`extract.ts`) reads title, description, author, date, canonical URL, outgoing links and the visible text. Hidden elements are skipped so they cannot smuggle instructions to the model.
- A gap's prepared search tags its tab first. Pages opened from it carry the question's id and file with certainty.
- Never captured: private windows, the blocklist (mail, banking, identity, health), and sign-in, checkout or password paths.

### 2. Matching (`core/engine/attach.ts`, `semantic.ts`)

Each page is scored against each question:

```
score = 0.6 × semantic + 0.3 × trail + 0.1 × key terms
```

- **Semantic.** Cosine similarity of embeddings, _centred on the route_: the mean of the question vectors (and the goal) is subtracted before comparing. Without this, a broad question such as "What causes X?" sits close to every on-topic page and swallows them all. With the keyword fallback, IDF over the route does the same job.
- **Relevance gate.** Raw similarity to the route centroid. Off-topic pages (a phone review while researching floods) score near 0 and park unless the trail says otherwise.
- **Trail.** 1.0 for a prepared search; similarity of the search query to the question; 0.8 when opened from a page already filed under that question.
- **Key terms.** Fraction of the question's key terms in the page, with prefix matching (drain ↔ drainage).

A page files when its best score clears a bar that drops as relevance rises (an on-topic page belongs somewhere), _and_ beats the runner-up by a margin. Close calls go to the local model as a tie-break among the top three. If there is no model, or the model says "none", the page parks.

**Stability and control.** An existing filing only moves for a clearly better match. User decisions (`method: 'user'`) are never revisited. "Not this question" adds a rule that the engine never breaks. Suggested filings show dashed until kept.

### 3. Calibration

Per-model constants live in `core/ai/embed.ts`. They were measured on `tests/fixtures/mumbai.json`: English questions, plus a Hindi translation, against English, Hindi and Marathi articles and two off-topic pages.

| Model                              | Accuracy (en + hi questions) | On-topic relevance | Off-topic   |
| ---------------------------------- | ---------------------------- | ------------------ | ----------- |
| EmbeddingGemma 300M (Bionic)       | 14 / 14                      | 0.34 – 0.70        | 0.00 – 0.10 |
| multilingual-e5-small (in browser) | 11 / 14                      | 0.83 – 0.93        | 0.75 – 0.80 |
| nomic-embed-text v1.5              | 6 / 14 (English-only)        | —                  | —           |

`tests/unit/bionic.live.test.ts` re-checks this against a running Bionic.

### 4. Coverage (`core/engine/coverage.ts`)

- **Gap:** no sources.
- **Thin:** one source, or every source from the same site (counted by registrable domain, so `mcgm.gov.in` and `imd.gov.in` are different sites).
- **Covered:** two or more independent sites, plus a highlight if the workspace requires one.
- **Conflict:** the model compared the sources' summaries and highlights and found incompatible claims. The check re-runs whenever the set of sources changes.
- **Stale:** the newest source is older than the workspace's limit.

### 5. Local models (`core/ai`)

- `bionic.ts`: OpenAI-compatible client for Bionic / LM Studio on `localhost:1234`. Every task is a JSON-schema-constrained request. Small reasoning models are told to answer without thinking out loud (a tie-break drops from about 7 s to about 1 s), and malformed JSON gets one cooler retry.
- `builtin.ts`: the browser's Prompt API (Chrome's Gemini Nano, Edge's Phi-4-mini) where available.
- `embed.ts`: embedding providers with an IndexedDB vector cache.
- Every model call is optional. Without one, routes come from templates shaped by goal type and language (`route.ts`), summaries from page metadata, and matching from TF-IDF.

### 6. Any language

- `core/lang.ts` detects the language from script ranges and function words (tested on 15 languages).
- Prompts ask for answers in the user's language. For non-English goals, routes include one native-language and one English search per question.
- The tokenizer keeps combining marks (Devanagari matras, Arabic diacritics) and splits Chinese, Japanese and Thai into character pairs.
- The brief's headings are localised for English, Hindi, Marathi, Spanish, French, German and Portuguese.
- The UI uses `dir="auto"` everywhere user text appears.

### 7. The brief (`core/export/brief.ts`)

References are built only from page metadata. The model drafts one to four findings per question from summaries, highlights and notes, and each finding must cite reference numbers it was given. Uncited findings and invalid numbers are dropped. Without a model, the brief lists summaries and highlights with their citations.

## Data model

| Table        | Holds                                                                                                                                          |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `workspaces` | goal, mode, settings (auto-organise mode, highlight rule, stale limit), proposals, hibernated tabs, viewport                                   |
| `questions`  | text, key terms, prepared searches, order, conflict check, map position                                                                        |
| `nodes`      | pages, searches and notes: metadata, text, summary, provenance (opener, search, question tag), attachment with reason, highlights, notes, tags |
| `links`      | user and AI links between pages (supports, contradicts, related…)                                                                              |
| `rules`      | "never file this page under this question"                                                                                                     |
| `events`     | append-only log used for replay                                                                                                                |
| `vectors`    | embedding cache keyed by model and text hash                                                                                                   |

## Security and privacy

- Site access is an optional permission, requested on first use rather than at install.
- Page text is treated as data: hidden text is stripped, prompts say so, and outputs are schema-constrained.
- The extension never acts on pages; it only reads them.
- Model traffic goes only to `localhost` (Bionic) or stays inside the browser.
