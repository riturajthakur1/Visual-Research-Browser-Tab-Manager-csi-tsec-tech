// Two browsers, each running the extension, research together through a
// relay started by the test: a page one finds appears for the other, with
// who found it, and a claim made by one shows for the other.
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startRelay, type Relay } from '../../collab-server/server.mjs';
import { launchExtension, readDb, setSettings } from './helpers';

let relay: Relay;
let alice: { context: BrowserContext; extId: string };
let bob: { context: BrowserContext; extId: string };

test.beforeAll(async () => {
  relay = await startRelay({ port: 0, dataDir: mkdtempSync(join(tmpdir(), 'thread-relay-e2e-')), quiet: true });
  [alice, bob] = await Promise.all([launchExtension('alice'), launchExtension('bob')]);
});

test.afterAll(async () => {
  await Promise.all([alice?.context.close(), bob?.context.close()]);
  await relay?.close();
});

async function openPanel(who: { context: BrowserContext; extId: string }): Promise<Page> {
  const panel = await who.context.newPage();
  await panel.setViewportSize({ width: 400, height: 900 });
  await panel.goto(`chrome-extension://${who.extId}/sidepanel.html`);
  return panel;
}

test('teammates share a route live', async () => {
  const relayUrl = `ws://localhost:${relay.port}`;

  // Alice drafts a route (rules only, to keep the test fast) and shares it.
  const a = await openPanel(alice);
  await setSettings(a, {
    llmProvider: 'none',
    profile: { id: 'm_alice', name: 'Alice', color: '#C8160C' },
    collabServer: relayUrl,
  });
  await a.locator('#goal').fill('Why does Mumbai flood every monsoon, and what would fix it?');
  await a.getByRole('button', { name: 'Draft my route' }).click();
  await expect(a.getByText('Drafted offline')).toBeVisible();
  await a.getByRole('button', { name: /Start route/ }).click();
  await expect(a.locator('.qcard').first()).toBeVisible();

  await a.getByRole('button', { name: /Research together/ }).click();
  await a.getByRole('button', { name: /Share live/ }).click();
  await expect(a.locator('.team').getByText('Live')).toBeVisible({ timeout: 15_000 });
  const invite = await a.locator('.team-details input[readonly]').inputValue();
  expect(invite).toMatch(/^thread-io:/);

  // Bob joins with the invite code and gets the whole route.
  const b = await openPanel(bob);
  await setSettings(b, { llmProvider: 'none', profile: { id: 'm_bob', name: 'Bob', color: '#2563EB' } });
  await b.getByRole('textbox', { name: 'Invite code' }).fill(invite);
  await b.getByRole('button', { name: 'Join', exact: true }).click();
  await expect(b.locator('.goal')).toHaveText('Why does Mumbai flood every monsoon, and what would fix it?', {
    timeout: 20_000,
  });
  const aliceQuestions = (await readDb(a)).questions;
  await expect.poll(async () => (await readDb(b)).questions.length, { timeout: 20_000 }).toBe(aliceQuestions.length);

  // Each sees the other online.
  await expect(a.locator('.team').getByText('2 online')).toBeVisible({ timeout: 20_000 });
  await expect(b.locator('.team').getByText('2 online')).toBeVisible({ timeout: 20_000 });

  // Alice browses ("Start route & record" turned recording on); the page shows up for Bob, marked as found by Alice.
  await expect(a.getByRole('switch', { name: 'Record browsing' })).toHaveAttribute('aria-checked', 'true');
  const browse = await alice.context.newPage();
  await browse.goto('https://www.google.com/search?q=mumbai+storm+water+drains');
  await browse.locator('a[href="https://city-drains.example/storm-water-capacity"]').click();
  await browse.waitForLoadState('load');
  const url = 'https://city-drains.example/storm-water-capacity';
  await expect
    .poll(async () => (await readDb(b)).nodes.find((n) => n.url === url)?.foundBy?.name, { timeout: 30_000 })
    .toBe('Alice');

  // Bob claims a gap; Alice sees who is on it.
  const target = aliceQuestions[aliceQuestions.length - 1];
  await b.locator(`#q-${target.id}`).getByRole('button', { name: 'Claim' }).click();
  await expect(a.locator(`#q-${target.id}`).getByText('Bob is on it')).toBeVisible({ timeout: 20_000 });

  // The relay only ever held ciphertext.
  const blob = relay.rooms.get([...relay.rooms.keys()][0])!.log.join('');
  expect(blob).not.toContain('Mumbai');
  expect(blob).not.toContain('Alice');
});
