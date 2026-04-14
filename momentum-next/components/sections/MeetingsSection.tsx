'use client';

import { useState, useMemo } from 'react';
import { useOrgData } from '@/lib/firestore';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import { useIsMobile } from '@/lib/use-mobile';
import { useParams } from 'next/navigation';
import { OrgTeamMember, resolveUserMember } from '@/lib/team-shared';
import { getOrgTeamMembers, getOrgMeetings, getOrgMeetingPolls } from '@/lib/org-defaults';
import {
  Meeting, MeetingPoll, MeetingAttendee, MeetingLocation, MeetingPollOption, MeetingPollVote,
  PRESET_LOCATIONS, generateId, formatDate, formatTimeRange,
  isMeetingPast, sortMeetingsByDate, getRsvpCounts,
  expandRecurrence, RecurrenceRule,
} from '@/lib/meetings-shared';

// ── Varikoodit ──────────────────────────────────────────────────

const RSVP_COLORS = {
  accepted: { color: '#2dd4a0', bg: 'rgba(45,212,160,.12)', label: 'Osallistuu' },
  declined: { color: '#ef4444', bg: 'rgba(239,68,68,.12)', label: 'Ei osallistu' },
  pending:  { color: '#a0a0a0', bg: 'rgba(160,160,160,.10)', label: 'Odottaa vastausta' },
};

const LOCATION_ICONS: Record<string, string> = {
  physical: 'P',
  remote: 'E',
  hybrid: 'H',
};

// ── Paakomponentti ──────────────────────────────────────────────

