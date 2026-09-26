'use client';

// Aivojen markdown-näkymä: lib/brain-markdown.mjs:n puu React-elementeiksi (ei innerHTML:ää).
// [[Wikilinkit]] ovat klikattavia (Next Link), puuttuvat kohteet näkyvät katkoviivalla,
// ⚠️-kohdat korostettuina ja ```base-lohkot viittauksena koontinäkymään.

import React, { useMemo } from 'react';
import Link from 'next/link';
import { parseMarkdown, type Block, type Inline, type ListItem } from '@/lib/brain-markdown.mjs';

export interface WikiTarget { href: string | null; label: string; exists: boolean }

interface Props {
  source: string;
  resolve: (target: string, heading: string | null) => WikiTarget;
  compact?: boolean;
}

export default function BrainMarkdown({ source, resolve, compact }: Props) {
  const blocks = useMemo(() => parseMarkdown(source), [source]);
  return (
    <div className={`brain-md${compact ? ' brain-md-compact' : ''}`}>
      <Blocks blocks={blocks} resolve={resolve} />
      <style>{CSS}</style>
    </div>
  );
}

function Blocks({ blocks, resolve }: { blocks: Block[]; resolve: Props['resolve'] }) {
  return <>{blocks.map((b, i) => <BlockView key={i} b={b} resolve={resolve} />)}</>;
}

function BlockView({ b, resolve }: { b: Block; resolve: Props['resolve'] }) {
  switch (b.t) {
    case 'heading': {
      const Tag = (`h${Math.min(b.level + 1, 6)}`) as 'h2';
      return <Tag id={b.id}><Inlines nodes={b.c} resolve={resolve} /></Tag>;
    }
    case 'paragraph':
      return b.review
        ? <p className="brain-review"><span className="brain-review-tag">Vahvistettava</span><Inlines nodes={b.c} resolve={resolve} /></p>
        : <p><Inlines nodes={b.c} resolve={resolve} /></p>;
    case 'list': {
      const items = b.items.map((it, i) => <Item key={i} it={it} resolve={resolve} />);
      return b.ordered ? <ol start={b.start}>{items}</ol> : <ul>{items}</ul>;
    }
    case 'quote':
      return (
        <blockquote className={b.callout ? `brain-callout brain-callout-${calloutTone(b.callout)}` : undefined}>
          {b.callout && <div className="brain-callout-title">{b.title ? <Inlines nodes={b.title} resolve={resolve} /> : calloutLabel(b.callout)}</div>}
          <Blocks blocks={b.c} resolve={resolve} />
        </blockquote>
      );
    case 'codeblock':
      return <pre><code>{b.v}</code></pre>;
    case 'base':
      return <div className="brain-base">Obsidianin tietokantanäkymä. Momentumissa vastaava taulukko on Koti-näkymässä.</div>;
    case 'table':
      return (
        <div className="brain-table-wrap" tabIndex={0} role="region" aria-label="Taulukko">
          <table>
            <thead><tr>{b.head.map((c, i) => <th key={i} style={{ textAlign: b.align[i] || undefined }}><Inlines nodes={c} resolve={resolve} /></th>)}</tr></thead>
            <tbody>{b.rows.map((r, ri) => <tr key={ri}>{r.map((c, ci) => <td key={ci} style={{ textAlign: b.align[ci] || undefined }}><Inlines nodes={c} resolve={resolve} /></td>)}</tr>)}</tbody>
          </table>
        </div>
      );
    case 'hr':
      return <hr />;
  }
}

function Item({ it, resolve }: { it: ListItem; resolve: Props['resolve'] }) {
  const body = <Blocks blocks={it.c} resolve={resolve} />;
  if (it.task !== null) {
    return (
      <li className={`brain-task${it.review ? ' brain-review-li' : ''}`}>
        <span className={`brain-check${it.task ? ' done' : ''}`} role="img" aria-label={it.task ? 'Tehty' : 'Tekemättä'}>{it.task ? '✓' : ''}</span>
        <div className={it.task ? 'brain-task-done' : undefined}>{body}</div>
      </li>
    );
  }
  return <li className={it.review ? 'brain-review-li' : undefined}>{body}</li>;
}

function Inlines({ nodes, resolve }: { nodes: Inline[]; resolve: Props['resolve'] }) {
  return <>{nodes.map((n, i) => <InlineView key={i} n={n} resolve={resolve} />)}</>;
}

function InlineView({ n, resolve }: { n: Inline; resolve: Props['resolve'] }) {
  switch (n.t) {
    case 'text': return <>{n.v}</>;
    case 'br': return <br />;
    case 'code': return <code>{n.v}</code>;
    case 'strong': return <strong><Inlines nodes={n.c} resolve={resolve} /></strong>;
    case 'em': return <em><Inlines nodes={n.c} resolve={resolve} /></em>;
    case 'del': return <del><Inlines nodes={n.c} resolve={resolve} /></del>;
    case 'mark': return <mark><Inlines nodes={n.c} resolve={resolve} /></mark>;
    case 'link':
      return /^https?:/i.test(n.href)
        ? <a href={n.href} target="_blank" rel="noopener noreferrer"><Inlines nodes={n.c} resolve={resolve} /></a>
        : <a href={n.href}><Inlines nodes={n.c} resolve={resolve} /></a>;
    case 'wikilink': {
      const t = resolve(n.target, n.heading);
      const text = n.alias || (n.target ? t.label : n.heading || '');
      if (!t.href || !t.exists) {
        return <span className="brain-wikilink missing" title={`Sivua "${n.target}" ei ole vielä olemassa`}>{text}</span>;
      }
      return <Link className="brain-wikilink" href={t.href}>{text}</Link>;
    }
  }
}

