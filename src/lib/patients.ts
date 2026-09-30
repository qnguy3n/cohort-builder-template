import { browser } from '$app/environment';
import { readable, writable, type Readable } from 'svelte/store';
import { canonicalCui, canonicalizeCuis } from '$lib/ontology';
import type {
  PatientSummary,
  Sex,
  LifeStatus,
  Race,
  Ethnicity,
  ClinicalNote,
  LabResult,
  Encounter,
  TimelineEvent,
  Appointment,
  EligibilityClause,
  Study
} from './types';
import { HOSPITALS } from './hospitals';
import { SPONSOR_VIEW_ID } from './types';
import { SEED_STUDIES } from './mockData';

// ---- Configuration ----
const TOTAL_PATIENTS = 100_000;
const SEED = 0xc0_ff_ee; // fixed for demo stability

// ---- PRNG ----
function mulberry32(seed: number) {
  let t = seed >>> 0;
  return function () {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), t | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- Disorder profiles drive realistic CUI co-occurrence ----
type DisorderProfile = {
  cui: string;
  weight: number;
  ageMin: number;
  ageMax: number;
  meds: string[];
  assessments: string[];
  procedures: string[];
  geneticChance?: number;
  geneticCuis?: string[];
  comorbidityChance?: number;
  // Mortality risk multiplier (used in deceased status sampling)
  mortality: number;
};

const DISORDERS: DisorderProfile[] = [
  {
    cui: 'C0030567', weight: 25, ageMin: 50, ageMax: 90,
    meds: ['C0007297', 'C0085208', 'C0034155'],
    assessments: ['C4076697', 'C2963144', 'C3489472'],
    procedures: ['C0085128'],
    geneticChance: 0.05, geneticCuis: ['C1430218', 'C1414336'],
    comorbidityChance: 0.30, mortality: 0.20
  },
  {
    cui: 'C0002395', weight: 20, ageMin: 65, ageMax: 95,
    meds: ['C0006012', 'C0078760'],
    assessments: ['C3489472', 'C3489470'],
    procedures: [],
    comorbidityChance: 0.40, mortality: 0.35
  },
  {
    cui: 'C0338656', weight: 8, ageMin: 55, ageMax: 90,
    meds: [], assessments: ['C3489472', 'C3489470'], procedures: [],
    comorbidityChance: 0.15, mortality: 0.05
  },
  {
    cui: 'C0026769', weight: 12, ageMin: 20, ageMax: 65,
    meds: ['C0021461', 'C2348070'],
    assessments: ['C4304635'], procedures: [],
    comorbidityChance: 0.10, mortality: 0.03
  },
  {
    cui: 'C0002736', weight: 2, ageMin: 40, ageMax: 80,
    meds: ['C0040051'],
    assessments: ['C0024204'], procedures: [],
    geneticChance: 0.10, geneticCuis: ['C1334407'],
    comorbidityChance: 0.05, mortality: 0.55
  },
  {
    cui: 'C0014544', weight: 14, ageMin: 5, ageMax: 80,
    meds: ['C0022977'], assessments: [], procedures: [],
    comorbidityChance: 0.20, mortality: 0.04
  },
  {
    cui: 'C0014534', weight: 4, ageMin: 18, ageMax: 70,
    meds: ['C0022977'], assessments: [], procedures: [],
    comorbidityChance: 0.20, mortality: 0.05
  },
  {
    cui: 'C0038454', weight: 14, ageMin: 50, ageMax: 95,
    meds: [], assessments: [], procedures: [],
    comorbidityChance: 0.50, mortality: 0.25
  },
  {
    cui: 'C0149931', weight: 18, ageMin: 18, ageMax: 65,
    meds: ['C0042972'], assessments: [], procedures: [],
    comorbidityChance: 0.10, mortality: 0.005
  },
  {
    cui: 'C1660797', weight: 4, ageMin: 25, ageMax: 60,
    meds: ['C0042972', 'C2611693'], assessments: [], procedures: [],
    comorbidityChance: 0.10, mortality: 0.005
  },
  {
    cui: 'C0020179', weight: 1, ageMin: 30, ageMax: 70,
    meds: [], assessments: ['C4076697', 'C3489472'], procedures: [],
    geneticChance: 1.0, geneticCuis: ['C1414403'],
    comorbidityChance: 0.05, mortality: 0.30
  },
  {
    cui: 'C0026896', weight: 2, ageMin: 18, ageMax: 80,
    meds: ['C0028978'], assessments: [], procedures: ['C0030672'],
    comorbidityChance: 0.10, mortality: 0.05
  },
  {
    cui: 'C1306006', weight: 1, ageMin: 20, ageMax: 60,
    meds: ['C2348070'], assessments: ['C4304635'], procedures: ['C0030672'],
    comorbidityChance: 0.05, mortality: 0.04
  },
  {
    cui: 'C0018378', weight: 1, ageMin: 18, ageMax: 80,
    meds: [], assessments: [], procedures: ['C0030672'],
    comorbidityChance: 0.05, mortality: 0.05
  },
  {
    cui: 'C0040820', weight: 3, ageMin: 40, ageMax: 80,
    meds: ['C0022977'], assessments: [], procedures: ['C0017067'],
    comorbidityChance: 0.10, mortality: 0.02
  },
  {
    cui: 'C0014877', weight: 9, ageMin: 40, ageMax: 90,
    meds: [], assessments: [], procedures: ['C0085128', 'C4087108'],
    comorbidityChance: 0.20, mortality: 0.05
  },
  {
    cui: 'C0035258', weight: 8, ageMin: 30, ageMax: 80,
    meds: ['C0085208'], assessments: [], procedures: [],
    comorbidityChance: 0.20, mortality: 0.02
  },
  {
    cui: 'C0031117', weight: 12, ageMin: 40, ageMax: 90,
    meds: [], assessments: [], procedures: [],
    comorbidityChance: 0.40, mortality: 0.10
  },
  {
    cui: 'C0085584', weight: 1, ageMin: 20, ageMax: 60,
    meds: [], assessments: [], procedures: [],
    comorbidityChance: 0.05, mortality: 0.005
  },
  {
    cui: 'C0011269', weight: 1, ageMin: 30, ageMax: 80,
    meds: [], assessments: [], procedures: [],
    comorbidityChance: 0.10, mortality: 0.10
  },
  {
    cui: 'C0085593', weight: 0.3, ageMin: 1, ageMax: 50,
    meds: [], assessments: [], procedures: [],
    geneticChance: 1.0, geneticCuis: ['C1414581'],
    comorbidityChance: 0.05, mortality: 0.30
  }
];

const TOTAL_DISORDER_WEIGHT = DISORDERS.reduce((s, d) => s + d.weight, 0);

const HOSPITAL_WEIGHTS_TOTAL = HOSPITALS.reduce((s, h) => s + h.weight, 0);

// Build cumulative weight tables once
const DISORDER_CUM: number[] = [];
{
  let acc = 0;
  for (const d of DISORDERS) {
    acc += d.weight;
    DISORDER_CUM.push(acc);
  }
}

const HOSPITAL_CUM: number[] = [];
{
  let acc = 0;
  for (const h of HOSPITALS) {
    acc += h.weight;
    HOSPITAL_CUM.push(acc);
  }
}

function pickWeighted<T>(items: T[], cum: number[], total: number, r: number): T {
  const t = r * total;
  for (let i = 0; i < cum.length; i++) {
    if (t < cum[i]) return items[i];
  }
  return items[items.length - 1];
}

function pickFrom<T>(items: T[], rng: () => number): T {
  return items[Math.floor(rng() * items.length)];
}

// US-population-style distributions (rough). Independent of disorder.
const RACE_TABLE: Array<[Race, number]> = [
  ['White', 60],
  ['Black', 13],
  ['Asian', 7],
  ['AI/AN', 1],
  ['NH/PI', 0.3],
  ['Other', 4],
  ['Unknown', 14.7]
];
const RACE_CUM: number[] = [];
const RACE_TOTAL = (() => {
  let acc = 0;
  for (const [, w] of RACE_TABLE) {
    acc += w;
    RACE_CUM.push(acc);
  }
  return acc;
})();

const ETHNICITY_TABLE: Array<[Ethnicity, number]> = [
  ['Hispanic', 18],
  ['Non-Hispanic', 78],
  ['Unknown', 4]
];
const ETHNICITY_CUM: number[] = [];
const ETHNICITY_TOTAL = (() => {
  let acc = 0;
  for (const [, w] of ETHNICITY_TABLE) {
    acc += w;
    ETHNICITY_CUM.push(acc);
  }
  return acc;
})();

function pickRace(r: number): Race {
  const t = r * RACE_TOTAL;
  for (let i = 0; i < RACE_CUM.length; i++) if (t < RACE_CUM[i]) return RACE_TABLE[i][0];
  return RACE_TABLE[RACE_TABLE.length - 1][0];
}

function pickEthnicity(r: number): Ethnicity {
  const t = r * ETHNICITY_TOTAL;
  for (let i = 0; i < ETHNICITY_CUM.length; i++)
    if (t < ETHNICITY_CUM[i]) return ETHNICITY_TABLE[i][0];
  return ETHNICITY_TABLE[ETHNICITY_TABLE.length - 1][0];
}

// Mock name pool used only for demo PHI display under IRB gating.
const FIRST_NAMES_F = [
  'Sarah', 'Maria', 'Jennifer', 'Linda', 'Patricia', 'Elizabeth', 'Susan',
  'Margaret', 'Aisha', 'Priya', 'Mei', 'Yuki', 'Sofia', 'Anya', 'Camila',
  'Rachel', 'Amara', 'Isabella', 'Hannah', 'Olivia', 'Naomi', 'Fatima',
  'Daniela', 'Grace', 'Ruth'
];
const FIRST_NAMES_M = [
  'Michael', 'David', 'James', 'Robert', 'John', 'William', 'Thomas',
  'Daniel', 'Marcus', 'Carlos', 'Hiroshi', 'Wei', 'Andre', 'Omar',
  'Kenji', 'Mateo', 'Ravi', 'Idris', 'Samuel', 'Henry', 'Jamal',
  'Diego', 'Anthony', 'Elias', 'Noah'
];
const LAST_NAMES = [
  'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Martinez',
  'Anderson', 'Taylor', 'Thomas', 'Moore', 'Jackson', 'Martin', 'Lee',
  'Perez', 'Thompson', 'White', 'Lopez', 'Gonzalez', 'Wilson', 'Patel',
  'Nguyen', 'Kim', 'Chen', 'Singh', 'Khan', 'Okafor', 'Rodriguez',
  'Davis', 'Wright', 'Hall', 'Adams', 'Reyes', 'Morales', 'Cooper',
  'Bennett', 'Rivera'
];

function generateMrn(rng: () => number): string {
  // 7-digit zero-padded numeric MRN
  return Math.floor(rng() * 9_999_999)
    .toString()
    .padStart(7, '0');
}

// ---- Generate one summary deterministically ----
function generateSummary(idx: number): PatientSummary {
  const rng = mulberry32(SEED ^ (idx * 2654435761));

  const hospital = pickWeighted(HOSPITALS, HOSPITAL_CUM, HOSPITAL_WEIGHTS_TOTAL, rng());
  const primary = pickWeighted(DISORDERS, DISORDER_CUM, TOTAL_DISORDER_WEIGHT, rng());

  const cuis = new Set<string>();
  cuis.add(primary.cui);

  // Age within disorder window
  const age = Math.floor(primary.ageMin + rng() * (primary.ageMax - primary.ageMin));

  // Comorbidity (another disorder)
  if (primary.comorbidityChance && rng() < primary.comorbidityChance) {
    const co = pickWeighted(DISORDERS, DISORDER_CUM, TOTAL_DISORDER_WEIGHT, rng());
    if (co.cui !== primary.cui) cuis.add(co.cui);
  }

  // Medications: 0-2 from primary's list
  if (primary.meds.length) {
    const n = 1 + Math.floor(rng() * Math.min(2, primary.meds.length));
    for (let i = 0; i < n; i++) cuis.add(pickFrom(primary.meds, rng));
  }

  // Assessments: 0-2
  if (primary.assessments.length) {
    const n = Math.min(primary.assessments.length, 1 + Math.floor(rng() * 2));
    for (let i = 0; i < n; i++) cuis.add(pickFrom(primary.assessments, rng));
  }

  // Procedure: 10-20% chance if available
  if (primary.procedures.length && rng() < 0.15) {
    cuis.add(pickFrom(primary.procedures, rng));
  }

  // Genetics
  if (primary.geneticChance && primary.geneticCuis && rng() < primary.geneticChance) {
    cuis.add(pickFrom(primary.geneticCuis, rng));
  }

  // Common comorbidities (independent of primary disorder). Rates roughly
  // mirror US adult prevalence with mild age-skew on hypertension.
  if (rng() < 0.12) cuis.add('C0011860'); // Type 2 diabetes
  const htnRate = age >= 65 ? 0.40 : age >= 50 ? 0.30 : 0.12;
  if (rng() < htnRate) cuis.add('C0020538'); // Hypertension
  if (rng() < 0.05) cuis.add('C0018802'); // Heart failure
  if (rng() < 0.05) cuis.add('C0004238'); // Atrial fibrillation
  if (rng() < 0.04) cuis.add('C0024117'); // COPD
  if (rng() < 0.06) cuis.add('C1561643'); // CKD
  if (rng() < 0.03) cuis.add('C0006826'); // Active malignancy
  if (rng() < 0.08) cuis.add('C0011581'); // Major depression

  // Demographics — gender skew slightly by disorder
  const gender: Sex = rng() < 0.5 ? 'female' : 'male';
  const race = pickRace(rng());
  const ethnicity = pickEthnicity(rng());

  // Status — base mortality with age multiplier
  const ageBoost = age >= 75 ? 1.6 : age >= 65 ? 1.2 : 1.0;
  const deceased = rng() < primary.mortality * ageBoost;
  const status: LifeStatus = deceased ? 'deceased' : 'living';

  const zip = pickFrom(hospital.zipCodes, rng);
  const firstName = pickFrom(gender === 'female' ? FIRST_NAMES_F : FIRST_NAMES_M, rng);
  const lastName = pickFrom(LAST_NAMES, rng);
  const mrn = generateMrn(rng);

  // ~18% of living patients have an upcoming appointment in the next 60 days.
  let upcomingAppointment: Appointment | undefined;
  if (status === 'living' && rng() < 0.18) {
    const daysAhead = 1 + Math.floor(rng() * 60);
    const apptDate = new Date();
    apptDate.setHours(0, 0, 0, 0);
    apptDate.setDate(apptDate.getDate() + daysAhead);
    const types: Appointment['type'][] = [
      'Clinic visit',
      'Clinic visit',
      'Telehealth',
      'Lab draw'
    ];
    const reasonsByType: Record<Appointment['type'], string[]> = {
      'Clinic visit': [
        'Routine follow-up',
        'Symptom check-in',
        'Medication review',
        'Imaging review'
      ],
      Telehealth: ['Phone check-in', 'Video follow-up', 'Medication titration'],
      Procedure: ['Lumbar puncture', 'Botulinum toxin injection', 'EMG'],
      'Lab draw': ['Routine labs', 'Therapeutic drug monitoring', 'Pre-procedure panel']
    };
    const t = pickFrom(types, rng);
    upcomingAppointment = {
      date: apptDate.toISOString().slice(0, 10),
      type: t,
      reason: pickFrom(reasonsByType[t], rng)
    };
  }

  return {
    index: idx,
    patientId: `pat-${(idx + 1).toString().padStart(7, '0')}`,
    hospitalId: hospital.id,
    firstName,
    lastName,
    mrn,
    age,
    gender,
    race,
    ethnicity,
    state: hospital.state,
    zip,
    status,
    primaryConditionCui: canonicalCui(primary.cui),
    // Canonicalize so mock patients share one CUI per concept with the ontology
    // (and thus with study criteria) — otherwise AND-matching can't line up.
    cuis: canonicalizeCuis(Array.from(cuis)),
    upcomingAppointment
  };
}

// ---- Lazy materialization of all summaries + inverted index ----
type PatientStore = {
  summaries: PatientSummary[];
  byCui: Map<string, number[]>;
  byHospital: Map<string, number[]>;
  /** Map<yyyy-mm-dd, patient indices> for upcoming appointments. */
  byApptDate: Map<string, number[]>;
  total: number;
};

let cache: PatientStore | null = null;

// ---- Live (real-EHR) patients injected from the server ----
// Real patients for the connected institution are loaded async from the SQLite
// store and injected here. They are appended to the synthetic store at indices
// >= TOTAL_PATIENTS and indexed by hospital + CUI, so searchPatients / getCounts
// / study matching all work for the live institution with no other changes.
let liveSummaries: PatientSummary[] = [];
const liveById = new Map<string, PatientSummary>();

/**
 * Bumps whenever live patients are (re)loaded. Pages should reference
 * `$liveDataVersion` in the reactive block that reads the store, so the list
 * recomputes when live data arrives even if no other dependency changed
 * (e.g. the live hospital is already active after a reload).
 */
export const liveDataVersion = writable(0);

/** Replace the set of live patients and rebuild the store on next access. */
export function setLiveSummaries(rows: PatientSummary[]): void {
  liveSummaries = rows.map((r, j) => ({ ...r, index: TOTAL_PATIENTS + j }));
  liveById.clear();
  for (const s of liveSummaries) liveById.set(s.patientId, s);
  cache = null; // force rebuild so the new patients are indexed
  liveDataVersion.update((n) => n + 1);
}

export function liveSummaryCount(): number {
  return liveSummaries.length;
}

export function getPatientStore(): PatientStore {
  if (cache) return cache;

  const summaries: PatientSummary[] = new Array(TOTAL_PATIENTS);
  const byCui = new Map<string, number[]>();
  const byHospital = new Map<string, number[]>();
  const byApptDate = new Map<string, number[]>();

  for (let i = 0; i < TOTAL_PATIENTS; i++) {
    const s = generateSummary(i);
    summaries[i] = s;

    let hList = byHospital.get(s.hospitalId);
    if (!hList) {
      hList = [];
      byHospital.set(s.hospitalId, hList);
    }
    hList.push(i);

    for (const cui of s.cuis) {
      let cList = byCui.get(cui);
      if (!cList) {
        cList = [];
        byCui.set(cui, cList);
      }
      cList.push(i);
    }

    if (s.upcomingAppointment) {
      const k = s.upcomingAppointment.date;
      let dList = byApptDate.get(k);
      if (!dList) {
        dList = [];
        byApptDate.set(k, dList);
      }
      dList.push(i);
    }
  }

  // Bias appointments toward study-matching patients so the calendar always
  // has demo-meaningful examples in the next ~2 weeks.
  seedStudyAppointments(summaries, byCui, byHospital, byApptDate);

  // Append live (real-EHR) patients and index them by hospital + CUI.
  for (const s of liveSummaries) {
    const idx = s.index; // assigned in setLiveSummaries (>= TOTAL_PATIENTS)
    summaries[idx] = s;

    let hList = byHospital.get(s.hospitalId);
    if (!hList) {
      hList = [];
      byHospital.set(s.hospitalId, hList);
    }
    hList.push(idx);

    for (const cui of s.cuis) {
      let cList = byCui.get(cui);
      if (!cList) {
        cList = [];
        byCui.set(cui, cList);
      }
      cList.push(idx);
    }
  }

  cache = {
    summaries,
    byCui,
    byHospital,
    byApptDate,
    total: TOTAL_PATIENTS + liveSummaries.length
  };
  return cache;
}

function seedStudyAppointments(
  summaries: PatientSummary[],
  byCui: Map<string, number[]>,
  byHospital: Map<string, number[]>,
  byApptDate: Map<string, number[]>
) {
  const now = Date.now();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (const study of SEED_STUDIES) {
    if (study.ownerId === SPONSOR_VIEW_ID) continue;
    const hospitalIdxs = byHospital.get(study.ownerId) ?? [];
    if (hospitalIdxs.length === 0) continue;
    const hospitalSet = new Set(hospitalIdxs);

    // Inclusion AND across the inverted index, scoped to hospital.
    const inc = canonicalizeCuis(study.inclusionCuis);
    if (inc.length === 0) continue;
    const lists = inc
      .map((c) => (byCui.get(c) ?? []).filter((i) => hospitalSet.has(i)))
      .sort((a, b) => a.length - b.length);
    if (lists[0].length === 0) continue;

    let candidates: number[] = lists[0].slice();
    for (let i = 1; i < lists.length; i++) {
      const set = new Set(lists[i]);
      candidates = candidates.filter((x) => set.has(x));
      if (candidates.length === 0) break;
    }

    // Apply exclusion CUIs
    if (study.exclusionCuis.length > 0) {
      const excl = new Set<number>();
      for (const c of canonicalizeCuis(study.exclusionCuis)) {
        for (const i of byCui.get(c) ?? []) excl.add(i);
      }
      candidates = candidates.filter((i) => !excl.has(i));
    }

    // Patient status filter
    if (study.patientStatus !== 'either') {
      candidates = candidates.filter((i) => summaries[i].status === study.patientStatus);
    }

    // Force ~8 study-matching patients to have an appointment within the
    // next 14 days, distributed across the workweek of those days.
    const targets = candidates.slice(0, 8);
    for (let n = 0; n < targets.length; n++) {
      const idx = targets[n];
      const s = summaries[idx];
      if (s.status !== 'living') continue;

      const apptDate = new Date(today);
      // Spread targets across days 1..14 deterministically by (idx + n)
      const daysAhead = 1 + (((idx + n * 3) % 14) + 1);
      apptDate.setDate(apptDate.getDate() + daysAhead);
      const dateKey = apptDate.toISOString().slice(0, 10);

      // Drop any existing appointment from the index
      if (s.upcomingAppointment?.date) {
        const old = byApptDate.get(s.upcomingAppointment.date);
        if (old) {
          const j = old.indexOf(idx);
          if (j >= 0) old.splice(j, 1);
          if (old.length === 0) byApptDate.delete(s.upcomingAppointment.date);
        }
      }

      s.upcomingAppointment = {
        date: dateKey,
        type: 'Clinic visit',
        reason: `Study screening · ${study.name}`
      };

      let lst = byApptDate.get(dateKey);
      if (!lst) {
        lst = [];
        byApptDate.set(dateKey, lst);
      }
      if (!lst.includes(idx)) lst.push(idx);
    }
    void now;
  }
}

export function appointmentsByDate(hospitalId?: string): Map<string, number[]> {
  const { byApptDate, byHospital, summaries } = getPatientStore();
  if (!hospitalId || hospitalId === SPONSOR_VIEW_ID) {
    return byApptDate;
  }
  const hSet = new Set(byHospital.get(hospitalId) ?? []);
  const out = new Map<string, number[]>();
  for (const [date, idxs] of byApptDate) {
    const filtered = idxs.filter((i) => hSet.has(i));
    if (filtered.length > 0) out.set(date, filtered);
  }
  // Sanity check
  void summaries;
  return out;
}

// ---- Search ----

export type PatientQuery = {
  cuis?: string[]; // require ALL of these
  hospitalId?: string; // exact hospital, or SPONSOR_VIEW_ID for all
  text?: string; // matches patientId, primary disorder label, or state
  ageMin?: number;
  ageMax?: number;
  gender?: Sex | 'any';
  status?: LifeStatus | 'any';
};

function intersectSorted(a: number[], b: number[]): number[] {
  const out: number[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      out.push(a[i]);
      i++;
      j++;
    } else if (a[i] < b[j]) i++;
    else j++;
  }
  return out;
}

