/**
 * Momentum Worker — Cloudflare Worker
 * Handles: Meta OAuth, Graph API proxy, R2 media storage
 */

// ── CORS ──
function corsHeaders(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allowed = (env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  // Always allow localhost/127.0.0.1 on any port for development
  const isLocalhost = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  const isAllowed = isLocalhost || allowed.some(a => a === '*' || origin === a || origin.startsWith(a));
  return {
    'Access-Control-Allow-Origin': isAllowed && origin ? origin : (allowed[0] || '*'),
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Momentum-Org',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
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

      // ── AI CHAT ──
      if (path === '/api/chat' && request.method === 'POST') {
        return handleChat(request, env, orgId);
      }
      if (path === '/api/ai/assist' && request.method === 'POST') {
        return handleAiAssist(request, env, orgId);
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
      if (path.startsWith('/media/thumb/')) {
        return handleMediaThumb(request, env, path, url);
      }
      if (path.startsWith('/media/img/')) {
        return handleMediaImg(request, env, path, url);
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
  const thumb = formData.get('thumb'); // optional client-generated thumbnail
  const folder = formData.get('folder') || 'uploaded';

  if (!file) return corsResponse(request, env, { error: 'No file provided' }, 400);

  const timestamp = Date.now();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const key = `${orgId}/${folder}/${timestamp}_${safeName}`;

  await env.MEDIA_BUCKET.put(key, file.stream(), {
    httpMetadata: { contentType: file.type },
    customMetadata: { orgId, folder, originalName: file.name, uploadedAt: new Date().toISOString() },
  });

  // Store client-generated thumbnail alongside the original (if provided)
  let hasThumb = false;
  if (thumb && typeof thumb === 'object' && 'stream' in thumb) {
    try {
      await env.MEDIA_BUCKET.put(`${key}.thumb.jpg`, thumb.stream(), {
        httpMetadata: { contentType: 'image/jpeg' },
        customMetadata: { orgId, folder, thumbFor: key },
      });
      hasThumb = true;
    } catch (e) {
      console.warn('Thumbnail upload failed:', e?.message);
    }
  }

  const origin = new URL(request.url).origin;
  const publicUrl = `${origin}/media/file/${key}`;
  const thumbUrl = hasThumb ? `${origin}/media/thumb/${key}` : publicUrl;

  return corsResponse(request, env, {
    id: `r2_${timestamp}_${Math.random().toString(36).slice(2, 8)}`,
    name: file.name,
    key,
    publicUrl,
    thumbUrl,
    hasThumb,
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

  // Filter out thumbnail sidecar files and build a fast lookup for which
  // originals have a pre-generated thumbnail.
  const thumbKeys = new Set(
    listed.objects.filter(o => o.key.endsWith('.thumb.jpg')).map(o => o.key.replace(/\.thumb\.jpg$/, ''))
  );
  const originals = listed.objects.filter(o => !o.key.endsWith('.thumb.jpg'));

  const files = originals.map(obj => ({
    key: obj.key,
    size: obj.size,
    uploaded: obj.uploaded?.toISOString(),
    publicUrl: `${url.origin}/media/file/${obj.key}`,
    thumbUrl: thumbKeys.has(obj.key)
      ? `${url.origin}/media/thumb/${obj.key}`
      : `${url.origin}/media/file/${obj.key}`,
    hasThumb: thumbKeys.has(obj.key),
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

  const headers = {
    'Content-Type': object.httpMetadata?.contentType || 'application/octet-stream',
    'Cache-Control': 'public, max-age=31536000, immutable',
    'Access-Control-Allow-Origin': '*',
    'CF-Cache-Status': 'HIT',
  };
  if (object.size) headers['Content-Length'] = String(object.size);
  return new Response(object.body, { headers });
}

// Serves a pre-generated thumbnail stored in R2 alongside the original.
// Thumbs are written at upload time (see handleMediaUpload) as `<key>.thumb.jpg`.
async function handleMediaThumb(request, env, path, url) {
  if (!env.MEDIA_BUCKET) return new Response('R2 not configured', { status: 500 });

  const key = path.replace('/media/thumb/', '');
  const thumbKey = `${key}.thumb.jpg`;
  const cache = caches.default;
  const cacheKey = new Request(url.toString(), request);
  let cached = await cache.match(cacheKey);
  if (cached) return cached;

  // Try pre-generated thumbnail first
  let object = await env.MEDIA_BUCKET.get(thumbKey);
  // Fall back to original if no thumbnail exists (legacy uploads)
  if (!object) object = await env.MEDIA_BUCKET.get(key);
  if (!object) return new Response('Not found', { status: 404 });

  const headers = new Headers({
    'Content-Type': object.httpMetadata?.contentType || 'image/jpeg',
    'Cache-Control': 'public, max-age=31536000, immutable',
    'Access-Control-Allow-Origin': '*',
  });
  const response = new Response(object.body, { headers });
  // Cache at the edge for subsequent requests
  try { await cache.put(cacheKey, response.clone()); } catch {}
  return response;
}

// Cloudflare Image Resizing proxy. Requires Images product enabled on the zone.
// Usage: /media/img/<key>?w=400&q=75&f=webp
// If Image Resizing is not available on the zone, falls back to returning the original.
async function handleMediaImg(request, env, path, url) {
  if (!env.MEDIA_BUCKET) return new Response('R2 not configured', { status: 500 });

  const key = path.replace('/media/img/', '');
  const width = parseInt(url.searchParams.get('w') || '400');
  const quality = parseInt(url.searchParams.get('q') || '75');
  const format = url.searchParams.get('f') || 'auto';

  const cache = caches.default;
  const cacheKey = new Request(url.toString(), request);
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  const object = await env.MEDIA_BUCKET.get(key);
  if (!object) return new Response('Not found', { status: 404 });

  // Wrap the R2 body in a Response and pass it back out through fetch() with cf.image.
  // This triggers Cloudflare Image Resizing at the edge when the feature is enabled.
  const originRes = new Response(object.body, {
    headers: { 'Content-Type': object.httpMetadata?.contentType || 'image/jpeg' },
  });

  let resized;
  try {
    resized = await fetch(`${url.origin}/media/file/${key}`, {
      cf: { image: { width, quality, format, fit: 'scale-down' } },
    });
  } catch {
    resized = originRes;
  }

  const headers = new Headers(resized.headers);
  headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  headers.set('Access-Control-Allow-Origin', '*');
  const out = new Response(resized.body, { status: resized.status, headers });
  try { await cache.put(cacheKey, out.clone()); } catch {}
  return out;
}

async function handleMediaDelete(request, env, path) {
  if (!env.MEDIA_BUCKET) return corsResponse(request, env, { error: 'R2 not configured' }, 500);

  const key = path.replace('/media/delete/', '');
  // Delete original and its thumbnail sidecar in parallel (ignore missing thumb)
  await Promise.all([
    env.MEDIA_BUCKET.delete(key),
    env.MEDIA_BUCKET.delete(`${key}.thumb.jpg`).catch(() => {}),
  ]);
  return corsResponse(request, env, { deleted: true, key });
}

// ══════ AI CHAT (Anthropic Claude) ══════
// Tukee sekä yksinkertaista chatia (legacy: { messages, systemContext } → { response })
// että tool-use-orkestraatiota (uusi: { messages, system, tools, model } → Anthropicin raw response)

async function handleChat(request, env, orgId) {
  const body = await request.json();
  const { messages, systemContext, system, tools, model, max_tokens } = body;

  if (!messages || !Array.isArray(messages)) {
    return corsResponse(request, env, { error: 'messages required' }, 400);
  }

  const apiKey = env.ANTHROPIC_API_KEY;

  // Jos tools määritelty → tool-use -mode: palauta Anthropicin koko response (selain orkestroi loopin)
  if (apiKey && Array.isArray(tools) && tools.length > 0) {
    try {
      const payload = {
        model: model || 'claude-sonnet-4-5',
        max_tokens: max_tokens || 2048,
        system: system || systemContext || 'Olet Claude, tiimin AI-avustaja.',
        messages,
        tools,
      };
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const data = await res.json();
        return corsResponse(request, env, data);
      }
      const errText = await res.text();
      return corsResponse(request, env, { error: 'Anthropic API error', details: errText }, res.status);
    } catch (e) {
      return corsResponse(request, env, { error: 'Anthropic call failed: ' + e.message }, 500);
    }
  }

  // Legacy: yksinkertainen chat, ei työkaluja → palauta pelkkä text-response
  if (apiKey) {
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: model || 'claude-sonnet-4-5',
          max_tokens: max_tokens || 1024,
          system: system || systemContext || 'Olet viestinnän strateginen AI-kumppani. Vastaa suomeksi.',
          messages: messages.slice(-20),
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const response = data.content?.[0]?.text || 'Ei vastausta.';
        return corsResponse(request, env, { response });
      }
      // If Anthropic fails (no credits etc), fall through to Workers AI
    } catch (e) { /* fall through */ }
  }

  // Fallback: Cloudflare Workers AI (free) — vain legacy-polulle (ei tool-use-tukea)
  if (env.AI && (!tools || tools.length === 0)) {
    try {
      const prompt = (systemContext ? systemContext + '\n\n' : '') +
        messages.slice(-10).map(m => `${m.role === 'user' ? 'Käyttäjä' : 'Avustaja'}: ${m.content}`).join('\n') +
        '\nAvustaja:';

      const aiRes = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
        prompt,
        max_tokens: 800,
      });

      return corsResponse(request, env, { response: aiRes.response || 'Ei vastausta.' });
    } catch (e) {
      return corsResponse(request, env, { error: 'AI not available: ' + e.message }, 500);
    }
  }

  return corsResponse(request, env, { error: 'No AI provider configured' }, 500);
}

// ══════ AI ASSIST — tool-use loop suoritetaan kokonaisuudessaan workerin puolella ══════
// Client lähettää:
//   { message, history, context: { orgName, userName, availablePublicationChannels,
//                                   activePublications, voiceExamples } }
// Worker ajaa Anthropicin kanssa tool-use loopin, hakee mediat R2:sta suoraan,
// ja palauttaa: { reply, actions: [{type, payload}], toolsUsed }
// Client soveltaa actionit Firestoren puolella.

const R2_PUBLIC_CDN = 'https://pub-f3aa3f94aaf8436da08a8ee775b44349.r2.dev';

const AI_ASSIST_TOOLS = [
  {
    name: 'list_recent_media',
    description: 'Hae mediapankista kuvat/tiedostot. Käytä ENSIN kun käyttäjä pyytää kuvia, karusellia, logoa tai visuaalia. Tulos sisältää valmiit mediaId+mediaUrl -parit jotka voit syöttää suoraan create_publication- tai attach_media_to_publication -työkaluun.',
    input_schema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Max tulosten määrä (oletus 20, max 50).' },
        folder: { type: 'string', description: 'Rajaa yhteen kansioon, esim. "brand", "joona-motto", "valokuvat".' },
        search: { type: 'string', description: 'Vapaasanahaku nimestä/kansiosta, esim. "logo", "festivaali", "tabu".' },
      },
    },
  },
  {
    name: 'create_publication',
    description: 'Luo uusi julkaisu työjonoon tilassa "ready". Jos käyttäjä pyytää kuvia/karusellia, anna media-array jossa on yksi tai useampi {mediaId, mediaUrl}. Ensimmäinen kuva on kansi, loput karusellin slidet järjestyksessä. Hae kuvat ensin list_recent_media-työkalulla, älä kuvitele niitä.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Lyhyt otsikko 1–2 rivillä.' },
        body: { type: 'string', description: 'Julkaisuteksti, valmis kopioitavaksi. Noudata esimerkkien ääntä ja tyyliä.' },
        channels: {
          type: 'array',
          items: { type: 'string' },
          description: 'Julkaisukanavat (Instagram, Facebook, LinkedIn, TikTok, YouTube, Nettisivut, Uutiskirje).',
        },
        category: { type: 'string', enum: ['some', 'press', 'partner', 'internal'] },
        brief: { type: 'string', description: 'Lyhyt selitys mitä pyydettiin.' },
        priority: { type: 'string', enum: ['low', 'normal', 'high'] },
        media: {
          type: 'array',
          description: 'Liitettävät mediat järjestyksessä. Ensimmäinen on kansi.',
          items: {
            type: 'object',
            properties: {
              mediaId: { type: 'string' },
              mediaUrl: { type: 'string' },
            },
            required: ['mediaId', 'mediaUrl'],
          },
        },
      },
      required: ['title', 'body', 'channels'],
    },
  },
  {
    name: 'attach_media_to_publication',
    description: 'Lisää yksi tai useampi kuva olemassa olevaan julkaisuun. Käytä kun käyttäjä haluaa täydentää jo luotua julkaisua (katso publicationId "AKTIIVISET JULKAISUT" -listasta tai aiemmasta create_publication-vastauksesta).',
    input_schema: {
      type: 'object',
      properties: {
        publicationId: { type: 'string' },
        media: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              mediaId: { type: 'string' },
              mediaUrl: { type: 'string' },
            },
            required: ['mediaId', 'mediaUrl'],
          },
        },
      },
      required: ['publicationId', 'media'],
    },
  },
];

