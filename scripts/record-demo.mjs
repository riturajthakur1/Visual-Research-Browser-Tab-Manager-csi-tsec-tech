// Records the demo video from the UI playground's Browse view: a headless
// browser with a visible cursor and step captions walks through the demo
// script (docs/DEMO-VIDEO-MAC.md) and saves a .webm.
//
//   npm run demo:record                     # → recordings/thread-io-demo.webm
//   npm run demo:record -- --out my.webm    # another file name
//   npm run demo:record -- --headed         # watch it run
//
// With Bionic running (`npm run bionic`, started with --cors), the drafting,
// summaries and conflict checks use the local model; without it, the video
// shows Thread.io's rules-only fallback and the captions say so.
import { chromium } from '@playwright/test';
import { existsSync, mkdirSync, renameSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const option = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const out = resolve(root, option('out', 'recordings/thread-io-demo.webm'));
const SIZE = { width: 1440, height: 900 };
/** Multiplies every pause; lower it to rehearse quickly. */
const PACE = Number(option('pace', '1'));

const server = await createServer({
  configFile: join(root, 'vite.config.ts'),
  server: { port: 0, open: false },
  logLevel: 'error',
});
await server.listen();
const base = server.resolvedUrls.local[0];

const executablePath = existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;
const browser = await chromium.launch({ headless: !flag('headed'), executablePath });
const videoDir = join(root, 'recordings', '.raw');
mkdirSync(videoDir, { recursive: true });
const context = await browser.newContext({
  viewport: SIZE,
  deviceScaleFactor: 1,
  recordVideo: { dir: videoDir, size: SIZE },
});

// A visible cursor with a ring on every click, and a caption bar. Both ignore the mouse.
await context.addInitScript(() => {
  const install = () => {
    const style = document.createElement('style');
    style.textContent = `
      #__cursor { position: fixed; left: 0; top: 0; z-index: 2147483647; pointer-events: none;
        width: 26px; height: 26px; transform: translate(-100px, -100px); }
      #__cursor svg { filter: drop-shadow(0 1px 2px rgb(0 0 0 / 45%)); }
      .__ring { position: fixed; z-index: 2147483646; pointer-events: none; width: 34px; height: 34px;
        margin: -17px 0 0 -17px; border: 3px solid #c8160c; border-radius: 50%;
        animation: __ring 0.55s ease-out forwards; }
      @keyframes __ring { from { transform: scale(0.3); opacity: 1 } to { transform: scale(1.4); opacity: 0 } }
      #__caption { position: fixed; left: 24px; bottom: 24px; z-index: 2147483645; pointer-events: none;
        max-width: 900px; padding: 14px 18px; border-radius: 12px; background: rgb(23 18 15 / 92%);
        color: #fff8f2; font: 500 17px/1.45 system-ui, sans-serif; box-shadow: 0 10px 30px rgb(0 0 0 / 35%);
        transition: opacity 0.25s; opacity: 0; }
      #__caption.on { opacity: 1; }
      #__caption b { display: block; margin-bottom: 4px; color: #ff8a7a; font-size: 13px;
        letter-spacing: 0.08em; text-transform: uppercase; }`;
    document.head.append(style);
    const cursor = document.createElement('div');
    cursor.id = '__cursor';
    cursor.innerHTML =
      '<svg width="26" height="26" viewBox="0 0 26 26"><path d="M3 2 L3 21 L8 16 L11.5 24 L15 22.5 L11.5 14.8 L18.5 14.8 Z" fill="#fff" stroke="#17120f" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    const caption = document.createElement('div');
    caption.id = '__caption';
    document.body.append(cursor, caption);
    addEventListener(
      'mousemove',
      (e) => (cursor.style.transform = `translate(${e.clientX - 3}px, ${e.clientY - 2}px)`),
      true,
    );
    addEventListener(
      'mousedown',
      (e) => {
        const ring = document.createElement('div');
        ring.className = '__ring';
        ring.style.left = `${e.clientX}px`;
        ring.style.top = `${e.clientY}px`;
        document.body.append(ring);
        setTimeout(() => ring.remove(), 600);
      },
      true,
    );
  };
  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', install);
  else install();
});

const page = await context.newPage();
page.on('pageerror', (e) => console.warn('[page]', e.message));

const wait = (ms) => page.waitForTimeout(ms * PACE);
let mouse = { x: SIZE.width / 2, y: SIZE.height / 2 };

async function caption(title, text, hold = 0) {
  await page.evaluate(
    ([title, text]) => {
      const el = document.getElementById('__caption');
      if (!el) return;
      if (!text) return el.classList.remove('on');
      el.innerHTML = '';
      const b = document.createElement('b');
      b.textContent = title;
      el.append(b, document.createTextNode(text));
      el.classList.add('on');
    },
    [title, text],
  );
  // Long captions stay up long enough to read.
  if (text) await wait(hold || Math.max(2500, text.length * 45));
}
const clearCaption = () => caption('', '');

async function moveTo(x, y) {
  const distance = Math.hypot(x - mouse.x, y - mouse.y);
  const steps = Math.max(8, Math.min(40, Math.round(distance / 18)));
  await page.mouse.move(x, y, { steps });
  mouse = { x, y };
}

async function hover(locator, pause = 500) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  if (!box) throw new Error(`Not visible: ${locator}`);
  await moveTo(box.x + box.width / 2, box.y + box.height / 2);
  await wait(pause);
  return box;
}

