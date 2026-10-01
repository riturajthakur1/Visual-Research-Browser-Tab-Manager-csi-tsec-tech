// Downloads the in-browser embedding model and copies the ONNX Runtime
// WebAssembly files into public/, so the extension works fully offline.
// Safe to re-run: files that already exist are skipped.
import { createWriteStream, existsSync, mkdirSync, copyFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const MODELS = [
  {
    id: 'Xenova/all-MiniLM-L6-v2',
    files: [
      'config.json',
      'tokenizer.json',
      'tokenizer_config.json',
      'special_tokens_map.json',
      'onnx/model_quantized.onnx',
    ],
  },
];

async function download(url, dest) {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok || !res.body) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  mkdirSync(dirname(dest), { recursive: true });
  const tmp = `${dest}.part`;
  await pipeline(Readable.fromWeb(res.body), createWriteStream(tmp));
  const { renameSync } = await import('node:fs');
  renameSync(tmp, dest);
}

function mb(path) {
  return `${(statSync(path).size / 1e6).toFixed(1)} MB`;
}

for (const model of MODELS) {
  for (const file of model.files) {
    const dest = join(root, 'public', 'models', model.id, file);
    if (existsSync(dest)) {
      console.log(`✓ ${model.id}/${file} (${mb(dest)}, already present)`);
      continue;
    }
    const url = `https://huggingface.co/${model.id}/resolve/main/${file}`;
    process.stdout.write(`↓ ${model.id}/${file} … `);
    await download(url, dest);
    console.log(mb(dest));
  }
}

// ONNX Runtime ships its WebAssembly next to the JS. Extensions cannot load
// code from a CDN, so the runtime files are bundled under public/ort/.
const ortDist = join(root, 'node_modules', 'onnxruntime-web', 'dist');
for (const file of ['ort-wasm-simd-threaded.asyncify.mjs', 'ort-wasm-simd-threaded.asyncify.wasm']) {
  const src = join(ortDist, file);
  const dest = join(root, 'public', 'ort', file);
  if (!existsSync(src)) throw new Error(`Missing ${src}. Run npm install first.`);
  mkdirSync(dirname(dest), { recursive: true });
  if (!existsSync(dest) || statSync(dest).size !== statSync(src).size) copyFileSync(src, dest);
  console.log(`✓ ort/${file} (${mb(dest)})`);
}

console.log('\nIn-browser models ready.');