function buildAssistSystemPrompt(context) {
  const orgName = context.orgName || 'Organisaatio';
  const userName = context.userName || 'Tiimiläinen';
  const channels = (context.availablePublicationChannels || ['Instagram', 'Facebook', 'LinkedIn']).join(', ');

  const voice = (context.voiceExamples || [])
    .map(p => {
      const body = (p.body || '').trim();
      const clipped = body.length > 420 ? body.slice(0, 420) + '…' : body;
      const ch = p.channels && p.channels.length ? ` [${p.channels.join(', ')}]` : '';
      return `— "${p.title || '(otsikoton)'}"${ch}\n${clipped}`;
    })
    .join('\n\n') || '(Ei vielä julkaistuja esimerkkejä — käytä LLFF:n brändisävyä: lämmin, rohkea, taiteellinen, ei kliseitä.)';

  const active = (context.activePublications || [])
    .map(p => `• ${p.id} — "${p.title || '(otsikoton)'}" [${p.status}]${p.channels && p.channels.length ? ` ${p.channels.join(', ')}` : ''}`)
    .join('\n') || '(Ei aktiivisia julkaisuja)';

  return `Olet Momentum, Hetki Momentum -alustan sisäänrakennettu AI-avustaja. Sinulla on SUORA PÄÄSY mediapankkiin ja julkaisujonoon työkalujen kautta. Ajat kaikki toiminnot itse — älä koskaan pyydä käyttäjää tekemään niitä puolestasi.

TOIMINTATAPA (tärkeä):
1. Kun pyydetään tekemään julkaisu kuvilla, karusellilla tai logolla: kutsu ENSIN list_recent_media. Käytä folder- tai search-parametria rajaamaan (esim. search="logo", folder="brand", search="festivaali"). Tulos sisältää mediaId+mediaUrl -parit.
2. Valitse esille sopivat kuvat ja kutsu create_publication ANTAEN media-array. Yksi kutsu = valmis julkaisu kansineen ja slideineen.
3. Älä koskaan vastaa "voit itse lisätä kuvat" tai "tarvitsen ID:n". Jos ID tarvitaan, katso "AKTIIVISET JULKAISUT" -listasta alta.
4. Jos käyttäjä pyytää lisää kuvia olemassa olevaan julkaisuun, käytä attach_media_to_publication ja anna publicationId listasta.

KONTEKSTI:
- Organisaatio: ${orgName}
- Käyttäjä: ${userName}
- Saatavilla olevat julkaisukanavat: ${channels}
- Kategoriat: some, press, partner, internal

AKTIIVISET JULKAISUT (käytä id:itä attach_media_to_publication-kutsuissa):
${active}

ÄÄNI JA TYYLI — MATKI NÄITÄ VIIME KAUDEN JULKAISUJA:
Opiskele näiden sävyä, rytmiä, lauseiden rakennetta, sanastoa, aloituksia/lopetuksia ja hashtagien käyttöä. Kun luot uutta, kirjoita samalla äänellä — älä keksi omaa tyyliä.

${voice}

VASTAUSTEN TYYLI (chat):
- Vastaa LYHYESTI suomeksi. Tee mitä pyydetään ilman selittelyä.
- Kun julkaisu on luotu, vahvista yhdellä lauseella mitä teit ja montako kuvaa liitit.
- Jos pyyntö on epäselvä, kysy YKSI tarkentava kysymys.
- Jos et voi suorittaa pyyntöä (esim. julkaista suoraan ulkoiseen kanavaan), sano se suoraan.

TÄRKEÄÄ:
- Et voi julkaista ulkoisiin kanaviin — vain luoda drafteja työjonoon.
- Ei emojeita julkaisuteksteissä ellei viime kauden esimerkeissä niitä käytetty tai käyttäjä erikseen pyydä.
- LLFF festivaali 20.–26.8.2026 Lapinlahden alueella, taiteellinen johto Anton Baer + Sveta.`;
}

