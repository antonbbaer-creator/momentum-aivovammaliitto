// Momentum-bot — Hetki Momentumin AI-tiimiläinen Viestit-chatissa.
// Käyttää Claude-mallia (Anthropic API) taustalla, mutta näkyy käyttäjälle nimellä "Momentum"
// jotta se on linjassa alustan brändin kanssa.
//
// Orkestroi tool-use-loopin: selain kutsuu workeria, saa tool_use-response,
// toteuttaa työkalut lokaalisti (Firestore-kirjoitukset, R2-haku), kutsuu takaisin kunnes
// malli palauttaa final-tekstin.

import { Publication, normalizePublication, newBriefTemplate } from './publications-shared';
import { Channel } from './chat-shared';
import { OrgTeam, OrgTeamMember } from './team-shared';

const WORKER_URL = 'https://momentum-worker.anton-4f9.workers.dev';
const R2_CDN = 'https://pub-f3aa3f94aaf8436da08a8ee775b44349.r2.dev';

// ========== MOMENTUM-BOT IDENTITY ==========

export const MOMENTUM_BOT_ID = 'momentum-bot';
export const MOMENTUM_BOT_NAME = 'Momentum';
export const MOMENTUM_BOT_COLOR = '#056b9f'; // Hetki primary blue

// Legacy-aliakset taaksepäin-yhteensopivuuden varalta (poistetaan myöhemmin)
export const CLAUDE_BOT_ID = MOMENTUM_BOT_ID;
export const CLAUDE_BOT_NAME = MOMENTUM_BOT_NAME;
export const CLAUDE_BOT_COLOR = MOMENTUM_BOT_COLOR;

// Momentum-bot synteettisenä jäsenenä — käytetään avatar-/nimi-resoluutiossa
export const MOMENTUM_BOT_MEMBER: OrgTeamMember = {
  id: MOMENTUM_BOT_ID,
  name: MOMENTUM_BOT_NAME,
  role: 'AI-avustaja',
  teamId: 'system',
  type: 'external',
  avatar: '',
  email: undefined,
};

// Tunnistaako viesti Momentum-mentionin?
// Tukee: @momentum, /momentum, momentum:
// Samoin vanhat @claude / /claude / claude: (mutta emme mainosta niitä)
export function messageTriggersBot(text: string): boolean {
  if (!text) return false;
  const lower = text.toLowerCase().trim();
  if (lower.startsWith('/momentum') || lower.startsWith('momentum:')) return true;
  if (lower.startsWith('/claude') || lower.startsWith('claude:')) return true;
  return /(^|\s)@momentum\b/i.test(text) || /(^|\s)@claude\b/i.test(text);
}

// Onko tämä kanava Momentum-DM?
export function isMomentumDm(channel: Channel): boolean {
  return channel.type === 'dm' && channel.memberIds.includes(MOMENTUM_BOT_ID);
}
// Legacy alias
export const isClaudeDm = isMomentumDm;

// Luo stable Momentum-DM -kanava käyttäjälle
export function momentumDmChannelFor(userId: string): Channel {
  const ids = [userId, MOMENTUM_BOT_ID].sort();
  return {
    id: `ch_dm_${ids[0]}_${ids[1]}`,
    name: `momentum-${userId}`,
    displayName: 'Momentum',
    type: 'dm',
    memberIds: ids,
    createdBy: 'system',
    createdAt: Date.now(),
  };
}
// Legacy alias
export const claudeDmChannelFor = momentumDmChannelFor;

// ========== TOOL DEFINITIONS ==========

