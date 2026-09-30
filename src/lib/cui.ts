// Approximate UMLS-style concept identifiers used as POC mock data.
// These codes are illustrative and may not exactly match the official UMLS
// Metathesaurus. Replace with a vetted UMLS subset before any clinical use.
//
// NOTE: The curated neurology ontology (ontology.generated.ts) is the
// AUTHORITATIVE source for neuro concepts. It is merged over this mock list
// below (ontology wins on CUI collision), so neuro labels + hierarchy come from
// the ontology and the mock list only supplies non-neurology comorbidities.

import { ONTOLOGY_CONCEPTS, type OntologyConcept } from './ontology.generated';
import { MOCK_TO_ONTOLOGY, canonicalizeCuis } from './ontology';

export type CuiCategory =
  | 'disorder'
  | 'medication'
  | 'assessment'
  | 'procedure'
  | 'lab'
  | 'gene';

export type CuiEntry = {
  cui: string;
  label: string;
  category: CuiCategory;
  /** Synonyms / abbreviations / brand names used by free-text extraction. */
  aliases?: string[];
  /** More-specific child concepts (IS-A children) used to broaden matching. */
  children?: string[];
};

const MOCK_CUIS: CuiEntry[] = [
  // ---- Disorders ----
  {
    cui: 'C0030567',
    label: "Parkinson's disease",
    category: 'disorder',
    aliases: ['Parkinson', 'Parkinsons', 'Parkinson disease', 'idiopathic parkinson', 'PD'],
    children: ['C0030554', 'C0024183', 'C0752347']
  },
  {
    cui: 'C0002395',
    label: "Alzheimer's disease",
    category: 'disorder',
    aliases: ['Alzheimer', 'Alzheimers', 'Alzheimer disease', 'AD dementia', 'AD']
  },
  {
    cui: 'C0338656',
    label: 'Mild cognitive impairment',
    category: 'disorder',
    aliases: ['MCI', 'amnestic MCI']
  },
  {
    cui: 'C0026769',
    label: 'Multiple sclerosis',
    category: 'disorder',
    aliases: ['MS', 'relapsing-remitting MS', 'RRMS', 'progressive MS']
  },
  {
    cui: 'C0002736',
    label: 'Amyotrophic lateral sclerosis',
    category: 'disorder',
    aliases: ['ALS', 'Lou Gehrig', 'motor neuron disease']
  },
  {
    cui: 'C0014544',
    label: 'Epilepsy',
    category: 'disorder',
    aliases: ['epileptic', 'focal epilepsy', 'generalized epilepsy', 'seizure disorder'],
    children: ['C0014534']
  },
  {
    cui: 'C0014534',
    label: 'Drug-resistant epilepsy',
    category: 'disorder',
    aliases: ['refractory epilepsy', 'intractable epilepsy', 'pharmacoresistant epilepsy']
  },
  {
    cui: 'C0038454',
    label: 'Stroke (history)',
    category: 'disorder',
    aliases: ['stroke', 'cerebrovascular accident', 'CVA', 'ischemic stroke', 'hemorrhagic stroke']
  },
  {
    cui: 'C0149931',
    label: 'Migraine disorder',
    category: 'disorder',
    aliases: ['migraine', 'migraines', 'migraine headache'],
    children: ['C0338480']
  },
  {
    cui: 'C0338480',
    label: 'Chronic migraine',
    category: 'disorder',
    aliases: ['chronic migraines']
  },
  {
    cui: 'C0020179',
    label: "Huntington's disease",
    category: 'disorder',
    aliases: ['Huntington', 'Huntingtons', 'Huntington disease', 'HD']
  },
  {
    cui: 'C0026896',
    label: 'Myasthenia gravis',
    category: 'disorder',
    aliases: ['MG', 'gMG', 'generalized myasthenia']
  },
  {
    cui: 'C1306006',
    label: 'Neuromyelitis optica spectrum disorder',
    category: 'disorder',
    aliases: ['NMOSD', 'NMO', 'Devic disease']
  },
  {
    cui: 'C0018378',
    label: 'Guillain-Barré syndrome',
    category: 'disorder',
    aliases: ['Guillain-Barre', 'Guillain Barre', 'GBS', 'AIDP']
  },
  {
    cui: 'C0040820',
    label: 'Trigeminal neuralgia',
    category: 'disorder',
    aliases: ['TN', 'tic douloureux']
  },
  {
    cui: 'C0014877',
    label: 'Essential tremor',
    category: 'disorder',
    aliases: ['ET']
  },
  {
    cui: 'C0035258',
    label: 'Restless legs syndrome',
    category: 'disorder',
    aliases: ['RLS', 'restless leg', 'Willis-Ekbom']
  },
  {
    cui: 'C0031117',
    label: 'Peripheral neuropathy',
    category: 'disorder',
    aliases: ['neuropathy', 'polyneuropathy', 'peripheral nerve disease']
  },
  {
    cui: 'C0085584',
    label: 'Cluster headache',
    category: 'disorder',
    aliases: ['cluster headaches']
  },
  {
    cui: 'C0011269',
    label: 'Cerebellar ataxia',
    category: 'disorder',
    aliases: ['ataxia', 'spinocerebellar ataxia', 'SCA']
  },
  {
    cui: 'C0085593',
    label: 'Spinal muscular atrophy',
    category: 'disorder',
    aliases: ['SMA']
  },

  // ---- Common comorbidities & exclusion conditions ----
  {
    cui: 'C0011860',
    label: 'Type 2 diabetes mellitus',
    category: 'disorder',
    aliases: ['diabetes', 'T2DM', 'type 2 diabetes', 'diabetic', 'DM2', 'NIDDM']
  },
  {
    cui: 'C0020538',
    label: 'Hypertension',
    category: 'disorder',
    aliases: ['HTN', 'high blood pressure', 'hypertensive']
  },
  {
    cui: 'C0018802',
    label: 'Heart failure',
    category: 'disorder',
    aliases: ['CHF', 'congestive heart failure', 'HFrEF', 'HFpEF']
  },
  {
    cui: 'C0004238',
    label: 'Atrial fibrillation',
    category: 'disorder',
    aliases: ['AFib', 'A-fib', 'AF']
  },
  {
    cui: 'C0024117',
    label: 'COPD',
    category: 'disorder',
    aliases: ['chronic obstructive pulmonary disease', 'emphysema']
  },
  {
    cui: 'C1561643',
    label: 'Chronic kidney disease',
    category: 'disorder',
    aliases: ['CKD', 'chronic renal disease', 'renal insufficiency']
  },
  {
    cui: 'C0006826',
    label: 'Active malignancy',
    category: 'disorder',
    aliases: ['cancer', 'malignancy', 'malignant neoplasm', 'tumor'],
    children: ['C0007131', 'C0152013', 'C0149925', 'C0006142', 'C0376358', 'C0009402']
  },
  {
    cui: 'C0007131',
    label: 'Non-small cell lung cancer',
    category: 'disorder',
    aliases: [
      'NSCLC',
      'non small cell lung cancer',
      'non-small-cell lung cancer',
      'non small cell lung carcinoma',
      'non-small cell lung carcinoma'
    ]
  },
  {
    cui: 'C0152013',
    label: 'Lung adenocarcinoma',
    category: 'disorder',
    aliases: ['adenocarcinoma of lung', 'pulmonary adenocarcinoma']
  },
  {
    cui: 'C0149925',
    label: 'Small cell lung cancer',
    category: 'disorder',
    aliases: ['SCLC', 'small-cell lung cancer', 'oat cell carcinoma']
  },
  {
    cui: 'C0019693',
    label: 'HIV infection',
    category: 'disorder',
    aliases: ['HIV', 'AIDS', 'human immunodeficiency virus']
  },
  {
    cui: 'C0019196',
    label: 'Hepatitis C',
    category: 'disorder',
    aliases: ['HCV', 'hep C', 'hepatitis-C']
  },
  {
    cui: 'C0032961',
    label: 'Pregnancy',
    category: 'disorder',
    aliases: ['pregnant', 'gestation', 'gravid']
  },
  {
    cui: 'C0009450',
    label: 'Active infection',
    category: 'disorder',
    aliases: ['active infection', 'systemic infection']
  },
  {
    cui: 'C0011581',
    label: 'Major depressive disorder',
    category: 'disorder',
    aliases: ['depression', 'MDD', 'major depression', 'depressive disorder']
  },
  {
    cui: 'C0003469',
    label: 'Anxiety disorder',
    category: 'disorder',
    aliases: ['anxiety', 'GAD', 'generalized anxiety disorder', 'panic disorder']
  },
  {
    cui: 'C0005586',
    label: 'Bipolar disorder',
    category: 'disorder',
    aliases: ['bipolar', 'manic depression', 'BPD', 'bipolar I', 'bipolar II']
  },
  {
    cui: 'C0036341',
    label: 'Schizophrenia',
    category: 'disorder',
    aliases: ['schizophrenic', 'psychotic disorder', 'psychosis']
  },
  {
    cui: 'C0010068',
    label: 'Coronary artery disease',
    category: 'disorder',
    aliases: ['CAD', 'CHD', 'coronary heart disease', 'ischemic heart disease', 'IHD']
  },
  {
    cui: 'C0027051',
    label: 'Myocardial infarction',
    category: 'disorder',
    aliases: ['MI', 'heart attack', 'NSTEMI', 'STEMI', 'AMI', 'acute MI']
  },
  {
    cui: 'C0020473',
    label: 'Hyperlipidemia',
    category: 'disorder',
    aliases: ['high cholesterol', 'dyslipidemia', 'hypercholesterolemia']
  },
  {
    cui: 'C0028754',
    label: 'Obesity',
    category: 'disorder',
    aliases: ['obese', 'morbid obesity', 'BMI over 30', 'BMI ≥ 30', 'class III obesity']
  },
  {
    cui: 'C0004096',
    label: 'Asthma',
    category: 'disorder',
    aliases: ['asthmatic', 'bronchial asthma', 'reactive airway disease', 'RAD']
  },
  {
    cui: 'C0037315',
    label: 'Obstructive sleep apnea',
    category: 'disorder',
    aliases: ['OSA', 'sleep apnea', 'sleep-disordered breathing', 'SDB']
  },
  {
    cui: 'C0017168',
    label: 'Gastroesophageal reflux disease',
    category: 'disorder',
    aliases: ['GERD', 'acid reflux', 'reflux', 'GORD']
  },
  {
    cui: 'C0022104',
    label: 'Irritable bowel syndrome',
    category: 'disorder',
    aliases: ['IBS']
  },
  {
    cui: 'C0010346',
    label: "Crohn's disease",
    category: 'disorder',
    aliases: ['Crohn', 'Crohns', 'IBD', 'inflammatory bowel disease']
  },
  {
    cui: 'C0009450',
    label: 'Active infection',
    category: 'disorder',
    aliases: ['systemic infection', 'sepsis']
  },
  {
    cui: 'C0019044',
    label: 'Traumatic brain injury',
    category: 'disorder',
    aliases: ['TBI', 'concussion', 'head injury', 'head trauma']
  },
  {
    cui: 'C0497327',
    label: 'Dementia',
    category: 'disorder',
    aliases: ['cognitive decline', 'major neurocognitive disorder'],
    children: ['C0002395', 'C0752347']
  },
  {
    cui: 'C0752347',
    label: 'Lewy body dementia',
    category: 'disorder',
    aliases: ['DLB', 'Lewy body', 'dementia with Lewy bodies', 'LBD']
  },
  {
    cui: 'C0030554',
    label: 'Progressive supranuclear palsy',
    category: 'disorder',
    aliases: ['PSP', 'Steele-Richardson-Olszewski']
  },
  {
    cui: 'C0024183',
    label: 'Multiple system atrophy',
    category: 'disorder',
    aliases: ['MSA', 'Shy-Drager']
  },
  {
    cui: 'C0006142',
    label: 'Breast cancer',
    category: 'disorder',
    aliases: ['breast carcinoma', 'BRCA cancer', 'invasive ductal carcinoma', 'IDC', 'DCIS']
  },
  {
    cui: 'C0376358',
    label: 'Prostate cancer',
    category: 'disorder',
    aliases: ['prostate carcinoma', 'prostatic adenocarcinoma']
  },
  {
    cui: 'C0009402',
    label: 'Colorectal cancer',
    category: 'disorder',
    aliases: ['CRC', 'colon cancer', 'rectal cancer', 'colorectal carcinoma']
  },
  {
    cui: 'C2316212',
    label: 'End-stage renal disease',
    category: 'disorder',
    aliases: ['ESRD', 'end stage renal disease', 'dialysis-dependent', 'kidney failure']
  },
  {
    cui: 'C0011847',
    label: 'Type 1 diabetes mellitus',
    category: 'disorder',
    aliases: ['T1DM', 'type 1 diabetes', 'IDDM', 'juvenile diabetes', 'DM1']
  },

  // ---- Medications ----
  {
    cui: 'C0007297',
    label: 'Carbidopa/Levodopa',
    category: 'medication',
    aliases: ['Levodopa', 'Carbidopa', 'L-DOPA', 'L-Dopa', 'Sinemet', 'Rytary', 'Duopa']
  },
  {
    cui: 'C0085208',
    label: 'Pramipexole',
    category: 'medication',
    aliases: ['Mirapex']
  },
  {
    cui: 'C0034155',
    label: 'Rasagiline',
    category: 'medication',
    aliases: ['Azilect']
  },
  {
    cui: 'C0006012',
    label: 'Donepezil',
    category: 'medication',
    aliases: ['Aricept']
  },
  {
    cui: 'C0078760',
    label: 'Memantine',
    category: 'medication',
    aliases: ['Namenda']
  },
  {
    cui: 'C0021461',
    label: 'Interferon beta',
    category: 'medication',
    aliases: ['interferon-beta', 'IFN-beta', 'IFNB', 'Avonex', 'Rebif', 'Betaseron', 'Plegridy']
  },
  {
    cui: 'C2348070',
    label: 'Ocrelizumab',
    category: 'medication',
    aliases: ['Ocrevus']
  },
  {
    cui: 'C0040051',
    label: 'Riluzole',
    category: 'medication',
    aliases: ['Rilutek', 'Tiglutik']
  },
  {
    cui: 'C0028978',
    label: 'Pyridostigmine',
    category: 'medication',
    aliases: ['Mestinon']
  },
  {
    cui: 'C0022977',
    label: 'Levetiracetam',
    category: 'medication',
    aliases: ['Keppra']
  },
  {
    cui: 'C0042972',
    label: 'Sumatriptan',
    category: 'medication',
    aliases: ['Imitrex', 'triptan', 'triptans']
  },
  {
    cui: 'C2611693',
    label: 'Erenumab (anti-CGRP)',
    category: 'medication',
    aliases: ['Erenumab', 'Aimovig', 'anti-CGRP', 'CGRP inhibitor', 'anti CGRP']
  },

  // ---- Procedures ----
  {
    cui: 'C0085128',
    label: 'Deep brain stimulation',
    category: 'procedure',
    aliases: ['DBS', 'deep-brain stimulation']
  },
  {
    cui: 'C0017067',
    label: 'Gamma knife radiosurgery',
    category: 'procedure',
    aliases: ['gamma knife', 'GKRS', 'stereotactic radiosurgery']
  },
  {
    cui: 'C0030672',
    label: 'Plasmapheresis',
    category: 'procedure',
    aliases: ['plasma exchange', 'PLEX', 'TPE']
  },
  {
    cui: 'C4087108',
    label: 'MR-guided focused ultrasound thalamotomy',
    category: 'procedure',
    aliases: ['MRgFUS', 'focused ultrasound', 'thalamotomy', 'MR-guided ultrasound']
  },

  // ---- Assessments ----
  {
    cui: 'C4076697',
    label: 'MDS-UPDRS Part III',
    category: 'assessment',
    aliases: ['UPDRS', 'UPDRS III', 'MDS-UPDRS', 'MDS UPDRS', 'Unified Parkinson Disease Rating Scale']
  },
  {
    cui: 'C3489472',
    label: 'Montreal Cognitive Assessment (MoCA)',
    category: 'assessment',
    aliases: ['MoCA', 'Montreal Cognitive Assessment']
  },
  {
    cui: 'C2963144',
    label: 'Hoehn and Yahr scale',
    category: 'assessment',
    aliases: ['Hoehn-Yahr', 'Hoehn Yahr', 'H&Y', 'HY stage']
  },
  {
    cui: 'C3489470',
    label: 'Mini-Mental State Examination',
    category: 'assessment',
    aliases: ['MMSE', 'mini-mental', 'mini mental']
  },
  {
    cui: 'C4304635',
    label: 'Expanded Disability Status Scale (EDSS)',
    category: 'assessment',
    aliases: ['EDSS', 'Expanded Disability Status Scale']
  },
  {
    cui: 'C0024204',
    label: 'ALS Functional Rating Scale (ALSFRS-R)',
    category: 'assessment',
    aliases: ['ALSFRS', 'ALSFRS-R', 'ALSFRSR', 'ALS Functional Rating Scale']
  },

  // ---- Labs (numeric measurements) ----
  {
    cui: 'C0858985',
    label: 'Absolute neutrophil count',
    category: 'lab',
    aliases: ['ANC', 'neutrophil count', 'absolute neutrophils']
  },
  {
    cui: 'C0019018',
    label: 'Hemoglobin A1c',
    category: 'lab',
    aliases: ['HbA1c', 'A1c', 'glycated hemoglobin', 'glycohemoglobin']
  },
  {
    cui: 'C0017654',
    label: 'Estimated glomerular filtration rate',
    category: 'lab',
    aliases: ['eGFR', 'GFR', 'glomerular filtration rate']
  },
  {
    cui: 'C0428772',
    label: 'Left ventricular ejection fraction',
    category: 'lab',
    aliases: ['LVEF', 'ejection fraction', 'EF']
  },
  {
    cui: 'C0202022',
    label: 'Forced vital capacity',
    category: 'lab',
    aliases: ['FVC', 'forced vital capacity']
  },
  {
    cui: 'C1305855',
    label: 'Body mass index',
    category: 'lab',
    aliases: ['BMI']
  },
  {
    cui: 'C0023901',
    label: 'Liver function tests',
    category: 'lab',
    aliases: ['LFTs', 'AST', 'ALT', 'transaminases']
  },
  {
    cui: 'C0023508',
    label: 'White blood cell count',
    category: 'lab',
    aliases: ['WBC', 'leukocyte count']
  },
  {
    cui: 'C0032181',
    label: 'Platelet count',
    category: 'lab',
    aliases: ['platelets', 'PLT', 'thrombocytes']
  },

  // ---- Genes / variants ----
  {
    cui: 'C1430218',
    label: 'LRRK2 G2019S variant',
    category: 'gene',
    aliases: ['LRRK2', 'G2019S']
  },
  {
    cui: 'C1414336',
    label: 'GBA pathogenic variant',
    category: 'gene',
    aliases: ['GBA mutation', 'GBA variant', 'glucocerebrosidase']
  },
  {
    cui: 'C1414403',
    label: 'HTT CAG repeat expansion',
    category: 'gene',
    aliases: ['HTT', 'CAG repeat', 'CAG expansion', 'huntingtin']
  },
  {
    cui: 'C1334407',
    label: 'SOD1 pathogenic variant',
    category: 'gene',
    aliases: ['SOD1', 'superoxide dismutase']
  },
  {
    cui: 'C1414581',
    label: 'SMN1 deletion',
    category: 'gene',
    aliases: ['SMN1', 'survival motor neuron']
  }
];

