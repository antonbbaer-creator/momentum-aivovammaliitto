'use client';

/*
 * ChatLayout — Viestit-moduulin pääkomponentti.
 * Vastuut:
 *  - Lataa kanavat (chat_channels) + auto-luo puuttuvat tiimikanavat
 *  - Hallitsee aktiivista kanavaa (URL ?ch=X)
 *  - Lataa valitun kanavan viestit (chat_messages_{id})
 *  - Lataa käyttäjän chat-tilan (chat_state_{uid}) lukumerkintöjä varten
 *  - Antaa kaiken datan ChatSidebarille ja ChatMainille
 */

import { useEffect, useMemo } from 'react';
import { useSearchParams, usePathname, useRouter, useParams } from 'next/navigation';
import { useOrgData } from '@/lib/firestore';
import { useAuth } from '@/lib/auth';
import {
  Channel,
  Message,
  UserChatState,
  missingDefaultChannels,
  visibleChannels,
  channelStorageKey,
  userStateStorageKey,
} from '@/lib/chat-shared';
import { momentumDmChannelFor, MOMENTUM_BOT_ID } from '@/lib/claude-bot';
import { OrgTeam, OrgTeamMember, resolveUserMember } from '@/lib/team-shared';
import { getOrgTeams, getOrgTeamMembers } from '@/lib/org-defaults';
import ChatSidebar from './ChatSidebar';
import ChatMain from './ChatMain';

export default function ChatLayout() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const orgSlug = (useParams().orgSlug as string) || '';

  const [channels, setChannels] = useOrgData<Channel[]>('chat_channels', []);
  const [orgTeams] = useOrgData<OrgTeam[]>('orgTeams', getOrgTeams(orgSlug));
  const [teamMembers] = useOrgData<OrgTeamMember[]>('orgTeamMembers', getOrgTeamMembers(orgSlug));

  const myMember = resolveUserMember(teamMembers, user);
  const myId = myMember?.id || null;

  // Auto-luo puuttuvat tiimikanavat, #yleinen, ja käyttäjän henkilökohtainen Claude-DM
  useEffect(() => {
    if (!user || orgTeams.length === 0 || teamMembers.length === 0) return;
    const toCreate: Channel[] = [];

    // Tiimikanavat + #yleinen
    const missing = missingDefaultChannels(channels, orgTeams, teamMembers);
    toCreate.push(...missing);

    // Momentum-DM käyttäjälle (jos ei vielä olemassa)
    if (myId) {
      const momentumDm = momentumDmChannelFor(myId);
      const exists = (channels || []).some(c => c.id === momentumDm.id);
      if (!exists) toCreate.push(momentumDm);
    }

    if (toCreate.length > 0) {
      setChannels(prev => [...(prev || []), ...toCreate]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, orgTeams, teamMembers, channels.length, myId]);

  // Näkyvät kanavat nykyiselle käyttäjälle
  const allVisible = useMemo(
    () => visibleChannels(channels || [], myId),
    [channels, myId]
  );

  // Aktiivinen kanava URL:sta, oletus #yleinen
  const activeChannelId = searchParams?.get('ch') || 'ch_yleinen';
  const activeChannel = allVisible.find(c => c.id === activeChannelId) || allVisible[0] || null;

  const setActiveChannel = (id: string) => {
    const p = new URLSearchParams(searchParams.toString());
    p.set('ch', id);
    router.replace(`${pathname}?${p.toString()}`, { scroll: false });
  };

  // Kanavan viestit — haetaan useOrgDatan kautta (yksi doc per kanava)
  const [messages, setMessages] = useOrgData<Message[]>(
    activeChannel ? channelStorageKey(activeChannel.id) : 'chat_messages_placeholder',
    []
  );

  // Käyttäjän chat-tila
  const [chatState, setChatState] = useOrgData<UserChatState>(
    myId ? userStateStorageKey(myId) : 'chat_state_anon',
    {
      userId: myId || 'anon',
      lastReadAt: {},
      pinned: [],
      muted: [],
    }
  );

  // Merkitse aktiivinen kanava luetuksi kun se vaihtuu tai viestit tulevat
  useEffect(() => {
    if (!activeChannel || !myId) return;
    const lastMessage = messages[messages.length - 1];
    if (!lastMessage) return;
    const currentRead = chatState.lastReadAt?.[activeChannel.id] || 0;
    if (lastMessage.createdAt > currentRead) {
      setChatState(prev => ({
        ...prev,
        userId: myId,
        lastReadAt: {
          ...(prev?.lastReadAt || {}),
          [activeChannel.id]: Date.now(),
        },
      }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeChannel?.id, messages.length, myId]);

  // Jos ei aktiivista kanavaa (esim. ladataan), näytetään placeholder
  if (!activeChannel) {
    return (
      <div className="chat-wrap" style={{ display: 'flex', height: 'calc(100vh - 140px)', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', overflow: 'hidden' }}>
        <div style={{ width: 260, borderRight: '1px solid var(--border)', background: 'var(--elev)' }} />
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--t3)' }}>
          Ladataan kanavia...
        </div>
      </div>
    );
  }

  return (
    <div
      className="chat-wrap"
      style={{
        display: 'flex',
        height: 'calc(100vh - 140px)',
        background: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--rl)',
        overflow: 'hidden',
      }}
    >
      <ChatSidebar
        channels={allVisible}
        activeChannelId={activeChannel.id}
        onSelectChannel={setActiveChannel}
        chatState={chatState}
        setChatState={setChatState}
        teamMembers={teamMembers}
        orgTeams={orgTeams}
        myId={myId}
        allChannels={channels}
        setChannels={setChannels}
      />
      <ChatMain
        channel={activeChannel}
        messages={messages}
        setMessages={setMessages}
        teamMembers={teamMembers}
        orgTeams={orgTeams}
        myId={myId}
        myName={myMember?.name || user?.displayName || 'Käyttäjä'}
        myAvatar={user?.photoURL || undefined}
        setChannels={setChannels}
      />
    </div>
  );
}