export const CLAUDE_TOOLS = [
  {
    name: 'create_publication',
    description: 'Luo uusi julkaisu työjonoon tilassa "ready" (valmis tarkistettavaksi). Käytä kun tiimiläinen pyytää sinua tekemään postauksen tai julkaisun. Jos pyydetään karusellia tai monikuvapostausta, anna mediaIds-kentässä useampi kuva (ensimmäinen = kansi, loput = slidet järjestyksessä). Hyödynnä ensin list_recent_media-työkalua valitaksesi sopivat kuvat mediapankista. Julkaisu näkyy heti Viestintä-moduulin Työjono-välilehdellä.',
    input_schema: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'Julkaisun otsikko — tiivis, 1–2 rivin kuvaus',
        },
        body: {
          type: 'string',
          description: 'Julkaisun teksti — valmis kopioitavaksi kanavaan. Kirjoita suomeksi ellei toisin pyydetä. Käytä rivinvaihtoja selkeyden vuoksi. Matki tyyliä ja sävyä viime kauden julkaisuista jotka ovat järjestelmän kontekstissa.',
        },
        channels: {
          type: 'array',
          items: { type: 'string' },
          description: 'Kanavat joihin julkaisu menee. Mahdolliset: Instagram, Facebook, LinkedIn, TikTok, YouTube, Nettisivut, Uutiskirje.',
        },
        category: {
          type: 'string',
          enum: ['some', 'press', 'partner', 'internal'],
          description: 'Kategoria: some (sosiaalinen media), press (lehdistö), partner (kumppanit), internal (sisäinen).',
        },
        brief: {
          type: 'string',
          description: 'Lyhyt toimeksiannon kuvaus — mitä pyydettiin ja miksi. Kirjoitetaan työjonon briefiin.',
        },
        priority: {
          type: 'string',
          enum: ['low', 'normal', 'high'],
          description: 'Prioriteetti. Default normal.',
        },
        media: {
          type: 'array',
          description: 'Liitettävät kuvat/mediat järjestyksessä. Ensimmäinen on kansikuva, loput lisäslidet karusellissa. Kukin objekti tulee list_recent_media-työkalusta.',
          items: {
            type: 'object',
            properties: {
              mediaId: { type: 'string', description: 'Mediatiedoston id list_recent_media-vastauksesta.' },
              mediaUrl: { type: 'string', description: 'Mediatiedoston URL list_recent_media-vastauksesta.' },
            },
            required: ['mediaId', 'mediaUrl'],
          },
        },
      },
      required: ['title', 'body', 'channels'],
    },
  },
  {
    name: 'list_recent_media',
    description: 'Hae mediapankista viimeisimmät kuvat ja tiedostot. Käytä ennen create_publication- tai attach_media-kutsua kun tarvitset kuvavaihtoehtoja. Tulos sisältää mediaId + mediaUrl jokaiselle — käytä niitä suoraan media-parametrina.',
    input_schema: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Maksimi tulosten määrä. Default 20, max 50.',
        },
        folder: {
          type: 'string',
          description: 'Rajaa yhteen kansioon. Esim. "valokuvat", "brand", "photoshoot", "joona-motto", "some-koulutus-2025".',
        },
        search: {
          type: 'string',
          description: 'Vapaasanahaku kuvan nimestä (esim. "logo", "tabu", "festivaali"). Case-insensitive.',
        },
      },
    },
  },
  {
    name: 'attach_media_to_publication',
    description: 'Liitä yksi tai useampi mediatiedosto olemassa olevaan julkaisuun. Käytä kun käyttäjä pyytää lisäämään kuvia julkaisuun jälkikäteen tai täydentämään karusellia. Anna joko yksi {mediaId,mediaUrl}-pari tai useampi media-kenttään.',
    input_schema: {
      type: 'object',
      properties: {
        publicationId: {
          type: 'string',
          description: 'Julkaisun id. Löytyy system promptin "Aktiiviset julkaisut" -listasta tai aiemmasta create_publication-vastauksesta.',
        },
        media: {
          type: 'array',
          description: 'Liitettävät mediat järjestyksessä. Lisätään olemassa olevan listan perään.',
          items: {
            type: 'object',
            properties: {
              mediaId: { type: 'string' },
              mediaUrl: { type: 'string' },
            },
            required: ['mediaId', 'mediaUrl'],
          },
        },
        // Legacy single-item muoto (taaksepäin-yhteensopivuus)
        mediaId: { type: 'string', description: 'Legacy: yksi media. Suosi media-arrayta.' },
        mediaUrl: { type: 'string', description: 'Legacy: yksi media. Suosi media-arrayta.' },
      },
      required: ['publicationId'],
    },
  },
  {
    name: 'get_team_context',
    description: 'Hae nykyisen tiimin ja org:in konteksti: tiimit, jäsenet, aktiiviset briefit. Käytä jos tarvitset tietää kuka tekee mitä.',
    input_schema: {
      type: 'object',
      properties: {},
    },
  },
];

