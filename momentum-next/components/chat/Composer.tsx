'use client';

/* Composer — viestin kirjoituskenttä.
 * - Markdown-pikanäppäimet Cmd+B / Cmd+I
 * - @-picker auto-completella
 * - Emoji-picker
 * - Tiedostolataus (drag-drop + klikkaus)
 * - Enter lähettää, Shift+Enter rivinvaihto
 */

import { useEffect, useRef, useState } from 'react';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '@/lib/firebase';
import { useToast } from '@/lib/toast';
import { Attachment } from '@/lib/chat-shared';
import { OrgTeamMember } from '@/lib/team-shared';
import MentionPicker from './MentionPicker';
import EmojiPicker from './EmojiPicker';
import AttachmentRenderer from './AttachmentRenderer';

interface Props {
  members: OrgTeamMember[];
  channelId: string;
  orgId: string;
  placeholder?: string;
  onSend: (text: string, mentions: string[], attachments: Attachment[]) => void;
  disabled?: boolean;
  autoFocus?: boolean;
  small?: boolean;        // Thread-paneelissa kapeampi
}

const MAX_FILE_SIZE = 20 * 1024 * 1024;
const IMAGE_RE = /\.(jpe?g|png|gif|webp)$/i;

export default function Composer({
  members, channelId, orgId, placeholder, onSend, disabled, autoFocus, small,
}: Props) {
  const { toast } = useToast();
  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState('');
  const [pendingAttachments, setPendingAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  // Mention-pickerin tila
  const [mentionState, setMentionState] = useState<{
    active: boolean;
    query: string;
    start: number;     // @-merkin paikka draftissa
    selected: number;
  }>({ active: false, query: '', start: -1, selected: 0 });

  // Auto-focus uutta kanavaa avattaessa
  useEffect(() => {
    if (autoFocus && taRef.current) taRef.current.focus();
  }, [autoFocus, channelId]);

  // Auto-resize textarea
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, small ? 100 : 200) + 'px';
  }, [draft, small]);

  // Mention-picker -tilan päivitys cursorin perusteella
  const updateMentionState = (text: string, cursor: number) => {
    // Etsi viimeisin @ ennen cursoria, jolla ei ole välilyöntiä välissä
    const before = text.slice(0, cursor);
    const lastAt = before.lastIndexOf('@');
    if (lastAt < 0) {
      setMentionState(s => s.active ? { ...s, active: false } : s);
      return;
    }
    const between = before.slice(lastAt + 1);
    if (/\s/.test(between) || between.length > 30) {
      setMentionState(s => s.active ? { ...s, active: false } : s);
      return;
    }
    // Tarkista että edellinen merkki on whitespace tai start (ei keskellä sanaa)
    const charBefore = lastAt > 0 ? text[lastAt - 1] : '';
    if (charBefore && !/\s/.test(charBefore)) {
      setMentionState(s => s.active ? { ...s, active: false } : s);
      return;
    }
    setMentionState({ active: true, query: between, start: lastAt, selected: 0 });
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setDraft(value);
    updateMentionState(value, e.target.selectionStart || value.length);
  };

  const insertMention = (m: OrgTeamMember | { id: 'here' | 'all'; name: string }) => {
    const ta = taRef.current;
    if (!ta || mentionState.start < 0) return;
    const id = m.id;
    const name = m.name;
    // Composeriin upotetaan @[id|name]-muoto, joka markdown.ts renderöi spaniksi.
    const replacement = id === 'here' || id === 'all'
      ? `@${name}`
      : `@[${id}|${name}]`;
    const cursor = ta.selectionStart || draft.length;
    const newText = draft.slice(0, mentionState.start) + replacement + ' ' + draft.slice(cursor);
    setDraft(newText);
    setMentionState({ active: false, query: '', start: -1, selected: 0 });
    // Aseta cursor mention-tagin jälkeen
    requestAnimationFrame(() => {
      if (ta) {
        const newPos = mentionState.start + replacement.length + 1;
        ta.selectionStart = ta.selectionEnd = newPos;
        ta.focus();
      }
    });
  };

  const insertEmoji = (emoji: string) => {
    const ta = taRef.current;
    const cursor = ta?.selectionStart ?? draft.length;
    const newText = draft.slice(0, cursor) + emoji + draft.slice(cursor);
    setDraft(newText);
    requestAnimationFrame(() => {
      if (ta) {
        ta.selectionStart = ta.selectionEnd = cursor + emoji.length;
        ta.focus();
      }
    });
  };

  const wrapSelection = (left: string, right: string = left) => {
    const ta = taRef.current;
    if (!ta) return;
    const start = ta.selectionStart || 0;
    const end = ta.selectionEnd || 0;
    const selected = draft.slice(start, end) || 'teksti';
    const newText = draft.slice(0, start) + left + selected + right + draft.slice(end);
    setDraft(newText);
    requestAnimationFrame(() => {
      ta.selectionStart = start + left.length;
      ta.selectionEnd = start + left.length + selected.length;
      ta.focus();
    });
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Mention picker -näppäilyt
    if (mentionState.active) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionState(s => ({ ...s, selected: s.selected + 1 }));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionState(s => ({ ...s, selected: Math.max(0, s.selected - 1) }));
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setMentionState(s => ({ ...s, active: false }));
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        // Picker hoitaa valinnan onSelectin kautta — emme estä Enteriä jos
        // lista on tyhjä (silloin se lähettää viestin).
        const filtered = filterMembers(members, mentionState.query);
        if (filtered.length > 0) {
          e.preventDefault();
          const idx = Math.min(mentionState.selected, filtered.length - 1);
          insertMention(filtered[idx]);
          return;
        }
      }
    }

    // Markdown-pikanäppäimet
    if ((e.metaKey || e.ctrlKey) && !e.shiftKey) {
      if (e.key === 'b') { e.preventDefault(); wrapSelection('**'); return; }
      if (e.key === 'i') { e.preventDefault(); wrapSelection('*'); return; }
      if (e.key === 'e') { e.preventDefault(); wrapSelection('`'); return; }
    }

    // Lähetä Enterillä (ei Shift). Skipataan IME-composition (jp/kr/zh).
    const native = e.nativeEvent as KeyboardEvent;
    if (e.key === 'Enter' && !e.shiftKey && !native.isComposing) {
      e.preventDefault();
      doSend();
    }
  };

  const filterMembers = (list: OrgTeamMember[], q: string) => {
    const lq = q.toLowerCase().trim();
    if (!lq) return list.slice(0, 8);
    return list
      .filter(m => m.name.toLowerCase().includes(lq) || m.id.toLowerCase().includes(lq))
      .slice(0, 8);
  };

  const extractMentions = (text: string): string[] => {
    const out = new Set<string>();
    text.replace(/@\[([^\]|]+)\|[^\]]+\]/g, (_, id) => { out.add(id); return ''; });
    text.replace(/@(here|all|kaikki|kanava)\b/gi, (_, kw) => {
      out.add(kw.toLowerCase() === 'kaikki' || kw.toLowerCase() === 'kanava' ? 'all' : kw.toLowerCase());
      return '';
    });
    return Array.from(out);
  };

  const doSend = () => {
    const text = draft.trim();
    if (!text && pendingAttachments.length === 0) return;
    if (uploading || disabled) return;
    onSend(text, extractMentions(text), pendingAttachments);
    setDraft('');
    setPendingAttachments([]);
    setMentionState({ active: false, query: '', start: -1, selected: 0 });
  };

  const handleFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setUploading(true);
    const newAttachments: Attachment[] = [];
    for (const file of Array.from(fileList)) {
      if (file.size > MAX_FILE_SIZE) {
        toast(`${file.name}: liian suuri (max ${MAX_FILE_SIZE / 1024 / 1024} MB)`, 'error');
        continue;
      }
      try {
        const id = `att_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const safeName = file.name.replace(/\s+/g, '_');
        const path = `chat/${orgId}/${channelId}/${id}_${safeName}`;
        const ref = storageRef(storage, path);
        await uploadBytes(ref, file);
        const url = await getDownloadURL(ref);
        const ext = (file.name.split('.').pop() || '').toLowerCase();
        newAttachments.push({
          id,
          name: file.name,
          url,
          size: file.size,
          ext,
          isImage: IMAGE_RE.test(file.name) || file.type.startsWith('image/'),
        });
      } catch (e) {
        console.error('upload failed', e);
        toast(`${file.name}: lataus epäonnistui`, 'error');
      }
    }
    setPendingAttachments(prev => [...prev, ...newAttachments]);
    setUploading(false);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    handleFiles(e.dataTransfer.files);
  };

  const onPaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const files: File[] = [];
    for (const item of Array.from(items)) {
      if (item.kind === 'file') {
        const f = item.getAsFile();
        if (f) files.push(f);
      }
    }
    if (files.length > 0) {
      e.preventDefault();
      const dt = new DataTransfer();
      files.forEach(f => dt.items.add(f));
      handleFiles(dt.files);
    }
  };

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
      style={{
        position: 'relative',
        border: dragOver ? '2px dashed var(--pri)' : '1px solid var(--border)',
        borderRadius: 'var(--r)',
        background: 'var(--elev)',
        padding: small ? '.4rem .5rem' : '.5rem .65rem',
      }}
    >
      {dragOver && (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(5,107,159,.10)', borderRadius: 'var(--r)',
          fontSize: '.85rem', color: 'var(--pri)', pointerEvents: 'none',
        }}>
          Pudota liitteet tähän
        </div>
      )}

      {pendingAttachments.length > 0 && (
        <AttachmentRenderer
          attachments={pendingAttachments}
          onRemove={(id) => setPendingAttachments(prev => prev.filter(a => a.id !== id))}
        />
      )}

      <div style={{ display: 'flex', alignItems: 'flex-end', gap: '.5rem' }}>
        <textarea
          ref={taRef}
          value={draft}
          onChange={handleChange}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          placeholder={placeholder || 'Kirjoita viesti…'}
          rows={1}
          disabled={disabled}
          style={{
            flex: 1,
            background: 'transparent',
            border: 'none',
            outline: 'none',
            resize: 'none',
            fontSize: '.88rem',
            color: 'var(--t1)',
            fontFamily: 'inherit',
            lineHeight: 1.5,
            minHeight: 22,
            maxHeight: small ? 100 : 200,
          }}
        />

        <div style={{ display: 'flex', gap: 4, position: 'relative' }}>
          <input
            ref={fileRef}
            type="file"
            multiple
            style={{ display: 'none' }}
            onChange={(e) => handleFiles(e.target.files)}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            aria-label="Lisää liite"
            style={{ background: 'transparent', border: 'none', cursor: uploading ? 'wait' : 'pointer', padding: 4, fontSize: '1.05rem', color: 'var(--t2)' }}
          >📎</button>
          <button
            type="button"
            onClick={() => setEmojiOpen(s => !s)}
            aria-label="Lisää emoji"
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 4, fontSize: '1.05rem' }}
          >😊</button>
          {emojiOpen && (
            <EmojiPicker
              onSelect={insertEmoji}
              onClose={() => setEmojiOpen(false)}
            />
          )}

          <button
            type="button"
            onClick={doSend}
            disabled={(!draft.trim() && pendingAttachments.length === 0) || uploading || disabled}
            style={{
              background: (draft.trim() || pendingAttachments.length > 0) && !uploading ? 'var(--pri)' : 'var(--bg)',
              color: (draft.trim() || pendingAttachments.length > 0) && !uploading ? '#fff' : 'var(--t3)',
              border: 'none',
              borderRadius: 6,
              padding: '.4rem .75rem',
              fontSize: '.78rem',
              fontWeight: 700,
              cursor: ((draft.trim() || pendingAttachments.length > 0) && !uploading) ? 'pointer' : 'not-allowed',
              flexShrink: 0,
            }}
          >{uploading ? '...' : 'Lähetä'}</button>
        </div>
      </div>

      {mentionState.active && (
        <MentionPicker
          members={members}
          query={mentionState.query}
          selectedIndex={mentionState.selected}
          onSelect={insertMention}
          onIndexChange={(n) => setMentionState(s => ({ ...s, selected: n }))}
          anchorEl={taRef.current}
        />
      )}
    </div>
  );
}
