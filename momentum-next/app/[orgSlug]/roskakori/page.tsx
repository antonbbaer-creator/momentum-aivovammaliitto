'use client';

import { useEffect } from 'react';
import AppShell from '@/components/AppShell';
import { useOrgData } from '@/lib/firestore';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import { useParams, useRouter } from 'next/navigation';
import { filterTrashed, restoreItem, purgeItem, purgeExpired, daysUntilPurge, formatDeletedDate } from '@/lib/trash';
import { isSuperAdminEmail } from '@/lib/super-admins';

// Kaikki data-avaimet joissa voi olla roskakorissa olevia itemeja
interface TrashableItem { id: string | number; deletedAt?: number; [key: string]: any; }

interface DataSource {
  key: string;
  label: string;
  nameField: string; // mika kentta nayttaa nimen
}

const DATA_SOURCES: DataSource[] = [
  { key: 'films', label: 'Elokuvat', nameField: 'title' },
  { key: 'music', label: 'Musiikki', nameField: 'artist' },
  { key: 'workshops', label: 'Tyopajat', nameField: 'title' },
  { key: 'programme', label: 'Ohjelma', nameField: 'title' },
  { key: 'projects', label: 'Projektit', nameField: 't' },
  { key: 'orgTeams', label: 'Tiimit', nameField: 'name' },
  { key: 'orgTeamMembers', label: 'Tiimijasenet', nameField: 'name' },
  { key: 'events', label: 'Tapahtumat', nameField: 'title' },
  { key: 'llff_designs', label: 'Suunnitelmat', nameField: 'name' },
  { key: 'publications', label: 'Julkaisut', nameField: 'title' },
  { key: 'yearwheel', label: 'Vuosikello', nameField: 'label' },
  { key: 'meetingNotes', label: 'Muistiinpanot', nameField: 'title' },
  { key: 'tasks', label: 'Tehtavat', nameField: 'text' },
  { key: 'guests', label: 'Vieraat', nameField: 'name' },
  { key: 'menuItems', label: 'Ruoka', nameField: 'name' },
  { key: 'venues', label: 'Tilat', nameField: 'name' },
  { key: 'scheduleItems', label: 'Ohjelmanumerot', nameField: 'title' },
  { key: 'grants', label: 'Apurahat', nameField: 'name' },
];

function TrashDataRow({ source, items, setItems }: { source: DataSource; items: TrashableItem[]; setItems: (val: TrashableItem[] | ((prev: TrashableItem[]) => TrashableItem[])) => void }) {
  const { toast } = useToast();
  const trashed = filterTrashed(items);

  if (trashed.length === 0) return null;

  return (
    <div style={{ marginBottom: '1.25rem' }}>
      <div style={{ fontSize: '.72rem', fontWeight: 700, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: '.5rem' }}>
        {source.label} ({trashed.length})
      </div>
      {trashed.map(item => {
        const remaining = daysUntilPurge(item.deletedAt!);
        return (
          <div key={item.id} style={{
            display: 'flex', alignItems: 'center', gap: '.75rem', padding: '.75rem 1rem',
            background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--r)',
            marginBottom: '.35rem',
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '.85rem', fontWeight: 600, color: 'var(--t1)' }}>
                {item[source.nameField] || item.id}
              </div>
              <div style={{ fontSize: '.68rem', color: 'var(--t3)', marginTop: '.15rem' }}>
                Poistettu {formatDeletedDate(item.deletedAt!)} -- {remaining} pv jaljella
              </div>
            </div>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => {
                setItems(prev => restoreItem(prev, item.id));
                toast(`${item[source.nameField] || 'Item'} palautettu`, 'success');
              }}
              style={{ fontSize: '.65rem' }}
            >
              Palauta
            </button>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => {
                if (window.confirm('Poistetaanko lopullisesti? Tata ei voi perua.')) {
                  setItems(prev => purgeItem(prev, item.id));
                  toast('Poistettu lopullisesti', 'success');
                }
              }}
              style={{ fontSize: '.65rem', color: 'var(--red)' }}
            >
              Poista
            </button>
          </div>
        );
      })}
    </div>
  );
}

