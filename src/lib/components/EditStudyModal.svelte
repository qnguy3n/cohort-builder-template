<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { studies } from '$lib/studies';
  import { decisions } from '$lib/decisions';
  import { TEAM_MEMBERS } from '$lib/mockData';
  import {
    PHASES,
    PATIENT_STATUS_OPTIONS,
    SPONSOR_VIEW_ID,
    type Study,
    type TrialPhase,
    type PatientStatus,
    type EligibilityClause,
    type ClauseConnector,
    type Measurement,
    type MeasurementOp
  } from '$lib/types';
  import { CUI_BY_ID } from '$lib/cui';
  import { extractCuisFromText, extractMeasurementsFromText, isCriteriaHeader, cuiLabel } from '$lib/cui';
  import { extractDemographicsFromText, mergeDemographics, type DemographicHints } from '$lib/demographics';
  import CuiChip from './CuiChip.svelte';
  import CuiHoverTip from './CuiHoverTip.svelte';
  import TeamPicker from './TeamPicker.svelte';
  import { previewMatchCount, patientsLoading } from '$lib/patients';
  import { activeHospital, hospitalShortLabel } from '$lib/hospitals';

  export let study: Study;

  const dispatch = createEventDispatcher<{ close: void; saved: Study }>();

  // Editable copy
  let name = study.name;
  let summary = study.summary ?? '';
  let phase: TrialPhase = study.phase;
  let patientStatus: PatientStatus = study.patientStatus;
  let teamMemberIds = [...study.teamMemberIds];
  let published = study.published;
  let inclusionCriteria = study.inclusionCriteria;
  let exclusionCriteria = study.exclusionCriteria;

  // Seed working clause sets from the study. If the study already has
  // structured clauses, use them; otherwise synthesize from the original
  // free-text (one phrase per non-empty line).
  // `forbiddenCuis` blocks cross-side leaks (e.g. "MG" being parsed out of an
  // exclusion phrase when the same CUI is already an inclusion concept).
  function seedClauses(
    storedClauses: EligibilityClause[] | undefined,
    storedCuis: string[],
    text: string,
    forbiddenCuis: Set<string> = new Set()
  ): EligibilityClause[] {
    if (storedClauses && storedClauses.length > 0) {
      return storedClauses.map((c) => ({ ...c }));
    }
    if (text.trim()) {
      const lines = text
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l && !isCriteriaHeader(l));
      const seen = new Set<string>();
      return lines.map((phrase) => {
        const allCuis = extractCuisFromText(phrase);
        const cuis = allCuis.filter((c) => {
          if (forbiddenCuis.has(c)) return false;
          if (seen.has(c)) return false;
          seen.add(c);
          return true;
        });
        const measurements = extractMeasurementsFromText(phrase);
        return { phrase, cuis, selectedCuis: [...cuis], connector: 'AND', measurements };
      });
    }
    if (storedCuis.length > 0) {
      return [{ phrase: '(imported)', cuis: storedCuis, selectedCuis: [...storedCuis] }];
    }
    return [];
  }

  let inclusionClauses: EligibilityClause[] = seedClauses(
    study.inclusionClauses,
    study.inclusionCuis,
    study.inclusionCriteria
  );
  // Re-extracted exclusion phrases must not pick up CUIs that already belong
  // to inclusion on this study — otherwise an inclusion concept becomes an
  // exclusion too and the cohort drops to zero.
  const incForbid = new Set<string>(inclusionClauses.flatMap((c) => c.cuis));
  let exclusionClauses: EligibilityClause[] = seedClauses(
    study.exclusionClauses,
    study.exclusionCuis,
    study.exclusionCriteria,
    incForbid
  );

  // Default connector when no per-pair has been set yet.
  let inclusionMode: ClauseConnector = study.inclusionMode ?? 'AND';
  let exclusionMode: ClauseConnector = study.exclusionMode ?? 'OR';

  // Per-CUI connectors: connector BEFORE this CUI in the selected chain.
  let incConnectors: Record<string, ClauseConnector> = { ...(study.inclusionConnectors ?? {}) };
  let excConnectors: Record<string, ClauseConnector> = { ...(study.exclusionConnectors ?? {}) };

  function flipIncConnector(cui: string) {
    const cur = incConnectors[cui] ?? inclusionMode;
    incConnectors = { ...incConnectors, [cui]: cur === 'AND' ? 'OR' : 'AND' };
  }
  function flipExcConnector(cui: string) {
    const cur = excConnectors[cui] ?? exclusionMode;
    excConnectors = { ...excConnectors, [cui]: cur === 'AND' ? 'OR' : 'AND' };
  }

  // Per-CUI numeric/temporal constraints (seeded once in onMount above).
  let incConstraints: Record<string, Measurement> = { ...(study.inclusionConstraints ?? {}) };
  let excConstraints: Record<string, Measurement> = { ...(study.exclusionConstraints ?? {}) };

  function isConstrainable(cui: string): boolean {
    const cat = CUI_BY_ID.get(cui)?.category;
    return cat === 'lab' || cat === 'assessment';
  }

  type ConstraintError = null | 'value' | 'max' | 'order';
  function validateConstraint(c: Measurement | undefined): ConstraintError {
    if (!c) return null;
    if (typeof c.value !== 'number' || !Number.isFinite(c.value)) return 'value';
    if (c.op === 'between') {
      if (c.max == null || !Number.isFinite(c.max)) return 'max';
      if (c.max < c.value) return 'order';
    }
    return null;
  }

  function setConstraint(side: 'inc' | 'exc', cui: string, patch: Partial<Measurement>) {
    const map = side === 'inc' ? { ...incConstraints } : { ...excConstraints };
    const existing = map[cui] ?? { cui, op: '>=' as MeasurementOp, value: 0 };
    map[cui] = { ...existing, ...patch, cui };
    if (side === 'inc') incConstraints = map;
    else excConstraints = map;
  }
  // Demographics — auto-extracted from criteria text, also seeded from study
  let demographics: DemographicHints = {
    ageMin: study.ageMin,
    ageMax: study.ageMax,
    gender: study.genderConstraint,
    races: study.raceConstraint,
    ethnicities: study.ethnicityConstraint
  };
  // Seed once on mount (NOT reactively — otherwise clearing re-populates).
  onMount(() => {
    const studyHasNoDemographics =
      study.ageMin == null &&
      study.ageMax == null &&
      !study.genderConstraint &&
      !study.raceConstraint &&
      !study.ethnicityConstraint;
    if (studyHasNoDemographics) {
      const merged = [...inclusionClauses, ...exclusionClauses]
        .map((c) => extractDemographicsFromText(c.phrase))
        .reduce((a, b) => mergeDemographics(a, b), {} as DemographicHints);
      if (Object.keys(merged).length > 0) demographics = merged;
    }
    // Same one-time seed for measurement constraints
    const seedFrom = (clauses: EligibilityClause[], dest: Record<string, Measurement>) => {
      for (const c of clauses) {
        for (const m of c.measurements ?? []) {
          if (!dest[m.cui]) dest[m.cui] = { ...m };
        }
      }
    };
    if (Object.keys(incConstraints).length === 0) {
      const next: Record<string, Measurement> = {};
      seedFrom(inclusionClauses, next);
      if (Object.keys(next).length > 0) incConstraints = next;
    }
    if (Object.keys(excConstraints).length === 0) {
      const next: Record<string, Measurement> = {};
      seedFrom(exclusionClauses, next);
      if (Object.keys(next).length > 0) excConstraints = next;
    }
  });

  // Add-phrase inputs
  let incAddInput = '';
  let excAddInput = '';
  let extractingInc = false;
  let extractingExc = false;
  let incTimer: ReturnType<typeof setTimeout> | null = null;
  let excTimer: ReturnType<typeof setTimeout> | null = null;

  let detailsOpen = false;
  let saving = false;
  let formError = '';

  function commitInclusion() {
    const phrase = incAddInput.trim();
    if (!phrase) return;
    extractingInc = true;
    if (incTimer) clearTimeout(incTimer);
    incTimer = setTimeout(() => {
      // Skip placeholder header lines
      if (isCriteriaHeader(phrase)) {
        incAddInput = '';
        extractingInc = false;
        return;
      }
      const allCuis = extractCuisFromText(phrase);
      // Drop CUIs already in inclusion or already in exclusion (cross-side dedupe).
      const existing = new Set(inclusionClauses.flatMap((c) => c.cuis));
      const otherSide = new Set(exclusionClauses.flatMap((c) => c.cuis));
      const cuis = allCuis.filter((c) => !existing.has(c) && !otherSide.has(c));
      const measurements = extractMeasurementsFromText(phrase);
      const demoHits = extractDemographicsFromText(phrase);
      if (Object.keys(demoHits).length) {
        demographics = mergeDemographics(demographics, demoHits);
      }
      if (inclusionClauses.length > 0) {
        const last = inclusionClauses[inclusionClauses.length - 1];
        if (!last.connector) last.connector = 'AND';
      }
      inclusionClauses = [
        ...inclusionClauses,
        { phrase, cuis, selectedCuis: [...cuis], connector: undefined, measurements }
      ];
      incAddInput = '';
      extractingInc = false;
    }, 700);
  }

  function commitExclusion() {
    const phrase = excAddInput.trim();
    if (!phrase) return;
    extractingExc = true;
    if (excTimer) clearTimeout(excTimer);
    excTimer = setTimeout(() => {
      if (isCriteriaHeader(phrase)) {
        excAddInput = '';
        extractingExc = false;
        return;
      }
      const allCuis = extractCuisFromText(phrase);
      const existing = new Set(exclusionClauses.flatMap((c) => c.cuis));
      const otherSide = new Set(inclusionClauses.flatMap((c) => c.cuis));
      const cuis = allCuis.filter((c) => !existing.has(c) && !otherSide.has(c));
      const measurements = extractMeasurementsFromText(phrase);
      const demoHits = extractDemographicsFromText(phrase);
      if (Object.keys(demoHits).length) {
        demographics = mergeDemographics(demographics, demoHits);
      }
      if (exclusionClauses.length > 0) {
        const last = exclusionClauses[exclusionClauses.length - 1];
        if (!last.connector) last.connector = 'OR';
      }
      exclusionClauses = [
        ...exclusionClauses,
        { phrase, cuis, selectedCuis: [...cuis], connector: undefined, measurements }
      ];
      excAddInput = '';
      extractingExc = false;
    }, 700);
  }

  function removeInc(idx: number) {
    inclusionClauses = inclusionClauses.filter((_, i) => i !== idx);
    // The new tail clause shouldn't carry a connector
    if (inclusionClauses.length > 0) {
      inclusionClauses[inclusionClauses.length - 1] = {
        ...inclusionClauses[inclusionClauses.length - 1],
        connector: undefined
      };
    }
  }
  function removeExc(idx: number) {
    exclusionClauses = exclusionClauses.filter((_, i) => i !== idx);
    if (exclusionClauses.length > 0) {
      exclusionClauses[exclusionClauses.length - 1] = {
        ...exclusionClauses[exclusionClauses.length - 1],
        connector: undefined
      };
    }
  }

  function setConnector(side: 'inc' | 'exc', clauseIdx: number, op: ClauseConnector) {
    const list = side === 'inc' ? inclusionClauses : exclusionClauses;
    const updated = [...list];
    updated[clauseIdx] = { ...updated[clauseIdx], connector: op };
    if (side === 'inc') inclusionClauses = updated;
    else exclusionClauses = updated;
  }

  // All extracted CUIs (union across clauses) — these are the chips the user
  // can toggle on/off in the selected summary.
  $: allIncCuis = Array.from(new Set(inclusionClauses.flatMap((c) => c.cuis)));
  $: allExcCuis = Array.from(new Set(exclusionClauses.flatMap((c) => c.cuis)));

  // Deduplicated list of CUIs currently SELECTED across clauses (used for matching).
  $: selectedIncCuis = Array.from(new Set(inclusionClauses.flatMap((c) => c.selectedCuis)));
  $: selectedExcCuis = Array.from(new Set(exclusionClauses.flatMap((c) => c.selectedCuis)));

  $: selectedIncSet = new Set(selectedIncCuis);
  $: selectedExcSet = new Set(selectedExcCuis);

  // ── Visual grouping: OR of AND-groups (DNF). Groups partition the selected
  // inclusion CUIs. Within a group → AND; across groups → OR. ──────────────
  let incGroups: string[][] = (study.inclusionGroups ?? []).map((g) => [...g]);

  function reconcileGroups(sel: string[]) {
    const selSet = new Set(sel);
    let groups = incGroups.map((g) => g.filter((c) => selSet.has(c)));
    const placed = new Set(groups.flat());
    const missing = sel.filter((c) => !placed.has(c));
    if (missing.length) {
      if (groups.length === 0) groups = [[]];
      groups[0] = [...groups[0], ...missing];
    }
    groups = groups.filter((g) => g.length > 0);
    if (JSON.stringify(groups) !== JSON.stringify(incGroups)) incGroups = groups;
  }
  // Re-run only when the selection changes (Svelte tracks selectedIncCuis here).
  $: reconcileGroups(selectedIncCuis);

  function moveIncToGroup(cui: string, target: number | 'new') {
    const groups = incGroups.map((g) => g.filter((c) => c !== cui));
    if (target === 'new') groups.push([cui]);
    else {
      if (!groups[target]) groups[target] = [];
      groups[target].push(cui);
    }
    incGroups = groups.filter((g) => g.length > 0);
  }

  // Grouping only "activates" matching when the user split into 2+ groups.
  $: incGroupsActive = incGroups.filter((g) => g.length > 0);
  $: incGroupsForMatch = incGroupsActive.length > 1 ? incGroupsActive : undefined;

  function deselectIncEverywhere(cui: string) {
    inclusionClauses = inclusionClauses.map((c) => ({
      ...c,
      selectedCuis: c.selectedCuis.filter((x) => x !== cui)
    }));
  }
  function deselectExcEverywhere(cui: string) {
    exclusionClauses = exclusionClauses.map((c) => ({
      ...c,
      selectedCuis: c.selectedCuis.filter((x) => x !== cui)
    }));
  }
  function selectIncEverywhere(cui: string) {
    inclusionClauses = inclusionClauses.map((c) =>
      c.cuis.includes(cui)
        ? { ...c, selectedCuis: Array.from(new Set([...c.selectedCuis, cui])) }
        : c
    );
  }
  function selectExcEverywhere(cui: string) {
    exclusionClauses = exclusionClauses.map((c) =>
      c.cuis.includes(cui)
        ? { ...c, selectedCuis: Array.from(new Set([...c.selectedCuis, cui])) }
        : c
    );
  }
  function toggleInc(cui: string) {
    if (selectedIncSet.has(cui)) {
      // Mute: keep the constraint values around so unmuting restores them.
      deselectIncEverywhere(cui);
    } else {
      selectIncEverywhere(cui);
      // For measurement-style CUIs without a saved constraint, seed defaults.
      if (isConstrainable(cui) && !incConstraints[cui]) {
        incConstraints = { ...incConstraints, [cui]: { cui, op: '>=', value: 0 } };
      }
    }
  }
  function toggleExc(cui: string) {
    if (selectedExcSet.has(cui)) {
      deselectExcEverywhere(cui);
    } else {
      selectExcEverywhere(cui);
      if (isConstrainable(cui) && !excConstraints[cui]) {
        excConstraints = { ...excConstraints, [cui]: { cui, op: '>=', value: 0 } };
      }
    }
  }
  function prevSelected(list: string[], idx: number, sel: Set<string>): boolean {
    for (let i = idx - 1; i >= 0; i--) if (sel.has(list[i])) return true;
    return false;
  }

  function muteAllInc() {
    inclusionClauses = inclusionClauses.map((c) => ({ ...c, selectedCuis: [] }));
  }
  function unmuteAllInc() {
    inclusionClauses = inclusionClauses.map((c) => ({ ...c, selectedCuis: [...c.cuis] }));
    // Restore default constraints for any newly-selected constrainable CUIs
    const next: Record<string, Measurement> = { ...incConstraints };
    for (const c of inclusionClauses) {
      for (const m of c.measurements ?? []) {
        if (!next[m.cui]) next[m.cui] = { ...m };
      }
      for (const cui of c.cuis) {
        if (isConstrainable(cui) && !next[cui]) next[cui] = { cui, op: '>=', value: 0 };
      }
    }
    incConstraints = next;
  }
  function muteAllExc() {
    exclusionClauses = exclusionClauses.map((c) => ({ ...c, selectedCuis: [] }));
  }
  function unmuteAllExc() {
    exclusionClauses = exclusionClauses.map((c) => ({ ...c, selectedCuis: [...c.cuis] }));
    const next: Record<string, Measurement> = { ...excConstraints };
    for (const c of exclusionClauses) {
      for (const m of c.measurements ?? []) {
        if (!next[m.cui]) next[m.cui] = { ...m };
      }
      for (const cui of c.cuis) {
        if (isConstrainable(cui) && !next[cui]) next[cui] = { cui, op: '>=', value: 0 };
      }
    }
    excConstraints = next;
  }


  // Live feasibility — chain-aware (per-chip AND/OR), demographics, scoped.
  $: previewCount = $patientsLoading
    ? 0
    : previewMatchCount(
        inclusionClauses,
        exclusionClauses,
        patientStatus,
        $activeHospital,
        {
          ageMin: demographics.ageMin,
          ageMax: demographics.ageMax,
          gender: demographics.gender,
          races: demographics.races,
          ethnicities: demographics.ethnicities
        },
        inclusionMode,
        exclusionMode,
        selectedIncCuis,
        selectedExcCuis,
        incConnectors,
        excConnectors,
        incGroupsForMatch,
        undefined
      );

  // TEMP diagnostic — surfaces the exact state when preview is unexpectedly 0.
  $: if (
    typeof window !== 'undefined' &&
    !$patientsLoading &&
    selectedIncCuis.length > 0 &&
    previewCount === 0
  ) {
    // eslint-disable-next-line no-console
    console.log('[cohort-builder] preview returned 0:', {
      activeHospital: $activeHospital,
      patientStatus,
      selectedIncCuis,
      selectedExcCuis,
      inclusionMode,
      exclusionMode,
      incConnectors,
      excConnectors,
      demographics,
      incConstraints,
      excConstraints
    });
  }

  $: demographicsActiveCount =
    (demographics.ageMin != null || demographics.ageMax != null ? 1 : 0) +
    (demographics.gender ? 1 : 0) +
    (demographics.races && demographics.races.length ? 1 : 0) +
    (demographics.ethnicities && demographics.ethnicities.length ? 1 : 0);

  $: ageRangeInvalid =
    demographics.ageMin != null &&
    demographics.ageMax != null &&
    demographics.ageMax < demographics.ageMin;
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
      formError = 'Study name is required.';
      detailsOpen = true;
      return;
    }
    if (ageRangeInvalid) {
      formError = 'Fix the age range before saving — maximum must be greater than minimum.';
      return;
    }
    saving = true;
    // Deep-clone clause arrays so the saved study cannot share references with
    // the modal's working copy (which would let later edits leak in).
    const cloneClauses = (cs: EligibilityClause[]): EligibilityClause[] =>
      cs.map((c) => ({
        ...c,
        cuis: [...c.cuis],
        selectedCuis: [...c.selectedCuis],
        measurements: c.measurements ? c.measurements.map((m) => ({ ...m })) : undefined
      }));
    const incClauseSnap = cloneClauses(inclusionClauses);
    const excClauseSnap = cloneClauses(exclusionClauses);
    const flatInc = Array.from(new Set(incClauseSnap.flatMap((c) => c.selectedCuis)));
    const flatExc = Array.from(new Set(excClauseSnap.flatMap((c) => c.selectedCuis)));
    const incText = incClauseSnap.map((c) => c.phrase).join('\n');
    const excText = excClauseSnap.map((c) => c.phrase).join('\n');
    const updated: Study = {
      ...study,
      name: name.trim(),
      summary: summary.trim(),
      phase,
      patientStatus,
      teamMemberIds: [...teamMemberIds],
      published: study.ownerId === SPONSOR_VIEW_ID ? true : published,
      inclusionCriteria: incText,
      exclusionCriteria: excText,
      inclusionCuis: flatInc,
      exclusionCuis: flatExc,
      inclusionClauses: incClauseSnap,
      exclusionClauses: excClauseSnap,
      inclusionMode,
      exclusionMode,
      inclusionConnectors: { ...incConnectors },
      exclusionConnectors: { ...excConnectors },
      inclusionOrder: flatInc,
      exclusionOrder: flatExc,
      inclusionGroups: incGroupsForMatch,
      inclusionConstraints: { ...incConstraints },
      exclusionConstraints: { ...excConstraints },
      ageMin: demographics.ageMin,
      ageMax: demographics.ageMax,
      genderConstraint: demographics.gender,
      raceConstraint: demographics.races ? [...demographics.races] : undefined,
      ethnicityConstraint: demographics.ethnicities ? [...demographics.ethnicities] : undefined
    };
    studies.replace(updated);
    saving = false;
    dispatch('saved', updated);
    dispatch('close');
  }

  function handleDelete() {
    const ok = window.confirm(
      `Delete the study "${study.name}"?\n\nThis will permanently remove the study and any per-patient decisions associated with it. This cannot be undone.`
    );
    if (!ok) return;
    decisions.clearStudy(study.id);
    studies.remove(study.id);
    dispatch('close');
    goto('/studies');
  }

  function clearDemographic(field: keyof DemographicHints) {
    demographics = { ...demographics, [field]: undefined };
  }

  function handleEsc(e: KeyboardEvent) {
    if (e.key === 'Escape') dispatch('close');
  }

  function handleAddKey(e: KeyboardEvent, side: 'inc' | 'exc') {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (side === 'inc') commitInclusion();
      else commitExclusion();
    }
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
  aria-labelledby="edit-title"
  on:click={() => dispatch('close')}
