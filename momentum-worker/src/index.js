/**
 * Momentum Worker — Cloudflare Worker
 * Handles: Meta OAuth, Graph API proxy, R2 media storage
 */

// ── CORS ──
function corsHeaders(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allowed = (env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim());
  const isAllowed = allowed.some(a => origin.startsWith(a) || a === '*');
  return {
    'Access-Control-Allow-Origin': isAllowed ? origin : allowed[0] || '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Momentum-Org',
    'Access-Control-Max-Age': '86400',
  };
}

function corsResponse(request, env, body, status = 200, extraHeaders = {}) {
  return new Response(body ? JSON.stringify(body) : null, {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders(request, env),
      ...extraHeaders,
    },
  });
}

// ── ROUTER ──
export default {
  async fetch(request, env, ctx) {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(request, env) });
    }

    const url = new URL(request.url);
    const path = url.pathname;
    const orgId = request.headers.get('X-Momentum-Org') || 'avl';

    try {
      // ── AUTH ROUTES ──
      if (path === '/auth/facebook/init') {
        return handleFacebookInit(request, env, orgId);
      }
      if (path === '/auth/callback') {
        return handleFacebookCallback(request, env, url);
      }
      if (path === '/auth/status') {
        return handleAuthStatus(request, env, orgId);
      }
      if (path === '/auth/disconnect') {
        return handleDisconnect(request, env, orgId);
      }

      // ── META API ROUTES ──
      if (path === '/api/insights') {
        return handleInsights(request, env, orgId);
      }
      if (path === '/api/publish' && request.method === 'POST') {
        return handlePublish(request, env, orgId);
      }

      // ── MEDIA ROUTES ──
      if (path === '/media/upload' && request.method === 'POST') {
        return handleMediaUpload(request, env, orgId);
      }
      if (path === '/media/list') {
        return handleMediaList(request, env, orgId, url);
      }
      if (path.startsWith('/media/file/')) {
        return handleMediaFile(request, env, path);
      }
      if (path.startsWith('/media/delete/') && request.method === 'DELETE') {
        return handleMediaDelete(request, env, path);
      }

      // ── HEALTH CHECK ──
      if (path === '/' || path === '/health') {
        return corsResponse(request, env, {
          status: 'ok',
          service: 'momentum-worker',
          timestamp: new Date().toISOString(),
        });
      }

      return corsResponse(request, env, { error: 'Not found' }, 404);
    } catch (err) {
      console.error('Worker error:', err);
      return corsResponse(request, env, { error: err.message }, 500);
    }
  },
};

// ══════ AUTH: META OAUTH ══════

async function handleFacebookInit(request, env, orgId) {
  const appId = env.META_APP_ID;
  if (!appId) return corsResponse(request, env, { error: 'META_APP_ID not configured' }, 500);

  const redirectUri = `${new URL(request.url).origin}/auth/callback`;
  const state = orgId + ':' + crypto.randomUUID();
  const scope = 'pages_read_engagement,pages_show_list,pages_manage_posts,instagram_manage_insights,instagram_content_publish';

  const fbUrl = `https://www.facebook.com/v19.0/dialog/oauth?client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scope}&state=${state}&response_type=code`;

  return corsResponse(request, env, { url: fbUrl, state });
}

async function handleFacebookCallback(request, env, url) {
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const error = url.searchParams.get('error');

  if (error) {
    return new Response(`<html><script>window.close();alert('Meta-yhteys epaonnistui: ${error}');</script></html>`, {
      headers: { 'Content-Type': 'text/html' },
    });
  }

  const orgId = state ? state.split(':')[0] : 'avl';
  const redirectUri = `${url.origin}/auth/callback`;
  const appId = env.META_APP_ID;
  const appSecret = env.META_APP_SECRET;

  // Exchange code for short-lived token
  const tokenRes = await fetch(
    `https://graph.facebook.com/v19.0/oauth/access_token?client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&client_secret=${appSecret}&code=${code}`
  );
  const tokenData = await tokenRes.json();
  if (tokenData.error) {
    return new Response(`<html><script>window.close();alert('Token error: ${tokenData.error.message}');</script></html>`, {
      headers: { 'Content-Type': 'text/html' },
    });
  }

  // Exchange for long-lived token (60 days)
  const longRes = await fetch(
    `https://graph.facebook.com/v19.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${tokenData.access_token}`
  );
  const longData = await longRes.json();
  const longToken = longData.access_token || tokenData.access_token;

  // Get managed pages
  const pagesRes = await fetch(`https://graph.facebook.com/v19.0/me/accounts?access_token=${longToken}`);
  const pagesData = await pagesRes.json();

  if (!pagesData.data || pagesData.data.length === 0) {
    return new Response(`<html><script>window.close();alert('Ei Facebook-sivuja loydetty.');</script></html>`, {
      headers: { 'Content-Type': 'text/html' },
    });
  }

  const page = pagesData.data[0]; // Use first page
  const pageToken = page.access_token;
  const pageId = page.id;
  const pageName = page.name;

  // Get Instagram Business Account
  let igAccountId = null;
  try {
    const igRes = await fetch(`https://graph.facebook.com/v19.0/${pageId}?fields=instagram_business_account&access_token=${pageToken}`);
    const igData = await igRes.json();
    igAccountId = igData.instagram_business_account?.id || null;
  } catch (e) { /* no IG account linked */ }

  // Store in KV (encrypted in production)
  if (env.META_TOKENS) {
    await env.META_TOKENS.put(`${orgId}:meta`, JSON.stringify({
      pageToken,
      pageId,
      pageName,
      igAccountId,
      connectedAt: new Date().toISOString(),
    }));
  }

  // Redirect back to SPA
  const spaUrl = env.ALLOWED_ORIGINS?.split(',')[0] || 'http://localhost:8080';
  return new Response(`<html><script>
    if(window.opener){window.opener.postMessage({type:'meta_connected',pageName:'${pageName}',pageId:'${pageId}',igAccountId:'${igAccountId || ''}'},'*');window.close()}
    else{window.location.href='${spaUrl}/momentum-aivovammaliitto.html?meta_connected=true'}
  </script></html>`, { headers: { 'Content-Type': 'text/html' } });
}