export default function MeetingsSection() {
  const { user } = useAuth();
  const { toast } = useToast();
  const orgSlug = (useParams().orgSlug as string) || '';
  const isMobile = useIsMobile();

  const [meetings, setMeetings] = useOrgData<Meeting[]>('meetings', getOrgMeetings(orgSlug));
  const [polls, setPolls] = useOrgData<MeetingPoll[]>('meetingPolls', getOrgMeetingPolls(orgSlug));
  const [teamMembers] = useOrgData<OrgTeamMember[]>('orgTeamMembers', getOrgTeamMembers(orgSlug));

  const currentMember = useMemo(() => {
    if (!user) return null;
    return resolveUserMember(teamMembers, user);
  }, [user, teamMembers]);

  // ── Tilat ──────────────────────────────────────────────────────
  const [view, setView] = useState<'list' | 'calendar'>('list');
  const [mode, setMode] = useState<'browse' | 'create' | 'poll' | 'detail' | 'poll-detail'>('browse');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showPast, setShowPast] = useState(false);

  // Luontilomakkeen tilat
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newDate, setNewDate] = useState('');
  const [newStartTime, setNewStartTime] = useState('10:00');
  const [newEndTime, setNewEndTime] = useState('11:00');
  const [newLocationPreset, setNewLocationPreset] = useState('');
  const [newLocationCustom, setNewLocationCustom] = useState('');
  const [newLocationAddress, setNewLocationAddress] = useState('');
  const [newMeetLink, setNewMeetLink] = useState('');
  const [newHybrid, setNewHybrid] = useState(false);
  const [newRecurrence, setNewRecurrence] = useState<'' | 'weekly' | 'biweekly' | 'monthly'>('');
  const [newRecurrenceEnd, setNewRecurrenceEnd] = useState('');
  const [newAttendees, setNewAttendees] = useState<MeetingAttendee[]>([]);
  const [externalName, setExternalName] = useState('');
  const [externalEmail, setExternalEmail] = useState('');

  // Aanestyslomakkeen tilat
  const [pollTitle, setPollTitle] = useState('');
  const [pollDesc, setPollDesc] = useState('');
  const [pollOptions, setPollOptions] = useState<{ date: string; startTime: string; endTime: string }[]>([
    { date: '', startTime: '10:00', endTime: '11:00' },
  ]);
  const [pollDeadline, setPollDeadline] = useState('');
  const [pollAttendees, setPollAttendees] = useState<MeetingAttendee[]>([]);

  // ── Johdetut tiedot ────────────────────────────────────────────

  const activeMeetings = meetings.filter(m => !m.deletedAt);
  const sorted = sortMeetingsByDate(activeMeetings);
  const upcoming = sorted.filter(m => !isMeetingPast(m) && m.status !== 'cancelled');
  const past = sorted.filter(m => isMeetingPast(m) || m.status === 'cancelled');
  const activePolls = polls.filter(p => !p.deletedAt && p.status === 'open');

  const selectedMeeting = selectedId ? activeMeetings.find(m => m.id === selectedId) : null;
  const selectedPoll = selectedId ? polls.find(p => p.id === selectedId) : null;

  // Kalenterikuukausi
  const [calMonth, setCalMonth] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });

  // ── Meet-linkki-muistutus ──────────────────────────────────────

  const meetingsNeedingLink = useMemo(() => {
    if (!currentMember) return [];
    return upcoming.filter(m =>
      m.organizerId === currentMember.id &&
      !m.meetLinkCreated &&
      !m.location.meetLink &&
      (m.location.type === 'remote' || m.location.type === 'hybrid')
    );
  }, [upcoming, currentMember]);

  // ── Toiminnot ──────────────────────────────────────────────────

  const resetCreateForm = () => {
    setNewTitle(''); setNewDesc(''); setNewDate(''); setNewStartTime('10:00'); setNewEndTime('11:00');
    setNewLocationPreset(''); setNewLocationCustom(''); setNewLocationAddress(''); setNewMeetLink('');
    setNewHybrid(false); setNewRecurrence(''); setNewRecurrenceEnd(''); setNewAttendees([]);
    setExternalName(''); setExternalEmail('');
  };

  const resetPollForm = () => {
    setPollTitle(''); setPollDesc(''); setPollOptions([{ date: '', startTime: '10:00', endTime: '11:00' }]);
    setPollDeadline(''); setPollAttendees([]);
  };

  const buildLocation = (): MeetingLocation => {
    if (newLocationPreset) {
      const preset = PRESET_LOCATIONS.find(p => p.id === newLocationPreset);
      if (preset) {
        const locType = preset.type === 'remote' ? 'remote' : (newHybrid ? 'hybrid' : 'physical');
        return {
          presetId: preset.id,
          name: preset.name,
          address: preset.address || undefined,
          type: locType as 'physical' | 'remote' | 'hybrid',
          meetLink: newMeetLink || undefined,
        };
      }
    }
    return {
      name: newLocationCustom || 'Ei paikkaa',
      address: newLocationAddress || undefined,
      type: newMeetLink ? (newLocationCustom ? 'hybrid' : 'remote') : 'physical',
      meetLink: newMeetLink || undefined,
    };
  };

  const addMemberAttendee = (member: OrgTeamMember) => {
    if (newAttendees.some(a => a.memberId === member.id)) return;
    setNewAttendees(prev => [...prev, {
      id: generateId(),
      type: 'member' as const,
      memberId: member.id,
      name: member.name,
      email: member.email,
      rsvp: 'pending' as const,
      attendance: null,
    }]);
  };

  const addExternalAttendee = () => {
    if (!externalName.trim()) return;
    setNewAttendees(prev => [...prev, {
      id: generateId(),
      type: 'external' as const,
      name: externalName.trim(),
      email: externalEmail.trim() || undefined,
      rsvp: 'pending' as const,
      attendance: null,
    }]);
    setExternalName(''); setExternalEmail('');
  };

  const removeAttendee = (id: string) => {
    setNewAttendees(prev => prev.filter(a => a.id !== id));
  };

  const createMeeting = () => {
    if (!newTitle.trim() || !newDate) {
      toast('Syota otsikko ja paivamaara', 'error');
      return;
    }
    if (!currentMember) {
      toast('Kayttajaa ei loytynyt tiimista', 'error');
      return;
    }

    const baseMeeting: Meeting = {
      id: generateId(),
      title: newTitle.trim(),
      description: newDesc.trim() || undefined,
      date: newDate,
      startTime: newStartTime,
      endTime: newEndTime,
      location: buildLocation(),
      organizerId: currentMember.id,
      attendees: newAttendees,
      status: 'scheduled',
      recurrence: newRecurrence ? {
        frequency: newRecurrence as RecurrenceRule['frequency'],
        endDate: newRecurrenceEnd || undefined,
      } : undefined,
      recurrenceGroupId: newRecurrence ? generateId() : undefined,
      meetLinkCreated: !!newMeetLink,
      reminders: [1440, 60],
      createdAt: Date.now(),
      createdBy: user?.uid || '',
    };

    let newMeetings: Meeting[];
    if (baseMeeting.recurrence) {
      newMeetings = expandRecurrence(baseMeeting, 3);
    } else {
      newMeetings = [baseMeeting];
    }

    setMeetings([...meetings, ...newMeetings]);
    toast(`Palaveri "${newTitle}" kutsuttu koolle`, 'success');
    resetCreateForm();
    setMode('browse');
  };

  const createPoll = () => {
    if (!pollTitle.trim() || pollOptions.every(o => !o.date)) {
      toast('Syota otsikko ja vahintaan yksi aikaehdotus', 'error');
      return;
    }
    if (!currentMember) {
      toast('Kayttajaa ei loytynyt tiimista', 'error');
      return;
    }

    const poll: MeetingPoll = {
      id: generateId(),
      title: pollTitle.trim(),
      description: pollDesc.trim() || undefined,
      options: pollOptions.filter(o => o.date).map(o => ({
        id: generateId(),
        date: o.date,
        startTime: o.startTime,
        endTime: o.endTime,
      })),
      votes: [],
      invitees: pollAttendees,
      status: 'open',
      deadline: pollDeadline || undefined,
      createdAt: Date.now(),
      createdBy: user?.uid || '',
    };

    setPolls([...polls, poll]);
    toast('Aikaannestys luotu', 'success');
    resetPollForm();
    setMode('browse');
  };

  const updateRsvp = (meetingId: string, rsvp: 'accepted' | 'declined', attendance: 'in-person' | 'remote' | null) => {
    if (!currentMember) return;
    setMeetings(meetings.map(m => {
      if (m.id !== meetingId) return m;
      return {
        ...m,
        attendees: m.attendees.map(a =>
          a.memberId === currentMember.id
            ? { ...a, rsvp, attendance, rsvpAt: Date.now() }
            : a
        ),
      };
    }));
    toast(rsvp === 'accepted' ? 'Ilmoittauduttu' : 'Peruttu osallistuminen', 'success');
  };

  const updateMeetLink = (meetingId: string, link: string) => {
    setMeetings(meetings.map(m =>
      m.id === meetingId
        ? { ...m, location: { ...m.location, meetLink: link }, meetLinkCreated: true }
        : m
    ));
    toast('Meet-linkki lisatty', 'success');
  };

  const cancelMeeting = (meetingId: string) => {
    setMeetings(meetings.map(m =>
      m.id === meetingId ? { ...m, status: 'cancelled' as const } : m
    ));
    toast('Palaveri peruttu', 'info');
  };

  const votePoll = (pollId: string, optionId: string, vote: 'yes' | 'no' | 'maybe') => {
    if (!currentMember) return;
    setPolls(polls.map(p => {
      if (p.id !== pollId) return p;
      const existing = p.votes.findIndex(v => v.optionId === optionId && v.memberId === currentMember.id);
      const newVotes = [...p.votes];
      if (existing >= 0) {
        newVotes[existing] = { ...newVotes[existing], vote };
      } else {
        newVotes.push({ optionId, memberId: currentMember.id, name: currentMember.name, vote });
      }
      return { ...p, votes: newVotes };
    }));
  };

  const closePoll = (pollId: string, selectedOptionId: string) => {
    const poll = polls.find(p => p.id === pollId);
    if (!poll || !currentMember) return;

    const option = poll.options.find(o => o.id === selectedOptionId);
    if (!option) return;

    // Sulje aanestys
    setPolls(polls.map(p =>
      p.id === pollId ? { ...p, status: 'closed' as const, selectedOptionId } : p
    ));

    // Luo palaveri valitulla ajalla
    const meeting: Meeting = {
      id: generateId(),
      title: poll.title,
      description: poll.description,
      date: option.date,
      startTime: option.startTime,
      endTime: option.endTime,
      location: { name: 'Ei valittu', type: 'physical' },
      organizerId: currentMember.id,
      attendees: poll.invitees.map(i => ({ ...i, rsvp: 'pending' as const })),
      status: 'scheduled',
      pollId,
      meetLinkCreated: false,
      reminders: [1440, 60],
      createdAt: Date.now(),
      createdBy: user?.uid || '',
    };

    setMeetings([...meetings, meeting]);
    toast('Aanestys suljettu, palaveri luotu', 'success');
    setMode('browse');
  };

  // ── Kalenterinakyman apufunktiot ───────────────────────────────

  const daysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
  const firstDayOfMonth = (year: number, month: number) => {
    const d = new Date(year, month, 1).getDay();
    return d === 0 ? 6 : d - 1; // ma=0, su=6
  };

  const monthNames = ['Tammikuu', 'Helmikuu', 'Maaliskuu', 'Huhtikuu', 'Toukokuu', 'Kesakuu', 'Heinakuu', 'Elokuu', 'Syyskuu', 'Lokakuu', 'Marraskuu', 'Joulukuu'];
  const dayNames = ['Ma', 'Ti', 'Ke', 'To', 'Pe', 'La', 'Su'];

  const getMeetingsForDay = (year: number, month: number, day: number) => {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return activeMeetings.filter(m => m.date === dateStr && m.status !== 'cancelled');
  };

  // ── CSS ────────────────────────────────────────────────────────

  const S: Record<string, React.CSSProperties> = {
    wrap: { display: 'flex', gap: 24, minHeight: 500, flexDirection: isMobile ? 'column' : 'row' },
    left: { flex: isMobile ? undefined : 1, minWidth: isMobile ? undefined : 340 },
    right: { flex: isMobile ? undefined : 1, minWidth: isMobile ? undefined : 340 },
    card: { background: 'var(--card)', borderRadius: 12, padding: 16, marginBottom: 10, border: '1px solid var(--border)', cursor: 'pointer', transition: 'border-color .15s' },
    cardHover: { borderColor: 'var(--accent)' },
    hdr: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
    btn: { padding: '8px 16px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 500 },
    btnSec: { padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--fg)', cursor: 'pointer', fontSize: 14 },
    btnSm: { padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--fg)', cursor: 'pointer', fontSize: 12 },
    input: { width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--fg)', fontSize: 14, outline: 'none', boxSizing: 'border-box' as const },
    select: { padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--fg)', fontSize: 14, outline: 'none' },
    label: { fontSize: 12, color: 'var(--muted)', marginBottom: 4, display: 'block' },
    tag: { display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 12, fontSize: 12, fontWeight: 500 },
    row: { display: 'flex', gap: 8, alignItems: 'center' },
    grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 },
    section: { marginBottom: 20 },
    alert: { padding: '10px 14px', borderRadius: 8, background: 'rgba(245,197,66,.12)', border: '1px solid rgba(245,197,66,.3)', fontSize: 13, color: 'var(--fg)', marginBottom: 12 },
    calGrid: { display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 },
    calDay: { padding: 6, minHeight: 60, borderRadius: 6, background: 'var(--card)', border: '1px solid var(--border)', fontSize: 11, overflow: 'hidden' },
    calDayNum: { fontWeight: 600, fontSize: 13, marginBottom: 2 },
    calEvent: { padding: '1px 4px', borderRadius: 3, fontSize: 10, background: 'var(--accent)', color: '#fff', marginBottom: 1, whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis' },
    calHeader: { textAlign: 'center' as const, padding: 4, fontSize: 11, fontWeight: 600, color: 'var(--muted)' },
  };

  // ── Osallistujavalitsin (jaettu lomakkeille) ───────────────────

  const AttendeePickerUI = ({ attendees, setAttendees, showExternal = true }: {
    attendees: MeetingAttendee[];
    setAttendees: (a: MeetingAttendee[]) => void;
    showExternal?: boolean;
  }) => {
    const [extN, setExtN] = useState('');
    const [extE, setExtE] = useState('');

    const addMember = (m: OrgTeamMember) => {
      if (attendees.some(a => a.memberId === m.id)) return;
      setAttendees([...attendees, {
        id: generateId(), type: 'member', memberId: m.id, name: m.name, email: m.email,
        rsvp: 'pending', attendance: null,
      }]);
    };

    const addExt = () => {
      if (!extN.trim()) return;
      setAttendees([...attendees, {
        id: generateId(), type: 'external', name: extN.trim(), email: extE.trim() || undefined,
        rsvp: 'pending', attendance: null,
      }]);
      setExtN(''); setExtE('');
    };

    const remove = (id: string) => setAttendees(attendees.filter(a => a.id !== id));

    return (
      <div style={S.section}>
        <label style={S.label}>Osallistujat</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
          {attendees.map(a => (
            <span key={a.id} style={{ ...S.tag, background: 'var(--accent-bg)', color: 'var(--accent)' }}>
              {a.name} {a.type === 'external' ? '(vieras)' : ''}
              <span onClick={() => remove(a.id)} style={{ cursor: 'pointer', marginLeft: 4, opacity: 0.6 }}>x</span>
            </span>
          ))}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
          {teamMembers.filter(m => !m.deletedAt && !attendees.some(a => a.memberId === m.id)).map(m => (
            <button key={m.id} onClick={() => addMember(m)} style={{ ...S.btnSm, fontSize: 11 }}>
              + {m.name}
            </button>
          ))}
        </div>
        {showExternal && (
          <div style={{ display: 'flex', gap: 6 }}>
            <input placeholder="Vieraan nimi" value={extN} onChange={e => setExtN(e.target.value)} style={{ ...S.input, flex: 1 }} />
            <input placeholder="Sahkoposti" value={extE} onChange={e => setExtE(e.target.value)} style={{ ...S.input, flex: 1 }} />
            <button onClick={addExt} style={S.btnSm}>Lisaa</button>
          </div>
        )}
      </div>
    );
  };

  // ── RENDERIT ───────────────────────────────────────────────────

  // Yksittaisen palaverin kortti
  const MeetingCard = ({ meeting, onClick }: { meeting: Meeting; onClick: () => void }) => {
    const counts = getRsvpCounts(meeting.attendees);
    const isPast = isMeetingPast(meeting);
    const myRsvp = currentMember ? meeting.attendees.find(a => a.memberId === currentMember.id) : null;

    return (
      <div onClick={onClick} style={{ ...S.card, opacity: isPast || meeting.status === 'cancelled' ? 0.5 : 1 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>
              {meeting.status === 'cancelled' ? <span style={{ textDecoration: 'line-through' }}>{meeting.title}</span> : meeting.title}
            </div>
            <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 4 }}>
              {formatDate(meeting.date)} {formatTimeRange(meeting.startTime, meeting.endTime)}
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted)', display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ ...S.tag, background: meeting.location.type === 'remote' ? 'rgba(59,130,246,.12)' : meeting.location.type === 'hybrid' ? 'rgba(168,85,247,.12)' : 'rgba(45,212,160,.12)', color: meeting.location.type === 'remote' ? '#3b82f6' : meeting.location.type === 'hybrid' ? '#a855f7' : '#2dd4a0' }}>
                {LOCATION_ICONS[meeting.location.type]} {meeting.location.name}
              </span>
            </div>
          </div>
          <div style={{ textAlign: 'right', fontSize: 11 }}>
            <div style={{ color: '#2dd4a0' }}>{counts.accepted} osallistuu</div>
            {counts.pending > 0 && <div style={{ color: '#a0a0a0' }}>{counts.pending} odottaa</div>}
            {counts.declined > 0 && <div style={{ color: '#ef4444' }}>{counts.declined} ei paase</div>}
            {myRsvp && (
              <div style={{ marginTop: 4, ...S.tag, ...RSVP_COLORS[myRsvp.rsvp] }}>
                {RSVP_COLORS[myRsvp.rsvp].label}
                {myRsvp.attendance && ` (${myRsvp.attendance === 'in-person' ? 'paikalla' : 'etana'})`}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  // ── BROWSE-nakymma (lista + kalenteri) ─────────────────────────

  if (mode === 'browse') {
    return (
      <div>
        {/* Meet-linkki-muistutukset */}
        {meetingsNeedingLink.length > 0 && (
          <div style={S.alert}>
            Muista luoda Google Meet -kutsu ja lisata linkki seuraaviin palavereihin:
            {meetingsNeedingLink.map(m => (
              <div key={m.id} style={{ marginTop: 4 }}>
                <strong>{m.title}</strong> ({formatDate(m.date)} {m.startTime})
                <button onClick={() => { setSelectedId(m.id); setMode('detail'); }} style={{ ...S.btnSm, marginLeft: 8 }}>
                  Lisaa linkki
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Toimintopainikkeet */}
        <div style={{ ...S.hdr, flexWrap: 'wrap', gap: 8 }}>
          <div style={S.row}>
            <button onClick={() => setMode('create')} style={S.btn}>+ Kutsu palaveri koolle</button>
            <button onClick={() => setMode('poll')} style={S.btnSec}>Aikaannestys</button>
          </div>
          <div style={S.row}>
            <button onClick={() => setView('list')} style={view === 'list' ? S.btn : S.btnSec}>Lista</button>
            <button onClick={() => setView('calendar')} style={view === 'calendar' ? S.btn : S.btnSec}>Kalenteri</button>
          </div>
        </div>

        {/* Avoimet aanestykset */}
        {activePolls.length > 0 && (
          <div style={S.section}>
            <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8, color: 'var(--muted)' }}>Avoimet aikaannestykset</h3>
            {activePolls.map(poll => (
              <div key={poll.id} onClick={() => { setSelectedId(poll.id); setMode('poll-detail'); }}
                style={{ ...S.card, borderLeft: '3px solid var(--accent)' }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{poll.title}</div>
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                  {poll.options.length} aikaehdotusta, {poll.votes.length} aanesta
                  {poll.deadline && ` - DL: ${formatDate(poll.deadline)}`}
                </div>
              </div>
            ))}
          </div>
        )}

        <div style={S.wrap}>
          {/* VASEN: Lista */}
          <div style={S.left}>
            <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 10, color: 'var(--muted)' }}>Tulevat palaverit ({upcoming.length})</h3>
            {upcoming.length === 0 && (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--muted)', fontSize: 14 }}>
                Ei tulevia palavereita. Kutsu ensimmainen palaveri koolle!
              </div>
            )}
            {upcoming.map(m => (
              <MeetingCard key={m.id} meeting={m} onClick={() => { setSelectedId(m.id); setMode('detail'); }} />
            ))}

            {past.length > 0 && (
              <>
                <button onClick={() => setShowPast(!showPast)} style={{ ...S.btnSm, marginTop: 12, marginBottom: 8 }}>
                  {showPast ? 'Piilota menneet' : `Nayta menneet (${past.length})`}
                </button>
                {showPast && past.map(m => (
                  <MeetingCard key={m.id} meeting={m} onClick={() => { setSelectedId(m.id); setMode('detail'); }} />
                ))}
              </>
            )}
          </div>

          {/* OIKEA: Kalenteri (vain desktop tai valittu) */}
          {(view === 'calendar' || !isMobile) && (
            <div style={S.right}>
              <div style={{ ...S.row, justifyContent: 'space-between', marginBottom: 10 }}>
                <button onClick={() => setCalMonth(prev => {
                  const d = new Date(prev.year, prev.month - 1, 1);
                  return { year: d.getFullYear(), month: d.getMonth() };
                })} style={S.btnSm}>{'<'}</button>
                <span style={{ fontWeight: 600, fontSize: 14 }}>{monthNames[calMonth.month]} {calMonth.year}</span>
                <button onClick={() => setCalMonth(prev => {
                  const d = new Date(prev.year, prev.month + 1, 1);
                  return { year: d.getFullYear(), month: d.getMonth() };
                })} style={S.btnSm}>{'>'}</button>
              </div>
              <div style={S.calGrid}>
                {dayNames.map(d => <div key={d} style={S.calHeader}>{d}</div>)}
                {Array.from({ length: firstDayOfMonth(calMonth.year, calMonth.month) }).map((_, i) => (
                  <div key={`empty-${i}`} style={{ ...S.calDay, background: 'transparent', border: 'none' }} />
                ))}
                {Array.from({ length: daysInMonth(calMonth.year, calMonth.month) }).map((_, i) => {
                  const day = i + 1;
                  const dayMeetings = getMeetingsForDay(calMonth.year, calMonth.month, day);
                  const isToday = new Date().getFullYear() === calMonth.year && new Date().getMonth() === calMonth.month && new Date().getDate() === day;
                  return (
                    <div key={day} style={{ ...S.calDay, ...(isToday ? { borderColor: 'var(--accent)' } : {}) }}>
                      <div style={{ ...S.calDayNum, color: isToday ? 'var(--accent)' : undefined }}>{day}</div>
                      {dayMeetings.slice(0, 2).map(m => (
                        <div key={m.id} style={S.calEvent} onClick={() => { setSelectedId(m.id); setMode('detail'); }}>
                          {m.startTime} {m.title}
                        </div>
                      ))}
                      {dayMeetings.length > 2 && <div style={{ fontSize: 10, color: 'var(--muted)' }}>+{dayMeetings.length - 2}</div>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── CREATE-nakymma (suora kutsu) ───────────────────────────────

  if (mode === 'create') {
    return (
      <div style={{ maxWidth: 640 }}>
        <div style={S.hdr}>
          <h2 style={{ fontSize: 18, fontWeight: 700 }}>Kutsu palaveri koolle</h2>
          <button onClick={() => { resetCreateForm(); setMode('browse'); }} style={S.btnSec}>Peruuta</button>
        </div>

        <div style={S.section}>
          <label style={S.label}>Otsikko *</label>
          <input value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="Palaverin aihe" style={S.input} />
        </div>

        <div style={S.section}>
          <label style={S.label}>Kuvaus</label>
          <textarea value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="Lisatietoja palaverista..." rows={3}
            style={{ ...S.input, resize: 'vertical' as const }} />
        </div>

        <div style={{ ...S.grid2, ...S.section }}>
          <div>
            <label style={S.label}>Paivamaara *</label>
            <input type="date" value={newDate} onChange={e => setNewDate(e.target.value)} style={S.input} />
          </div>
          <div style={S.grid2}>
            <div>
              <label style={S.label}>Alkaa</label>
              <input type="time" value={newStartTime} onChange={e => setNewStartTime(e.target.value)} style={S.input} />
            </div>
            <div>
              <label style={S.label}>Paattyy</label>
              <input type="time" value={newEndTime} onChange={e => setNewEndTime(e.target.value)} style={S.input} />
            </div>
          </div>
        </div>

        <div style={S.section}>
          <label style={S.label}>Paikka</label>
          <select value={newLocationPreset} onChange={e => { setNewLocationPreset(e.target.value); setNewLocationCustom(''); setNewLocationAddress(''); }}
            style={{ ...S.select, width: '100%', marginBottom: 8 }}>
            <option value="">Valitse paikka...</option>
            {PRESET_LOCATIONS.map(loc => (
              <option key={loc.id} value={loc.id}>
                {loc.name}{loc.address ? ` (${loc.address})` : ''}
              </option>
            ))}
            <option value="custom">Muu paikka</option>
          </select>

          {newLocationPreset === 'custom' && (
            <div style={S.grid2}>
              <div>
                <label style={S.label}>Paikan nimi</label>
                <input value={newLocationCustom} onChange={e => setNewLocationCustom(e.target.value)} placeholder="Esim. Kahvila Regatta" style={S.input} />
              </div>
              <div>
                <label style={S.label}>Osoite</label>
                <input value={newLocationAddress} onChange={e => setNewLocationAddress(e.target.value)} placeholder="Merikannontie 10" style={S.input} />
              </div>
            </div>
          )}

          {newLocationPreset && newLocationPreset !== 'remote' && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, fontSize: 13, cursor: 'pointer' }}>
              <input type="checkbox" checked={newHybrid} onChange={e => setNewHybrid(e.target.checked)} />
              Myos etaosallistuminen mahdollista (hybridi)
            </label>
          )}
        </div>

        <div style={S.section}>
          <label style={S.label}>Google Meet -linkki</label>
          <input value={newMeetLink} onChange={e => setNewMeetLink(e.target.value)} placeholder="https://meet.google.com/xxx-xxxx-xxx" style={S.input} />
          {!newMeetLink && (newLocationPreset === 'remote' || newHybrid) && (
            <div style={{ ...S.alert, marginTop: 6 }}>
              Muista luoda Google Meet -kutsu ja lisata linkki ennen palaveria!
            </div>
          )}
        </div>

        <div style={S.section}>
          <label style={S.label}>Toistuvuus</label>
          <select value={newRecurrence} onChange={e => setNewRecurrence(e.target.value as any)} style={{ ...S.select, width: '100%' }}>
            <option value="">Ei toistu</option>
            <option value="weekly">Viikoittain</option>
            <option value="biweekly">Joka toinen viikko</option>
            <option value="monthly">Kuukausittain</option>
          </select>
          {newRecurrence && (
            <div style={{ marginTop: 8 }}>
              <label style={S.label}>Toistuu asti</label>
              <input type="date" value={newRecurrenceEnd} onChange={e => setNewRecurrenceEnd(e.target.value)} style={S.input} />
            </div>
          )}
        </div>

        <AttendeePickerUI attendees={newAttendees} setAttendees={setNewAttendees} />

        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button onClick={createMeeting} style={S.btn}>Kutsu koolle</button>
          <button onClick={() => { resetCreateForm(); setMode('browse'); }} style={S.btnSec}>Peruuta</button>
        </div>
      </div>
    );
  }

  // ── POLL-nakymma (aanestyksen luonti) ──────────────────────────

  if (mode === 'poll') {
    return (
      <div style={{ maxWidth: 640 }}>
        <div style={S.hdr}>
          <h2 style={{ fontSize: 18, fontWeight: 700 }}>Luo aikaannestys</h2>
          <button onClick={() => { resetPollForm(); setMode('browse'); }} style={S.btnSec}>Peruuta</button>
        </div>

        <div style={S.section}>
          <label style={S.label}>Otsikko *</label>
          <input value={pollTitle} onChange={e => setPollTitle(e.target.value)} placeholder="Mista aanestetaan?" style={S.input} />
        </div>

        <div style={S.section}>
          <label style={S.label}>Kuvaus</label>
          <textarea value={pollDesc} onChange={e => setPollDesc(e.target.value)} placeholder="Lisatietoja..." rows={2} style={{ ...S.input, resize: 'vertical' as const }} />
        </div>

        <div style={S.section}>
          <label style={S.label}>Aikaehdotukset *</label>
          {pollOptions.map((opt, i) => (
            <div key={i} style={{ ...S.row, marginBottom: 6 }}>
              <input type="date" value={opt.date} onChange={e => {
                const copy = [...pollOptions]; copy[i] = { ...copy[i], date: e.target.value }; setPollOptions(copy);
              }} style={{ ...S.input, flex: 1 }} />
              <input type="time" value={opt.startTime} onChange={e => {
                const copy = [...pollOptions]; copy[i] = { ...copy[i], startTime: e.target.value }; setPollOptions(copy);
              }} style={{ ...S.input, width: 100 }} />
              <input type="time" value={opt.endTime} onChange={e => {
                const copy = [...pollOptions]; copy[i] = { ...copy[i], endTime: e.target.value }; setPollOptions(copy);
              }} style={{ ...S.input, width: 100 }} />
              {pollOptions.length > 1 && (
                <button onClick={() => setPollOptions(pollOptions.filter((_, j) => j !== i))} style={S.btnSm}>x</button>
              )}
            </div>
          ))}
          <button onClick={() => setPollOptions([...pollOptions, { date: '', startTime: '10:00', endTime: '11:00' }])} style={S.btnSm}>
            + Lisaa aikaehdotus
          </button>
        </div>

        <div style={S.section}>
          <label style={S.label}>Aanestyksen takaraja</label>
          <input type="date" value={pollDeadline} onChange={e => setPollDeadline(e.target.value)} style={S.input} />
        </div>

        <AttendeePickerUI attendees={pollAttendees} setAttendees={setPollAttendees} />

        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button onClick={createPoll} style={S.btn}>Luo aanestys</button>
          <button onClick={() => { resetPollForm(); setMode('browse'); }} style={S.btnSec}>Peruuta</button>
        </div>
      </div>
    );
  }

  // ── DETAIL-nakymma (yksittainen palaveri) ──────────────────────

  if (mode === 'detail' && selectedMeeting) {
    const m = selectedMeeting;
    const isOrganizer = currentMember?.id === m.organizerId;
    const myAttendee = currentMember ? m.attendees.find(a => a.memberId === currentMember.id) : null;
    const counts = getRsvpCounts(m.attendees);
    const organizer = teamMembers.find(tm => tm.id === m.organizerId);
    const [editMeetLink, setEditMeetLink] = useState(m.location.meetLink || '');

    return (
      <div style={{ maxWidth: 640 }}>
        <button onClick={() => { setSelectedId(null); setMode('browse'); }} style={{ ...S.btnSm, marginBottom: 12 }}>
          {'<'} Takaisin
        </button>

        <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>{m.title}</h2>
        {m.status === 'cancelled' && <span style={{ ...S.tag, background: 'rgba(239,68,68,.12)', color: '#ef4444' }}>Peruttu</span>}

        <div style={{ fontSize: 14, color: 'var(--muted)', marginTop: 8, marginBottom: 16 }}>
          <div>{formatDate(m.date)} {formatTimeRange(m.startTime, m.endTime)}</div>
          {m.description && <div style={{ marginTop: 6, color: 'var(--fg)', fontSize: 14 }}>{m.description}</div>}
        </div>

        {/* Paikka */}
        <div style={{ ...S.card, marginBottom: 16 }}>
          <label style={S.label}>Paikka</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{ ...S.tag, background: m.location.type === 'remote' ? 'rgba(59,130,246,.12)' : m.location.type === 'hybrid' ? 'rgba(168,85,247,.12)' : 'rgba(45,212,160,.12)', color: m.location.type === 'remote' ? '#3b82f6' : m.location.type === 'hybrid' ? '#a855f7' : '#2dd4a0' }}>
              {m.location.type === 'physical' ? 'Paikalla' : m.location.type === 'remote' ? 'Etana' : 'Hybridi'}
            </span>
            <span style={{ fontWeight: 500 }}>{m.location.name}</span>
          </div>
          {m.location.address && <div style={{ fontSize: 13, color: 'var(--muted)' }}>{m.location.address}</div>}
          {m.location.meetLink && (
            <div style={{ marginTop: 6 }}>
              <a href={m.location.meetLink} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)', fontSize: 13 }}>
                Liity Google Meetiin
              </a>
            </div>
          )}

          {/* Meet-linkki lisays jarjestajalle */}
          {isOrganizer && !m.location.meetLink && (m.location.type === 'remote' || m.location.type === 'hybrid') && (
            <div style={{ marginTop: 10 }}>
              <label style={S.label}>Lisaa Google Meet -linkki</label>
              <div style={S.row}>
                <input value={editMeetLink} onChange={e => setEditMeetLink(e.target.value)}
                  placeholder="https://meet.google.com/..." style={{ ...S.input, flex: 1 }} />
                <button onClick={() => editMeetLink && updateMeetLink(m.id, editMeetLink)} style={S.btnSm}>Tallenna</button>
              </div>
            </div>
          )}
        </div>

        {/* Jarjestaja */}
        <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 12 }}>
          Jarjestaja: <strong>{organizer?.name || 'Tuntematon'}</strong>
        </div>

        {/* RSVP */}
        {myAttendee && m.status === 'scheduled' && !isMeetingPast(m) && (
          <div style={{ ...S.card, marginBottom: 16 }}>
            <label style={S.label}>Ilmoittaudu</label>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <button
                onClick={() => updateRsvp(m.id, 'accepted', myAttendee.attendance || (m.location.type === 'remote' ? 'remote' : 'in-person'))}
                style={{ ...S.btn, background: myAttendee.rsvp === 'accepted' ? '#2dd4a0' : 'var(--card)', color: myAttendee.rsvp === 'accepted' ? '#fff' : 'var(--fg)', border: '1px solid var(--border)' }}>
                Osallistun
              </button>
              <button
                onClick={() => updateRsvp(m.id, 'declined', null)}
                style={{ ...S.btn, background: myAttendee.rsvp === 'declined' ? '#ef4444' : 'var(--card)', color: myAttendee.rsvp === 'declined' ? '#fff' : 'var(--fg)', border: '1px solid var(--border)' }}>
                En paase
              </button>
            </div>
            {myAttendee.rsvp === 'accepted' && m.location.type !== 'remote' && (
              <div>
                <label style={S.label}>Osallistumistapa</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={() => updateRsvp(m.id, 'accepted', 'in-person')}
                    style={{ ...S.btnSm, background: myAttendee.attendance === 'in-person' ? 'var(--accent)' : 'transparent', color: myAttendee.attendance === 'in-person' ? '#fff' : 'var(--fg)' }}>
                    Paikalla
                  </button>
                  {(m.location.type === 'hybrid' || m.location.meetLink) && (
                    <button
                      onClick={() => updateRsvp(m.id, 'accepted', 'remote')}
                      style={{ ...S.btnSm, background: myAttendee.attendance === 'remote' ? 'var(--accent)' : 'transparent', color: myAttendee.attendance === 'remote' ? '#fff' : 'var(--fg)' }}>
                      Etana
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Osallistujalista */}
        <div style={S.section}>
          <label style={S.label}>Osallistujat ({m.attendees.length})</label>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>
            <span style={{ color: '#2dd4a0' }}>{counts.accepted} osallistuu</span>
            <span>{counts.pending} odottaa</span>
            <span style={{ color: '#ef4444' }}>{counts.declined} ei paase</span>
          </div>
          {m.attendees.map(a => (
            <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
              <div>
                <span style={{ fontWeight: 500, fontSize: 14 }}>{a.name}</span>
                {a.type === 'external' && <span style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 6 }}>(vieras)</span>}
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                {a.attendance && (
                  <span style={{ ...S.tag, background: 'rgba(160,160,160,.1)', fontSize: 11 }}>
                    {a.attendance === 'in-person' ? 'paikalla' : 'etana'}
                  </span>
                )}
                <span style={{ ...S.tag, background: RSVP_COLORS[a.rsvp].bg, color: RSVP_COLORS[a.rsvp].color }}>
                  {RSVP_COLORS[a.rsvp].label}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Jarjestajan toiminnot */}
        {isOrganizer && m.status === 'scheduled' && (
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <button onClick={() => cancelMeeting(m.id)} style={{ ...S.btnSec, color: '#ef4444', borderColor: '#ef4444' }}>
              Peru palaveri
            </button>
          </div>
        )}
      </div>
    );
  }

  // ── POLL-DETAIL-nakymma ────────────────────────────────────────

  if (mode === 'poll-detail' && selectedPoll) {
    const p = selectedPoll;
    const isCreator = currentMember && p.createdBy === user?.uid;

    const getVotesForOption = (optionId: string) => p.votes.filter(v => v.optionId === optionId);
    const getMyVote = (optionId: string) => currentMember ? p.votes.find(v => v.optionId === optionId && v.memberId === currentMember.id) : null;
    const yesCount = (optionId: string) => getVotesForOption(optionId).filter(v => v.vote === 'yes').length;

    return (
      <div style={{ maxWidth: 700 }}>
        <button onClick={() => { setSelectedId(null); setMode('browse'); }} style={{ ...S.btnSm, marginBottom: 12 }}>
          {'<'} Takaisin
        </button>

        <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>{p.title}</h2>
        {p.description && <div style={{ fontSize: 14, color: 'var(--muted)', marginBottom: 12 }}>{p.description}</div>}
        {p.deadline && <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 16 }}>Takaraja: {formatDate(p.deadline)}</div>}

        {/* Aanestysruudukko */}
        <div style={{ overflowX: 'auto', marginBottom: 16 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: 8, borderBottom: '2px solid var(--border)' }}>Osallistuja</th>
                {p.options.map(opt => (
                  <th key={opt.id} style={{ padding: 8, borderBottom: '2px solid var(--border)', textAlign: 'center', minWidth: 80 }}>
                    <div style={{ fontWeight: 600 }}>{formatDate(opt.date)}</div>
                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>{formatTimeRange(opt.startTime, opt.endTime)}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {/* Nykyinen kayttaja */}
              {currentMember && (
                <tr style={{ background: 'rgba(var(--accent-rgb),.05)' }}>
                  <td style={{ padding: 8, fontWeight: 600, borderBottom: '1px solid var(--border)' }}>{currentMember.name} (sina)</td>
                  {p.options.map(opt => {
                    const myVote = getMyVote(opt.id);
                    return (
                      <td key={opt.id} style={{ padding: 4, textAlign: 'center', borderBottom: '1px solid var(--border)' }}>
                        <div style={{ display: 'flex', gap: 2, justifyContent: 'center' }}>
                          {(['yes', 'maybe', 'no'] as const).map(v => (
                            <button key={v} onClick={() => votePoll(p.id, opt.id, v)}
                              style={{
                                ...S.btnSm,
                                background: myVote?.vote === v
                                  ? v === 'yes' ? '#2dd4a0' : v === 'maybe' ? '#f5c542' : '#ef4444'
                                  : 'transparent',
                                color: myVote?.vote === v ? '#fff' : 'var(--fg)',
                                padding: '3px 6px', fontSize: 11,
                              }}>
                              {v === 'yes' ? 'K' : v === 'maybe' ? '?' : 'E'}
                            </button>
                          ))}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              )}
              {/* Muut aanestajat */}
              {p.invitees.filter(inv => inv.memberId !== currentMember?.id).map(inv => (
                <tr key={inv.id}>
                  <td style={{ padding: 8, borderBottom: '1px solid var(--border)' }}>{inv.name}</td>
                  {p.options.map(opt => {
                    const v = p.votes.find(vote => vote.optionId === opt.id && vote.memberId === inv.memberId);
                    return (
                      <td key={opt.id} style={{ padding: 4, textAlign: 'center', borderBottom: '1px solid var(--border)' }}>
                        {v ? (
                          <span style={{ ...S.tag, background: v.vote === 'yes' ? 'rgba(45,212,160,.15)' : v.vote === 'maybe' ? 'rgba(245,197,66,.15)' : 'rgba(239,68,68,.15)', color: v.vote === 'yes' ? '#2dd4a0' : v.vote === 'maybe' ? '#f5c542' : '#ef4444' }}>
                            {v.vote === 'yes' ? 'K' : v.vote === 'maybe' ? '?' : 'E'}
                          </span>
                        ) : <span style={{ color: 'var(--muted)' }}>-</span>}
                      </td>
                    );
                  })}
                </tr>
              ))}
              {/* Yhteenveto */}
              <tr style={{ fontWeight: 600 }}>
                <td style={{ padding: 8 }}>Kylla-aanet</td>
                {p.options.map(opt => (
                  <td key={opt.id} style={{ padding: 8, textAlign: 'center', color: '#2dd4a0' }}>{yesCount(opt.id)}</td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>

        {/* Sulkeminen (vain luoja) */}
        {isCreator && p.status === 'open' && (
          <div style={S.section}>
            <label style={S.label}>Sulje aanestys ja luo palaveri</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {p.options.map(opt => (
                <button key={opt.id} onClick={() => closePoll(p.id, opt.id)}
                  style={{ ...S.btnSec, fontSize: 12 }}>
                  Valitse {formatDate(opt.date)} {opt.startTime} ({yesCount(opt.id)} kylla)
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // Fallback
  return (
    <div style={{ padding: 24, textAlign: 'center', color: 'var(--muted)' }}>
      <button onClick={() => setMode('browse')} style={S.btn}>Takaisin palavereihin</button>
    </div>
  );
}