export function searchPatients(q: PatientQuery): number[] {
  const { summaries, byCui, byHospital, total } = getPatientStore();

  // Start from the most selective set we can
  let candidates: number[] | null = null;

  // Hospital scoping (tenant isolation)
  if (q.hospitalId && q.hospitalId !== SPONSOR_VIEW_ID) {
    candidates = byHospital.get(q.hospitalId) ?? [];
  }

  // CUI ANDs
  if (q.cuis && q.cuis.length) {
    const lists = canonicalizeCuis(q.cuis)
      .map((c) => byCui.get(c) ?? [])
      .sort((a, b) => a.length - b.length);
    let acc = lists[0];
    for (let i = 1; i < lists.length; i++) acc = intersectSorted(acc, lists[i]);
    candidates = candidates ? intersectSorted(candidates, acc) : acc;
  }

  if (!candidates) {
    // No selective filter — scan-all but use indices array as proxy
    candidates = new Array(total);
    for (let i = 0; i < total; i++) candidates[i] = i;
  }

  // Per-record filters
  const text = q.text?.trim().toLowerCase();
  const ageMin = q.ageMin ?? 0;
  const ageMax = q.ageMax ?? 200;
  const gender = q.gender && q.gender !== 'any' ? q.gender : null;
  const status = q.status && q.status !== 'any' ? q.status : null;

  const out: number[] = [];
  for (let i = 0; i < candidates.length; i++) {
    const idx = candidates[i];
    const s = summaries[idx];
    if (s.age < ageMin || s.age > ageMax) continue;
    if (gender && s.gender !== gender) continue;
    if (status && s.status !== status) continue;
    if (text) {
      const hay = `${s.patientId} ${s.state} ${s.primaryConditionCui}`.toLowerCase();
      if (!hay.includes(text)) continue;
    }
    out.push(idx);
  }
  return out;
}

