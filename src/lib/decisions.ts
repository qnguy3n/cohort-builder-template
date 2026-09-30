import { writable, derived, type Readable } from 'svelte/store';
import { browser } from '$app/environment';

export type Decision = 'accepted' | 'rejected' | 'watchlisted';

// Map<studyId, Map<patientIndex, Decision>> — flattened to JSON-friendly shape
export type DecisionsMap = Record<string, Record<string, Decision>>;

const STORAGE_KEY = 'cohort-builder:decisions:v1';

function load(): DecisionsMap {
  if (!browser) return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as DecisionsMap) : {};
  } catch {
    return {};
  }
}

function persist(state: DecisionsMap) {
  if (!browser) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {}
}

function createStore() {
  const { subscribe, update } = writable<DecisionsMap>(load());

  return {
    subscribe,
    set(studyId: string, patientIdx: number, decision: Decision) {
      update((state) => {
        const studyMap = { ...(state[studyId] ?? {}) };
        studyMap[String(patientIdx)] = decision;
        const next = { ...state, [studyId]: studyMap };
        persist(next);
        return next;
      });
    },
    clear(studyId: string, patientIdx: number) {
      update((state) => {
        const studyMap = { ...(state[studyId] ?? {}) };
        delete studyMap[String(patientIdx)];
        const next = { ...state, [studyId]: studyMap };
        persist(next);
        return next;
      });
    },
    clearStudy(studyId: string) {
      update((state) => {
        const next = { ...state };
        delete next[studyId];
        persist(next);
        return next;
      });
    }
  };
}

export const decisions = createStore();

export function studyDecisions(studyId: string): Readable<Record<string, Decision>> {
  return derived(decisions, ($d) => $d[studyId] ?? {});
}
