import type { Study, TeamMember } from './types';

export const TEAM_MEMBERS: TeamMember[] = [
  { id: 'tm-1', name: 'Dr. Maya Chen', role: 'Principal Investigator' },
  { id: 'tm-2', name: 'Dr. Rohan Patel', role: 'Co-Investigator' },
  { id: 'tm-3', name: 'Dr. Sofia Alvarez', role: 'Sub-Investigator' },
  { id: 'tm-4', name: 'Jordan Kim, RN', role: 'Study Coordinator' },
  { id: 'tm-5', name: 'Priya Iyer, RN', role: 'Research Nurse' },
  { id: 'tm-6', name: 'Aisha Brooks', role: 'Regulatory Specialist' },
  { id: 'tm-7', name: 'Dr. Marcus Webb', role: 'Principal Investigator' },
  { id: 'tm-8', name: 'Dr. Hannah Liu', role: 'Co-Investigator' },
  { id: 'tm-9', name: 'Dr. Daniel Okafor', role: 'Principal Investigator' },
  { id: 'tm-10', name: 'Elena Vasquez, RN', role: 'Study Coordinator' },
  { id: 'tm-11', name: 'Dr. Reza Mirzai', role: 'Sub-Investigator' },
  { id: 'tm-12', name: 'Tomás Reyes, PharmD', role: 'Research Pharmacist' },
  { id: 'tm-13', name: 'Dr. Chloe Bernard', role: 'Principal Investigator' },
  { id: 'tm-14', name: 'Nina Holloway', role: 'Data Manager' },
  { id: 'tm-15', name: 'Dr. Idris Hassan', role: 'Co-Investigator' },
  { id: 'tm-16', name: 'Sam Whittaker, RN', role: 'Research Nurse' }
];

// Neuro-only for this demo (single department).
export const DEPARTMENTS = ['Neurology'];

