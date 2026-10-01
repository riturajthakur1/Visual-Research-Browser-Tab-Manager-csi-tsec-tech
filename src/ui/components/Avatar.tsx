import type { Member } from '../../core/types';

const initials = (name: string) =>
  (name.trim() || '?')
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => [...w][0]?.toUpperCase() ?? '')
    .join('');

/** A teammate's coloured initials. */
export function Avatar({
  member,
  size = 20,
  ring,
  title,
}: {
  member: Member;
  size?: number;
  ring?: boolean;
  title?: string;
}) {
  return (
    <span
      className={`avatar ${ring ? 'ring' : ''}`}
      style={{ width: size, height: size, fontSize: size * 0.42, background: member.color || 'var(--ink-3)' }}
      title={title ?? member.name}
      aria-label={title ?? member.name}
      role="img"
    >
      {initials(member.name)}
    </span>
  );
}

export function AvatarStack({ members, max = 4, size = 22 }: { members: Member[]; max?: number; size?: number }) {
  const shown = members.slice(0, max);
  return (
    <span className="avatar-stack">
      {shown.map((m) => (
        <Avatar key={m.id} member={m} size={size} ring />
      ))}
      {members.length > max && <span className="avatar more">+{members.length - max}</span>}
    </span>
  );
}