export default function RoskakoriPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const params = useParams();
  const orgSlug = (params?.orgSlug as string) || '';
  const isSuperAdmin = isSuperAdminEmail(user?.email);

  // Ladataan kaikki data-avaimet
  const [films, setFilms] = useOrgData<TrashableItem[]>('films', []);
  const [music, setMusic] = useOrgData<TrashableItem[]>('music', []);
  const [workshops, setWorkshops] = useOrgData<TrashableItem[]>('workshops', []);
  const [programme, setProgramme] = useOrgData<TrashableItem[]>('programme', []);
  const [projects, setProjects] = useOrgData<TrashableItem[]>('projects', []);
  const [orgTeams, setOrgTeams] = useOrgData<TrashableItem[]>('orgTeams', []);
  const [orgTeamMembers, setOrgTeamMembers] = useOrgData<TrashableItem[]>('orgTeamMembers', []);
  const [events, setEvents] = useOrgData<TrashableItem[]>('events', []);
  const [designs, setDesigns] = useOrgData<TrashableItem[]>('llff_designs', []);
  const [publications, setPublications] = useOrgData<TrashableItem[]>('publications', []);
  const [yearwheel, setYearwheel] = useOrgData<TrashableItem[]>('yearwheel', []);
  const [meetingNotes, setMeetingNotes] = useOrgData<TrashableItem[]>('meetingNotes', []);
  const [tasks, setTasks] = useOrgData<TrashableItem[]>('tasks', []);
  const [guests, setGuests] = useOrgData<TrashableItem[]>('guests', []);
  const [menuItems, setMenuItems] = useOrgData<TrashableItem[]>('menuItems', []);
  const [venues, setVenues] = useOrgData<TrashableItem[]>('venues', []);
  const [scheduleItems, setScheduleItems] = useOrgData<TrashableItem[]>('scheduleItems', []);
  const [grants, setGrants] = useOrgData<TrashableItem[]>('grants', []);

  const dataMap: Record<string, { items: TrashableItem[]; set: any }> = {
    films: { items: films, set: setFilms },
    music: { items: music, set: setMusic },
    workshops: { items: workshops, set: setWorkshops },
    programme: { items: programme, set: setProgramme },
    projects: { items: projects, set: setProjects },
    orgTeams: { items: orgTeams, set: setOrgTeams },
    orgTeamMembers: { items: orgTeamMembers, set: setOrgTeamMembers },
    events: { items: events, set: setEvents },
    llff_designs: { items: designs, set: setDesigns },
    publications: { items: publications, set: setPublications },
    yearwheel: { items: yearwheel, set: setYearwheel },
    meetingNotes: { items: meetingNotes, set: setMeetingNotes },
    tasks: { items: tasks, set: setTasks },
    guests: { items: guests, set: setGuests },
    menuItems: { items: menuItems, set: setMenuItems },
    venues: { items: venues, set: setVenues },
    scheduleItems: { items: scheduleItems, set: setScheduleItems },
    grants: { items: grants, set: setGrants },
  };

  // Automaattinen 30pv vanhojen purge
  useEffect(() => {
    if (!isSuperAdmin) return;
    for (const source of DATA_SOURCES) {
      const { items, set } = dataMap[source.key];
      const purged = purgeExpired(items);
      if (purged.length < items.length) {
        set(purged);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuperAdmin]);

  // Ei-superadminit ohjataan pois
  useEffect(() => {
    if (user && !isSuperAdmin) {
      router.push(`/${orgSlug}/dashboard`);
    }
  }, [user, isSuperAdmin, orgSlug, router]);

  if (!isSuperAdmin) {
    return <AppShell title="Roskakori"><div style={{ padding: '2rem', textAlign: 'center', color: 'var(--t3)' }}>Ei oikeuksia.</div></AppShell>;
  }

  const totalTrashed = DATA_SOURCES.reduce((sum, s) => sum + filterTrashed(dataMap[s.key].items).length, 0);

  const emptyAllTrash = () => {
    if (!window.confirm(`Tyhjennetaanko roskakori (${totalTrashed} kohdetta)? Tata ei voi perua.`)) return;
    for (const source of DATA_SOURCES) {
      const { items, set } = dataMap[source.key];
      if (filterTrashed(items).length > 0) {
        set((prev: TrashableItem[]) => prev.filter((item: TrashableItem) => !item.deletedAt));
      }
    }
    toast('Roskakori tyhjennetty', 'success');
  };

  return (
    <AppShell title="Roskakori" subtitle={`${totalTrashed} kohdetta roskakorissa -- poistetaan automaattisesti 30 paivan jalkeen`}>
      {totalTrashed > 0 && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
          <button className="btn btn-ghost btn-sm" onClick={emptyAllTrash} style={{ color: 'var(--red)' }}>
            Tyhjenna roskakori
          </button>
        </div>
      )}

      {totalTrashed === 0 && (
        <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--t3)' }}>
          <div style={{ fontSize: '2rem', marginBottom: '.5rem', opacity: .3 }}>{'{ }'}</div>
          <p style={{ fontSize: '.88rem' }}>Roskakori on tyhja.</p>
          <p style={{ fontSize: '.75rem', marginTop: '.25rem' }}>Poistetut kohteet sailyvat taalla 30 paivaa.</p>
        </div>
      )}

      {DATA_SOURCES.map(source => (
        <TrashDataRow
          key={source.key}
          source={source}
          items={dataMap[source.key].items}
          setItems={dataMap[source.key].set}
        />
      ))}
    </AppShell>
  );
}
