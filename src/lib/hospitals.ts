import { writable } from 'svelte/store';
import { browser } from '$app/environment';
import type { Hospital } from './types';
import { SPONSOR_VIEW_ID } from './types';

export const HOSPITALS: Hospital[] = [
  { id: 'h-stanford', name: 'Stanford Neuroscience Institute', shortName: 'Stanford', state: 'CA', city: 'Stanford', lat: 37.4329, lng: -122.1742, zipCodes: ['94304','94305','94306','94301','94025','94027','94028','94022'], region: 'West', weight: 12, ehr: 'Epic' },
  { id: 'h-ucsf', name: 'UCSF Department of Neurology', shortName: 'UCSF', state: 'CA', city: 'San Francisco', lat: 37.7625, lng: -122.4581, zipCodes: ['94143','94117','94118','94121','94122','94110','94131'], region: 'West', weight: 10, ehr: 'Epic' },
  { id: 'h-ucla', name: 'UCLA Department of Neurology', shortName: 'UCLA', state: 'CA', city: 'Los Angeles', lat: 34.0667, lng: -118.4456, zipCodes: ['90024','90025','90064','90049','90095','90405','90291'], region: 'West', weight: 9, ehr: 'DrChrono' },
  { id: 'h-uw', name: 'University of Washington Neurology', shortName: 'UW Medicine', state: 'WA', city: 'Seattle', lat: 47.6498, lng: -122.3048, zipCodes: ['98104','98105','98115','98103','98109','98112'], region: 'West', weight: 7, ehr: 'Epic' },
  { id: 'h-mayo', name: 'Mayo Clinic Neurology', shortName: 'Mayo Clinic', state: 'MN', city: 'Rochester', lat: 44.0224, lng: -92.4662, zipCodes: ['55901','55902','55904','55905','55906'], region: 'Midwest', weight: 11, ehr: 'Epic' },
  { id: 'h-cleveland', name: 'Cleveland Clinic Neurological Institute', shortName: 'Cleveland Clinic', state: 'OH', city: 'Cleveland', lat: 41.5036, lng: -81.6213, zipCodes: ['44106','44104','44120','44118','44113','44109'], region: 'Midwest', weight: 11, ehr: 'Epic' },
  { id: 'h-northwestern', name: 'Northwestern Memorial Neurosciences', shortName: 'Northwestern', state: 'IL', city: 'Chicago', lat: 41.8950, lng: -87.6213, zipCodes: ['60611','60601','60614','60622','60618','60657'], region: 'Midwest', weight: 8, ehr: 'Practice Fusion' },
  { id: 'h-mgh', name: 'Mass General Hospital Neurology', shortName: 'Mass General', state: 'MA', city: 'Boston', lat: 42.3631, lng: -71.0686, zipCodes: ['02114','02118','02115','02116','02134','02139'], region: 'Northeast', weight: 10, ehr: 'Epic' },
  { id: 'h-jhh', name: 'Johns Hopkins Department of Neurology', shortName: 'Johns Hopkins', state: 'MD', city: 'Baltimore', lat: 39.2972, lng: -76.5934, zipCodes: ['21205','21218','21287','21202','21210','21231'], region: 'Northeast', weight: 9, ehr: 'Cerner' },
  { id: 'h-nyu', name: 'NYU Langone Neurology', shortName: 'NYU Langone', state: 'NY', city: 'New York', lat: 40.7421, lng: -73.9740, zipCodes: ['10016','10010','10003','10009','10128','10021'], region: 'Northeast', weight: 8, ehr: 'Cerner' },
  { id: 'h-houston', name: 'Houston Methodist Neurology', shortName: 'Houston Methodist', state: 'TX', city: 'Houston', lat: 29.7100, lng: -95.3994, zipCodes: ['77030','77025','77098','77019','77005','77007'], region: 'South', weight: 8, ehr: 'Athena' },
  { id: 'h-duke', name: 'Duke Neurology', shortName: 'Duke', state: 'NC', city: 'Durham', lat: 36.0072, lng: -78.9389, zipCodes: ['27710','27705','27707','27704','27703','27708'], region: 'South', weight: 7, ehr: 'DrChrono' },
  // Live connected institution (real EHR data via the ingestion -> ml pipeline).
  // weight: 0 => the synthetic generator never assigns mock patients to it, so it
  // shows ONLY the real patients injected into the store. Password-gated in the UI.
  { id: 'danielfranc-md', name: 'Daniel Franc MD PhD', shortName: 'Daniel Franc MD PhD', state: 'CA', city: 'Santa Monica', lat: 34.0195, lng: -118.4912, zipCodes: [], region: 'West', weight: 0, ehr: 'DrChrono' }
];

/** The password-gated, real-EHR institution. */
export const LIVE_HOSPITAL_ID = 'danielfranc-md';

export function isLiveHospital(id: string): boolean {
  return id === LIVE_HOSPITAL_ID;
}

export const HOSPITAL_BY_ID: Map<string, Hospital> = new Map(HOSPITALS.map((h) => [h.id, h]));

const ACTIVE_KEY = 'cohort-builder:active-hospital:v1';

function loadActive(): string {
  if (!browser) return HOSPITALS[0].id;
  try {
    const v = localStorage.getItem(ACTIVE_KEY);
    if (v && (v === SPONSOR_VIEW_ID || HOSPITAL_BY_ID.has(v))) return v;
  } catch {}
  return HOSPITALS[0].id;
}

function persist(id: string) {
  if (!browser) return;
  try {
    localStorage.setItem(ACTIVE_KEY, id);
  } catch {}
}

function createActiveHospitalStore() {
  const { subscribe, set } = writable<string>(loadActive());
  return {
    subscribe,
    set: (id: string) => {
      persist(id);
      set(id);
    }
  };
}

export const activeHospital = createActiveHospitalStore();

export function isSponsorView(id: string): boolean {
  return id === SPONSOR_VIEW_ID;
}

export function hospitalLabel(id: string): string {
  if (id === SPONSOR_VIEW_ID) return 'Sponsor view (all hospitals)';
  return HOSPITAL_BY_ID.get(id)?.name ?? id;
}

export function hospitalShortLabel(id: string): string {
  if (id === SPONSOR_VIEW_ID) return 'Sponsor view';
  return HOSPITAL_BY_ID.get(id)?.shortName ?? id;
}
