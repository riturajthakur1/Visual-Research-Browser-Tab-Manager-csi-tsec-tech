// End-to-end: loads the built extension into Chromium and runs the Research
// GPS loop on an offline copy of the web. Uses Bionic when it is running.
// Run with: npm run test:e2e
import { chromium, expect, test, type BrowserContext, type Page } from '@playwright/test';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { articleHtml, searchHtml } from './fixtures';

const SHOTS = resolve('test-results/screens');
let context: BrowserContext;
let extId: string;
let panel: Page;

interface DbNode {
  id: string;
  kind: string;
  url: string;
  title: string;
  attach?: { questionId: string | null; method: string; reason: string; state: string };
  prov: { questionTag?: string; searchId?: string; openerId?: string };
  summary?: string;
}
interface DbQuestion {
  id: string;
  text: string;
  order: number;
  searches: string[];
}

async function readDb(page: Page): Promise<{ nodes: DbNode[]; questions: DbQuestion[] }> {
  return page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open('thread-io');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const tx = db.transaction(['nodes', 'questions'], 'readonly');
          const nodes = tx.objectStore('nodes').getAll();
          const questions = tx.objectStore('questions').getAll();
          tx.oncomplete = () =>
            resolve({
              nodes: nodes.result,
              questions: questions.result.sort((a: DbQuestion, b: DbQuestion) => a.order - b.order),
            });
        };
      }),
  );
}

async function waitForNode(url: string, done: (n: DbNode) => boolean, timeout = 90_000): Promise<DbNode> {
  const start = Date.now();
  for (;;) {
    const { nodes } = await readDb(panel);
    const n = nodes.find((x) => x.url === url);
    if (n && done(n)) return n;
    if (Date.now() - start > timeout) {
      const sw = context.serviceWorkers()[0];
      const state = await sw?.evaluate(async () => ({
        local: await chrome.storage.local.get('settings'),
        session: await chrome.storage.session.get(null),
      }));
      console.log('SW state', JSON.stringify(state).slice(0, 1500));
      console.log('nodes', JSON.stringify(nodes.map((x) => [x.url, x.attach?.questionId, x.attach?.method])));
      throw new Error(`Timed out waiting for ${url}: ${JSON.stringify(n?.attach)}`);
    }
    await panel.waitForTimeout(500);
  }
}

// Step screenshots are off by default; set E2E_SCREENSHOTS=1 to capture them for review.
const SCREENSHOTS = process.env.E2E_SCREENSHOTS === '1';
const shot = async (page: Page, name: string) => {
  if (SCREENSHOTS) await page.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: false });
};

test.beforeAll(async () => {
  if (SCREENSHOTS) mkdirSync(SHOTS, { recursive: true });
  // Copy the build and grant site access up front: the permission prompt cannot be clicked in a test.
  const ext = join(tmpdir(), 'thread-io-e2e-ext');
  rmSync(ext, { recursive: true, force: true });
  cpSync(resolve('dist'), ext, { recursive: true });
  const manifest = JSON.parse(readFileSync(join(ext, 'manifest.json'), 'utf8'));
  manifest.host_permissions.push('<all_urls>');
  writeFileSync(join(ext, 'manifest.json'), JSON.stringify(manifest));

  context = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'thread-io-profile-')), {
    headless: true,
    channel: 'chromium',
    viewport: { width: 1440, height: 900 },
    args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
  });
  await context.route(/^https:\/\/(www\.google\.com\/search|[a-z0-9-]+\.example\/)/, async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === 'www.google.com') {
      return route.fulfill({ contentType: 'text/html', body: searchHtml(url.searchParams.get('q') ?? '') });
    }
    const html = articleHtml(url.origin + url.pathname);
    return html
      ? route.fulfill({ contentType: 'text/html', body: html })
      : route.fulfill({ status: 404, body: 'not found' });
  });
  let [sw] = context.serviceWorkers();
  sw ??= await context.waitForEvent('serviceworker');
  extId = new URL(sw.url()).host;
  context.on('dialog', (d) => void d.accept());
  context.on('page', (p) => p.on('dialog', (d) => void d.accept()));
});

test.afterAll(async () => {
  await context?.close();
});

