import type { TrialPhase } from './types';
import { PHASES } from './types';

export type NctImportResult = {
  nctId: string;
  name: string;
  summary: string;
  phase: TrialPhase;
  inclusionCriteria: string;
  exclusionCriteria: string;
  /** Disorders / conditions the trial targets (e.g. ["Parkinson Disease"]). */
  conditions: string[];
  /** Intervention names (drugs, devices, procedures). */
  interventions: string[];
  /** Lead sponsor name (e.g. "Stanford University"). */
  sponsor: string;
  /** Observational | Interventional | Expanded Access. */
  studyType: string;
  /** "18 Years", "65 Years", or "" if unspecified. */
  minAge: string;
  maxAge: string;
  /** ALL | FEMALE | MALE. */
  sex: string;
  /** Whether the trial accepts healthy volunteers. */
  healthyVolunteers: boolean;
  /** Recruiting | Completed | Terminated | etc. */
  overallStatus: string;
};

const PHASE_MAP: Record<string, TrialPhase> = {
  EARLY_PHASE1: 'Early Phase 1',
  PHASE1: 'Phase 1',
  PHASE1_2: 'Phase 1/Phase 2',
  PHASE2: 'Phase 2',
  PHASE2_3: 'Phase 2/Phase 3',
  PHASE3: 'Phase 3',
  PHASE4: 'Phase 4',
  NA: 'N/A'
};

function normalizePhase(raw: unknown): TrialPhase {
  if (!Array.isArray(raw) || raw.length === 0) return 'N/A';
  const codes = raw.map((p) => String(p));
  const joined = codes.join('_').replace('PHASE_', 'PHASE');
  if (PHASE_MAP[joined]) return PHASE_MAP[joined];
  const first = codes[0];
  if (PHASE_MAP[first]) return PHASE_MAP[first];
  if ((PHASES as string[]).includes(first)) return first as TrialPhase;
  return 'N/A';
}

function splitCriteria(blob: string | undefined): { inclusion: string; exclusion: string } {
  if (!blob) return { inclusion: '', exclusion: '' };
  const text = blob.replace(/\r\n/g, '\n');
  const lower = text.toLowerCase();
  const exIdx = lower.indexOf('exclusion criteria');
  if (exIdx === -1) return { inclusion: text.trim(), exclusion: '' };

  const inclusion = text
    .slice(0, exIdx)
    .replace(/^\s*inclusion criteria\s*:?\s*/i, '')
    .trim();
  const exclusion = text
    .slice(exIdx)
    .replace(/^\s*exclusion criteria\s*:?\s*/i, '')
    .trim();
  return { inclusion, exclusion };
}

export function normalizeNctId(input: string): string {
  return input.trim().toUpperCase();
}

export async function fetchNctStudy(nctId: string): Promise<NctImportResult> {
  const id = normalizeNctId(nctId);
  if (!/^NCT\d{8}$/.test(id)) {
    throw new Error('NCT ID must look like NCT followed by 8 digits (e.g. NCT04267848).');
  }

  const url = `https://clinicaltrials.gov/api/v2/studies/${id}?format=json`;
  const res = await fetch(url);
  if (res.status === 404) {
    throw new Error(`No study found on ClinicalTrials.gov for ${id}.`);
  }
  if (!res.ok) {
    throw new Error(`ClinicalTrials.gov returned ${res.status}.`);
  }

  const data = await res.json();
  const protocol = data?.protocolSection ?? {};
  const name: string =
    protocol?.identificationModule?.briefTitle ??
    protocol?.identificationModule?.officialTitle ??
    id;
  const summary: string = (protocol?.descriptionModule?.briefSummary ?? '').trim();
  const phase = normalizePhase(protocol?.designModule?.phases);
  const { inclusion, exclusion } = splitCriteria(
    protocol?.eligibilityModule?.eligibilityCriteria
  );

  const conditions: string[] = Array.isArray(protocol?.conditionsModule?.conditions)
    ? protocol.conditionsModule.conditions
    : [];
  const interventions: string[] = Array.isArray(protocol?.armsInterventionsModule?.interventions)
    ? protocol.armsInterventionsModule.interventions
        .map((i: { name?: string }) => i?.name)
        .filter((n: unknown): n is string => typeof n === 'string' && n.length > 0)
    : [];
  const sponsor: string =
    protocol?.sponsorCollaboratorsModule?.leadSponsor?.name ?? '';
  const studyType: string = protocol?.designModule?.studyType ?? '';
  const elig = protocol?.eligibilityModule ?? {};
  const minAge: string = elig?.minimumAge ?? '';
  const maxAge: string = elig?.maximumAge ?? '';
  const sex: string = elig?.sex ?? '';
  const healthyVolunteers: boolean = elig?.healthyVolunteers === true;
  const overallStatus: string = protocol?.statusModule?.overallStatus ?? '';

  return {
    nctId: id,
    name,
    summary,
    phase,
    inclusionCriteria: inclusion,
    exclusionCriteria: exclusion,
    conditions,
    interventions,
    sponsor,
    studyType,
    minAge,
    maxAge,
    sex,
    healthyVolunteers,
    overallStatus
  };
}
