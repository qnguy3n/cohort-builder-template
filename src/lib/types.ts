export type PatientStatus = 'living' | 'deceased' | 'either';

export type TrialPhase =
  | 'Early Phase 1'
  | 'Phase 1'
  | 'Phase 1/Phase 2'
  | 'Phase 2'
  | 'Phase 2/Phase 3'
  | 'Phase 3'
  | 'Phase 4'
  | 'N/A';

export type EHRSystem = 'Epic' | 'Cerner' | 'Athena' | 'DrChrono' | 'Practice Fusion';

export type TeamMember = {
  id: string;
  name: string;
  role: string;
};

export type ClauseConnector = 'AND' | 'OR';

export type MeasurementOp = '>=' | '<=' | '>' | '<' | '=' | 'between';

export type Measurement = {
  /** CUI of the measured concept (lab/assessment). */
  cui: string;
  op: MeasurementOp;
  value: number;
  /** Upper bound for `between`. */
  max?: number;
  unit?: string;
};

export type EligibilityClause = {
  /** Original phrase the user typed (e.g. "Patient with PD on Sinemet"). */
  phrase: string;
  /** All CUIs the AI extracted from the phrase. */
  cuis: string[];
  /** Subset of cuis the user has explicitly selected as filters. */
  selectedCuis: string[];
  /** Operator joining this clause to the NEXT clause in the list. */
  connector?: ClauseConnector;
  /** Numeric measurements extracted from this phrase (e.g. "ANC ≥ 1500"). */
  measurements?: Measurement[];
};

export type Study = {
  id: string;
  name: string;
  summary?: string;
  /** Owning tenant. Either a hospital id (e.g. "h-stanford") or SPONSOR_VIEW_ID. */
  ownerId: string;
  nctId: string | null;
  patientStatus: PatientStatus;
  phase: TrialPhase;
  teamMemberIds: string[];
  department: string;
  /** When true, the study is shared with other doctors in the hospital network. */
  published: boolean;
  inclusionCriteria: string;
  exclusionCriteria: string;
  // Additive: structured CUI mappings for ML-driven matching against
  // patient documents. Free-text fields above remain the human-readable view.
  inclusionCuis: string[];
  exclusionCuis: string[];
  /** Phrase-grouped clauses with per-CUI selection.
   *  When present, takes precedence over the flat inclusionCuis / exclusionCuis. */
  inclusionClauses?: EligibilityClause[];
  exclusionClauses?: EligibilityClause[];
  /** Match mode for the union of selected inclusion CUIs (default AND). Legacy. */
  inclusionMode?: ClauseConnector;
  /** Match mode for the union of selected exclusion CUIs (default OR). Legacy. */
  exclusionMode?: ClauseConnector;
  /** Connector immediately BEFORE each selected CUI (i.e. how it joins the prior chip). */
  inclusionConnectors?: Record<string, ClauseConnector>;
  exclusionConnectors?: Record<string, ClauseConnector>;
  /** Ordered list of selected CUIs to preserve chain order across saves. */
  inclusionOrder?: string[];
  exclusionOrder?: string[];
  /** Visual grouping in disjunctive normal form: OR of AND-groups. When present,
   *  this drives matching: a patient matches inclusion if ANY group has ALL its
   *  CUIs; matches exclusion (→ excluded) if ANY exclusion group is fully present.
   *  e.g. [['C..Memantine','C..Photophobia'], ['C..Stroke']] = (Mem AND Phot) OR Stroke. */
  inclusionGroups?: string[][];
  exclusionGroups?: string[][];
  /** Per-CUI numeric / temporal constraints (e.g. {C0019018: {op:'>=', value: 7.5}}). */
  inclusionConstraints?: Record<string, Measurement>;
  exclusionConstraints?: Record<string, Measurement>;
  /** Optional demographic constraints — auto-detected from free text or set by hand. */
  ageMin?: number;
  ageMax?: number;
  genderConstraint?: Sex;
  raceConstraint?: Race[];
  ethnicityConstraint?: Ethnicity[];
  createdAt: string;
};

export const PHASES: TrialPhase[] = [
  'Early Phase 1',
  'Phase 1',
  'Phase 1/Phase 2',
  'Phase 2',
  'Phase 2/Phase 3',
  'Phase 3',
  'Phase 4',
  'N/A'
];

export const PATIENT_STATUS_OPTIONS: { value: PatientStatus; label: string }[] = [
  { value: 'living', label: 'Living patients only' },
  { value: 'deceased', label: 'Deceased patients only' },
  { value: 'either', label: 'Either' }
];

export const EHR_SYSTEMS: EHRSystem[] = [
  'Epic',
  'Cerner',
  'Athena',
  'DrChrono',
  'Practice Fusion'
];

// ---- Hospitals (tenants) ----

export type Hospital = {
  id: string;
  name: string;
  shortName: string;
  state: string;
  city: string;
  lat: number;
  lng: number;
  region: 'West' | 'Midwest' | 'Northeast' | 'South';
  /** Plausible ZIP catchment area for this hospital, sampled per patient. */
  zipCodes: string[];
  /** Relative size used to weight patient distribution. */
  weight: number;
  /** EHR system of record for this hospital. */
  ehr: EHRSystem;
};

export const SPONSOR_VIEW_ID = '__sponsor__';

// ---- Patients ----

export type Sex = 'male' | 'female';
export type LifeStatus = 'living' | 'deceased';