const _CAT: CuiCategory[] = ['disorder', 'medication', 'assessment', 'procedure', 'lab', 'gene'];

function ontologyToEntry(c: OntologyConcept): CuiEntry {
  // 'finding' (e.g. photophobia) has no picker category — surface it as a disorder.
  const category = (_CAT as string[]).includes(c.cat) ? (c.cat as CuiCategory) : 'disorder';
  return { cui: c.cui, label: c.label, category, aliases: c.syn, children: c.children };
}

/**
 * Mock list + curated ontology, ontology winning on CUI collision. This is what
 * the picker, labels, and hierarchy helpers read — so neuro concepts (incl.
 * grouping nodes like "Parkinsonism") and their correct subtypes are selectable,
 * and mislabeled mock collisions are corrected.
 */
export const CUIS: CuiEntry[] = (() => {
  const byId = new Map<string, CuiEntry>();
  for (const m of MOCK_CUIS) {
    // Drop mock concepts the ontology supersedes under a different CUI, so the
    // picker and text-extraction never offer two codes for one concept.
    if (m.cui in MOCK_TO_ONTOLOGY) continue;
    byId.set(m.cui, m);
  }
  for (const o of ONTOLOGY_CONCEPTS) byId.set(o.cui, ontologyToEntry(o));
  return [...byId.values()];
})();