async function click(locator, options = {}) {
  await hover(locator, 350);
  await locator.click(options);
  await wait(500);
}

async function type(locator, text, { clear = false } = {}) {
  await click(locator);
  if (clear) await locator.press('ControlOrMeta+a');
  await locator.pressSequentially(text, { delay: 38 });
  await wait(300);
}

/** Waits until the engine has filed `count` pages (or gives up quietly). */
async function settle(ms = 1800) {
  await wait(ms);
}

const panel = page.locator('.pg-panel');
const sim = page.locator('.sim');
const address = sim.getByLabel('Address bar');
const pageRow = (title) => panel.locator('.page-row', { hasText: title });

async function search(query) {
  await type(address, query, { clear: true });
  await address.press('Enter');
  await wait(900);
}

async function openResult(title, options) {
  await click(sim.locator('.sim-result-title', { hasText: title }), options);
  await settle();
}

async function scrollPanelTo(locator) {
  await locator.evaluate((el) => el.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  await wait(700);
}

/** Selects a passage on the article page by dragging across it. */
async function selectPassage(text) {
  const box = await page.evaluate((text) => {
    const article = document.querySelector('.sim-article');
    const walker = document.createTreeWalker(article, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const at = node.textContent.indexOf(text);
      if (at < 0) continue;
      const range = document.createRange();
      range.setStart(node, at);
      range.setEnd(node, at + text.length);
      range.startContainer.parentElement.scrollIntoView({ block: 'center' });
      const rects = [...range.getClientRects()];
      const first = rects[0];
      const last = rects[rects.length - 1];
      return {
        x1: first.left + 1,
        y1: first.top + first.height / 2,
        x2: last.right - 1,
        y2: last.top + last.height / 2,
      };
    }
    return null;
  }, text);
  if (!box) throw new Error(`Passage not found: ${text}`);
  await moveTo(box.x1, box.y1);
  await page.mouse.down();
  await moveTo(box.x2, box.y2);
  await page.mouse.up();
  await wait(500);
  return box;
}

const S = (n, name) => `${n} · ${name}`;

// --- The demo -------------------------------------------------------------------------

await page.goto(`${base}playground.html?view=browse`);
await page.waitForSelector('.sim');
await page.mouse.move(mouse.x, mouse.y);
await wait(1200);
await page.waitForFunction(() => !document.querySelector('.panel-header')?.textContent?.includes('Checking AI'));
const aiChip = (await panel.locator('.panel-header').innerText()).includes('Rules only') ? 'rules' : 'model';

await caption(
  'Thread.io',
  'A research GPS for your browser. This recording runs in the UI playground: a simulated browser that drives the extension’s real capture and research engine.',
);
if (aiChip === 'rules')
  await caption(
    'Heads-up',
    'No local model is connected in this recording, so you’ll see Thread.io’s rules-only fallback. With Bionic running, Gemma 4 E2B and EmbeddingGemma do the same jobs on your laptop.',
  );

// 1 · Hook
await caption(
  S(1, 'The problem'),
  'Research means forty tabs and no memory of why half of them are open. Thread.io is an extension, not a new browser. Most tools organise what you’ve found; Thread.io shows what you’re still missing.',
);

// 2 · Destination
await caption(S(2, 'Destination'), 'Start with the question you need answered.', 2200);
await hover(panel.getByLabel('Workspace'));
await panel.getByLabel('Workspace').selectOption('__new');
await wait(800);
await type(panel.locator('textarea').first(), 'Why does Mumbai flood every monsoon, and what would fix it?');
await click(panel.getByRole('button', { name: /Draft my route/ }));
await wait(1200);
await caption(
  S(2, 'Destination'),
  aiChip === 'rules'
    ? 'Thread.io drafts sub-questions with key terms and prepared searches. No model answered, so this draft comes from templates for a “why” question.'
    : 'Gemma, running locally, drafts sub-questions with key terms and prepared searches.',
);
await caption(S(2, 'Destination'), 'Edit, reorder or remove questions before you start. Let’s make Q3 specific.', 2600);
await type(panel.getByLabel('Question 3'), 'How do the storm drains work, and why do they overflow?', { clear: true });
await click(panel.getByRole('button', { name: /Start route & record/ }));
await wait(800);
await hover(panel.locator('.rec'), 600);
await caption(S(2, 'Destination'), 'Recording is on: the switch and the REC badge on the toolbar icon show it.', 2400);
await hover(sim.locator('.sim-ext'), 1200);
await clearCaption();

// 3 · Browse normally
await caption(S(3, 'Browse normally'), 'Now just browse. Search, open results, follow links.', 2400);
await clearCaption();
await search('mumbai flood causes');
await openResult('Five causes behind');
await caption(S(3, 'Browse normally'), 'Middle-click a link to open it in a background tab, like you always do.', 2600);
await click(sim.locator('.sim-article a', { hasText: 'storm drain project' }), { button: 'middle' });
await settle();
await click(sim.getByLabel('Back'));
await wait(600);
await openResult('26 July 2005 deluge');
await clearCaption();
await scrollPanelTo(panel.locator('.qcard').first());
await caption(
  S(3, 'Every page explains itself'),
  'Each page filed itself under a question, with the reason: which search it came from, which page opened it, and the terms it shares.',
);
await scrollPanelTo(pageRow('Inside BRIMSTOWAD'));
await caption(
  S(3, 'The trail'),
  'The drains article was opened from “Five causes”. Thread.io keeps that trail: search → result, and page → page.',
);

// 4 · You're in charge
const suggested = panel.locator('.page-row.suggested').first();
if (await suggested.count()) {
  await scrollPanelTo(suggested);
  await caption(S(4, 'You stay in charge'), 'Dashed means suggested. Keep confirms it.', 2200);
  await click(suggested.getByRole('button', { name: 'Keep' }));
}
await clearCaption();
await search('why do mumbai storm drains overflow');
await openResult('Audit: most of Mumbai');
const audit = pageRow('Audit: most of Mumbai');
await scrollPanelTo(audit);
const auditInQ3 = await panel
  .locator('.qcard')
  .nth(2)
  .locator('.page-row', { hasText: 'Audit: most of Mumbai' })
  .count();
if (!auditInQ3) {
  await caption(S(4, 'You stay in charge'), 'This audit belongs with the drains question. Move it there.', 2400);
  await click(audit.getByRole('button', { name: /Move|File under/ }));
  const select = audit.getByLabel('File under');
  const value = await select.locator('option', { hasText: 'Q3.' }).getAttribute('value');
  await select.selectOption(value);
  await wait(1200);
} else {
  await caption(S(4, 'You stay in charge'), 'Move files a page under another question.', 2000);
  await hover(audit.getByRole('button', { name: 'Move' }), 900);
}
await caption(
  S(4, 'You stay in charge'),
  '“Not this” sends a page elsewhere and becomes a rule: Thread.io never makes that mistake again. Your choices are never overwritten.',
);
await hover(
  audit
    .getByRole('button', { name: 'Not this' })
    .or(pageRow('Five causes').getByRole('button', { name: 'Not this' }))
    .first(),
  900,
);

// 5 · Parking lot
await clearCaption();
await caption(S(5, 'Parking lot'), 'Wander off-topic, and the page parks instead of cluttering a question.', 2400);
await type(address, 'gadget-reviews.example/pixel-camera-review', { clear: true });
await address.press('Enter');
await settle(2200);
const parked = pageRow('Phone camera review');
await scrollPanelTo(parked);
await hover(parked.getByRole('button', { name: /File under/ }), 900);
await caption(
  S(5, 'Parking lot'),
  '“File under…” puts a parked page on the route. When three or more parked pages share a theme, Thread.io proposes a new question.',
);

// 6 · Coverage
await scrollPanelTo(panel.locator('.coverage'));
await caption(S(6, 'Coverage'), 'The coverage strip shows every question at a glance.', 2000);
for (const seg of await panel.locator('.coverage .seg').all()) await hover(seg, 450);
await caption(
  S(6, 'Coverage'),
  'Red is a gap: no sources. Amber is thin: one source, or one site. Green is covered: two independent sites. Purple is a conflict; a clock marks stale sources.',
);

// 7 · Fill a gap
const next = panel.locator('.next.card button.btn.brand');
await scrollPanelTo(next);
await caption(S(7, 'Next stop'), 'Next stop picks the first gap. One tap runs its prepared search.', 2600);
await click(next);
await wait(1200);
const firstResult = sim.locator('.sim-result-title').first();
const studyTitle = await firstResult.innerText();
await click(firstResult);
await settle(2200);
const filled = pageRow(studyTitle.slice(0, 30));
await scrollPanelTo(filled);
await caption(
  S(7, 'Next stop'),
  'Pages opened from a prepared search file under that question with certainty, and the gap turns amber.',
);

// 8 · Highlight
await clearCaption();
await caption(S(8, 'Evidence'), 'Select the sentence that matters, right-click, and save it as evidence.', 2400);
const passage = 'extreme rain events of more than 150 mm a day over Mumbai and the Konkan coast have tripled';
const selected = await page.evaluate((t) => !!document.querySelector('.sim-article')?.textContent.includes(t), passage);
if (selected) {
  const box = await selectPassage(passage);
  await page.mouse.click(box.x2, box.y2, { button: 'right' });
  await wait(700);
  await click(sim.getByRole('menuitem', { name: /Save to Thread.io as evidence/ }));
  await wait(1200);
  await scrollPanelTo(filled);
  await caption(
    S(8, 'Evidence'),
    'The highlight is saved with the page (Alt+Shift+H works too). Its link reopens the page at that exact passage.',
  );
}

// 9 · Conflict
await caption(
  S(9, 'Conflicts'),
  aiChip === 'rules'
    ? 'Under Q3, one source says the drains carry 25 mm of rain an hour and the audit says 50 mm. With a local model connected, Thread.io compares sources like these and flags the conflict. Without one, it stays quiet rather than guess.'
    : 'Under Q3, one source says 25 mm an hour and the audit says 50 mm. The model compares them and flags a conflict.',
);

// 10 · Map
await clearCaption();
await click(page.locator('.pg-bar').getByRole('radio', { name: 'map' }));
await page.waitForSelector('.react-flow__node');
await wait(1500);
await caption(
  S(10, 'Map'),
  'The map shows question hubs, page cards and the trail between them. Drag cards to arrange your thinking.',
);
const card = page.locator('.react-flow__node-page').first();
const cardBox = await hover(card, 400);
await page.mouse.down();
await moveTo(cardBox.x + cardBox.width / 2 + 160, cardBox.y + cardBox.height / 2 + 90);
await page.mouse.up();
await wait(800);
await click(page.locator('.react-flow__node-page', { hasText: 'Inside BRIMSTOWAD' }).first());
await wait(800);
await caption(
  S(10, 'Details'),
  'Click a page: why it’s here, its summary, notes, tags and links to other pages.',
  3200,
);
await click(page.locator('.drawer').getByLabel('Close'));
await type(page.getByPlaceholder(/Search pages, notes, highlights/), 'tripled');
await wait(900);
await caption(S(10, 'Search'), 'Ctrl+K searches pages, notes and highlights.', 2200);
await page.getByPlaceholder(/Search pages, notes, highlights/).press('Enter');
await wait(1000);
await click(page.locator('.map-toolbar').getByRole('button', { name: 'Outline' }));
await caption(S(10, 'Outline'), 'The outline view lists the same research as text.', 2600);
await click(page.locator('.map-toolbar').getByRole('button', { name: 'Map' }));
await click(page.locator('.map-toolbar').getByRole('button', { name: /Replay/ }));
await caption(S(10, 'Replay'), 'Replay plays the session back, step by step.', 5000);
await click(page.locator('.map-toolbar').getByRole('button', { name: /Replay/ }));

// 11 · Brief
await clearCaption();
await click(page.locator('.pg-bar').getByRole('radio', { name: 'browse' }));
await page.waitForSelector('.sim');
await wait(800);
await click(panel.getByRole('button', { name: /^Brief$/ }).last());
await click(panel.getByRole('button', { name: /Write brief/ }));
await wait(2500);
await caption(
  S(11, 'Cited brief'),
  aiChip === 'rules'
    ? 'The brief cites every source by number. References come only from page details. Without a model it lists summaries and highlights; with one, it drafts cited findings.'
    : 'The model drafts findings that must cite their sources. References come only from page details.',
);
await panel.evaluate((el) => el.scrollBy({ top: 500, behavior: 'smooth' }));
await wait(1800);
await hover(panel.getByRole('button', { name: /Markdown/ }), 500);
await hover(panel.getByRole('button', { name: /JSON Canvas/ }), 500);
await hover(panel.getByRole('button', { name: /Backup/ }), 500);
await caption(
  S(11, 'Exports'),
  'Export Markdown, a JSON Canvas for Obsidian, a PNG of the map, or a full backup.',
  3000,
);
await click(panel.getByRole('button', { name: /Back/ }).first());

// 12 · Hibernate
await clearCaption();
await caption(S(12, 'Close tabs without fear'), 'Hibernate closes this research’s tabs…', 2000);
await click(panel.getByRole('button', { name: /Hibernate/ }));
await wait(1800);
await caption(S(12, 'Close tabs without fear'), '…and Restore brings them all back.', 2000);
await click(panel.getByRole('button', { name: /Restore tabs/ }));
await wait(2200);

// 13 · Any language
await clearCaption();
await hover(panel.getByLabel('Workspace'));
await panel.getByLabel('Workspace').selectOption('__new');
await wait(800);
await type(panel.locator('textarea').first(), 'मुंबई में हर मानसून में बाढ़ क्यों आती है?');
await click(panel.getByRole('button', { name: /Draft my route/ }));
await wait(1500);
await caption(S(13, 'Any language'), 'Ask in Hindi, and the route comes back in Hindi.', 3200);
await click(panel.getByRole('button', { name: /Start route & record/ }));
await wait(800);
await search('मुंबई बाढ़ कारण');
await openResult('मुंबई में हर मानसून');
await wait(800);
await caption(S(13, 'Any language'), 'Hindi pages file under Hindi questions; English pages can too.', 3200);

// 14 · Research together (sample data)
await clearCaption();
await hover(panel.getByLabel('Workspace'));
const sampleId = await panel
  .getByLabel('Workspace')
  .locator('option', { hasText: 'Mumbai monsoon floods' })
  .getAttribute('value');
await panel.getByLabel('Workspace').selectOption(sampleId);
await wait(1200);
await caption(
  S(14, 'Research together'),
  'This is the playground’s sample workspace: a shared route with two teammates. It shows what live team research looks like.',
);
await hover(panel.locator('.panel-header'), 800);
const claimed = panel.locator('.qcard', { hasText: 'is on it' }).first();
if (await claimed.count()) await scrollPanelTo(claimed);
await caption(
  S(14, 'Research together'),
  'Share live, paste an invite code, and teammates join. You see who’s online, who found each page, and who claimed which question. Updates are end-to-end encrypted: the relay only sees scrambled data, and nothing anyone filed gets overwritten.',
);
const conflict = panel.locator('.qcard.status-conflict').first();
if (await conflict.count()) {
  await scrollPanelTo(conflict);
  await caption(
    S(14, 'Conflict, from the sample'),
    'Here is what a conflict looks like when the model finds one: two sources, the claim that differs, and Compare side by side.',
  );
}

// 15 · Under the hood
await clearCaption();
await click(panel.getByLabel('Settings'));
await wait(900);
const localAi = panel.getByText(/Local AI/).first();
if (await localAi.count()) await scrollPanelTo(localAi);
await caption(
  S(15, 'Under the hood'),
  'Pick the model: Gemma 4 E2B in Bionic, an embedding model, and whether it may think out loud. Without Bionic, Thread.io uses the browser’s built-in model, an in-browser embedding model, or no model at all, as in this recording.',
);
await caption(
  S(15, 'Under the hood'),
  'All the AI runs on your laptop. Private windows and sensitive sites are never recorded, and the AI only reads, never clicks. On our test set it matched 14 of 14 pages to the right question, in English and Hindi.',
);
await caption(
  'Thread.io',
  'Close the tabs, keep the thinking. github.com/riturajthakur1/Visual-Research-Browser-Tab-Manager-csi-tsec-tech',
  4500,
);

// --- Save -------------------------------------------------------------------------------

const video = page.video();
await context.close();
await browser.close();
await server.close();
if (video) {
  mkdirSync(dirname(out), { recursive: true });
  renameSync(await video.path(), out);
  console.log(`Saved ${out}`);
}