// OMB / FDA standard categories, kept compact for table display.
export type Race =
  | 'White'
  | 'Black'
  | 'Asian'
  | 'AI/AN'
  | 'NH/PI'
  | 'Other'
  | 'Unknown';

export type Ethnicity = 'Hispanic' | 'Non-Hispanic' | 'Unknown';

// Lightweight summary materialized for all 100K patients at startup.
// Full Patient records are generated on demand from the same seed.
export type ClinicalNote = {
  id: string;
  date: string; // ISO
  author: string;
  noteType: 'Progress note' | 'Initial consult' | 'Telehealth' | 'Discharge summary';
  body: string;
  /** CUIs extracted from this note by the ML pipeline (mock). */
  extractedCuis: string[];
};

export type LabResult = {
  id: string;
  date: string;
  code: string; // LOINC-like
  name: string;
  value: number;
  units: string;
  refLow?: number;
  refHigh?: number;
  flag?: 'L' | 'H' | 'N';
};

export type Encounter = {
  id: string;
  date: string;
  type: 'Clinic visit' | 'Telehealth' | 'Inpatient' | 'Procedure' | 'ED';
  location: string;
  reason: string;
};

export type TimelineEvent =
  | ({ kind: 'note' } & Pick<ClinicalNote, 'id' | 'date' | 'author' | 'noteType'>)
  | ({ kind: 'lab' } & Pick<LabResult, 'id' | 'date' | 'name' | 'value' | 'units' | 'flag'>)
  | ({ kind: 'encounter' } & Pick<Encounter, 'id' | 'date' | 'type' | 'reason'>);

export type Appointment = {
  /** ISO date string (yyyy-mm-dd) for the visit. */
  date: string;
  type: 'Clinic visit' | 'Telehealth' | 'Procedure' | 'Lab draw';
  reason: string;
};

// ---- Live (real-EHR) patient detail — REAL bundle data only, never mock ----

/** Event kinds shared by the mock timeline and the live bundle timeline. */
export type ClinicalKind =
  | 'note'
  | 'lab'
  | 'encounter'
  | 'diagnosis'
  | 'medication'
  | 'procedure'
  | 'allergy';

export type LiveCondition = {
  display: string;
  system: string | null;
  code: string | null;
  onsetDate: string | null;
  status: string | null;
};
export type LiveMedication = {
  display: string;
  system: string | null;
  code: string | null;
  dosage: string | null;
  start: string | null;
  end: string | null;
  status: string | null;
};
export type LiveProcedure = {
  display: string;
  system: string | null;
  code: string | null;
  date: string | null;
};
export type LiveLab = {
  name: string;
  code: string | null;
  value: string | number | null;
  unit: string | null;
  date: string | null;
  flag: string | null;
  refRange: string | null;
};
export type LiveAllergy = { substance: string; reaction: string | null; severity: string | null };

/** One source document for the document library (any type). */
export type LiveDocumentMeta = {
  docId: string | null;
  title: string;
  date: string | null;
  kind: 'text' | 'pdf' | 'image' | 'other';
};

export type LiveNote = {
  docId: string | null;
  title: string;
  date: string | null;
  body: string;
  /** How many byte-identical copies of this note exist (copy-forward/templated). */
  count?: number;
};

export type LiveTimelineEvent = {
  kind: ClinicalKind;
  id: string;
  date: string | null;
  title: string;
  detail?: string | null;
  value?: string | number | null;
  units?: string | null;
  flag?: string | null;
};

/** Everything shown on a live patient's detail page — all derived from the bundle. */
export type LiveFullRecord = {
  conditions: LiveCondition[];
  medications: LiveMedication[];
  procedures: LiveProcedure[];
  labs: LiveLab[];
  allergies: LiveAllergy[];
  notes: LiveNote[];
  documents: LiveDocumentMeta[];
  timeline: LiveTimelineEvent[];
};

export type PatientSummary = {
  index: number;
  patientId: string;
  hospitalId: string;
  /** PHI: only revealed when IRB clearance is active for the active tenant. */
  firstName: string;
  lastName: string;
  mrn: string;
  age: number;
  gender: Sex;
  race: Race;
  ethnicity: Ethnicity;
  state: string;
  zip: string;
  status: LifeStatus;
  primaryConditionCui: string;
  cuis: string[];
  /** Optional upcoming appointment, present for ~15% of patients. */
  upcomingAppointment?: Appointment;
  /**
   * Rich provenance for extracted CUIs — present for live (real-EHR) patients.
   * Mock patients only carry `cuis`; the UI falls back to that + cuiLabel().
   */
  cuiDetail?: ExtractedCui[];
};

/** One extracted CUI with its source and originating native code. */
export type ExtractedCui = {
  cui: string;
  label: string;
  source: 'structured' | 'unstructured';
  nativeSystem?: string | null;
  nativeCode?: string | null;
  /** Provenance — where the CUI was extracted from (live patients only). */
  evidence?: CuiEvidence[];
};

/**
 * Provenance for one extracted CUI. `kind:"note"` carries a DE-IDENTIFIED snippet
 * (safe for default display) + offsets into the raw document (used behind the IRB
 * gate to highlight the source). `kind:"structured"` carries the coded resource.
 * Placeholder shape — the ML team's model populates the same contract.
 */
export type CuiEvidence = {
  kind: 'note' | 'structured';
  docId?: string | null;
  docTitle?: string | null;
  docDate?: string | null;
  snippet?: string | null;
  matchedText?: string | null;
  start?: number | null;
  end?: number | null;
  resourceType?: string | null;
  display?: string | null;
};
