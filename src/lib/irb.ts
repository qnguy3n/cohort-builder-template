import { writable } from 'svelte/store';
import { browser } from '$app/environment';

const KEY = 'cohort-builder:irb-clearance:v1';

function load(): boolean {
  if (!browser) return false;
  try {
    return localStorage.getItem(KEY) === 'true';
  } catch {
    return false;
  }
}

function persist(v: boolean) {
  if (!browser) return;
  try {
    localStorage.setItem(KEY, v ? 'true' : 'false');
  } catch {}
}

function createStore() {
  const { subscribe, set, update } = writable<boolean>(load());
  return {
    subscribe,
    set: (v: boolean) => {
      persist(v);
      set(v);
    },
    toggle: () =>
      update((v) => {
        persist(!v);
        return !v;
      })
  };
}

export const irbCleared = createStore();
