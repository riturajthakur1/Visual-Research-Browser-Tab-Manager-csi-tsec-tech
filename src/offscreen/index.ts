// Offscreen document: hosts the in-browser multilingual embedding model and
// gives the service worker access to the browser's built-in language model.
import { env, pipeline, type FeatureExtractionPipeline } from '@huggingface/transformers';
import { BROWSER_MODEL } from '../core/ai/embed';
import { builtinAvailability, builtinJson } from '../core/ai/builtin';
import type { OffscreenRequest, OffscreenStatus } from '../core/ai/offscreen-client';

// Everything ships inside the extension: no model or runtime downloads at run time.
env.allowRemoteModels = false;
env.allowLocalModels = true;
env.localModelPath = chrome.runtime.getURL('models/');
env.useBrowserCache = false;
(env as { useWasmCache?: boolean }).useWasmCache = false;
const wasm = env.backends.onnx.wasm!;
wasm.wasmPaths = {
  mjs: chrome.runtime.getURL('ort/ort-wasm-simd-threaded.asyncify.mjs'),
  wasm: chrome.runtime.getURL('ort/ort-wasm-simd-threaded.asyncify.wasm'),
};
wasm.numThreads = 1;

let status: OffscreenStatus['embedder'] = 'idle';
let lastError: string | undefined;
let extractor: Promise<FeatureExtractionPipeline> | null = null;

function getExtractor() {
  if (!extractor) {
    status = 'loading';
    extractor = pipeline('feature-extraction', BROWSER_MODEL, { dtype: 'q8', device: 'wasm' })
      .then((p) => {
        status = 'ready';
        return p as FeatureExtractionPipeline;
      })
      .catch((e: Error) => {
        status = 'error';
        lastError = e.message;
        extractor = null;
        throw e;
      });
  }
  return extractor;
}

async function embed(texts: string[]): Promise<number[][]> {
  const run = await getExtractor();
  const out = await run(texts, { pooling: 'mean', normalize: true });
  return out.tolist() as number[][];
}

async function handle(msg: OffscreenRequest): Promise<unknown> {
  switch (msg.type) {
    case 'embed':
      return embed(msg.texts);
    case 'prompt':
      return builtinJson(msg.req);
    case 'status':
      return {
        embedder: status,
        embedderError: lastError,
        builtin: await builtinAvailability(),
      } satisfies OffscreenStatus;
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.target !== 'offscreen') return false;
  handle(msg as OffscreenRequest).then(
    (value) => sendResponse({ ok: true, value }),
    (e: Error) => sendResponse({ ok: false, error: e?.message ?? String(e) }),
  );
  return true;
});