// ========== TOOL EXECUTION (selain) ==========

export interface BotContext {
  activeOrg: string | null;
  currentChannelId: string;
  userName: string;
  userId: string | null;
  orgTeams: OrgTeam[];
  teamMembers: OrgTeamMember[];
  publications: Publication[];
  createPublication: (pub: Publication) => void;
  updatePublication: (id: string, patch: Partial<Publication>) => void;
}

export interface MediaFileLite {
  id: string;
  name: string;
  url: string;
  folder: string;
  ext: string;
  size: number;
}

// Cache viimeisimmille media-hakutuloksille orkestraation ajan
let mediaCache: MediaFileLite[] = [];

async function fetchMedia(activeOrg: string, limit: number, folder?: string, search?: string): Promise<MediaFileLite[]> {
  const res = await fetch(`${WORKER_URL}/media/list?limit=${Math.min(limit || 20, 50)}`, {
    headers: { 'X-Momentum-Org': activeOrg },
  });
  if (!res.ok) throw new Error('Media fetch failed');
  const data = await res.json();
  let files: MediaFileLite[] = (data.files || []).map((f: any) => ({
    id: 'r2_' + f.key,
    name: (f.name || '').replace(/^\d+_/, ''),
    url: `${R2_CDN}/${f.key}`,
    folder: (f.key || '').split('/')[1] || 'uploaded',
    ext: (f.name || '').split('.').pop()?.toLowerCase() || '',
    size: f.size || 0,
  }));
  if (folder) files = files.filter(f => f.folder === folder);
  if (search) {
    const q = search.toLowerCase();
    files = files.filter(f => f.name.toLowerCase().includes(q) || f.folder.toLowerCase().includes(q));
  }
  mediaCache = files;
  return files;
}

export async function executeTool(
  toolName: string,
  input: any,
  ctx: BotContext
): Promise<any> {
  if (toolName === 'create_publication') {
    const nowIso = new Date().toISOString().slice(0, 10);
    // Hyväksy media-array jo luontihetkellä → kansi = ensimmäinen, loput slidet
    const incomingMedia: Array<{ mediaId: string; mediaUrl: string }> = Array.isArray(input.media)
      ? input.media.filter((m: any) => m && m.mediaId && m.mediaUrl)
      : [];
    const initialMediaIds = incomingMedia.map(m => m.mediaId);
    const initialImage = incomingMedia[0]?.mediaUrl || null;
    const pub = newBriefTemplate({
      title: input.title || 'Uusi julkaisu',
      body: input.body || '',
      channels: Array.isArray(input.channels) ? input.channels : [],
      category: input.category || 'some',
      status: 'ready',
      priority: input.priority || 'normal',
      brief: input.brief || '',
      assigneeId: ctx.userId || undefined,
      requestedById: ctx.userId || undefined,
      created: nowIso,
      image: initialImage,
      mediaIds: initialMediaIds,
    });
    ctx.createPublication(pub);
    return {
      success: true,
      publicationId: pub.id,
      attachedMedia: initialMediaIds.length,
      message: `Julkaisu "${pub.title}" luotu työjonoon tilassa "valmis"${initialMediaIds.length > 0 ? ` (${initialMediaIds.length} kuva${initialMediaIds.length > 1 ? 'a' : ''} liitetty)` : ''}. Pyytäjä (${ctx.userName}) on asetettu vastuuhenkilöksi.`,
    };
  }

  if (toolName === 'list_recent_media') {
    if (!ctx.activeOrg) return { error: 'No active org' };
    try {
      const files = await fetchMedia(ctx.activeOrg, input.limit || 20, input.folder, input.search);
      return {
        count: files.length,
        files: files.map(f => ({
          mediaId: f.id,
          mediaUrl: f.url,
          name: f.name,
          folder: f.folder,
          ext: f.ext,
        })),
      };
    } catch (e: any) {
      return { error: e.message };
    }
  }

  if (toolName === 'attach_media_to_publication') {
    const pub = ctx.publications.find(p => p.id === input.publicationId);
    if (!pub) {
      return {
        error: `Julkaisua "${input.publicationId}" ei löytynyt. Saatavilla olevat id:t: ${ctx.publications.slice(0, 8).map(p => p.id).join(', ') || '(ei yhtään)'}`,
      };
    }
    // Hyväksy joko media-array tai legacy {mediaId, mediaUrl}
    const incoming: Array<{ mediaId: string; mediaUrl: string }> = Array.isArray(input.media) && input.media.length > 0
      ? input.media.filter((m: any) => m && m.mediaId && m.mediaUrl)
      : (input.mediaId && input.mediaUrl ? [{ mediaId: input.mediaId, mediaUrl: input.mediaUrl }] : []);
    if (incoming.length === 0) {
      return { error: 'Ei mediaa liitettäväksi — anna media-array tai mediaId+mediaUrl-pari.' };
    }
    const existingMediaIds = pub.mediaIds || [];
    const newIds = incoming
      .map(m => m.mediaId)
      .filter(id => !existingMediaIds.includes(id));
    const mergedIds = [...existingMediaIds, ...newIds];
    // Jos kansi puuttuu, ota ensimmäinen uusi mediana kansikuva
    const coverUrl = pub.image || incoming[0]?.mediaUrl;
    ctx.updatePublication(pub.id, {
      image: coverUrl,
      mediaIds: mergedIds,
    });
    return {
      success: true,
      attachedCount: newIds.length,
      totalMedia: mergedIds.length,
      message: `${newIds.length} media${newIds.length === 1 ? '' : 'a'} liitetty julkaisuun. Julkaisussa on nyt yhteensä ${mergedIds.length} mediaa.`,
    };
  }

  if (toolName === 'get_team_context') {
    const activeBriefs = ctx.publications.filter(p => p.status === 'brief' || p.status === 'draft');
    return {
      teams: ctx.orgTeams.map(t => ({ id: t.id, name: t.name, description: t.description })),
      members: ctx.teamMembers.map(m => ({
        id: m.id,
        name: m.name,
        role: m.role,
        teamId: m.teamId,
      })),
      activeBriefs: activeBriefs.map(p => ({
        id: p.id,
        title: p.title,
        status: p.status,
        assigneeId: p.assigneeId,
        dueDate: p.dueDate,
      })),
    };
  }

  return { error: `Unknown tool: ${toolName}` };
}

