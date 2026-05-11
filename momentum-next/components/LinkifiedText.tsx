'use client';

import React from 'react';

// Tunnistaa http(s)://-, www.- ja drive.google.com-tyyliset URLit ja renderoi
// ne klikattavina linkkeina. Plain text muuten sellaisenaan.
const URL_RE = /(https?:\/\/[^\s<>]+|www\.[^\s<>]+)/gi;

interface Props {
  text?: string;
  style?: React.CSSProperties;
  linkStyle?: React.CSSProperties;
}

export default function LinkifiedText({ text, style, linkStyle }: Props) {
  if (!text) return null;
  const parts: React.ReactNode[] = [];
  let lastIdx = 0;
  let key = 0;
  for (const match of text.matchAll(URL_RE)) {
    const url = match[0];
    const idx = match.index ?? 0;
    if (idx > lastIdx) parts.push(text.slice(lastIdx, idx));
    const href = url.startsWith('www.') ? `https://${url}` : url;
    parts.push(
      <a
        key={`l${key++}`}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={e => e.stopPropagation()}
        style={{ color: 'var(--pri-l, #9b7cf6)', textDecoration: 'underline', wordBreak: 'break-all', ...linkStyle }}
      >
        {url}
      </a>
    );
    lastIdx = idx + url.length;
  }
  if (lastIdx < text.length) parts.push(text.slice(lastIdx));
  return <span style={style}>{parts}</span>;
}
