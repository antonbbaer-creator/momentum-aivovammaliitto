'use client';

/*
 * ChatLayout — Viestit-moduulin pääkomponentti.
 * - Lataa kanavat (chat_channels) + auto-luo puuttuvat tiimikanavat
 * - Hallitsee aktiivista kanavaa URL-parametrissa ?ch=
 * - Tukee deeplink-parametria ?m= (push-ilmoitus → suoraan viestin kohdalle)
 * - Mobiilissa sidebar muuttuu vetolaatikoksi
 */

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams, usePathname, useRouter, useParams } from 'next/navigation';
import { useOrgData } from '@/lib/firestore';
import { useAuth } from '@/lib/auth';
import { useIsMobile } from '@/lib/use-mobile';
import {
  Channel,
  Message,
  UserChatState,
  missingDefaultChannels,
  visibleChannels,
  channelStorageKey,
  userStateStorageKey,
} from '@/lib/chat-shared';
import { momentumDmChannelFor } from '@/lib/claude-bot';
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
  const isMobile = useIsMobile();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [channels, setChannels] = useOrgData<Channel[]>('chat_channels', []);
  const [orgTeams] = useOrgData<OrgTeam[]>('orgTeams', getOrgTeams(orgSlug));
  const [teamMembers] = useOrgData<OrgTeamMember[]>('orgTeamMembers', getOrgTeamMembers(orgSlug));

  const myMember = resolveUserMember(teamMembers, user);
  const myId = myMember?.id || null;

  // Auto-luo puuttuvat tiimikanavat, #yleinen, ja käyttäjän henkilökohtainen Claude-DM
  useEffect(() => {
    if (!user || orgTeams.length === 0 || teamMembers.length === 0) return;
    const toCreate: Channel[] = [];

    const missing = missingDefaultChannels(channels, orgTeams, teamMembers);
    toCreate.push(...missing);

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

  const allVisible = useMemo(
    () => visibleChannels(channels || [], myId),
    [channels, myId]
  );

  const activeChannelId = searchParams?.get('ch') || 'ch_yleinen';
  const scrollToMessageId = searchParams?.get('m') || null;
  const activeChannel = allVisible.find(c => c.id === activeChannelId) || allVisible[0] || null;

  const setActiveChannel = (id: string) => {
    const p = new URLSearchParams(searchParams.toString());
    p.set('ch', id);
    p.delete('m'); // Tyhjennä deeplink-paraami kun käyttäjä vaihtaa kanavaa manuaalisesti
    router.replace(`${pathname}?${p.toString()}`, { scroll: false });
    if (isMobile) setSidebarOpen(false);
  };

  // Kun deeplink ohjaa kanavalle, varmista että sidebar ei jää eteen mobiilissa
  useEffect(() => {
    if (scrollToMessageId && isMobile) setSidebarOpen(false);
  }, [scrollToMessageId, isMobile]);

  const [messages, setMessages] = useOrgData<Message[]>(
    activeChannel ? channelStorageKey(activeChannel.id) : 'chat_messages_placeholder',
    []
  );

  const [chatState, setChatState] = useOrgData<UserChatState>(
    myId ? userStateStorageKey(myId) : 'chat_state_anon',
    {
      userId: myId || 'anon',
      lastReadAt: {},
      pinned: [],
      muted: [],
    }
  );

  // Merkitse aktiivinen kanava luetuksi
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

  // Sidebar-näkyvyys: desktopilla aina, mobiilissa drawer-tyyppinen
  const sidebarVisible = !isMobile || sidebarOpen;

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
        position: 'relative',
      }}
    >
      {/* Mobile overlay */}
      {isMobile && sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(0,0,0,0.4)',
            zIndex: 9,
          }}
        />
      )}

      {/* Sidebar — fixed drawer mobiilissa, normal flex desktop */}
      <div
        style={{
          ...(isMobile ? {
            position: 'absolute',
            top: 0, bottom: 0, left: 0,
            width: 280,
            zIndex: 10,
            transform: sidebarVisible ? 'translateX(0)' : 'translateX(-100%)',
            transition: 'transform 0.18s ease-out',
            boxShadow: sidebarVisible ? '4px 0 16px rgba(0,0,0,0.12)' : 'none',
          } : {
            width: 260,
            flexShrink: 0,
          }),
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
      </div>

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
        scrollToMessageId={scrollToMessageId}
        onOpenSidebar={isMobile ? () => setSidebarOpen(true) : undefined}
      />
    </div>
  );
}
