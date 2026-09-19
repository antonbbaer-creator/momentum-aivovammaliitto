'use client';

// Kevyt markdown-renderöinti AI-Hetkin viesteille: otsikot, listat, kappaleet,
// lihavointi ja kursiivi. Ei ulkoista kirjastoa — viestit ovat agenttien
// tuottamaa tekstiä, jonka rakenne on yksinkertainen.

import { Fragment, type ReactNode } from 'react';

function inline(text: string, key: string): ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);
  return (
    <Fragment key={key}>
      {parts.map((p, i) => {
        if (p.startsWith('**') && p.endsWith('**')) return <strong key={i}>{p.slice(2, -2)}</strong>;
        if (p.startsWith('*') && p.endsWith('*') && p.length > 2) return <em key={i}>{p.slice(1, -1)}</em>;
        return <Fragment key={i}>{p}</Fragment>;
      })}
    </Fragment>
  );
}

export default function AiHetkiMarkdown({ text }: { text: string }) {
  const lines = text.replace(/\r/g, '').split('\n');
  const blocks: ReactNode[] = [];
  let para: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;

  const flushPara = () => {
    if (para.length) {
      blocks.push(<p key={`p${blocks.length}`} style={{ margin: '0 0 .75rem', lineHeight: 1.65 }}>{inline(para.join(' '), 'p')}</p>);
      para = [];
    }
  };
  const flushList = () => {
    if (list) {
      const Tag = list.ordered ? 'ol' : 'ul';
      blocks.push(
        <Tag key={`l${blocks.length}`} style={{ margin: '0 0 .75rem', paddingLeft: '1.4rem', lineHeight: 1.6 }}>
          {list.items.map((it, i) => <li key={i} style={{ marginBottom: '.25rem' }}>{inline(it, `li${i}`)}</li>)}
        </Tag>
      );
      list = null;
    }
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    const ul = line.match(/^[-*•]\s+(.*)$/);
    const ol = line.match(/^\d+[.)]\s+(.*)$/);
    if (line.trim() === '') { flushPara(); flushList(); continue; }
    if (h) {
      flushPara(); flushList();
      const level = h[1].length;
      blocks.push(
        <div key={`h${blocks.length}`} style={{
          fontFamily: 'var(--font-display)', fontSize: level <= 2 ? '.8rem' : '.72rem', letterSpacing: '.08em',
          textTransform: 'uppercase', color: 'var(--t2)', margin: '1rem 0 .5rem',
        }}>{inline(h[2], 'h')}</div>
      );
      continue;
    }
    if (ul || ol) {
      flushPara();
      const ordered = !!ol;
      if (!list || list.ordered !== ordered) { flushList(); list = { ordered, items: [] }; }
      list.items.push((ul ?? ol)![1]);
      continue;
    }
    if (list && line.startsWith('  ')) { list.items[list.items.length - 1] += ' ' + line.trim(); continue; }
    flushList();
    para.push(line.trim());
  }
  flushPara(); flushList();
  return <div style={{ fontSize: '.92rem', color: 'var(--t1)' }}>{blocks}</div>;
}
