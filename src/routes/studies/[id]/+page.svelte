<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { studies } from '$lib/studies';
  import { TEAM_MEMBERS } from '$lib/mockData';
  import { cuiLabel } from '$lib/cui';
  import {
    matchStudyForStudy,
    getSummary,
    patientsLoading,
    PATIENTS_TOTAL
  } from '$lib/patients';
  import { activeHospital, hospitalShortLabel, HOSPITAL_BY_ID, HOSPITALS } from '$lib/hospitals';
  import { SPONSOR_VIEW_ID } from '$lib/types';
  import { decisions, studyDecisions, type Decision } from '$lib/decisions';
  import { irbCleared } from '$lib/irb';
  import type { Study } from '$lib/types';
  import HospitalMap from '$lib/components/HospitalMap.svelte';
  import EditStudyModal from '$lib/components/EditStudyModal.svelte';
  import CuiChip from '$lib/components/CuiChip.svelte';

  let showEdit = false;

  $: studyId = $page.params.id ?? '';
  $: rawStudy = $studies.find((s) => s.id === studyId);
  // Tenant-scoped: a study is only visible to its owner tenant.
  $: study = rawStudy && rawStudy.ownerId === $activeHospital ? rawStudy : null;
  $: studyDec = studyDecisions(studyId);

  // View state
  let view: 'cards' | 'list' = 'list';
  let decisionFilter: 'all' | 'pending' | 'accepted' | 'rejected' | 'watchlisted' = 'all';
  let sponsorView: 'map' | 'sites' = 'map';
  let pageNum = 1;
  const PER_PAGE = 25;

  $: pageNum = pageNum, decisionFilter, $activeHospital, studyId; // reset on change
  $: if (decisionFilter || $activeHospital || studyId) pageNum = 1;

  $: matched = study && !$patientsLoading
    ? matchStudyForStudy(study, $activeHospital)
    : [];

  $: stats = (() => {
    let accepted = 0;
    let rejected = 0;
    let watchlisted = 0;
    for (const idx of matched) {
      const d = $studyDec[String(idx)];
      if (d === 'accepted') accepted++;
      else if (d === 'rejected') rejected++;
      else if (d === 'watchlisted') watchlisted++;
    }
    return {
      total: matched.length,
      accepted,
      rejected,
      watchlisted,
      pending: matched.length - accepted - rejected - watchlisted
    };
  })();

  $: filtered = matched.filter((idx) => {
    const d = $studyDec[String(idx)];
    if (decisionFilter === 'all') return true;
    if (decisionFilter === 'pending') return !d;
    return d === decisionFilter;
  });

  $: totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  $: pageStart = (pageNum - 1) * PER_PAGE;
  $: pageItems = filtered.slice(pageStart, pageStart + PER_PAGE).map((idx) => ({
    idx,
    summary: getSummary(idx),
    decision: $studyDec[String(idx)] ?? null
  }));

  function fmtNum(n: number): string {
    return n.toLocaleString();
  }

  function setDecision(idx: number, d: Decision) {
    decisions.set(studyId, idx, d);
  }

  function clearDecision(idx: number) {
    decisions.clear(studyId, idx);
  }

  function teamName(id: string): string {
    return TEAM_MEMBERS.find((m) => m.id === id)?.name ?? id;
  }

  function patientStatusLabel(s: 'living' | 'deceased' | 'either'): string {
    if (s === 'living') return 'Living';
    if (s === 'deceased') return 'Deceased';
    return 'Either';
  }

  $: scopeLabel = $activeHospital === SPONSOR_VIEW_ID ? 'all hospitals' : hospitalShortLabel($activeHospital);
  $: isSponsor = $activeHospital === SPONSOR_VIEW_ID;

  // Aggregate by hospital for sponsor view
  $: byHospital = (() => {
    if (!isSponsor) return new Map<string, number>();
    const m = new Map<string, number>();
    for (const idx of matched) {
      const s = getSummary(idx);
      m.set(s.hospitalId, (m.get(s.hospitalId) ?? 0) + 1);
    }
    return m;
  })();

  $: mapPoints = HOSPITALS.map((h) => ({
    id: h.id,
    name: h.name,
    shortName: h.shortName,
    lat: h.lat,
    lng: h.lng,
    count: byHospital.get(h.id) ?? 0
  })).filter((p) => p.count > 0);

  $: sortedHospitalCounts = HOSPITALS.map((h) => ({
    hospital: h,
    count: byHospital.get(h.id) ?? 0
  })).sort((a, b) => b.count - a.count);