async function handleAuthStatus(request, env, orgId) {
  if (!env.META_TOKENS) return corsResponse(request, env, { connected: false });
  const data = await env.META_TOKENS.get(`${orgId}:meta`);
  if (!data) return corsResponse(request, env, { connected: false });
  const parsed = JSON.parse(data);
  return corsResponse(request, env, {
    connected: true,
    pageName: parsed.pageName,
    pageId: parsed.pageId,
    igAccountId: parsed.igAccountId,
    connectedAt: parsed.connectedAt,
  });
}

async function handleDisconnect(request, env, orgId) {
  if (env.META_TOKENS) await env.META_TOKENS.delete(`${orgId}:meta`);
  return corsResponse(request, env, { disconnected: true });
}

// ══════ INSIGHTS ══════

async function handleInsights(request, env, orgId) {
  if (!env.META_TOKENS) return corsResponse(request, env, { error: 'KV not configured' }, 500);

  // Check cache first
  const cacheKey = `${orgId}:insights_cache`;
  const cached = await env.META_TOKENS.get(cacheKey);
  if (cached) {
    const parsed = JSON.parse(cached);
    if (Date.now() - parsed.fetchedAt < 3600000) { // 1 hour cache
      return corsResponse(request, env, parsed.data);
    }
  }

  const metaData = await env.META_TOKENS.get(`${orgId}:meta`);
  if (!metaData) return corsResponse(request, env, { error: 'Meta not connected' }, 401);
  const { pageToken, pageId, igAccountId } = JSON.parse(metaData);

  const result = { facebook: null, instagram: null };

  // Facebook insights
  try {
    const fbRes = await fetch(`https://graph.facebook.com/v19.0/${pageId}?fields=fan_count,followers_count,name&access_token=${pageToken}`);
    const fbData = await fbRes.json();

    const insRes = await fetch(`https://graph.facebook.com/v19.0/${pageId}/insights?metric=page_impressions,page_engaged_users,page_post_engagements&period=days_28&access_token=${pageToken}`);
    const insData = await insRes.json();

    result.facebook = {
      followers: fbData.followers_count || fbData.fan_count || 0,
      pageName: fbData.name,
      reach28d: insData.data?.find(m => m.name === 'page_impressions')?.values?.[0]?.value || 0,
      engagement28d: insData.data?.find(m => m.name === 'page_engaged_users')?.values?.[0]?.value || 0,
      lastUpdated: new Date().toISOString().slice(0, 10),
    };
  } catch (e) { result.facebook = { error: e.message }; }

  // Instagram insights
  if (igAccountId) {
    try {
      const igRes = await fetch(`https://graph.facebook.com/v19.0/${igAccountId}?fields=followers_count,media_count,username&access_token=${pageToken}`);
      const igData = await igRes.json();

      result.instagram = {
        followers: igData.followers_count || 0,
        posts: igData.media_count || 0,
        username: igData.username,
        lastUpdated: new Date().toISOString().slice(0, 10),
      };
    } catch (e) { result.instagram = { error: e.message }; }
  }

  // Cache for 1 hour
  await env.META_TOKENS.put(cacheKey, JSON.stringify({ data: result, fetchedAt: Date.now() }));

  return corsResponse(request, env, result);
}

// ══════ PUBLISH ══════

