'use client';

/* MentionPicker — floating-list joka avautuu kun composerissa kirjoitetaan @.
 * Käyttäjä valitsee jäsenen → composeriin syötetään `@[id|name]` -muoto jonka markdown
 * renderöi tyylitellyksi maininta-spaniksi.
 */

import { useEffect, useMemo, useRef } from 'react';
import { OrgTeamMember } from '@/lib/team-shared';

interface Props {
  members: OrgTeamMember[];
  query: string;
  selectedIndex: number;
  onSelect: (member: OrgTeamMember | { id: 'here' | 'all'; name: string }) => void;
  onIndexChange: (n: number) => void;
  anchorEl: HTMLElement | null;
}

export default function MentionPicker({ members, query, selectedIndex, onSelect, onIndexChange, anchorEl }: Props) {
  const listRef = useRef<HTMLDivElement>(null);

  const broadcasts = useMemo(() => [
    { id: 'here' as const, name: 'here', desc: 'Kaikille paikalla' },
    { id: 'all' as const, name: 'all', desc: 'Kaikille kanavalla' },
  ], []);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    const peopleMatches = members
      .filter(m => !q || m.name.toLowerCase().includes(q) || m.id.toLowerCase().includes(q))
      .slice(0, 8);
    const broadcastMatches = broadcasts.filter(b => !q || b.name.startsWith(q));
    return [...broadcastMatches, ...peopleMatches];
  }, [members, query, broadcasts]);

  // Pidä valittu indeksi rajoissa
  useEffect(() => {
    if (selectedIndex >= filtered.length) onIndexChange(Math.max(0, filtered.length - 1));
  }, [filtered.length, selectedIndex, onIndexChange]);

  if (filtered.length === 0) return null;

  // Sijoitus: anchor-elementin yläpuolelle
  const rect = anchorEl?.getBoundingClientRect();
  const top = rect ? rect.top - 8 : 0;
  const left = rect ? rect.left : 0;

  return (
    <div
      ref={listRef}
      role="listbox"
      style={{
        position: 'fixed',
        bottom: rect ? `calc(100vh - ${top}px)` : 100,
        left,
        background: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--r)',
        boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
        padding: '0.3rem',
        minWidth: 240,
        maxWidth: 320,
        zIndex: 100,
        display: 'grid',
        gap: 1,
      }}
    >
      {filtered.map((item, idx) => {
        const isMember = 'teamId' in item;
        const active = idx === selectedIndex;
        const initial = (item.name || '?')[0].toUpperCase();
        return (
          <button
            key={item.id}
            role="option"
            aria-selected={active}
            onMouseEnter={() => onIndexChange(idx)}
            onClick={() => onSelect(isMember ? (item as OrgTeamMember) : item)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.55rem',
              padding: '0.45rem 0.6rem',
              background: active ? 'var(--paper-d)' : 'transparent',
              border: 'none',
              borderRadius: 'var(--r)',
              cursor: 'pointer',
              textAlign: 'left',
              width: '100%',
            }}
          >
            <span style={{
              width: 24, height: 24, borderRadius: 5, flexShrink: 0,
              background: isMember ? 'var(--pri)' : 'var(--ink2)',
              color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.7rem',
            }}>{isMember ? initial : '@'}</span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--t1)' }}>
                {isMember ? item.name : `@${item.name}`}
              </div>
              <div style={{ fontSize: '0.66rem', color: 'var(--t3)' }}>
                {isMember ? (item as OrgTeamMember).role || 'Tiimin jäsen' : (item as { desc: string }).desc}
              </div>
            </span>
          </button>
        );
      })}
    </div>
  );
}