export function getSummary(idx: number): PatientSummary {
  return getPatientStore().summaries[idx];
}

// ---- Clause-aware matching ----

/** Apply ALL/ANY semantics over the union of selected CUIs across all clauses. */
function modeMatches(
  clauses: EligibilityClause[],
  cuiSet: Set<string>,
  mode: 'AND' | 'OR'
): boolean {
  const selected = Array.from(new Set(clauses.flatMap((c) => c.selectedCuis)));
  if (selected.length === 0) return true;
  if (mode === 'AND') {
    for (const c of selected) if (!cuiSet.has(c)) return false;
    return true;
  }
  for (const c of selected) if (cuiSet.has(c)) return true;
  return false;
}

/**
 * Disjunctive normal form: OR of AND-groups. True when ANY non-empty group has
 * ALL of its (canonical) CUIs present. This is the visual-grouping evaluator —
 * e.g. [[Mem, Phot], [Stroke]] ⇒ (Mem AND Phot) OR Stroke.
 */
function groupsSatisfied(groups: string[][] | undefined, cuiSet: Set<string>): boolean {
  if (!groups || groups.length === 0) return false;
  return groups.some(
    (g) => g.length > 0 && g.every((c) => cuiSet.has(canonicalCui(c)))
  );
}

/** Walk an ordered list of CUIs, applying per-CUI connectors left-to-right. */
function chainMatches(
  ordered: string[],
  connectors: Record<string, 'AND' | 'OR'>,
  cuiSet: Set<string>,
  defaultOp: 'AND' | 'OR'
): boolean {
  if (ordered.length === 0) return true;
  let acc = cuiSet.has(ordered[0]);
  for (let i = 1; i < ordered.length; i++) {
    const cui = ordered[i];
    const op = connectors[cui] ?? defaultOp;
    const b = cuiSet.has(cui);
    acc = op === 'AND' ? acc && b : acc || b;
  }
  return acc;
}

