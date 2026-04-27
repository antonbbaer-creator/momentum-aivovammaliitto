'use client';

import { useAuth } from '@/lib/auth';
import { useRouter } from 'next/navigation';
import { useEffect, ReactNode } from 'react';
import dynamic from 'next/dynamic';

const UserGuide = dynamic(() => import('@/components/UserGuide'), { ssr: false });

export default function OmaLayout({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) router.push('/login');
  }, [loading, user, router]);

  if (loading || !user) {
    return (
      <div className="onb">
        <div className="onb-wrap" style={{ textAlign: 'center' }}>
          <div className="typing"><span /><span /><span /></div>
        </div>
      </div>
    );
  }

  return (
    <>
      {children}
      <UserGuide />
    </>
  );
}