export const SEED_STUDIES: Study[] = [
  {
    id: 'study-seed-1',
    ownerId: 'h-stanford',
    name: 'Advanced Parkinson Disease Adjunctive Therapy',
    summary: 'Phase 3 adjunctive therapy in moderate Parkinson disease patients with motor fluctuations on stable carbidopa/levodopa.',
    nctId: 'NCT04267848',
    patientStatus: 'living',
    phase: 'Phase 3',
    teamMemberIds: ['tm-1', 'tm-4', 'tm-12'],
    department: 'Neurology',
    published: true,
    inclusionCriteria:
      "Diagnosis of idiopathic Parkinson's disease (UK Brain Bank).\nMotor fluctuations on stable carbidopa/levodopa.\nMDS-UPDRS Part III score >= 25 in OFF state.\nHoehn and Yahr stage 2-3.",
    exclusionCriteria:
      'Atypical parkinsonism.\nPrior deep brain stimulation surgery.\nMoCA < 22 (significant cognitive impairment).',
    inclusionCuis: ['C0030567', 'C0007297', 'C4076697', 'C2963144'],
    exclusionCuis: ['C0085128', 'C3489472'],
    createdAt: '2026-04-22T08:30:00.000Z'
  },
  {
    id: 'study-seed-2',
    ownerId: 'h-ucsf',
    name: 'Early Parkinson Biomarker Registry',
    summary: 'Observational biomarker registry enrolling early-stage Parkinson disease patients, with a sub-cohort for LRRK2 G2019S carriers.',
    nctId: null,
    patientStatus: 'either',
    phase: 'N/A',
    teamMemberIds: ['tm-3', 'tm-14'],
    department: 'Neurology',
    published: true,
    inclusionCriteria:
      "Clinical diagnosis of Parkinson's disease within prior 3 years.\nMDS-UPDRS Part III documented.\nLRRK2 G2019S carriers prioritized for sub-cohort.",
    exclusionCriteria:
      'Atypical parkinsonism (MSA, PSP, CBS).\nPrior deep brain stimulation.\nSecondary parkinsonism.',
    inclusionCuis: ['C0030567', 'C4076697', 'C1430218'],
    exclusionCuis: ['C0085128'],
    createdAt: '2026-04-18T13:45:00.000Z'
  },
  {
    id: 'study-seed-3',
    ownerId: 'h-mgh',
    name: 'MCI to Alzheimer Conversion Cohort',
    summary: 'Prospective natural history cohort tracking conversion from mild cognitive impairment to Alzheimer disease over 24 months.',
    nctId: null,
    patientStatus: 'living',
    phase: 'N/A',
    teamMemberIds: ['tm-13', 'tm-14'],
    department: 'Neurology',
    published: true,
    inclusionCriteria:
      'Diagnosis of mild cognitive impairment (MCI) per NIA-AA criteria.\nMoCA score 18-25.\nAge 60-85.\nMin 24 months follow-up planned.',
    exclusionCriteria:
      'Established dementia diagnosis at enrollment.\nVascular dementia or frontotemporal dementia.',
    inclusionCuis: ['C0338656', 'C3489472'],
    exclusionCuis: ['C0002395'],
    createdAt: '2026-04-15T09:00:00.000Z'
  },
  {
    id: 'study-seed-4',
    ownerId: '__sponsor__',
    name: 'Anti-Amyloid Maintenance in Mild Alzheimer Disease',
    summary: 'Phase 3 long-term anti-amyloid maintenance trial in patients with mild Alzheimer dementia already on standard symptomatic therapy.',
    nctId: 'NCT05269394',
    patientStatus: 'living',
    phase: 'Phase 3',
    teamMemberIds: ['tm-9', 'tm-10', 'tm-12'],
    department: 'Neurology',
    published: true,
    inclusionCriteria:
      "Probable Alzheimer's disease, mild stage.\nMMSE 20-26.\nOn stable cholinesterase inhibitor or memantine.\nAge 50-85.",
    exclusionCriteria:
      'Significant cerebrovascular disease.\nPrior anti-amyloid therapy.\nContraindication to MRI.',
    inclusionCuis: ['C0002395', 'C3489470', 'C0006012'],
    exclusionCuis: ['C0038454'],
    createdAt: '2026-03-30T11:20:00.000Z'
  },
  {
    id: 'study-seed-5',
    ownerId: 'h-cleveland',
    name: 'Multiple Sclerosis B-Cell Depletion Switching Trial',
    summary: 'Phase 3 trial evaluating switching from interferon beta to ocrelizumab in relapsing-remitting MS with continued disease activity.',
    nctId: 'NCT04035005',
    patientStatus: 'living',
    phase: 'Phase 3',
    teamMemberIds: ['tm-7', 'tm-15', 'tm-5'],
    department: 'Neurology',
    published: false,
    inclusionCriteria:
      'Relapsing-remitting MS per 2017 McDonald criteria.\nEDSS 0-5.5.\nPrior interferon beta or disease activity on first-line DMT.\nAge 18-60.',
    exclusionCriteria:
      'Primary or secondary progressive MS without activity.\nNeuromyelitis optica spectrum disorder.\nActive infection.',
    inclusionCuis: ['C0026769', 'C4304635', 'C0021461'],
    exclusionCuis: ['C1306006'],
    createdAt: '2026-03-22T15:00:00.000Z'
  },
  {
    id: 'study-seed-6',
    ownerId: '__sponsor__',
    name: 'ALS SOD1 Antisense Oligonucleotide Open-Label Extension',
    summary: 'Open-label extension for SOD1-mutation ALS patients receiving antisense oligonucleotide therapy, tracking ALSFRS-R progression.',
    nctId: 'NCT02623699',
    patientStatus: 'living',
    phase: 'Phase 3',
    teamMemberIds: ['tm-9', 'tm-12', 'tm-14'],
    department: 'Neurology',
    published: false,
    inclusionCriteria:
      'Definite or probable ALS per El Escorial criteria.\nDocumented SOD1 pathogenic variant.\nALSFRS-R score >= 30 at screening.',
    exclusionCriteria:
      'Tracheostomy or non-invasive ventilation > 22h/day.\nConcurrent enrollment in another disease-modifying trial.',
    inclusionCuis: ['C0002736', 'C1334407', 'C0024204', 'C0040051'],
    exclusionCuis: [],
    createdAt: '2026-03-12T10:00:00.000Z'
  },
  {
    id: 'study-seed-7',
    ownerId: 'h-mayo',
    name: 'Drug-Resistant Focal Epilepsy Adjunctive Therapy',
    summary: 'Phase 2 adjunctive ASM trial in adults with drug-resistant focal epilepsy and a high baseline seizure frequency.',
    nctId: 'NCT04701463',
    patientStatus: 'living',
    phase: 'Phase 2',
    teamMemberIds: ['tm-7', 'tm-11', 'tm-5'],
    department: 'Neurology',
    published: true,
    inclusionCriteria:
      'Drug-resistant focal epilepsy (failure of >= 2 ASMs at adequate doses).\n>= 4 focal seizures per 28 days.\nOn stable levetiracetam or other ASM.\nAge 18-65.',
    exclusionCriteria:
      'Generalized epilepsy.\nProgressive neurologic disease.\nActive psychiatric instability.',
    inclusionCuis: ['C0014534', 'C0022977'],
    exclusionCuis: [],
    createdAt: '2026-03-05T14:30:00.000Z'
  },
  {
    id: 'study-seed-8',
    ownerId: 'h-ucla',
    name: 'Chronic Migraine CGRP Prevention Real-World Cohort',
    summary: 'Real-world Phase 4 cohort following chronic migraine patients initiating anti-CGRP monoclonal antibodies for prevention.',
    nctId: null,
    patientStatus: 'living',
    phase: 'Phase 4',
    teamMemberIds: ['tm-13', 'tm-6', 'tm-16'],
    department: 'Neurology',
    published: true,
    inclusionCriteria:
      'Chronic migraine (>= 15 headache days/month, >= 8 migrainous).\nInitiating anti-CGRP therapy.\n>= 3 month baseline headache diary.\nAge 18-65.',
    exclusionCriteria:
      'Medication overuse headache without prior detox.\nSecondary headache disorder.\nPregnancy.',
    inclusionCuis: ['C1660797', 'C2611693'],
    exclusionCuis: ['C0085584'],
    createdAt: '2026-02-26T11:15:00.000Z'
  },
  {
    id: 'study-seed-9',
    ownerId: 'h-jhh',
    name: 'Huntington Disease Prodromal Biomarker Study',
    summary: 'Longitudinal biomarker study in HTT CAG-expansion carriers without motor symptoms, characterizing prodromal Huntington disease.',
    nctId: 'NCT01590888',
    patientStatus: 'either',
    phase: 'N/A',
    teamMemberIds: ['tm-3', 'tm-14'],
    department: 'Neurology',
    published: false,
    inclusionCriteria:
      "HTT CAG repeat expansion >= 36.\nNo motor diagnosis of Huntington's disease.\nAge 25-65.",
    exclusionCriteria:
      'Established HD motor diagnosis.\nMajor psychiatric instability requiring inpatient care.',
    inclusionCuis: ['C1414403'],
    exclusionCuis: ['C0020179'],
    createdAt: '2026-02-15T09:30:00.000Z'
  },
  {
    id: 'study-seed-10',
    ownerId: '__sponsor__',
    name: 'Generalized Myasthenia Gravis FcRn Inhibitor Trial',
    summary: 'Phase 3 FcRn inhibitor trial in generalized myasthenia gravis patients with positive AChR antibodies on standard immunosuppression.',
    nctId: 'NCT04951622',
    patientStatus: 'living',
    phase: 'Phase 3',
    teamMemberIds: ['tm-2', 'tm-10', 'tm-12'],
    department: 'Neurology',
    published: true,
    inclusionCriteria:
      'Generalized myasthenia gravis with positive AChR antibodies.\nMGFA Class II-IV.\nOn stable pyridostigmine and/or immunosuppressant.\nAge 18-85.',
    exclusionCriteria:
      'MG crisis within prior 30 days.\nThymectomy within prior 6 months.\nActive infection.',
    inclusionCuis: ['C0026896', 'C0028978'],
    exclusionCuis: ['C0030672'],
    createdAt: '2026-02-08T10:45:00.000Z'
  },
  {
    id: 'study-seed-11',
    ownerId: 'h-northwestern',
    name: 'NMOSD Acute Attack Plasmapheresis Registry',
    summary: 'Registry of NMOSD patients treated with plasmapheresis during an acute attack, capturing recovery and relapse outcomes.',
    nctId: null,
    patientStatus: 'either',
    phase: 'N/A',
    teamMemberIds: ['tm-15', 'tm-14'],
    department: 'Neurology',
    published: true,
    inclusionCriteria:
      'Diagnosis of NMOSD per IPND 2015 criteria.\nAcute attack within prior 21 days.\nReceived plasmapheresis.',
    exclusionCriteria:
      'Multiple sclerosis as primary diagnosis.\nIncomplete attack documentation.',
    inclusionCuis: ['C1306006', 'C0030672'],
    exclusionCuis: ['C0026769'],
    createdAt: '2026-01-29T13:00:00.000Z'
  },
  {
    id: 'study-seed-12',
    ownerId: 'h-uw',
    name: 'Essential Tremor MR-Guided Focused Ultrasound Outcomes',
    summary: 'Outcomes cohort for medication-refractory essential tremor patients undergoing unilateral MR-guided focused ultrasound thalamotomy.',
    nctId: 'NCT03253991',
    patientStatus: 'living',
    phase: 'Phase 4',
    teamMemberIds: ['tm-1', 'tm-11'],
    department: 'Neurology',
    published: true,
    inclusionCriteria:
      'Essential tremor refractory to >= 2 medications.\nDisabling tremor (CRST score >= 20).\nAge >= 22.\nCandidate for unilateral thalamotomy.',
    exclusionCriteria:
      'Atypical or dystonic tremor.\nPrior thalamic surgery.\nContraindication to MRI.',
    inclusionCuis: ['C0014877', 'C4087108'],
    exclusionCuis: [],
    createdAt: '2026-01-22T08:50:00.000Z'
  },
  {
    id: 'study-seed-13',
    ownerId: 'h-nyu',
    name: 'Trigeminal Neuralgia Microvascular Decompression Cohort',
    summary: 'Surgical outcomes cohort for classical trigeminal neuralgia patients with MR-confirmed neurovascular conflict, refractory to medical therapy.',
    nctId: null,
    patientStatus: 'living',
    phase: 'N/A',
    teamMemberIds: ['tm-7', 'tm-16'],
    department: 'Neurology',
    published: false,
    inclusionCriteria:
      'Classical trigeminal neuralgia per ICHD-3 criteria.\nFailure of carbamazepine or oxcarbazepine.\nMR-confirmed neurovascular conflict.',
    exclusionCriteria:
      'Multiple sclerosis-related TN.\nPrior gamma knife radiosurgery.\nContraindication to general anesthesia.',
    inclusionCuis: ['C0040820'],
    exclusionCuis: ['C0026769', 'C0017067'],
    createdAt: '2026-01-15T15:30:00.000Z'
  },
  {
    id: 'study-seed-14',
    ownerId: 'h-houston',
    name: 'Acute Ischemic Stroke Endovascular Outcomes',
    summary: 'Multi-site outcomes registry for acute ischemic stroke patients with large vessel occlusion treated with endovascular thrombectomy.',
    nctId: 'NCT03805308',
    patientStatus: 'either',
    phase: 'N/A',
    teamMemberIds: ['tm-3', 'tm-9', 'tm-10'],
    department: 'Neurology',
    published: true,
    inclusionCriteria:
      'Acute ischemic stroke with large vessel occlusion.\nNIHSS >= 6 at presentation.\nThrombectomy attempted within 24h of last known well.',
    exclusionCriteria:
      'Pre-stroke mRS > 2.\nIntracranial hemorrhage on baseline imaging.',
    inclusionCuis: ['C0038454'],
    exclusionCuis: [],
    createdAt: '2026-01-08T16:10:00.000Z'
  },
  {
    id: 'study-seed-15',
    ownerId: 'h-stanford',
    name: 'Spinal Muscular Atrophy Real-World Treatment Registry',
    summary: 'Real-world Phase 4 registry of genetically confirmed SMA patients on disease-modifying therapy (nusinersen, risdiplam, or onasemnogene).',
    nctId: 'NCT04488133',
    patientStatus: 'living',
    phase: 'Phase 4',
    teamMemberIds: ['tm-9', 'tm-12'],
    department: 'Neurology',
    published: true,
    inclusionCriteria:
      'Genetically confirmed SMN1 deletion.\nSMA Type I, II, or III.\nReceiving disease-modifying therapy (nusinersen, risdiplam, or onasemnogene).',
    exclusionCriteria:
      'No documented SMN1 status.\nActive serious infection.',
    inclusionCuis: ['C0085593', 'C1414581'],
    exclusionCuis: [],
    createdAt: '2026-01-04T10:20:00.000Z'
  },
  {
    id: 'study-seed-16',
    ownerId: 'h-stanford',
    name: 'Deep Brain Stimulation Long-Term Outcomes',
    summary: 'Prospective registry of Parkinson and essential tremor patients post-DBS, capturing motor outcomes and stimulator parameter optimization.',
    nctId: null,
    patientStatus: 'living',
    phase: 'N/A',
    teamMemberIds: ['tm-1', 'tm-11'],
    department: 'Neurology',
    published: true,
    inclusionCriteria:
      'History of deep brain stimulation surgery for PD or essential tremor.\nMin 12 months post-implantation.\nAble to attend in-person follow-up at Stanford.',
    exclusionCriteria:
      'Multiple revisions of DBS leads.\nActive infection at hardware site.',
    inclusionCuis: ['C0085128'],
    exclusionCuis: [],
    createdAt: '2026-04-08T09:30:00.000Z'
  },
  {
    id: 'study-seed-17',
    ownerId: 'h-cleveland',
    name: 'SUDEP Risk Stratification in Refractory Epilepsy',
    summary: 'Observational cohort to characterize SUDEP risk factors in adults with drug-resistant epilepsy on >=3 ASMs.',
    nctId: null,
    patientStatus: 'either',
    phase: 'N/A',
    teamMemberIds: ['tm-7', 'tm-11', 'tm-14'],
    department: 'Neurology',
    published: false,
    inclusionCriteria:
      'Drug-resistant focal or generalized epilepsy.\nOn >=3 ASMs at maximum tolerated doses.\nAdmitted to EMU or with documented seizure frequency.',
    exclusionCriteria:
      'Psychogenic non-epileptic seizures.\nIncomplete seizure documentation.',
    inclusionCuis: ['C0014534', 'C0022977'],
    exclusionCuis: [],
    createdAt: '2026-04-12T14:00:00.000Z'
  },
  {
    id: 'study-seed-18',
    ownerId: 'h-cleveland',
    name: 'Stroke Recovery Robotics Pilot',
    summary: 'Phase 2 single-arm pilot of upper-extremity robot-assisted therapy in subacute ischemic stroke patients.',
    nctId: null,
    patientStatus: 'living',
    phase: 'Phase 2',
    teamMemberIds: ['tm-2', 'tm-10'],
    department: 'Neurology',
    published: true,
    inclusionCriteria:
      'Acute ischemic stroke 2-12 weeks prior.\nUpper-extremity Fugl-Meyer 20-50.\nAble to consent and tolerate 60-min therapy sessions.',
    exclusionCriteria:
      'Pre-stroke mRS > 2.\nSevere shoulder pain.\nUnstable cardiac disease.',
    inclusionCuis: ['C0038454'],
    exclusionCuis: [],
    createdAt: '2026-03-15T11:45:00.000Z'
  },
  {
    id: 'study-seed-19',
    ownerId: 'h-mayo',
    name: 'Lewy Body Dementia Prodromal Cohort',
    summary: 'Longitudinal study tracking REM sleep behavior disorder patients to characterize prodromal Lewy body dementia.',
    nctId: null,
    patientStatus: 'living',
    phase: 'N/A',
    teamMemberIds: ['tm-13', 'tm-3'],
    department: 'Neurology',
    published: true,
    inclusionCriteria:
      'Polysomnography-confirmed REM sleep behavior disorder.\nNo current diagnosis of dementia or Parkinson disease.\nAge 50-85.',
    exclusionCriteria:
      "Existing diagnosis of Parkinson's disease, Alzheimer's, or other dementia.",
    inclusionCuis: ['C3489472'],
    exclusionCuis: ['C0030567', 'C0002395'],
    createdAt: '2026-04-19T08:50:00.000Z'
  },
  {
    id: 'study-seed-20',
    ownerId: 'h-mayo',
    name: 'Migraine Hormonal Trigger Registry',
    summary: 'Real-world registry tracking menstrual migraine patterns and response to hormonal versus CGRP-targeted prevention.',
    nctId: null,
    patientStatus: 'living',
    phase: 'Phase 4',
    teamMemberIds: ['tm-13', 'tm-16'],
    department: 'Neurology',
    published: false,
    inclusionCriteria:
      'Female aged 18-50 with migraine.\nDocumented menstrual migraine pattern.\nMin 3 months baseline headache diary.',
    exclusionCriteria:
      'Pregnancy or breastfeeding.\nCurrent use of hormonal contraception not stable for 6+ months.',
    inclusionCuis: ['C0149931'],
    exclusionCuis: [],
    createdAt: '2026-03-26T10:15:00.000Z'
  },
  {
    id: 'study-seed-21',
    ownerId: 'h-mgh',
    name: 'Tau PET Imaging in Early Alzheimer Disease',
    summary: 'Cross-sectional imaging study correlating tau PET burden with cognitive trajectory in early AD.',
    nctId: null,
    patientStatus: 'living',
    phase: 'N/A',
    teamMemberIds: ['tm-9', 'tm-14'],
    department: 'Neurology',
    published: true,
    inclusionCriteria:
      'Probable Alzheimer disease, mild stage.\nMMSE 20-28.\nAble to undergo PET imaging.',
    exclusionCriteria:
      'Contraindication to PET (uncontrolled diabetes, claustrophobia requiring sedation).',
    inclusionCuis: ['C0002395', 'C3489470'],
    exclusionCuis: [],
    createdAt: '2026-04-02T13:20:00.000Z'
  },
  {
    id: 'study-seed-22',
    ownerId: 'h-ucsf',
    name: 'Frontotemporal Dementia Family Cohort',
    summary: 'Longitudinal cohort of symptomatic FTD probands and their at-risk family members carrying MAPT, GRN, or C9orf72 variants.',
    nctId: null,
    patientStatus: 'either',
    phase: 'N/A',
    teamMemberIds: ['tm-3', 'tm-15'],
    department: 'Neurology',
    published: true,
    inclusionCriteria:
      'Clinical diagnosis of FTD or first-degree family member of FTD proband with known pathogenic MAPT, GRN, or C9orf72 variant.',
    exclusionCriteria:
      'Probable Alzheimer disease as primary diagnosis.',
    inclusionCuis: ['C3489472', 'C3489470'],
    exclusionCuis: ['C0002395'],
    createdAt: '2026-03-19T16:00:00.000Z'
  },
  {
    id: 'study-seed-23',
    ownerId: 'h-jhh',
    name: 'Neuromyelitis Optica Long-Term Disability Registry',
    summary: 'Long-term outcomes registry of AQP4-IgG positive NMOSD patients on B-cell or complement-targeted therapy.',
    nctId: null,
    patientStatus: 'living',
    phase: 'N/A',
    teamMemberIds: ['tm-15', 'tm-14'],
    department: 'Neurology',
    published: false,
    inclusionCriteria:
      'NMOSD per IPND 2015 criteria with positive AQP4-IgG.\nMin 2 years on disease-modifying therapy.',
    exclusionCriteria:
      'Multiple sclerosis as primary diagnosis.\nSeronegative NMOSD.',
    inclusionCuis: ['C1306006'],
    exclusionCuis: ['C0026769'],
    createdAt: '2026-04-21T09:10:00.000Z'
  },
  {
    id: 'study-seed-24',
    ownerId: 'h-nyu',
    name: 'Trigeminal Neuralgia Gamma Knife Outcomes',
    summary: 'Prospective single-site cohort tracking pain outcomes and recurrence after gamma knife radiosurgery for trigeminal neuralgia.',
    nctId: null,
    patientStatus: 'living',
    phase: 'N/A',
    teamMemberIds: ['tm-7', 'tm-16'],
    department: 'Neurology',
    published: true,
    inclusionCriteria:
      'Classical or idiopathic trigeminal neuralgia refractory to medical therapy.\nUnderwent gamma knife radiosurgery within prior 36 months.',
    exclusionCriteria:
      'Multiple sclerosis-related TN.\nPrior microvascular decompression.',
    inclusionCuis: ['C0040820', 'C0017067'],
    exclusionCuis: ['C0026769'],
    createdAt: '2026-04-04T15:40:00.000Z'
  },
  {
    id: 'study-seed-25',
    ownerId: 'h-ucla',
    name: 'Pediatric Epilepsy Genetic Testing Cohort',
    summary: 'Diagnostic yield of comprehensive genetic panels in pediatric patients with new-onset epilepsy of unknown etiology.',
    nctId: null,
    patientStatus: 'living',
    phase: 'N/A',
    teamMemberIds: ['tm-13', 'tm-10'],
    department: 'Neurology',
    published: true,
    inclusionCriteria:
      'Age 0-17 with new-onset epilepsy.\nNon-lesional MRI.\nNo identified metabolic etiology.',
    exclusionCriteria:
      'Acute symptomatic seizures.\nKnown structural lesion on imaging.',
    inclusionCuis: ['C0014544'],
    exclusionCuis: [],
    createdAt: '2026-04-14T11:25:00.000Z'
  }
];
