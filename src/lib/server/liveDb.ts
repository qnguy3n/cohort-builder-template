/**
 * Server-only live data source: queries the SQLite store written by the
 * ml-processing-service pipeline. Search is by CUI (AND semantics across
 * selected CUIs), returning real patients in a PatientSummary-shaped row.
 *
 * Uses Node's built-in `node:sqlite` (Node 22+, experimental) so no native
 * module install is needed. Read-only. Never import from client code — this
 * lives under $lib/server, which SvelteKit keeps off the client bundle.
 *
 * PHI handling: de-identified fields are always returned. Name/MRN (PHI) are
 * included ONLY when `includePhi` is true (the caller passes the IRB-clearance
 * flag). This is the server-side gate; the existing client `irbCleared` store
 * still controls display, but PHI no longer leaves the server unless cleared.
 */
import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';
import type {
  PatientSummary,
  Race,
  Ethnicity,
  Sex,
  CuiEvidence,
  LiveFullRecord,
  LiveTimelineEvent
} from '$lib/types';
import { rollUpMatchSet, ontologyLabel } from '$lib/ontology';

const UMLS_SYSTEM = 'http://www.nlm.nih.gov/research/umls';

// Billing/financial documents must never be surfaced (client wants non-billing only).
// Mirrors the ingestion filter — a display-side safety net for already-ingested data.
const BILLING_RE =
  /\b(co-?pays?|co pay|receipts?|invoices?|remittances?|eob|explanation of benefits|superbills?|statements?|balance due|amount due|past due|insurance balance|paid out|payments?|billing|ledgers?|charges?|fees?)\b|\$\s?\d/i;
const isBillingDoc = (title: string | null | undefined): boolean => !!title && BILLING_RE.test(title);

export type LivePatient = {
  patientId: string;
  hospitalId: string;
  age: number | null;
  gender: string | null;
  race: string | null;
  ethnicity: string | null;
  state: string | null;
  cuis: string[];
  cuiDetail: Array<{
    cui: string;
    label: string | null;
    source: string;
    nativeSystem: string | null;
    nativeCode: string | null;
    evidence: CuiEvidence[];
  }>;
  // PHI — only populated when includePhi
  firstName?: string;
  lastName?: string;
  mrn?: string;
};

export type LiveFilters = {
  hospitalId: string;
  cuis?: string[];
  gender?: string | null;
  ageMin?: number | null;
  ageMax?: number | null;
  includePhi?: boolean;
};

function dbPath(): string {
  return (
    process.env.COHORT_DB_PATH ||
    // default: sibling ml-processing-service store
    `${process.cwd()}/../ml-processing-service/_phi_local/olivo_poc.db`
  );
}

export function isLiveStoreAvailable(): boolean {
  return existsSync(dbPath());
}

function open(): DatabaseSync {
  return new DatabaseSync(dbPath(), { readOnly: true });
}

function phiFromJson(phiJson: string | null): { firstName?: string; lastName?: string; mrn?: string } {
  if (!phiJson) return {};
  try {
    const bundle = JSON.parse(phiJson);
    const patient = (bundle.entry ?? [])
      .map((e: any) => e.resource)
      .find((r: any) => r?.resourceType === 'Patient');
    if (!patient) return {};
    const name = (patient.name ?? [])[0] ?? {};
    const mrn = (patient.identifier ?? [])[0]?.value;
    return {
      firstName: (name.given ?? [])[0],
      lastName: name.family,
      mrn,
    };
  } catch {
    return {};
  }
}

function parseEvidence(jsonText: string | null): CuiEvidence[] {
  if (!jsonText) return [];
  try {
    const arr = JSON.parse(jsonText);
    if (!Array.isArray(arr)) return [];
    return arr.map((e: any) => ({
      kind: e.kind,
      docId: e.doc_id ?? null,
      docTitle: e.doc_title ?? null,
      docDate: e.doc_date ?? null,
      snippet: e.snippet ?? null,
      matchedText: e.matched_text ?? null,
      start: e.start ?? null,
      end: e.end ?? null,
      resourceType: e.resource_type ?? null,
      display: e.display ?? null
    }));
  } catch {
    return [];
  }
}