// ========== SYSTEM PROMPT ==========

// Tiivistä julkaisu voice-esimerkiksi (otsikko + runko, ei kuvia)
function summarizePublicationForPrompt(p: Publication, maxBodyChars = 500): string {
  const body = (p.body || '').trim();
  const shortBody = body.length > maxBodyChars ? body.slice(0, maxBodyChars) + '…' : body;
  const channels = p.channels?.length ? ` [${p.channels.join(', ')}]` : '';
  return `— "${p.title || '(ei otsikkoa)'}"${channels}\n${shortBody}`;
}

export function buildSystemPrompt(
  orgName: string,
  channel: Channel,
  userName: string,
  channels: string[],
  publications: Publication[] = []
): string {
  // Viime kauden julkaistut → tyyli-/äänireferenssi (max 6, uusimmat ensin)
  const published = publications
    .filter(p => p.status === 'published' && (p.body || '').trim().length > 20)
    .sort((a, b) => (b.date || b.created || '').localeCompare(a.date || a.created || ''))
    .slice(0, 6);
  const voiceExamples = published.length > 0
    ? published.map(p => summarizePublicationForPrompt(p, 420)).join('\n\n')
    : '(Ei vielä julkaistuja esimerkkejä — käytä Hetki/LLFF brändisävyä: lämmin, rohkea, taiteellinen, ei kliseitä.)';

  // Aktiiviset julkaisut (brief/draft/ready) → id-lista jotta bot voi viitata niihin jälkikäteen
  const active = publications
    .filter(p => p.status !== 'published')
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
    .slice(0, 10);
  const activeList = active.length > 0
    ? active.map(p => `• ${p.id} — "${p.title || '(otsikoton)'}" [${p.status}]${p.channels?.length ? ` ${p.channels.join(', ')}` : ''}`).join('\n')
    : '(Ei aktiivisia julkaisuja)';

  return `Olet Momentum, Hetki Momentum -alustan sisäänrakennettu AI-avustaja. Toimit tiimin sisäisessä chatissa yhdessä muiden tiimiläisten kanssa. Taustalla pyörii Claude-malli, mutta tiimiläisille esiinnyt aina nimellä "Momentum".

ROOLI:
- Auta tiimiä sisällön tuotannossa, suunnittelussa ja ideoinnissa
- Kun joku pyytää sinua TEKEMÄÄN julkaisun (esim. "tee IG-postaus ohjelmistosta", "kirjoita uutiskirje"), käytä create_publication-työkalua ja luo se työjonoon tilassa "ready"
- Julkaisun pyytäjä näkee sen heti Viestintä-moduulin Työjonossa ja voi tarkistaa, muokata ja julkaista
- Kun käyttäjä pyytää kuvia, karusellia tai monta slideä: kutsu ENSIN list_recent_media (voit rajata folder- tai search-hakuparametrilla, esim. logo, tabu, festivaali), valitse sopivat mediat, ja anna ne create_publication-työkalulle media-array-kentässä YHDELLÄ kertaa. Ensimmäinen kuva on kansi, loput karusellin slidet järjestyksessä.
- Jos julkaisu on jo luotu ja pyydetään lisäämään kuvia, käytä attach_media_to_publication-työkalua ja anna publicationId (katso "AKTIIVISET JULKAISUT" -listasta alta).

KONTEKSTI:
- Organisaatio: ${orgName}
- Kanava: ${channel.displayName || channel.name}
- Kanavan tyyppi: ${channel.type}
- Pyytäjä: ${userName}
- Saatavilla olevat julkaisukanavat: ${channels.join(', ') || 'Instagram, Facebook, LinkedIn'}
- Kategoriat: some (sosiaalinen media), press (lehdistö), partner (kumppanit), internal (sisäinen)

AKTIIVISET JULKAISUT (käytä id:itä attach_media_to_publication-kutsuissa):
${activeList}

ÄÄNI JA TYYLI — ESIMERKKEJÄ VIIME KAUDEN JULKAISUISTA:
Opiskele näiden sävyä, rytmiä, tapaa rakentaa lauseita, aloituksia ja lopetuksia, käytettyä sanastoa ja hashtag-strategiaa. Kun luot uuden julkaisun, matki tätä samaa ääntä — älä keksi omaa.

${voiceExamples}

VASTAUSTEN TYYLI (chatissa, ei julkaisuissa):
- Vastaa LYHYESTI ja suoraan suomeksi
- Älä selittele liikaa — tee mitä pyydetään
- Kun luot julkaisun, vahvista yhdellä lauseella mitä teit ja mistä se löytyy
- Jos pyyntö on epäselvä, kysy YKSI tarkentava kysymys ennen kuin teet mitään
- Jos et voi tehdä mitä pyydetään (esim. julkaista suoraan kanavaan), sano se suoraan

TÄRKEÄÄ:
- Älä KOSKAAN julkaise mitään suoraan ulkoisiin kanaviin — voit vain luoda drafteja työjonoon tarkistettavaksi
- Julkaisuteksteissä (create_publication body) noudata yllä olevien esimerkkien ääntä. Ei emojeita ellei viime kauden esimerkit niitä käytä tai käyttäjä erikseen pyydä.
- Kunnioita LLFF:n brändiä: festivaali 20.–26.8.2026 Lapinlahden alueella, taiteellinen johto Anton Baer + Sveta`;
}