async function handlePublish(request, env, orgId) {
  if (!env.META_TOKENS) return corsResponse(request, env, { error: 'KV not configured' }, 500);

  const metaData = await env.META_TOKENS.get(`${orgId}:meta`);
  if (!metaData) return corsResponse(request, env, { error: 'Meta not connected' }, 401);
  const { pageToken, pageId, igAccountId } = JSON.parse(metaData);

  const body = await request.json();
  const { platform, message, imageUrl, link } = body;

  if (platform === 'facebook') {
    let endpoint, params;
    if (imageUrl) {
      endpoint = `https://graph.facebook.com/v19.0/${pageId}/photos`;
      params = new URLSearchParams({ url: imageUrl, caption: message, access_token: pageToken });
    } else {
      endpoint = `https://graph.facebook.com/v19.0/${pageId}/feed`;
      params = new URLSearchParams({ message, access_token: pageToken });
      if (link) params.append('link', link);
    }
    const res = await fetch(endpoint, { method: 'POST', body: params });
    const data = await res.json();
    if (data.error) return corsResponse(request, env, { error: data.error.message }, 400);
    return corsResponse(request, env, { success: true, postId: data.id || data.post_id });
  }

  if (platform === 'instagram' && igAccountId) {
    // Step 1: Create media container
    const createParams = new URLSearchParams({
      caption: message,
      access_token: pageToken,
    });
    if (imageUrl) createParams.append('image_url', imageUrl);

    const createRes = await fetch(`https://graph.facebook.com/v19.0/${igAccountId}/media`, {
      method: 'POST', body: createParams,
    });
    const createData = await createRes.json();
    if (createData.error) return corsResponse(request, env, { error: createData.error.message }, 400);

    // Step 2: Publish
    const pubRes = await fetch(`https://graph.facebook.com/v19.0/${igAccountId}/media_publish`, {
      method: 'POST',
      body: new URLSearchParams({ creation_id: createData.id, access_token: pageToken }),
    });
    const pubData = await pubRes.json();
    if (pubData.error) return corsResponse(request, env, { error: pubData.error.message }, 400);
    return corsResponse(request, env, { success: true, mediaId: pubData.id });
  }

  return corsResponse(request, env, { error: 'Unsupported platform' }, 400);
}

// ══════ MEDIA (R2) ══════

async function handleMediaUpload(request, env, orgId) {
  if (!env.MEDIA_BUCKET) return corsResponse(request, env, { error: 'R2 not configured' }, 500);

  const formData = await request.formData();
  const file = formData.get('file');
  const folder = formData.get('folder') || 'uploaded';

  if (!file) return corsResponse(request, env, { error: 'No file provided' }, 400);

  const timestamp = Date.now();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const key = `${orgId}/${folder}/${timestamp}_${safeName}`;

  await env.MEDIA_BUCKET.put(key, file.stream(), {
    httpMetadata: { contentType: file.type },
    customMetadata: { orgId, folder, originalName: file.name, uploadedAt: new Date().toISOString() },
  });

  const publicUrl = `${new URL(request.url).origin}/media/file/${key}`;

  return corsResponse(request, env, {
    id: `r2_${timestamp}_${Math.random().toString(36).slice(2, 8)}`,
    name: file.name,
    key,
    publicUrl,
    size: file.size,
    type: file.type,
    folder,
    uploaded: new Date().toISOString().slice(0, 10),
  });
}

async function handleMediaList(request, env, orgId, url) {
  if (!env.MEDIA_BUCKET) return corsResponse(request, env, { error: 'R2 not configured' }, 500);

  const folder = url.searchParams.get('folder') || '';
  const prefix = folder ? `${orgId}/${folder}/` : `${orgId}/`;
  const limit = parseInt(url.searchParams.get('limit') || '100');

  const listed = await env.MEDIA_BUCKET.list({ prefix, limit });
  const files = listed.objects.map(obj => ({
    key: obj.key,
    size: obj.size,
    uploaded: obj.uploaded?.toISOString(),
    publicUrl: `${url.origin}/media/file/${obj.key}`,
    name: obj.key.split('/').pop(),
    folder: obj.key.split('/')[1] || 'unknown',
  }));

  return corsResponse(request, env, { files, truncated: listed.truncated, count: files.length });
}

async function handleMediaFile(request, env, path) {
  if (!env.MEDIA_BUCKET) return new Response('R2 not configured', { status: 500 });

  const key = path.replace('/media/file/', '');
  const object = await env.MEDIA_BUCKET.get(key);
  if (!object) return new Response('Not found', { status: 404 });

  return new Response(object.body, {
    headers: {
      'Content-Type': object.httpMetadata?.contentType || 'application/octet-stream',
      'Cache-Control': 'public, max-age=31536000',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

async function handleMediaDelete(request, env, path) {
  if (!env.MEDIA_BUCKET) return corsResponse(request, env, { error: 'R2 not configured' }, 500);

  const key = path.replace('/media/delete/', '');
  await env.MEDIA_BUCKET.delete(key);
  return corsResponse(request, env, { deleted: true, key });
}
