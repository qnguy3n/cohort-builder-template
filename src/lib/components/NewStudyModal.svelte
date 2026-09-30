<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { studies, newStudyId } from '$lib/studies';
  import { TEAM_MEMBERS } from '$lib/mockData';
  import { activeHospital, hospitalShortLabel } from '$lib/hospitals';
  import {
    PHASES,
    PATIENT_STATUS_OPTIONS,
    SPONSOR_VIEW_ID,
    type Study,
    type TrialPhase,
    type PatientStatus
  } from '$lib/types';
  import { fetchNctStudy, normalizeNctId, type NctImportResult } from '$lib/clinicalTrials';
  import { extractCuisFromText, cuiLabel, CUI_BY_ID } from '$lib/cui';
  import { matchStudy, patientsLoading } from '$lib/patients';
  import TeamPicker from './TeamPicker.svelte';

  const dispatch = createEventDispatcher<{ close: void; created: Study }>();

  let name = '';
  let summary = '';
  let nctIdInput = '';
  let importedNctId: string | null = null;
  let phase: TrialPhase = 'N/A';
  let patientStatus: PatientStatus = 'living';
  let teamMemberIds: string[] = [];
  let published = false;
  let inclusionCriteria = '';
  let exclusionCriteria = '';

  let importing = false;
  let importError = '';
  let importSuccess = '';
  let importedMeta: NctImportResult | null = null;
  let saving = false;
  let formError = '';

  let detailsOpen = false;

  // Debounced "ML pipeline" CUI extraction with a visible loading state.
  let inclusionCuis: string[] = [];
  let exclusionCuis: string[] = [];
  let extractingInc = false;
  let extractingExc = false;
  let incExtractTimer: ReturnType<typeof setTimeout> | null = null;
  let excExtractTimer: ReturnType<typeof setTimeout> | null = null;

  function scheduleIncExtract(text: string) {
    if (incExtractTimer) clearTimeout(incExtractTimer);
    if (!text.trim()) {
      inclusionCuis = [];
      extractingInc = false;
      return;
    }
    extractingInc = true;
    incExtractTimer = setTimeout(() => {
      inclusionCuis = extractCuisFromText(text);
      extractingInc = false;
    }, 600);
  }
  function scheduleExcExtract(text: string) {
    if (excExtractTimer) clearTimeout(excExtractTimer);
    if (!text.trim()) {
      exclusionCuis = [];
      extractingExc = false;
      return;
    }
    extractingExc = true;
    excExtractTimer = setTimeout(() => {
      exclusionCuis = extractCuisFromText(text);
      extractingExc = false;
    }, 600);
  }

  $: scheduleIncExtract(inclusionCriteria);
  $: scheduleExcExtract(exclusionCriteria);

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  async function handleImport(opts: { silent?: boolean } = {}) {
    importError = '';
    if (!opts.silent) importSuccess = '';
    if (!nctIdInput.trim()) {
      if (!opts.silent) importError = 'Enter an NCT ID first.';
      return;
    }
    importing = true;
    try {
      const result = await fetchNctStudy(nctIdInput);
      name = result.name;
      summary = result.summary;
      phase = result.phase;
      inclusionCriteria = result.inclusionCriteria;
      exclusionCriteria = result.exclusionCriteria;
      importedNctId = result.nctId;
      nctIdInput = result.nctId;
      importedMeta = result;
      detailsOpen = true; // surface the populated metadata
      importSuccess = `Imported ${result.nctId} from ClinicalTrials.gov.`;
    } catch (err) {
      importError = err instanceof Error ? err.message : 'Import failed.';
      importedMeta = null;
    } finally {
      importing = false;
    }
  }

  // Auto-fetch when input matches a valid NCT pattern.
  $: {
    if (debounceTimer) clearTimeout(debounceTimer);
    const cleaned = nctIdInput.trim().toUpperCase();
    if (/^NCT\d{8}$/.test(cleaned) && cleaned !== importedNctId && !importing) {
      debounceTimer = setTimeout(() => {
        handleImport({ silent: true });
      }, 500);
    }
  }


  // Live feasibility scoped to the active tenant only.
  $: previewCount = $patientsLoading
    ? 0
    : matchStudy(inclusionCuis, exclusionCuis, patientStatus, $activeHospital).length;
  $: scopeLabel =
    $activeHospital === SPONSOR_VIEW_ID
      ? 'all hospitals'
      : hospitalShortLabel($activeHospital);

  function fmt(n: number) {
    return n.toLocaleString();
  }

  function handleSubmit() {
    formError = '';
    if (!name.trim()) {
      formError = 'Study name is required. Open Study metadata to set one.';
      detailsOpen = true;
      return;
    }
    saving = true;
    const study: Study = {
      id: newStudyId(),
      ownerId: $activeHospital,
      name: name.trim(),
      summary: summary.trim(),
      nctId: importedNctId ?? (nctIdInput.trim() ? normalizeNctId(nctIdInput) : null),
      patientStatus,
      phase,
      teamMemberIds,
      department: 'Neurology',
      // Sponsor studies don't have a draft/published lifecycle.
      published: $activeHospital === SPONSOR_VIEW_ID ? true : published,
      inclusionCriteria: inclusionCriteria.trim(),
      exclusionCriteria: exclusionCriteria.trim(),
      inclusionCuis,
      exclusionCuis,
      createdAt: new Date().toISOString()
    };
    studies.add(study);
    saving = false;
    dispatch('created', study);
    dispatch('close');
  }

  function handleEsc(e: KeyboardEvent) {
    if (e.key === 'Escape') dispatch('close');
  }

  function categoryColor(cat: string): string {
    if (cat === 'disorder') return 'oklch(60% 0.036 115)';
    if (cat === 'medication') return 'oklch(60% 0.140 240)';
    if (cat === 'procedure') return 'oklch(62% 0.130 40)';
    if (cat === 'assessment') return 'oklch(72% 0.145 75)';
    if (cat === 'gene') return 'oklch(58% 0.130 155)';
    return 'oklch(58% 0.011 90)';
  }