/**
 * Match a study against the patient population using clause-based eligibility
 * when available, falling back to legacy flat CUI arrays otherwise.
 */
export function matchStudyForStudy(study: Study, hospitalId?: string): number[] {
  const { summaries, byHospital, total } = getPatientStore();

  // Hospital scoping
  let candidates: number[];
  if (hospitalId && hospitalId !== SPONSOR_VIEW_ID) {
    candidates = (byHospital.get(hospitalId) ?? []).slice();
  } else {
    candidates = new Array(total);
    for (let i = 0; i < total; i++) candidates[i] = i;
  }

  const useClauses = !!(
    study.inclusionClauses?.length ||
    study.exclusionClauses?.length ||
    study.inclusionGroups?.length ||
    study.exclusionGroups?.length
  );

  if (!useClauses) {
    // Fall back to legacy AND/AND-NOT semantics
    return matchStudy(
      study.inclusionCuis,
      study.exclusionCuis,
      study.patientStatus,
      hospitalId
    );
  }

  const incMode = study.inclusionMode ?? 'AND';
  const excMode = study.exclusionMode ?? 'OR';
  // Prefer the saved chain order; otherwise derive from clauses' selectedCuis.
  const incSel =
    study.inclusionOrder && study.inclusionOrder.length
      ? study.inclusionOrder
      : study.inclusionClauses
        ? Array.from(new Set(study.inclusionClauses.flatMap((c) => c.selectedCuis)))
        : [];
  const excSel =
    study.exclusionOrder && study.exclusionOrder.length
      ? study.exclusionOrder
      : study.exclusionClauses
        ? Array.from(new Set(study.exclusionClauses.flatMap((c) => c.selectedCuis)))
        : [];
  const incConns = study.inclusionConnectors ?? {};
  const excConns = study.exclusionConnectors ?? {};
  const useIncChain = !!(study.inclusionOrder && study.inclusionOrder.length);
  const useExcChain = !!(study.exclusionOrder && study.exclusionOrder.length);
  const demo: DemographicConstraints = {
    ageMin: study.ageMin,
    ageMax: study.ageMax,
    gender: study.genderConstraint,
    races: study.raceConstraint,
    ethnicities: study.ethnicityConstraint
  };

  return candidates.filter((idx) => {
    const p = summaries[idx];
    if (study.patientStatus !== 'either' && p.status !== study.patientStatus) return false;
    if (!passesDemographics(p, demo)) return false;
    const cuiSet = new Set(p.cuis);
    // Inclusion: visual groups (DNF) take precedence over the legacy chain.
    if (study.inclusionGroups?.length) {
      if (!groupsSatisfied(study.inclusionGroups, cuiSet)) return false;
    } else if (incSel.length > 0) {
      if (useIncChain) {
        if (!chainMatches(incSel, incConns, cuiSet, incMode)) return false;
      } else {
        const ok = incMode === 'AND'
          ? incSel.every((c) => cuiSet.has(c))
          : incSel.some((c) => cuiSet.has(c));
        if (!ok) return false;
      }
    }
    // Exclusion: any satisfied exclusion group → excluded.
    if (study.exclusionGroups?.length) {
      if (groupsSatisfied(study.exclusionGroups, cuiSet)) return false;
    } else if (excSel.length > 0) {
      if (useExcChain) {
        if (chainMatches(excSel, excConns, cuiSet, excMode)) return false;
      } else {
        const matches = excMode === 'AND'
          ? excSel.every((c) => cuiSet.has(c))
          : excSel.some((c) => cuiSet.has(c));
        if (matches) return false;
      }
    }
    return true;
  });
}

