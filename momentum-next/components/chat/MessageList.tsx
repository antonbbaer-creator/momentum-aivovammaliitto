'use client';

/* MessageList — viestilistan rendering. Päivämäärä-jakajat, auto-scroll, scrollToMessageId. */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Message, groupMessagesByDay, topLevelMessages } from '@/lib/chat-shared';
import { OrgTeam, OrgTeamMember } from '@/lib/team-shared';
import MessageItem from './MessageItem';

interface Props {
  messages: Message[];
  myId: string | null;
  teamMembers: OrgTeamMember[];
  orgTeams: OrgTeam[];
  scrollToMessageId?: string | null;
  onReact: (msgId: string, emoji: string) => void;
  onReply: (msgId: string) => void;
  onEdit?: (msgId: string) => void;
  onDelete?: (msgId: string) => void;
  onCopyLink: (msgId: string) => void;
  onOpenThread: (msgId: string) => void;
  emptyState?: React.ReactNode;
}

export default function MessageList({
  messages, myId, teamMembers, orgTeams,
  scrollToMessageId, onReact, onReply, onEdit, onDelete, onCopyLink, onOpenThread,
  emptyState,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);

  const topLevel = useMemo(() => topLevelMessages(messages), [messages]);
  const grouped = useMemo(() => groupMessagesByDay(topLevel), [topLevel]);

  // Auto-scroll alas kun uusi viesti tulee
  const lastLenRef = useRef(0);
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    if (topLevel.length > lastLenRef.current) {
      // Vain jos käyttäjä oli jo "alas-scrollautuneena" (50px sisällä) auto-scrollaa
      const distFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
      if (distFromBottom < 200 || lastLenRef.current === 0) {
        container.scrollTop = container.scrollHeight;
      }
    }
    lastLenRef.current = topLevel.length;
  }, [topLevel.length]);

  // Scroll spesifiseen viestiin (push-ilmoitus klikattu)
  useEffect(() => {
    if (!scrollToMessageId) return;
    const tryScroll = () => {
      const container = containerRef.current;
      if (!container) return false;
      const target = container.querySelector(`[data-message-id="${CSS.escape(scrollToMessageId)}"]`) as HTMLElement | null;
      if (!target) return false;
      target.scrollIntoView({ block: 'center', behavior: 'smooth' });
      setHighlightId(scrollToMessageId);
      window.setTimeout(() => setHighlightId(null), 2200);
      return true;
    };
    // Yritä heti, sitten useamman kerran kun viestit ehkä ovat ladanneet
    if (tryScroll()) return;
    const t1 = window.setTimeout(tryScroll, 200);
    const t2 = window.setTimeout(tryScroll, 600);
    return () => { window.clearTimeout(t1); window.clearTimeout(t2); };
  }, [scrollToMessageId, messages.length]);

  return (
    <div
      ref={containerRef}
      style={{
        flex: 1,
        overflowY: 'auto',
        padding: '1rem 1.25rem',
        background: 'var(--bg)',
      }}
    >
      {grouped.length === 0 && emptyState}

      {grouped.map((group, gi) => (
        <div key={gi} style={{ marginBottom: '1rem' }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '.6rem',
            margin: '.5rem 0',
            fontSize: '.68rem',
            color: 'var(--t3)',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '.04em',
          }}>
            <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
            <span>{group.dateLabel}</span>
            <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
          </div>

          {group.messages.map((msg, mi) => (
            <MessageItem
              key={msg.id}
              msg={msg}
              prev={mi > 0 ? group.messages[mi - 1] : null}
              myId={myId}
              teamMembers={teamMembers}
              orgTeams={orgTeams}
              onReact={(e) => onReact(msg.id, e)}
              onReply={() => onReply(msg.id)}
              onEdit={onEdit ? () => onEdit(msg.id) : undefined}
              onDelete={onDelete ? () => onDelete(msg.id) : undefined}
              onCopyLink={() => onCopyLink(msg.id)}
              onOpenThread={() => onOpenThread(msg.id)}
              highlight={highlightId === msg.id}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
