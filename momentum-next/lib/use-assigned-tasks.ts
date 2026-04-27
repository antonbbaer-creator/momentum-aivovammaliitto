'use client';

import { useEffect, useMemo, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from './firebase';
import { useAuth } from './auth';
import { AssignedTaskMirror } from './personal-shared';
import {
  OrgTeamMember,
  resolveUserMember,
  uniqueMembersByName,
} from './team-shared';
import {
  Assignable,
  effectiveStatus,
  getAssignees,
} from './assignments-shared';
import { getGrantsKey, getOrgTeamMembers } from './org-defaults';

interface MinimalTask extends Assignable {
  id: string;
  text: string;
  done?: boolean;
  deadline?: string;
  deletedAt?: number;
}

interface MinimalProject {
  id: string;
  t?: string;
  tasks?: MinimalTask[];
  archived?: boolean;
  deletedAt?: number;
}

interface MinimalGrant {
  id: string;
  name?: string;
  subtasks?: MinimalTask[];
  deletedAt?: number;
}

interface OrgState {
  orgId: string;
  orgName?: string;
  tasks: MinimalTask[];
  projects: MinimalProject[];
  grants: MinimalGrant[];
  members: OrgTeamMember[];
}

const parseV = <T,>(snapData: { v?: string } | undefined, fallback: T): T => {
  if (!snapData?.v) return fallback;
  try {
    return JSON.parse(snapData.v) as T;
  } catch {
    return fallback;
  }
};

/**
 * useAssignedTasks — aggregoi käyttäjälle osoitetut tehtävät kaikista orgeista
 * joihin hän kuuluu. Client-side: kuuntelee jokaisen orgin tasks/projects/grants
 * + orgTeamMembers ja resolvoi käyttäjän nimen kullekin orgille erikseen.
 *
 * Cloud Function `syncAssignedTasks` on saatavilla nopeampaa indeksointia varten,
 * mutta tämä client-toteutus toimii ilman deployta.
 */
export function useAssignedTasks(): {
  assigned: AssignedTaskMirror[];
  byOrg: Record<string, AssignedTaskMirror[]>;
  loading: boolean;
} {
  const { user, orgs } = useAuth();
  const [perOrg, setPerOrg] = useState<Record<string, OrgState>>({});
  const [loading, setLoading] = useState(true);

  // Stabiili lista orgId:istä JSONina, jotta useEffect ei laukea jokaisella
  // referenssin muutoksella mutta laukeaa kun org-lista oikeasti muuttuu.
  const orgsKey = useMemo(() => orgs.map(o => `${o.orgId}:${o.name}`).join('|'), [orgs]);

  useEffect(() => {
    if (!user || orgs.length === 0) {
      setPerOrg({});
      setLoading(false);
      return;
    }
    setLoading(true);

    const unsubs: Array<() => void> = [];
    // Alusta jokaisen orgin tila
    setPerOrg(() => {
      const init: Record<string, OrgState> = {};
      for (const o of orgs) {
        init[o.orgId] = {
          orgId: o.orgId,
          orgName: o.name,
          tasks: [],
          projects: [],
          grants: [],
          members: getOrgTeamMembers(o.orgId),
        };
      }
      return init;
    });

    let pendingFirstLoads = orgs.length * 4; // tasks, projects, grants, members per org

    const markLoaded = () => {
      pendingFirstLoads--;
      if (pendingFirstLoads <= 0) setLoading(false);
    };

    for (const o of orgs) {
      const orgId = o.orgId;
      const grantsKey = getGrantsKey(orgId);

      // tasks
      unsubs.push(onSnapshot(
        doc(db, 'organizations', orgId, 'data', 'tasks'),
        (snap) => {
          const arr = parseV<MinimalTask[]>(snap.data() as any, []);
          setPerOrg(prev => ({ ...prev, [orgId]: { ...prev[orgId], tasks: arr } }));
          markLoaded();
        },
        () => markLoaded(),
      ));

      // projects
      unsubs.push(onSnapshot(
        doc(db, 'organizations', orgId, 'data', 'projects'),
        (snap) => {
          const arr = parseV<MinimalProject[]>(snap.data() as any, []);
          setPerOrg(prev => ({ ...prev, [orgId]: { ...prev[orgId], projects: arr } }));
          markLoaded();
        },
        () => markLoaded(),
      ));

      // grants
      unsubs.push(onSnapshot(
        doc(db, 'organizations', orgId, 'data', grantsKey),
        (snap) => {
          const arr = parseV<MinimalGrant[]>(snap.data() as any, []);
          setPerOrg(prev => ({ ...prev, [orgId]: { ...prev[orgId], grants: arr } }));
          markLoaded();
        },
        () => markLoaded(),
      ));

      // members
      unsubs.push(onSnapshot(
        doc(db, 'organizations', orgId, 'data', 'orgTeamMembers'),
        (snap) => {
          const arr = parseV<OrgTeamMember[]>(snap.data() as any, getOrgTeamMembers(orgId));
          setPerOrg(prev => ({ ...prev, [orgId]: { ...prev[orgId], members: arr } }));
          markLoaded();
        },
        () => markLoaded(),
      ));
    }

    return () => {
      for (const u of unsubs) u();
    };
    // orgsKey reagoi orgs-listan muutoksiin sisällöllisesti
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, orgsKey]);

  // Aggregaatio
  const items = useMemo<AssignedTaskMirror[]>(() => {
    if (!user) return [];
    const out: AssignedTaskMirror[] = [];

    for (const state of Object.values(perOrg)) {
      const members = uniqueMembersByName(state.members || []);
      const me = resolveUserMember(members, user);
      const myName = me?.name || user.displayName || '';
      if (!myName) continue;

      const matchesMe = (t: Assignable): boolean => {
        const assignees = getAssignees(t);
        if (assignees.includes(myName)) return true;
        // varmuuden vuoksi: legacy assignee-kenttä jos getAssignees on tyhjä
        if (t.assignee === myName) return true;
        return false;
      };

      const visit = (
        t: MinimalTask,
        sourceType: AssignedTaskMirror['sourceType'],
        sourceId?: string,
      ) => {
        if (!t || !t.id || t.deletedAt || t.done) return;
        if (!matchesMe(t)) return;
        const status = effectiveStatus(t);
        // näytä vain pending + accepted; rejected suodatetaan UI:ssa
        out.push({
          compositeId: `${state.orgId}__${sourceType}__${sourceId || 'root'}__${t.id}`,
          orgId: state.orgId,
          orgName: state.orgName,
          sourceType,
          sourceId,
          taskId: t.id,
          text: t.text || '',
          deadline: t.deadline,
          status: status as AssignedTaskMirror['status'],
          done: !!t.done,
          deletedAt: t.deletedAt,
          assignedBy: t.assignedBy,
          updatedAt: Date.now(),
        });
      };

      for (const t of state.tasks || []) visit(t, 'task');
      for (const p of state.projects || []) {
        if (p.deletedAt || p.archived) continue;
        for (const t of p.tasks || []) visit(t, 'projectTask', p.id);
      }
      for (const g of state.grants || []) {
        if (g.deletedAt) continue;
        for (const s of g.subtasks || []) visit(s, 'grantSubtask', g.id);
      }
    }

    return out;
  }, [perOrg, user]);

  const assigned = useMemo(() => {
    return items
      .filter(t => !t.done && !t.deletedAt && t.status !== 'rejected')
      .sort((a, b) => {
        const ad = a.deadline || '9999';
        const bd = b.deadline || '9999';
        if (ad !== bd) return ad.localeCompare(bd);
        return (a.text || '').localeCompare(b.text || '');
      });
  }, [items]);

  const byOrg = useMemo(() => {
    const out: Record<string, AssignedTaskMirror[]> = {};
    for (const t of assigned) {
      if (!out[t.orgId]) out[t.orgId] = [];
      out[t.orgId].push(t);
    }
    return out;
  }, [assigned]);

  return { assigned, byOrg, loading };
}
