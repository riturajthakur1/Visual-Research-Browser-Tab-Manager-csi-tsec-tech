// The browser's built-in language model (Chrome's Gemini Nano, Edge's Phi-4-mini)
// through the Prompt API. Only exists in window contexts of supporting browsers.
import type { JsonRequest } from './bionic';

export type BuiltinAvailability = 'unavailable' | 'downloadable' | 'downloading' | 'available';

interface LanguageModelSession {
  prompt(input: string, options?: { responseConstraint?: object; signal?: AbortSignal }): Promise<string>;
  destroy(): void;
}

interface LanguageModelStatic {
  availability(options?: object): Promise<BuiltinAvailability>;
  create(options?: object): Promise<LanguageModelSession>;
}

const api = (): LanguageModelStatic | undefined =>
  (globalThis as unknown as { LanguageModel?: LanguageModelStatic }).LanguageModel;

const OPTIONS = {
  expectedInputs: [{ type: 'text', languages: ['en'] }],
  expectedOutputs: [{ type: 'text', languages: ['en'] }],
};

export async function builtinAvailability(): Promise<BuiltinAvailability> {
  const lm = api();
  if (!lm) return 'unavailable';
  try {
    return await lm.availability(OPTIONS);
  } catch {
    return 'unavailable';
  }
}

/** Starts the one-time model download. Must be called from a click handler. */
export async function downloadBuiltin(onProgress?: (fraction: number) => void): Promise<boolean> {
  const lm = api();
  if (!lm) return false;
  const session = await lm.create({
    ...OPTIONS,
    monitor(m: EventTarget) {
      m.addEventListener('downloadprogress', (e) => onProgress?.((e as unknown as { loaded: number }).loaded));
    },
  });
  session.destroy();
  return true;
}

export async function builtinJson<T>(req: JsonRequest, timeoutMs = 90_000): Promise<T> {
  const lm = api();
  if (!lm) throw new Error('Built-in AI is not available in this browser');
  const session = await lm.create({ ...OPTIONS, initialPrompts: [{ role: 'system', content: req.system }] });
  try {
    const out = await session.prompt(req.user, {
      responseConstraint: req.schema,
      signal: AbortSignal.timeout(timeoutMs),
    });
    return JSON.parse(out) as T;
  } finally {
    session.destroy();
  }
}