export const CUI_BY_ID: Map<string, CuiEntry> = new Map(CUIS.map((c) => [c.cui, c]));

export function cuiLabel(cui: string): string {
  return CUI_BY_ID.get(cui)?.label ?? cui;
}

export function cuisByCategory(category: CuiCategory): CuiEntry[] {
  return CUIS.filter((c) => c.category === category);
}

/** All descendant CUIs (children, grandchildren, …) plus the CUI itself. */
export function descendantsOf(cui: string): string[] {
  const out = new Set<string>();
  const stack = [cui];
  while (stack.length) {
    const x = stack.pop()!;
    if (out.has(x)) continue;
    out.add(x);
    const entry = CUI_BY_ID.get(x);
    for (const c of entry?.children ?? []) stack.push(c);
  }
  return [...out];
}

/** CUIs that share a parent with the given CUI (excluding itself). */
export function siblingsOf(cui: string): string[] {
  const out = new Set<string>();
  for (const c of CUIS) {
    if (c.children?.includes(cui)) {
      for (const s of c.children) {
        if (s !== cui) out.add(s);
      }
    }
  }
  return [...out];
}

/** Direct children only. */
export function childrenOf(cui: string): string[] {
  return CUI_BY_ID.get(cui)?.children ?? [];
}

// ---- Measurement extraction ----

