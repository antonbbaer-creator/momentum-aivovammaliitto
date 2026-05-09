'use client';

import { useState } from 'react';
import { Attachment } from '@/lib/chat-shared';

interface Props {
  attachments: Attachment[];
  onRemove?: (id: string) => void;
}

const fmtSize = (b: number) => {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} kB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
};

export default function AttachmentRenderer({ attachments, onRemove }: Props) {
  const [lightbox, setLightbox] = useState<Attachment | null>(null);

  if (!attachments || attachments.length === 0) return null;

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 8, marginTop: 6 }}>
        {attachments.map(a => (
          <div key={a.id} style={{ position: 'relative', border: '1px solid var(--border)', borderRadius: 'var(--r)', overflow: 'hidden', background: 'var(--paper-l)' }}>
            {a.isImage ? (
              <button
                onClick={() => setLightbox(a)}
                style={{ display: 'block', width: '100%', padding: 0, border: 'none', background: '#fff', cursor: 'pointer' }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={a.url} alt={a.name} style={{ width: '100%', maxHeight: 200, objectFit: 'cover', display: 'block' }} />
              </button>
            ) : (
              <a href={a.url} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', gap: 10, padding: '0.6rem 0.75rem', textDecoration: 'none', color: 'var(--t1)' }}>
                <span style={{
                  width: 36, height: 36, borderRadius: 6, flexShrink: 0,
                  background: 'var(--paper-d)', color: 'var(--t2)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: 'var(--font-display)', fontSize: '.65rem', fontWeight: 700,
                }}>{(a.ext || 'FILE').slice(0, 4).toUpperCase()}</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '.78rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</div>
                  <div style={{ fontSize: '.66rem', color: 'var(--t3)' }}>{fmtSize(a.size)}</div>
                </span>
              </a>
            )}
            {onRemove && (
              <button
                onClick={() => onRemove(a.id)}
                aria-label="Poista liite"
                style={{
                  position: 'absolute', top: 4, right: 4,
                  background: 'rgba(0,0,0,0.6)', color: '#fff', border: 'none',
                  borderRadius: '50%', width: 22, height: 22,
                  cursor: 'pointer', fontSize: '.7rem', lineHeight: 1,
                }}
              >×</button>
            )}
          </div>
        ))}
      </div>

      {lightbox && (
        <div
          onClick={() => setLightbox(null)}
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(0,0,0,0.85)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 24, cursor: 'zoom-out',
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightbox.url} alt={lightbox.name} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
        </div>
      )}
    </>
  );
}
