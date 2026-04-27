'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function OmaIndexPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/oma/koti');
  }, [router]);
  return null;
}
