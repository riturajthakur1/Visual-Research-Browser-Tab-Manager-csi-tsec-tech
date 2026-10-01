<p align="center"><img src="docs/assets/logo.jpg" width="320" alt="Thread.io logo"></p>

<h1 align="center">Thread.io</h1>

<p align="center"><b>A research GPS for your browser.</b><br>
Set the question you need answered, browse normally, and every tab files itself under the sub-question it answers.<br>
The map shows what's covered, what conflicts and what's still missing. Everything runs on your machine.</p>

---

## Why

Research means 40 tabs and no memory of why half of them are open. Browsers now summarise or chat about tabs, but nothing shows the _shape_ of your research: which questions are answered, which sources disagree, and what is still missing.

> Most tools organise the tabs you've opened. Thread.io shows you the questions you haven't answered yet.

## What it does

|                              |                                                                                                                                                                |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Destination → route**      | Type a goal in any language. A local model drafts 5–8 sub-questions, each with key terms and two prepared searches. Edit anything; your edits are kept.        |
| **Pages file themselves**    | Each page you open is matched to the question it answers, with a reason: _"Answers Q3 · opened from your search “mumbai drain capacity” · mentions drainage"_. |
| **Coverage**                 | Each question is a **gap**, **thin**, **covered** or **conflict** (sources disagree), with a **stale** badge for old sources.                                  |
| **Fill gaps with certainty** | One tap runs a gap's prepared search. Pages you open from it file under that question with no guessing.                                                        |
| **You stay in charge**       | Keep, move or reject any filing. Every decision becomes a rule the engine never breaks.                                                                        |
| **The trail**                | Search → result and page → page links are recorded as you browse and drawn on the map.                                                                         |
| **Map, outline, replay**     | A canvas with question hubs and page cards, full-text search across pages, notes and highlights, and a timeline replay of the session.                         |
| **Cited brief**              | Findings per question, each citing numbered references. References come only from page metadata, never from the model.                                         |
| **Close tabs without fear**  | Hibernate closes a research session's tabs; restore brings them back exactly.                                                                                  |
| **Open export**              | Markdown brief, JSON Canvas for Obsidian, PNG, and a full JSON backup.                                                                                         |

**Any language:** goals, questions, briefs and matching work across languages. A Hindi question matches an English article, and a Marathi page files under a Hindi route. Scripts include Devanagari, Arabic (right to left), CJK and more.

**Private by design:** models run in [Bionic](https://lmstudio.ai) or inside the browser. Nothing leaves the computer. Private windows, sign-in pages, banking, mail and health sites are never recorded. The AI only reads and labels; it never clicks, types or submits.

## Quick start

Requirements: Node 20+, a Chromium browser (Chrome, Edge or Brave), and optionally [Bionic](https://lmstudio.ai) for the best quality.

```bash
npm install
npm run setup     # downloads the offline model and prepares Bionic
npm run build     # outputs the extension to dist/
```

Then load it:

1. Open `chrome://extensions` (or `edge://extensions`, `brave://extensions`).
2. Turn on **Developer mode** and click **Load unpacked**.
3. Choose the `dist` folder.
4. Click the Thread.io toolbar icon to open the side panel.

`npm run setup` runs two steps you can also run on their own:

- `npm run models`: downloads the in-browser multilingual embedding model (`multilingual-e5-small`, 118 MB) and copies the ONNX Runtime WebAssembly into `public/`.
- `npm run bionic`: starts Bionic's local API on `localhost:1234`, downloads **Gemma 4 E2B** and **EmbeddingGemma** if they are missing, and loads Gemma with an 8k context so it fits a 6 GB laptop GPU.

Use `npm run bionic -- --llm qwen/qwen3-vl-4b` to prepare a different chat model. You can also switch models any time in the side panel under **Settings → Local AI**.

## Local AI

Thread.io tries each tier in order and keeps working if one is missing.

| Task                                           | 1st choice                               | Fallback                                            | Last resort         |
| ---------------------------------------------- | ---------------------------------------- | --------------------------------------------------- | ------------------- |
| Route, tie-breaks, summaries, conflicts, brief | Bionic · Gemma 4 E2B                     | Browser's built-in model (Gemini Nano / Phi-4-mini) | Rules and templates |
| Matching pages to questions                    | Bionic · EmbeddingGemma (100+ languages) | In-browser multilingual-e5-small                    | Keyword TF-IDF      |

Everything is configurable in **Settings**: engine, chat model, embedding model, whether the model may "think" first (slower, sometimes better), and the server URL.

## Development

```bash
npm run dev          # rebuilds dist/ on change; reload the extension to pick it up
npm run typecheck
npm test             # unit tests (live Bionic tests run when the server is up)
npm run test:e2e     # builds, then drives the real extension in Chromium
npm run format
```

The end-to-end test loads `dist/` into Chromium and runs the whole loop on an offline copy of the web: draft a route, browse search results, open linked pages, fill a gap, check the map and outline, write the brief, then hibernate and restore. Screenshots land in `test-results/screens/`.

## Project layout

```
public/            manifest, icons; models/ and ort/ are downloaded by `npm run models`
scripts/           model download, Bionic setup, logo and icon generation
src/
  background/      service worker: trail capture, page reading, tabs, job queue
  offscreen/       hosts the in-browser embedding model
  core/            framework-free logic shared by every surface (unit-tested)
    ai/            Bionic, built-in browser AI and embedding clients
    engine/        matching, coverage, routes, conflicts, proposals, replay
    export/        cited brief, JSON Canvas
  ui/
    sidepanel/     the Research GPS panel
    map/           the canvas, drawer, outline and replay
    components/    shared React components
tests/
  unit/            engine tests, including multilingual and live-model checks
  e2e/             Playwright test of the built extension
docs/              architecture notes and the demo script
```

More detail is in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). The pitch and three-minute demo are in [docs/DEMO.md](docs/DEMO.md).

## Team

Built for the CSI TSEC Tech hackathon.