// ========== ORCHESTRATION LOOP ==========

export interface BotMessage {
  role: 'user' | 'assistant';
  content: any; // Anthropic content blocks tai string
}

export interface BotResult {
  reply: string;              // final text reply to show in chat
  toolsUsed: string[];        // names of tools called
  publicationsCreated: string[]; // IDs of created publications
  error?: string;
}

// Backendin palauttamat actionit jotka client soveltaa Firestoreen
export type AssistAction =
  | {
      type: 'create_publication';
      payload: {
        id: string;
        title: string;
        body: string;
        channels: string[];
        category?: string;
        priority?: 'low' | 'normal' | 'high';
        brief?: string;
        mediaIds?: string[];
        image?: string | null;
      };
    }
  | {
      type: 'update_publication';
      payload: {
        id: string;
        mediaIds?: string[];
        image?: string | null;
      };
    };

// Rakenna konteksti backendille: orgName, voice-esimerkit, aktiiviset julkaisut
function buildAssistContext(
  orgName: string,
  channel: Channel,
  userName: string,
  availableChannels: string[],
  publications: Publication[]
) {
  const published = publications
    .filter(p => p.status === 'published' && (p.body || '').trim().length > 20)
    .sort((a, b) => (b.date || b.created || '').localeCompare(a.date || a.created || ''))
    .slice(0, 6);
  const voiceExamples = published.map(p => ({
    title: p.title,
    body: (p.body || '').slice(0, 500),
    channels: p.channels,
  }));

  const activePublications = publications
    .filter(p => p.status !== 'published')
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
    .slice(0, 10)
    .map(p => ({
      id: p.id,
      title: p.title,
      status: p.status,
      channels: p.channels,
      mediaIds: p.mediaIds || [],
      image: p.image,
    }));

  return {
    orgName,
    userName,
    channelName: channel.displayName || channel.name,
    availablePublicationChannels: availableChannels,
    voiceExamples,
    activePublications,
  };
}