const BINARY_MAGIC = ['%PDF', '\x89PNG', '\xff\xd8\xff', 'GIF8', 'PK\x03\x04'];

/** Mirror of the Python enricher's text guard — keep raw binary docs out of the viewer. */
function looksLikeText(raw: Buffer): boolean {
  if (!raw.length) return false;
  const head = raw.subarray(0, 8).toString('latin1');
  if (BINARY_MAGIC.some((m) => head.startsWith(m))) return false;
  const sample = raw.subarray(0, 4096);
  let printable = 0;
  for (const b of sample) if ((b >= 32 && b <= 126) || b === 9 || b === 10 || b === 13) printable++;
  return printable / sample.length >= 0.85;
}

export type LiveDocument = {
  found: boolean;
  docId: string;
  title: string | null;
  date: string | null;
  contentType: string | null;
  isText: boolean;
  text?: string;
  /** For renderable binaries (image/PDF): a data: URL the client can embed. */
  dataUrl?: string;
  /** Sniffed MIME (attachments are often mislabeled text/plain). */
  mime?: string;
};

const MAX_BINARY_BYTES = 6 * 1024 * 1024; // cap the inlined data: URL payload

/** Sniff a renderable MIME from magic bytes (attachment.contentType is unreliable). */
function sniffMime(raw: Buffer): string | null {
  const h = raw.subarray(0, 8);
  if (h.subarray(0, 4).toString('latin1') === '%PDF') return 'application/pdf';
  if (h[0] === 0x89 && h[1] === 0x50 && h[2] === 0x4e && h[3] === 0x47) return 'image/png';
  if (h[0] === 0xff && h[1] === 0xd8 && h[2] === 0xff) return 'image/jpeg';
  if (h.subarray(0, 4).toString('latin1') === 'GIF8') return 'image/gif';
  return null; // not a previewable type (e.g. zip/proprietary)
}

/**
 * Raw source document for a live patient (PHI — caller MUST gate on auth + IRB).
 * Reads the DocumentReference out of phi_json: returns text for text content, or
 * an inline data: URL for renderable images/PDFs; metadata-only for anything else.
 */
export function liveDocument(hospitalId: string, patientId: string, docId: string): LiveDocument {
  const miss: LiveDocument = { found: false, docId, title: null, date: null, contentType: null, isText: false };
  if (!isLiveStoreAvailable()) return miss;
  const db = open();
  try {
    const row = db
      .prepare('SELECT phi_json FROM patient WHERE hospital_id = ? AND patient_id = ?')
      .get(hospitalId, patientId) as any;
    if (!row?.phi_json) return miss;
    const bundle = JSON.parse(row.phi_json);
    const ref = (bundle.entry ?? [])
      .map((e: any) => e.resource)
      .find((r: any) => r?.resourceType === 'DocumentReference' && String(r.id) === String(docId));
    if (!ref) return miss;
    const att = (ref.content ?? [])[0]?.attachment ?? {};
    const meta = { found: true, docId, title: ref.type?.text ?? null, date: ref.date ?? null, contentType: att.contentType ?? null };
    if (!att.data) return { ...meta, isText: false };
    const raw = Buffer.from(att.data, 'base64');
    if (looksLikeText(raw)) {
      return { ...meta, isText: true, text: raw.toString('utf-8') };
    }
    // Binary: render images/PDFs inline when not too large.
    const mime = sniffMime(raw);
    if (mime && raw.length <= MAX_BINARY_BYTES) {
      return { ...meta, isText: false, mime, dataUrl: `data:${mime};base64,${att.data}` };
    }
    return { ...meta, isText: false, mime: mime ?? undefined };
  } finally {
    db.close();
  }
}

// ---- Real live-patient detail (bundle-derived; NEVER mock) ----