const OP_NORMALIZE: Record<string, '>=' | '<=' | '>' | '<' | '='> = {
  '>=': '>=',
  '≥': '>=',
  '<=': '<=',
  '≤': '<=',
  '>': '>',
  '<': '<',
  '=': '='
};

/**
 * Extract numeric measurement constraints. Scans for a CUI label/alias followed
 * by an operator + number (with an optional unit), e.g. "ANC >= 1500/mm^3",
 * "MoCA ≥ 24", "EDSS 0-5.5", "HbA1c 7.5-10.5%".
 */
export function extractMeasurementsFromText(
  text: string
): Array<{ cui: string; op: '>=' | '<=' | '>' | '<' | '=' | 'between'; value: number; max?: number; unit?: string }> {
  if (!text || !text.trim()) return [];
  const out: Array<{
    cui: string;
    op: '>=' | '<=' | '>' | '<' | '=' | 'between';
    value: number;
    max?: number;
    unit?: string;
  }> = [];
  const seen = new Set<string>();

  for (const c of CUIS) {
    if (seen.has(c.cui)) continue;
    const tokens = [c.label, ...(c.aliases ?? [])];
    for (const tok of tokens) {
      if (tok.length < 2) continue;
      const escaped = tok.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      // Pattern A: "<tok> <op> <num> [unit]"
      const reA = new RegExp(
        `(?<![A-Za-z0-9])${escaped}\\b[^\\n.]{0,32}?(>=|≥|<=|≤|>|<|=)\\s*([0-9][0-9,]*(?:\\.[0-9]+)?)\\s*([%a-zA-Z/³²°·\\^]*[/\\dA-Za-z%³²°·\\^]*)?`,
        'i'
      );
      let m = reA.exec(text);
      if (m) {
        const op = OP_NORMALIZE[m[1]];
        const value = parseFloat(m[2].replace(/,/g, ''));
        const unit = (m[3] ?? '').trim();
        if (op && Number.isFinite(value)) {
          out.push({ cui: c.cui, op, value, unit: unit || undefined });
          seen.add(c.cui);
          break;
        }
      }
      // Pattern B: "<tok> <num>-<num> [unit]"
      const reB = new RegExp(
        `(?<![A-Za-z0-9])${escaped}\\b[^\\n.]{0,32}?([0-9][0-9,]*(?:\\.[0-9]+)?)\\s*(?:-|–|—|to)\\s*([0-9][0-9,]*(?:\\.[0-9]+)?)\\s*([%a-zA-Z/³²°·\\^]*[/\\dA-Za-z%³²°·\\^]*)?`,
        'i'
      );
      m = reB.exec(text);
      if (m) {
        const lo = parseFloat(m[1].replace(/,/g, ''));
        const hi = parseFloat(m[2].replace(/,/g, ''));
        const unit = (m[3] ?? '').trim();
        if (Number.isFinite(lo) && Number.isFinite(hi)) {
          out.push({ cui: c.cui, op: 'between', value: lo, max: hi, unit: unit || undefined });
          seen.add(c.cui);
          break;
        }
      }
      // Pattern C: "<tok> ... between <num> and <num>"
      const reC = new RegExp(
        `(?<![A-Za-z0-9])${escaped}\\b[^\\n.]{0,32}?between\\s+([0-9][0-9,]*(?:\\.[0-9]+)?)\\s+and\\s+([0-9][0-9,]*(?:\\.[0-9]+)?)`,
        'i'
      );
      m = reC.exec(text);
      if (m) {
        const lo = parseFloat(m[1].replace(/,/g, ''));
        const hi = parseFloat(m[2].replace(/,/g, ''));
        if (Number.isFinite(lo) && Number.isFinite(hi)) {
          out.push({ cui: c.cui, op: 'between', value: lo, max: hi });
          seen.add(c.cui);
          break;
        }
      }
    }
  }
  return out;
}

