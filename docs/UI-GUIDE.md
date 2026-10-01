# UI and UX guide

A map of the interface for whoever redesigns it: where each screen lives, how data reaches it, the design tokens, and the few rules a redesign has to keep. Set up first with [SETUP-MAC.md](SETUP-MAC.md), then work in the playground (`npm run ui`).

## The two surfaces

**Side panel** (`src/ui/sidepanel/`): the main product, about 360–420 px wide, docked beside the page. Users spend most of their time here.

**Map** (`src/ui/map/`): a full browser tab with the research drawn as a canvas. Used to see the whole picture, search, replay and export.

### Screens and the files that draw them

| What you see                                                                                   | File                                                  |
| ---------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Panel shell, which screen is showing                                                           | `sidepanel/App.tsx`                                   |
| Logo, AI status chip, workspace menu, Recording switch, teammates online                       | `sidepanel/Header.tsx`                                |
| "Where are you headed?", examples, drafting, route editor, Explore mode, joining a teammate    | `sidepanel/GoalSetup.tsx`                             |
| Destination, coverage strip, Next stop, proposal cards, questions, parking lot, footer buttons | `sidepanel/RouteView.tsx`                             |
| One question: status, claim, conflict box, its pages, prepared searches                        | `sidepanel/QuestionCard.tsx`                          |
| Research together: share, invite code, who is online, leave                                    | `sidepanel/TeamCard.tsx`                              |
| Research brief and exports                                                                     | `sidepanel/BriefView.tsx`                             |
| Settings: local AI, models, this research, team, privacy, shortcuts                            | `sidepanel/SettingsView.tsx`                          |
| One page row: favicon, title, reason, Keep / Move / Not this, finder avatar                    | `components/PageRow.tsx`                              |
| Icons (hand-drawn 24 px stroke set)                                                            | `components/Icon.tsx`                                 |
| Status pill, favicon, spinner, switch, empty state                                             | `components/common.tsx`                               |
| Teammate avatars                                                                               | `components/Avatar.tsx`                               |
| Brief preview (safe Markdown subset)                                                           | `components/Markdown.tsx`                             |
| Map page: toolbar, search, canvas, toggles, replay, outline                                    | `map/MapApp.tsx`                                      |
| Map cards: goal, question, page, search, note, parking lot                                     | `map/nodes.tsx`                                       |
| Where cards go on the map                                                                      | `../core/layout.ts`                                   |
| Map lines and which ones are dashed                                                            | `map/graph.ts`, `map/FloatingEdge.tsx`, `map/map.css` |
| Details drawer: "Why is this here?", summary, highlights, notes, tags, links                   | `map/Drawer.tsx`                                      |

Styles: `styles/base.css` (tokens, buttons, inputs, pills), `sidepanel/sidepanel.css` (panel), `map/map.css` (map; it also imports the panel styles).

## How data reaches the UI

- **Reading:** hooks in `src/ui/hooks.ts`. `useWorkspace(id)` is a live IndexedDB query, so screens re-render by themselves when the service worker files a page or a teammate's change arrives. Nothing needs manual refreshing.
- **Changing things:** functions in `src/core/actions.ts` (`moveNode`, `acceptAttachment`, `updateQuestion`, `claimQuestion`, `shareWorkspace`…). Call these rather than writing to the database directly; they record the rules the engine must respect.
- **Browser side effects** (open a tab, run a prepared search, hibernate): `sendToBackground({ type: … })` from `src/core/messages.ts`. In the playground these show a short message instead.
- **Settings:** `useSettings()` and `updateSettings()`.

## Design tokens

All colours, radii and shadows are CSS variables in `src/ui/styles/base.css`, with a light set and a dark set. Change them there and both surfaces follow. The playground's **Theme** switch forces either set; in the extension, the theme follows the system.

