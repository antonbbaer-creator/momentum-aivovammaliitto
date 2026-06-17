'use client';

import React, { useEffect, useRef } from 'react';
import { FONT_STACKS, NotebookFont, PaperStyle } from '@/lib/notebooks-shared';

// Yksi muistikirjan sivu aukeamassa: paperipinta, sivunumero ja suoraan
// sivulle kirjoitettava WYSIWYG-alue (contentEditable). Muotoilut (otsikot,
// lihavointi, listat) näkyvät heti sivulla — sisältö tallentuu HTML:nä.

interface Props {
  pageNo: number;
  side: 'l' | 'r';
  body: string;
  font: NotebookFont;
  paper: PaperStyle;
  onChange: (body: string) => void;
  onFocusEd: (el: HTMLElement, pageNo: number) => void;
}

/** Tunnistaa HTML-sisällön tagin perusteella — pelkkä '<'-alkuisuus ei riitä,
 *  koska WYSIWYG-sivu voi alkaa tekstisolmulla (esim. "Otsikko<div>...</div>"). */
const TAG_RE = /<(div|br|h[12]|ul|ol|li|p|img|b|i|strong|em|u|span|a)\b/i;
const ESCAPED_TAG_RE = /&lt;(div|br|h[12]|ul|ol|li|p|img|b|i|strong|em|u|span|a)\b/i;

/** Sisältö editoriin: HTML sellaisenaan, pelkkä teksti riveiksi.
 *  Korjaa myös aiemman tunnistusbugin takia escapatut sivut. */
const toHtml = (body: string): string => {
  if (!body.trim()) return '';
  let html = body;
  if (ESCAPED_TAG_RE.test(html)) {
    html = html.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  }
  if (TAG_RE.test(html)) return html;
  return html
    .split('\n')
    .map((line) => {
      const esc = line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      return `<div>${esc || '<br>'}</div>`;
    })
    .join('');
};

export default function PagePane({ pageNo, side, body, font, paper, onChange, onFocusEd }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const fontFamily = FONT_STACKS[font].stack;
  const paperClass = paper === 'lined' ? ' nbk-lined' : paper === 'dotted' ? ' nbk-dotted' : '';

  // contentEditable on uncontrolled: sisältö asetetaan vain mountissa
  // (PagePane mountataan key={pageNo}:lla, joten sivunvaihto saa tuoreen sisällön).
  useEffect(() => {
    if (ref.current) ref.current.innerHTML = toHtml(body);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onPaste = (e: React.ClipboardEvent) => {
    // Liitetään aina pelkkä teksti — ei vieraita tyylejä sivulle
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain');
    document.execCommand('insertText', false, text);
  };

  return (
    <div className={`nbk-page ${side}${paperClass}`}>
      <div
        ref={ref}
        className="nbk-ta nbk-ed"
        style={{ fontFamily }}
        contentEditable
        suppressContentEditableWarning
        spellCheck={false}
        onInput={(e) => onChange((e.currentTarget as HTMLDivElement).innerHTML)}
        onFocus={(e) => onFocusEd(e.currentTarget, pageNo)}
        onPaste={onPaste}
      />
      <span className={`nbk-pageno ${side}`}>{pageNo}</span>
    </div>
  );
}
