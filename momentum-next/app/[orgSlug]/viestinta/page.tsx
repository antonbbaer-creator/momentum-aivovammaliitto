'use client';

import { Suspense } from 'react';
import { useSearchParams, usePathname, useRouter } from 'next/navigation';
import AppShell from '@/components/AppShell';
import TabSwitcher from '@/components/TabSwitcher';
import PublicationQueueSection from '@/components/sections/PublicationQueueSection';
import PublicationDetailSection from '@/components/sections/PublicationDetailSection';
import CalendarSection from '@/components/sections/CalendarSection';
import MediaSection from '@/components/sections/MediaSection';
import ChannelsSection from '@/components/sections/ChannelsSection';
import EditorSection from '@/components/sections/EditorSection';

// Fullscreen (no-tab) views that still live under ?tab=...
const FULLSCREEN_VIEWS = ['detail', 'editor'] as const;
type FullscreenView = (typeof FULLSCREEN_VIEWS)[number];

const MAIN_TABS = ['queue', 'timeline', 'media', 'channels'] as const;
type MainTab = (typeof MAIN_TABS)[number];

type ViewId = MainTab | FullscreenView;

function isMainTab(s: string | null): s is MainTab {
  return s !== null && (MAIN_TABS as readonly string[]).includes(s);
}

function isFullscreen(s: string | null): s is FullscreenView {
  return s !== null && (FULLSCREEN_VIEWS as readonly string[]).includes(s);
}

function ViestintaContent() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  const rawTab = searchParams.get('tab');
  const view: ViewId = isMainTab(rawTab) || isFullscreen(rawTab) ? rawTab : 'queue';
  const activeId = searchParams.get('id'); // used by 'detail' view
  const editorPubId = searchParams.get('pubId'); // used by 'editor' view

  const navigate = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === null) p.delete(k);
      else p.set(k, v);
    }
    router.replace(`${pathname}?${p.toString()}`, { scroll: false });
  };

  const openDetail = (id: string) => navigate({ tab: 'detail', id });
  const openEditor = (pubId?: string) => navigate({ tab: 'editor', pubId: pubId ?? null, id: null });
  const backToQueue = () => navigate({ tab: 'queue', id: null, pubId: null });

  // ============ FULLSCREEN VIEWS (no TabSwitcher) ============
  if (view === 'editor') {
    return (
      <AppShell title="Editori" subtitle="Luo julkaisu — LLFF brand">
        <button className="btn btn-ghost" onClick={backToQueue} style={{ marginBottom: '1rem' }}>
          {'←'} Takaisin työjonoon
        </button>
        <EditorSection />
      </AppShell>
    );
  }

  if (view === 'detail' && activeId) {
    return (
      <AppShell title="Julkaisu" subtitle="Brief, sisältö ja materiaalit yhdessä näkymässä">
        <PublicationDetailSection
          publicationId={activeId}
          onBack={backToQueue}
          onOpenEditor={(id) => openEditor(id)}
        />
      </AppShell>
    );
  }

  // ============ MAIN TABBED VIEWS ============
  const mainTab: MainTab = isMainTab(rawTab) ? rawTab : 'queue';

  const setMainTab = (id: MainTab) => navigate({ tab: id, id: null, pubId: null });

  return (
    <AppShell
      title="Viestintä"
      subtitle="Mitä tehdään → tehdään → julkaistaan"
    >
      <TabSwitcher
        tabs={[
          { id: 'queue',    label: 'Työjono',     icon: '◉' },
          { id: 'timeline', label: 'Aikajana',    icon: '◌' },
          { id: 'media',    label: 'Mediapankki', icon: '▣' },
          { id: 'channels', label: 'Kanavat',     icon: '◇' },
        ]}
        active={mainTab}
        onChange={(id) => setMainTab(id as MainTab)}
      />

      {mainTab === 'queue' && (
        <PublicationQueueSection
          onOpenDetail={openDetail}
          onOpenEditor={openEditor}
        />
      )}
      {mainTab === 'timeline' && <CalendarSection mode="viestinta" onOpenPublication={openDetail} />}
      {mainTab === 'media' && <MediaSection />}
      {mainTab === 'channels' && <ChannelsSection />}
    </AppShell>
  );
}

export default function ViestintaPage() {
  return (
    <Suspense
      fallback={
        <div className="onb">
          <div className="onb-wrap" style={{ textAlign: 'center' }}>
            <div className="typing">
              <span />
              <span />
              <span />
            </div>
          </div>
        </div>
      }
    >
      <ViestintaContent />
    </Suspense>
  );
}