</script>

{#if !study}
  <div class="page-header">
    <a href="/studies" class="back">← All studies</a>
    <h1>Study not found</h1>
    <p class="muted">No study with id <code>{studyId}</code>.</p>
  </div>
{:else}
  <div class="page-header">
    <a href="/studies" class="back">← All studies</a>
    <div class="title-row">
      <div>
        <h1>{study.name}</h1>
        {#if study.nctId}
          <p class="muted"><span class="mono">{study.nctId}</span></p>
        {/if}
      </div>
      <button type="button" class="btn btn-secondary" on:click={() => (showEdit = true)}>
        Edit study
      </button>
    </div>
  </div>

  {#if showEdit && study}
    <EditStudyModal {study} on:close={() => (showEdit = false)} />
  {/if}

  <section class="study-summary">
    <div class="summary-grid">
      <div class="sum-cell">
        <div class="sum-label">Phase</div>
        <div class="sum-value">{study.phase}</div>
      </div>
      <div class="sum-cell">
        <div class="sum-label">Patient status</div>
        <div class="sum-value">{patientStatusLabel(study.patientStatus)}</div>
      </div>
      {#if study.ownerId !== SPONSOR_VIEW_ID}
        <div class="sum-cell">
          <div class="sum-label">Visibility</div>
          <div class="sum-value">
            {study.published ? 'Published to network' : 'Private'}
          </div>
        </div>
      {/if}
      <div class="sum-cell">
        <div class="sum-label">Team ({study.teamMemberIds.length})</div>
        <div class="sum-value team-list">
          {#each study.teamMemberIds as id}
            <span class="team-pill">{teamName(id)}</span>
          {/each}
        </div>
      </div>
    </div>

    <div class="cui-block">
      <div class="cui-col">
        <div class="cui-heading">Inclusion CUIs ({study.inclusionCuis.length})</div>
        <div class="cui-tags">
          {#each study.inclusionCuis as c}
            <CuiChip cui={c} variant="inc" selectedCuis={study.inclusionCuis} />
          {:else}
            <span class="muted small">No CUIs mapped.</span>
          {/each}
        </div>
      </div>
      <div class="cui-col">
        <div class="cui-heading">Exclusion CUIs ({study.exclusionCuis.length})</div>
        <div class="cui-tags">
          {#each study.exclusionCuis as c}
            <CuiChip cui={c} variant="exc" selectedCuis={study.exclusionCuis} />
          {:else}
            <span class="muted small">No exclusions.</span>
          {/each}
        </div>
      </div>
    </div>
  </section>

  {#if isSponsor}
    <section class="match-bar">
      <div class="match-stats sponsor-stats">
        <div class="stat stat-total">
          <div class="stat-num">{fmtNum(stats.total)}</div>
          <div class="stat-label">Matching across all hospitals</div>
        </div>
        <div class="stat">
          <div class="stat-num">{fmtNum(mapPoints.length)}</div>
          <div class="stat-label">Hospitals with matches</div>
        </div>
      </div>
    </section>
  {:else}
    <section class="match-bar">
      <div class="match-stats">
        <div class="stat stat-total">
          <div class="stat-num">{fmtNum(stats.total)}</div>
          <div class="stat-label">Matching in {scopeLabel}</div>
        </div>
        <div class="stat stat-pending">
          <div class="stat-num">{fmtNum(stats.pending)}</div>
          <div class="stat-label">Unreviewed</div>
        </div>
        <div class="stat stat-accepted">
          <div class="stat-num">{fmtNum(stats.accepted)}</div>
          <div class="stat-label">Accepted</div>
        </div>
        <div class="stat stat-rejected">
          <div class="stat-num">{fmtNum(stats.rejected)}</div>
          <div class="stat-label">Rejected</div>
        </div>
        <div class="stat stat-watchlisted">
          <div class="stat-num">{fmtNum(stats.watchlisted)}</div>
          <div class="stat-label">Watchlisted</div>
        </div>
      </div>
    </section>
  {/if}

  {#if $patientsLoading}
    <div class="loading">
      <div class="spinner"></div>
      <p class="muted">Loading patient index for {fmtNum(PATIENTS_TOTAL)} records…</p>
    </div>
  {:else if matched.length === 0}
    <div class="empty">
      <p>No patients match this study's CUIs in {scopeLabel}.</p>
      {#if $activeHospital !== SPONSOR_VIEW_ID}
        <p class="muted small">Try switching to Sponsor view in the top bar to see matches across all hospitals.</p>
      {/if}
    </div>
  {:else if isSponsor}
    <div class="controls">
      <div class="muted small">
        Showing aggregate distribution of <strong>{fmtNum(stats.total)}</strong> matching patients across {mapPoints.length} hospitals.
      </div>

      <div class="view-toggle" role="tablist" aria-label="View mode">
        <button
          type="button"
          class:active={sponsorView === 'map'}
          on:click={() => (sponsorView = 'map')}
          title="Map view"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M9 3 3 5v16l6-2 6 2 6-2V3l-6 2-6-2z" />
            <path d="M9 3v16M15 5v16" />
          </svg>
        </button>
        <button
          type="button"
          class:active={sponsorView === 'sites'}
          on:click={() => (sponsorView = 'sites')}
          title="Sites table"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      </div>
    </div>

    {#if sponsorView === 'map'}
      <HospitalMap points={mapPoints} height="520px" />
    {:else}
      <div class="sites-table">
        <div class="sites-head">
          <div>Hospital</div>
          <div>City, State</div>
          <div class="num">Matching patients</div>
          <div class="num">% of total</div>
        </div>
        {#each sortedHospitalCounts as { hospital: h, count }}
          {@const pct = stats.total > 0 ? (count / stats.total) * 100 : 0}
          <div class="sites-row" class:zero={count === 0}>
            <div class="site-name">{h.shortName}</div>
            <div class="muted">{h.city}, {h.state}</div>
            <div class="num">
              <strong>{fmtNum(count)}</strong>
            </div>
            <div class="num bar-cell">
              <div class="bar-track">
                <div class="bar-fill" style="width: {pct.toFixed(1)}%"></div>
              </div>
              <span class="muted">{pct.toFixed(1)}%</span>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  {:else}
    <div class="controls">
      <div class="filter-tabs">
        {#each ['all', 'pending', 'accepted', 'rejected', 'watchlisted'] as const as f}
          {@const counts = { all: stats.total, pending: stats.pending, accepted: stats.accepted, rejected: stats.rejected, watchlisted: stats.watchlisted }}
          <button
            type="button"
            class="filter-tab"
            class:active={decisionFilter === f}
            on:click={() => (decisionFilter = f)}
          >
            {f === 'pending' ? 'Unreviewed' : f.charAt(0).toUpperCase() + f.slice(1)}
            <span class="count">{fmtNum(counts[f])}</span>
          </button>
        {/each}
      </div>

      <div class="view-toggle" role="tablist" aria-label="View mode">
        <button
          type="button"
          class:active={view === 'list'}
          on:click={() => (view = 'list')}
          title="List view"
          aria-label="List view"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <button
          type="button"
          class:active={view === 'cards'}
          on:click={() => (view = 'cards')}
          title="Card view"
          aria-label="Card view"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="3" width="7" height="7" rx="1" />
            <rect x="14" y="3" width="7" height="7" rx="1" />
            <rect x="3" y="14" width="7" height="7" rx="1" />
            <rect x="14" y="14" width="7" height="7" rx="1" />
          </svg>
        </button>
      </div>
    </div>

    {#if filtered.length === 0}
      <div class="empty">
        <p>No {decisionFilter} matches.</p>
      </div>
    {:else if view === 'list'}
      <div class="table">
        <div
          class="thead"
          class:sponsor-cols={isSponsor}
          class:irb-cols={$irbCleared && !isSponsor}
        >
          {#if $irbCleared && !isSponsor}
            <div class="col-name">Name</div>
            <div class="col-mrn">MRN</div>
          {/if}
          {#if isSponsor}<div class="col-hospital">Hospital</div>{/if}
          <div class="col-age">Age</div>
          <div class="col-sex">Sex</div>
          <div class="col-race">Race</div>
          <div class="col-ethnicity">Ethnicity</div>
          <div class="col-state">ZIP</div>
          <div class="col-status">Status</div>
          <div class="col-decision">Status</div>
        </div>
        {#each pageItems as { idx, summary, decision } (idx)}
          <a
            class="trow"
            class:sponsor-cols={isSponsor}
            class:irb-cols={$irbCleared && !isSponsor}
            class:row-accepted={decision === 'accepted'}
            class:row-rejected={decision === 'rejected'}
            class:row-watchlisted={decision === 'watchlisted'}
            href="/studies/{studyId}/patients/{summary.patientId}"
          >
            {#if $irbCleared && !isSponsor}
              <div class="col-name">{summary.firstName} {summary.lastName}</div>
              <div class="col-mrn mono">{summary.mrn}</div>
            {/if}
            {#if isSponsor}
              <div class="col-hospital">{HOSPITAL_BY_ID.get(summary.hospitalId)?.shortName ?? summary.hospitalId}</div>
            {/if}
            <div class="col-age">{summary.age}</div>
            <div class="col-sex">{summary.gender === 'female' ? 'F' : 'M'}</div>
            <div class="col-race">{summary.race}</div>
            <div class="col-ethnicity">{summary.ethnicity}</div>
            <div class="col-state mono">{summary.zip}</div>
            <div class="col-status">
              <span class="status-pill status-{summary.status}">{summary.status}</span>
            </div>
            <div class="col-decision">
              {#if decision}
                <span class="decision-pill decision-{decision}">{decision}</span>
              {:else}
                <span class="muted small">Unreviewed</span>
              {/if}
            </div>
          </a>
        {/each}
      </div>
    {:else}
      <div class="cards">
        {#each pageItems as { idx, summary, decision } (idx)}
          <a
            class="pcard"
            class:card-accepted={decision === 'accepted'}
            class:card-rejected={decision === 'rejected'}
            class:card-watchlisted={decision === 'watchlisted'}
            href="/studies/{studyId}/patients/{summary.patientId}"
          >
            <div class="pcard-head">
              <div>
                {#if $irbCleared && !isSponsor}
                  <div class="pcard-name">{summary.firstName} {summary.lastName}</div>
                  <div class="pcard-sub muted">
                    <span class="mono">{summary.patientId}</span> · MRN <span class="mono">{summary.mrn}</span> · <span class="mono">{summary.zip}</span>
                  </div>
                {:else}
                  <div class="pcard-id mono">{summary.patientId}</div>
                  <div class="pcard-sub muted">
                    {#if isSponsor}{HOSPITAL_BY_ID.get(summary.hospitalId)?.shortName} · {/if}<span class="mono">{summary.zip}</span>
                  </div>
                {/if}
              </div>
              {#if decision}
                <span class="decision-pill decision-{decision}">{decision}</span>
              {/if}
            </div>
            <div class="pcard-meta">
              <span class="meta-item">{summary.age} y/o</span>
              <span class="meta-item">{summary.gender === 'female' ? 'Female' : 'Male'}</span>
              <span class="meta-item">{summary.race}</span>
              <span class="meta-item">{summary.ethnicity}</span>
              <span class="status-pill status-{summary.status}">{summary.status}</span>
            </div>
            <div class="pcard-foot muted small">
              Click to review notes & timeline →
            </div>
          </a>
        {/each}
      </div>
    {/if}

    <div class="pagination">
      <button class="btn btn-ghost" disabled={pageNum === 1} on:click={() => (pageNum = Math.max(1, pageNum - 1))}>
        ← Prev
      </button>
      <span class="page-info muted">
        Page <strong>{pageNum}</strong> of {fmtNum(totalPages)}
        <span class="dim">·</span>
        showing {fmtNum(pageStart + 1)}–{fmtNum(Math.min(pageStart + PER_PAGE, filtered.length))} of {fmtNum(filtered.length)}
      </span>
      <button class="btn btn-ghost" disabled={pageNum === totalPages} on:click={() => (pageNum = Math.min(totalPages, pageNum + 1))}>
        Next →
      </button>
    </div>
  {/if}
{/if}

<style>
  .page-header {
    margin-bottom: 18px;
  }

  .back {
    font-size: 13px;
    color: var(--text-muted);
    display: inline-block;
    margin-bottom: 6px;
  }

  .title-row {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 16px;
  }

  .page-header h1 {
    font-size: 26px;
  }

  .page-header p {
    margin: 4px 0 0;
  }

  .mono {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  }

  .small {
    font-size: 12px;
  }

  .study-summary {
    background: white;
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 16px;
    margin-bottom: 16px;
  }

  .summary-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: 14px;
    padding-bottom: 14px;
    border-bottom: 1px solid var(--border);
    margin-bottom: 14px;
  }

  .sum-label {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-muted);
    font-weight: 600;
    margin-bottom: 4px;
  }

  .sum-value {
    font-size: 14px;
    color: var(--text);
  }

  .team-list {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }

  .team-pill {
    background: var(--surface-alt);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 2px 6px;
    font-size: 11px;
  }

  .cui-block {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
  }

  .cui-heading {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-muted);
    font-weight: 600;
    margin-bottom: 8px;
  }

  .cui-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
  }

  .cui-tag {
    display: inline-block;
    padding: 3px 8px;
    border-radius: 4px;
    font-size: 12px;
    font-weight: 500;
  }

  .cui-tag.inc {
    background: var(--primary-light);
    color: var(--primary-dark);
  }

  .cui-tag.exc {
    background: #fef2f2;
    color: #b91c1c;
  }

  .match-bar {
    margin-bottom: 16px;
  }

  .match-stats {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 10px;
  }

  .match-stats.sponsor-stats {
    grid-template-columns: 2fr 1fr;
  }

  .stat {
    background: var(--bg-surface);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-lg);
    padding: var(--space-4);
    box-shadow: var(--shadow-xs);
    position: relative;
    overflow: hidden;
  }

  /* Color treatments per stat type */
  .stat-total {
    background: var(--brand-soft);
    border-color: transparent;
  }
  .stat-total .stat-num {
    color: var(--sage-900);
  }
  .stat-total .stat-label {
    color: var(--sage-800);
  }

  .stat-pending {
    background: var(--bg-sunken);
    border-color: var(--border-subtle);
  }
  .stat-pending .stat-num {
    color: var(--neutral-800);
  }

  .stat-accepted {
    background: var(--success-50);
    border-color: transparent;
  }
  .stat-accepted .stat-num {
    color: var(--success-700);
  }
  .stat-accepted .stat-label {
    color: var(--success-700);
  }

  .stat-rejected {
    background: var(--danger-50);
    border-color: transparent;
  }
  .stat-rejected .stat-num {
    color: var(--danger-700);
  }
  .stat-rejected .stat-label {
    color: var(--danger-700);
  }

  .stat-watchlisted {
    background: var(--warning-50);
    border-color: transparent;
  }
  .stat-watchlisted .stat-num {
    color: var(--warning-700);
  }
  .stat-watchlisted .stat-label {
    color: var(--warning-700);
  }

  .stat-num {
    font-family: var(--font-display);
    font-size: var(--text-2xl);
    font-weight: 700;
    line-height: 1;
    letter-spacing: var(--tracking-tight);
    font-variant-numeric: tabular-nums;
  }

  .stat-label {
    font-size: var(--text-2xs);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--fg-muted);
    margin-top: var(--space-2);
    font-weight: 700;
  }

  .controls {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
    gap: 12px;
    flex-wrap: wrap;
  }

  .sites-table {
    background: var(--bg-surface);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-lg);
    overflow: hidden;
  }

  .sites-head,
  .sites-row {
    display: grid;
    grid-template-columns: 1.5fr 1.5fr 0.9fr 1.4fr;
    gap: var(--space-4);
    padding: 10px 16px;
    align-items: center;
    font-size: var(--text-sm);
  }

  .sites-head {
    background: var(--bg-sunken);
    border-bottom: 1px solid var(--border-subtle);
    font-size: var(--text-2xs);
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--fg-muted);
  }

  .sites-row {
    border-bottom: 1px solid var(--border-subtle);
  }
  .sites-row:last-child {
    border-bottom: none;
  }

  .sites-row.zero {
    color: var(--fg-subtle);
  }

  .site-name {
    font-weight: 600;
  }

  .num {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  .bar-cell {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    text-align: left;
  }

  .bar-track {
    flex: 1;
    background: var(--bg-sunken);
    height: 8px;
    border-radius: var(--radius-full);
    overflow: hidden;
  }

  .bar-fill {
    height: 100%;
    background: var(--brand);
    border-radius: var(--radius-full);
  }

  .filter-tabs {
    display: flex;
    gap: 4px;
    background: var(--surface-alt);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 3px;
  }

  .filter-tab {
    background: transparent;
    border: none;
    padding: 6px 12px;
    border-radius: 5px;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    color: var(--text-muted);
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  .filter-tab:hover {
    color: var(--text);
  }

  .filter-tab.active {
    background: white;
    color: var(--text);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
  }

  .filter-tab .count {
    font-size: 11px;
    background: white;
    color: var(--text-muted);
    padding: 1px 6px;
    border-radius: 999px;
    font-weight: 700;
  }

  .filter-tab.active .count {
    background: var(--surface-alt);
  }

  .view-toggle {
    display: inline-flex;
    border: 1px solid var(--border);
    border-radius: 6px;
    overflow: hidden;
    background: white;
  }

  .view-toggle button {
    background: white;
    border: none;
    padding: 7px 9px;
    cursor: pointer;
    color: var(--text-muted);
  }

  .view-toggle button:hover {
    color: var(--text);
    background: var(--surface-alt);
  }

  .view-toggle button.active {
    background: var(--primary);
    color: white;
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
    /* tenant: 8 cols, last (Decision) gets ~2x to fit 3 buttons */
    grid-template-columns: repeat(7, minmax(0, 1fr)) minmax(0, 1.8fr);
    gap: 12px;
    padding: 10px 14px;
    align-items: center;
    font-size: var(--text-sm);
    line-height: 1.4;
  }

  /* tenant + IRB: 10 cols, last (Decision) gets ~2x */
  .thead.irb-cols,
  .trow.irb-cols {
    grid-template-columns: repeat(9, minmax(0, 1fr)) minmax(0, 1.8fr);
  }

  /* sponsor: 9 cols, last (Decision) gets ~2x */
  .thead.sponsor-cols,
  .trow.sponsor-cols {
    grid-template-columns: repeat(8, minmax(0, 1fr)) minmax(0, 1.8fr);
  }

  .thead {
    padding-top: 12px;
    padding-bottom: 12px;
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
    transition: background 0.1s ease;
  }

  .trow:last-child {
    border-bottom: none;
  }

  .trow {
    color: inherit;
    text-decoration: none;
  }

  .trow:hover {
    background: var(--surface-alt);
    text-decoration: none;
  }

  .row-accepted {
    background: rgba(22, 163, 74, 0.05);
  }

  .row-rejected {
    background: rgba(185, 28, 28, 0.04);
    opacity: 0.75;
  }

  .row-watchlisted {
    background: rgba(217, 119, 6, 0.05);
  }

  .col-action {
    display: flex;
    gap: 6px;
    align-items: center;
    justify-content: flex-end;
  }

  .action-btn {
    border: 1px solid var(--border-subtle);
    background: var(--bg-surface);
    padding: 2px 8px;
    border-radius: var(--radius-sm);
    font-size: var(--text-xs);
    font-weight: 700;
    cursor: pointer;
    transition: all 0.1s ease;
    line-height: 1.4;
  }

  .action-btn.accept {
    color: #16a34a;
    border-color: #d1fae5;
    background: #f0fdf4;
  }

  .action-btn.accept:hover {
    background: #16a34a;
    color: white;
    border-color: #16a34a;
  }

  .action-btn.reject {
    color: #b91c1c;
    border-color: #fee2e2;
    background: #fef2f2;
  }

  .action-btn.reject:hover {
    background: #b91c1c;
    color: white;
    border-color: #b91c1c;
  }

  .action-btn.watch {
    color: #b45309;
    border-color: #fde68a;
    background: #fffbeb;
  }

  .action-btn.watch:hover {
    background: #d97706;
    color: white;
    border-color: #d97706;
  }

  .action-btn.full {
    flex: 1;
    padding: 8px;
  }

  .decision-pill {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .decision-accepted {
    background: #d1fae5;
    color: #047857;
  }

  .decision-rejected {
    background: #fee2e2;
    color: #991b1b;
  }

  .decision-watchlisted {
    background: #fef3c7;
    color: #92400e;
  }

  .undo-btn {
    background: transparent;
    border: none;
    color: var(--text-muted);
    cursor: pointer;
    font-size: 12px;
    text-decoration: underline;
    padding: 4px;
  }

  .undo-btn:hover {
    color: var(--text);
  }

  .undo-btn.full {
    background: var(--surface-alt);
    text-decoration: none;
    padding: 8px;
    border-radius: 6px;
    font-weight: 600;
    width: 100%;
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

  /* cards */
  .cards {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 12px;
  }

  .pcard {
    background: white;
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 14px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    color: inherit;
    text-decoration: none;
    transition: border-color 0.12s ease, box-shadow 0.12s ease, transform 0.12s ease;
  }

  .pcard:hover {
    border-color: var(--sage-300);
    box-shadow: var(--shadow-sm);
    transform: translateY(-1px);
    text-decoration: none;
  }

  .pcard-foot {
    margin-top: auto;
    padding-top: 10px;
    border-top: 1px solid var(--border-subtle);
    font-size: var(--text-xs);
  }

  .pcard.card-accepted {
    border-color: #86efac;
    background: rgba(22, 163, 74, 0.04);
  }

  .pcard.card-rejected {
    border-color: #fca5a5;
    background: rgba(185, 28, 28, 0.03);
    opacity: 0.85;
  }

  .pcard.card-watchlisted {
    border-color: #fde68a;
    background: rgba(217, 119, 6, 0.04);
  }

  .pcard-head {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 8px;
  }

  .pcard-id {
    font-weight: 700;
    font-size: 13px;
  }

  .pcard-name {
    font-weight: 700;
    font-size: var(--text-sm);
    line-height: 1.2;
  }

  .pcard-sub {
    font-size: 11px;
    margin-top: 2px;
  }

  .pcard-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
  }

  .meta-item {
    font-size: 12px;
    color: var(--text);
  }

  .pcard-cond {
    font-size: 14px;
    font-weight: 600;
  }

  .pcard-cuis {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }

  .mini-tag {
    background: var(--surface-alt);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 2px 6px;
    font-size: 11px;
    color: var(--text);
  }

  .pcard-actions {
    display: flex;
    gap: 6px;
    border-top: 1px solid var(--border);
    padding-top: 10px;
  }

  .empty {
    background: white;
    border: 1px dashed var(--border);
    border-radius: 8px;
    padding: 40px 20px;
    text-align: center;
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

  @media (max-width: 900px) {
    .match-stats {
      grid-template-columns: repeat(2, 1fr);
    }
    .cui-block {
      grid-template-columns: 1fr;
    }
    .thead,
    .trow,
    .thead.sponsor-cols,
    .trow.sponsor-cols {
      grid-template-columns: 1fr 60px 200px;
    }
    .col-hospital,
    .col-age,
    .col-sex,
    .col-race,
    .col-ethnicity,
    .col-state,
    .col-status {
      display: none;
    }
  }
</style>
