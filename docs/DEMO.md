# Demo and pitch

## One-liners

- _Most tools organise the tabs you've opened. Thread.io shows you the questions you haven't answered yet._
- _Close the tabs. Keep the thinking._
- _Every tab has a reason. Now you can see it._

## Before you go on stage

1. Run `npm run bionic` about 10 minutes before. It loads Gemma 4 E2B with a small context so it stays fast. Check that the side panel's AI chip shows `google/gemma-4-e2b`.
2. Load `dist/` as an unpacked extension in a fresh browser profile, and grant site access when asked.
3. Open the Thread.io side panel and pin it.
4. Rehearse the exact browsing path below twice; Gemma's drafted questions vary slightly between runs.
5. Consider recording a backup video of a clean run in case the venue Wi-Fi or laptop misbehaves.

## Three-minute script

| Time | Beat                    | What to do and say                                                                                                                                                                                                                                             |
| ---- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0:00 | **Hook**                | "Research today is 40 tabs and no memory of why half are open. Most tools organise what you've found. We show you what you're missing."                                                                                                                        |
| 0:15 | **Destination**         | Type _"Why does Mumbai flood every monsoon, and what would fix it?"_ → **Draft my route**. Seven questions appear. Rename one to show it's editable. **Start route & record**.                                                                                 |
| 0:35 | **Browse normally**     | Search _mumbai storm water drains_, open two results, and middle-click a link inside one. Pages snap under their questions with reasons ("opened from your search…"). The coverage strip starts changing colour.                                               |
| 1:15 | **Off-topic stays out** | Open an unrelated page. It lands in the parking lot: "Looks off-topic for this goal".                                                                                                                                                                          |
| 1:30 | **Fill a gap**          | Tap **Next stop** (the red question's prepared search) and open a result. It files instantly ("opened from your prepared search") and the gap closes.                                                                                                          |
| 1:55 | **Conflict**            | Show a question where two sources disagree, then **Compare side by side**. Conflicts come from real sources, so find a pair that disagrees while rehearsing (for example, two articles giving different rainfall figures for 26 July 2005), or skip this beat. |
| 2:10 | **The map**             | Open **Map**: question hubs, pages, "opened from" trail lines. Search a word from inside a page and the camera flies to it. Click **Replay** and the session rebuilds.                                                                                         |
| 2:35 | **Brief**               | **Brief → Write brief**: a cited outline with open questions. Export it to Markdown or JSON Canvas for Obsidian.                                                                                                                                               |
| 2:50 | **Close**               | "Everything you saw ran on this laptop: Gemma 4 and EmbeddingGemma through Bionic, no cloud. It works in Hindi too." Optionally type a Hindi goal to show it.                                                                                                  |

## Questions judges will ask

| Question                                              | Answer                                                                                                                                                                                                                                                                |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Chrome and Edge already group tabs with AI. Why this? | They give flat groups, topic cards or chat. We organise around _your questions_, show what's missing, explain every filing, keep your edits, and export the map.                                                                                                      |
| How accurate is the filing?                           | Trail links (search → result, prepared searches) are facts, not guesses. Semantic filing scored 14/14 on our English + Hindi test set with EmbeddingGemma. Close calls go to a model tie-break, and the rest wait in the parking lot rather than being filed wrongly. |
| What if the AI's sub-questions are wrong?             | They're a draft you edit in seconds; edits are kept on re-draft. Every filing can be moved, and a move becomes a rule.                                                                                                                                                |
| Isn't this just Deep Research?                        | Deep research browses for you and hands over a report you can't easily audit. Here you read and decide, and every claim in the brief points to a page you opened.                                                                                                     |
| Does "covered" mean the answer is right?              | No. Coverage measures breadth, independent sources and disagreement. The judgement stays with the student.                                                                                                                                                            |
| What about privacy?                                   | Models run locally in Bionic or in the browser. Private windows, sign-in pages, mail, banking and health sites are never recorded. The AI only reads; it never clicks or types, so hidden instructions on a page can't make it act.                                   |
| What if there's no GPU or no Bionic?                  | It degrades gracefully: the browser's built-in model or an in-browser multilingual model, then keyword matching and template routes.                                                                                                                                  |
| Other languages?                                      | Goals, routes, matching and briefs work across languages. A Hindi question matches English and Marathi pages.                                                                                                                                                         |
| What if I don't know my goal yet?                     | Explore mode: after three searches it proposes a goal you can accept.                                                                                                                                                                                                 |
| Business model?                                       | Free and local. A Pro tier for sync and shared maps; campus plans for colleges and labs.                                                                                                                                                                              |