function nativeCoding(concept: any): { system: string | null; code: string | null; display: string | null } {
  const codings = concept?.coding ?? [];
  const native = codings.find((c: any) => c?.system && c.system !== UMLS_SYSTEM) ?? codings[0] ?? {};
  return { system: native.system ?? null, code: native.code ?? null, display: native.display ?? null };
}

function conceptText(concept: any): string {
  if (!concept) return '';
  if (concept.text) return concept.text;
  const c = nativeCoding(concept);
  return c.display ?? c.code ?? '';
}

/**
 * Real clinical detail for a live patient, read from the DE-IDENTIFIED bundle
 * (deid_json) so note text is scrubbed and nothing is fabricated. Returns null
 * if the patient isn't in the live store. Labs come back empty when the source
 * has none — we render "none in source", never invented values.
 */
export function liveFullPatient(hospitalId: string, patientId: string): LiveFullRecord | null {
  if (!isLiveStoreAvailable()) return null;
  const db = open();
  try {
    const row = db
      .prepare('SELECT deid_json FROM patient WHERE hospital_id = ? AND patient_id = ?')
      .get(hospitalId, patientId) as any;
    if (!row?.deid_json) return null;
    const bundle = JSON.parse(row.deid_json);
    const resources: any[] = (bundle.entry ?? []).map((e: any) => e.resource).filter(Boolean);

    const conditions: LiveFullRecord['conditions'] = [];
    const medications: LiveFullRecord['medications'] = [];
    const procedures: LiveFullRecord['procedures'] = [];
    const labs: LiveFullRecord['labs'] = [];
    const allergies: LiveFullRecord['allergies'] = [];
    const notes: LiveFullRecord['notes'] = [];
    const documents: LiveFullRecord['documents'] = [];

    for (const r of resources) {
      switch (r.resourceType) {
        case 'Condition': {
          const c = nativeCoding(r.code);
          conditions.push({
            display: conceptText(r.code),
            system: c.system,
            code: c.code,
            onsetDate: r.onsetDateTime ?? null,
            status: r.clinicalStatus?.coding?.[0]?.code ?? null
          });
          break;
        }
        case 'MedicationStatement': {
          const c = nativeCoding(r.medicationCodeableConcept);
          medications.push({
            display: conceptText(r.medicationCodeableConcept),
            system: c.system,
            code: c.code,
            dosage: r.dosage?.[0]?.text ?? null,
            start: r.effectivePeriod?.start ?? null,
            end: r.effectivePeriod?.end ?? null,
            status: r.status ?? null
          });
          break;
        }
        case 'Procedure': {
          const c = nativeCoding(r.code);
          procedures.push({
            display: conceptText(r.code),
            system: c.system,
            code: c.code,
            date: r.performedDateTime ?? null
          });
          break;
        }
        case 'Observation': {
          const c = nativeCoding(r.code);
          const vq = r.valueQuantity;
          labs.push({
            name: conceptText(r.code),
            code: c.code,
            value: vq ? vq.value : (r.valueString ?? null),
            unit: vq?.unit ?? null,
            date: r.effectiveDateTime ?? null,
            flag: r.interpretation?.[0]?.coding?.[0]?.code ?? null,
            refRange: r.referenceRange?.[0]?.text ?? null
          });
          break;
        }
        case 'AllergyIntolerance': {
          allergies.push({
            substance: conceptText(r.code) || 'Unknown allergen',
            reaction: r.reaction?.[0]?.manifestation?.[0]?.text ?? null,
            severity: r.reaction?.[0]?.severity ?? null
          });
          break;
        }
        case 'DocumentReference': {
          const att = (r.content ?? [])[0]?.attachment ?? {};
          if (!att.data) break;
          const docId = r.id != null ? String(r.id) : null;
          const title = r.type?.text ?? 'Document';
          if (isBillingDoc(title)) break; // never surface billing/financial docs
          const date = r.date ?? null;
          const raw = Buffer.from(att.data, 'base64');
          if (looksLikeText(raw)) {
            const body = raw.toString('utf-8');
            if (body.trim().length < 15) break; // near-empty field — skip entirely
            documents.push({ docId, title, date, kind: 'text' });
            notes.push({ docId, title, date, body }); // text notes also feed extraction context
          } else {
            const mime = sniffMime(raw);
            const kind = mime === 'application/pdf' ? 'pdf' : mime?.startsWith('image/') ? 'image' : 'other';
            documents.push({ docId, title, date, kind });
          }
          break;
        }
      }
    }

    // Collapse byte-identical notes (copy-forward / re-locked templates) so the
    // same note doesn't render N times — keep one, record how many copies exist.
    const dedupedNotes: typeof notes = [];
    const byBody = new Map<string, (typeof notes)[number] & { count: number }>();
    for (const n of notes) {
      const key = n.body.trim();
      const prev = byBody.get(key);
      if (prev) {
        prev.count += 1;
        continue;
      }
      const note = { ...n, count: 1 };
      byBody.set(key, note);
      dedupedNotes.push(note);
    }

    const timeline: LiveTimelineEvent[] = [
      ...conditions.map((c, i) => ({ kind: 'diagnosis' as const, id: `dx-${i}`, date: c.onsetDate, title: c.display, detail: c.status })),
      ...medications.map((m, i) => ({ kind: 'medication' as const, id: `rx-${i}`, date: m.start, title: m.display, detail: m.dosage })),
      ...procedures.map((p, i) => ({ kind: 'procedure' as const, id: `pr-${i}`, date: p.date, title: p.display, detail: null })),
      ...labs.map((l, i) => ({ kind: 'lab' as const, id: `lab-${i}`, date: l.date, title: l.name, value: l.value, units: l.unit, flag: l.flag })),
      ...allergies.map((a, i) => ({ kind: 'allergy' as const, id: `al-${i}`, date: null, title: a.substance, detail: a.reaction })),
      ...dedupedNotes.map((n, i) => ({ kind: 'note' as const, id: `note-${i}`, date: n.date, title: n.title, detail: null }))
    ].sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));

    return { conditions, medications, procedures, labs, allergies, notes: dedupedNotes, documents, timeline };
  } finally {
    db.close();
  }
}