| Token                                                  | Use                                                            |
| ------------------------------------------------------ | -------------------------------------------------------------- |
| `--bg`, `--surface`, `--surface-2`, `--surface-3`      | Page background, cards, inset areas, deepest inset             |
| `--ink`, `--ink-2`, `--ink-3`                          | Text: primary, secondary, hints                                |
| `--border`, `--border-strong`                          | Hairlines, and borders that need to be visible                 |
| `--brand`, `--brand-soft`                              | The logo's red: primary calls to action, focus ring, recording |
| `--primary`                                            | Neutral strong buttons (ink on cream)                          |
| `--gap`, `--thin`, `--covered`, `--conflict` (+ `-bg`) | Coverage states. **Keep their meaning** (see below)            |

The brand mark is generated by `scripts/make-logo.mjs`, and icons by `npm run icons`. The original logo artwork is `docs/assets/logo.jpg`.

## Rules a redesign must keep

1. **Coverage colours mean something.** Gap = red, thin = amber, covered = green, conflict = violet, everywhere: pills, coverage strip, question numbers, map borders and minimap. The demo's key moment is a red question turning green.
2. **Dashed means unconfirmed.** A page filed by the engine (`attach.state === 'suggested'`) is drawn dashed until the user keeps it; firm filings (prepared search, user decision) are solid. The same goes for map lines.
3. **Every filing explains itself.** The reason line ("Answers Q3 · opened from your search …") must stay visible on page rows and in the drawer: it is the product's main promise.
4. **The user is in charge.** Keep, Move and "Not this" must stay one tap away from every filed page.
5. **Any language, any direction.** Put `dir="auto"` on every element that shows user or page text (goals, questions, titles, notes, highlights). Check the Hindi and Arabic sample research in the playground after layout changes.
6. **Privacy is visible.** The Recording switch and its state must always be in the header. Never start recording without the user turning it on or clicking _Start route & record_.
7. **Accessibility.** Icon-only buttons need an `aria-label`; switches use `role="switch"` with `aria-checked`; keep the focus ring (`:focus-visible`); keep text contrast at 4.5:1 in both themes; motion respects `prefers-reduced-motion`.
8. **Panel width.** The panel must work from 320 to 560 px with no horizontal scrolling. The playground's **Panel** menu tests this.

## Labels the automated tests rely on

The end-to-end tests (`tests/e2e/`) find controls by their visible names. If you rename one, update the tests in the same change.

| Kind        | Names                                                                                                                                                                                                                                        |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Buttons     | Draft my route · Start route (& record) · Research together · Share live & copy invite · Join · Claim · Brief · Write brief · Back · Hibernate · Restore tabs · Outline                                                                      |
| Other roles | heading _Where are you headed?_ · combobox _Workspace_ · switch _Record browsing_ · textbox _Invite code_                                                                                                                                    |
| Text        | _Drafted offline_ · _Live_ · _2 online_ · _… is on it_                                                                                                                                                                                       |
| CSS hooks   | `#goal`, `.draft-q`, `.qcard`, `#q-<question id>`, `.search-chip`, `.goal`, `.team`, `.team-details`, `.markdown`, `.drawer`, `.search-results`, `.react-flow__node-page`, `.react-flow__node-question`, placeholder starting _Search pages_ |

## Adding a state to the playground

Sample research lives in `src/playground/sample.ts`. Add a question or page there (copy an existing `page(...)` call), click **Reset sample data**, and it appears. Keep sample sites on `.example` domains.

## Known rough edges worth designing for

- **First run.** There is no onboarding yet; the goal screen is the first thing people see.
- **Big maps.** Past about 60 pages the radial map gets dense. Collapsing questions, or a focus mode showing one question and its neighbours, would help.
- **Empty and loading states.** These are minimal: drafting a route, matching a page and joining a team each show a spinner or nothing.
- **UI strings are English.** Generated content (routes, summaries, briefs) follows the user's language, but buttons and labels don't yet.
- **Conflicts.** The conflict box is functional but plain; side-by-side comparison opens two windows.
- **Team.** Presence shows who is online but not what they're doing; claims are the only coordination signal.

## Before opening a pull request

```bash
npm run format && npm run typecheck && npm test && npm run build
```

```bash
npm run test:e2e
```

Then check in the playground:

- Both themes.
- Panel widths 320 and 480.
- The Hindi and Arabic research.
- **Team** set to _Not shared_.
- **Local AI** turned off.
