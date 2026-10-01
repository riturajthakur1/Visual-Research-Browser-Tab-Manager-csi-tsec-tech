// End-to-end encryption for shared research: AES-GCM with a 256-bit key that
// travels only inside invite codes. The relay stores and forwards ciphertext.

export function toB64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromB64(text: string): Uint8Array {
  const s = atob(text.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((text.length + 3) % 4));
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export function newKey(): string {
  return toB64(crypto.getRandomValues(new Uint8Array(32)));
}

export function importKey(key: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', fromB64(key) as BufferSource, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function seal(key: CryptoKey, data: Uint8Array): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data as BufferSource));
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv);
  out.set(ct, iv.length);
  return toB64(out);
}

export async function open(key: CryptoKey, sealed: string): Promise<Uint8Array> {
  const bytes = fromB64(sealed);
  const pt = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: bytes.slice(0, 12) as BufferSource },
    key,
    bytes.slice(12) as BufferSource,
  );
  return new Uint8Array(pt);
}

const enc = new TextEncoder();
const dec = new TextDecoder();
export const sealJson = (key: CryptoKey, value: unknown) => seal(key, enc.encode(JSON.stringify(value)));
export const openJson = async <T>(key: CryptoKey, sealed: string) =>
  JSON.parse(dec.decode(await open(key, sealed))) as T;