// ---- Criteria header filter ----

const HEADER_PATTERNS: RegExp[] = [
  // "Inclusion Criteria:", "Key Inclusion Criteria:", "Main Exclusion Criteria"
  /^\s*(?:key|main|primary|principal|important|core)?\s*(?:inclusion|exclusion|eligibility|enrollment|study)\s+criteria\s*:?\s*$/i,
  // "Inclusion:", "Exclusion:", "Eligibility:"
  /^\s*(?:inclusion|exclusion|eligibility|enrollment)\s*:?\s*$/i,
  // "For all participants:", "For all subjects:", "For each patient:"
  /^\s*for\s+(?:all|each|the)?\s*(?:participants?|subjects?|patients?|cohorts?|arms?|groups?)\s*:?\s*$/i,
  // "Both arms:", "Arm 1:", "Cohort A:", "Group 1:", "Phase 1:"
  /^\s*(?:both|all)?\s*(?:arm|cohort|group|phase|part|step|stage|sub[-\s]?study|sub[-\s]?group)\s*[A-Za-z0-9]*\s*:?\s*$/i,
  // "Additional inclusion criteria:" / "Other exclusion criteria:" etc.
  /^\s*(?:additional|other|further|specific|general|primary|secondary)\s+(?:inclusion|exclusion|eligibility)?\s*(?:criteria)?\s*:?\s*$/i,
  // "Notes:", "Note:", "References:", "Definitions:"
  /^\s*(?:notes?|references?|definitions?|abbreviations?|key\s+terms?|disclaimer)\s*:?\s*$/i,
  // Generic single-word labels followed by a colon and nothing else: "Background:", "Purpose:", "Overview:"
  /^\s*[A-Za-z][\w\s-]{0,30}:\s*$/,
  // Numbered/bulleted section labels: "1.", "1)", "•", "-", "*", "i.", "a)"
  /^\s*(?:[ivxIVX]+|[a-zA-Z]|\d+)[.):]\s*$/
];