export type DemographicConstraints = {
  ageMin?: number;
  ageMax?: number;
  gender?: Sex;
  races?: Race[];
  ethnicities?: Ethnicity[];
};

function passesDemographics(p: PatientSummary, d: DemographicConstraints | undefined): boolean {
  if (!d) return true;
  if (d.ageMin != null && p.age < d.ageMin) return false;
  if (d.ageMax != null && p.age > d.ageMax) return false;
  if (d.gender && p.gender !== d.gender) return false;
  if (d.races && d.races.length && !d.races.includes(p.race)) return false;
  if (d.ethnicities && d.ethnicities.length && !d.ethnicities.includes(p.ethnicity)) return false;
  return true;
}

/** Live preview during editing — accepts working clauses without a full Study object.
 *  When `inclusionOrder`/`exclusionOrder` is provided alongside connectors, the
 *  matcher uses the per-CUI chain instead of mode-based ALL/ANY. */
export function previewMatchCount(
  inclusionClauses: EligibilityClause[],
  exclusionClauses: EligibilityClause[],
  patientStatus: 'living' | 'deceased' | 'either',
  hospitalId?: string,
  demographics?: DemographicConstraints,
  inclusionMode: 'AND' | 'OR' = 'AND',
  exclusionMode: 'AND' | 'OR' = 'OR',
  inclusionOrder?: string[],
  exclusionOrder?: string[],
  inclusionConnectors: Record<string, 'AND' | 'OR'> = {},
  exclusionConnectors: Record<string, 'AND' | 'OR'> = {},
  inclusionGroups?: string[][],
  exclusionGroups?: string[][]
): number {
  const { summaries, byHospital, total } = getPatientStore();
  let candidates: number[];
  if (hospitalId && hospitalId !== SPONSOR_VIEW_ID) {
    candidates = byHospital.get(hospitalId) ?? [];
  } else {
    candidates = new Array(total);
    for (let i = 0; i < total; i++) candidates[i] = i;
  }
  // Always derive constraint from the selected union — if nothing's selected,
  // there is no constraint on that side.
  const incSel = inclusionOrder && inclusionOrder.length
    ? inclusionOrder
    : Array.from(new Set(inclusionClauses.flatMap((c) => c.selectedCuis)));
  const excSel = exclusionOrder && exclusionOrder.length
    ? exclusionOrder
    : Array.from(new Set(exclusionClauses.flatMap((c) => c.selectedCuis)));
  const useIncChain = !!(inclusionOrder && inclusionOrder.length);
  const useExcChain = !!(exclusionOrder && exclusionOrder.length);

  let count = 0;
  for (const idx of candidates) {
    const p = summaries[idx];
    if (patientStatus !== 'either' && p.status !== patientStatus) continue;
    if (!passesDemographics(p, demographics)) continue;
    const cuiSet = new Set(p.cuis);
    // Inclusion: visual groups (DNF) take precedence over the legacy chain.
    if (inclusionGroups?.length) {
      if (!groupsSatisfied(inclusionGroups, cuiSet)) continue;
    } else if (incSel.length > 0) {
      if (useIncChain) {
        if (!chainMatches(incSel, inclusionConnectors, cuiSet, inclusionMode)) continue;
      } else {
        const ok = inclusionMode === 'AND'
          ? incSel.every((c) => cuiSet.has(c))
          : incSel.some((c) => cuiSet.has(c));
        if (!ok) continue;
      }
    }
    // Exclusion: any satisfied exclusion group → excluded.
    if (exclusionGroups?.length) {
      if (groupsSatisfied(exclusionGroups, cuiSet)) continue;
    } else if (excSel.length > 0) {
      if (useExcChain) {
        if (chainMatches(excSel, exclusionConnectors, cuiSet, exclusionMode)) continue;
      } else {
        const matches = exclusionMode === 'AND'
          ? excSel.every((c) => cuiSet.has(c))
          : excSel.some((c) => cuiSet.has(c));
        if (matches) continue;
      }
    }
    count++;
  }
  return count;
}