</script>

<svelte:window on:keydown={handleEsc} />

<!-- svelte-ignore a11y_interactive_supports_focus a11y_click_events_have_key_events -->
<div
  class="overlay"
  role="dialog"
  aria-modal="true"
  aria-labelledby="new-study-title"
  on:click={() => dispatch('close')}
>
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions a11y_click_events_have_key_events -->
  <div class="modal" on:click|stopPropagation role="document">
    <header class="modal-head">
      <h2 id="new-study-title">New study</h2>
      <div class="head-actions">
        {#if $activeHospital !== SPONSOR_VIEW_ID}
          <button
            type="button"
            class="pub-toggle"
            class:on={published}
            aria-pressed={published}
            title={published
              ? 'Published — visible to other doctors in your network. Click to unpublish.'
              : 'Draft — only visible to you. Click to publish to your network.'}
            on:click={() => (published = !published)}
          >
            <span class="pub-dot" aria-hidden="true"></span>
            {published ? 'Published' : 'Draft'}
          </button>
        {/if}
        <button type="button" class="close-btn" aria-label="Close" on:click={() => dispatch('close')}>×</button>
      </div>
    </header>

    <form class="modal-body" on:submit|preventDefault={handleSubmit}>
      <!-- Optional NCT import -->
      <div class="nct-section">
        <label for="nct">
          Import from ClinicalTrials.gov
          <span class="optional">optional · auto-fetches when you type a valid NCT id</span>
        </label>
        <div class="nct-row">
          <input
            id="nct"
            type="text"
            placeholder="e.g. NCT04267848"
            bind:value={nctIdInput}
            disabled={importing}
          />
          <button type="button" class="btn btn-secondary" on:click={() => handleImport()} disabled={importing}>
            {importing ? 'Importing…' : 'Import'}
          </button>
        </div>
        {#if importError}<div class="hint hint-error">{importError}</div>{/if}
        {#if importSuccess}<div class="hint hint-ok">{importSuccess}</div>{/if}
        {#if importedMeta}
          <div class="meta-card">
            <div class="meta-grid">
              {#if importedMeta.sponsor}
                <div><span class="meta-label">Sponsor</span><div>{importedMeta.sponsor}</div></div>
              {/if}
              {#if importedMeta.studyType}
                <div><span class="meta-label">Type</span><div>{importedMeta.studyType}</div></div>
              {/if}
              {#if importedMeta.overallStatus}
                <div><span class="meta-label">Status</span><div>{importedMeta.overallStatus}</div></div>
              {/if}
              {#if importedMeta.minAge || importedMeta.maxAge}
                <div>
                  <span class="meta-label">Age</span>
                  <div>{importedMeta.minAge || 'any'}{importedMeta.maxAge ? ` – ${importedMeta.maxAge}` : ''}</div>
                </div>
              {/if}
            </div>
          </div>
        {/if}
      </div>

      <!-- I/E criteria — primary editing surface -->
      <section class="ie-block">
        <header class="ie-section-head">
          <h3>Inclusion / Exclusion criteria</h3>
          <p class="muted small">
            Type or paste free text. As you write, our AI agents map phrases to UMLS-style
            CUIs in real time and recompute patient feasibility below.
          </p>
        </header>

        <div class="ie-grid">
          <div class="ie-side">
            <label for="inc" class="ie-label inc-label">
              Inclusion
              <span class="cui-count">
                {#if extractingInc}
                  <span class="extracting">
                    <span class="mini-spinner"></span>
                    Extracting CUIs…
                  </span>
                {:else}
                  {inclusionCuis.length} CUI{inclusionCuis.length === 1 ? '' : 's'} extracted
                {/if}
              </span>
            </label>
            <textarea
              id="inc"
              rows="8"
              bind:value={inclusionCriteria}
              placeholder="e.g. Diagnosis of Parkinson's disease, on Carbidopa/Levodopa, MDS-UPDRS Part III ≥ 25…"
            ></textarea>
            <div class="extracted-chips">
              {#each inclusionCuis as cui}
                {@const entry = CUI_BY_ID.get(cui)}
                <span class="chip inc" title={cui}>
                  {#if entry}<span class="cat-dot" style="background: {categoryColor(entry.category)}"></span>{/if}
                  {cuiLabel(cui)}
                </span>
              {:else}
                <span class="muted small">{extractingInc ? 'Working…' : 'No concepts detected yet.'}</span>
              {/each}
            </div>
          </div>

          <div class="ie-side">
            <label for="exc" class="ie-label exc-label">
              Exclusion
              <span class="cui-count">
                {#if extractingExc}
                  <span class="extracting">
                    <span class="mini-spinner"></span>
                    Extracting CUIs…
                  </span>
                {:else}
                  {exclusionCuis.length} CUI{exclusionCuis.length === 1 ? '' : 's'} extracted
                {/if}
              </span>
            </label>
            <textarea
              id="exc"
              rows="8"
              bind:value={exclusionCriteria}
              placeholder="e.g. Atypical parkinsonism, prior deep brain stimulation, MoCA < 22…"
            ></textarea>
            <div class="extracted-chips">
              {#each exclusionCuis as cui}
                {@const entry = CUI_BY_ID.get(cui)}
                <span class="chip exc" title={cui}>
                  {#if entry}<span class="cat-dot" style="background: {categoryColor(entry.category)}"></span>{/if}
                  {cuiLabel(cui)}
                </span>
              {:else}
                <span class="muted small">{extractingExc ? 'Working…' : 'No exclusions detected.'}</span>
              {/each}
            </div>
          </div>
        </div>
      </section>

      <!-- Collapsible study metadata -->
      <details class="details-section" bind:open={detailsOpen}>
        <summary>
          <span>Study metadata</span>
          <span class="muted small">name · summary · phase · patient status · team · visibility</span>
        </summary>

        <div class="details-body">
          <div class="grid-2">
            <div class="field">
              <label for="m-name">Study name</label>
              <input id="m-name" type="text" bind:value={name} placeholder="e.g. Advanced Parkinson Adjunctive Therapy" />
            </div>
            <div class="field">
              <label for="m-phase">Phase</label>
              <select id="m-phase" bind:value={phase}>
                {#each PHASES as option}
                  <option value={option}>{option}</option>
                {/each}
              </select>
            </div>
          </div>

          <div class="field">
            <label for="m-summary">Summary</label>
            <textarea id="m-summary" rows="2" bind:value={summary} placeholder="One- or two-sentence description."></textarea>
          </div>

          <div class="field">
            <label for="m-ps">Patient status</label>
            <select id="m-ps" bind:value={patientStatus}>
              {#each PATIENT_STATUS_OPTIONS as option}
                <option value={option.value}>{option.label}</option>
              {/each}
            </select>
          </div>

          <div class="field">
            <span class="label-like">Trial team ({teamMemberIds.length})</span>
            <TeamPicker members={TEAM_MEMBERS} bind:selected={teamMemberIds} />
          </div>
        </div>
      </details>

      {#if formError}<div class="error">{formError}</div>{/if}

      <!-- Sticky feasibility footer -->
      <div class="feasibility">
        <div class="feas-cell main">
          <div class="feas-num">{$patientsLoading ? '…' : fmt(previewCount)}</div>
          <div class="muted small">matching in <strong>{scopeLabel}</strong></div>
        </div>
        <div class="feas-actions">
          <button type="button" class="btn btn-ghost" on:click={() => dispatch('close')}>Cancel</button>
          <button type="submit" class="btn btn-primary" disabled={saving}>
            {saving ? 'Saving…' : 'Save study'}
          </button>
        </div>
      </div>
    </form>
  </div>
</div>

<style>
  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(20, 24, 16, 0.45);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1200;
    padding: var(--space-4);
  }
  .modal {
    background: var(--bg-surface);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-lg);
    width: 100%;
    max-width: 880px;
    max-height: 92vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .modal-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-4) var(--space-5);
    border-bottom: 1px solid var(--border-subtle);
  }
  .modal-head h2 {
    font-family: var(--font-display);
    font-size: var(--text-lg);
    font-weight: 600;
    margin: 0;
  }
  .head-actions {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .pub-toggle {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: var(--bg-sunken);
    color: var(--fg-muted);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-full);
    padding: 4px 12px;
    font-size: var(--text-xs);
    font-weight: 600;
    cursor: pointer;
    font-family: inherit;
    transition: background 0.12s ease, color 0.12s ease, border-color 0.12s ease;
  }
  .pub-toggle:hover {
    border-color: var(--border-default);
    color: var(--fg-default);
  }
  .pub-toggle.on {
    background: var(--success-50, var(--brand-soft));
    color: var(--success-700);
    border-color: var(--success-700);
  }
  .pub-dot {
    width: 8px;
    height: 8px;
    border-radius: var(--radius-full);
    background: var(--fg-muted);
    transition: background 0.12s ease;
  }
  .pub-toggle.on .pub-dot {
    background: var(--success-700);
    box-shadow: 0 0 0 3px rgba(46, 122, 76, 0.18);
  }
  .close-btn {
    background: transparent;
    border: none;
    cursor: pointer;
    color: var(--fg-muted);
    font-size: 22px;
    line-height: 1;
    padding: 4px 10px;
    border-radius: var(--radius-md);
  }
  .close-btn:hover {
    background: var(--bg-sunken);
    color: var(--fg-default);
  }
  .modal-body {
    padding: var(--space-4) var(--space-5) 0;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }
  .small {
    font-size: var(--text-xs);
  }

  /* NCT section */
  .nct-section {
    background: var(--bg-sunken);
    border-radius: var(--radius-md);
    padding: var(--space-3);
  }
  .nct-section label[for='nct'] {
    display: block;
    margin-bottom: var(--space-2);
    font-size: var(--text-xs);
    font-weight: 600;
    letter-spacing: 0.01em;
  }
  .optional {
    font-weight: 400;
    color: var(--fg-subtle);
    font-size: var(--text-2xs);
    margin-left: 4px;
  }
  .nct-row {
    display: flex;
    gap: var(--space-2);
  }
  .nct-row input {
    flex: 1;
    font-family: var(--font-mono);
    background: var(--bg-surface);
  }
  .hint {
    margin-top: 6px;
    font-size: var(--text-xs);
    padding: 4px 8px;
    border-radius: var(--radius-sm);
  }
  .hint-error {
    background: var(--danger-50);
    color: var(--danger-700);
  }
  .hint-ok {
    background: var(--brand-soft);
    color: var(--sage-800);
  }
  .meta-card {
    margin-top: var(--space-3);
    background: var(--bg-surface);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-md);
    padding: var(--space-3);
  }
  .meta-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: var(--space-3);
    font-size: var(--text-sm);
  }
  .meta-label {
    font-size: var(--text-2xs);
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--fg-muted);
    display: block;
    margin-bottom: 2px;
  }

  /* I/E primary block */
  .ie-block {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }
  .ie-section-head h3 {
    font-family: var(--font-display);
    font-size: var(--text-md);
    font-weight: 600;
    margin: 0 0 4px;
  }
  .ie-section-head p {
    margin: 0;
    line-height: var(--leading-snug);
  }
  .ie-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-4);
  }
  .ie-side {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .ie-label {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: var(--text-2xs);
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--fg-muted);
    margin-bottom: 0;
  }
  .ie-label.inc-label {
    color: var(--success-700);
  }
  .ie-label.exc-label {
    color: var(--danger-700);
  }
  .cui-count {
    font-weight: 500;
    text-transform: none;
    letter-spacing: 0;
    color: var(--fg-muted);
    font-size: var(--text-2xs);
  }
  .ie-side textarea {
    font-family: var(--font-sans);
    line-height: var(--leading-relaxed);
    background: var(--bg-surface);
  }
  .extracted-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    min-height: 28px;
    padding: 8px;
    background: var(--bg-sunken);
    border-radius: var(--radius-md);
    align-items: flex-start;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 3px 9px;
    border-radius: var(--radius-full);
    font-size: var(--text-xs);
    font-weight: 500;
    line-height: 1.3;
  }
  .chip.inc {
    background: var(--success-50);
    color: var(--success-700);
  }
  .chip.exc {
    background: var(--danger-50);
    color: var(--danger-700);
  }
  .cat-dot {
    width: 7px;
    height: 7px;
    border-radius: var(--radius-full);
    flex-shrink: 0;
  }

  .extracting {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: var(--brand-active);
    font-weight: 600;
  }
  .mini-spinner {
    display: inline-block;
    width: 12px;
    height: 12px;
    border: 2px solid var(--sage-200);
    border-top-color: var(--brand);
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  /* Collapsible details */
  .details-section {
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-md);
    background: var(--bg-sunken);
  }
  .details-section > summary {
    cursor: pointer;
    padding: var(--space-3) var(--space-4);
    display: flex;
    align-items: center;
    gap: var(--space-3);
    font-weight: 600;
    font-size: var(--text-sm);
    list-style: none;
    user-select: none;
  }
  .details-section > summary::-webkit-details-marker {
    display: none;
  }
  .details-section > summary::before {
    content: '▸';
    color: var(--fg-muted);
    transition: transform 0.15s ease;
  }
  .details-section[open] > summary::before {
    transform: rotate(90deg);
  }
  .details-body {
    padding: var(--space-4);
    background: var(--bg-surface);
    border-top: 1px solid var(--border-subtle);
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }
  .field label,
  .label-like {
    display: block;
    margin-bottom: var(--space-2);
    font-size: var(--text-xs);
    font-weight: 600;
    letter-spacing: 0.01em;
  }
  .grid-2 {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-3);
  }
  /* Sticky feasibility footer */
  .feasibility {
    position: sticky;
    bottom: 0;
    margin: 0 calc(-1 * var(--space-5));
    padding: var(--space-4) var(--space-5);
    background: var(--bg-surface);
    border-top: 1px solid var(--border-subtle);
    box-shadow: 0 -4px 12px rgba(20, 24, 16, 0.04);
    display: grid;
    grid-template-columns: auto 1fr;
    align-items: center;
    gap: var(--space-4);
  }
  .feas-cell {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .feas-cell.main .feas-num {
    color: var(--brand-active);
  }
  .feas-num {
    font-family: var(--font-display);
    font-size: var(--text-2xl);
    font-weight: 700;
    line-height: 1;
    font-variant-numeric: tabular-nums;
    transition: color 0.15s ease;
  }
  .feas-actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-2);
  }

  @media (max-width: 720px) {
    .grid-2,
    .ie-grid {
      grid-template-columns: 1fr;
    }
    .feasibility {
      grid-template-columns: 1fr;
    }
    .feas-actions {
      justify-content: flex-start;
    }
  }
</style>