async function executeAssistTool(name, input, ctx) {
  const { env, orgId, context, pendingActions } = ctx;

  if (name === 'list_recent_media') {
    if (!env.MEDIA_BUCKET) return { error: 'R2 ei ole konfiguroitu' };
    const folder = input.folder ? String(input.folder).replace(/^\/+|\/+$/g, '') : '';
    const prefix = folder ? `${orgId}/${folder}/` : `${orgId}/`;
    const limit = Math.min(Number(input.limit) || 20, 50);
    try {
      const listed = await env.MEDIA_BUCKET.list({ prefix, limit: limit * 4 });
      let files = (listed.objects || []).map(obj => {
        const parts = obj.key.split('/');
        const name = (parts[parts.length - 1] || '').replace(/^\d+_/, '');
        return {
          mediaId: 'r2_' + obj.key,
          mediaUrl: `${R2_PUBLIC_CDN}/${obj.key}`,
          name,
          folder: parts[1] || 'uploaded',
          ext: (name.split('.').pop() || '').toLowerCase(),
        };
      });
      if (input.search) {
        const q = String(input.search).toLowerCase();
        files = files.filter(f => f.name.toLowerCase().includes(q) || f.folder.toLowerCase().includes(q));
      }
      const imageExts = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'avif', 'svg']);
      files = files.filter(f => imageExts.has(f.ext)).slice(0, limit);
      return { count: files.length, files };
    } catch (e) {
      return { error: `Mediahaku epäonnistui: ${e.message}` };
    }
  }

  if (name === 'create_publication') {
    const incoming = Array.isArray(input.media)
      ? input.media.filter(m => m && m.mediaId && m.mediaUrl)
      : [];
    const id = 'pub_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
    const payload = {
      id,
      title: input.title || 'Uusi julkaisu',
      body: input.body || '',
      channels: Array.isArray(input.channels) ? input.channels : [],
      category: input.category || 'some',
      priority: input.priority || 'normal',
      brief: input.brief || '',
      mediaIds: incoming.map(m => m.mediaId),
      image: incoming[0]?.mediaUrl || null,
    };
    pendingActions.push({ type: 'create_publication', payload });
    return {
      success: true,
      publicationId: id,
      attachedMedia: incoming.length,
      message: `Julkaisu "${payload.title}" valmistelu onnistui${incoming.length > 0 ? ` (${incoming.length} kuva${incoming.length === 1 ? '' : 'a'} liitetty karusellijärjestyksessä)` : ''}.`,
    };
  }

  if (name === 'attach_media_to_publication') {
    const pid = input.publicationId;
    const incoming = Array.isArray(input.media)
      ? input.media.filter(m => m && m.mediaId && m.mediaUrl)
      : [];
    if (incoming.length === 0) {
      return { error: 'Media-array on tyhjä.' };
    }

    // 1. Tarkista onko kyseessä juuri luotu pending-julkaisu
    const pending = pendingActions.find(a => a.type === 'create_publication' && a.payload.id === pid);
    if (pending) {
      const existingIds = pending.payload.mediaIds || [];
      const newIds = incoming.map(m => m.mediaId).filter(id => !existingIds.includes(id));
      pending.payload.mediaIds = [...existingIds, ...newIds];
      if (!pending.payload.image && incoming[0]) pending.payload.image = incoming[0].mediaUrl;
      return { success: true, attachedCount: newIds.length, totalMedia: pending.payload.mediaIds.length };
    }

    // 2. Olemassa oleva julkaisu kontekstissa → tee update_publication action
    const existing = (context.activePublications || []).find(p => p.id === pid);
    if (!existing) {
      const available = (context.activePublications || []).slice(0, 8).map(p => p.id).join(', ');
      return { error: `Julkaisua "${pid}" ei löytynyt. Saatavilla: ${available || '(ei yhtään)'}` };
    }
    let upd = pendingActions.find(a => a.type === 'update_publication' && a.payload.id === pid);
    if (!upd) {
      upd = {
        type: 'update_publication',
        payload: {
          id: pid,
          mediaIds: Array.isArray(existing.mediaIds) ? [...existing.mediaIds] : [],
          image: existing.image || null,
        },
      };
      pendingActions.push(upd);
    }
    const existingIds = upd.payload.mediaIds || [];
    const newIds = incoming.map(m => m.mediaId).filter(id => !existingIds.includes(id));
    upd.payload.mediaIds = [...existingIds, ...newIds];
    if (!upd.payload.image && incoming[0]) upd.payload.image = incoming[0].mediaUrl;
    return { success: true, attachedCount: newIds.length, totalMedia: upd.payload.mediaIds.length };
  }

  return { error: `Tuntematon työkalu: ${name}` };
}