export function getSummaryByPatientId(patientId: string): PatientSummary | null {
  // Live (real-EHR) patients use opaque UUID ids — look them up directly.
  const live = liveById.get(patientId);
  if (live) return live;
  // patientId format: pat-NNNNNNN (1-indexed)
  const m = patientId.match(/^pat-(\d{7})$/);
  if (!m) return null;
  const idx = parseInt(m[1], 10) - 1;
  if (idx < 0 || idx >= TOTAL_PATIENTS) return null;
  return getPatientStore().summaries[idx];
}

// ---- Full patient detail (notes, encounters, labs) ----

const PROVIDERS = [
  'Dr. Maya Chen, MD',
  'Dr. Rohan Patel, MD',
  'Dr. Sofia Alvarez, MD',
  'Jordan Kim, NP',
  'Priya Iyer, NP',
  'Dr. Marcus Webb, MD',
  'Dr. Hannah Liu, MD',
  'Dr. Daniel Okafor, MD'
];

type NoteTemplate = {
  intro: string;
  exam: string;
  plan: string;
  cuis: string[];
};

// Disorder-specific note templates. Body text references CUI labels so the
// runtime can highlight extracted concepts in the rendered note.
const NOTE_TEMPLATES: Record<string, NoteTemplate> = {
  C0030567: {
    intro:
      "Patient is a [AGE]-year-old [SEX] with a longstanding diagnosis of Parkinson's disease, returning for routine movement disorders follow-up. Reports increased OFF time in the late afternoon despite stable Carbidopa/Levodopa dosing.",
    exam:
      'On examination today, MDS-UPDRS Part III scored 28 in the OFF state, improved to 17 after a Carbidopa/Levodopa challenge. Hoehn and Yahr stage 2.5. Mild bradykinesia of the right upper extremity, postural tremor preserved. MoCA today was 26.',
    plan:
      'Continue Carbidopa/Levodopa at current dose. Add Rasagiline 1mg daily for motor fluctuations. Discussed candidacy for Deep brain stimulation given progression; referral placed. Repeat MDS-UPDRS at 3-month follow-up.',
    cuis: ['C0030567', 'C0007297', 'C0034155', 'C4076697', 'C2963144', 'C3489472', 'C0085128']
  },
  C0002395: {
    intro:
      "Patient is a [AGE]-year-old [SEX] with a known diagnosis of Alzheimer's disease, accompanied by family. Family reports gradual worsening in word-finding and short-term memory over the past 6 months.",
    exam:
      'Mini-Mental State Examination today scored 21/30 (down from 24 six months ago). Montreal Cognitive Assessment scored 18. Patient is alert, oriented to person and place but not date. No focal motor deficits.',
    plan:
      'Continue Donepezil 10mg daily; increase Memantine to 10mg BID. Counseled family on safety planning and driving cessation. Refer to neuropsychology for full battery. Recheck in 6 months.',
    cuis: ['C0002395', 'C0006012', 'C0078760', 'C3489470', 'C3489472']
  },
  C0338656: {
    intro:
      'Patient is a [AGE]-year-old [SEX] referred for evaluation of memory complaints. Subjective decline reported by patient and partner over the past year. Independent in IADLs.',
    exam:
      'Montreal Cognitive Assessment scored 24 today (1.5 SD below age/education-adjusted norms). MMSE 27/30. Findings most consistent with amnestic-predominant mild cognitive impairment.',
    plan:
      'Discussed diagnosis of mild cognitive impairment. Reviewed lifestyle modifications. Order brain MRI and serum studies. No pharmacotherapy at this time. Re-evaluate in 6 months.',
    cuis: ['C0338656', 'C3489472', 'C3489470']
  },
  C0026769: {
    intro:
      'Patient is a [AGE]-year-old [SEX] with relapsing-remitting Multiple sclerosis diagnosed 6 years ago. On Interferon beta therapy with intermittent breakthrough activity.',
    exam:
      'Expanded Disability Status Scale assessed today at 3.5. New right-sided lower extremity paresthesia for 2 weeks. Cerebellar exam unremarkable. Recent MRI shows two new T2 lesions.',
    plan:
      'Switch to Ocrelizumab given continued radiographic activity. Pre-medication protocol reviewed. Counseling on infusion-related risks. Continue physical therapy. Repeat MRI in 6 months.',
    cuis: ['C0026769', 'C0021461', 'C2348070', 'C4304635']
  },
  C0002736: {
    intro:
      'Patient is a [AGE]-year-old [SEX] with limb-onset Amyotrophic lateral sclerosis confirmed via EMG and clinical exam. Genetic testing positive for SOD1 pathogenic variant.',
    exam:
      'ALS Functional Rating Scale (ALSFRS-R) scored 38 today (down 4 points over the past 3 months). Bulbar function preserved. Forced vital capacity at 78% predicted.',
    plan:
      'Continue Riluzole 50mg BID. Discussed enrollment in SOD1 antisense oligonucleotide open-label extension; counseled on consent. Refer to multidisciplinary clinic for nutrition and PT/OT. Pulmonary follow-up in 3 months.',
    cuis: ['C0002736', 'C0040051', 'C0024204', 'C1334407']
  },
  C0014544: {
    intro:
      'Patient is a [AGE]-year-old [SEX] with focal Epilepsy, reporting two breakthrough seizures over the past 6 weeks despite Levetiracetam at maximum tolerated dose.',
    exam:
      'No interval focal deficits on neurologic exam. Speech and gait normal. Patient confirms medication adherence; no clear precipitating triggers.',
    plan:
      'Diagnosis: drug-resistant focal epilepsy. Add adjunctive therapy. Refer to comprehensive epilepsy center for video EEG monitoring and surgical evaluation. Driving restrictions reinforced.',
    cuis: ['C0014544', 'C0014534', 'C0022977']
  },
  C0149931: {
    intro:
      'Patient is a [AGE]-year-old [SEX] with chronic migraine, averaging 18 headache days per month over the prior 3 months despite acute therapy with Sumatriptan.',
    exam:
      'Neurologic exam unremarkable. No papilledema. Headache calendar reviewed. Tender pericranial muscles bilaterally.',
    plan:
      'Initiate anti-CGRP monoclonal antibody (Erenumab) 70mg monthly. Counseled on acute medication overuse risk. Continue magnesium and riboflavin. Follow up in 12 weeks with headache diary.',
    cuis: ['C0149931', 'C1660797', 'C0042972', 'C2611693']
  },
  C0038454: {
    intro:
      'Patient is a [AGE]-year-old [SEX] post acute ischemic stroke (LVO of the left M1 segment) status post mechanical thrombectomy 4 months ago. Presents for stroke clinic follow-up.',
    exam:
      'NIHSS today is 2 (down from 14 at presentation). Mild expressive aphasia and right pronator drift. Modified Rankin Scale 2.',
    plan:
      'Continue dual antiplatelet therapy and high-intensity statin. Aggressive risk factor management; A1C goal <7. Continue speech therapy. MRA in 6 months. Carotid duplex annually.',
    cuis: ['C0038454']
  },
  C0014877: {
    intro:
      'Patient is a [AGE]-year-old [SEX] with Essential tremor refractory to propranolol and primidone. Presents to discuss procedural options.',
    exam:
      'Bilateral postural and kinetic tremor of upper extremities, right > left. CRST score 24. No bradykinesia or rigidity.',
    plan:
      'Reviewed candidacy for MR-guided focused ultrasound thalamotomy versus Deep brain stimulation. Patient prefers focused ultrasound; placed referral. Continue current medications until procedure.',
    cuis: ['C0014877', 'C4087108', 'C0085128']
  }
};