>
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions a11y_click_events_have_key_events -->
  <div class="modal" on:click|stopPropagation role="document">
    <header class="modal-head">
      <div>
        <div class="muted small">Editing study</div>
        <h2 id="edit-title">{study.name}</h2>
      </div>
      <div class="head-actions">
        {#if study.ownerId !== SPONSOR_VIEW_ID}
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
      <!-- Collapsible study metadata (above I/E, closed by default) -->
      <details class="details-section" bind:open={detailsOpen}>
        <summary>
          <span>Study metadata</span>
          <span class="muted small">name · summary · phase · patient status · team · visibility</span>
        </summary>

        <div class="details-body">
          <div class="grid-2">
            <div class="field">
              <label for="e-name">Study name</label>
              <input id="e-name" type="text" bind:value={name} />
            </div>
            <div class="field">
              <label for="e-phase">Phase</label>
              <select id="e-phase" bind:value={phase}>
                {#each PHASES as option}
                  <option value={option}>{option}</option>
                {/each}
              </select>
            </div>
          </div>

          <div class="field">
            <label for="e-summary">Summary</label>
            <textarea id="e-summary" rows="2" bind:value={summary}></textarea>
          </div>

          <div class="field">
            <label for="e-ps">Patient status</label>
            <select id="e-ps" bind:value={patientStatus}>
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

      <!-- Demographics editor — collapsed by default, badge shows active count -->
      <details class="demo-accordion">
        <summary class="demo-summary">
          <span class="demo-section-label">Demographics</span>
          {#if demographicsActiveCount > 0}
            <span class="demo-badge">{demographicsActiveCount} active</span>
            <button
              type="button"
              class="demo-clear-all"
              on:click|stopPropagation|preventDefault={() => (demographics = {})}
              title="Clear all demographic filters"
            >Clear all</button>
          {:else}
            <span class="muted small">none set · click to add age, sex, race, ethnicity</span>
          {/if}
        </summary>

        <div class="demo-rows">
          <!-- Age -->
          <div class="demo-row">
            <span class="demo-row-label">Age</span>
            <div class="demo-row-body">
              <div class="age-row">
                <input
                  type="number"
                  min="0"
                  max="120"
                  placeholder="any"
                  class:invalid={ageRangeInvalid}
                  value={demographics.ageMin ?? ''}
                  on:input={(e) => {
                    const v = (e.currentTarget as HTMLInputElement).value;
                    demographics = { ...demographics, ageMin: v === '' ? undefined : Math.max(0, Math.min(120, +v)) };
                  }}
                />
                <span class="age-sep">–</span>
                <input
                  type="number"
                  min="0"
                  max="120"
                  placeholder="any"
                  class:invalid={ageRangeInvalid}
                  value={demographics.ageMax ?? ''}
                  on:input={(e) => {
                    const v = (e.currentTarget as HTMLInputElement).value;
                    demographics = { ...demographics, ageMax: v === '' ? undefined : Math.max(0, Math.min(120, +v)) };
                  }}
                />
                {#if demographics.ageMin != null || demographics.ageMax != null}
                  <button type="button" class="demo-clear" on:click={() => { demographics = { ...demographics, ageMin: undefined, ageMax: undefined }; }}>clear</button>
                {/if}
              </div>
              {#if ageRangeInvalid}
                <div class="age-err">Maximum age must be greater than minimum age.</div>
              {/if}
            </div>
          </div>

          <!-- Sex -->
          <div class="demo-row">
            <span class="demo-row-label">Sex</span>
            <div class="demo-row-body">
              <div class="seg">
                <button
                  type="button"
                  class:active={!demographics.gender}
                  on:click={() => clearDemographic('gender')}
                >Any</button>
                <button
                  type="button"
                  class:active={demographics.gender === 'female'}
                  on:click={() => { demographics = { ...demographics, gender: 'female' }; }}
                >Female</button>
                <button
                  type="button"
                  class:active={demographics.gender === 'male'}
                  on:click={() => { demographics = { ...demographics, gender: 'male' }; }}
                >Male</button>
              </div>
            </div>
          </div>

          <!-- Race -->
          <div class="demo-row">
            <span class="demo-row-label">Race</span>
            <div class="demo-row-body">
              <div class="toggle-chips">
                {#each ['White','Black','Asian','AI/AN','NH/PI','Other','Unknown'] as const as r}
                  {@const on = (demographics.races ?? []).includes(r as any)}
                  <button
                    type="button"
                    class="t-chip"
                    class:on
                    on:click={() => {
                      const cur = demographics.races ?? [];
                      const next = on ? cur.filter((x) => x !== r) : [...cur, r as any];
                      demographics = { ...demographics, races: next.length ? next : undefined };
                    }}
                  >{r}</button>
                {/each}
              </div>
            </div>
          </div>

          <!-- Ethnicity -->
          <div class="demo-row">
            <span class="demo-row-label">Ethnicity</span>
            <div class="demo-row-body">
              <div class="toggle-chips">
                {#each ['Hispanic','Non-Hispanic'] as const as e}
                  {@const on = (demographics.ethnicities ?? []).includes(e as any)}
                  <button
                    type="button"
                    class="t-chip"
                    class:on
                    on:click={() => {
                      const cur = demographics.ethnicities ?? [];
                      const next = on ? cur.filter((x) => x !== e) : [...cur, e as any];
                      demographics = { ...demographics, ethnicities: next.length ? next : undefined };
                    }}
                  >{e}</button>
                {/each}
              </div>
            </div>
          </div>
        </div>
      </details>

      <!-- I/E criteria — chips primary, no textareas -->
      <section class="ie-block">
        <header class="ie-section-head">
          <h3>Eligibility concepts</h3>
          <p class="muted small">
            Each chip is a UMLS concept extracted from your original criteria. To add a new concept,
            type a phrase below and click out (or press Enter) — our AI agents will resolve it
            and recompute patient feasibility.
          </p>
        </header>

        <!-- Selected concepts — single uniform list per side -->
        <div class="selected-summary">
          <div class="ss-side">
            <div class="ss-head">
              <div class="ss-label inc-label">
                Inclusion <span class="ss-count">{selectedIncCuis.length}</span>
              </div>
              {#if allIncCuis.length > 0}
                {@const anyOn = selectedIncCuis.length > 0}
                <button
                  type="button"
                  class="mute-icon-btn"
                  aria-label={anyOn ? 'Mute all' : 'Unmute all'}
                  title={anyOn ? 'Mute all' : 'Unmute all'}
                  on:click={() => (anyOn ? muteAllInc() : unmuteAllInc())}
                >
                  {#if anyOn}
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" y1="2" x2="22" y2="22"/></svg>
                  {:else}
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
                  {/if}
                </button>
              {/if}
            </div>
            <div class="filter-list">
              {#each allIncCuis as cui, i (cui)}
                {@const selected = selectedIncSet.has(cui)}
                {@const constrainable = isConstrainable(cui)}
                {@const c = constrainable ? incConstraints[cui] : null}
                {@const err = c ? validateConstraint(c) : null}
                {#if selected && prevSelected(allIncCuis, i, selectedIncSet)}
                  {@const op = incConnectors[cui] ?? inclusionMode}
                  <button
                    type="button"
                    class="row-conn"
                    class:or={op === 'OR'}
                    on:click={() => flipIncConnector(cui)}
                    title="Click to flip AND ↔ OR"
                  >{op}</button>
                {/if}
                <div class="filter-row inc" class:muted={!selected} class:has-err={!!err}>
                  <button
                    type="button"
                    class="row-toggle"
                    on:click={() => toggleInc(cui)}
                    title={selected ? 'Click to mute' : 'Click to unmute'}
                  >
                    <span class="row-dot inc-dot" class:hollow={!selected}></span>
                    <CuiHoverTip {cui} selectedCuis={selectedIncCuis}>
                      <span class="row-label">{CUI_BY_ID.get(cui)?.label ?? cui}</span>
                    </CuiHoverTip>
                  </button>
                  {#if constrainable}
                    <div class="row-controls" role="group" aria-label="Measurement constraint">
                      {#if c}
                        <select
                          class="cons-op"
                          value={c.op}
                          on:change={(e) => setConstraint('inc', cui, { op: (e.currentTarget as HTMLSelectElement).value as MeasurementOp })}
                        >
                          <option value=">=">≥</option>
                          <option value="<=">≤</option>
                          <option value=">">&gt;</option>
                          <option value="<">&lt;</option>
                          <option value="=">=</option>
                          <option value="between">range</option>
                        </select>
                        <input
                          type="number"
                          step="any"
                          placeholder="value"
                          class:invalid={err === 'value' || err === 'order'}
                          value={c.value}
                          on:input={(e) => setConstraint('inc', cui, { value: parseFloat((e.currentTarget as HTMLInputElement).value) })}
                        />
                        {#if c.op === 'between'}
                          <span class="cons-sep">–</span>
                          <input
                            type="number"
                            step="any"
                            placeholder="max"
                            class:invalid={err === 'max' || err === 'order'}
                            value={c.max ?? ''}
                            on:input={(e) => setConstraint('inc', cui, { max: parseFloat((e.currentTarget as HTMLInputElement).value) })}
                          />
                        {/if}
                        <input
                          type="text"
                          class="cons-unit"
                          placeholder="unit"
                          value={c.unit ?? ''}
                          on:input={(e) => setConstraint('inc', cui, { unit: (e.currentTarget as HTMLInputElement).value || undefined })}
                        />
                      {:else}
                        <button
                          type="button"
                          class="cons-add"
                          on:click={() => setConstraint('inc', cui, { op: '>=', value: 0 })}
                        >+ value</button>
                      {/if}
                    </div>
                  {/if}
                </div>
                {#if err}
                  <div class="row-err">
                    {#if err === 'value'}Enter a numeric value{/if}
                    {#if err === 'max'}Enter a maximum for the range{/if}
                    {#if err === 'order'}Maximum must be greater than minimum{/if}
                  </div>
                {/if}
              {:else}
                <p class="empty-state">No concepts yet — add a phrase below.</p>
              {/each}
            </div>

            <!-- svelte-ignore a11y_no_onchange -->
            {#if selectedIncCuis.length > 1}
              <div class="group-panel">
                <div class="gp-head">
                  Match groups
                  <span class="gp-hint">within a group: AND · across groups: OR — patient matches ANY group</span>
                </div>
                {#each incGroups as group, gi (gi)}
                  {#if gi > 0}<div class="gp-or">OR</div>{/if}
                  <div class="gp-box">
                    {#each group as cui, ci (cui)}
                      {#if ci > 0}<span class="gp-and">AND</span>{/if}
                      <span class="gp-chip">
                        <span class="gp-label">{CUI_BY_ID.get(cui)?.label ?? cui}</span>
                        {#if incGroupsActive.length > 1 || group.length > 1}
                          <select
                            class="gp-move"
                            title="Move to group"
                            on:change={(e) => {
                              const v = e.currentTarget.value;
                              moveIncToGroup(cui, v === 'new' ? 'new' : Number(v));
                            }}
                          >
                            {#each incGroups as _, gj}
                              <option value={gj} selected={gj === gi}>Group {gj + 1}</option>
                            {/each}
                            <option value="new">＋ New group</option>
                          </select>
                        {/if}
                      </span>
                    {/each}
                  </div>
                {/each}
                {#if incGroupsActive.length > 1}
                  <div class="gp-formula">
                    ⇒ {incGroupsActive
                      .map((g) => (g.length > 1 ? '(' + g.map((c) => CUI_BY_ID.get(c)?.label ?? c).join(' AND ') + ')' : CUI_BY_ID.get(g[0])?.label ?? g[0]))
                      .join('  OR  ')}
                  </div>
                {/if}
              </div>
            {/if}
          </div>

          <div class="ss-side">
            <div class="ss-head">
              <div class="ss-label exc-label">
                Exclusion <span class="ss-count">{selectedExcCuis.length}</span>
              </div>
              {#if allExcCuis.length > 0}
                {@const anyOn = selectedExcCuis.length > 0}
                <button
                  type="button"
                  class="mute-icon-btn"
                  aria-label={anyOn ? 'Mute all' : 'Unmute all'}
                  title={anyOn ? 'Mute all' : 'Unmute all'}
                  on:click={() => (anyOn ? muteAllExc() : unmuteAllExc())}
                >
                  {#if anyOn}
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" y1="2" x2="22" y2="22"/></svg>
                  {:else}
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
                  {/if}
                </button>
              {/if}
            </div>
            <div class="filter-list">
              {#each allExcCuis as cui, i (cui)}
                {@const selected = selectedExcSet.has(cui)}
                {@const constrainable = isConstrainable(cui)}
                {@const c = constrainable ? excConstraints[cui] : null}
                {@const err = c ? validateConstraint(c) : null}
                {#if selected && prevSelected(allExcCuis, i, selectedExcSet)}
                  {@const op = excConnectors[cui] ?? exclusionMode}
                  <button
                    type="button"
                    class="row-conn"
                    class:or={op === 'OR'}
                    on:click={() => flipExcConnector(cui)}
                    title="Click to flip AND ↔ OR"
                  >{op}</button>
                {/if}
                <div class="filter-row exc" class:muted={!selected} class:has-err={!!err}>
                  <button
                    type="button"
                    class="row-toggle"
                    on:click={() => toggleExc(cui)}
                    title={selected ? 'Click to mute' : 'Click to unmute'}
                  >
                    <span class="row-dot exc-dot" class:hollow={!selected}></span>
                    <CuiHoverTip {cui} selectedCuis={selectedExcCuis}>
                      <span class="row-label">{CUI_BY_ID.get(cui)?.label ?? cui}</span>
                    </CuiHoverTip>
                  </button>
                  {#if constrainable}
                    <div class="row-controls" role="group" aria-label="Measurement constraint">
                      {#if c}
                        <select
                          class="cons-op"
                          value={c.op}
                          on:change={(e) => setConstraint('exc', cui, { op: (e.currentTarget as HTMLSelectElement).value as MeasurementOp })}
                        >
                          <option value=">=">≥</option>
                          <option value="<=">≤</option>
                          <option value=">">&gt;</option>
                          <option value="<">&lt;</option>
                          <option value="=">=</option>
                          <option value="between">range</option>
                        </select>
                        <input
                          type="number"
                          step="any"
                          placeholder="value"
                          class:invalid={err === 'value' || err === 'order'}
                          value={c.value}
                          on:input={(e) => setConstraint('exc', cui, { value: parseFloat((e.currentTarget as HTMLInputElement).value) })}
                        />
                        {#if c.op === 'between'}
                          <span class="cons-sep">–</span>
                          <input
                            type="number"
                            step="any"
                            placeholder="max"
                            class:invalid={err === 'max' || err === 'order'}
                            value={c.max ?? ''}
                            on:input={(e) => setConstraint('exc', cui, { max: parseFloat((e.currentTarget as HTMLInputElement).value) })}
                          />
                        {/if}
                        <input
                          type="text"
                          class="cons-unit"
                          placeholder="unit"
                          value={c.unit ?? ''}
                          on:input={(e) => setConstraint('exc', cui, { unit: (e.currentTarget as HTMLInputElement).value || undefined })}
                        />
                      {:else}
                        <button
                          type="button"
                          class="cons-add"
                          on:click={() => setConstraint('exc', cui, { op: '>=', value: 0 })}
                        >+ value</button>
                      {/if}
                    </div>
                  {/if}
                </div>
                {#if err}
                  <div class="row-err">
                    {#if err === 'value'}Enter a numeric value{/if}
                    {#if err === 'max'}Enter a maximum for the range{/if}
                    {#if err === 'order'}Maximum must be greater than minimum{/if}
                  </div>
                {/if}
              {:else}
                <p class="empty-state">No concepts yet — add a phrase below.</p>
              {/each}
            </div>
          </div>
        </div>

        <div class="ie-grid">
          <!-- Inclusion -->
          <div class="ie-side">
            <div class="ie-label inc-label">
              Inclusion
              {#if inclusionClauses.length > 0}
                <span class="cui-count">{inclusionClauses.length} clause{inclusionClauses.length === 1 ? '' : 's'}</span>
              {/if}
            </div>

            <div class="clauses">
              {#each inclusionClauses as clause, idx (idx)}
                <div class="clause">
                  <header class="clause-head">
                    <span class="clause-phrase">"{clause.phrase}"</span>
                    <button type="button" class="clause-x" on:click={() => removeInc(idx)} aria-label="Remove clause">×</button>
                  </header>
                  <div class="clause-cuis">
                    {#each clause.cuis as cui (cui)}
                      {@const selected = clause.selectedCuis.includes(cui)}
                      <span class="cui-display" class:dim={!selected}>
                        <CuiChip {cui} variant={selected ? 'inc' : 'plain'} selectedCuis={selectedIncCuis} />
                      </span>
                    {:else}
                      <span class="muted small">No CUIs extracted from this phrase.</span>
                    {/each}
                  </div>
                </div>
              {:else}
                <span class="muted small">No inclusion clauses yet. Add a phrase below.</span>
              {/each}
            </div>
            <div class="add-row">
              <input
                type="text"
                placeholder="Add a concept or phrase (e.g. diabetes, MoCA ≥ 24)…"
                bind:value={incAddInput}
                on:blur={commitInclusion}
                on:keydown={(e) => handleAddKey(e, 'inc')}
                disabled={extractingInc}
              />
              {#if extractingInc}
                <div class="extracting">
                  <span class="mini-spinner"></span>
                  Extracting CUIs…
                </div>
              {:else if incAddInput.trim()}
                <button type="button" class="btn-add" on:click={commitInclusion}>+ Add</button>
              {/if}
            </div>
          </div>

          <!-- Exclusion -->
          <div class="ie-side">
            <div class="ie-label exc-label">
              Exclusion
              {#if exclusionClauses.length > 0}
                <span class="cui-count">{exclusionClauses.length} clause{exclusionClauses.length === 1 ? '' : 's'}</span>
              {/if}
            </div>

            <div class="clauses">
              {#each exclusionClauses as clause, idx (idx)}
                <div class="clause exc-clause">
                  <header class="clause-head">
                    <span class="clause-phrase">"{clause.phrase}"</span>
                    <button type="button" class="clause-x" on:click={() => removeExc(idx)} aria-label="Remove clause">×</button>
                  </header>
                  <div class="clause-cuis">
                    {#each clause.cuis as cui (cui)}
                      {@const selected = clause.selectedCuis.includes(cui)}
                      <span class="cui-display" class:dim={!selected}>
                        <CuiChip {cui} variant={selected ? 'exc' : 'plain'} selectedCuis={selectedExcCuis} />
                      </span>
                    {:else}
                      <span class="muted small">No CUIs extracted from this phrase.</span>
                    {/each}
                  </div>
                </div>
              {:else}
                <span class="muted small">No exclusion clauses yet.</span>
              {/each}
            </div>
            <div class="add-row">
              <input
                type="text"
                placeholder="Add a concept or phrase (e.g. pregnancy, cancer)…"
                bind:value={excAddInput}
                on:blur={commitExclusion}
                on:keydown={(e) => handleAddKey(e, 'exc')}
                disabled={extractingExc}
              />
              {#if extractingExc}
                <div class="extracting">
                  <span class="mini-spinner"></span>
                  Extracting CUIs…
                </div>
              {:else if excAddInput.trim()}
                <button type="button" class="btn-add" on:click={commitExclusion}>+ Add</button>
              {/if}
            </div>
          </div>
        </div>
      </section>

      {#if formError}<div class="error">{formError}</div>{/if}

      <!-- Sticky feasibility footer -->
      <div class="feasibility">
        <div class="feas-cell main">
          <div class="feas-num">{$patientsLoading ? '…' : fmt(previewCount)}</div>
          <div class="muted small">
            matching in <strong>{scopeLabel}</strong>
          </div>
        </div>
        <div class="feas-actions">
          <button type="button" class="btn-danger" on:click={handleDelete}>Delete study</button>
          <button type="button" class="btn btn-ghost" on:click={() => dispatch('close')}>Cancel</button>
          <button type="submit" class="btn btn-primary" disabled={saving}>
            {saving ? 'Saving…' : 'Save changes'}
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
    /* Leaflet map panes/controls go up to ~700 (controls 800/900); modal must beat them. */
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
    align-items: flex-start;
    justify-content: space-between;
    padding: var(--space-4) var(--space-5);
    border-bottom: 1px solid var(--border-subtle);
  }
  .modal-head h2 {
    font-family: var(--font-display);
    font-size: var(--text-lg);
    font-weight: 600;
    margin: 2px 0 0;
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

  /* Selected concepts summary */
  .selected-summary {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-3);
    padding: var(--space-3);
    background: var(--bg-sunken);
    border-radius: var(--radius-md);
    border: 1px solid var(--border-subtle);
  }
  .ss-side {
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-width: 0;
  }
  .ss-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
  }
  .ss-label {
    font-size: var(--text-sm);
    font-weight: 600;
    color: var(--fg-default);
    display: inline-flex;
    align-items: center;
    gap: 8px;
    text-transform: none;
    letter-spacing: 0;
  }
  .ss-label.inc-label::before,
  .ss-label.exc-label::before {
    content: '';
    width: 8px;
    height: 8px;
    border-radius: var(--radius-full);
  }
  .ss-label.inc-label::before {
    background: var(--success-700);
  }
  .ss-label.exc-label::before {
    background: var(--danger-700);
  }
  .ss-count {
    background: var(--bg-surface);
    color: var(--fg-muted);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-full);
    padding: 1px 8px;
    font-weight: 600;
    font-size: 11px;
    font-variant-numeric: tabular-nums;
  }

  /* Icon-only mute toggle in header */
  .mute-icon-btn {
    background: transparent;
    border: none;
    color: var(--fg-muted);
    padding: 4px;
    border-radius: var(--radius-md);
    cursor: pointer;
    font-family: inherit;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    transition: background 0.12s ease, color 0.12s ease;
  }
  .mute-icon-btn:hover {
    background: var(--bg-surface);
    color: var(--fg-default);
  }

  /* Single uniform list of filter rows (one per concept) */
  .filter-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .empty-state {
    color: var(--fg-muted);
    font-size: var(--text-sm);
    margin: 8px 0;
    font-style: italic;
  }

  /* Each row is the same shape regardless of constrainable vs not. */
  .filter-row {
    display: flex;
    align-items: center;
    gap: 6px;
    background: var(--bg-surface);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-md);
    padding: 6px 10px 6px 12px;
    min-height: 38px;
    font-size: var(--text-sm);
    transition: opacity 0.12s ease, background 0.12s ease;
  }
  .filter-row.inc {
    border-left: 3px solid var(--success-700);
  }
  .filter-row.exc {
    border-left: 3px solid var(--danger-700);
  }
  .filter-row.muted {
    opacity: 0.5;
    background: transparent;
  }
  .filter-row.muted:hover {
    opacity: 0.75;
  }
  .filter-row.muted .row-controls {
    pointer-events: none;
  }
  .filter-row.has-err {
    border-color: var(--danger-200);
  }

  /* Left-side toggle: dot + label, click anywhere to mute/unmute */
  .row-toggle {
    flex: 1;
    min-width: 0;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    background: transparent;
    border: none;
    padding: 2px 0;
    margin: 0;
    cursor: pointer;
    font-family: inherit;
    font-size: inherit;
    color: var(--fg-default);
    text-align: left;
  }
  .row-toggle:hover .row-label {
    color: var(--fg-default);
  }
  .row-label {
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .row-dot {
    width: 8px;
    height: 8px;
    border-radius: var(--radius-full);
    flex-shrink: 0;
    transition: background 0.12s ease, border-color 0.12s ease;
  }
  .row-dot.inc-dot {
    background: var(--success-700);
  }
  .row-dot.exc-dot {
    background: var(--danger-700);
  }
  .row-dot.hollow {
    background: transparent;
    box-shadow: inset 0 0 0 1.5px var(--border-default);
  }
  .inc-dot {
    background: var(--success-700);
  }
  .exc-dot {
    background: var(--danger-700);
  }

  /* Inline measurement controls on the right of a row */
  .row-controls {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
  }
  .cons-op {
    width: auto;
    min-width: 56px;
    height: 28px;
    padding: 2px 22px 2px 8px;
    font-size: var(--text-sm);
  }
  .row-controls input[type='number'] {
    width: 76px;
    height: 28px;
    padding: 2px 8px;
    text-align: center;
    font-variant-numeric: tabular-nums;
  }
  .row-controls input[type='number'].invalid {
    border-color: var(--danger-500);
    background: var(--danger-50);
  }
  .row-controls .cons-unit {
    width: 56px;
    height: 28px;
    padding: 2px 8px;
    font-size: var(--text-xs);
    color: var(--fg-muted);
  }
  .cons-sep {
    color: var(--fg-muted);
    margin: 0 2px;
  }
  .cons-add {
    background: var(--brand-soft);
    color: var(--sage-800);
    border: none;
    padding: 3px 10px;
    border-radius: var(--radius-full);
    font-size: var(--text-xs);
    font-weight: 600;
    cursor: pointer;
    font-family: inherit;
  }
  .cons-add:hover {
    background: var(--sage-200);
  }

  /* Inline AND/OR connector between rows */
  .row-conn {
    align-self: flex-start;
    margin-left: 14px;
    background: var(--brand-soft);
    color: var(--sage-800);
    border: none;
    border-radius: var(--radius-full);
    padding: 1px 9px;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.06em;
    cursor: pointer;
    font-family: inherit;
    line-height: 1.4;
  }
  .row-conn.or {
    background: var(--warning-50);
    color: var(--warning-700);
  }
  .row-conn:hover {
    filter: brightness(0.96);
  }

  .row-err {
    color: var(--danger-700);
    background: var(--danger-50);
    padding: 4px 12px;
    font-size: var(--text-xs);
    font-weight: 500;
    border-radius: var(--radius-md);
    margin-left: 12px;
  }

  /* Phrase-grouped clauses */
  .clauses {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .clause {
    background: var(--bg-sunken);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-md);
    padding: 8px 10px;
    border-left: 3px solid var(--success-700);
  }
  .clause.exc-clause {
    border-left-color: var(--danger-700);
  }
  .clause-head {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 8px;
    margin-bottom: 6px;
  }
  .clause-phrase {
    font-weight: 600;
    font-size: var(--text-sm);
    line-height: 1.3;
    flex: 1;
  }
  .clause-x {
    background: transparent;
    border: none;
    color: var(--fg-muted);
    cursor: pointer;
    font-size: 16px;
    line-height: 1;
    padding: 2px 6px;
    border-radius: var(--radius-full);
  }
  .clause-x:hover {
    background: var(--neutral-200);
    color: var(--fg-default);
  }
  .clause-cuis {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }
  .cui-display {
    display: inline-block;
    line-height: 1;
  }
  .cui-display.dim {
    opacity: 0.5;
  }
  .add-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    position: relative;
  }
  .add-row input {
    flex: 1;
    background: var(--bg-surface);
    font-size: var(--text-sm);
  }
  .btn-add {
    background: var(--brand-soft);
    color: var(--sage-800);
    border: 1px solid transparent;
    padding: 6px 12px;
    border-radius: var(--radius-md);
    font-size: var(--text-xs);
    font-weight: 600;
    cursor: pointer;
    font-family: inherit;
    white-space: nowrap;
  }
  .btn-add:hover {
    background: var(--sage-200);
  }
  .extracting {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: var(--brand-active);
    font-size: var(--text-xs);
    font-weight: 600;
    white-space: nowrap;
    padding: 0 8px;
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
    align-items: center;
  }
  .btn-danger {
    background: transparent;
    color: var(--danger-700);
    border: 1px solid var(--danger-100);
    padding: 8px 12px;
    border-radius: var(--radius-md);
    font-size: var(--text-sm);
    font-weight: 600;
    cursor: pointer;
    font-family: inherit;
    margin-right: auto;
  }
  .btn-danger:hover {
    background: var(--danger-50);
    border-color: var(--danger-500);
  }

  /* Demographics editor — accordion */
  .demo-accordion {
    background: var(--bg-sunken);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-md);
  }
  .demo-summary {
    cursor: pointer;
    padding: var(--space-3) var(--space-4);
    display: flex;
    align-items: center;
    gap: var(--space-3);
    list-style: none;
    user-select: none;
  }
  .demo-summary::-webkit-details-marker {
    display: none;
  }
  .demo-summary::before {
    content: '▸';
    color: var(--fg-muted);
    transition: transform 0.15s ease;
    font-size: 12px;
  }
  .demo-accordion[open] .demo-summary::before {
    transform: rotate(90deg);
  }
  .demo-badge {
    background: var(--brand);
    color: var(--brand-fg);
    padding: 2px 10px;
    border-radius: var(--radius-full);
    font-size: var(--text-2xs);
    font-weight: 700;
  }
  .demo-clear-all {
    margin-left: auto;
    background: transparent;
    border: 1px solid var(--border-subtle);
    color: var(--fg-muted);
    padding: 3px 10px;
    border-radius: var(--radius-md);
    font-size: var(--text-2xs);
    font-weight: 600;
    cursor: pointer;
    font-family: inherit;
  }
  .demo-clear-all:hover {
    background: var(--danger-50);
    color: var(--danger-700);
    border-color: transparent;
  }
  .demo-accordion .demo-rows {
    padding: var(--space-3) var(--space-4) var(--space-4);
    border-top: 1px solid var(--border-subtle);
  }
  .demo-section-label {
    font-size: var(--text-sm);
    font-weight: 700;
    color: var(--fg-default);
  }
  .demo-rows {
    display: flex;
    flex-direction: column;
  }
  .demo-row {
    display: grid;
    grid-template-columns: 92px 1fr;
    align-items: center;
    gap: var(--space-3);
    padding: 8px 0;
    border-bottom: 1px solid var(--border-subtle);
  }
  .demo-row:last-child {
    border-bottom: none;
  }
  .demo-row-label {
    font-size: var(--text-sm);
    font-weight: 500;
    color: var(--fg-muted);
  }
  .demo-row-body {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
  }
  .age-row {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }
  .age-row input {
    width: 64px;
    background: var(--bg-surface);
    text-align: center;
    height: 32px;
  }
  .age-row input.invalid {
    border-color: var(--danger-500);
    background: var(--danger-50);
  }
  .age-err {
    margin-top: 6px;
    font-size: var(--text-xs);
    color: var(--danger-700);
    font-weight: 500;
  }
  .age-sep {
    color: var(--fg-muted);
  }
  .demo-clear {
    background: transparent;
    border: none;
    color: var(--fg-muted);
    cursor: pointer;
    font-size: var(--text-xs);
    text-decoration: underline;
    padding: 4px;
  }
  .demo-clear:hover {
    color: var(--fg-default);
  }
  .seg {
    display: inline-flex;
    background: var(--bg-surface);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-md);
    padding: 2px;
    gap: 2px;
  }
  .seg button {
    background: transparent;
    border: none;
    padding: 4px 12px;
    border-radius: var(--radius-sm);
    font-size: var(--text-xs);
    font-weight: 600;
    cursor: pointer;
    color: var(--fg-muted);
    font-family: inherit;
  }
  .seg button.active {
    background: var(--brand);
    color: var(--brand-fg);
  }
  .toggle-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }
  .t-chip {
    background: var(--bg-surface);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-full);
    padding: 4px 10px;
    font-size: var(--text-xs);
    font-weight: 500;
    cursor: pointer;
    color: var(--fg-muted);
    font-family: inherit;
  }
  .t-chip:hover {
    color: var(--fg-default);
  }
  .t-chip.on {
    background: var(--brand-soft);
    color: var(--sage-800);
    border-color: transparent;
    font-weight: 600;
  }

  @media (max-width: 720px) {
    .demo-row {
      grid-template-columns: 1fr;
      gap: 6px;
    }
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
  /* Visual grouping panel (OR of AND-groups) */
  .group-panel {
    margin-top: 10px;
    padding: 10px;
    border: 1px solid var(--border-subtle, #e5e7eb);
    border-radius: 10px;
    background: var(--bg-sunken, #f8fafc);
  }
  .gp-head {
    font-size: 0.72rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--fg-default, #334155);
    margin-bottom: 8px;
  }
  .gp-hint {
    display: block;
    font-weight: 400;
    text-transform: none;
    letter-spacing: 0;
    color: var(--fg-muted, #94a3b8);
    font-size: 0.68rem;
    margin-top: 2px;
  }
  .gp-box {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    padding: 8px;
    border: 1px solid #c7d2fe;
    border-radius: 8px;
    background: #fff;
  }
  .gp-or {
    text-align: center;
    font-size: 0.7rem;
    font-weight: 800;
    color: #b45309;
    margin: 6px 0;
    letter-spacing: 0.06em;
  }
  .gp-and {
    font-size: 0.62rem;
    font-weight: 700;
    color: #94a3b8;
  }
  .gp-chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 3px 4px 3px 8px;
    background: var(--brand-soft, #eef2ff);
    border-radius: 6px;
    font-size: 0.78rem;
  }
  .gp-label {
    color: var(--sage-800, #1e293b);
    font-weight: 500;
  }
  .gp-move {
    font-size: 0.64rem;
    border: 1px solid #cbd5e1;
    border-radius: 4px;
    background: #fff;
    padding: 1px 2px;
    cursor: pointer;
  }
  .gp-formula {
    margin-top: 8px;
    font-size: 0.74rem;
    color: #334155;
    font-style: italic;
  }
</style>