async function handleAiAssist(request, env, orgId) {
  if (!env.ANTHROPIC_API_KEY) {
    return corsResponse(request, env, { error: 'ANTHROPIC_API_KEY puuttuu' }, 500);
  }
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return corsResponse(request, env, { error: 'Virheellinen JSON' }, 400);
  }
  const { message, history = [], context = {} } = body || {};
  if (!message || typeof message !== 'string') {
    return corsResponse(request, env, { error: 'message (string) vaaditaan' }, 400);
  }

  const systemPrompt = buildAssistSystemPrompt(context);
  const messages = [
    ...(Array.isArray(history) ? history : []),
    { role: 'user', content: message },
  ];

  const pendingActions = [];
  const toolsUsed = [];
  let finalReply = '';
  let lastError = null;

  const MAX_ITERATIONS = 6;
  for (let i = 0; i < MAX_ITERATIONS; i++) {
    let data;
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-5',
          max_tokens: 2048,
          system: systemPrompt,
          messages,
          tools: AI_ASSIST_TOOLS,
        }),
      });
      if (!res.ok) {
        const errText = await res.text();
        lastError = `Anthropic ${res.status}: ${errText.slice(0, 300)}`;
        break;
      }
      data = await res.json();
    } catch (e) {
      lastError = `Anthropic-kutsu epäonnistui: ${e.message}`;
      break;
    }

    const contentBlocks = Array.isArray(data.content) ? data.content : [];
    const textJoined = contentBlocks
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('\n')
      .trim();
    if (textJoined) finalReply = textJoined;

    if (data.stop_reason === 'tool_use') {
      const toolUses = contentBlocks.filter(b => b.type === 'tool_use');
      if (toolUses.length === 0) break;

      messages.push({ role: 'assistant', content: contentBlocks });

      const toolResults = [];
      for (const tu of toolUses) {
        toolsUsed.push(tu.name);
        let result;
        try {
          result = await executeAssistTool(tu.name, tu.input || {}, { env, orgId, context, pendingActions });
        } catch (e) {
          result = { error: e.message };
        }
        const isError = !!(result && result.error);
        toolResults.push({
          type: 'tool_result',
          tool_use_id: tu.id,
          content: JSON.stringify(result || {}),
          ...(isError ? { is_error: true } : {}),
        });
      }
      messages.push({ role: 'user', content: toolResults });
      continue;
    }

    // end_turn tai muu → lopeta loop
    break;
  }

  if (!finalReply && lastError) {
    return corsResponse(request, env, {
      reply: '',
      actions: pendingActions,
      toolsUsed,
      error: lastError,
    });
  }

  return corsResponse(request, env, {
    reply: finalReply || 'Ei vastausta.',
    actions: pendingActions,
    toolsUsed,
  });
}
