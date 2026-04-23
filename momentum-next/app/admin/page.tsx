'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth';
import { useRouter } from 'next/navigation';
import { collection, getDocs, doc, deleteDoc, updateDoc, query, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import AppShell from '@/components/AppShell';
import { useToast } from '@/lib/toast';
import { AVL_ORG, AVL_EVENTS, AVL_CHANNEL_STATS, LLFF_ORG, LLFF_EVENTS, LLFF_CHANNEL_STATS, JUHLATOIMIKUNTA_ORG, JUHLATOIMIKUNTA_EVENTS, JUHLATOIMIKUNTA_CHANNEL_STATS } from '@/lib/seed-data';
import { MODULE_REGISTRY, MODULE_ORDER, DEFAULT_MODULES, JUHLATOIMIKUNTA_MODULES, LUURI_MODULES, IHAA_MODULES, getDefaultModules } from '@/lib/modules';

interface OrgMember {
  uid: string;
  displayName: string;
  email: string;
  photoURL: string;
  role: 'owner' | 'admin' | 'member';
  joinedAt: string;
  userRole?: string;
}

interface OrgData {
  id: string;
  name: string;
  shortName: string;
  slogan: string;
  createdAt: string;
  createdBy: string;
  plan: string;
  members: OrgMember[];
}

// Super admin emails — only these can access /admin
const SUPER_ADMINS = ['anton@hetkicompany.com', 'anton.baer@gmail.com', 'claude-test@hetkicompany.com'];

export default function AdminPage() {
  const { user, loading, orgs: userOrgs } = useAuth();
  const router = useRouter();
  const [orgs, setOrgs] = useState<OrgData[]>([]);
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [selectedOrg, setSelectedOrg] = useState<string | null>(null);
  const [tab, setTab] = useState<'orgs' | 'users'>('orgs');

  // Module configs per org
  const [orgModules, setOrgModules] = useState<Record<string, Record<string, boolean>>>({});
  const [aiProfiles, setAiProfiles] = useState<Record<string, any>>({});
  const [luuriSeeded, setLuuriSeeded] = useState(false);

  // Invite form
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'admin' | 'member'>('member');
  const [inviteOrgId, setInviteOrgId] = useState('');

  // Ihaa-form
  const [iiroEmail, setIiroEmail] = useState('');
  const [juhaniEmail, setJuhaniEmail] = useState('');

  const { toast } = useToast();
  const [seeding, setSeeding] = useState(false);
  const isSuperAdmin = user?.email && SUPER_ADMINS.includes(user.email);

  // Seed AVL + LLFF demo communities
  const seedCommunities = async () => {
    if (!user) return;
    setSeeding(true);
    try {
      for (const { orgData, events, channelStats, orgId, orgName, joinCode } of [
        { orgData: AVL_ORG, events: AVL_EVENTS, channelStats: AVL_CHANNEL_STATS, orgId: 'avl', orgName: 'Aivovammaliitto', joinCode: 'aivovammaliitto-hetki-2026' },
        { orgData: LLFF_ORG, events: LLFF_EVENTS, channelStats: LLFF_CHANNEL_STATS, orgId: 'llff', orgName: 'Lapinlahden Elokuvajuhlat', joinCode: 'llff-elokuva-2026' },
        { orgData: JUHLATOIMIKUNTA_ORG, events: JUHLATOIMIKUNTA_EVENTS, channelStats: JUHLATOIMIKUNTA_CHANNEL_STATS, orgId: 'juhlatoimikunta', orgName: 'Juhlatoimikunta', joinCode: 'juhlatoimikunta-sirpa-70v' },
      ]) {
        // Create org document
        await setDoc(doc(db, 'organizations', orgId), {
          name: orgName, shortName: orgData.s, slogan: orgData.slogan,
          joinCode, createdAt: new Date().toISOString(), createdBy: user.uid, plan: 'free',
        }, { merge: true });

        // Add current user as owner
        await setDoc(doc(db, 'organizations', orgId, 'members', user.uid), {
          role: 'owner', joinedAt: new Date().toISOString(),
          displayName: user.displayName || '', email: user.email || '', photoURL: user.photoURL || '',
        }, { merge: true });

        // Write org data
        await setDoc(doc(db, 'organizations', orgId, 'data', 'org'), { v: JSON.stringify(orgData), ts: Date.now(), updatedBy: user.uid });
        await setDoc(doc(db, 'organizations', orgId, 'data', 'events'), { v: JSON.stringify(events), ts: Date.now(), updatedBy: user.uid });
        await setDoc(doc(db, 'organizations', orgId, 'data', 'channelStats'), { v: JSON.stringify(channelStats), ts: Date.now(), updatedBy: user.uid });

        // Initialize empty collections
        for (const key of ['projects', 'publications', 'media_meta', 'media_uploaded', 'media_collections']) {
          await setDoc(doc(db, 'organizations', orgId, 'data', key), { v: JSON.stringify([]), ts: Date.now(), updatedBy: user.uid }, { merge: true });
        }

        // Seed org-specific modules
        if (orgId === 'juhlatoimikunta') {
          await setDoc(doc(db, 'organizations', orgId, 'data', 'modules'), { v: JSON.stringify(JUHLATOIMIKUNTA_MODULES), ts: Date.now(), updatedBy: user.uid });
        }
      }

      // Update user's org list
      const existingSnap = await getDocs(collection(db, 'userOrgs'));
      let existingOrgs: any[] = [];
      for (const d of existingSnap.docs) {
        if (d.id === user.uid) existingOrgs = d.data().orgs || [];
      }
      const newOrgs = [
        ...existingOrgs.filter((o: any) => o.orgId !== 'avl' && o.orgId !== 'llff' && o.orgId !== 'juhlatoimikunta'),
        { orgId: 'avl', role: 'owner', name: 'Aivovammaliitto' },
        { orgId: 'llff', role: 'owner', name: 'Lapinlahden Elokuvajuhlat' },
        { orgId: 'juhlatoimikunta', role: 'owner', name: 'Juhlatoimikunta' },
      ];
      await setDoc(doc(db, 'userOrgs', user.uid), { orgs: newOrgs });

      toast('AVL + LLFF + Juhlatoimikunta yhteisöt luotu!', 'success');
      window.location.reload();
    } catch (e) {
      console.error('Seed error:', e);
      toast('Virhe yhteisöjen luonnissa', 'error');
    } finally {
      setSeeding(false);
    }
  };

  // Fetch all organizations and their members
  useEffect(() => {
    if (!user || !isSuperAdmin) return;

    const fetchAll = async () => {
      setLoadingData(true);
      try {
        // Fetch all orgs
        const orgsSnap = await getDocs(collection(db, 'organizations'));
        const orgsList: OrgData[] = [];

        for (const orgDoc of orgsSnap.docs) {
          const orgData = orgDoc.data();
          // Fetch members for each org
          const membersSnap = await getDocs(collection(db, 'organizations', orgDoc.id, 'members'));
          const members: OrgMember[] = membersSnap.docs.map(m => ({
            uid: m.id,
            ...m.data(),
          })) as OrgMember[];

          orgsList.push({
            id: orgDoc.id,
            name: orgData.name || 'Nimetön',
            shortName: orgData.shortName || '',
            slogan: orgData.slogan || '',
            createdAt: orgData.createdAt || '',
            createdBy: orgData.createdBy || '',
            plan: orgData.plan || 'free',
            members,
          });
        }
        setOrgs(orgsList);

        // Fetch module configs per org
        const modulesMap: Record<string, Record<string, boolean>> = {};
        for (const orgDoc of orgsSnap.docs) {
          try {
            const modSnap = await getDocs(collection(db, 'organizations', orgDoc.id, 'data'));
            const modDoc = modSnap.docs.find(d => d.id === 'modules');
            if (modDoc) {
              modulesMap[orgDoc.id] = JSON.parse(modDoc.data().v || '{}');
            } else {
              modulesMap[orgDoc.id] = { ...getDefaultModules(orgDoc.id) };
            }
          } catch { modulesMap[orgDoc.id] = { ...getDefaultModules(orgDoc.id) }; }
        }
        setOrgModules(modulesMap);

        // Fetch AI profiles per org
        const profilesMap: Record<string, any> = {};
        for (const orgDoc of orgsSnap.docs) {
          try {
            const dataSnap = await getDocs(collection(db, 'organizations', orgDoc.id, 'data'));
            const profileDoc = dataSnap.docs.find(d => d.id === 'aiProfile');
            if (profileDoc) {
              profilesMap[orgDoc.id] = JSON.parse(profileDoc.data().v || '{}');
            }
          } catch {}
        }
        setAiProfiles(profilesMap);

        // Check if Luuri.net is fully seeded (org-data contains orgStrategy)
        try {
          const luuriDataSnap = await getDocs(collection(db, 'organizations', 'luuri', 'data'));
          const luuriOrgDoc = luuriDataSnap.docs.find(d => d.id === 'org');
          if (luuriOrgDoc) {
            const parsed = JSON.parse(luuriOrgDoc.data().v || '{}');
            if (parsed.orgStrategy && parsed.commsCoreRoles) setLuuriSeeded(true);
          }
        } catch {}

        // Fetch all users
        const usersSnap = await getDocs(collection(db, 'users'));
        setAllUsers(usersSnap.docs.map(u => ({ uid: u.id, ...u.data() })));
      } catch (e) {
        console.error('Admin fetch error:', e);
      } finally {
        setLoadingData(false);
      }
    };

    fetchAll();
  }, [user, isSuperAdmin]);

  // Redirect if not super admin
  useEffect(() => {
    if (!loading && (!user || !isSuperAdmin)) {
      const org = userOrgs?.[0]?.orgId || 'avl';
      router.push(`/${org}/dashboard`);
    }
  }, [user, loading, isSuperAdmin, router]);

  if (loading || !isSuperAdmin) {
    return (
      <div className="onb">
        <div className="onb-wrap" style={{ textAlign: 'center' }}>
          <div className="typing"><span /><span /><span /></div>
        </div>
      </div>
    );
  }

  const removeMember = async (orgId: string, uid: string) => {
    if (!confirm('Haluatko varmasti poistaa tämän jäsenen?')) return;
    try {
      await deleteDoc(doc(db, 'organizations', orgId, 'members', uid));
      // Update userOrgs
      const userOrgsSnap = await getDocs(collection(db, 'userOrgs'));
      // Remove org from user's list
      for (const uoDoc of userOrgsSnap.docs) {
        if (uoDoc.id === uid) {
          const data = uoDoc.data();
          const updated = (data.orgs || []).filter((o: any) => o.orgId !== orgId);
          await setDoc(doc(db, 'userOrgs', uid), { orgs: updated });
        }
      }
      // Refresh
      setOrgs(prev => prev.map(o => o.id === orgId ? { ...o, members: o.members.filter(m => m.uid !== uid) } : o));
    } catch (e) {
      console.error('Remove member error:', e);
      alert('Virhe jäsenen poistamisessa');
    }
  };

  const changeRole = async (orgId: string, uid: string, newRole: 'owner' | 'admin' | 'member') => {
    try {
      // 1) Paivita members-subcollection
      await updateDoc(doc(db, 'organizations', orgId, 'members', uid), { role: newRole });

      // 2) Paivita myos userOrgs/{uid} — frontend lukee roolin taalta activeOrgRole-arvoon.
      // Ilman tata synkroinointia UI nakee vanhan roolin (esim. Moduulit piilossa).
      const userOrgsDoc = await getDocs(query(collection(db, 'userOrgs')));
      for (const d of userOrgsDoc.docs) {
        if (d.id !== uid) continue;
        const data = d.data();
        const existingOrgs: any[] = data.orgs || [];
        const updatedOrgs = existingOrgs.map(o => o.orgId === orgId ? { ...o, role: newRole } : o);
        await setDoc(doc(db, 'userOrgs', uid), { orgs: updatedOrgs, orgIds: updatedOrgs.map(o => o.orgId) }, { merge: true });
      }

      setOrgs(prev => prev.map(o => o.id === orgId ? {
        ...o, members: o.members.map(m => m.uid === uid ? { ...m, role: newRole } : m)
      } : o));
      toast('Rooli paivitetty — kayttaja nakee muutoksen seuraavan sisaankirjautumisen jalkeen', 'success');
    } catch (e) {
      console.error('Change role error:', e);
      toast('Roolin vaihto epaonnistui', 'error');
    }
  };

  const deleteOrg = async (orgId: string) => {
    // Varmennus tehdään DangerZone-komponentissa (nimen kirjoitus + kaksi nappia).
    try {
      // Delete members
      const membersSnap = await getDocs(collection(db, 'organizations', orgId, 'members'));
      for (const m of membersSnap.docs) await deleteDoc(m.ref);
      // Delete data
      const dataSnap = await getDocs(collection(db, 'organizations', orgId, 'data'));
      for (const d of dataSnap.docs) await deleteDoc(d.ref);
      // Delete org
      await deleteDoc(doc(db, 'organizations', orgId));
      setOrgs(prev => prev.filter(o => o.id !== orgId));
      setSelectedOrg(null);
      toast('Organisaatio poistettu', 'success');
    } catch (e) {
      console.error('Delete org error:', e);
      toast('Virhe organisaation poistamisessa', 'error');
    }
  };

  const inviteMember = async () => {
    if (!inviteEmail.trim() || !inviteOrgId) return;
    try {
      const invRef = doc(collection(db, 'organizations', inviteOrgId, 'invitations'));
      await setDoc(invRef, {
        email: inviteEmail.trim().toLowerCase(),
        role: inviteRole,
        invitedBy: user!.uid,
        invitedByName: user!.displayName || '',
        createdAt: new Date().toISOString(),
        status: 'pending',
      });
      setInviteEmail('');
      alert(`Kutsu lähetetty: ${inviteEmail} (${inviteRole})`);
    } catch (e) {
      console.error('Invite error:', e);
      alert('Virhe kutsun lähettämisessä');
    }
  };

  const deleteUser = async (uid: string) => {
    if (!confirm('Haluatko poistaa tämän käyttäjän kaikista organisaatioista?')) return;
    try {
      // Remove from all orgs
      for (const org of orgs) {
        if (org.members.some(m => m.uid === uid)) {
          await deleteDoc(doc(db, 'organizations', org.id, 'members', uid));
        }
      }
      // Delete userOrgs
      await deleteDoc(doc(db, 'userOrgs', uid));
      // Delete user doc
      await deleteDoc(doc(db, 'users', uid));
      setAllUsers(prev => prev.filter(u => u.uid !== uid));
      setOrgs(prev => prev.map(o => ({ ...o, members: o.members.filter(m => m.uid !== uid) })));
    } catch (e) {
      console.error('Delete user error:', e);
      alert('Virhe käyttäjän poistamisessa');
    }
  };

  // Create juhlatoimikunta only
  const createJuhlatoimikunta = async () => {
    if (!user) return;
    setSeeding(true);
    try {
      const orgId = 'juhlatoimikunta';
      // Create org document
      await setDoc(doc(db, 'organizations', orgId), {
        name: 'Juhlatoimikunta', shortName: 'JTK', slogan: JUHLATOIMIKUNTA_ORG.slogan,
        joinCode: 'juhlatoimikunta-sirpa-70v', createdAt: new Date().toISOString(), createdBy: user.uid, plan: 'free',
      }, { merge: true });
      // Add current user as owner
      await setDoc(doc(db, 'organizations', orgId, 'members', user.uid), {
        role: 'owner', joinedAt: new Date().toISOString(),
        displayName: user.displayName || '', email: user.email || '', photoURL: user.photoURL || '',
      }, { merge: true });
      // Write org data
      await setDoc(doc(db, 'organizations', orgId, 'data', 'org'), { v: JSON.stringify(JUHLATOIMIKUNTA_ORG), ts: Date.now(), updatedBy: user.uid });
      await setDoc(doc(db, 'organizations', orgId, 'data', 'events'), { v: JSON.stringify([]), ts: Date.now(), updatedBy: user.uid });
      await setDoc(doc(db, 'organizations', orgId, 'data', 'channelStats'), { v: JSON.stringify([]), ts: Date.now(), updatedBy: user.uid });
      // Seed modules
      await setDoc(doc(db, 'organizations', orgId, 'data', 'modules'), { v: JSON.stringify(JUHLATOIMIKUNTA_MODULES), ts: Date.now(), updatedBy: user.uid });
      // Initialize empty collections
      for (const key of ['projects', 'publications', 'media_meta', 'media_uploaded', 'media_collections']) {
        await setDoc(doc(db, 'organizations', orgId, 'data', key), { v: JSON.stringify([]), ts: Date.now(), updatedBy: user.uid }, { merge: true });
      }
      // Add to user's org list
      const userOrgsSnap = await getDocs(query(collection(db, 'userOrgs')));
      let existingOrgs: any[] = [];
      for (const d of userOrgsSnap.docs) {
        if (d.id === user.uid) existingOrgs = d.data().orgs || [];
      }
      if (!existingOrgs.some((o: any) => o.orgId === orgId)) {
        const newOrgs = [...existingOrgs, { orgId, role: 'owner', name: 'Juhlatoimikunta' }];
        await setDoc(doc(db, 'userOrgs', user.uid), { orgs: newOrgs, orgIds: newOrgs.map((o: any) => o.orgId) });
      }
      toast('Juhlatoimikunta luotu!', 'success');
      window.location.reload();
    } catch (e) {
      console.error('Create juhlatoimikunta error:', e);
      toast('Virhe luonnissa', 'error');
    } finally {
      setSeeding(false);
    }
  };

  // Luo Luuri — puhdas tyhja tyotila, irti muista orgeista
  const createLuuri = async () => {
    if (!user) return;
    setSeeding(true);
    try {
      const orgId = 'luuri';
      const LUURI_SLOGAN = 'Lokaalit kielimallit suomalaisille yrityksille — oma data, oma rauta, ei pilveä.';
      await setDoc(doc(db, 'organizations', orgId), {
        name: 'Luuri.net', shortName: 'LNT', slogan: LUURI_SLOGAN,
        joinCode: 'luuri-net-clean', createdAt: new Date().toISOString(), createdBy: user.uid, plan: 'free',
      }, { merge: true });
      await setDoc(doc(db, 'organizations', orgId, 'members', user.uid), {
        role: 'owner', joinedAt: new Date().toISOString(),
        displayName: user.displayName || '', email: user.email || '', photoURL: user.photoURL || '',
      }, { merge: true });
      // Luuri.net org-konteksti (vain luuri-orgissa — ei vaikuta muihin)
      const LUURI_ORG = {
        name: 'Luuri.net',
        s: 'LNT',
        slogan: LUURI_SLOGAN,
        founders: [
          { name: 'Juhani Lindh', share: '50%' },
          { name: 'Maximilan Rehn', share: '50%' },
        ],
        founded: 2026,
        yritysmuoto: 'Osakeyhtiö',
        toimiala: 'Informaatio ja viestintä',

        // ═══ STRATEGIA 2026-2029 ═══
        orgStrategy: {
          strategicPeriod: '2026-2029',
          mission: 'Mahdollistamme suomalaisille yrityksille tekoälyn käytön heidän omassa infrastruktuurissaan — ilman pilvipalveluita, tietoturvariskejä tai datan vuotoa. Rakennamme Claude Code:n kaltaisen workflown asiakkaan omalla salatulla datalla, palomuurin suojassa.',
          vision: 'Suomalaiset omistavat jälleen IT-infrastruktuurinsa itse. Vuonna 2029 lokaalit kielimallit ovat vakiintunut valinta suomalaisissa asiantuntijayrityksissä, ja Luuri.net on maan tunnetuin on-prem-tekoälyn asiantuntija.',
          values: [
            { name: 'Käytännöllinen', desc: 'Insinöörin ote: se mikä toimii, toimii. Ei hypeä, ei korulauseita.' },
            { name: 'Rehellinen', desc: 'Kerromme rajoituksista ja kustannuksista etukäteen. Emme lupaa mitä emme voi pitää.' },
            { name: 'Omistajuus', desc: 'Asiakas omistaa ostamansa — ei vuokraa sitä kuukausimaksulla amerikkalaiselta korporaatiolta.' },
            { name: 'Kestävä', desc: 'Vanhan raudan uudelleenkäyttö, paikallinen data, pitkän linjan kumppanuus.' },
          ],
        },

        // ═══ STRATEGISET TAVOITTEET ═══
        strategicGoals: [
          { id: 'g1', year: 2026, goal: 'Ensimmäinen maksava asiakas Q2/2026. Onnistunut käyttöönotto referenssiksi.' },
          { id: 'g2', year: 2026, goal: '3 auditointiasiakasta + 1 käyttöönotto vuoden 2026 loppuun mennessä.' },
          { id: 'g3', year: 2027, goal: 'Toistuvaisliikevaihto ylläpitosopimuksista kattaa perustajien palkat.' },
          { id: 'g4', year: 2028, goal: 'Laajennus pohjoismaihin (Ruotsi, Norja) tai ensimmäinen rekry.' },
        ],

        // ═══ VIESTINNÄN MISSIO ═══
        commsMission: 'Osoitamme asiantuntijuutta faktoilla, emme markkinoinnilla. Kerromme selkokielellä mitä lokaali kielimalli oikeasti tekee, mitä se maksaa ja miksi se kannattaa. Puhuttelemme IT-johtajaa, tietoturvavastaavaa ja toimitusjohtajaa samalla kielellä — jokaiselle relevantti näkökulma.',

        // ═══ VIESTINNÄN PERUSTEHTÄVÄT ═══
        commsCoreRoles: [
          { id: 'asiantuntijuus', name: 'Asiantuntijuuden osoittaminen', desc: 'Blogit, tekniset artikkelit, case-studyt. Todistamme osaamisen ennen myyntipuhetta.', color: '#056b9f' },
          { id: 'koulutus', name: 'Markkinan koulutus', desc: 'Lokaalit LLM:t ovat uusi ilmiö Suomessa. Selitämme mitä RAG, vektoritietokanta ja on-prem tarkoittavat päättäjälle.', color: '#185e5b' },
          { id: 'luottamus', name: 'Luottamuksen rakentaminen', desc: 'B2B-myynti vaatii luottamusta. Läpinäkyvät hinnat, selkeät sopimusehdot, referenssit.', color: '#f1b434' },
          { id: 'liikkeet', name: 'Liikkeelle saaminen', desc: 'Ilmainen tietoturvan ja tekoälyvalmiuden pikakartoitus madaltaa ensiaskelta.', color: '#e45c81' },
        ],

        // ═══ KOHDERYHMÄT ═══
        auds: [
          { name: 'IT-johtajat (CIO/CTO)', desc: 'Päättää infrastruktuurivalinnoista. Tarvitsee teknisen luotettavuuden ja ROI-laskelman.' },
          { name: 'Tietoturvavastaavat (CISO)', desc: 'Veto-oikeus pilvipalveluihin. Ostaa on-prem-ratkaisun koska se poistaa datavuotoriskin.' },
          { name: 'Toimitusjohtajat (pk-yritykset)', desc: 'Näkee tekoälyn tuottavuutena mutta pelkää datariskiä. Tarvitsee bisneskuvaukset, ei teknisiä yksityiskohtia.' },
          { name: 'Compliance/juristit', desc: 'GDPR, liikesalaisuudet, asianajosalaisuus. Ostajan portinvartija.' },
        ],

        // ═══ SEGMENTIT (prioriteettijärjestyksessä) ═══
        targetSegmentsPriority: [
          { segment: 'Lakitoimistot', rationale: 'Asianajosalaisuus tekee pilvestä lähes mahdottoman. Valmis maksuhalukkuus.' },
          { segment: 'Tilitoimistot ja rahoitusala', rationale: 'Kirjanpidon automaatio + GDPR/tietosuoja = luontainen kohde.' },
          { segment: 'Terveydenhuollon yksityiset toimijat', rationale: 'Potilastiedot eivät saa vuotaa. Kova regulaatio suojaa myös meitä.' },
          { segment: 'HR-yritykset', rationale: 'CV-data ja rekrydatat arkaluontoisia. Laaja volyymi.' },
          { segment: 'Teollisuus (patentoitava R&D)', rationale: 'Liikesalaisuudet. Pitkät projektit, isot sopimukset.' },
        ],

        // ═══ KILPAILUEDUT ═══
        competitiveEdge: [
          { name: 'Tuore ala', desc: 'Suomessa ei juurikaan lokaalien LLM:ien konsultointipalveluita. Early mover -etu.' },
          { name: 'Asiakas omistaa', desc: 'Ostaa, ei vuokraa. Ei vendor lock-in -riskiä.' },
          { name: 'Suvereeni data', desc: 'Ei amerikkalaisia korporaatioita, ei CLOUD Act -riskiä.' },
          { name: 'Ekologinen', desc: 'Uudelleenkäytettävä rauta mahdollista.' },
          { name: 'Suomalainen kumppani', desc: 'Paikallinen tuki, sama aikavyöhyke, sama kieli, sama lainsäädäntö.' },
        ],

        // ═══ 2026 ERITYISHUOMIOT ═══
        currentContext: {
          trend: 'Lokaalit LLM:t (Llama, Mistral, Qwen) saavuttaneet 2025-2026 aikana tason jossa ne ajavat tuotannossa — ei enää laboratoriokokeilu.',
          saasBacklash: 'Käytännön- ja tietoturvasyistä yhä useampi yritys etsii vaihtoehtoa OpenAI/Google/Microsoft -pilvelle. Momentum on nyt.',
          gdpr: 'GDPR + tuleva EU AI Act tekee datasuvereniteetista myyntiargumentin — ei vain eettisen valinnan.',
          hardware: 'NVIDIA H100/H200 saatavuus parantunut 2026. AMD MI300 kilpailee. Hinta-teho-suhde on-premille parempi kuin koskaan.',
          earlyMover: 'Kilpailijoita Suomessa edelleen vähän. Ikkuna on nyt auki, mutta sulkeutuu 12-24kk.',
          founderCap: '2 perustajaa, rajallinen kapasiteetti — priorisoitava tarkasti. 1 asiakas kerrallaan, ei 10 samanaikaista.',
        },

        mission: 'Mahdollistamme suomalaisille yrityksille tekoälyn käytön heidän omassa infrastruktuurissaan — ilman pilvipalveluita, tietoturvariskejä tai datan vuotoa.',
        vision: 'Suomalaiset omistavat jälleen IT-infrastruktuurinsa itse. Tekoälyn tehokkuus ei vaadi datan luovuttamista amerikkalaisille korporaatioille.',
        tiers: [
          { id: 'auditointi', name: 'Tekoälyvalmiuden kartoitus', desc: 'Konsultointipaketti: palvelininfrastruktuurin, verkkoturvallisuuden ja tietokantojen arviointi. Lopputuloksena lista laitehankinnoista, malliehdotukset ja datan valmisteluopas.' },
          { id: 'kayttoonotto', name: 'Käyttöönotto', desc: 'Ohjelmiston ja paikallisen kielimallin asennus asiakkaan palvelimille. Sisältää vektoritietokannat ja RAG-arkkitehtuurin sisäiselle PDF/teksti-haulle palomuurin sisällä.' },
          { id: 'yllapito', name: 'Ylläpito', desc: 'Kuukausilaskutteinen sopimus: mallien päivitykset, tietoturvakorjaukset ja laitteiston suorituskyvyn valvonta.' },
        ],
        targetSegments: [
          'Lakitoimistot',
          'Tilitoimistot ja rahoitusala',
          'Terveydenhuollon yksityiset toimijat',
          'HR-yritykset',
          'Patentoitavaa teknologiaa kehittävä teollisuus',
        ],
        kilpailuedut: [
          'Ainutlaatuisuus: ala on tuore, kilpailijoita vähän',
          'Sopimusehdot: asiakkaalla täysi omistajuus tuotteeseen',
          'Vastuullisuus: vähentää riippuvuutta amerikkalaisista korporaatioista',
          'Ekologisuus: mahdollisuus käyttää uudelleen vanhoja laitteita',
        ],
        channels: ['Kotisivut', 'Sähköpostimarkkinointi', 'Omat verkostot', 'Tapahtumat', 'Puhelinmyynti'],
        team: [
          { name: 'Juhani Lindh', role: 'Perustaja / Osakas 50%', avatar: 'J' },
          { name: 'Maximilan Rehn', role: 'Perustaja / Osakas 50%', avatar: 'M' },
        ],
      };
      await setDoc(doc(db, 'organizations', orgId, 'data', 'org'), { v: JSON.stringify(LUURI_ORG), ts: Date.now(), updatedBy: user.uid });
      await setDoc(doc(db, 'organizations', orgId, 'data', 'events'), { v: JSON.stringify([]), ts: Date.now(), updatedBy: user.uid });
      await setDoc(doc(db, 'organizations', orgId, 'data', 'channelStats'), { v: JSON.stringify([]), ts: Date.now(), updatedBy: user.uid });
      await setDoc(doc(db, 'organizations', orgId, 'data', 'modules'), { v: JSON.stringify(LUURI_MODULES), ts: Date.now(), updatedBy: user.uid });

      // AI-profiili: käytännönläheinen suomalainen insinööri, ymmärtäväinen — vain Luuri.net-puolella
      const LUURI_AI_PROFILE = {
        role: 'custom',
        roleLabel: 'Käytännönläheinen suomalainen insinööri',
        focus: [
          'Puhu kuin suomalainen insinööri: suoraan, ilman korulauseita, mutta empaattisesti.',
          'Keskity käytäntöön — mikä toimii, mikä maksaa, kuka ostaa ja miksi. Ei hypeä.',
          'Tunnet B2B-asiantuntijamyynnin: IT-johtajat, tietoturvavastaavat, hallitustasolla perustelu.',
          'Tunnet lokaalit LLM:t, RAG-arkkitehtuurin, vektoritietokannat, open-source-mallit (Llama, Mistral, Qwen), on-prem raudan (GPU, palvelimet).',
          'Kohderyhmät: lakitoimistot, tilitoimistot, rahoitus, terveydenhuolto, HR, patentoitava teollisuus.',
          'Vastusta SaaS-hypeä ja pilviriippuvuutta — mutta argumentoi faktoilla (GDPR, liikesalaisuudet, kustannukset), ei ideologialla.',
        ].join('\n'),
        context: [
          'Luuri.net on 2026 perustettu suomalainen osakeyhtiö. Perustajat: Juhani Lindh (50%) ja Maximilan Rehn (50%).',
          'Palvelumalli 3 tasoa: 1) Tekoälyvalmiuden kartoitus (sisäänheittotuote), 2) Käyttöönotto (päätuote: on-prem LLM + RAG), 3) Ylläpito (kuukausilaskutus).',
          'Asiakaslupaus: Claude Code:n kaltainen workflow asiakkaan omalla salatulla datalla, palomuurin sisällä, ilman pilvipalveluriskejä.',
          'Brändi: vanha suomalainen Nokia-henkinen tekniikka, ennen pilvipalveluita ja riistokapitalismia. Retro, luotettava, kestävä.',
          'Tavoite: yksi asiakas kerrallaan, oppia virheistä, kasvaa orgaanisesti. Suomalaiset omistavat infrastruktuurinsa itse.',
        ].join('\n'),
        tone: 'Rehellinen, käytännöllinen, ymmärtäväinen. Puhu selkosuomea mutta älä aliarvioi. Naurahda omille vitseille. Ei anglismeja jos suomenkielinen sana toimii.',
        restrictions: 'Älä lupaa mitä et voi pitää. Älä piilota teknisiä rajoituksia (latenssi, rautavaatimukset, ylläpitokulut). Älä markkinoi ideologialla jos faktatkin riittävät.',
      };
      await setDoc(doc(db, 'organizations', orgId, 'data', 'aiProfile'), { v: JSON.stringify(LUURI_AI_PROFILE), ts: Date.now(), updatedBy: user.uid });
      for (const key of ['projects', 'publications', 'media_meta', 'media_uploaded', 'media_collections']) {
        await setDoc(doc(db, 'organizations', orgId, 'data', key), { v: JSON.stringify([]), ts: Date.now(), updatedBy: user.uid }, { merge: true });
      }
      const userOrgsSnap = await getDocs(query(collection(db, 'userOrgs')));
      let existingOrgs: any[] = [];
      for (const d of userOrgsSnap.docs) {
        if (d.id === user.uid) existingOrgs = d.data().orgs || [];
      }
      if (!existingOrgs.some((o: any) => o.orgId === orgId)) {
        const newOrgs = [...existingOrgs, { orgId, role: 'owner', name: 'Luuri.net' }];
        await setDoc(doc(db, 'userOrgs', user.uid), { orgs: newOrgs, orgIds: newOrgs.map((o: any) => o.orgId) });
      }
      toast('Luuri luotu!', 'success');
      window.location.reload();
    } catch (e) {
      console.error('Create luuri error:', e);
      toast('Virhe luonnissa', 'error');
    } finally {
      setSeeding(false);
    }
  };

  // Luo tai päivitä Ihaa — venekunnostustiimi (Anton, Iiro, Juhani).
  // Safe uudelleenajettavaksi: päivittää aina aiProfilen, modulit ja org-metan.
  // Seed-kulut lisätään vain jos budjetti on tyhjä (ei ylikirjoita).
  const createIhaa = async () => {
    if (!user) return;
    setSeeding(true);
    try {
      const orgId = 'ihaa';
      const IHAA_SLOGAN = 'Kolmen miehen venekunnostusprojekti.';

      await setDoc(doc(db, 'organizations', orgId), {
        name: 'Ihaa', shortName: 'IHA', slogan: IHAA_SLOGAN,
        joinCode: 'ihaa-vene-2026', createdAt: new Date().toISOString(), createdBy: user.uid, plan: 'free',
      }, { merge: true });

      // Add current user (Anton) as owner
      await setDoc(doc(db, 'organizations', orgId, 'members', user.uid), {
        role: 'owner', joinedAt: new Date().toISOString(),
        displayName: user.displayName || '', email: user.email || '', photoURL: user.photoURL || '',
      }, { merge: true });

      // Basic org metadata
      const IHAA_ORG = {
        name: 'Ihaa',
        s: 'IHA',
        slogan: IHAA_SLOGAN,
        founded: 2026,
        mission: 'Kunnostaa Ihaa-vene — Avance 245 (1983, Peter Norlin) — purjehduskuntoon yhdessä.',
        boat: {
          name: 'Ihaa',
          model: 'Avance 245',
          designer: 'Peter Norlin',
          builder: 'Avance Yachts (Suomi)',
          year: 1983,
          location: 'Helsinki',
          engine: 'Yanmar 1GM10 (1-syl. diesel, 9 hv, suora merivesijäähdytys)',
          dims: { loa: '7,48 m', beam: '2,54 m', draft: '1,42 m', mast: '~11 m', weight: '~1 750 kg' },
          sailArea: '24 m² (iso + fokki)',
        },
        team: [
          { name: 'Iiro Törmä', role: 'Työnjohtaja', avatar: 'I' },
          { name: 'Anton Baer', role: 'Miehistö', avatar: 'A' },
          { name: 'Juhani Lindh', role: 'Miehistö', avatar: 'J' },
        ],
      };
      await setDoc(doc(db, 'organizations', orgId, 'data', 'org'), { v: JSON.stringify(IHAA_ORG), ts: Date.now(), updatedBy: user.uid });
      await setDoc(doc(db, 'organizations', orgId, 'data', 'events'), { v: JSON.stringify([]), ts: Date.now(), updatedBy: user.uid }, { merge: true });
      await setDoc(doc(db, 'organizations', orgId, 'data', 'channelStats'), { v: JSON.stringify([]), ts: Date.now(), updatedBy: user.uid }, { merge: true });
      await setDoc(doc(db, 'organizations', orgId, 'data', 'modules'), { v: JSON.stringify(IHAA_MODULES), ts: Date.now(), updatedBy: user.uid });

      // ── AI-profiili: Ihaan venekunnostus-assistentti (Avance 245 / Yanmar 1GM10) ──
      const IHAA_AI_PROFILE = {
        role: 'custom',
        roleLabel: 'Venekunnostus-assistentti (Avance 245, 1983)',
        focus: [
          'Olet Ihaa-nimisen Avance 245 -purjeveneen (Peter Norlin, 1983) kunnostusassistentti.',
          'Toimi veneen, sen tekniikan ja kunnostusprosessin asiantuntijana — tunnet tämän yksilön historian, viat, tehdyt työt ja prioriteetit.',
          'Vastaa kysymyksiin tekniikasta, työjärjestyksestä, materiaaleista, työkaluista, hinnoista ja turvallisuudesta.',
          'Auta diagnostiikassa: kun tiimin jäsen kuvaa oireen, selvitä todennäköinen syy, ehdota testejä ennen korjausta, mainitse turvallisuushuomiot.',
          'Anna konkreettisia suosituksia: kotimaiset toimittajat, tuotenimet, suuruusluokan hinnat (€, sis. ALV), ajankulutus-arviot.',
          'Kun palaverissa tai muistiinpanossa puhutaan hankinnasta (maali, letkut, osa, tarvike), ehdota konkreettisia tuotteita + hinta-arvio + suomalainen toimittaja.',
          'Muistuta turvallisuudesta: seisovan takilan kunto, kölipultit, kaasujärjestelmä, sähköjen sulakkeet, kaatumisvara.',
        ].join('\n'),
        context: [
          '═══ VENE: Ihaa ═══',
          'Avance 245 (Peter Norlin, Avance Yachts Suomi, 1983). LOA 7,48 m, leveys 2,54 m, syväys 1,42 m, paino ~1750 kg, painolastisuhde ~48%.',
          'Purjepinta-ala 24 m² (iso + fokki). Luokitus: matkavene/kilpavene (C — rannikko). GRP-runko, evä-köli, pinna-ohjaus.',
          'Moottori: Yanmar 1GM10 (1-syl. diesel, 9 hv nim., 318 cc, SUORA merivesijäähdytys, ei lämmönvaihdinta).',
          'Sijainti: Helsinki. Hankittu 4/2026 hintaan 1 000 € (Nettivene-ID 1028781). Talvisäilytys pukilla.',
          '',
          '═══ TUNNETUT VIAT ═══',
          'A1 (korkea kiire): Moottorin vaihdekahva irti — kiinnitys ennen ensimmäistä käyntiä.',
          'A2 (keskikiire): Isopurjeessa repeämä — paikkaus ompelijalle (50-400 €) tai uusinta (800-2500 €) ennen kautta.',
          'A3: Yleiskunto — "huonolle hoidolle jäänyt", kevättyöt puuttuvat.',
          '',
          '═══ INVENTOITAVAT (B-luokka, kuntotarkistus) ═══',
          'Runko: osmoosi (kosteusmittari), halkeamat, kölipultit (ruoste/vuotojäljet).',
          'Kansi: balsaydinen kosteus (koputus + mittari), läpivientien tiiviys.',
          'Takila: seisova takila (1983 → 42 v, suositus uusia jos ei tiedä ikää; 10-15 v käyttöikä). Masto, salingit, vinssit.',
          'Moottori: huoltohistoria, käyttötunnit, kansiremontti, pakosarjan ikä (merivesi → syöpyy 10-20 v).',
          'Läpiviennit: hanat, letkut (kaksi kiristintä/liitos), 10 v+ kovettuneet letkut vaihtoon.',
          'Sähköt: akut, pääkytkin, sulakkeet, johtojen hapettuminen liittimissä.',
          '',
          '═══ VAIHEITUS 2026 ═══',
          'V1 (vko 1-2, huhti-touko): Inventaario + kuntoarvio + dokumentointi.',
          'V2 (vko 3-5): Kriittinen turvallisuus — vaihdekahva, moottorin täyshuolto, takilan tarkistus, läpiviennit, pilssipumppu, sähköt.',
          'V3 (vko 6-10, touko-kesä): Käyttökuntoisuus — isopurjeen paikkaus, pohjamaali, kansiläpivientien tiivistys, sisätilat, vesilasku, koeajo.',
          'V4 (kausi 2026 + talvi 26-27): Kosmeettinen, sisätilat, elektroniikka, syvemmät korjaukset (takila kokonaan, kansi, osmoosi).',
          '',
          '═══ BUDJETTI 2026 (karkea haarukka 2500-9000 €) ═══',
          'Moottorihuolto 150-300 €, vaihdekahva 0-50 €, isopurje 100-400 €, pohjamaali 200-500 €, tiivistysmassat 100-300 €, letkut 100-300 €, takilan tarkistus 100-300 €, takilan uusinta 0-2500 €, kuntotarkastus 200-400 €, turvavarusteet 100-400 €, vesilasku+nosto 200-500 €, talvisäilytys 300-800 €, venepaikka 500-1500 €, kasko 300-700 €.',
          '',
          '═══ SUOMEN TOIMITTAJAT ═══',
          'Yanmar: Brandt Oy (maahantuoja), Marineparts.fi, mpalola.fi, yanmarosat.fi.',
          'Purjeet: WB-Sails (Espoo), Pipe Rigging (Helsinki), Tracker Rigging, Norsap, B-Sails.',
          'Venetarvikkeet: Maritim, Nautikulma, Kaatrakauppa (Hki), Biltema, Puuilo.',
          'Pohjamaalit: International (AkzoNobel), Hempel, Seajet, Nautix, Teknos.',
          'Epoksit: West System, Sicomin.',
          'Telakat Hki: HSK, NJK, HSS, HMV, Merellinen Helsinki, Sörnäisten Venekerho.',
          '',
          '═══ TIIMI ═══',
          'Iiro Törmä — työnjohtaja (vastaa työn etenemisestä ja tehtävien jaosta).',
          'Anton Baer — miehistö (projektin yhteinen omistaja).',
          'Juhani Lindh — miehistö (tiiviisti mukana).',
          '',
          '═══ PAKOLLISET VARUSTEET (Traficom, >5,6 m purjevene) ═══',
          'Pelastusliivit / henkilö, ankkuri + köysi, äyskäri/tyhjennyspumppu, pilli, kompassi, merikartat, navigointivalot, käsisammutin.',
        ].join('\n'),
        tone: 'Ystävällinen, tekninen, suora. Ei ylimääräisiä varoituksia tai vastuuvapautuslausekkeita — oletus on että tiimi tietää mitä tekee. Kysy jos kysymys on moniselitteinen (esim. "onko tämä letku kunnossa" → mitä letkua, mitä oireita, onko kuvaa). Anna hintahaarukat, ei yksittäisiä lukuja. Mainitse lähde kun viittaat ohjeeseen (Yanmar-käsikirja, valmistajan tuotesivu, foorumikokemus).',
        restrictions: 'Älä lupaa mitä et voi pitää. Älä piilota teknisiä rajoituksia tai turvallisuushuomioita silloin kun ne ovat oikeasti merkityksellisiä. Älä toista koko venekontekstia joka vastauksessa — oleta että tiimi tuntee peruspalat. Jos kysytään jotain mihin tarvitaan kuva tai tarkempi tieto, pyydä sitä eikä arvaa. ÄLÄ KÄYTÄ MARKDOWN-MUOTOILUA: ei otsikoita (# tai ##), ei lihavointia (**), ei kursivointia, ei taulukoita, ei emojeja, ei koodiblokkeja. Vastaa selkotekstillä ja normaaleilla kappaleilla. Käytä lista-merkintää ("- ") vain jos sisältö on oikeasti lista — muuten juoksevaa tekstiä. Momentum näyttää vastaukset ilman markdown-renderöintiä, joten markdown-merkinnät näkyvät rumana raakatekstinä.',
        welcomeDesc: 'Tunnen Ihaan — Avance 245 (1983) — tekniset tiedot, Yanmar 1GM10 -moottorin, tunnetut viat, kunnostuksen vaiheet ja suomalaiset toimittajat. Kysy teknistä, hintaa, työjärjestystä tai diagnostiikkaa.',
        suggestions: [
          'Mitä teen ensimmäisenä inventaariossa?',
          'Mistä ostan Yanmar 1GM10 huoltosarjan?',
          'Miten tunnistan takilan uusimistarpeen?',
          'Paljonko pohjamaalia tarvitsen Ihaan kokoiselle veneelle?',
          'Mikä on hyvä työjärjestys kevätkunnostukselle?',
          'Mitkä ovat tämän kauden kriittiset turvallisuustarkistukset?',
        ],
      };
      await setDoc(doc(db, 'organizations', orgId, 'data', 'aiProfile'), { v: JSON.stringify(IHAA_AI_PROFILE), ts: Date.now(), updatedBy: user.uid });

      // orgTeams: yksi tiimi "Miehistö"
      const teams = [
        { id: 'miehisto', name: 'Miehistö', color: '#2a8a86', icon: '⚓', description: 'Ihaan kunnostustiimi.' },
      ];
      await setDoc(doc(db, 'organizations', orgId, 'data', 'orgTeams'), { v: JSON.stringify(teams), ts: Date.now(), updatedBy: user.uid });

      // orgTeamMembers — Iiro on työnjohtaja. Anton linkataan omaan tiliin.
      const members = [
        {
          id: 'anton', name: 'Anton Baer', role: 'Miehistö', teamId: 'miehisto', type: 'permanent',
          avatar: 'A', email: user.email || '', linkedUserEmails: [user.email || ''].filter(Boolean),
        },
        { id: 'iiro', name: 'Iiro Törmä', role: 'Työnjohtaja', teamId: 'miehisto', type: 'permanent', avatar: 'I', isManager: true },
        { id: 'juhani', name: 'Juhani Lindh', role: 'Miehistö', teamId: 'miehisto', type: 'permanent', avatar: 'J' },
      ];
      await setDoc(doc(db, 'organizations', orgId, 'data', 'orgTeamMembers'), { v: JSON.stringify(members), ts: Date.now(), updatedBy: user.uid });

      // Initialize empty collections (merge: true — ei ylikirjoita jos on jo dataa)
      for (const key of ['projects', 'publications', 'media_meta', 'media_uploaded', 'media_collections', 'tasks', 'meetingNotes', 'projectNotes', 'meetings', 'meetingPolls']) {
        await setDoc(doc(db, 'organizations', orgId, 'data', key), { v: JSON.stringify([]), ts: Date.now(), updatedBy: user.uid }, { merge: true });
      }

      // ── Budjetti: kategoriat + alkukulut (vain jos tyhjä, ei ylikirjoita) ──
      const budgetCats = [
        { id: 'cat_hankinta',   name: 'Hankinta',        color: '#9b7cf6' },
        { id: 'cat_moottori',   name: 'Moottori',        color: '#ef6b6b' },
        { id: 'cat_runko',      name: 'Runko & pohja',   color: '#2a8a86' },
        { id: 'cat_takila',     name: 'Takila & purjeet', color: '#3788b2' },
        { id: 'cat_telakka',    name: 'Telakka & paikka', color: '#f1b434' },
        { id: 'cat_vakuutus',   name: 'Vakuutus',        color: '#e45c81' },
        { id: 'cat_turva',      name: 'Turvavarusteet',  color: '#2dd4a0' },
        { id: 'cat_tarvike',    name: 'Tarvikkeet',      color: '#888' },
      ];
      const budgetSettings = {
        defaultYear: 2026,
        currency: 'EUR',
        showSplit: true,
        splitMembers: ['Anton Baer', 'Iiro Törmä', 'Juhani Lindh'],
      };
      const seedEntries = [
        {
          id: 'be_seed_boat',
          date: '2026-04-01',
          description: 'Ihaa — Avance 245 (1983) hankinta',
          amount: 1000,
          category: 'cat_hankinta',
          paidBy: 'Iiro Törmä',
          vendor: 'Nettivene',
          invoiceNumber: '1028781',
          notes: 'Alkuperäinen ostohinta.',
          createdAt: Date.now(),
          createdBy: user.uid,
        },
        {
          id: 'be_seed_paikka',
          date: '2026-04-01',
          description: 'Venepaikka 2026',
          amount: 150,
          category: 'cat_telakka',
          paidBy: 'Iiro Törmä',
          createdAt: Date.now() + 1,
          createdBy: user.uid,
        },
      ];

      // Kategoriat ja asetukset päivitetään aina (ei käyttäjän muokattavia näissä)
      await setDoc(doc(db, 'organizations', orgId, 'data', 'budgetCategories'), { v: JSON.stringify(budgetCats), ts: Date.now(), updatedBy: user.uid });
      await setDoc(doc(db, 'organizations', orgId, 'data', 'budgetSettings'), { v: JSON.stringify(budgetSettings), ts: Date.now(), updatedBy: user.uid });

      // Kulut: lisätään vain jos doc on tyhjä tai ei ole olemassa — ei ylikirjoita käyttäjän syötteitä
      const existingBudgetSnap = await getDocs(collection(db, 'organizations', orgId, 'data'));
      const existingBudgetDoc = existingBudgetSnap.docs.find(d => d.id === 'budgetEntries');
      let shouldSeedEntries = true;
      if (existingBudgetDoc) {
        try {
          const parsed = JSON.parse(existingBudgetDoc.data().v);
          if (Array.isArray(parsed) && parsed.length > 0) shouldSeedEntries = false;
        } catch { /* treat as empty */ }
      }
      if (shouldSeedEntries) {
        await setDoc(doc(db, 'organizations', orgId, 'data', 'budgetEntries'), { v: JSON.stringify(seedEntries), ts: Date.now(), updatedBy: user.uid });
      }

      // Add Ihaa to current user's org list
      const userOrgsSnap = await getDocs(query(collection(db, 'userOrgs')));
      let existingOrgs: any[] = [];
      for (const d of userOrgsSnap.docs) {
        if (d.id === user.uid) existingOrgs = d.data().orgs || [];
      }
      if (!existingOrgs.some((o: any) => o.orgId === orgId)) {
        const newOrgs = [...existingOrgs, { orgId, role: 'owner', name: 'Ihaa' }];
        await setDoc(doc(db, 'userOrgs', user.uid), { orgs: newOrgs, orgIds: newOrgs.map((o: any) => o.orgId) });
      }

      // Lisää Iiro ja Juhani jäseniksi — etsi heidät users-kokoelmasta sähköpostin perusteella
      const usersSnap = await getDocs(collection(db, 'users'));
      const allUsersList = usersSnap.docs.map(u => ({ uid: u.id, ...(u.data() as any) }));

      const inviteByEmail = async (emailRaw: string, displayName: string) => {
        const email = emailRaw.trim().toLowerCase();
        if (!email) return { ok: false, reason: 'tyhjä' };
        const u = allUsersList.find(x => (x.email || '').toLowerCase() === email);
        if (!u) return { ok: false, reason: 'ei löydy users-kokoelmasta — pyydä häntä kirjautumaan ensin Momentumiin' };
        // Add as member of org
        await setDoc(doc(db, 'organizations', orgId, 'members', u.uid), {
          role: 'member', joinedAt: new Date().toISOString(),
          displayName: u.displayName || displayName, email: u.email || email, photoURL: u.photoURL || '',
        }, { merge: true });
        // Add to their userOrgs
        const existing = (userOrgsSnap.docs.find(d => d.id === u.uid)?.data() as any)?.orgs || [];
        if (!existing.some((o: any) => o.orgId === orgId)) {
          const updated = [...existing, { orgId, role: 'member', name: 'Ihaa' }];
          await setDoc(doc(db, 'userOrgs', u.uid), { orgs: updated, orgIds: updated.map((o: any) => o.orgId) });
        }
        // Link their email to the team member record
        const curMembers = members.map(m => {
          if (m.name === displayName) {
            return { ...m, email: u.email || email, linkedUserEmails: [...new Set([...(m.linkedUserEmails || []), (u.email || email).toLowerCase()])] };
          }
          return m;
        });
        await setDoc(doc(db, 'organizations', orgId, 'data', 'orgTeamMembers'), { v: JSON.stringify(curMembers), ts: Date.now(), updatedBy: user.uid });
        return { ok: true };
      };

      const iiroResult = iiroEmail ? await inviteByEmail(iiroEmail, 'Iiro Törmä') : { ok: false, reason: 'ei sähköpostia annettu' };
      const juhaniResult = juhaniEmail ? await inviteByEmail(juhaniEmail, 'Juhani Lindh') : { ok: false, reason: 'ei sähköpostia annettu' };

      const warnings: string[] = [];
      if (!iiroResult.ok) warnings.push(`Iiro: ${iiroResult.reason}`);
      if (!juhaniResult.ok) warnings.push(`Juhani: ${juhaniResult.reason}`);

      if (warnings.length > 0) {
        toast(`Ihaa luotu. ${warnings.join('; ')}`, 'success');
      } else {
        toast('Ihaa luotu ja kaikki jäsenet lisätty!', 'success');
      }
      window.location.reload();
    } catch (e) {
      console.error('Create ihaa error:', e);
      toast('Virhe Ihaan luonnissa', 'error');
    } finally {
      setSeeding(false);
    }
  };

  const selectedOrgData = selectedOrg ? orgs.find(o => o.id === selectedOrg) : null;
  const hasJuhlatoimikunta = orgs.some(o => o.id === 'juhlatoimikunta');
  const hasLuuri = orgs.some(o => o.id === 'luuri');
  const hasIhaa = orgs.some(o => o.id === 'ihaa');

  return (
    <AppShell title="Hallintapaneeli" subtitle="Käyttäjien ja organisaatioiden hallinta">
      {/* Create Juhlatoimikunta if missing */}
      {!hasJuhlatoimikunta && (
        <div style={{
          background: 'linear-gradient(135deg, rgba(155,124,246,.08), rgba(228,92,129,.06))',
          border: '1px solid rgba(155,124,246,.25)', borderRadius: 'var(--rl)',
          padding: '1.25rem 1.5rem', marginBottom: '1.5rem',
          display: 'flex', alignItems: 'center', gap: '1rem',
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '.92rem', fontWeight: 700 }}>Juhlatoimikunta puuttuu</div>
            <div style={{ fontSize: '.75rem', color: 'var(--t2)', marginTop: '.2rem' }}>Sirpan 70v juhlat 25.4.2026, Tyttojen talo. Luo tyotila Firestoreen.</div>
          </div>
          <button className="btn btn-primary" onClick={createJuhlatoimikunta} disabled={seeding}>
            {seeding ? 'Luodaan...' : 'Luo Juhlatoimikunta'}
          </button>
        </div>
      )}

      {/* Update Luuri if exists and not fully seeded */}
      {hasLuuri && !luuriSeeded && (
        <div style={{
          background: 'linear-gradient(135deg, rgba(5,107,159,.06), rgba(24,94,91,.04))',
          border: '1px solid rgba(5,107,159,.2)', borderRadius: 'var(--rl)',
          padding: '1rem 1.25rem', marginBottom: '1rem',
          display: 'flex', alignItems: 'center', gap: '1rem',
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '.88rem', fontWeight: 700 }}>Päivitä Luuri.net -data</div>
            <div style={{ fontSize: '.72rem', color: 'var(--t2)', marginTop: '.2rem' }}>Ajaa uusimman strategian, AI-profiilin ja nimen (Luuri → Luuri.net) olemassa olevaan orgiin. Ei poista käyttäjien lisäämää dataa.</div>
          </div>
          <button className="btn btn-primary btn-sm" onClick={createLuuri} disabled={seeding}>
            {seeding ? 'Päivitetään...' : 'Päivitä data'}
          </button>
        </div>
      )}

      {/* Päivitä Ihaa jos on jo olemassa */}
      {hasIhaa && (
        <div style={{
          background: 'linear-gradient(135deg, rgba(42,138,134,.06), rgba(155,124,246,.04))',
          border: '1px solid rgba(42,138,134,.2)', borderRadius: 'var(--rl)',
          padding: '1rem 1.25rem', marginBottom: '1rem',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '.5rem' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '.88rem', fontWeight: 700 }}>Päivitä Ihaa</div>
              <div style={{ fontSize: '.72rem', color: 'var(--t2)', marginTop: '.15rem' }}>
                Ajaa uusimman AI-profiilin (Avance 245 + Yanmar 1GM10 -konteksti), budjettikategoriat, Iiro työnjohtajaksi, projects-moduuli pois. Ei poista käyttäjän syöttämää dataa. Jäsenten sähköpostit valinnaisia — lisää vain jos heitä ei ole vielä lisätty.
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '.5rem', marginBottom: '.5rem', flexWrap: 'wrap' }}>
            <input
              className="input"
              placeholder="Iiro Törmän sähköposti (valinnainen)"
              value={iiroEmail}
              onChange={e => setIiroEmail(e.target.value)}
              style={{ flex: '1 1 200px', fontSize: '.78rem' }}
            />
            <input
              className="input"
              placeholder="Juhani Lindhin sähköposti (valinnainen)"
              value={juhaniEmail}
              onChange={e => setJuhaniEmail(e.target.value)}
              style={{ flex: '1 1 200px', fontSize: '.78rem' }}
            />
          </div>
          <button className="btn btn-primary btn-sm" onClick={createIhaa} disabled={seeding}>
            {seeding ? 'Päivitetään...' : 'Päivitä Ihaa'}
          </button>
        </div>
      )}

      {/* Create Ihaa if missing */}
      {!hasIhaa && (
        <div style={{
          background: 'linear-gradient(135deg, rgba(42,138,134,.08), rgba(5,107,159,.06))',
          border: '1px solid rgba(42,138,134,.25)', borderRadius: 'var(--rl)',
          padding: '1.25rem 1.5rem', marginBottom: '1.5rem',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '.75rem' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '.92rem', fontWeight: 700 }}>Ihaa (venekunnostus) puuttuu</div>
              <div style={{ fontSize: '.75rem', color: 'var(--t2)', marginTop: '.2rem' }}>
                Uusi työtila: Anton, Iiro ja Juhani. Anna Iiron ja Juhanin sähköpostit — heidät lisätään suoraan jäseniksi (heidän pitää olla jo kirjautuneet Momentumiin kerran).
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '.5rem', marginBottom: '.75rem', flexWrap: 'wrap' }}>
            <input
              className="input"
              placeholder="Iiro Törmän sähköposti"
              value={iiroEmail}
              onChange={e => setIiroEmail(e.target.value)}
              style={{ flex: '1 1 240px', fontSize: '.82rem' }}
            />
            <input
              className="input"
              placeholder="Juhani Lindhin sähköposti"
              value={juhaniEmail}
              onChange={e => setJuhaniEmail(e.target.value)}
              style={{ flex: '1 1 240px', fontSize: '.82rem' }}
            />
          </div>
          <button className="btn btn-primary" onClick={createIhaa} disabled={seeding}>
            {seeding ? 'Luodaan...' : 'Luo Ihaa'}
          </button>
        </div>
      )}

      {/* Create Luuri if missing */}
      {!hasLuuri && (
        <div style={{
          background: 'linear-gradient(135deg, rgba(5,107,159,.08), rgba(24,94,91,.06))',
          border: '1px solid rgba(5,107,159,.25)', borderRadius: 'var(--rl)',
          padding: '1.25rem 1.5rem', marginBottom: '1.5rem',
          display: 'flex', alignItems: 'center', gap: '1rem',
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '.92rem', fontWeight: 700 }}>Luuri.net puuttuu</div>
            <div style={{ fontSize: '.75rem', color: 'var(--t2)', marginTop: '.2rem' }}>Puhdas tyhjä työtila kaikilla moduuleilla — irti muista orgeista. Ei pohjatietoja.</div>
          </div>
          <button className="btn btn-primary" onClick={createLuuri} disabled={seeding}>
            {seeding ? 'Luodaan...' : 'Luo Luuri.net'}
          </button>
        </div>
      )}

      {/* Stats */}
      <div className="stats" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        <div className="stat">
          <div className="stat-num">{orgs.length}</div>
          <div className="stat-lbl">Organisaatiot</div>
        </div>
        <div className="stat">
          <div className="stat-num">{allUsers.length}</div>
          <div className="stat-lbl">Käyttäjät</div>
        </div>
        <div className="stat">
          <div className="stat-num">{orgs.reduce((s, o) => s + o.members.length, 0)}</div>
          <div className="stat-lbl">Jäsenyydet</div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '.35rem', marginBottom: '1.5rem', background: 'var(--elev)', borderRadius: 'var(--r)', padding: '3px', width: 'fit-content' }}>
        <button className={`cal-view-btn ${tab === 'orgs' ? 'act' : ''}`} onClick={() => { setTab('orgs'); setSelectedOrg(null); }}>
          Organisaatiot ({orgs.length})
        </button>
        <button className={`cal-view-btn ${tab === 'users' ? 'act' : ''}`} onClick={() => setTab('users')}>
          Käyttäjät ({allUsers.length})
        </button>
      </div>

      {loadingData ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--t3)' }}>
          <div className="typing"><span /><span /><span /></div>
          <p style={{ marginTop: '1rem', fontSize: '.85rem' }}>Ladataan tietoja...</p>
        </div>
      ) : (
        <>
          {/* ═══ ORGANIZATIONS TAB ═══ */}
          {tab === 'orgs' && !selectedOrg && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '.75rem' }}>
              {orgs.map(org => (
                <div key={org.id} onClick={() => setSelectedOrg(org.id)} style={{
                  display: 'flex', alignItems: 'center', gap: '1rem', padding: '1rem 1.25rem',
                  background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)',
                  cursor: 'pointer', transition: 'border-color .15s',
                }} onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--pri)')} onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}>
                  <div style={{
                    width: 44, height: 44, borderRadius: 'var(--r)', background: 'var(--pri)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#fff', fontSize: '1rem', fontWeight: 700, fontFamily: 'var(--font-display)', flexShrink: 0,
                  }}>{(org.shortName || org.name)[0]}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '.95rem', fontWeight: 700 }}>{org.name}</div>
                    <div style={{ fontSize: '.72rem', color: 'var(--t3)' }}>
                      {org.members.length} jäsentä {'·'} Luotu {org.createdAt ? new Date(org.createdAt).toLocaleDateString('fi-FI') : '-'}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '-4px' }}>
                    {org.members.slice(0, 4).map((m, i) => (
                      <div key={m.uid} className="ava" style={{
                        width: 28, height: 28, fontSize: '.6rem', marginLeft: i > 0 ? '-6px' : 0,
                        border: '2px solid var(--card)', background: m.role === 'owner' ? 'var(--pri)' : 'var(--elev)',
                      }}>
                        {m.photoURL ? <img src={m.photoURL} style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} /> : (m.displayName || '?')[0]}
                      </div>
                    ))}
                    {org.members.length > 4 && <span style={{ fontSize: '.65rem', color: 'var(--t3)', alignSelf: 'center', marginLeft: '.3rem' }}>+{org.members.length - 4}</span>}
                  </div>
                  <span style={{ color: 'var(--t3)', fontSize: '.9rem' }}>{'›'}</span>
                </div>
              ))}
              {orgs.length === 0 && (
                <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--t3)' }}>
                  Ei organisaatioita vielä.
                </div>
              )}
            </div>
          )}

          {/* ═══ ORG DETAIL ═══ */}
          {tab === 'orgs' && selectedOrgData && (
            <div>
              <button className="btn btn-ghost" onClick={() => setSelectedOrg(null)} style={{ marginBottom: '1rem' }}>
                {'←'} Takaisin organisaatioihin
              </button>

              <div className="bcard" style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', marginBottom: '1.5rem' }}>
                <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)' }}>
                  <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', fontWeight: 500 }}>{selectedOrgData.name}</h3>
                  <p style={{ fontSize: '.78rem', color: 'var(--t3)', marginTop: '.15rem' }}>
                    {selectedOrgData.shortName} {'·'} {selectedOrgData.plan} {'·'} ID: {selectedOrgData.id.slice(0, 8)}...
                  </p>
                </div>

                {/* Modules */}
                <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)' }}>
                  <h4 style={{ fontSize: '.82rem', fontWeight: 700, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: '1rem' }}>
                    Moduulit
                  </h4>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '.5rem' }}>
                    {MODULE_ORDER.map(modId => {
                      const mod = MODULE_REGISTRY[modId];
                      const orgDef = getDefaultModules(selectedOrgData.id);
                      const enabled = orgModules[selectedOrgData.id]?.[modId] ?? orgDef[modId] ?? false;
                      const isAlwaysOn = mod.alwaysOn;
                      return (
                        <div key={modId} onClick={async (e) => {
                          e.stopPropagation();
                          if (isAlwaysOn) return;
                          const currentModules = orgModules[selectedOrgData.id] || orgDef;
                          const updated = { ...currentModules, [modId]: !enabled };
                          setOrgModules(prev => ({ ...prev, [selectedOrgData.id]: updated }));
                          try {
                            await setDoc(doc(db, 'organizations', selectedOrgData.id, 'data', 'modules'), { v: JSON.stringify(updated), ts: Date.now(), updatedBy: user!.uid });
                            toast(`${mod.label} ${!enabled ? 'aktivoitu' : 'deaktivoitu'}`, 'success');
                          } catch (err) {
                            toast(`Tallennus epäonnistui: ${(err as Error).message}`, 'error');
                            setOrgModules(prev => ({ ...prev, [selectedOrgData.id]: { ...updated, [modId]: enabled } }));
                          }
                        }}
                          style={{
                            display: 'flex', alignItems: 'center', gap: '.5rem', padding: '.6rem .75rem',
                            background: enabled ? 'rgba(5,107,159,.08)' : 'var(--elev)',
                            border: `1px solid ${enabled ? 'var(--pri)' : 'var(--border)'}`,
                            borderRadius: 'var(--r)', cursor: isAlwaysOn ? 'default' : 'pointer',
                            opacity: isAlwaysOn ? 0.6 : 1, transition: 'all .15s',
                          }}>
                          <span style={{ fontSize: '.9rem' }}>{mod.icon}</span>
                          <span style={{ fontSize: '.78rem', fontWeight: 600, flex: 1 }}>{mod.label}</span>
                          <div style={{
                            width: 32, height: 18, borderRadius: 9, padding: 2,
                            background: enabled ? 'var(--pri)' : 'var(--border)',
                            transition: 'background .2s', display: 'flex', alignItems: 'center',
                          }}>
                            <div style={{
                              width: 14, height: 14, borderRadius: '50%', background: '#fff',
                              transform: enabled ? 'translateX(14px)' : 'translateX(0)',
                              transition: 'transform .2s',
                            }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* AI Profile */}
                <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)' }}>
                  <h4 style={{ fontSize: '.82rem', fontWeight: 700, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: '.5rem' }}>
                    AI-profiili
                  </h4>
                  <p style={{ fontSize: '.72rem', color: 'var(--t3)', marginBottom: '1rem', lineHeight: 1.6 }}>
                    Määrittelee miten AI toimii tässä asiakkuudessa. Rooli, fokus, painopisteet ja konteksti.
                  </p>

                  <div className="field">
                    <label>AI:n rooli</label>
                    <select className="input" value={aiProfiles[selectedOrgData.id]?.role || 'comms'} onChange={async (e) => {
                      const updated = { ...(aiProfiles[selectedOrgData.id] || {}), role: e.target.value };
                      setAiProfiles(prev => ({ ...prev, [selectedOrgData.id]: updated }));
                      await setDoc(doc(db, 'organizations', selectedOrgData.id, 'data', 'aiProfile'), { v: JSON.stringify(updated), ts: Date.now(), updatedBy: user!.uid });
                      toast('AI-rooli päivitetty', 'success');
                    }}>
                      <option value="comms">Viestinnän strateginen kumppani</option>
                      <option value="marketing">Markkinoinnin avustaja</option>
                      <option value="project">Projektipäällikkö-avustaja</option>
                      <option value="production">Tuotannon hallinta-avustaja</option>
                      <option value="custom">Räätälöity rooli</option>
                    </select>
                  </div>

                  <div className="field">
                    <label>AI:n fokus ja painopisteet</label>
                    <textarea className="input textarea" value={aiProfiles[selectedOrgData.id]?.focus || ''} onChange={e => {
                      setAiProfiles(prev => ({ ...prev, [selectedOrgData.id]: { ...(prev[selectedOrgData.id] || {}), focus: e.target.value } }));
                    }} placeholder="Esim: Keskity viestinnän strategiseen suunnitteluun. Painota saavutettavuutta ja selkokielisyyttä. Tunne STEA-rahoituksen vaatimukset."
                      style={{ minHeight: 80 }} />
                  </div>

                  <div className="field">
                    <label>Organisaation konteksti AI:lle</label>
                    <textarea className="input textarea" value={aiProfiles[selectedOrgData.id]?.context || ''} onChange={e => {
                      setAiProfiles(prev => ({ ...prev, [selectedOrgData.id]: { ...(prev[selectedOrgData.id] || {}), context: e.target.value } }));
                    }} placeholder="Organisaation tausta, missio, erityispiirteet, kohderyhmät, toimintaympäristö..."
                      style={{ minHeight: 120 }} />
                  </div>

                  <div className="field">
                    <label>AI:n sävyohje</label>
                    <input className="input" value={aiProfiles[selectedOrgData.id]?.tone || ''} onChange={e => {
                      setAiProfiles(prev => ({ ...prev, [selectedOrgData.id]: { ...(prev[selectedOrgData.id] || {}), tone: e.target.value } }));
                    }} placeholder="Esim: Asiallinen, empaattinen, rohkaiseva, selkeä" />
                  </div>

                  <div className="field">
                    <label>Kielletyt aiheet / rajoitukset</label>
                    <input className="input" value={aiProfiles[selectedOrgData.id]?.restrictions || ''} onChange={e => {
                      setAiProfiles(prev => ({ ...prev, [selectedOrgData.id]: { ...(prev[selectedOrgData.id] || {}), restrictions: e.target.value } }));
                    }} placeholder="Esim: Älä anna lääketieteellisiä neuvoja, älä spekuloi rahoituksesta" />
                  </div>

                  <button className="btn btn-primary btn-sm" onClick={async () => {
                    const profile = aiProfiles[selectedOrgData.id] || {};
                    await setDoc(doc(db, 'organizations', selectedOrgData.id, 'data', 'aiProfile'), { v: JSON.stringify(profile), ts: Date.now(), updatedBy: user!.uid });
                    toast('AI-profiili tallennettu', 'success');
                  }}>Tallenna AI-profiili</button>
                </div>

                {/* Members */}
                <div style={{ padding: '1.25rem 1.5rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                    <h4 style={{ fontSize: '.82rem', fontWeight: 700, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.04em' }}>
                      Jäsenet ({selectedOrgData.members.length})
                    </h4>
                  </div>

                  {selectedOrgData.members.map(m => (
                    <div key={m.uid} style={{
                      display: 'flex', alignItems: 'center', gap: '.75rem', padding: '.75rem',
                      background: 'var(--elev)', border: '1px solid var(--border)', borderRadius: 'var(--r)',
                      marginBottom: '.5rem',
                    }}>
                      <div className="ava" style={{ width: 38, height: 38, fontSize: '.8rem', background: 'var(--pri)', flexShrink: 0 }}>
                        {m.photoURL ? <img src={m.photoURL} style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} /> : (m.displayName || '?')[0]}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '.85rem', fontWeight: 600 }}>{m.displayName || 'Nimetön'}</div>
                        <div style={{ fontSize: '.72rem', color: 'var(--t3)' }}>{m.email}</div>
                      </div>
                      <select
                        value={m.role}
                        onChange={e => changeRole(selectedOrgData.id, m.uid, e.target.value as any)}
                        className="input"
                        style={{ width: 'auto', fontSize: '.78rem', padding: '.3rem .5rem' }}
                      >
                        <option value="owner">Omistaja</option>
                        <option value="admin">Admin</option>
                        <option value="member">Jäsen</option>
                      </select>
                      <button className="btn btn-ghost btn-sm" onClick={() => removeMember(selectedOrgData.id, m.uid)}
                        style={{ color: 'var(--red)', fontSize: '.75rem' }}>
                        Poista
                      </button>
                    </div>
                  ))}

                  {/* Invite */}
                  <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border)', display: 'flex', gap: '.5rem', alignItems: 'center' }}>
                    <input className="input" placeholder="Sähköposti" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} style={{ flex: 1, fontSize: '.82rem' }} />
                    <select className="input" value={inviteRole} onChange={e => setInviteRole(e.target.value as any)} style={{ width: 'auto', fontSize: '.78rem' }}>
                      <option value="member">Jäsen</option>
                      <option value="admin">Admin</option>
                    </select>
                    <button className="btn btn-primary btn-sm" onClick={() => { setInviteOrgId(selectedOrgData.id); inviteMember(); }} disabled={!inviteEmail.trim()}>
                      Kutsu
                    </button>
                  </div>
                </div>
              </div>

              {/* Vaarallinen alue — organisaation poisto useamman varmennuksen takana */}
              <DangerZone org={selectedOrgData} onDelete={() => deleteOrg(selectedOrgData.id)} />
            </div>
          )}

          {/* ═══ USERS TAB ═══ */}
          {tab === 'users' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
              {allUsers.map(u => {
                const userOrgs = orgs.filter(o => o.members.some(m => m.uid === u.uid));
                return (
                  <div key={u.uid} style={{
                    display: 'flex', alignItems: 'center', gap: '1rem', padding: '1rem 1.25rem',
                    background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)',
                  }}>
                    <div className="ava" style={{ width: 42, height: 42, fontSize: '.85rem', background: 'var(--pri)', flexShrink: 0 }}>
                      {u.photoURL ? <img src={u.photoURL} style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} /> : (u.displayName || '?')[0]}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '.9rem', fontWeight: 600 }}>{u.displayName || 'Nimetön'}</div>
                      <div style={{ fontSize: '.72rem', color: 'var(--t3)' }}>{u.email}</div>
                      <div style={{ fontSize: '.65rem', color: 'var(--t3)', marginTop: '.15rem' }}>
                        Viimeksi: {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString('fi-FI') : '-'}
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '.2rem', alignItems: 'flex-end' }}>
                      {userOrgs.map(o => {
                        const membership = o.members.find(m => m.uid === u.uid);
                        return (
                          <span key={o.id} style={{
                            fontSize: '.68rem', padding: '.15rem .5rem', borderRadius: 9999, fontWeight: 600,
                            background: membership?.role === 'owner' ? 'rgba(5,107,159,.1)' : 'var(--elev)',
                            color: membership?.role === 'owner' ? 'var(--pri-l)' : 'var(--t2)',
                            border: '1px solid var(--border)',
                          }}>
                            {o.name} ({membership?.role})
                          </span>
                        );
                      })}
                      {userOrgs.length === 0 && (
                        <span style={{ fontSize: '.68rem', color: 'var(--t3)', fontStyle: 'italic' }}>Ei organisaatioita</span>
                      )}
                    </div>
                    {u.email && !SUPER_ADMINS.includes(u.email) && (
                      <button className="btn btn-ghost btn-sm" onClick={() => deleteUser(u.uid)}
                        style={{ color: 'var(--red)', fontSize: '.72rem', flexShrink: 0 }}>
                        Poista
                      </button>
                    )}
                  </div>
                );
              })}
              {allUsers.length === 0 && (
                <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--t3)' }}>
                  Ei käyttäjiä vielä.
                </div>
              )}
            </div>
          )}
        </>
      )}
    </AppShell>
  );
}

