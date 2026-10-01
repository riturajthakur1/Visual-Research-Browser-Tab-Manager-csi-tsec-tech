// Launches Chromium with the built extension and an offline copy of the web.
import { chromium, type BrowserContext, type Page } from '@playwright/test';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { articleHtml, searchHtml } from './fixtures';

/** Copies dist/ and grants site access up front: the permission prompt cannot be clicked in a test. */
export function prepareExtension(name: string): string {
  const ext = join(tmpdir(), `thread-io-e2e-${name}`);
  if (!existsSync(resolve('dist/manifest.json'))) throw new Error('Run `npm run build` first.');
  rmSync(ext, { recursive: true, force: true });
  cpSync(resolve('dist'), ext, { recursive: true });
  const manifest = JSON.parse(readFileSync(join(ext, 'manifest.json'), 'utf8'));
  manifest.host_permissions.push('<all_urls>');
  writeFileSync(join(ext, 'manifest.json'), JSON.stringify(manifest));
  return ext;
}

export async function launchExtension(name: string): Promise<{ context: BrowserContext; extId: string }> {
  const ext = prepareExtension(name);
  const context = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), `thread-io-${name}-`)), {
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
  context.on('page', (p) => p.on('dialog', (d) => void d.accept()));
  return { context, extId: new URL(sw.url()).host };
}

export async function setSettings(page: Page, patch: Record<string, unknown>) {
  await page.evaluate(async (p) => {
    const { settings } = await chrome.storage.local.get('settings');
    await chrome.storage.local.set({ settings: { ...(settings as object), ...p } });
  }, patch);
}

export interface DbNode {
  id: string;
  kind: string;
  url: string;
  title: string;
  foundBy?: { id: string; name: string };
  attach?: { questionId: string | null; method: string; reason: string; state: string };
  prov: { questionTag?: string; searchId?: string; openerId?: string };
}

export interface DbQuestion {
  id: string;
  text: string;
  order: number;
  searches: string[];
  claimedBy?: { id: string; name: string } | null;
}

export async function readDb(page: Page): Promise<{ nodes: DbNode[]; questions: DbQuestion[] }> {
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
