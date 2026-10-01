import { useState, type ReactNode } from 'react';
import { STATUS_LABEL } from '../../core/engine/coverage';
import type { CoverageStatus, TrailNode } from '../../core/types';
import { hostname } from '../../core/util';

export function StatusPill({ status, stale }: { status: CoverageStatus; stale?: boolean }) {
  return (
    <span className={`pill ${status}`} title={stale ? 'Newest source is older than your stale limit' : undefined}>
      {STATUS_LABEL[status]}
      {stale && ' · stale'}
    </span>
  );
}

/** Site icon with a lettered fallback (favicons often fail to load). */
export function Favicon({ node, size = 16 }: { node: Pick<TrailNode, 'favicon' | 'url' | 'site'>; size?: number }) {
  const [broken, setBroken] = useState(false);
  const letter = (node.site || hostname(node.url) || '?').charAt(0).toUpperCase();
  if (!node.favicon || broken) {
    return (
      <span className="favicon-fallback" style={{ width: size, height: size, fontSize: size * 0.62 }} aria-hidden>
        {letter}
      </span>
    );
  }
  return (
    <img className="favicon" src={node.favicon} width={size} height={size} alt="" onError={() => setBroken(true)} />
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <span className="row muted" role="status">
      <span className="spinner" />
      {label && <span>{label}</span>}
    </span>
  );
}

export function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      className="switch"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
    />
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <strong>{title}</strong>
      {children && <div className="muted">{children}</div>}
    </div>
  );
}