// =============================================================================
// DANGER ZONE — organisaation poisto usean varmennuksen takana
// =============================================================================
function DangerZone({ org, onDelete }: { org: OrgData; onDelete: () => Promise<void> | void }) {
  const [expanded, setExpanded] = useState(false);
  const [armed, setArmed] = useState(false);
  const [typed, setTyped] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const nameMatches = typed.trim() === org.name;

  const doDelete = async () => {
    if (!nameMatches) return;
    setBusy(true);
    try { await onDelete(); } finally { setBusy(false); }
  };

  return (
    <div style={{
      marginTop: '3rem', padding: '1rem 1.25rem',
      background: 'rgba(239,68,68,.04)',
      border: '1px dashed rgba(239,68,68,.35)',
      borderRadius: 'var(--rl)',
    }}>
      <button
        onClick={() => { setExpanded(v => !v); if (expanded) { setArmed(false); setTyped(''); setConfirming(false); } }}
        style={{
          background: 'transparent', border: 'none', color: 'var(--t3)',
          cursor: 'pointer', fontSize: '.72rem', fontWeight: 700,
          textTransform: 'uppercase', letterSpacing: '.06em',
          display: 'inline-flex', alignItems: 'center', gap: '.4rem', padding: 0,
        }}
      >
        <span style={{ transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform .15s', display: 'inline-block' }}>▸</span>
        Vaarallinen alue
      </button>

      {expanded && (
        <div style={{ marginTop: '1rem', paddingTop: '.75rem', borderTop: '1px dashed rgba(239,68,68,.2)' }}>
          <div style={{ fontSize: '.82rem', color: 'var(--t2)', lineHeight: 1.5, marginBottom: '.75rem' }}>
            Organisaation <b>{org.name}</b> poisto tuhoaa <b>kaikki jäsenet, moduulit ja data-dokumentit</b>. Tätä toimintoa <b>ei voi perua</b>.
          </div>

          {!armed && (
            <button
              onClick={() => setArmed(true)}
              style={{
                fontSize: '.72rem', padding: '.35rem .7rem', borderRadius: 'var(--r)',
                background: 'transparent', color: 'var(--red)',
                border: '1px solid rgba(239,68,68,.35)', cursor: 'pointer', fontWeight: 600,
              }}
            >
              Aloita poistoprosessi
            </button>
          )}

          {armed && !confirming && (
            <div>
              <label style={{ display: 'block', fontSize: '.72rem', color: 'var(--t2)', marginBottom: '.35rem' }}>
                Kirjoita organisaation nimi vahvistaaksesi: <b style={{ color: 'var(--t1)' }}>{org.name}</b>
              </label>
              <input
                className="input"
                value={typed}
                onChange={e => setTyped(e.target.value)}
                placeholder={org.name}
                style={{ maxWidth: 360, marginBottom: '.5rem' }}
                autoFocus
              />
              <div style={{ display: 'flex', gap: '.4rem' }}>
                <button
                  onClick={() => { setArmed(false); setTyped(''); }}
                  className="btn btn-ghost btn-sm"
                  style={{ fontSize: '.72rem' }}
                >
                  Peruuta
                </button>
                <button
                  onClick={() => setConfirming(true)}
                  disabled={!nameMatches}
                  style={{
                    fontSize: '.72rem', padding: '.35rem .7rem', borderRadius: 'var(--r)',
                    background: nameMatches ? 'var(--red)' : 'var(--elev)',
                    color: nameMatches ? '#fff' : 'var(--t3)',
                    border: `1px solid ${nameMatches ? 'var(--red)' : 'var(--border)'}`,
                    cursor: nameMatches ? 'pointer' : 'not-allowed', fontWeight: 700,
                  }}
                >
                  Jatka
                </button>
              </div>
            </div>
          )}

          {armed && confirming && (
            <div style={{
              padding: '.85rem 1rem', background: 'rgba(239,68,68,.1)',
              border: '1px solid rgba(239,68,68,.4)', borderRadius: 'var(--r)',
            }}>
              <div style={{ fontSize: '.85rem', fontWeight: 700, color: 'var(--red)', marginBottom: '.35rem' }}>
                Oletko aivan varma?
              </div>
              <div style={{ fontSize: '.74rem', color: 'var(--t2)', marginBottom: '.6rem', lineHeight: 1.5 }}>
                Tämä poistaa <b>{org.name}</b>-organisaation pysyvästi. Kaikki moduulit, tehtävät, projektit, apurahat ja muut tiedot katoavat. <b>Tätä ei voi perua.</b>
              </div>
              <div style={{ display: 'flex', gap: '.4rem' }}>
                <button
                  onClick={() => setConfirming(false)}
                  className="btn btn-ghost btn-sm"
                  style={{ fontSize: '.72rem' }}
                  disabled={busy}
                >
                  Takaisin
                </button>
                <button
                  onClick={doDelete}
                  disabled={busy}
                  style={{
                    fontSize: '.72rem', padding: '.35rem .7rem', borderRadius: 'var(--r)',
                    background: 'var(--red)', color: '#fff',
                    border: '1px solid var(--red)', cursor: busy ? 'wait' : 'pointer', fontWeight: 700,
                  }}
                >
                  {busy ? 'Poistetaan...' : `Poista ${org.name} pysyvästi`}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