// Uusi implementaatio: kutsuu workerin /api/ai/assist -reittiä ja soveltaa
// palautetut actionit Firestoreen BotContextin callbackien kautta.
// Koko tool-use-loop pyörii workerin puolella — selain tekee yhden HTTP-kutsun.
export async function runClaudeBot(
  userMessage: string,
  history: BotMessage[],
  systemPromptOrContext: string | ReturnType<typeof buildAssistContext>,
  ctx: BotContext,
  extras?: { publications?: Publication[]; orgName?: string; channel?: Channel; availableChannels?: string[] }
): Promise<BotResult> {
  const result: BotResult = {
    reply: '',
    toolsUsed: [],
    publicationsCreated: [],
  };

  // Backendin odottama context — joko suoraan annettu tai rakennetaan täällä
  const assistContext =
    typeof systemPromptOrContext === 'object'
      ? systemPromptOrContext
      : buildAssistContext(
          extras?.orgName || (ctx.activeOrg === 'llff' ? 'Lapinlahden Elokuvajuhlat (LLFF)' : (ctx.activeOrg || 'Organisaatio')),
          extras?.channel || ({ id: ctx.currentChannelId, name: '', displayName: '', type: 'dm', memberIds: [], createdBy: '', createdAt: 0 } as Channel),
          ctx.userName,
          extras?.availableChannels || ['Instagram', 'Facebook', 'LinkedIn', 'TikTok', 'YouTube', 'Nettisivut', 'Uutiskirje'],
          extras?.publications || ctx.publications || []
        );

  try {
    const res = await fetch(`${WORKER_URL}/api/ai/assist`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Momentum-Org': ctx.activeOrg || 'llff',
      },
      body: JSON.stringify({
        message: userMessage,
        history,
        context: assistContext,
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      result.error = `API virhe: ${err.error || res.status}`;
      return result;
    }
    const data = await res.json();
    result.reply = data.reply || '';
    result.toolsUsed = Array.isArray(data.toolsUsed) ? data.toolsUsed : [];
    if (data.error && !result.reply) {
      result.error = data.error;
    }

    // Sovella actionit lokaaliin Firestore-tilaan
    const actions: AssistAction[] = Array.isArray(data.actions) ? data.actions : [];
    for (const action of actions) {
      if (action.type === 'create_publication') {
        const p = action.payload;
        const nowIso = new Date().toISOString().slice(0, 10);
        const pub = newBriefTemplate({
          id: p.id,
          title: p.title,
          body: p.body,
          channels: p.channels || [],
          category: p.category || 'some',
          status: 'ready',
          priority: p.priority || 'normal',
          brief: p.brief || '',
          assigneeId: ctx.userId || undefined,
          requestedById: ctx.userId || undefined,
          created: nowIso,
          image: p.image || null,
          mediaIds: p.mediaIds || [],
        });
        ctx.createPublication(pub);
        result.publicationsCreated.push(pub.id);
      } else if (action.type === 'update_publication') {
        const p = action.payload;
        ctx.updatePublication(p.id, {
          mediaIds: p.mediaIds,
          image: p.image ?? undefined,
        });
      }
    }
  } catch (e: any) {
    result.error = `Verkko-virhe: ${e.message}`;
  }

  return result;
}
