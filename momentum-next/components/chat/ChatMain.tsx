'use client';

/*
 * ChatMain — oikean palstan pääsisältö: header + viestilista + composer (+ ThreadPanel sivussa).
 * Käyttää MessageList-, Composer- ja ThreadPanel-komponentteja.
 */

import { useEffect, useMemo, useState, useCallback } from 'react';
import {
  Channel, Message, Attachment,
  appendMessage, newMessage, displayNameFor, canPostInChannel,
  updateMessage, toggleReaction, recountReplies,
} from '@/lib/chat-shared';
import { OrgTeam, OrgTeamMember } from '@/lib/team-shared';
import { useAuth } from '@/lib/auth';
import { getOrgDisplayName, getOrgChannels } from '@/lib/org-defaults';
import { useOrgData } from '@/lib/firestore';
import { Publication, normalizePublication } from '@/lib/publications-shared';
import { useToast } from '@/lib/toast';
import {
  MOMENTUM_BOT_ID, MOMENTUM_BOT_NAME, MOMENTUM_BOT_COLOR,
  messageTriggersBot, isMomentumDm, runClaudeBot, BotContext, BotMessage,
} from '@/lib/claude-bot';
import { useIsMobile } from '@/lib/use-mobile';
import MessageList from './MessageList';
import Composer from './Composer';
import ThreadPanel from './ThreadPanel';

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
  scrollToMessageId?: string | null;
  onOpenSidebar?: () => void;        // mobile: avaa sidebar drawer
}