/** True when a line is just a section header like "Inclusion Criteria:". */
export function isCriteriaHeader(line: string): boolean {
  const t = line.trim();
  if (!t) return true;
  return HEADER_PATTERNS.some((re) => re.test(t));
}

// Build the full token list once: full label, slash/paren-split stems, and
// every declared alias. Cached so the per-keystroke extractor stays cheap.
type Token = { tok: string; cui: string };
const TOKEN_INDEX: Token[] = (() => {
  const out: Token[] = [];
  const seen = new Set<string>();
  for (const c of CUIS) {
    const tokens = new Set<string>();
    tokens.add(c.label);
    for (const part of c.label.split(/[/(),]/)) {
      const t = part.trim();
      if (t.length >= 4) tokens.add(t);
    }
    for (const alias of c.aliases ?? []) {
      const t = alias.trim();
      if (t.length >= 2) tokens.add(t);
    }
    for (const tok of tokens) {
      const key = `${c.cui}::${tok.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ tok, cui: c.cui });
    }
  }
  // Longest first so multi-word phrases bind before single tokens that overlap.
  out.sort((a, b) => b.tok.length - a.tok.length);
  return out;
})();

/**
 * Extract CUIs from free-text criteria. Mocks an ML/NER pipeline by scanning
 * for any of: full label, parenthetical/slash stems, and curated aliases
 * (brand names, abbreviations, common synonyms). Word-boundary aware so
 * "MS" inside "Mass" or "Massachusetts" does not fire.
 */
export function extractCuisFromText(text: string): string[] {
  if (!text || !text.trim()) return [];
  const found = new Set<string>();
  for (const { tok, cui } of TOKEN_INDEX) {
    if (found.has(cui)) continue;
    const escaped = tok.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`(?<![A-Za-z0-9])${escaped}(?![A-Za-z0-9])`, 'i');
    if (re.test(text)) found.add(cui);
  }
  // Canonicalize so a concept yields a single (ontology) CUI — keeps study
  // criteria aligned with how patient CUIs are coded, so AND-matching works.
  return canonicalizeCuis([...found]);
}
