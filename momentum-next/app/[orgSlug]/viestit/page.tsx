'use client';

import { Suspense } from 'react';
import AppShell from '@/components/AppShell';
import ChatLayout from '@/components/chat/ChatLayout';

export default function ViestitPage() {
  return (
    <Suspense
      fallback={
        <div className="onb">
          <div className="onb-wrap" style={{ textAlign: 'center' }}>
            <div className="typing"><span /><span /><span /></div>
          </div>
        </div>
      }
    >
      <AppShell title="Viestit" subtitle="Tiimin sisäinen keskustelu">
        <ChatLayout />
      </AppShell>
    </Suspense>
  );
}
