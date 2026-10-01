// Prepares the local Bionic / LM Studio runtime for Thread.io:
//   1. makes sure the local API server is running on :1234
//   2. downloads a chat model and an embedding model if none are present
//   3. loads them with a small context so they fit in laptop VRAM
// Usage: npm run bionic            (uses the defaults below)
//        npm run bionic -- --llm qwen/qwen3-4b-2507 --ctx 8192
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1]]] : acc), []),
);

// Preferred chat models, best first. The first one already on disk wins;
// if none are present the first entry is downloaded.
const LLM_PREFERENCE = args.llm
  ? [args.llm]
  : ['google/gemma-4-e2b', 'qwen/qwen3-vl-4b', 'qwen/qwen3-4b-2507', 'qwen/qwen3-1.7b'];
// Multilingual (100+ languages), so a Hindi question can match an English page.
const EMBED_MATCH = /embeddinggemma/i;
const EMBED_DOWNLOAD = 'https://huggingface.co/ggml-org/embeddinggemma-300M-GGUF';
const CONTEXT = String(args.ctx ?? 8192);
const BASE = args.url ?? 'http://localhost:1234/v1';

const lmsCandidates = [
  join(homedir(), '.lmstudio', 'bin', process.platform === 'win32' ? 'lms.exe' : 'lms'),
  join(homedir(), '.cache', 'lm-studio', 'bin', process.platform === 'win32' ? 'lms.exe' : 'lms'),
];
const LMS = lmsCandidates.find(existsSync) ?? 'lms';

function lms(...a) {
  return execFileSync(LMS, a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

async function serverUp() {
  try {
    const r = await fetch(`${BASE}/models`, { signal: AbortSignal.timeout(3000) });
    return r.ok;
  } catch {
    return false;
  }
}

function installedKeys() {
  const out = lms('ls', '--json');
  return JSON.parse(out).map((m) => m.modelKey ?? m.path ?? m.id);
}

try {
  lms('version');
} catch {
  console.error('Could not find the `lms` CLI. Open Bionic (or LM Studio) once so it installs ~/.lmstudio/bin/lms.');
  process.exit(1);
}

if (!(await serverUp())) {
  console.log('Starting the local API server…');
  lms('server', 'start');
  for (let i = 0; i < 20 && !(await serverUp()); i++) await new Promise((r) => setTimeout(r, 500));
  if (!(await serverUp())) {
    console.error(`Server did not come up at ${BASE}. In Bionic, set Local Model API → Local API server to Running.`);
    process.exit(1);
  }
}
console.log(`✓ Local API server at ${BASE}`);

let keys = installedKeys();
let llm = LLM_PREFERENCE.find((k) => keys.includes(k));
if (!llm) {
  llm = LLM_PREFERENCE[0];
  console.log(`↓ Downloading ${llm} (a few GB, one time)…`);
  execFileSync(LMS, ['get', llm, '--yes'], { stdio: 'inherit' });
}
console.log(`✓ Chat model: ${llm}`);

if (!keys.some((k) => EMBED_MATCH.test(k))) {
  console.log(`↓ Downloading ${EMBED_DOWNLOAD}…`);
  execFileSync(LMS, ['get', EMBED_DOWNLOAD, '--yes'], { stdio: 'inherit' });
  keys = installedKeys();
}
const embed = keys.find((k) => EMBED_MATCH.test(k));
if (!embed) {
  console.error('Embedding model download did not complete.');
  process.exit(1);
}
console.log(`✓ Embedding model: ${embed}`);

// Just-in-time loading picks the model's full context window, which spills a
// 4B model out of a 6 GB GPU and drops it to a few tokens a second. Loading it
// ourselves with a small context keeps it fast.
// Free the GPU: unload other chat models, and reload ours with the small context.
const running = JSON.parse(lms('ps', '--json'));
const loaded = running.map((m) => m.identifier ?? m.modelKey);
for (const m of running) {
  const id = m.identifier ?? m.modelKey;
  if (m.type === 'embedding') continue;
  console.log(
    id === llm ? `  reloading ${id} with a ${CONTEXT}-token context` : `  unloading ${id} to free GPU memory`,
  );
  lms('unload', id);
}
console.log(`Loading ${llm} (context ${CONTEXT}, GPU max)…`);
lms('load', llm, '--context-length', CONTEXT, '--gpu', 'max', '--identifier', llm, '--yes');
if (!loaded.includes(embed)) {
  console.log(`Loading ${embed}…`);
  lms('load', embed, '--identifier', embed, '--yes');
}

const t0 = Date.now();
const res = await fetch(`${BASE}/chat/completions`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    model: llm,
    messages: [{ role: 'user', content: 'Reply with the single word: ready' }],
    max_tokens: 5,
    reasoning_effort: 'none',
  }),
});
const body = await res.json();
console.log(`✓ ${llm} answered "${body.choices?.[0]?.message?.content?.trim()}" in ${Date.now() - t0} ms`);
console.log('\nBionic is ready for Thread.io.');