const GENERIC_TEMPLATE: NoteTemplate = {
  intro:
    'Patient is a [AGE]-year-old [SEX] presenting for routine neurology follow-up. No acute concerns reported by patient or caregivers.',
  exam: 'Neurologic exam stable from prior. No focal deficits.',
  plan: 'Continue current management. Routine follow-up in 6 months. Patient educated on warning signs.',
  cuis: []
};

function pickTemplate(primaryCui: string): NoteTemplate {
  return NOTE_TEMPLATES[primaryCui] ?? GENERIC_TEMPLATE;
}

function fillNote(template: NoteTemplate, age: number, sex: Sex): string {
  const sexWord = sex === 'female' ? 'woman' : 'man';
  const fill = (s: string) => s.replace('[AGE]', String(age)).replace('[SEX]', sexWord);
  return `${fill(template.intro)}\n\n${fill(template.exam)}\n\n${fill(template.plan)}`;
}

function generateNotes(
  rng: () => number,
  age: number,
  sex: Sex,
  primaryCui: string
): ClinicalNote[] {
  const template = pickTemplate(primaryCui);
  const noteCount = 2 + Math.floor(rng() * 3); // 2-4 notes
  const notes: ClinicalNote[] = [];
  const types: ClinicalNote['noteType'][] = [
    'Initial consult',
    'Progress note',
    'Progress note',
    'Telehealth'
  ];
  // Spread dates across the past ~24 months
  const now = Date.now();
  for (let i = 0; i < noteCount; i++) {
    const monthsAgo = Math.floor(2 + rng() * 22 + i * 4); // older as i grows
    const d = new Date(now - monthsAgo * 30 * 24 * 60 * 60 * 1000);
    notes.push({
      id: `note-${i}`,
      date: d.toISOString(),
      author: pickFrom(PROVIDERS, rng),
      noteType: types[i % types.length],
      body: fillNote(template, age, sex),
      extractedCuis: template.cuis
    });
  }
  return notes.sort((a, b) => b.date.localeCompare(a.date));
}

function generateEncounters(
  rng: () => number,
  primaryCui: string
): Encounter[] {
  const count = 4 + Math.floor(rng() * 7); // 4-10
  const reasons = ['Routine follow-up', 'Symptom flare', 'Medication adjustment', 'Imaging review', 'Lab review', 'Telehealth check-in'];
  const types: Encounter['type'][] = ['Clinic visit', 'Clinic visit', 'Clinic visit', 'Telehealth', 'Procedure'];
  const out: Encounter[] = [];
  const now = Date.now();
  for (let i = 0; i < count; i++) {
    const monthsAgo = Math.floor(1 + rng() * 30);
    const d = new Date(now - monthsAgo * 30 * 24 * 60 * 60 * 1000);
    out.push({
      id: `enc-${i}`,
      date: d.toISOString(),
      type: pickFrom(types, rng),
      location: 'Neurology Clinic',
      reason: pickFrom(reasons, rng)
    });
  }
  // Procedure encounter for some disorders
  if ((primaryCui === 'C0014877' || primaryCui === 'C0030567') && rng() < 0.3) {
    const monthsAgo = Math.floor(rng() * 24);
    out.push({
      id: 'enc-proc',
      date: new Date(now - monthsAgo * 30 * 24 * 60 * 60 * 1000).toISOString(),
      type: 'Procedure',
      location: 'Functional Neurosurgery',
      reason: primaryCui === 'C0014877' ? 'MR-guided focused ultrasound thalamotomy' : 'Deep brain stimulation lead placement'
    });
  }
  return out.sort((a, b) => b.date.localeCompare(a.date));
}

const LAB_PANEL = [
  { code: '4548-4', name: 'HbA1c', units: '%', refLow: 4.0, refHigh: 5.7, mu: 5.4, sd: 0.6 },
  { code: '2823-3', name: 'Potassium', units: 'mmol/L', refLow: 3.5, refHigh: 5.0, mu: 4.2, sd: 0.3 },
  { code: '2160-0', name: 'Creatinine', units: 'mg/dL', refLow: 0.6, refHigh: 1.3, mu: 0.95, sd: 0.2 },
  { code: '777-3', name: 'Platelet count', units: 'K/uL', refLow: 150, refHigh: 400, mu: 250, sd: 40 },
  { code: '6690-2', name: 'WBC', units: 'K/uL', refLow: 4, refHigh: 11, mu: 7, sd: 1.5 },
  { code: '718-7', name: 'Hemoglobin', units: 'g/dL', refLow: 12, refHigh: 17, mu: 14, sd: 1.2 },
  { code: '2951-2', name: 'Sodium', units: 'mmol/L', refLow: 135, refHigh: 145, mu: 140, sd: 2 }
];