test('research GPS loop: route, capture, gap filling, map, brief, hibernate', async () => {
  panel = await context.newPage();
  await panel.setViewportSize({ width: 400, height: 900 });
  await panel.goto(`chrome-extension://${extId}/sidepanel.html`);
  await expect(panel.getByRole('heading', { name: 'Where are you headed?' })).toBeVisible();
  await shot(panel, '01-panel-start');

  // 1. Destination → drafted route.
  await panel.locator('#goal').fill('Why does Mumbai flood every monsoon, and what would fix it?');
  await panel.getByRole('button', { name: 'Draft my route' }).click();
  await expect(panel.locator('.draft-q').first()).toBeVisible({ timeout: 120_000 });
  expect(await panel.locator('.draft-q').count()).toBeGreaterThanOrEqual(5);
  await shot(panel, '02-route-draft');
  await panel.getByRole('button', { name: /Start route/ }).click();
  await expect(panel.locator('.qcard').first()).toBeVisible();
  const { questions } = await readDb(panel);
  expect(questions.length).toBeGreaterThanOrEqual(5);

  // 2. Browse normally: search → result, result → linked page in a new tab.
  const browse = await context.newPage();
  await browse.goto('https://www.google.com/search?q=mumbai+storm+water+drains+capacity');
  await browse.locator('a[href="https://city-drains.example/storm-water-capacity"]').click();
  await browse.waitForLoadState('load');
  const drains = await waitForNode('https://city-drains.example/storm-water-capacity', (n) => !!n.attach);
  expect(drains.prov.searchId).toBeTruthy();

  const [child] = await Promise.all([context.waitForEvent('page'), browse.locator('#related').click()]);
  await child.waitForLoadState('load');
  const pumping = await waitForNode('https://city-drains.example/pumping-stations', (n) => !!n.attach);
  expect(pumping.prov.openerId).toBe(drains.id);

  await browse.goto('https://www.google.com/search?q=mangroves+wetlands+mumbai+flooding');
  await browse.locator('a[href="https://coast-watch.example/mangroves-mumbai"]').click();
  const mangroves = await waitForNode('https://coast-watch.example/mangroves-mumbai', (n) => !!n.attach);

  await browse.goto('https://gadget-reviews.example/budget-phones');
  const phones = await waitForNode('https://gadget-reviews.example/budget-phones', (n) => !!n.attach);

  const qText = (n: DbNode) => questions.find((q) => q.id === n.attach?.questionId)?.text.toLowerCase() ?? '(parked)';
  console.log('drains   →', qText(drains), '|', drains.attach?.reason);
  console.log('pumping  →', qText(pumping), '|', pumping.attach?.reason);
  console.log('mangrove →', qText(mangroves), '|', mangroves.attach?.reason);
  console.log('phones   →', qText(phones), '|', phones.attach?.reason);
  expect(drains.attach?.questionId).toBeTruthy();
  expect(mangroves.attach?.questionId).toBeTruthy();
  expect(phones.attach?.questionId).toBeNull();
  await panel.bringToFront();
  await shot(panel, '03-pages-filed');

  // 3. Fill a gap: the prepared search files its results with certainty.
  const { nodes: before } = await readDb(panel);
  const filled = new Set(before.map((n) => n.attach?.questionId).filter(Boolean));
  const gap = questions.find((q) => !filled.has(q.id) && q.searches.length)!;
  const [gapTab] = await Promise.all([
    context.waitForEvent('page'),
    panel.locator(`#q-${gap.id} .search-chip`).first().click(),
  ]);
  await gapTab.waitForURL(/google\.com\/search/);
  await gapTab.locator('a.result').first().click();
  await gapTab.waitForLoadState('load');
  const gapUrl = gapTab.url();
  const prepared = await waitForNode(
    gapUrl,
    (n) => n.attach?.method === 'prepared' || (n.attach?.questionId === gap.id && !!n.prov.questionTag),
  );
  console.log('gap fill →', gap.text, '|', prepared.attach?.reason);
  expect(prepared.attach?.questionId).toBe(gap.id);
  expect(prepared.attach?.state).toBe('accepted');
  await panel.bringToFront();
  await shot(panel, '04-gap-filled');

  // 4. The map.
  const map = await context.newPage();
  await map.goto(`chrome-extension://${extId}/map.html`);
  await expect(map.locator('.react-flow__node-question').first()).toBeVisible();
  const pageCount = (await readDb(panel)).nodes.filter((n) => n.kind === 'page').length;
  await expect(map.locator('.react-flow__node-page')).toHaveCount(pageCount, { timeout: 30_000 });
  await map.waitForTimeout(800);
  await shot(map, '05-map');
  await map.locator('.react-flow__node-page').first().click();
  await expect(map.locator('.drawer')).toBeVisible();
  await shot(map, '06-map-drawer');
  await map.getByPlaceholder(/Search pages/).fill('mangrove');
  await expect(map.locator('.search-results li').first()).toBeVisible();
  await map.getByRole('button', { name: 'Outline' }).click();
  await shot(map, '07-outline');
  await map.close();

  // 5. The cited brief.
  await panel.bringToFront();
  await panel.getByRole('button', { name: 'Brief' }).last().click();
  await panel.getByRole('button', { name: 'Write brief' }).click();
  await expect(panel.locator('.markdown h2', { hasText: 'References' })).toBeVisible({ timeout: 180_000 });
  const brief = await panel.locator('.markdown').innerText();
  expect(brief).toContain('city-drains.example');
  await shot(panel, '08-brief');
  await panel.getByRole('button', { name: 'Back', exact: true }).click();

  // 6. Hibernate closes the research tabs; restore brings them back.
  // Counted through chrome.tabs: Playwright cannot serve fixtures to tabs the extension opens in the background.
  const open = () =>
    context
      .serviceWorkers()[0]
      .evaluate(
        async () =>
          (await chrome.tabs.query({})).filter((t) => (t.url ?? t.pendingUrl ?? '').includes('.example/')).length,
      );
  const before6 = await open();
  expect(before6).toBeGreaterThanOrEqual(2);
  await panel.getByRole('button', { name: 'Hibernate' }).click();
  await expect.poll(open, { timeout: 15_000 }).toBe(0);
  await expect(panel.getByRole('button', { name: 'Restore tabs' })).toBeVisible();
  await shot(panel, '09-hibernated');
  await panel.getByRole('button', { name: 'Restore tabs' }).click();
  await expect.poll(open, { timeout: 15_000 }).toBe(before6);
  await expect(panel.getByRole('button', { name: 'Hibernate' })).toBeVisible();
});

