<script lang="ts">
  import { onMount } from 'svelte';
  import { browser } from '$app/environment';
  import { goto } from '$app/navigation';
  import { activeHospital, hospitalLabel, hospitalShortLabel, HOSPITAL_BY_ID } from '$lib/hospitals';
  import { SPONSOR_VIEW_ID } from '$lib/types';
  import { CUIS, cuiLabel, cuisByCategory } from '$lib/cui';
  import {
    PATIENTS_TOTAL,
    patientsLoading,
    searchPatients,
    getSummary,
    getCounts,
    appointmentsByDate,
    liveDataVersion
  } from '$lib/patients';
  import { studies, visibleStudiesFor } from '$lib/studies';
  import { irbCleared } from '$lib/irb';
  import type { Study, PatientSummary } from '$lib/types';
  import StudyMatchPanel from '$lib/components/StudyMatchPanel.svelte';

  let textQuery = '';
  let selectedCuis: string[] = [];
  let gender: 'any' | 'male' | 'female' = 'any';
  let status: 'any' | 'living' | 'deceased' = 'any';
  let ageMin = 0;
  let ageMax = 120;
  let page = 1;
  const PER_PAGE = 50;

  // View mode: 'list' (current) or 'calendar' (new)
  let viewMode: 'list' | 'calendar' = 'list';
  let activeDay: string | null = null; // yyyy-mm-dd when filtering list to a day
  // Calendar nav: month being viewed
  let calendarMonth: Date = (() => {
    const d = new Date();
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
  })();

  // Reset page when filters change
  $: textQuery, selectedCuis, gender, status, ageMin, ageMax, $activeHospital, (page = 1);

  $: apptsByDate = $patientsLoading
    ? new Map<string, number[]>()
    : appointmentsByDate($activeHospital);

  function todayIso(): string {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.toISOString().slice(0, 10);
  }

  $: dayResults = activeDay && !$patientsLoading
    ? (apptsByDate.get(activeDay) ?? [])
    : [];

  // `$liveDataVersion >= 0` is always true but references the store, so the list
  // recomputes when live patients are (re)loaded even if nothing else changed.
  $: results = $patientsLoading || $liveDataVersion < 0
    ? []
    : activeDay
      ? dayResults
      : searchPatients({
          text: textQuery,
          cuis: selectedCuis.length ? selectedCuis : undefined,
          hospitalId: $activeHospital,
          gender,
          status,
          ageMin,
          ageMax
        });

  $: totalPages = Math.max(1, Math.ceil(results.length / PER_PAGE));
  $: pageStart = (page - 1) * PER_PAGE;
  $: pageItems = results.slice(pageStart, pageStart + PER_PAGE).map((idx) => getSummary(idx));

  $: counts = $patientsLoading || $liveDataVersion < 0 ? null : getCounts($activeHospital);
  $: scopeLabel = $activeHospital === SPONSOR_VIEW_ID ? 'all hospitals' : hospitalShortLabel($activeHospital);
  $: isSponsor = $activeHospital === SPONSOR_VIEW_ID;

  // Studies visible to the current hospital tenant. The patient list only
  // surfaces published trials — drafts shouldn't drive patient-level matches.
  $: visibleStudies = visibleStudiesFor($studies, $activeHospital).filter((s) => s.published);

  // Compute studies a patient matches, restricted to what the active tenant
  // is allowed to see.
  function studiesForPatient(p: PatientSummary, all: Study[]): Study[] {
    return all.filter((s) => {
      if (s.patientStatus !== 'either' && s.patientStatus !== p.status) return false;
      const cuiSet = new Set(p.cuis);
      if (!s.inclusionCuis.every((c) => cuiSet.has(c))) return false;
      if (s.exclusionCuis.some((c) => cuiSet.has(c))) return false;
      return true;
    });
  }

  $: pageMatches = new Map(pageItems.map((p) => [p.index, studiesForPatient(p, visibleStudies)]));

  let openPatient: PatientSummary | null = null;
  $: openPatientStudies = openPatient ? pageMatches.get(openPatient.index) ?? [] : [];

  function closeModal() {
    openPatient = null;
  }

  // Open the patient's timeline study-agnostically (no single study's review
  // panel) — the detail page shows a "Matched against N studies" accordion when
  // there's no study context. `_` is a non-existent study id sentinel.
  function openTimeline(p: PatientSummary) {
    goto(`/studies/_/patients/${p.patientId}`);
  }
  function handleEsc(e: KeyboardEvent) {
    if (e.key === 'Escape') closeModal();
  }

  function toggleCui(cui: string) {
    if (selectedCuis.includes(cui)) {
      selectedCuis = selectedCuis.filter((c) => c !== cui);
    } else {
      selectedCuis = [...selectedCuis, cui];
    }
  }

  function clearAll() {
    textQuery = '';
    selectedCuis = [];
    gender = 'any';
    status = 'any';
    ageMin = 0;
    ageMax = 120;
  }

  function fmtNum(n: number): string {
    return n.toLocaleString();
  }

  // Top CUIs to surface as quick filters (computed from current scope)
  $: topCuis = counts ? counts.byCui.slice(0, 14) : [];

  $: hasFilters =
    textQuery || selectedCuis.length || gender !== 'any' || status !== 'any' || ageMin > 0 || ageMax < 120;

  // Pagination helpers
  function gotoPage(p: number) {
    page = Math.min(Math.max(1, p), totalPages);
  }
