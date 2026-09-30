import type { Race, Ethnicity, Sex, LifeStatus } from './types';

export type DemographicHints = {
  ageMin?: number;
  ageMax?: number;
  gender?: Sex;
  races?: Race[];
  ethnicities?: Ethnicity[];
  patientStatus?: LifeStatus;
};

/**
 * Pull simple demographic predicates out of free-text criteria. Mocks a small
 * NLP layer — not exhaustive, but covers the common phrasings: "age 18-65",
 * ">= 18 years", "female only", "Hispanic", "deceased", etc.
 */
export function extractDemographicsFromText(text: string): DemographicHints {
  if (!text || !text.trim()) return {};
  const lower = text.toLowerCase();
  const out: DemographicHints = {};

  // ---- Age ----
  // Patterns are guarded so unrelated numeric ranges ("Hoehn and Yahr stage
  // 2-3", "MoCA 18-25", "MDS-UPDRS >= 25") don't get misread as ages.

  // "age 18-65", "ages 18 to 65", "aged 18-65" — anchor on a word boundary so
  // "stage 2-3" doesn't match the trailing "age" inside "stage".
  let m = lower.match(/\bage[ds]?\s+(\d{1,3})\s*(?:-|to|–|—)\s*(\d{1,3})/);
  if (m) {
    out.ageMin = +m[1];
    out.ageMax = +m[2];
  }
  // "18-65 years (old)" — requires the trailing years/y.o. unit.
  if (out.ageMin == null && out.ageMax == null) {
    m = lower.match(/(\d{1,3})\s*(?:-|to|–|—)\s*(\d{1,3})\s*(?:years?(?:\s+(?:old|of\s+age))?|y\.?o\.?)/);
    if (m) {
      out.ageMin = +m[1];
      out.ageMax = +m[2];
    }
  }
  // "between 40 and 80 years" — require the explicit years marker.
  if (out.ageMin == null && out.ageMax == null) {
    m = lower.match(/between\s+(\d{1,3})\s+and\s+(\d{1,3})\s*(?:years?|y\.?o\.?)/);
    if (m) {
      out.ageMin = +m[1];
      out.ageMax = +m[2];
    }
  }

  // Lower bound only — must include an age qualifier; bare ">= 25" is not enough.
  if (out.ageMin == null) {
    // Phrase-based ("at least 18", "over 65", "older than 50")
    m = lower.match(/(?:at least|minimum(?:\s+age)?|over|older than)\s+(\d{1,3})(?:\s*(?:years?(?:\s+(?:old|of\s+age))?|y\.?o\.?))?/);
    if (m) out.ageMin = +m[1];
    // Comparator-based requires the years/y.o. suffix.
    if (out.ageMin == null) {
      m = lower.match(/(?:>=|≥|>)\s*(\d{1,3})\s*(?:years?(?:\s+(?:old|of\s+age))?|y\.?o\.?)/);
      if (m) out.ageMin = +m[1];
    }
    // "18 years (and) older", "18 y.o. or older", "18+ years"
    if (out.ageMin == null) {
      m = lower.match(/(\d{1,3})\s*(?:years?(?:\s+(?:and\s+)?older|\s+or\s+older)|y\.?o\.?\s+or\s+older|\+\s*years?)/);
      if (m) out.ageMin = +m[1];
    }
  }

  // Upper bound only — same guard: phrase-based or comparator with age unit.
  if (out.ageMax == null) {
    m = lower.match(/(?:up to|maximum(?:\s+age)?|under|younger than|no older than)\s+(\d{1,3})(?:\s*(?:years?(?:\s+old)?|y\.?o\.?))?/);
    if (m) out.ageMax = +m[1];
    if (out.ageMax == null) {
      m = lower.match(/(?:<=|≤|<)\s*(\d{1,3})\s*(?:years?(?:\s+old)?|y\.?o\.?)/);
      if (m) out.ageMax = +m[1];
    }
  }

  // Sanity-clamp
  if (out.ageMin != null) out.ageMin = Math.max(0, Math.min(120, out.ageMin));
  if (out.ageMax != null) out.ageMax = Math.max(0, Math.min(120, out.ageMax));

  // ---- Gender ----
  // Avoid trivial false positives like "female partner" — keep the matchers simple.
  const negative = /\b(?:not|no|exclud)\w*\s+(?:female|women|male|men)/.test(lower);
  if (!negative) {
    if (/\b(female|women|woman|girls?)\b/.test(lower)) {
      out.gender = 'female';
    } else if (/\b(male|men|man|boys?)\b/.test(lower)) {
      out.gender = 'male';
    }
  }

  // ---- Race ----
  const races: Race[] = [];
  if (/\b(white|caucasian)\b/.test(lower)) races.push('White');
  if (/\b(black|african[\s-]american)\b/.test(lower)) races.push('Black');
  if (/\basian\b/.test(lower)) races.push('Asian');
  if (/\b(american indian|alaska native|native american)\b/.test(lower)) races.push('AI/AN');
  if (/\b(native hawaiian|pacific islander)\b/.test(lower)) races.push('NH/PI');
  if (races.length) out.races = races;

  // ---- Ethnicity ----
  const ethnicities: Ethnicity[] = [];
  if (/\bnon[\s-]hispanic\b/.test(lower)) ethnicities.push('Non-Hispanic');
  else if (/\b(hispanic|latin[ao])\b/.test(lower)) ethnicities.push('Hispanic');
  if (ethnicities.length) out.ethnicities = ethnicities;

  // ---- Life status ----
  if (/\bdeceased\b/.test(lower)) out.patientStatus = 'deceased';
  else if (/\bliving\s+patients?\b/.test(lower)) out.patientStatus = 'living';

  return out;
}

/** Merge two hint sets — second one wins for scalars, sets union for arrays. */
export function mergeDemographics(a: DemographicHints, b: DemographicHints): DemographicHints {
  const out: DemographicHints = { ...a };
  if (b.ageMin != null) out.ageMin = b.ageMin;
  if (b.ageMax != null) out.ageMax = b.ageMax;
  if (b.gender) out.gender = b.gender;
  if (b.patientStatus) out.patientStatus = b.patientStatus;
  if (b.races && b.races.length) {
    out.races = Array.from(new Set([...(out.races ?? []), ...b.races]));
  }
  if (b.ethnicities && b.ethnicities.length) {
    out.ethnicities = Array.from(new Set([...(out.ethnicities ?? []), ...b.ethnicities]));
  }
  return out;
}
