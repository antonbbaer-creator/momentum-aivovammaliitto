'use client';

/* ThreadPanel — sivupaneeli oikealla / fullscreen mobiilissa.
 * Näyttää parent-viestin ja sen vastaukset, oman composerin lopussa.
 */

import { useMemo } from 'react';
import {
  Message, threadReplies, formatTimestamp, Attachment,
} from '@/lib/chat-shared';
import { OrgTeam, OrgTeamMember } from '@/lib/team-shared';
import { renderMarkdown } from '@/lib/markdown';
import MessageItem from './MessageItem';
import Composer from './Composer';

interface Props {
  parentMessage: Message;
  messages: Message[];
  myId: string | null;
  teamMembers: OrgTeamMember[];
  orgTeams: OrgTeam[];
  channelId: string;
  orgId: string;
  isMobile: boolean;
  onClose: () => void;
  onSendReply: (text: string, mentions: string[], attachments: Attachment[]) => void;
  onReact: (msgId: string, emoji: string) => void;
  onCopyLink: (msgId: string) => void;
}

export default function ThreadPanel({
  parentMessage, messages, myId, teamMembers, orgTeams,
  channelId, orgId, isMobile, onClose, onSendReply, onReact, onCopyLink,
}: Props) {
  const replies = useMemo(() => threadReplies(messages, parentMessage.id), [messages, parentMessage.id]);

  const resolveMention = (id: string): string | null => {
    if (id === 'here' || id === 'all') return id;
    const m = teamMembers.find(x => x.id === id);
    return m?.name || null;
  };

  const parentBodyHtml = parentMessage.deletedAt
    ? '<em style="color: var(--t3)">viesti poistettu</em>'
    : renderMarkdown(parentMessage.text || '', { resolveMention });

  return (
    <div
      style={{
        position: isMobile ? 'fixed' : 'absolute',
        top: 0, right: 0, bottom: 0,
        left: isMobile ? 0 : 'auto',
        width: isMobile ? '100%' : 380,
        background: 'var(--card)',
        borderLeft: isMobile ? 'none' : '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        zIndex: isMobile ? 100 : 5,
      }}
    >
      {/* Header */}
      <div style={{
        padding: '.85rem 1rem',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '.5rem',
        minHeight: 58,
      }}>
        <div style={{ flex: 1 }}>
          <h3 style={{ fontSize: '.9rem', fontWeight: 700, margin: 0, color: 'var(--t1)' }}>Thread</h3>
          <p style={{ fontSize: '.66rem', color: 'var(--t3)', margin: 0 }}>
            {replies.length} {replies.length === 1 ? 'vastaus' : 'vastausta'}
          </p>
        </div>
        <button
          onClick={onClose}
          aria-label="Sulje thread"
          style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            fontSize: '1.4rem', lineHeight: 1, color: 'var(--t2)',
            padding: '0 .4rem',
          }}
        >×</button>
      </div>

      {/* Parent + replies */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '1rem' }}>
        {/* Parent */}
        <div style={{ paddingBottom: '.75rem', borderBottom: '1px solid var(--border)', marginBottom: '.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '.5rem', marginBottom: '.2rem' }}>
            <span style={{ fontSize: '.82rem', fontWeight: 700, color: 'var(--t1)' }}>
              {parentMessage.authorName}
            </span>
            <span style={{ fontSize: '.62rem', color: 'var(--t3)' }}>
              {formatTimestamp(parentMessage.createdAt)}
            </span>
          </div>
          <div
            style={{ fontSize: '.85rem', lineHeight: 1.5, color: 'var(--t1)', wordBreak: 'break-word' }}
            dangerouslySetInnerHTML={{ __html: parentBodyHtml }}
          />
        </div>

        {/* Replies */}
        {replies.map((msg, mi) => (
          <MessageItem
            key={msg.id}
            msg={msg}
            prev={mi > 0 ? replies[mi - 1] : null}
            myId={myId}
            teamMembers={teamMembers}
            orgTeams={orgTeams}
            onReact={(e) => onReact(msg.id, e)}
            onReply={() => { /* ei nested-threadeja */ }}
            onCopyLink={() => onCopyLink(msg.id)}
          />
        ))}

        {replies.length === 0 && (
          <div style={{ textAlign: 'center', color: 'var(--t3)', fontSize: '.78rem', padding: '1.5rem' }}>
            Aloita vastaaminen alapuolella
          </div>
        )}
      </div>

      {/* Composer */}
      <div style={{ padding: '.65rem .75rem .75rem', borderTop: '1px solid var(--border)' }}>
        <Composer
          members={teamMembers}
          channelId={channelId}
          orgId={orgId}
          placeholder="Vastaa threadiin…"
          onSend={onSendReply}
          autoFocus
          small
        />
      </div>
    </div>
  );
}
