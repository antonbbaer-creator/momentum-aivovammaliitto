'use client';

/* MessageItem — yksittäinen viesti.
 * Sisältää: avatar, nimi, aikaleima, body (markdown), reaktiot, thread-linkki, hover-actionit.
 */

import { useRef, useState } from 'react';
import { Message, formatTimestamp, Reaction } from '@/lib/chat-shared';
import { OrgTeam, OrgTeamMember } from '@/lib/team-shared';
import { MOMENTUM_BOT_ID, MOMENTUM_BOT_NAME, MOMENTUM_BOT_COLOR } from '@/lib/claude-bot';
import { renderMarkdown } from '@/lib/markdown';
import MessageActionsMenu from './MessageActionsMenu';
import AttachmentRenderer from './AttachmentRenderer';

interface Props {
  msg: Message;
  prev: Message | null;
  myId: string | null;
  teamMembers: OrgTeamMember[];
  orgTeams: OrgTeam[];
  onReact: (emoji: string) => void;
  onReply: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onCopyLink: () => void;
  onOpenThread?: () => void;
  highlight?: boolean;
}

export default function MessageItem({
  msg, prev, myId, teamMembers, orgTeams,
  onReact, onReply, onEdit, onDelete, onCopyLink, onOpenThread, highlight,
}: Props) {
  const [hover, setHover] = useState(false);
  const [mobileSheet, setMobileSheet] = useState(false);
  const longPressTimer = useRef<number | null>(null);

  const collapsed = !!prev
    && prev.authorId === msg.authorId
    && (msg.createdAt - prev.createdAt) < 5 * 60 * 1000
    && !msg.threadId
    && !prev.threadId;

  const isBot = msg.authorId === MOMENTUM_BOT_ID || msg.authorId === 'claude-bot';
  const author = isBot ? null : teamMembers.find(m => m.id === msg.authorId);
  const authorTeam = author ? orgTeams.find(t => t.id === author.teamId) : null;
  const avatarColor = isBot ? MOMENTUM_BOT_COLOR : (authorTeam?.color || 'var(--pri)');
  const isMe = msg.authorId === myId;
  const displayedAuthorName = isBot ? MOMENTUM_BOT_NAME : msg.authorName;

  const resolveMention = (id: string): string | null => {
    if (id === 'here' || id === 'all') return id;
    const m = teamMembers.find(x => x.id === id);
    return m?.name || null;
  };

  const onTouchStart = () => {
    if (longPressTimer.current) window.clearTimeout(longPressTimer.current);
    longPressTimer.current = window.setTimeout(() => {
      setMobileSheet(true);
      // haptinen vibrointi jos selain tukee
      if ('vibrate' in navigator) {
        try { navigator.vibrate(10); } catch { /* ignore */ }
      }
    }, 500);
  };
  const cancelLongPress = () => {
    if (longPressTimer.current) {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const reactions = (msg.reactions || []).filter((r: Reaction) => r.userIds.length > 0);

  const bodyHtml = msg.deletedAt
    ? '<em style="color: var(--t3)">viesti poistettu</em>'
    : renderMarkdown(msg.text || '', { resolveMention });

  return (
    <div
      data-message-id={msg.id}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onTouchStart={onTouchStart}
      onTouchEnd={cancelLongPress}
      onTouchMove={cancelLongPress}
      onTouchCancel={cancelLongPress}
      style={{
        position: 'relative',
        display: 'flex',
        gap: '.65rem',
        padding: collapsed ? '.15rem 0' : '.4rem 0',
        alignItems: 'flex-start',
        background: highlight ? 'rgba(5,107,159,.10)' : 'transparent',
        transition: 'background 0.6s ease-out',
        borderRadius: highlight ? 4 : 0,
      }}
    >
      <div style={{ width: 32, flexShrink: 0 }}>
        {!collapsed && (
          <div style={{
            width: 32, height: 32, borderRadius: 6,
            background: avatarColor, color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 700, fontSize: '.82rem',
            fontFamily: 'var(--font-display)',
            overflow: 'hidden',
          }}>
            {msg.authorAvatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={msg.authorAvatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              (displayedAuthorName || '?')[0]
            )}
          </div>
        )}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        {!collapsed && (
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '.5rem', marginBottom: '.15rem' }}>
            <span style={{
              fontSize: '.82rem',
              fontWeight: 700,
              color: isBot ? MOMENTUM_BOT_COLOR : (isMe ? 'var(--pri-l)' : 'var(--t1)'),
            }}>
              {displayedAuthorName}
              {isBot && (
                <span style={{
                  fontSize: '.55rem', marginLeft: '.35rem', padding: '.1rem .35rem',
                  borderRadius: 3, background: `${MOMENTUM_BOT_COLOR}20`, color: MOMENTUM_BOT_COLOR,
                  fontWeight: 600, letterSpacing: '.04em', textTransform: 'uppercase',
                }}>AI</span>
              )}
            </span>
            <span style={{ fontSize: '.62rem', color: 'var(--t3)' }}>
              {formatTimestamp(msg.createdAt)}
            </span>
            {msg.editedAt && (
              <span style={{ fontSize: '.6rem', color: 'var(--t3)' }} title="Muokattu">
                · muokattu
              </span>
            )}
          </div>
        )}
        <div
          className="chat-msg-body"
          style={{
            fontSize: '.88rem',
            color: 'var(--t1)',
            lineHeight: 1.5,
            wordBreak: 'break-word',
          }}
          dangerouslySetInnerHTML={{ __html: bodyHtml }}
        />

        {/* Liitteet */}
        {msg.attachments && msg.attachments.length > 0 && (
          <AttachmentRenderer attachments={msg.attachments} />
        )}

        {/* Reaktiot */}
        {reactions.length > 0 && (
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
            {reactions.map(r => {
              const mine = !!myId && r.userIds.includes(myId);
              return (
                <button
                  key={r.emoji}
                  onClick={() => onReact(r.emoji)}
                  style={{
                    background: mine ? 'rgba(5,107,159,0.12)' : 'var(--paper-l)',
                    border: `1px solid ${mine ? 'var(--pri)' : 'var(--border)'}`,
                    borderRadius: 12,
                    padding: '1px 7px',
                    fontSize: '0.76rem',
                    cursor: 'pointer',
                    color: mine ? 'var(--pri)' : 'var(--t2)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  <span>{r.emoji}</span>
                  <span style={{ fontSize: '0.7rem', fontWeight: 600 }}>{r.userIds.length}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Thread-pikkulinkki */}
        {!msg.threadId && msg.replyCount && msg.replyCount > 0 && onOpenThread && (
          <button
            onClick={onOpenThread}
            style={{
              marginTop: 4,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontSize: '0.74rem',
              color: 'var(--pri)',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: '2px 0',
            }}
          >
            <span>💬</span>
            <span style={{ fontWeight: 600 }}>{msg.replyCount} {msg.replyCount === 1 ? 'vastaus' : 'vastausta'}</span>
            <span style={{ color: 'var(--t3)' }}>· Avaa thread</span>
          </button>
        )}
      </div>

      {/* Hover-actionit (desktop) */}
      {hover && !msg.deletedAt && (
        <div style={{ position: 'absolute', top: -16, right: 8, opacity: 1, pointerEvents: 'auto' }}>
          <MessageActionsMenu
            isOwn={isMe}
            onReact={onReact}
            onReply={onReply}
            onEdit={isMe ? onEdit : undefined}
            onDelete={isMe ? onDelete : undefined}
            onCopyLink={onCopyLink}
          />
        </div>
      )}

      {/* Long-press bottom-sheet (mobile) */}
      {mobileSheet && !msg.deletedAt && (
        <MessageActionsMenu
          isOwn={isMe}
          isMobileSheet
          onClose={() => setMobileSheet(false)}
          onReact={(e) => { onReact(e); setMobileSheet(false); }}
          onReply={() => { onReply(); setMobileSheet(false); }}
          onEdit={isMe && onEdit ? () => { onEdit(); setMobileSheet(false); } : undefined}
          onDelete={isMe && onDelete ? () => { onDelete(); setMobileSheet(false); } : undefined}
          onCopyLink={() => { onCopyLink(); setMobileSheet(false); }}
        />
      )}
    </div>
  );
}