function gaussian(rng: () => number): number {
  // Box-Muller; cheap & good enough for mock data
  const u1 = Math.max(rng(), 1e-9);
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

function generateLabs(rng: () => number): LabResult[] {
  const out: LabResult[] = [];
  const now = Date.now();
  // 1-2 lab draws over the past 18 months
  const draws = 1 + Math.floor(rng() * 2);
  for (let d = 0; d < draws; d++) {
    const monthsAgo = Math.floor(1 + rng() * 18);
    const drawDate = new Date(now - monthsAgo * 30 * 24 * 60 * 60 * 1000).toISOString();
    for (const lab of LAB_PANEL) {
      const raw = lab.mu + gaussian(rng) * lab.sd;
      const value = Math.round(raw * 100) / 100;
      let flag: 'L' | 'H' | 'N' = 'N';
      if (lab.refLow != null && value < lab.refLow) flag = 'L';
      else if (lab.refHigh != null && value > lab.refHigh) flag = 'H';
      out.push({
        id: `lab-${d}-${lab.code}`,
        date: drawDate,
        code: lab.code,
        name: lab.name,
        value,
        units: lab.units,
        refLow: lab.refLow,
        refHigh: lab.refHigh,
        flag
      });
    }
  }
  return out.sort((a, b) => b.date.localeCompare(a.date));
}

export type PatientFullRecord = {
  summary: PatientSummary;
  notes: ClinicalNote[];
  encounters: Encounter[];
  labs: LabResult[];
  timeline: TimelineEvent[];
};

export function getFullPatient(idx: number): PatientFullRecord {
  const summary = getPatientStore().summaries[idx];
  // Re-derive a fresh rng seeded by index so detail data is deterministic and
  // independent of any prior generation calls.
  const rng = mulberry32((SEED ^ (idx * 2654435761)) ^ 0xdeadbeef);
  const notes = generateNotes(rng, summary.age, summary.gender, summary.primaryConditionCui);
  const encounters = generateEncounters(rng, summary.primaryConditionCui);
  const labs = generateLabs(rng);
  const timeline: TimelineEvent[] = [
    ...notes.map(
      (n): TimelineEvent => ({
        kind: 'note',
        id: n.id,
        date: n.date,
        author: n.author,
        noteType: n.noteType
      })
    ),
    ...encounters.map(
      (e): TimelineEvent => ({
        kind: 'encounter',
        id: e.id,
        date: e.date,
        type: e.type,
        reason: e.reason
      })
    ),
    ...labs.map(
      (l): TimelineEvent => ({
        kind: 'lab',
        id: l.id,
        date: l.date,
        name: l.name,
        value: l.value,
        units: l.units,
        flag: l.flag
      })
    )
  ].sort((a, b) => b.date.localeCompare(a.date));

  return { summary, notes, encounters, labs, timeline };
}

// Match a study against the patient population.
// Patient matches when:
//  - all inclusion CUIs are present (AND across the inverted index), AND
//  - no exclusion CUIs are present, AND
//  - life status is compatible with the study's patientStatus, AND
//  - patient belongs to the active hospital (or sponsor view = all)
export function matchStudy(
  inclusionCuisRaw: string[],
  exclusionCuisRaw: string[],
  studyPatientStatus: 'living' | 'deceased' | 'either',
  hospitalId?: string
): number[] {
  const { summaries, byCui, byHospital, total } = getPatientStore();
  // Canonicalize study CUIs so old/saved studies (with legacy mock codes) line
  // up with the canonical patient index.
  const inclusionCuis = canonicalizeCuis(inclusionCuisRaw);
  const exclusionCuis = canonicalizeCuis(exclusionCuisRaw);

  let candidates: number[];

  if (inclusionCuis.length > 0) {
    const lists = inclusionCuis
      .map((c) => byCui.get(c) ?? [])
      .sort((a, b) => a.length - b.length);
    candidates = lists[0].slice();
    for (let i = 1; i < lists.length; i++) {
      candidates = intersectSorted(candidates, lists[i]);
    }
  } else if (hospitalId && hospitalId !== SPONSOR_VIEW_ID) {
    candidates = (byHospital.get(hospitalId) ?? []).slice();
  } else {
    candidates = new Array(total);
    for (let i = 0; i < total; i++) candidates[i] = i;
  }

  // Apply hospital scoping (after inclusion if it was used)
  if (
    inclusionCuis.length > 0 &&
    hospitalId &&
    hospitalId !== SPONSOR_VIEW_ID
  ) {
    const hosp = byHospital.get(hospitalId) ?? [];
    candidates = intersectSorted(candidates, hosp);
  }

  // Exclusion CUIs: drop any patient that appears in any exclusion list
  if (exclusionCuis.length > 0) {
    const exclSet = new Set<number>();
    for (const c of exclusionCuis) {
      const list = byCui.get(c) ?? [];
      for (const idx of list) exclSet.add(idx);
    }
    candidates = candidates.filter((idx) => !exclSet.has(idx));
  }

  // Patient status filter
  if (studyPatientStatus !== 'either') {
    candidates = candidates.filter(
      (idx) => summaries[idx].status === studyPatientStatus
    );
  }

  return candidates;
}

export function getCounts(hospitalId?: string): {
  total: number;
  byCui: Array<{ cui: string; count: number }>;
  byHospital: Array<{ hospitalId: string; count: number }>;
} {
  const { summaries, byCui, byHospital } = getPatientStore();

  const useAll = !hospitalId || hospitalId === SPONSOR_VIEW_ID;
  const total = useAll
    ? summaries.length
    : (byHospital.get(hospitalId!) ?? []).length;

  const cuiCounts: Array<{ cui: string; count: number }> = [];
  if (useAll) {
    for (const [cui, list] of byCui) cuiCounts.push({ cui, count: list.length });
  } else {
    const hSet = new Set(byHospital.get(hospitalId!) ?? []);
    for (const [cui, list] of byCui) {
      let n = 0;
      for (const idx of list) if (hSet.has(idx)) n++;
      if (n > 0) cuiCounts.push({ cui, count: n });
    }
  }
  cuiCounts.sort((a, b) => b.count - a.count);

  const hospitalCounts: Array<{ hospitalId: string; count: number }> = [];
  for (const [hid, list] of byHospital) {
    hospitalCounts.push({ hospitalId: hid, count: list.length });
  }
  hospitalCounts.sort((a, b) => b.count - a.count);

  return { total, byCui: cuiCounts, byHospital: hospitalCounts };
}

// Loading store — emits true while building the initial index, then false.
export const patientsLoading: Readable<boolean> = readable<boolean>(true, (set) => {
  if (!browser) {
    set(false);
    return;
  }
  // Use a microtask + idle hint so the page can paint before the heavy build
  let cancelled = false;
  const run = () => {
    if (cancelled) return;
    getPatientStore();
    set(false);
  };
  // requestIdleCallback if present, else setTimeout
  const ric = (globalThis as any).requestIdleCallback as
    | ((cb: () => void, opts?: { timeout: number }) => number)
    | undefined;
  if (ric) ric(run, { timeout: 200 });
  else setTimeout(run, 0);
  return () => {
    cancelled = true;
  };
});

export const PATIENTS_TOTAL = TOTAL_PATIENTS;
