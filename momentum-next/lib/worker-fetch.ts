'use client';

import { auth } from './firebase';

export const WORKER_URL = 'https://momentum-worker.anton-4f9.workers.dev';

interface WorkerFetchOptions extends Omit<RequestInit, 'headers'> {
  orgId?: string;
  headers?: Record<string, string>;
}

/**
 * Authenticated fetch wrapper for Worker API calls.
 * Automatically attaches Firebase ID token and X-Momentum-Org header.
 */
export async function workerFetch(path: string, options: WorkerFetchOptions = {}): Promise<Response> {
  const { orgId, headers: extraHeaders, ...rest } = options;

  const authHeaders: Record<string, string> = {};

  // Attach Firebase ID token if user is logged in
  if (auth.currentUser) {
    try {
      const token = await auth.currentUser.getIdToken();
      authHeaders['Authorization'] = `Bearer ${token}`;
    } catch {
      // Token refresh failed — request will get 401 from worker
    }
  }

  if (orgId) {
    authHeaders['X-Momentum-Org'] = orgId;
  }

  // Don't set Content-Type if body is FormData (browser sets it with boundary)
  const isFormData = rest.body instanceof FormData;
  if (!isFormData && !extraHeaders?.['Content-Type'] && rest.method && rest.method !== 'GET') {
    authHeaders['Content-Type'] = 'application/json';
  }

  return fetch(`${WORKER_URL}${path}`, {
    ...rest,
    headers: {
      ...authHeaders,
      ...extraHeaders,
    },
  });
}
