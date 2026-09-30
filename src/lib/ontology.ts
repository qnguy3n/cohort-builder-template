/**
 * Neurology ontology helpers (pure data — safe on client and server).
 *
 * Wraps the generated `ontology.generated.ts` (exported from the
 * ml-processing-service curated ontology) and is the AUTHORITATIVE source for
 * neuro concept labels and hierarchy. The legacy mock `cui.ts` is only a
 * fallback for non-neurology comorbidities.
 *
 * Population search is subsumption-aware: a patient coded "Parkinson disease"
 * should match a "Parkinsonism" or "Movement disorder" query. We achieve that
 * by rolling each patient's match-set UP to its disorder ancestors
 * (`rollUpMatchSet`), leaving the existing exact-membership matcher untouched.
 */
import { ONTOLOGY_CONCEPTS, type OntologyConcept } from './ontology.generated';

export type { OntologyConcept };

export const ONTOLOGY_BY_CUI: Map<string, OntologyConcept> = new Map(
  ONTOLOGY_CONCEPTS.map((c) => [c.cui, c])
);

export function ontologyLabel(cui: string): string | undefined {
  return ONTOLOGY_BY_CUI.get(cui)?.label;
}

/**
 * Legacy mock CUIs that the curated ontology supersedes with a DIFFERENT
 * canonical CUI for the same clinical concept. The old mock list and the
 * ontology disagreed on these codes; without unifying them, text-extraction
 * emits two CUIs for one concept and AND-matching finds nobody. The ontology
 * CUI is authoritative — patient codings AND study criteria are canonicalized
 * to it so both sides of matching speak the same code.
 * (Each target is a real concept in ontology.generated.ts.)
 */
export const MOCK_TO_ONTOLOGY: Record<string, string> = {
  C0030554: 'C0038868', // Progressive supranuclear palsy
  C0024183: 'C0393571', // Multiple system atrophy
  C0014534: 'C0472349', // Drug-resistant epilepsy
  C1306006: 'C0027873', // Neuromyelitis optica (NMOSD)
  C0085584: 'C0009088' // Cluster headache
};

/** Map a CUI to its canonical (ontology) code; identity if not superseded. */
export function canonicalCui(cui: string): string {
  return MOCK_TO_ONTOLOGY[cui] ?? cui;
}

/** Canonicalize + de-duplicate a list of CUIs. */
export function canonicalizeCuis(cuis: string[]): string[] {
  return [...new Set(cuis.map(canonicalCui))];
}

export function ontologyChildren(cui: string): string[] {
  return ONTOLOGY_BY_CUI.get(cui)?.children ?? [];
}

/** All transitive descendants (excludes the CUI itself). */
export function ontologyDescendants(cui: string): string[] {
  const out = new Set<string>();
  const stack = [...ontologyChildren(cui)];
  while (stack.length) {
    const x = stack.pop()!;
    if (out.has(x)) continue;
    out.add(x);
    for (const c of ontologyChildren(x)) stack.push(c);
  }
  return [...out];
}

/**
 * Disorder-only ancestor chain (excludes the CUI itself). Roll-up stops at the
 * first non-disorder edge so loose groupings (findings/labs/assessments parented
 * under a disorder family, e.g. Photophobia under Headache) do NOT create false
 * subsumption matches — only genuine disorder→disorder IS-A edges count.
 */
export function disorderAncestors(cui: string): string[] {
  const out: string[] = [];
  let node = ONTOLOGY_BY_CUI.get(cui);
  if (!node || node.cat !== 'disorder') return out;
  const seen = new Set<string>([cui]);
  while (node?.parent) {
    const p = ONTOLOGY_BY_CUI.get(node.parent);
    if (!p || p.cat !== 'disorder' || seen.has(p.cui)) break;
    out.push(p.cui);
    seen.add(p.cui);
    node = p;
  }
  return out;
}

/**
 * Expand a patient's extracted CUIs into the match-set used for cohort search:
 * the extracted CUIs plus every disorder ancestor. Selecting a parent concept
 * (e.g. Parkinsonism) then matches all subtype-coded patients across the
 * population, without changing the exact-membership matcher.
 */
export function rollUpMatchSet(cuis: string[]): string[] {
  const out = new Set<string>(cuis);
  for (const c of cuis) for (const a of disorderAncestors(c)) out.add(a);
  return [...out];
}
