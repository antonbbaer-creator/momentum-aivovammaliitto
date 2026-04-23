'use client';

import React from 'react';

// Pieni markdown-renderöijä AI-chat-viesteihin.
// Tukee: # ## ### otsikot, **bold**, *italic*, `inline code`, - * + ranskalaiset viivat,
// tyhjät rivit (kappalerajana), linkit [teksti](url).
//
// Emme käytä kokonaista markdown-kirjastoa koska tarpeet ovat kapeat ja
// bundle-koko on tärkeä. Tämä on tarpeeksi hyvä AI-vastauksille.

interface Props {
  text: string;
  style?: React.CSSProperties;
}

export default function MarkdownText({ text, style }: Props) {
  const lines = text.split('\n');
  const blocks: React.ReactNode[] = [];
  let currentList: React.ReactNode[] | null = null;
  let currentListOrdered = false;
  let key = 0;

  const flushList = () => {
    if (currentList && currentList.length > 0) {
      const items = currentList;
      if (currentListOrdered) {
        blocks.push(
          <ol key={`ol-${key++}`} style={{ margin: '.4rem 0 .4rem 1.3rem', padding: 0, listStyleType: 'decimal' }}>
            {items}
          </ol>
        );
      } else {
        blocks.push(
          <ul key={`ul-${key++}`} style={{ margin: '.4rem 0 .4rem 1.3rem', padding: 0, listStyleType: 'disc' }}>
            {items}
          </ul>
        );
      }
    }
    currentList = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Tyhjä rivi = rivinvaihto/kappale
    if (trimmed === '') {
      flushList();
      blocks.push(<div key={`br-${key++}`} style={{ height: '.5rem' }} />);
      continue;
    }

    // Otsikot
    const h3 = trimmed.match(/^###\s+(.*)$/);
    const h2 = trimmed.match(/^##\s+(.*)$/);
    const h1 = trimmed.match(/^#\s+(.*)$/);
    if (h3 || h2 || h1) {
      flushList();
      const content = (h3?.[1] || h2?.[1] || h1?.[1]) as string;
      const size = h1 ? '1.05rem' : h2 ? '.96rem' : '.88rem';
      blocks.push(
        <div key={`h-${key++}`} style={{ fontSize: size, fontWeight: 700, margin: '.6rem 0 .3rem', lineHeight: 1.35 }}>
          {renderInline(content)}
        </div>
      );
      continue;
    }

    // Numeroitu lista: "1. teksti"
    const ol = trimmed.match(/^(\d+)\.\s+(.*)$/);
    if (ol) {
      if (currentList === null || !currentListOrdered) {
        flushList();
        currentList = [];
        currentListOrdered = true;
      }
      currentList.push(
        <li key={`li-${key++}`} style={{ marginBottom: '.15rem', lineHeight: 1.6 }}>
          {renderInline(ol[2])}
        </li>
      );
      continue;
    }

    // Ranskalainen viiva: "- teksti" tai "* teksti" tai "+ teksti"
    const ul = trimmed.match(/^[-*+]\s+(.*)$/);
    if (ul) {
      if (currentList === null || currentListOrdered) {
        flushList();
        currentList = [];
        currentListOrdered = false;
      }
      currentList.push(
        <li key={`li-${key++}`} style={{ marginBottom: '.15rem', lineHeight: 1.6 }}>
          {renderInline(ul[1])}
        </li>
      );
      continue;
    }

    // Tavallinen kappale
    flushList();
    blocks.push(
      <div key={`p-${key++}`} style={{ lineHeight: 1.65, marginBottom: '.25rem' }}>
        {renderInline(line)}
      </div>
    );
  }
  flushList();

  return <div style={style}>{blocks}</div>;
}

// Inline-markdown: **bold**, *italic*, `code`, [teksti](url)
function renderInline(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;

  // Yksi regex joka matchaa minkä tahansa seuraavista: **bold** *italic* `code` [link](url)
  // Ajetaan iteratiivisesti, koska parilliset **-merkit voivat esiintyä useasti.
  const PATTERN = /(\*\*([^*\n]+?)\*\*|\*([^*\n]+?)\*|`([^`\n]+?)`|\[([^\]]+?)\]\(([^)]+?)\))/;

  while (remaining.length > 0) {
    const match = remaining.match(PATTERN);
    if (!match || match.index === undefined) {
      parts.push(remaining);
      break;
    }
    const before = remaining.slice(0, match.index);
    if (before) parts.push(before);

    if (match[2] !== undefined) {
      // **bold**
      parts.push(<strong key={`b-${key++}`} style={{ fontWeight: 700 }}>{match[2]}</strong>);
    } else if (match[3] !== undefined) {
      // *italic*
      parts.push(<em key={`i-${key++}`} style={{ fontStyle: 'italic' }}>{match[3]}</em>);
    } else if (match[4] !== undefined) {
      // `code`
      parts.push(
        <code key={`c-${key++}`} style={{
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          fontSize: '.88em',
          background: 'rgba(255,255,255,.08)',
          padding: '.05em .3em',
          borderRadius: 3,
        }}>
          {match[4]}
        </code>
      );
    } else if (match[5] !== undefined && match[6] !== undefined) {
      // [link](url)
      parts.push(
        <a
          key={`a-${key++}`}
          href={match[6]}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: 'var(--pri-l)', textDecoration: 'underline' }}
        >
          {match[5]}
        </a>
      );
    }
    remaining = remaining.slice(match.index + match[0].length);
  }

  return <>{parts}</>;
}
