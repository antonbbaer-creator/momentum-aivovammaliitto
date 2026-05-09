'use client';

/* MessageActionsMenu — kelluva nappirivi viestin kohdalla.
 *  Desktop: ilmestyy hover-tilassa (oikea reuna)
 *  Mobile:  ilmestyy long-press 500ms jälkeen modaalisena bottom-sheet
 */

import { useState, useRef } from 'react';
import EmojiPicker from './EmojiPicker';

interface Props {
  isOwn: boolean;
  isMobileSheet?: boolean;       // long-press-tila mobiilissa
  onReact: (emoji: string) => void;
  onReply: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onCopyLink: () => void;
  onClose?: () => void;          // mobile sheet sulkeminen
}

const QUICK_REACTIONS = ['👍', '❤️', '😂', '🎉', '👀'];

export default function MessageActionsMenu({
  isOwn, isMobileSheet, onReact, onReply, onEdit, onDelete, onCopyLink, onClose,
}: Props) {
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const buttons = (
    <>
      {QUICK_REACTIONS.map(e => (
        <button
          key={e}
          onClick={() => onReact(e)}
          aria-label={`Reagoi ${e}`}
          style={{
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            padding: isMobileSheet ? '0.6rem 0.4rem' : '0.25rem 0.4rem',
            fontSize: isMobileSheet ? '1.4rem' : '1rem',
            borderRadius: 4,
          }}
          onMouseEnter={(ev) => (ev.currentTarget.style.background = 'var(--paper-d)')}
          onMouseLeave={(ev) => (ev.currentTarget.style.background = 'transparent')}
        >{e}</button>
      ))}
      <div style={{ position: 'relative', display: 'inline-block' }}>
        <button
          onClick={() => setEmojiPickerOpen(s => !s)}
          aria-label="Lisää reaktio"
          style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            padding: isMobileSheet ? '0.6rem 0.5rem' : '0.25rem 0.5rem',
            fontSize: isMobileSheet ? '1rem' : '.78rem',
            color: 'var(--t2)', fontWeight: 700,
          }}
        >+</button>
        {emojiPickerOpen && (
          <EmojiPicker
            onSelect={(emoji) => { onReact(emoji); setEmojiPickerOpen(false); }}
            onClose={() => setEmojiPickerOpen(false)}
          />
        )}
      </div>
      <span style={{ width: 1, height: 18, background: 'var(--border)', margin: '0 4px' }} />
      <button onClick={onReply} className="btn btn-ghost" style={{ fontSize: '.7rem', padding: isMobileSheet ? '0.5rem 0.7rem' : '.25rem .5rem' }}>
        ↩ Vastaa
      </button>
      <button onClick={onCopyLink} className="btn btn-ghost" style={{ fontSize: '.7rem', padding: isMobileSheet ? '0.5rem 0.7rem' : '.25rem .5rem' }}>
        🔗 Linkki
      </button>
      {isOwn && onEdit && (
        <button onClick={onEdit} className="btn btn-ghost" style={{ fontSize: '.7rem', padding: isMobileSheet ? '0.5rem 0.7rem' : '.25rem .5rem' }}>
          ✎ Muokkaa
        </button>
      )}
      {isOwn && onDelete && (
        <button onClick={onDelete} className="btn btn-ghost" style={{ fontSize: '.7rem', padding: isMobileSheet ? '0.5rem 0.7rem' : '.25rem .5rem', color: 'var(--red)' }}>
          🗑 Poista
        </button>
      )}
    </>
  );

  if (isMobileSheet) {
    return (
      <div
        onClick={onClose}
        role="dialog"
        aria-modal="true"
        style={{
          position: 'fixed', inset: 0, zIndex: 200,
          background: 'rgba(0,0,0,0.4)',
          display: 'flex', alignItems: 'flex-end',
        }}
      >
        <div
          ref={containerRef}
          onClick={(e) => e.stopPropagation()}
          style={{
            background: 'var(--card)',
            borderTopLeftRadius: 16,
            borderTopRightRadius: 16,
            boxShadow: '0 -4px 24px rgba(0,0,0,0.2)',
            padding: '1rem',
            width: '100%',
            display: 'flex',
            flexWrap: 'wrap',
            gap: 4,
            justifyContent: 'center',
          }}
        >
          {buttons}
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      style={{
        position: 'absolute',
        top: -16,
        right: 8,
        background: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--r)',
        padding: 2,
        display: 'flex',
        gap: 0,
        boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
        opacity: 0,
        pointerEvents: 'none',
        transition: 'opacity 0.12s',
      }}
      data-message-actions
    >
      {buttons}
    </div>
  );
}
