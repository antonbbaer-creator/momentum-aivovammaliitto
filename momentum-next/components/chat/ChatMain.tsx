'use client';

/*
 * ChatMain — oikean palstan pääsisältö: header + viestilista + composer.
 * Sisältää alakomponentit inline koska ne ovat tiivisti kytkettyjä tämän palstan layoutiin.
 */

import { useState, useRef, useEffect, useMemo } from 'react';
import {
  Channel,
  Message,
  appendMessage,
  newMessage,
  groupMessagesByDay,
  formatTimestamp,
  displayNameFor,
  canPostInChannel,
} from '@/lib/chat-shared';
import { OrgTeam, OrgTeamMember } from '@/lib/team-shared';
import { useAuth } from '@/lib/auth';
import { useOrgData } from '@/lib/firestore';
import { Publication, normalizePublication } from '@/lib/publications-shared';
import {
  MOMENTUM_BOT_ID,
  MOMENTUM_BOT_NAME,
  MOMENTUM_BOT_COLOR,
  messageTriggersBot,
  isMomentumDm,
  runClaudeBot,
  BotContext,
  BotMessage,
} from '@/lib/claude-bot';

interface Props {
  channel: Channel;
  messages: Message[];
  setMessages: (fn: (prev: Message[]) => Message[]) => void;
  teamMembers: OrgTeamMember[];
  orgTeams: OrgTeam[];
  myId: string | null;
  myName: string;
  myAvatar?: string;
  setChannels: (fn: (prev: Channel[]) => Channel[]) => void;
}

