'use client';

/* EmojiPicker — pieni emoji-grid hakukentällä.
 * Käytetään composer-ikonista ja MessageActionsMenun "+"-napista.
 */

import { useState, useMemo } from 'react';
import { listEmoji } from '@/lib/markdown';

interface Props {
  onSelect: (emoji: string) => void;
  onClose: () => void;
}

const ALL = listEmoji();

export default function EmojiPicker({ onSelect, onClose }: Props) {
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return ALL;
    return ALL.filter(e => e.name.includes(q));
  }, [query]);

  return (
    <div
      role="dialog"
      style={{
        position: 'absolute',
        bottom: 'calc(100% + 8px)',
        right: 0,
        background: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--rl)',
        boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
        width: 280,
        maxHeight: 320,
        zIndex: 100,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div style={{ padding: '0.5rem', borderBottom: '1px solid var(--border)' }}>
        <input
          autoFocus
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Etsi emojeita..."
          className="input"
          style={{ fontSize: '0.78rem', padding: '0.35rem 0.5rem' }}
        />
      </div>
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '0.5rem',
        display: 'grid',
        gridTemplateColumns: 'repeat(8, 1fr)',
        gap: 4,
      }}>
        {filtered.map(({ name, emoji }) => (
          <button
            key={name}
            onClick={() => { onSelect(emoji); onClose(); }}
            title={`:${name}:`}
            style={{
              fontSize: '1.2rem',
              padding: '0.3rem',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              borderRadius: 4,
              transition: 'background 0.1s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--paper-d)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            {emoji}
          </button>
        ))}
        {filtered.length === 0 && (
          <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '1rem', fontSize: '0.78rem', color: 'var(--t3)' }}>
            Ei tuloksia
          </div>
        )}
      </div>
      <div style={{ padding: '0.4rem 0.5rem', borderTop: '1px solid var(--border)', textAlign: 'right' }}>
        <button onClick={onClose} className="btn btn-ghost" style={{ fontSize: '0.7rem', padding: '0.25rem 0.5rem' }}>Sulje</button>
      </div>
    </div>
  );
}
