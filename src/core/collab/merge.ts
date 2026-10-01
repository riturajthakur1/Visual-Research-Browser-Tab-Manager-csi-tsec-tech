// What is shared, and how two versions of a record are merged.
//
// Every record is compared field by field against the last version both sides
// agreed on (the base). A field changed on one side wins; a field changed on
// both sides goes to whichever record was updated last. So a teammate editing
// a page's notes never undoes your filing of the same page.

export type Rec = Record<string, unknown>;
export type SyncTable = 'questions' | 'nodes' | 'links' | 'rules';
export const SYNC_TABLES: SyncTable[] = ['questions', 'nodes', 'links', 'rules'];

/** Workspace fields that are shared; the rest (tabs, viewport, sharing key) stay on this machine. */
export const SHARED_WS_FIELDS = ['name', 'goal', 'mode', 'settings', 'updatedAt'] as const;

/** Per-machine fields of shared records. */
const LOCAL_ONLY: Record<SyncTable, string[]> = {
  questions: [],
  nodes: ['status', 'visits', 'timeSpentMs'],
  links: [],
  rules: [],
};

/** Plain-JSON copy without local-only fields or undefined values, so comparisons are stable. */
export function project(table: SyncTable, obj: Rec): Rec {
  const copy: Rec = {};
  for (const [k, v] of Object.entries(obj)) if (v !== undefined && !LOCAL_ONLY[table].includes(k)) copy[k] = v;
  return JSON.parse(JSON.stringify(copy)) as Rec;
}

export function projectWorkspace(ws: Rec): Rec {
  const copy: Rec = {};
  for (const k of SHARED_WS_FIELDS) if (ws[k] !== undefined) copy[k] = ws[k];
  return JSON.parse(JSON.stringify(copy)) as Rec;
}

/** Restores this machine's local-only fields onto a shared record before saving it. */
export function withLocalFields(table: SyncTable, shared: Rec, local: Rec | undefined): Rec {
  const out = { ...shared };
  if (table === 'nodes') {
    out.status = local?.status ?? 'closed';
    out.visits = local?.visits ?? 0;
    out.timeSpentMs = local?.timeSpentMs ?? 0;
  }
  return out;
}

const enc = (v: unknown) => (v === undefined ? undefined : JSON.stringify(v));

export function same(a: Rec | undefined, b: Rec | undefined): boolean {
  if (!a || !b) return a === b;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) if (enc(a[k]) !== enc(b[k])) return false;
  return true;
}

const stamp = (r: Rec) =>
  typeof r.updatedAt === 'number' ? r.updatedAt : typeof r.createdAt === 'number' ? r.createdAt : 0;

/** Field-level three-way merge. Without a base (first contact), the newer record wins conflicts. */
export function mergeFields(local: Rec, remote: Rec, base: Rec | undefined): Rec {
  const remoteWins = stamp(remote) >= stamp(local);
  const keys = new Set([...Object.keys(local), ...Object.keys(remote), ...Object.keys(base ?? {})]);
  const out: Rec = {};
  for (const k of keys) {
    const l = enc(local[k]);
    const r = enc(remote[k]);
    const b = base ? enc(base[k]) : undefined;
    let v: unknown;
    if (l === r) v = local[k];
    else if (base && r === b) v = local[k];
    else if (base && l === b) v = remote[k];
    else v = remoteWins ? remote[k] : local[k];
    if (k === 'updatedAt') v = Math.max(Number(local[k] ?? 0), Number(remote[k] ?? 0)) || v;
    if (v !== undefined) out[k] = v;
  }
  return out;
}