export default function ChatMain({
  channel, messages, setMessages, teamMembers, orgTeams,
  myId, myName, myAvatar, setChannels, scrollToMessageId, onOpenSidebar,
}: Props) {
  const { canEdit, activeOrg } = useAuth();
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const [botThinking, setBotThinking] = useState(false);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);

  // Publications — Claude voi luoda niitä työjonoon
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [rawPubs, setPubs] = useOrgData<any[]>('publications', []);
  const publications = useMemo<Publication[]>(
    () => (rawPubs || []).map(normalizePublication),
    [rawPubs]
  );

  const canUserPost = canEdit && canPostInChannel(channel, myId);
  const channelIsMomentumDm = isMomentumDm(channel);
  const channelName = displayNameFor(channel, myId, teamMembers);
  const memberCount = channel.memberIds.includes('all')
    ? teamMembers.length
    : channel.memberIds.length;
  const channelColor = channel.color;

  // Sulje thread-paneeli kanavanvaihdolla
  useEffect(() => {
    setActiveThreadId(null);
  }, [channel.id]);

  // Postaa viesti kanavaan
  const postMessage = useCallback((
    authorId: string, authorName: string, authorAvatar: string | undefined,
    text: string, opts: { mentions?: string[]; attachments?: Attachment[]; threadId?: string } = {},
  ) => {
    const msg = newMessage({
      channelId: channel.id,
      authorId, authorName, authorAvatar, text,
      mentions: opts.mentions || [],
      attachments: opts.attachments || [],
      threadId: opts.threadId,
    });
    setMessages(prev => recountReplies(appendMessage(prev || [], msg)));
    if (!opts.threadId) {
      setChannels(prev => (prev || []).map(c => c.id === channel.id ? {
        ...c,
        lastMessageAt: msg.createdAt,
        lastMessagePreview: text.slice(0, 80),
        lastMessageAuthor: authorName,
      } : c));
    }
    return msg;
  }, [channel.id, setMessages, setChannels]);

  // Triggeroi Claude-botti
  const triggerClaudeBot = async (userMessage: string) => {
    if (!myId || !activeOrg) return;
    setBotThinking(true);
    try {
      const recent = messages.slice(-12);
      const history: BotMessage[] = recent
        .filter(m => m.text)
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

      const result = await runClaudeBot(userMessage, history, '', ctx, {
        publications,
        orgName: getOrgDisplayName(activeOrg || ''),
        channel,
        availableChannels: getOrgChannels(activeOrg || ''),
      });

      let reply = result.reply || (result.error ? `⚠ Virhe: ${result.error}` : 'Ei vastausta.');
      if (result.publicationsCreated.length > 0) {
        reply += `\n\n✓ ${result.publicationsCreated.length} julkaisu${result.publicationsCreated.length > 1 ? 'a' : ''} luotu työjonoon — katso Viestintä → Työjono`;
      }
      postMessage(MOMENTUM_BOT_ID, MOMENTUM_BOT_NAME, undefined, reply);
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : String(e);
      postMessage(MOMENTUM_BOT_ID, MOMENTUM_BOT_NAME, undefined, `⚠ Virhe Momentum-botin kutsussa: ${errMsg}`);
    } finally {
      setBotThinking(false);
    }
  };

  const handleSend = (text: string, mentions: string[], attachments: Attachment[]) => {
    if (!myId) return;
    postMessage(myId, myName, myAvatar, text, { mentions, attachments });
    if (messageTriggersBot(text) || channelIsMomentumDm) {
      triggerClaudeBot(text);
    }
  };

  const handleSendReply = (parentId: string) => (text: string, mentions: string[], attachments: Attachment[]) => {
    if (!myId) return;
    postMessage(myId, myName, myAvatar, text, { mentions, attachments, threadId: parentId });
  };

  const handleReact = (msgId: string, emoji: string) => {
    if (!myId) return;
    setMessages(prev => updateMessage(prev || [], msgId, m => toggleReaction(m, emoji, myId)));
  };

  const handleEdit = (msgId: string) => {
    const target = messages.find(m => m.id === msgId);
    if (!target) return;
    const newText = window.prompt('Muokkaa viestiä:', target.text);
    if (newText === null) return;
    setMessages(prev => updateMessage(prev || [], msgId, { text: newText, editedAt: Date.now() }));
  };

  const handleDelete = (msgId: string) => {
    if (!window.confirm('Poistetaanko viesti?')) return;
    setMessages(prev => updateMessage(prev || [], msgId, { deletedAt: Date.now(), text: '' }));
  };

  const handleCopyLink = async (msgId: string) => {
    const url = `${window.location.origin}/${activeOrg}/viestit?ch=${encodeURIComponent(channel.id)}&m=${encodeURIComponent(msgId)}`;
    try {
      await navigator.clipboard.writeText(url);
      toast('Linkki kopioitu', 'success');
    } catch {
      toast('Kopiointi epäonnistui', 'error');
    }
  };

  const activeThread = useMemo(
    () => activeThreadId ? messages.find(m => m.id === activeThreadId) || null : null,
    [activeThreadId, messages],
  );

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, position: 'relative' }}>
      {/* HEADER */}
      <div style={{
        padding: '.9rem 1.25rem',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: 'var(--card)',
        minHeight: 58,
        gap: '.5rem',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '.65rem', minWidth: 0, flex: 1 }}>
          {isMobile && onOpenSidebar && (
            <button
              onClick={onOpenSidebar}
              aria-label="Avaa kanavalista"
              style={{
                background: 'transparent', border: 'none', cursor: 'pointer',
                padding: '.4rem', fontSize: '1.1rem', color: 'var(--t2)',
                marginLeft: -4,
              }}
            >☰</button>
          )}
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
            {channel.description && !isMobile && (
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
      <MessageList
        messages={messages}
        myId={myId}
        teamMembers={teamMembers}
        orgTeams={orgTeams}
        scrollToMessageId={scrollToMessageId}
        onReact={handleReact}
        onReply={(id) => setActiveThreadId(id)}
        onEdit={handleEdit}
        onDelete={handleDelete}
        onCopyLink={handleCopyLink}
        onOpenThread={(id) => setActiveThreadId(id)}
        emptyState={
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            height: '100%', flexDirection: 'column', color: 'var(--t3)', gap: '.5rem',
          }}>
            <div style={{ fontSize: '2rem', fontFamily: 'var(--font-display)' }}>{channel.icon || '#'}</div>
            <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--t2)' }}>{channelName}</h3>
            <p style={{ fontSize: '.8rem' }}>Aloita keskustelu — kirjoita ensimmäinen viesti alle.</p>
          </div>
        }
      />

      {/* Bot-thinking-indikaattori */}
      {botThinking && (
        <div style={{ padding: '0 1.25rem', display: 'flex', gap: '.65rem', alignItems: 'center' }}>
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
            padding: '.25rem 0',
          }}>
            <span style={{ fontWeight: 600, color: MOMENTUM_BOT_COLOR, fontStyle: 'normal' }}>{MOMENTUM_BOT_NAME}</span>
            <span>kirjoittaa</span>
            <span className="typing" style={{ transform: 'scale(.7)' }}><span /><span /><span /></span>
          </div>
        </div>
      )}

      {/* COMPOSER */}
      <div style={{ padding: '.75rem 1rem 1rem', borderTop: '1px solid var(--border)', background: 'var(--card)' }}>
        {canUserPost ? (
          <Composer
            members={teamMembers}
            channelId={channel.id}
            orgId={activeOrg || ''}
            placeholder={
              channelIsMomentumDm
                ? 'Kirjoita Momentumille — esim. "tee IG-postaus ohjelmistosta"'
                : `Kirjoita kanavaan ${channelName}`
            }
            onSend={handleSend}
            autoFocus
          />
        ) : (
          <div style={{
            textAlign: 'center', padding: '.75rem',
            background: 'var(--elev)', border: '1px solid var(--border)',
            borderRadius: 'var(--r)', fontSize: '.78rem', color: 'var(--t3)',
          }}>
            {!canEdit ? 'Vierailijat eivät voi kirjoittaa viestejä' : 'Et ole tämän yksityisen kanavan jäsen'}
          </div>
        )}
        <div style={{ fontSize: '.62rem', color: 'var(--t3)', marginTop: '.4rem', textAlign: 'right' }}>
          Enter lähettää · Shift+Enter uusi rivi · @maininnat · :emoji: · **lihava** *kursiivi* `koodi`
        </div>
      </div>

      {/* THREAD PANEL */}
      {activeThread && (
        <ThreadPanel
          parentMessage={activeThread}
          messages={messages}
          myId={myId}
          teamMembers={teamMembers}
          orgTeams={orgTeams}
          channelId={channel.id}
          orgId={activeOrg || ''}
          isMobile={isMobile}
          onClose={() => setActiveThreadId(null)}
          onSendReply={handleSendReply(activeThread.id)}
          onReact={handleReact}
          onCopyLink={handleCopyLink}
        />
      )}
    </div>
  );
}