</script>

<div class="page-header">
  <div>
    <h1>Patients</h1>
    <p class="muted">
      {#if $patientsLoading}
        Building patient index for {fmtNum(PATIENTS_TOTAL)} records…
      {:else if activeDay}
        Showing <strong>{(apptsByDate.get(activeDay) ?? []).length}</strong> patient(s) with appointments on <strong>{new Date(activeDay).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</strong> in <strong>{scopeLabel}</strong>.
      {:else}
        {fmtNum(counts?.total ?? 0)} patients in <strong>{scopeLabel}</strong>
      {/if}
    </p>
  </div>

  {#if !isSponsor && !$patientsLoading}
    <div class="view-toggle" role="tablist" aria-label="View mode">
      <button
        type="button"
        class:active={viewMode === 'list' && !activeDay}
        on:click={() => {
          viewMode = 'list';
          activeDay = null;
        }}
      >
        List
      </button>
      <button
        type="button"
        class:active={viewMode === 'calendar'}
        on:click={() => {
          viewMode = 'calendar';
          activeDay = null;
        }}
      >
        Calendar
      </button>
    </div>
  {/if}
</div>

{#if !isSponsor && !$patientsLoading && viewMode === 'calendar' && !activeDay}
  {@const monthStart = calendarMonth}
  {@const year = monthStart.getFullYear()}
  {@const month = monthStart.getMonth()}
  {@const firstDow = new Date(year, month, 1).getDay()}
  {@const daysInMonth = new Date(year, month + 1, 0).getDate()}
  {@const today = todayIso()}
  {@const totalCells = Math.ceil((firstDow + daysInMonth) / 7) * 7}
  <section class="calendar-card">
    <header class="cal-head">
      <button
        type="button"
        class="cal-nav"
        on:click={() => (calendarMonth = new Date(year, month - 1, 1))}
        aria-label="Previous month"
      >
        ‹
      </button>
      <h2>{monthStart.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</h2>
      <button
        type="button"
        class="cal-nav"
        on:click={() => (calendarMonth = new Date(year, month + 1, 1))}
        aria-label="Next month"
      >
        ›
      </button>
      <button
        type="button"
        class="btn btn-ghost cal-today"
        on:click={() => {
          const d = new Date();
          d.setDate(1);
          d.setHours(0, 0, 0, 0);
          calendarMonth = d;
        }}
      >
        Today
      </button>
    </header>

    <div class="cal-grid-head">
      {#each ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as d}
        <div class="cal-dow">{d}</div>
      {/each}
    </div>

    <div class="cal-grid">
      {#each Array(totalCells) as _, i}
        {@const dayNum = i - firstDow + 1}
        {@const inMonth = dayNum >= 1 && dayNum <= daysInMonth}
        {@const dateObj = inMonth ? new Date(year, month, dayNum) : null}
        {@const dateKey = dateObj ? `${year}-${String(month + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}` : ''}
        {@const count = inMonth ? (apptsByDate.get(dateKey)?.length ?? 0) : 0}
        {@const isToday = dateKey === today}
        {@const isPast = inMonth && dateKey < today}
        {#if !inMonth}
          <div class="cal-cell empty"></div>
        {:else if count === 0}
          <div class="cal-cell" class:today={isToday} class:past={isPast}>
            <div class="cal-day-num">{dayNum}</div>
          </div>
        {:else}
          <button
            type="button"
            class="cal-cell has-appts"
            class:today={isToday}
            class:past={isPast}
            on:click={() => {
              activeDay = dateKey;
              viewMode = 'list';
              page = 1;
            }}
          >
            <div class="cal-day-num">{dayNum}</div>
            <div class="cal-count">
              <span class="cal-count-num">{count}</span>
              <span class="cal-count-label">{count === 1 ? 'patient' : 'patients'}</span>
            </div>
          </button>
        {/if}
      {/each}
    </div>

    <footer class="cal-foot muted small">
      Showing upcoming appointments for <strong>{scopeLabel}</strong>. Click any day with patients to drill into the list.
    </footer>
  </section>
{:else if isSponsor}
  <div class="sponsor-state">
    <h2>Sponsor view does not show individual patients</h2>
    <p class="muted">
      Patient-level data stays inside each hospital tenant. As a sponsor, you can browse
      your studies and see <strong>aggregate counts and a hospital-level map</strong> for
      each one.
    </p>
    <div class="sponsor-actions">
      <a class="btn btn-primary" href="/studies">Go to studies</a>
      <span class="muted small">or switch to a hospital in the top bar to see patients.</span>
    </div>
  </div>
{:else if $patientsLoading}
  <div class="loading">
    <div class="spinner"></div>
    <p class="muted">Generating deterministic mock cohort…</p>
  </div>
{:else}
  {#if activeDay}
    <div class="day-banner">
      <button type="button" class="btn btn-ghost" on:click={() => { activeDay = null; viewMode = 'calendar'; }}>
        ← Back to calendar
      </button>
      <span>
        Patients with appointments on
        <strong>{new Date(activeDay).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</strong>
      </span>
    </div>
  {/if}
  <div class="toolbar">
    <div class="search-row">
      <div class="search">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" stroke-linecap="round" />
        </svg>
        <input
          type="text"
          placeholder="Search by patient ID, state, or condition CUI…"
          bind:value={textQuery}
        />
        {#if textQuery}
          <button class="clear-x" type="button" on:click={() => (textQuery = '')} aria-label="Clear">×</button>
        {/if}
      </div>

      <div class="result-count">
        <strong>{fmtNum(results.length)}</strong>
        <span class="muted">match{results.length === 1 ? '' : 'es'}</span>
        {#if hasFilters}
          <button type="button" class="link-btn" on:click={clearAll}>Clear filters</button>
        {/if}
      </div>
    </div>

    <div class="filter-row">
      <select bind:value={gender}>
        <option value="any">Any gender</option>
        <option value="female">Female</option>
        <option value="male">Male</option>
      </select>
      <select bind:value={status}>
        <option value="any">Living or deceased</option>
        <option value="living">Living</option>
        <option value="deceased">Deceased</option>
      </select>
      <div class="age-range">
        <label for="ageMin">Age</label>
        <input id="ageMin" type="number" min="0" max="120" bind:value={ageMin} />
        <span>–</span>
        <input type="number" min="0" max="120" bind:value={ageMax} />
      </div>
    </div>

    <details class="cui-section" open={selectedCuis.length > 0}>
      <summary class="cui-summary">
        <span class="cui-title">Filter by CUI</span>
        <span class="muted small">
          {selectedCuis.length > 0
            ? `${selectedCuis.length} active`
            : 'Optional · click to require specific concepts'}
        </span>
      </summary>
      <div class="cui-body">
        <div class="cui-chips">
          {#each topCuis as { cui, count }}
            {@const selected = selectedCuis.includes(cui)}
            <button type="button" class="cui-chip" class:selected on:click={() => toggleCui(cui)}>
              <span class="cui-label">{cuiLabel(cui)}</span>
              <span class="cui-count">{fmtNum(count)}</span>
            </button>
          {/each}
        </div>
        {#if selectedCuis.length > 0}
          <div class="selected-row">
            <span class="muted small">Selected:</span>
            {#each selectedCuis as cui}
              <button type="button" class="selected-chip" on:click={() => toggleCui(cui)}>
                {cuiLabel(cui)} <span class="x">×</span>
              </button>
            {/each}
          </div>
        {/if}
      </div>
    </details>
  </div>

  {#if results.length === 0}
    <div class="empty">
      <p>No patients match your filters in {scopeLabel}.</p>
      <button type="button" class="btn btn-secondary" on:click={clearAll}>Clear filters</button>
    </div>
  {:else}
    <div class="table" class:sponsor-cols={isSponsor} class:irb-cols={$irbCleared && !isSponsor}>
      <div class="thead" class:sponsor-cols={isSponsor} class:irb-cols={$irbCleared && !isSponsor}>
        {#if $irbCleared && !isSponsor}
          <div class="col-name">Name</div>
          <div class="col-mrn">MRN</div>
        {/if}
        {#if isSponsor}<div class="col-hospital">Hospital</div>{/if}
        <div class="col-age">Age</div>
        <div class="col-gender">Sex</div>
        <div class="col-race">Race</div>
        <div class="col-ethnicity">Ethnicity</div>
        <div class="col-state">ZIP</div>
        <div class="col-status">Status</div>
        <div class="col-matches">Studies</div>
      </div>
      {#each pageItems as p (p.index)}
        {@const matchedStudies = pageMatches.get(p.index) ?? []}
        <div
          class="trow clickable"
          class:sponsor-cols={isSponsor}
          class:irb-cols={$irbCleared && !isSponsor}
          role="button"
          tabindex="0"
          title="Open patient timeline"
          on:click={() => openTimeline(p)}
          on:keydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openTimeline(p); } }}
        >
          {#if $irbCleared && !isSponsor}
            <div class="col-name">{p.firstName} {p.lastName}</div>
            <div class="col-mrn mono">{p.mrn}</div>
          {/if}
          {#if isSponsor}
            <div class="col-hospital">{HOSPITAL_BY_ID.get(p.hospitalId)?.shortName ?? p.hospitalId}</div>
          {/if}
          <div class="col-age">{p.age}</div>
          <div class="col-gender">{p.gender === 'female' ? 'F' : 'M'}</div>
          <div class="col-race">{p.race}</div>
          <div class="col-ethnicity">{p.ethnicity}</div>
          <div class="col-state mono">{p.zip}</div>
          <div class="col-status">
            <span class="status-pill status-{p.status}">{p.status}</span>
          </div>
          <div class="col-matches">
            {#if matchedStudies.length === 0}
              <span class="match-count empty" aria-disabled="true">0</span>
            {:else}
              <button
                type="button"
                class="match-count"
                on:click|stopPropagation={() => (openPatient = p)}
                title="View matching studies"
              >
                {matchedStudies.length}
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
                  <path d="M9 6l6 6-6 6" />
                </svg>
              </button>
            {/if}
          </div>
        </div>
      {/each}
    </div>

    <div class="pagination">
      <button class="btn btn-ghost" disabled={page === 1} on:click={() => gotoPage(page - 1)}>← Prev</button>
      <span class="page-info muted">
        Page <strong>{page}</strong> of {fmtNum(totalPages)}
        <span class="dim">·</span>
        showing {fmtNum(pageStart + 1)}–{fmtNum(Math.min(pageStart + PER_PAGE, results.length))}
      </span>
      <button class="btn btn-ghost" disabled={page === totalPages} on:click={() => gotoPage(page + 1)}>Next →</button>
    </div>
  {/if}

  {#if openPatient}
    <StudyMatchPanel
      patient={openPatient}
      studies={openPatientStudies}
      on:close={closeModal}
    />
  {/if}

  {#if $activeHospital === SPONSOR_VIEW_ID && counts}
    <section class="sponsor-aggregate">
      <h2>Distribution by hospital</h2>
      <div class="bar-list">
        {#each counts.byHospital as { hospitalId: hid, count }}
          {@const pct = counts.total > 0 ? (count / counts.total) * 100 : 0}
          <div class="bar-row">
            <div class="bar-label">{hospitalShortLabel(hid)}</div>
            <div class="bar-track">
              <div class="bar-fill" style="width: {pct.toFixed(1)}%"></div>
            </div>
            <div class="bar-value">{fmtNum(count)}</div>
          </div>
        {/each}
      </div>
    </section>
  {/if}
{/if}

<style>
  .page-header {
    margin-bottom: 18px;
  }

  .page-header h1 {
    font-size: 28px;
    margin-bottom: 4px;
  }

  .page-header p {
    margin: 0;
  }

  .loading {
    background: white;
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 60px 20px;
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
  }

  .spinner {
    width: 28px;
    height: 28px;
    border: 3px solid var(--border);
    border-top-color: var(--primary);
    border-radius: 50%;
    animation: spin 0.9s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .toolbar {
    background: white;
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 14px;
    margin-bottom: 16px;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .search-row {
    display: flex;
    gap: 12px;
    align-items: center;
  }

  .search {
    flex: 1;
    position: relative;
    display: flex;
    align-items: center;
  }

  .search :global(svg) {
    position: absolute;
    left: 10px;
    color: var(--text-muted);
    pointer-events: none;
  }

  .search input {
    padding-left: 34px;
    padding-right: 30px;
    height: 38px;
    font-size: 14px;
  }

  .clear-x {
    position: absolute;
    right: 6px;
    background: transparent;
    border: none;
    cursor: pointer;
    color: var(--text-muted);
    font-size: 18px;
    line-height: 1;
    padding: 4px 8px;
    border-radius: 4px;
  }

  .clear-x:hover {
    background: var(--surface-alt);
    color: var(--text);
  }

  .result-count {
    font-size: 14px;
    display: flex;
    align-items: center;
    gap: 6px;
    white-space: nowrap;
  }

  .link-btn {
    background: transparent;
    border: none;
    color: var(--primary);
    font-weight: 600;
    cursor: pointer;
    font-size: 13px;
    padding: 0;
    margin-left: 6px;
  }

  .link-btn:hover {
    text-decoration: underline;
  }

  .filter-row {
    display: flex;
    gap: 10px;
    align-items: center;
    flex-wrap: wrap;
  }

  .filter-row select {
    width: auto;
    min-width: 140px;
    height: 34px;
    padding: 4px 10px;
    font-size: 13px;
    background: white;
  }

  .age-range {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
  }

  .age-range label {
    margin: 0;
    font-size: 13px;
    color: var(--text-muted);
    font-weight: 500;
  }

  .age-range input {
    width: 60px;
    height: 32px;
    padding: 4px 8px;
    text-align: center;
  }

  .cui-section {
    border-top: 1px solid var(--border);
    padding-top: 12px;
  }

  .cui-summary {
    cursor: pointer;
    list-style: none;
    display: flex;
    align-items: center;
    gap: 8px;
    user-select: none;
  }
  .cui-summary::-webkit-details-marker {
    display: none;
  }
  .cui-summary::before {
    content: '▸';
    color: var(--fg-muted);
    transition: transform 0.15s ease;
    font-size: 12px;
  }
  .cui-section[open] .cui-summary::before {
    transform: rotate(90deg);
  }
  .cui-body {
    margin-top: 8px;
  }

  .cui-title {
    font-size: 12px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-muted);
  }

  .small {
    font-size: 12px;
  }

  .cui-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .cui-chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    background: white;
    border: 1px solid var(--border);
    border-radius: 999px;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    color: var(--text);
    transition: all 0.1s ease;
  }

  .cui-chip:hover {
    border-color: var(--primary);
  }

  .cui-chip.selected {
    background: var(--primary);
    border-color: var(--primary);
    color: white;
  }

  .cui-chip.selected .cui-count {
    background: rgba(255, 255, 255, 0.25);
    color: white;
  }

  .cui-label {
    line-height: 1.2;
  }

  .cui-count {
    background: var(--surface-alt);
    color: var(--text-muted);
    padding: 0 6px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 700;
  }

  .selected-row {
    margin-top: 10px;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
  }

  .selected-chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 3px 8px;
    background: var(--primary-light);
    color: var(--primary-dark);
    border: 1px solid transparent;
    border-radius: 999px;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
  }

  .selected-chip .x {
    font-weight: 700;
    margin-left: 2px;
  }

  .empty {
    background: white;
    border: 1px dashed var(--border);
    border-radius: 8px;
    padding: 48px 24px;
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
  }

  /* table */
  .table {
    background: white;
    border: 1px solid var(--border);
    border-radius: 10px;
    overflow: hidden;
  }

  .thead,
  .trow {
    display: grid;
    /* tenant: age, sex, race, ethnicity, zip, status, studies — 7 equal cols */
    grid-template-columns: repeat(7, minmax(0, 1fr));
    gap: 12px;
    padding: 10px 14px;
    align-items: center;
    font-size: var(--text-sm);
    line-height: 1.4;
  }

  .thead {
    padding-top: 12px;
    padding-bottom: 12px;
  }

  /* tenant + IRB: name, mrn, age, sex, race, ethnicity, zip, status, studies — 9 cols */
  .thead.irb-cols,
  .trow.irb-cols {
    grid-template-columns: repeat(9, minmax(0, 1fr));
  }

  /* sponsor: hospital, age, sex, race, ethnicity, zip, status, studies — 8 cols */
  .thead.sponsor-cols,
  .trow.sponsor-cols {
    grid-template-columns: repeat(8, minmax(0, 1fr));
  }

  .col-matches {
    text-align: right;
  }

  .match-count {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 3px 10px;
    border-radius: var(--radius-full);
    background: var(--brand-soft);
    color: var(--sage-800);
    font-weight: 700;
    font-size: var(--text-xs);
    border: 1px solid transparent;
    cursor: pointer;
    font-variant-numeric: tabular-nums;
    transition: background 0.12s ease, border-color 0.12s ease;
  }

  .match-count:hover {
    background: var(--sage-200);
    border-color: var(--sage-300);
  }

  .match-count.empty {
    background: var(--bg-sunken);
    color: var(--fg-subtle);
    cursor: default;
    font-weight: 500;
  }

  .thead {
    background: var(--surface-alt);
    border-bottom: 1px solid var(--border);
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-muted);
  }

  .trow {
    border-bottom: 1px solid var(--border);
  }

  .trow:last-child {
    border-bottom: none;
  }

  .trow:hover {
    background: var(--surface-alt);
  }

  .trow.clickable {
    cursor: pointer;
  }

  .mono {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 12px;
  }

  .status-pill {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 600;
    text-transform: capitalize;
  }

  .status-living {
    background: var(--primary-light);
    color: var(--primary-dark);
  }

  .status-deceased {
    background: #f3f4f6;
    color: #4b5563;
  }

  .pagination {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: 14px;
    gap: 12px;
  }

  .page-info {
    font-size: 13px;
  }

  .dim {
    opacity: 0.4;
    margin: 0 4px;
  }

  .page-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    gap: var(--space-4);
  }

  .view-toggle {
    display: inline-flex;
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-md);
    background: var(--bg-sunken);
    padding: 3px;
    gap: 2px;
  }
  .view-toggle button {
    background: transparent;
    border: none;
    padding: 6px 14px;
    cursor: pointer;
    color: var(--fg-muted);
    border-radius: var(--radius-sm);
    font-family: inherit;
    font-size: var(--text-sm);
    font-weight: 600;
    transition: all 0.12s ease;
  }
  .view-toggle button:hover {
    color: var(--fg-default);
  }
  .view-toggle button.active {
    background: var(--bg-surface);
    color: var(--fg-default);
    box-shadow: var(--shadow-xs);
  }

  /* Calendar */
  .calendar-card {
    background: var(--bg-surface);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-lg);
    padding: var(--space-5);
    box-shadow: var(--shadow-xs);
  }

  .cal-head {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    margin-bottom: var(--space-4);
  }
  .cal-head h2 {
    font-family: var(--font-display);
    font-size: var(--text-xl);
    font-weight: 600;
    margin: 0;
    flex: 1;
    text-align: center;
  }
  .cal-nav {
    background: var(--bg-sunken);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-md);
    width: 36px;
    height: 36px;
    cursor: pointer;
    font-size: 18px;
    color: var(--fg-muted);
  }
  .cal-nav:hover {
    background: var(--neutral-200);
    color: var(--fg-default);
  }
  .cal-today {
    height: 36px;
  }

  .cal-grid-head,
  .cal-grid {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 4px;
  }
  .cal-grid-head {
    margin-bottom: 4px;
  }
  .cal-dow {
    text-align: center;
    font-size: var(--text-2xs);
    font-weight: 700;
    color: var(--fg-muted);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    padding: 4px 0;
  }

  .cal-cell {
    background: var(--bg-sunken);
    border-radius: var(--radius-sm);
    min-height: 80px;
    padding: 6px 8px;
    border: 1px solid transparent;
    position: relative;
    color: inherit;
    font: inherit;
    text-align: left;
  }
  .cal-cell.empty {
    background: transparent;
    border: none;
  }
  .cal-cell.past .cal-day-num {
    color: var(--fg-disabled);
  }
  .cal-cell.today {
    border-color: var(--brand);
  }
  .cal-cell.today .cal-day-num {
    color: var(--brand-active);
    font-weight: 700;
  }

  .cal-day-num {
    font-size: var(--text-sm);
    font-weight: 600;
    color: var(--fg-default);
  }

  .cal-cell.has-appts {
    background: var(--brand-soft);
    cursor: pointer;
    transition: all 0.12s ease;
  }
  .cal-cell.has-appts:hover {
    background: var(--sage-200);
    transform: translateY(-1px);
    box-shadow: var(--shadow-sm);
  }
  .cal-cell.has-appts.past {
    opacity: 0.55;
  }

  .cal-count {
    margin-top: 6px;
    display: flex;
    align-items: baseline;
    gap: 4px;
  }
  .cal-count-num {
    font-family: var(--font-display);
    font-size: var(--text-md);
    font-weight: 700;
    color: var(--sage-900);
    line-height: 1;
    font-variant-numeric: tabular-nums;
  }
  .cal-count-label {
    font-size: var(--text-2xs);
    color: var(--sage-800);
  }

  .cal-foot {
    margin-top: var(--space-3);
    padding-top: var(--space-3);
    border-top: 1px solid var(--border-subtle);
  }

  .day-banner {
    background: var(--brand-soft);
    border: 1px solid transparent;
    border-radius: var(--radius-md);
    padding: 8px 12px;
    margin-bottom: var(--space-3);
    display: flex;
    align-items: center;
    gap: var(--space-3);
    font-size: var(--text-sm);
    color: var(--sage-800);
  }

  .sponsor-state {
    background: var(--bg-surface);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-lg);
    padding: var(--space-12) var(--space-8);
    text-align: center;
    max-width: 640px;
    margin: 0 auto;
    box-shadow: var(--shadow-xs);
  }

  .sponsor-state h2 {
    font-family: var(--font-display);
    font-size: var(--text-xl);
    margin-bottom: var(--space-3);
  }

  .sponsor-state p {
    margin: 0 auto var(--space-6);
    max-width: 480px;
    line-height: var(--leading-relaxed);
  }

  .sponsor-actions {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-3);
  }

  /* sponsor aggregate */
  .sponsor-aggregate {
    margin-top: 32px;
    background: white;
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 18px;
  }

  .sponsor-aggregate h2 {
    font-size: 16px;
    font-weight: 600;
    margin-bottom: 14px;
  }

  .bar-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .bar-row {
    display: grid;
    grid-template-columns: 180px 1fr 80px;
    gap: 12px;
    align-items: center;
    font-size: 13px;
  }

  .bar-label {
    color: var(--text-muted);
  }

  .bar-track {
    background: var(--surface-alt);
    height: 18px;
    border-radius: 4px;
    overflow: hidden;
  }

  .bar-fill {
    height: 100%;
    background: var(--primary);
    border-radius: 4px;
  }

  .bar-value {
    text-align: right;
    font-variant-numeric: tabular-nums;
    font-weight: 600;
  }

  @media (max-width: 900px) {
    .thead,
    .trow,
    .thead.sponsor-cols,
    .trow.sponsor-cols {
      grid-template-columns: 110px 50px 60px 70px;
    }
    .col-hospital,
    .col-race,
    .col-ethnicity,
    .col-state,
    .col-status {
      display: none;
    }
  }
</style>
