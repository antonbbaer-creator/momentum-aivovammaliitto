'use client';

import { useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';

export default function TimelinePage() {
  const router = useRouter();
  const params = useParams();
  const orgSlug = params.orgSlug as string;

  useEffect(() => {
    router.replace(`/${orgSlug}/aikataulut`);
  }, [router, orgSlug]);

  return (
    <div className="onb">
      <div className="onb-wrap" style={{ textAlign: 'center' }}>
        <div className="typing"><span /><span /><span /></div>
      </div>
    </div>
  );
}
