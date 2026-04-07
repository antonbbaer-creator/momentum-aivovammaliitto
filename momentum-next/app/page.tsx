'use client';

import { useAuth } from '@/lib/auth';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function RootPage() {
  const { user, loading, orgs } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.push('/login');
    } else if (orgs.length === 0) {
      router.push('/onboarding');
    } else {
      router.push('/dashboard');
    }
  }, [user, loading, orgs, router]);

  return (
    <div className="onb">
      <div className="onb-wrap" style={{ textAlign: 'center' }}>
        <div className="typing"><span /><span /><span /></div>
      </div>
    </div>
  );
}