/** Distinct CUIs for the hospital with patient counts — drives the filter facet. */
export function cuiCounts(hospitalId: string): Array<{ cui: string; label: string | null; count: number }> {
  if (!isLiveStoreAvailable()) return [];
  const db = open();
  try {
    const stmt = db.prepare(
      `SELECT cui, MAX(label) AS label, COUNT(DISTINCT patient_id) AS count
       FROM patient_cui WHERE hospital_id = ?
       GROUP BY cui ORDER BY count DESC, cui`
    );
    return stmt.all(hospitalId) as any[];
  } finally {
    db.close();
  }
}

export function listLivePatients(filters: LiveFilters): LivePatient[] {
  if (!isLiveStoreAvailable()) return [];
  const { hospitalId, cuis = [], gender, ageMin, ageMax, includePhi = false } = filters;
  const db = open();
  try {
    const where: string[] = ['p.hospital_id = ?'];
    const params: any[] = [hospitalId];

    if (gender) {
      where.push('p.gender = ?');
      params.push(gender);
    }
    if (ageMin != null) {
      where.push('p.age >= ?');
      params.push(ageMin);
    }
    if (ageMax != null) {
      where.push('p.age <= ?');
      params.push(ageMax);
    }
    if (cuis.length) {
      const placeholders = cuis.map(() => '?').join(',');
      where.push(
        `p.patient_id IN (
           SELECT patient_id FROM patient_cui
           WHERE hospital_id = ? AND cui IN (${placeholders})
           GROUP BY patient_id HAVING COUNT(DISTINCT cui) = ?
         )`
      );
      params.push(hospitalId, ...cuis, cuis.length);
    }

    const rows = db
      .prepare(
        `SELECT patient_id, hospital_id, age, gender, race, ethnicity, state,
                ${includePhi ? 'phi_json' : 'NULL AS phi_json'}
         FROM patient p WHERE ${where.join(' AND ')}
         ORDER BY p.patient_id`
      )
      .all(...params) as any[];

    const cuiStmt = db.prepare(
      `SELECT cui, label, source, native_system, native_code, evidence_json FROM patient_cui
       WHERE hospital_id = ? AND patient_id = ? ORDER BY source, cui`
    );

    return rows.map((r) => {
      const detail = cuiStmt.all(hospitalId, r.patient_id) as any[];
      const phi = includePhi ? phiFromJson(r.phi_json) : {};
      const extracted = detail.map((d) => d.cui);
      return {
        patientId: r.patient_id,
        hospitalId: r.hospital_id,
        age: r.age,
        gender: r.gender,
        race: r.race,
        ethnicity: r.ethnicity,
        state: r.state,
        // Match-set is rolled UP to disorder ancestors so a subtype-coded
        // patient matches parent-concept queries (subsumption-aware search).
        cuis: rollUpMatchSet(extracted),
        cuiDetail: detail.map((d) => ({
          cui: d.cui,
          label: d.label ?? ontologyLabel(d.cui) ?? null,
          source: d.source,
          nativeSystem: d.native_system,
          nativeCode: d.native_code,
          evidence: parseEvidence(d.evidence_json),
        })),
        ...phi,
      } as LivePatient;
    });
  } finally {
    db.close();
  }
}

