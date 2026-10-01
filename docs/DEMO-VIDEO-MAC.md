# Recording the demo video on a Mac

A step-by-step guide for someone who has never recorded or edited a screen video. Everything uses apps that come with every Mac: the **Screenshot** tool to record and **iMovie** to edit. Budget about three hours: one to set up and rehearse, one to record, one to edit.

**The rule for this video: every feature and core idea of Thread.io must appear, either on screen or in the narration.** The [feature checklist](#the-feature-checklist) lists all of them, and the [shot list](#the-shot-list) shows where each one goes. Tick them off as you record.

Length: aim for **4–5 minutes**. If the hackathon sets a shorter limit, use the _3-minute cut_ column in the shot list. Shorten what's shown, but keep every checklist item in the narration.

---

## 1. Prepare the Mac (once)

1. **Allow screen recording.** Press <kbd>⌘ ⇧ 5</kbd> once. If macOS asks for permission, open **System Settings → Privacy & Security → Screen & System Audio Recording**, turn on **Screenshot**, and restart it if asked.
2. **Turn on Do Not Disturb** so no notifications appear mid-recording: Control Center (top-right switches icon) → **Focus** → **Do Not Disturb**.
3. **Make the pointer easy to follow:** System Settings → Accessibility → Display → **Pointer size** one step bigger.
4. **Clean the screen:** quit every app you won't show (Slack, Mail, WhatsApp…), hide desktop files (right-click the desktop → **Use Stacks**, or move them into a folder), and plug in the charger.
5. **Use a quiet room.** Earphones with a microphone sound better than the laptop's own mic. Test both (see step 4.3) and keep the better one.

## 2. Prepare Thread.io

Follow [SETUP-MAC.md](SETUP-MAC.md) first. Then:

1. **Two clean Chrome profiles** (needed for the team segment). In Chrome, click your profile picture (top right) → **Add** → _Continue without an account_. Name them **Demo A** and **Demo B**, and pick different colours. Clean profiles have no bookmarks, history or logins to leak on camera.
2. **Load the extension in both profiles:** `chrome://extensions` → Developer mode → Load unpacked → the `dist` folder. Pin the icon in both.
3. **Set names:** in each profile, open the side panel → **Settings → Team**. Use your real first names (for example _Aarav_ in Demo A and _Riya_ in Demo B), each with a different colour.
4. **Start the local AI** about 10 minutes before recording:

   ```bash
   npm run bionic
   ```

   The side panel's chip should show **google/gemma-4-e2b**.

5. **Start the relay** in another Terminal tab:

   ```bash
   npm run collab:server
   ```

   In **Settings → Team → Default relay**, both profiles use `ws://localhost:4545`.

6. **Chrome window:** in Demo A, make the window fill the screen without entering full-screen mode (hold <kbd>⌥</kbd> and click the green button). Set zoom to **125%** (<kbd>⌘ +</kbd>) so text is readable in the video. Hide the bookmarks bar (<kbd>⌘ ⇧ B</kbd>).
7. **Rehearse twice.** Run the whole shot list without recording. Gemma's drafted questions differ slightly each time, so learn which real search results land where. Then delete the rehearsal research (Settings → _Delete this research_) so the recording starts clean.
8. **Prepare a conflict.** The conflict marker only appears when two real sources disagree. While rehearsing, find two articles that give different numbers for the same thing. For example, two reports giving different rainfall totals for 26 July 2005, or different drain capacities. Keep their search phrases ready.
9. **Prepare a highlight sentence** on one article, so you know exactly what to select.

## 3. How to record

Record **one segment per file** (the shot list numbers them). If you stumble, stop and redo just that segment.

1. Press <kbd>⌘ ⇧ 5</kbd>. A toolbar appears at the bottom of the screen.
2. Choose **Record Entire Screen** (the icon of a screen with a circle in its corner).
3. Click **Options**, then choose:
   - **Save to:** Movies.
   - **Microphone:** your earphones or the built-in mic, if you're narrating while recording.
   - **Show Mouse Clicks:** on. Each click then shows a ring.
4. Click **Record**. Wait two seconds, do the segment slowly, wait two seconds.
5. Stop with the **■** button in the menu bar (top right), or <kbd>⌘ ⌃ Esc</kbd>.
6. The file lands in Movies, named _Screen Recording …_. Rename it right away, for example `03-browse.mov`.

**Tips while recording**

- Move the mouse slowly and pause on what you want people to read.
- After clicking something that takes time (drafting a route takes about 10 s), keep still. The wait gets trimmed out in editing.
- Speak as if explaining to a friend, a little slower than normal.
- You can narrate live or record silently and add a voice-over later (section 5). A voice-over is easier: you can watch the clip and redo lines.

## 4. The feature checklist

Every row must be **shown** or **said**. "Segment" refers to the shot list below.

### Core ideas

| #   | Core idea                                                                                                                                                         | Where            | What to say                                                                              |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- | ---------------------------------------------------------------------------------------- |
| C1  | **The problem:** tab overload, and forgetting why each tab is open                                                                                                | Segment 1        | "Research means forty tabs and no memory of why half of them are open."                  |
| C2  | **Research GPS:** organised around your _questions_, and shows what's _missing_                                                                                   | Segments 1, 2, 7 | "Most tools organise what you've found. Thread.io shows what you're still missing."      |
| C3  | **Explainable:** every page says why it's there                                                                                                                   | Segment 3        | "Every page explains itself."                                                            |
| C4  | **You stay in charge:** your corrections become rules                                                                                                             | Segment 4        | "If it's wrong, one tap fixes it, and it never makes that mistake again."                |
| C5  | **Private and local:** AI runs on this laptop; nothing goes to the cloud; private windows and sensitive sites are never recorded; the AI only reads, never clicks | Segments 2, 14   | "All the AI runs on this laptop. Nothing leaves it."                                     |
| C6  | **No new browser:** a Chrome, Edge or Brave extension                                                                                                             | Segment 1        | "It's an extension, not a new browser."                                                  |
| C7  | **Works in any language**                                                                                                                                         | Segment 13       | "Ask in Hindi, and it plans and matches in Hindi, even against English pages."           |
| C8  | **Built and tested:** measured accuracy, automated tests                                                                                                          | Segment 15       | "On our test set it matched 14 of 14 pages to the right question, in English and Hindi." |

### Features

| #   | Feature                                                                                                                           | Where | Show or say                       |
| --- | --------------------------------------------------------------------------------------------------------------------------------- | ----- | --------------------------------- |
| F1  | Type a goal; local AI drafts 5–8 sub-questions with key terms and prepared searches                                               | 2     | Show                              |
| F2  | Edit, reorder or remove questions before starting                                                                                 | 2     | Show (rename one)                 |
| F3  | Recording switch with a visible indicator                                                                                         | 2     | Show                              |
| F4  | Pages file themselves under the right question, with a reason                                                                     | 3     | Show                              |
| F5  | Trail capture: search → result, and "opened from" another page                                                                    | 3, 10 | Show                              |
| F6  | Keep, Move, "Not this"; dashed = suggested, solid = confirmed                                                                     | 4     | Show                              |
| F7  | Off-topic pages go to the parking lot; "File under…"                                                                              | 5     | Show                              |
| F8  | New-question proposal from parked pages                                                                                           | 5     | Say (show if it appears)          |
| F9  | Coverage strip and states: gap, thin, covered, conflict, stale                                                                    | 6     | Show and name each                |
| F10 | Next stop: one tap runs a gap's prepared search, and its pages file with certainty                                                | 7     | Show                              |
| F11 | Highlights as evidence (right-click → _Save to Thread.io as evidence_, or <kbd>⌥ ⇧ H</kbd>); links reopen the page at the passage | 8     | Show                              |
| F12 | Conflict detection, side-by-side comparison, mark resolved                                                                        | 9     | Show                              |
| F13 | Map: question hubs, page cards, trail lines, drag to arrange, notes                                                               | 10    | Show                              |
| F14 | Details drawer: why it's here, summary, notes, tags, connect pages                                                                | 10    | Show                              |
| F15 | Search across pages, notes and highlights (<kbd>⌘ K</kbd>)                                                                        | 10    | Show                              |
| F16 | Outline view                                                                                                                      | 10    | Show briefly                      |
| F17 | Timeline replay of the session                                                                                                    | 10    | Show                              |
| F18 | Cited brief: findings cite sources; references from page details only; open questions listed                                      | 11    | Show                              |
| F19 | Exports: Markdown, JSON Canvas (Obsidian), PNG image, full backup                                                                 | 11    | Show the buttons, say the formats |
| F20 | Hibernate closes the research tabs; restore reopens them                                                                          | 12    | Show                              |
| F21 | Live team research: share, invite code, teammate joins                                                                            | 14    | Show                              |
| F22 | Presence, "found by" avatars, claiming a question                                                                                 | 14    | Show                              |
| F23 | End-to-end encryption: the relay only sees scrambled data                                                                         | 14    | Say                               |
| F24 | Explore mode: no goal yet, and it suggests one after three searches                                                               | 15    | Say                               |
| F25 | Settings: pick the model (Gemma 4 E2B in Bionic), embedding model, "let the model think"                                          | 15    | Show briefly                      |
| F26 | Fallbacks: works with the browser's built-in model, an in-browser model, or no model at all                                       | 15    | Say                               |
| F27 | Prepared-search pages, user filings and teammates' work merge without overwriting each other                                      | 14    | Say                               |

## 5. The shot list

Times are for the full cut; the last column is for a 3-minute limit. Narration is a starting point: say it in your own words.

| #   | Segment                      | On screen                                                                                                                                                                                                                                                                 | Narration                                                                   | Full   | 3-min cut |
| --- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ------ | --------- |
| 1   | **Hook**                     | A browser with many tabs open, then the Thread.io icon                                                                                                                                                                                                                    | C1, C6, C2                                                                  | 0:15   | 0:12      |
| 2   | **Destination**              | Type _Why does Mumbai flood every monsoon, and what would fix it?_ → **Draft my route** → rename one question → **Start route & record** (point at the red Recording indicator)                                                                                           | F1–F3, C5: "drafted by Gemma running locally"                               | 0:30   | 0:20      |
| 3   | **Browse normally**          | Google a phrase from Q1, open two results, middle-click a link inside one. Switch to the panel: pages sit under questions with reasons                                                                                                                                    | F4, F5, C3                                                                  | 0:35   | 0:25      |
| 4   | **You're in charge**         | On a dashed page: **Keep**. On another: **Move** to a different question. Mention "Not this"                                                                                                                                                                              | F6, C4                                                                      | 0:20   | 0:10      |
| 5   | **Parking lot**              | Open an unrelated page (any news site). It parks as off-topic. Use **File under…** on one parked page                                                                                                                                                                     | F7, F8                                                                      | 0:15   | 0:08      |
| 6   | **Coverage**                 | Hover the coverage strip; point at gap, thin, covered, conflict and a stale badge                                                                                                                                                                                         | F9                                                                          | 0:15   | 0:10      |
| 7   | **Fill a gap**               | Click **Next stop**; open a result; the red question turns thin or green                                                                                                                                                                                                  | F10, C2                                                                     | 0:20   | 0:15      |
| 8   | **Highlight**                | Select a sentence → right-click → _Save to Thread.io as evidence_. The question becomes Covered                                                                                                                                                                           | F11                                                                         | 0:15   | 0:10      |
| 9   | **Conflict**                 | Show the prepared disagreeing pair → **Compare side by side**                                                                                                                                                                                                             | F12                                                                         | 0:15   | 0:10      |
| 10  | **Map**                      | **Map** → drag a card, click a page (drawer: why, summary), <kbd>⌘ K</kbd> search, **Outline**, **Replay**                                                                                                                                                                | F13–F17, F5                                                                 | 0:40   | 0:25      |
| 11  | **Brief**                    | **Brief → Write brief**; scroll through findings with [1][2] citations and the References; point at the Markdown, JSON Canvas and Backup buttons                                                                                                                          | F18, F19                                                                    | 0:25   | 0:15      |
| 12  | **Close tabs without fear**  | **Hibernate** (tabs close), then **Restore tabs**                                                                                                                                                                                                                         | F20                                                                         | 0:12   | 0:07      |
| 13  | **Any language**             | In the workspace menu choose **+ New research…**; type a Hindi goal, e.g. _मुंबई में हर मानसून में बाढ़ क्यों आती है?_ → **Draft my route**: the questions come back in Hindi                                                                                             | C7                                                                          | 0:15   | 0:08      |
| 14  | **Research together**        | In Demo A: **Research together → Share live & copy invite**. Switch to Demo B: **+ New research… → Joining a teammate?**, paste, **Join**. Back in A: "2 online". B opens a page; it appears in A with B's avatar. B clicks **Claim** on a gap; A shows "_Riya is on it_" | F21–F23, F27                                                                | 0:40   | 0:20      |
| 15  | **Under the hood and close** | **Settings → Local AI** (model menus, thinking switch), then end on the side panel or the map                                                                                                                                                                             | F24–F26, C5, C8. Close with "Thread.io: close the tabs, keep the thinking." | 0:25   | 0:15      |
|     | **Total**                    |                                                                                                                                                                                                                                                                           |                                                                             | ≈ 4:55 | ≈ 3:00    |

**For the team segment:** put the Demo A and Demo B windows side by side so both show at once. Drag one to the left half and one to the right half of the screen, or hover over the green button and choose **Tile Window to Left of Screen** (on macOS 15: **Move & Resize → Left**).

## 6. Edit in iMovie

iMovie is free in the App Store if it isn't installed.

1. Open iMovie → **Create New → Movie**.
2. **File → Import Media** (<kbd>⌘ I</kbd>), choose all your segment files, then **Import All**.
3. Drag the clips onto the timeline (the bottom strip) in shot-list order.
4. **Trim waiting time:** move the playhead (the vertical line) to where a pause starts and press <kbd>⌘ B</kbd> to split. Do the same where the pause ends, click the piece in between, and press <kbd>Delete</kbd>. Do this for every spinner and long pause.
5. **Chapter titles:** click **Titles** (top of the window), drag a simple style (for example _Standard Lower Third_) over the start of each segment and type the segment name: _Destination_, _Fill a gap_, _Research together_… Viewers then know which feature they're seeing.
6. **Call out key facts** the same way, with short titles over the relevant moment:
   - _Runs 100% on this laptop_
   - _Gemma 4 E2B · EmbeddingGemma_
   - _End-to-end encrypted_
   - _14 / 14 test pages matched correctly_
7. **Voice-over** (if you recorded silently):
   1. Put the playhead at a segment's start.
   2. Click the microphone icon under the preview (or **Window → Record Voiceover**).
   3. Click the red button, speak the narration, and click it again to stop.
   4. Redo any line by deleting its audio clip and recording again.
8. **Background music (optional):** click **Audio & Video → Soundtracks** and drag a calm track under the clips. Select it and lower its volume to about 10% so speech stays clear.
9. **Watch the whole film once** with the [checklist](#4-the-feature-checklist) next to you and tick every C and F row. Add a title or a narration line for anything missing.
10. **Export:**
    1. **File → Share → File…**
    2. Resolution **1080p**, Quality **High**, Compress **Better Quality**.
    3. **Next**, then name it `Thread.io-demo.mp4`.

**Subtitles** help judges watching without sound. iMovie can't make them automatically. Either upload to YouTube as _Unlisted_ (it generates captions you can correct under **Subtitles**), or use the free CapCut desktop app (**Text → Auto captions**).

## 7. Final check before sending

- Every checklist row is shown or said.
- The video is under the hackathon's limit.
- Text is readable when the video plays at normal size.
- No personal information is visible: no email, notifications, other tabs' titles, or real bookmarks.
- Narration is audible over any music.
- It ends with the project name, team names and the GitHub link: `github.com/riturajthakur1/Visual-Research-Browser-Tab-Manager-csi-tsec-tech`.
- After recording, click **Leave shared research** in both profiles, and stop the relay with <kbd>Ctrl C</kbd>.

Share it as a Google Drive link (set to _Anyone with the link can view_) or as an unlisted YouTube video, whichever the hackathon asks for.