function calloutTone(c: string): string {
  if (['warning', 'caution', 'attention', 'danger', 'error', 'bug'].includes(c)) return 'warn';
  if (['tip', 'success', 'check', 'done', 'hint'].includes(c)) return 'ok';
  if (['question', 'help', 'faq'].includes(c)) return 'q';
  return 'info';
}

function calloutLabel(c: string): string {
  const map: Record<string, string> = { note: 'Huomio', info: 'Tieto', tip: 'Vinkki', warning: 'Varoitus', danger: 'Vaara', question: 'Kysymys', success: 'Valmis', quote: 'Lainaus', example: 'Esimerkki', todo: 'Tehtävä', abstract: 'Tiivistelmä', summary: 'Tiivistelmä' };
  return map[c] || c;
}

const CSS = `
.brain-md{font-size:15px;line-height:1.65;color:var(--t1);overflow-wrap:anywhere}
.brain-md-compact{font-size:14px}
.brain-md h2,.brain-md h3,.brain-md h4,.brain-md h5,.brain-md h6{font-family:var(--font-display);font-weight:500;line-height:1.25;margin:1.6em 0 .5em;scroll-margin-top:80px}
.brain-md h2{font-size:1.45em}.brain-md h3{font-size:1.2em}.brain-md h4{font-size:1.05em}.brain-md h5,.brain-md h6{font-size:1em}
.brain-md>:first-child{margin-top:0}
.brain-md p{margin:.6em 0}
.brain-md ul,.brain-md ol{margin:.5em 0;padding-left:1.5em}
.brain-md li{margin:.2em 0}
.brain-md li>p{margin:.15em 0}
.brain-md a{color:var(--pri);text-decoration:underline;text-underline-offset:2px}
.brain-md code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.88em;background:var(--card2);padding:1px 5px;border-radius:4px}
.brain-md pre{background:var(--card2);padding:12px 14px;border-radius:var(--r);overflow-x:auto}
.brain-md pre code{background:none;padding:0}
.brain-md blockquote{margin:.8em 0;padding:.5em 1em;border-left:4px solid var(--border-l);color:var(--t2)}
.brain-md hr{border:0;border-top:1px solid var(--border);margin:1.5em 0}
.brain-md mark{background:rgba(241,180,52,.35);color:inherit;padding:0 2px}
.brain-table-wrap{overflow-x:auto;margin:.8em 0}
.brain-md table{border-collapse:collapse;width:100%;font-size:.93em}
.brain-md th,.brain-md td{border:1px solid var(--border);padding:6px 10px;vertical-align:top;text-align:left}
.brain-md th{background:var(--card2);font-weight:600}
.brain-wikilink{color:var(--pri);text-decoration:none;border-bottom:1px solid currentColor}
.brain-wikilink.missing{color:var(--t3);border-bottom:1px dashed currentColor;cursor:help}
.brain-review,.brain-review-li{background:rgba(193,69,69,.08);border-left:4px solid var(--red);padding:.3em .7em;border-radius:0 var(--r) var(--r) 0}
.brain-review-li{list-style-position:inside;margin-left:-1.2em}
.brain-review-tag{display:inline-block;font-family:var(--font-display);font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--red);border:1px solid var(--red);border-radius:var(--r);padding:0 6px;margin-right:8px;vertical-align:1px}
.brain-task{list-style:none;display:flex;gap:8px;align-items:flex-start;margin-left:-1.2em}
.brain-check{flex:none;width:18px;height:18px;margin-top:3px;border:2px solid var(--border-l);border-radius:4px;display:inline-flex;align-items:center;justify-content:center;font-size:12px;font-weight:700}
.brain-check.done{background:var(--green);border-color:var(--green);color:var(--paper)}
.brain-task-done{color:var(--t3);text-decoration:line-through}
.brain-callout{border-left-width:4px;border-radius:0 var(--r) var(--r) 0;background:var(--card2);color:var(--t1)}
.brain-callout-title{font-weight:600;margin-bottom:.2em}
.brain-callout-info{border-left-color:var(--hetki-blue)}
.brain-callout-warn{border-left-color:var(--red)}
.brain-callout-ok{border-left-color:var(--green)}
.brain-callout-q{border-left-color:var(--hetki-yellow)}
.brain-base{font-size:13px;color:var(--t3);border:1px dashed var(--border-l);border-radius:var(--r);padding:8px 12px;margin:.8em 0}
`;