export function institutionName(hospitalId: string): string | null {
  if (!isLiveStoreAvailable()) return null;
  const db = open();
  try {
    const row = db.prepare('SELECT name FROM institution WHERE hospital_id = ?').get(hospitalId) as any;
    return row?.name ?? null;
  } finally {
    db.close();
  }
}

// ---- Map live rows into the existing PatientSummary shape ----
// Lets real patients be injected into the cohort-builder store so the normal
// dashboard (table, CUI filters, study matching) renders them like any tenant.

function mapRace(raw: string | null): Race {
  switch ((raw ?? '').toLowerCase()) {
    case 'white': return 'White';
    case 'asian': return 'Asian';
    case 'black':
    case 'black or african american': return 'Black';
    case 'american indian or alaska native': return 'AI/AN';
    case 'native hawaiian or other pacific islander': return 'NH/PI';
    case '': return 'Unknown';
    default: return 'Other';
  }
}

function mapEthnicity(raw: string | null): Ethnicity {
  const v = (raw ?? '').toLowerCase();
  if (v === 'hispanic' || v === 'hispanic or latino') return 'Hispanic';
  if (v.startsWith('non-hispanic')) return 'Non-Hispanic';
  return 'Unknown';
}

/**
 * Real patients for `hospitalId` as PatientSummary rows for store injection.
 * `index` is a placeholder (0) — the client store reassigns it on inject.
 * PHI (name/MRN) is included only when `includePhi`.
 */
export function listLiveSummaries(hospitalId: string, includePhi: boolean): PatientSummary[] {
  const patients = listLivePatients({ hospitalId, includePhi });
  return patients.map((p) => {
    const structuredCui = p.cuiDetail.find((c) => c.source === 'structured')?.cui;
    return {
      index: 0,
      patientId: p.patientId,
      hospitalId: p.hospitalId,
      firstName: includePhi ? p.firstName ?? '' : '',
      lastName: includePhi ? p.lastName ?? '' : '',
      mrn: includePhi ? p.mrn ?? '' : '',
      age: p.age ?? 0,
      gender: (p.gender === 'female' ? 'female' : 'male') as Sex,
      race: mapRace(p.race),
      ethnicity: mapEthnicity(p.ethnicity),
      state: p.state ?? '',
      zip: '',
      status: 'living',
      primaryConditionCui: structuredCui ?? p.cuis[0] ?? '',
      cuis: p.cuis,
      cuiDetail: p.cuiDetail.map((c) => ({
        cui: c.cui,
        label: c.label ?? c.cui,
        source: c.source === 'unstructured' ? 'unstructured' : 'structured',
        nativeSystem: c.nativeSystem,
        nativeCode: c.nativeCode,
        evidence: c.evidence
      }))
    } satisfies PatientSummary;
  });
}
