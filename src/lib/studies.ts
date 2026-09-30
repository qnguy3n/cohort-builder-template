import { writable } from 'svelte/store';
import { browser } from '$app/environment';
import type { Study } from './types';
import { SPONSOR_VIEW_ID } from './types';
import { SEED_STUDIES } from './mockData';

/**
 * Tenant-scoped visibility — strict isolation:
 *  - Sponsor view  → only sponsor-owned studies.
 *  - Hospital view → only that hospital's own studies. No cross-tenant access.
 *
 * The `published` flag now governs *intra*-hospital visibility (which doctors
 * inside that hospital network can see the study), not cross-hospital sharing.
 */
export function visibleStudiesFor(allStudies: Study[], activeHospital: string): Study[] {
  return allStudies.filter((s) => s.ownerId === activeHospital);
}

const STORAGE_KEY = 'cohort-builder:studies:v7';

function load(): Study[] {
  if (!browser) return SEED_STUDIES;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(SEED_STUDIES));
      return SEED_STUDIES;
    }
    return JSON.parse(raw) as Study[];
  } catch {
    return SEED_STUDIES;
  }
}

function persist(studies: Study[]) {
  if (!browser) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(studies));
  } catch {
    // ignore quota / private mode failures in POC
  }
}

function createStore() {
  const { subscribe, update, set } = writable<Study[]>(load());

  return {
    subscribe,
    add(study: Study) {
      update((studies) => {
        const next = [study, ...studies];
        persist(next);
        return next;
      });
    },
    replace(updated: Study) {
      update((studies) => {
        const next = studies.map((s) => (s.id === updated.id ? updated : s));
        persist(next);
        return next;
      });
    },
    remove(id: string) {
      update((studies) => {
        const next = studies.filter((s) => s.id !== id);
        persist(next);
        return next;
      });
    },
    reset() {
      persist(SEED_STUDIES);
      set(SEED_STUDIES);
    }
  };
}

export const studies = createStore();

export function newStudyId(): string {
  return `study-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}