test('offline tier: in-browser multilingual embeddings and rules-only routes', async () => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extId}/sidepanel.html`);
  await page.evaluate(async () => {
    const { settings } = await chrome.storage.local.get('settings');
    await chrome.storage.local.set({
      settings: { ...(settings as object), llmProvider: 'none', embedProvider: 'browser' },
    });
  });
  const status = await page.evaluate(() =>
    chrome.runtime.sendMessage({ target: 'background', type: 'ai.status', fresh: true }),
  );
  expect(status.value.llm).toBeNull();
  expect(status.value.embed.kind).toBe('browser');

  // The offscreen document runs multilingual-e5-small on WebAssembly inside the extension.
  const t0 = Date.now();
  const res = await page.evaluate(() =>
    chrome.runtime.sendMessage({
      target: 'offscreen',
      type: 'embed',
      texts: [
        'query: मुंबई की नालियाँ बारिश में क्यों भर जाती हैं?',
        'passage: The British-era drains in Mumbai were designed to carry 25 mm of rain per hour.',
        'passage: Best budget smartphones of 2026 compared.',
      ],
    }),
  );
  console.log(`in-browser embedding: ${Date.now() - t0} ms (includes model load)`);
  expect(res.ok).toBe(true);
  const [q, drains, phones] = res.value as number[][];
  expect(q.length).toBe(384);
  const cos = (a: number[], b: number[]) => a.reduce((s, x, i) => s + x * b[i], 0);
  console.log('hindi question vs drains', cos(q, drains).toFixed(3), 'vs phones', cos(q, phones).toFixed(3));
  expect(cos(q, drains)).toBeGreaterThan(cos(q, phones));

  // Without a language model the route comes from templates, in the goal's language.
  await page.getByRole('combobox', { name: 'Workspace' }).selectOption('__new');
  await page.locator('#goal').fill('मुंबई में हर मानसून में बाढ़ क्यों आती है?');
  await page.getByRole('button', { name: 'Draft my route' }).click();
  await expect(page.getByText('Drafted offline')).toBeVisible();
  const first = await page.locator('.draft-q textarea').first().inputValue();
  expect(first).toMatch(/[ऀ-ॿ]/);
  await shot(page, '10-offline-hindi-route');

  await page.evaluate(async () => {
    const { settings } = await chrome.storage.local.get('settings');
    await chrome.storage.local.set({
      settings: { ...(settings as object), llmProvider: 'auto', embedProvider: 'auto' },
    });
  });
});