export default function ChatMain({
  channel,
  messages,
  setMessages,
  teamMembers,
  orgTeams,
  myId,
  myName,
  myAvatar,
  setChannels,
}: Props) {
  const { canEdit, activeOrg } = useAuth();
  const [draft, setDraft] = useState('');
  const [botThinking, setBotThinking] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  // Publications — Claude voi luoda niitä työjonoon
  const [rawPubs, setPubs] = useOrgData<any[]>('publications', []);
  const publications = useMemo<Publication[]>(
    () => (rawPubs || []).map(normalizePublication),
    [rawPubs]
  );

  const canUserPost = canEdit && canPostInChannel(channel, myId);
  const channelIsMomentumDm = isMomentumDm(channel);

  // Auto-scroll to bottom kun viesti tulee tai kanava vaihtuu
  useEffect(() => {
    if (!listRef.current) return;
    listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages.length, channel.id]);

  // Clear draft kun kanava vaihtuu
  useEffect(() => {
    setDraft('');
  }, [channel.id]);

  // Postaa viesti kanavaan (apufunktio — käytetään myös Claude-bot-vastauksessa)
  const postMessage = (authorId: string, authorName: string, authorAvatar: string | undefined, text: string) => {
    const msg = newMessage({
      channelId: channel.id,
      authorId,
      authorName,
      authorAvatar,
      text,
    });
    setMessages(prev => appendMessage(prev || [], msg));
    setChannels(prev => (prev || []).map(c => c.id === channel.id ? {
      ...c,
      lastMessageAt: msg.createdAt,
      lastMessagePreview: text.slice(0, 80),
      lastMessageAuthor: authorName,
    } : c));
    return msg;
  };

  // Triggeroi Claude-botti — kokoa konteksti ja aja tool-use-loop
  const triggerClaudeBot = async (userMessage: string) => {
    if (!myId || !activeOrg) return;
    setBotThinking(true);
    try {
      // Kokoa kanavan viimeiset viestit AI:lle kontekstiksi
      const recent = messages.slice(-12);
      const history: BotMessage[] = recent
        .filter(m => m.text) // skip deleted jne.
        .map(m => ({
          role: m.authorId === MOMENTUM_BOT_ID ? 'assistant' : 'user',
          content: m.authorId === MOMENTUM_BOT_ID ? m.text : `${m.authorName}: ${m.text}`,
        }));

      const ctx: BotContext = {
        activeOrg,
        currentChannelId: channel.id,
        userName: myName,
        userId: myId,
        orgTeams,
        teamMembers,
        publications,
        createPublication: (pub) => setPubs(prev => [pub, ...(prev || [])]),
        updatePublication: (id, patch) => setPubs(prev => (prev || []).map(p => p.id === id ? { ...p, ...patch, updatedAt: Date.now() } : p)),
      };

      // System prompt + konteksti rakennetaan workerissa — välitetään julkaisut extras-kautta
      const result = await runClaudeBot(userMessage, history, '', ctx, {
        publications,
        orgName: activeOrg === 'llff' ? 'Lapinlahden Elokuvajuhlat (LLFF)' : (activeOrg || 'Organisaatio'),
        channel,
        availableChannels: ['Instagram', 'Facebook', 'LinkedIn', 'TikTok', 'YouTube', 'Nettisivut', 'Uutiskirje'],
      });

      let reply = result.reply || (result.error ? `⚠ Virhe: ${result.error}` : 'Ei vastausta.');
      if (result.publicationsCreated.length > 0) {
        reply += `\n\n✓ ${result.publicationsCreated.length} julkaisu${result.publicationsCreated.length > 1 ? 'a' : ''} luotu työjonoon — katso Viestintä → Työjono`;
      }
      postMessage(MOMENTUM_BOT_ID, MOMENTUM_BOT_NAME, undefined, reply);
    } catch (e: any) {
      postMessage(MOMENTUM_BOT_ID, MOMENTUM_BOT_NAME, undefined, `⚠ Virhe Momentum-botin kutsussa: ${e.message}`);
    } finally {
      setBotThinking(false);
    }
  };

  const sendMessage = () => {
    const text = draft.trim();
    if (!text || !myId) return;

    // 1. Postaa käyttäjän viesti normaalisti
    postMessage(myId, myName, myAvatar, text);
    setDraft('');

    // 2. Momentum-botti-triggeri: @momentum, /momentum TAI aina Momentum-DM:ssä
    if (messageTriggersBot(text) || channelIsMomentumDm) {
      triggerClaudeBot(text);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter = lähetä, Shift+Enter = rivinvaihto
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const grouped = useMemo(() => groupMessagesByDay(messages || []), [messages]);

  const channelName = displayNameFor(channel, myId, teamMembers);
  const memberCount = channel.memberIds.includes('all')
    ? teamMembers.length
    : channel.memberIds.length;
  const channelColor = channel.color;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
      {/* HEADER */}
      <div
        style={{
          padding: '.9rem 1.25rem',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'var(--card)',
          minHeight: 58,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '.65rem', minWidth: 0 }}>
          {channelColor ? (
            <span style={{
              width: 24, height: 24, borderRadius: 6,
              background: `${channelColor}25`, color: channelColor,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '.85rem', fontWeight: 700, flexShrink: 0,
              fontFamily: 'var(--font-display)',
            }}>{channel.icon || '#'}</span>
          ) : (
            <span style={{ color: 'var(--t3)', fontSize: '1.1rem', fontWeight: 700, fontFamily: 'var(--font-display)' }}>
              {channel.type === 'dm' ? '●' : channel.type === 'group' ? '◉' : channel.type === 'private' ? '◆' : '#'}
            </span>
          )}
          <div style={{ minWidth: 0 }}>
            <h2 style={{ fontSize: '.95rem', fontWeight: 700, color: 'var(--t1)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {channelName}
            </h2>
            {channel.description && (
              <p style={{ fontSize: '.7rem', color: 'var(--t3)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {channel.description}
              </p>
            )}
          </div>
        </div>
        <div style={{ fontSize: '.72rem', color: 'var(--t3)', flexShrink: 0 }}>
          {memberCount} {memberCount === 1 ? 'jäsen' : 'jäsentä'}
        </div>
      </div>

      {/* MESSAGES */}
      <div
        ref={listRef}
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '1rem 1.25rem',
          background: 'var(--bg)',
        }}
      >
        {grouped.length === 0 && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            flexDirection: 'column',
            color: 'var(--t3)',
            gap: '.5rem',
          }}>
            <div style={{ fontSize: '2rem', fontFamily: 'var(--font-display)' }}>{channel.icon || '#'}</div>
            <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--t2)' }}>{channelName}</h3>
            <p style={{ fontSize: '.8rem' }}>Aloita keskustelu — kirjoita ensimmäinen viesti alle.</p>
          </div>
        )}

        {grouped.map((group, gi) => (
          <div key={gi} style={{ marginBottom: '1rem' }}>
            {/* Date divider */}
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

            {group.messages.map((msg, mi) => {
              const prev = mi > 0 ? group.messages[mi - 1] : null;
              const collapsed = prev
                && prev.authorId === msg.authorId
                && (msg.createdAt - prev.createdAt) < 5 * 60 * 1000; // sama henkilö, alle 5 min
              const isBot = msg.authorId === MOMENTUM_BOT_ID || msg.authorId === 'claude-bot';
              const author = isBot ? null : teamMembers.find(m => m.id === msg.authorId);
              const authorTeam = author ? orgTeams.find(t => t.id === author.teamId) : null;
              const avatarColor = isBot ? MOMENTUM_BOT_COLOR : (authorTeam?.color || 'var(--pri)');
              const isMe = msg.authorId === myId;
              const displayedAuthorName = isBot ? MOMENTUM_BOT_NAME : msg.authorName;

              return (
                <div
                  key={msg.id}
                  style={{
                    display: 'flex',
                    gap: '.65rem',
                    padding: collapsed ? '.15rem 0' : '.4rem 0',
                    alignItems: 'flex-start',
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
                        }}>{displayedAuthorName}{isBot && <span style={{ fontSize: '.55rem', marginLeft: '.35rem', padding: '.1rem .35rem', borderRadius: 3, background: `${MOMENTUM_BOT_COLOR}20`, color: MOMENTUM_BOT_COLOR, fontWeight: 600, letterSpacing: '.04em', textTransform: 'uppercase' }}>AI</span>}</span>
                        <span style={{ fontSize: '.62rem', color: 'var(--t3)' }}>
                          {formatTimestamp(msg.createdAt)}
                        </span>
                      </div>
                    )}
                    <div style={{
                      fontSize: '.88rem',
                      color: 'var(--t1)',
                      lineHeight: 1.5,
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                    }}>
                      {msg.text}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ))}

        {/* Momentum kirjoittaa -indikaattori */}
        {botThinking && (
          <div style={{ display: 'flex', gap: '.65rem', padding: '.4rem 0', alignItems: 'center' }}>
            <div style={{
              width: 32, height: 32, borderRadius: 6,
              background: MOMENTUM_BOT_COLOR, color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 700, fontSize: '.82rem',
              fontFamily: 'var(--font-display)',
              flexShrink: 0,
            }}>M</div>
            <div style={{
              display: 'flex', alignItems: 'center', gap: '.5rem',
              fontSize: '.78rem', color: 'var(--t3)', fontStyle: 'italic',
            }}>
              <span style={{ fontWeight: 600, color: MOMENTUM_BOT_COLOR, fontStyle: 'normal' }}>{MOMENTUM_BOT_NAME}</span>
              <span>kirjoittaa</span>
              <span className="typing" style={{ transform: 'scale(.7)' }}><span /><span /><span /></span>
            </div>
          </div>
        )}
      </div>

      {/* COMPOSER */}
      <div
        style={{
          padding: '.75rem 1rem 1rem',
          borderTop: '1px solid var(--border)',
          background: 'var(--card)',
        }}
      >
        {canUserPost ? (
          <div style={{
            border: '1px solid var(--border)',
            borderRadius: 'var(--r)',
            background: 'var(--elev)',
            display: 'flex',
            alignItems: 'flex-end',
            gap: '.5rem',
            padding: '.5rem .65rem',
          }}>
            <textarea
              ref={taRef}
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={channelIsMomentumDm ? 'Kirjoita Momentumille — esim. "tee IG-postaus ohjelmistosta"' : `Kirjoita kanavaan ${channelName} · vihje: @momentum pyytämään AI-apua`}
              rows={1}
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
                maxHeight: 140,
              }}
            />
            <button
              onClick={sendMessage}
              disabled={!draft.trim()}
              style={{
                background: draft.trim() ? 'var(--pri)' : 'var(--bg)',
                color: draft.trim() ? '#fff' : 'var(--t3)',
                border: 'none',
                borderRadius: 6,
                padding: '.4rem .75rem',
                fontSize: '.78rem',
                fontWeight: 700,
                cursor: draft.trim() ? 'pointer' : 'not-allowed',
                flexShrink: 0,
              }}
            >Lähetä</button>
          </div>
        ) : (
          <div style={{
            textAlign: 'center',
            padding: '.75rem',
            background: 'var(--elev)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--r)',
            fontSize: '.78rem',
            color: 'var(--t3)',
          }}>
            {!canEdit
              ? 'Vierailijat eivät voi kirjoittaa viestejä'
              : 'Et ole tämän yksityisen kanavan jäsen'}
          </div>
        )}
        <div style={{
          fontSize: '.62rem',
          color: 'var(--t3)',
          marginTop: '.4rem',
          textAlign: 'right',
        }}>
          Enter lähettää · Shift+Enter uusi rivi
        </div>
      </div>
    </div>
  );
}
