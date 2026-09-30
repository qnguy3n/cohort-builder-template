<script lang="ts">
  import { onMount } from 'svelte';
  import { browser } from '$app/environment';
  import { studies, visibleStudiesFor } from '$lib/studies';
  import { TEAM_MEMBERS, DEPARTMENTS } from '$lib/mockData';
  import { PHASES } from '$lib/types';
  import type { Study } from '$lib/types';
  import { cuiLabel } from '$lib/cui';
  import { matchStudyForStudy, patientsLoading, PATIENTS_TOTAL, getSummary } from '$lib/patients';
  import { activeHospital, HOSPITALS } from '$lib/hospitals';
  import { SPONSOR_VIEW_ID } from '$lib/types';
  import { decisions } from '$lib/decisions';
  import NewStudyModal from '$lib/components/NewStudyModal.svelte';

  let showNewStudyModal = false;

  type ViewMode = 'cards' | 'list';
  type SortKey = 'newest' | 'oldest' | 'name';

  const VIEW_KEY = 'cohort-builder:list-view:v1';

  let query = '';
  let department = '';
  let phase = '';
  let ehrFilter = ''; // '', 'published', 'unpublished'
  let sort: SortKey = 'newest';
  let view: ViewMode = 'cards';

  onMount(() => {
    if (!browser) return;
    const savedView = localStorage.getItem(VIEW_KEY);
    if (savedView === 'cards' || savedView === 'list') view = savedView;
  });

  function setView(v: ViewMode) {
    view = v;
    if (browser) localStorage.setItem(VIEW_KEY, v);
  }

  function clearFilters() {
    query = '';
    department = '';
    phase = '';
    ehrFilter = '';
    sort = 'newest';
  }

  // Build a searchable haystack per study
  function studyHaystack(s: Study): string {
    const memberNames = s.teamMemberIds
      .map((id) => TEAM_MEMBERS.find((m) => m.id === id)?.name ?? '')
      .join(' ');
    return [
      s.name,
      s.nctId ?? '',
      s.department,
      s.phase,
      s.patientStatus,
      s.published ? 'published network' : 'unpublished',
      memberNames,
      s.inclusionCriteria,
      s.exclusionCriteria
    ]
      .join(' ')
      .toLowerCase();
  }

  // Subsequence fuzzy: every char of needle appears in haystack in order
  function fuzzyMatch(needle: string, haystack: string): boolean {
    let i = 0;
    for (let j = 0; j < haystack.length && i < needle.length; j++) {
      if (haystack[j] === needle[i]) i++;
    }
    return i === needle.length;
  }

  function matchesQuery(s: Study, q: string): boolean {
    if (!q) return true;
    const hay = studyHaystack(s);
    const lower = q.toLowerCase().trim();
    if (hay.includes(lower)) return true;
    // fall back to fuzzy subsequence on name + NCT for typo tolerance
    const fuzzyTarget = (s.name + ' ' + (s.nctId ?? '')).toLowerCase();
    return fuzzyMatch(lower.replace(/\s+/g, ''), fuzzyTarget.replace(/\s+/g, ''));
  }

  $: visibleStudies = visibleStudiesFor($studies, $activeHospital);

  $: filtered = visibleStudies
    .filter((s) => matchesQuery(s, query))
    .filter((s) => !department || s.department === department)
    .filter((s) => !phase || s.phase === phase)
    .filter((s) => {
      if (ehrFilter === 'published') return s.published;
      if (ehrFilter === 'unpublished') return !s.published;
      return true;
    })
    .slice() // copy before sort
    .sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name);
      if (sort === 'oldest') return a.createdAt.localeCompare(b.createdAt);
      return b.createdAt.localeCompare(a.createdAt);
    });

  $: hasActiveFilters = query || department || phase || ehrFilter || sort !== 'newest';

  function teamLabel(study: Study, max = 2): string {
    if (study.teamMemberIds.length === 0) return 'No team assigned';
    const names = study.teamMemberIds
      .map((id) => TEAM_MEMBERS.find((m) => m.id === id)?.name)
      .filter(Boolean) as string[];
    if (names.length <= max) return names.join(', ');
    return `${names.slice(0, max).join(', ')} +${names.length - max}`;
  }

  function patientStatusLabel(s: Study['patientStatus']): string {
    if (s === 'living') return 'Living';
    if (s === 'deceased') return 'Deceased';
    return 'Either';
  }

  function formatDate(iso: string): string {
    try {
      return new Date(iso).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    } catch {
      return iso;
    }
  }

  function criteriaCount(text: string): number {
    return text.split('\n').filter((l) => l.trim()).length;
  }

  // Stable color per department drawn from the design-system accent palette.
  // Uses oklch values to match the rest of the system.
  const DEPT_COLORS = [
    'oklch(60% 0.036 115)',  // sage-500 (brand)
    'oklch(62% 0.130 40)',   // terracotta-500
    'oklch(60% 0.140 240)',  // info-500
    'oklch(58% 0.130 155)',  // success-500
    'oklch(72% 0.145 75)',   // warning-500
    'oklch(60% 0.180 25)',   // danger-500
    'oklch(52% 0.034 115)',  // sage-600
    'oklch(46% 0.110 40)',   // terracotta-700
    'oklch(46% 0.125 240)',  // info-700
    'oklch(42% 0.105 155)'   // success-700
  ];
  function deptColor(d: string): string {
    const idx = DEPARTMENTS.indexOf(d);
    return DEPT_COLORS[idx >= 0 ? idx % DEPT_COLORS.length : 0];
  }

  function handleReset() {
    if (confirm('Reset demo data? Any studies you have created will be removed.')) {
      studies.reset();
    }
  }

  // Compute matched patient indices once per study and reuse for both the
  // headline match count and the decision breakdown — guarantees the stat-row
  // icons always sum to the displayed total.
  function matchedIndices(s: Study): number[] {
    if ($patientsLoading) return [];
    return matchStudyForStudy(s, $activeHospital);
  }

  // "New" = matched patients with an upcoming screening appointment in the
  // next 7 days. Stable, derived from existing patient data, surfaces actionable
  // pipeline rather than just total cohort size.
  function newPatientsCount(matched: number[]): number {
    if (matched.length === 0) return 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const cutoff = new Date(today);
    cutoff.setDate(cutoff.getDate() + 7);
    const cutoffIso = cutoff.toISOString().slice(0, 10);
    const todayIso = today.toISOString().slice(0, 10);
    let n = 0;
    for (const idx of matched) {
      const appt = getSummary(idx).upcomingAppointment;
      if (appt && appt.date >= todayIso && appt.date <= cutoffIso) n++;
    }
    return n;
  }

  function decisionCounts(
    s: Study,
    matched: number[]
  ): { accepted: number; rejected: number; watchlisted: number } {
    const map = $decisions[s.id] ?? {};
    let accepted = 0;
    let rejected = 0;
    let watchlisted = 0;
    // Only count decisions for patients still in the matched set, otherwise the
    // stat-row totals can exceed the headline match count.
    for (const idx of matched) {
      const v = map[String(idx)];
      if (v === 'accepted') accepted++;
      else if (v === 'rejected') rejected++;
      else if (v === 'watchlisted') watchlisted++;
    }
    return { accepted, rejected, watchlisted };
  }
</script>

<div class="page-header">
  <div>
    <h1>Studies</h1>
    {#if $activeHospital === SPONSOR_VIEW_ID}
      <p class="muted">
        Searching across <strong>{PATIENTS_TOTAL.toLocaleString()}</strong>
        patients at <strong>{HOSPITALS.length}</strong> hospitals
      </p>
    {:else}
      <p class="muted">Cohorts defined by inclusion and exclusion criteria.</p>
    {/if}
  </div>
  <div class="header-actions">
    <button type="button" class="btn btn-ghost" on:click={handleReset}>Reset demo data</button>
    <button type="button" class="btn btn-primary" on:click={() => (showNewStudyModal = true)}>+ New study</button>
  </div>
</div>

{#if showNewStudyModal}
  <NewStudyModal on:close={() => (showNewStudyModal = false)} />
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
        placeholder="Search across name, NCT, team, criteria, EHR…"
        bind:value={query}
      />
      {#if query}
        <button class="clear-x" type="button" on:click={() => (query = '')} aria-label="Clear search">×</button>
      {/if}
    </div>

    <div class="view-toggle" role="tablist" aria-label="View mode">
      <button
        type="button"
        role="tab"
        aria-selected={view === 'cards'}
        class:active={view === 'cards'}
        on:click={() => setView('cards')}
        title="Card view"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
          <rect x="14" y="14" width="7" height="7" rx="1" />
        </svg>
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={view === 'list'}
        class:active={view === 'list'}
        on:click={() => setView('list')}
        title="List view"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <path d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>
    </div>
  </div>

  <div class="filter-row">
    <select bind:value={phase} aria-label="Phase">
      <option value="">All phases</option>
      {#each PHASES as p}
        <option value={p}>{p}</option>
      {/each}
    </select>

    <select bind:value={ehrFilter} aria-label="Visibility">
      <option value="">All visibility</option>
      <option value="published">Published to network</option>
      <option value="unpublished">Not published</option>
    </select>

    <select bind:value={sort} aria-label="Sort">
      <option value="newest">Newest first</option>
      <option value="oldest">Oldest first</option>
      <option value="name">Name A–Z</option>
    </select>

    <div class="result-count muted">
      {filtered.length} of {visibleStudies.length}
      {#if hasActiveFilters}
        <button type="button" class="link-btn" on:click={clearFilters}>Clear</button>
      {/if}
    </div>
  </div>
</div>

{#if $studies.length === 0}
  <div class="empty">
    <p>No studies yet.</p>
    <button type="button" class="btn btn-primary" on:click={() => (showNewStudyModal = true)}>Create your first study</button>
  </div>
{:else if filtered.length === 0}
  <div class="empty">
    <p>No studies match your filters.</p>
    <button type="button" class="btn btn-secondary" on:click={clearFilters}>Clear filters</button>
  </div>
{:else if view === 'cards'}
  <div class="grid">
    {#each filtered as study (study.id)}
      {@const matchedIdx = matchedIndices(study)}
      {@const matches = matchedIdx.length}
      {@const dec = decisionCounts(study, matchedIdx)}
      {@const unreviewed = matches - dec.accepted - dec.rejected - dec.watchlisted}
      {@const newCount = $patientsLoading ? 0 : newPatientsCount(matchedIdx)}
      <a class="card" href="/studies/{study.id}">
        <header class="card-head">
          <span class="card-phase-pill">{study.phase}</span>
          {#if study.nctId}
            <span class="tag tag-nct">{study.nctId}</span>
          {/if}
          {#if newCount > 0}
            <span class="tag tag-new" title="{newCount} matched patients have a screening appointment in the next 7 days">+{newCount} new</span>
          {/if}
        </header>

        <h3 class="card-title">{study.name}</h3>

        <p class="card-summary">
          {study.summary || 'No summary added.'}
        </p>

        <div class="meta-row">
          <span class="tag">{patientStatusLabel(study.patientStatus)}</span>
        </div>

        <div class="card-spacer"></div>

        <div class="stat-row" title="Patient review status">
          {#if $patientsLoading}
            <span class="muted small">Indexing patients…</span>
          {:else}
            <div class="stat-cell" title="Unreviewed">
              <svg class="icon icon-unreviewed" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="9" stroke-dasharray="3 3" />
              </svg>
              <span>{unreviewed.toLocaleString()}</span>
            </div>
            <div class="stat-cell" title="Accepted">
              <svg class="icon icon-accepted" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="9" />
                <path d="m8 12 3 3 5-6" />
              </svg>
              <span>{dec.accepted.toLocaleString()}</span>
            </div>
            <div class="stat-cell" title="Rejected">
              <svg class="icon icon-rejected" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                <circle cx="12" cy="12" r="9" />
                <path d="m9 9 6 6m0-6-6 6" />
              </svg>
              <span>{dec.rejected.toLocaleString()}</span>
            </div>
            <div class="stat-cell" title="Watchlisted">
              <svg class="icon icon-watchlisted" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="13" r="8" />
                <path d="M12 9v4l2.5 1.5" />
                <path d="M9 3h6" />
              </svg>
              <span>{dec.watchlisted.toLocaleString()}</span>
            </div>
          {/if}
        </div>

        <footer class="card-foot">
          {#if !$patientsLoading}
            <span><strong>{matches.toLocaleString()}</strong> matching patients</span>
          {:else}
            <span class="muted small">&nbsp;</span>
          {/if}
          <span class="muted small">{formatDate(study.createdAt)}</span>
        </footer>
      </a>
    {/each}
  </div>
{:else}
  <div class="list">
    <div class="list-head">
      <div class="col-name">Study</div>
      <div class="col-phase">Phase</div>
      <div class="col-status">Patients</div>
      <div class="col-criteria">In / Ex</div>
      <div class="col-ehr">Visibility</div>
      <div class="col-date">Matches</div>
    </div>
    {#each filtered as study (study.id)}
      {@const matchedIdx = matchedIndices(study)}
      {@const matches = matchedIdx.length}
      {@const newCount = $patientsLoading ? 0 : newPatientsCount(matchedIdx)}
      <a class="list-row" href="/studies/{study.id}">
        <div class="col-name">
          <div class="list-title">
            {study.name}
            {#if newCount > 0}
              <span class="tag tag-new" title="{newCount} matched patients have a screening appointment in the next 7 days">+{newCount} new</span>
            {/if}
          </div>
          {#if study.nctId}
            <div class="list-sub">{study.nctId}</div>
          {/if}
        </div>
        <div class="col-phase">{study.phase}</div>
        <div class="col-status">{patientStatusLabel(study.patientStatus)}</div>
        <div class="col-criteria">
          <span class="num-pill">{criteriaCount(study.inclusionCriteria)}</span>
          <span class="num-pill">{criteriaCount(study.exclusionCriteria)}</span>
        </div>
        <div class="col-ehr">
          {#if study.ownerId === SPONSOR_VIEW_ID}
            <span class="muted">—</span>
          {:else if study.published}
            <span class="tag tag-ehr">Published</span>
          {:else}
            <span class="muted">Private</span>
          {/if}
        </div>
        <div class="col-date muted">
          {#if !$patientsLoading}
            <strong>{matches.toLocaleString()}</strong> matches
          {:else}
            <span class="muted small">…</span>
          {/if}
        </div>
      </a>
    {/each}
  </div>
{/if}

<style>
  .page-header {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: var(--space-4);
    margin-bottom: var(--space-6);
  }

  .page-header h1 {
    font-family: var(--font-display);
    font-size: var(--text-3xl);
    font-weight: 600;
    letter-spacing: var(--tracking-tight);
    line-height: var(--leading-tight);
    margin-bottom: var(--space-1);
  }

  .page-header p {
    margin: 0;
    color: var(--fg-muted);
  }

  .header-actions {
    display: flex;
    gap: var(--space-2);
    align-items: center;
  }

  .toolbar {
    background: var(--bg-surface);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-lg);
    padding: var(--space-3);
    margin-bottom: var(--space-5);
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    box-shadow: var(--shadow-xs);
  }

  .search-row {
    display: flex;
    gap: 10px;
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
    padding-left: 36px;
    padding-right: 32px;
    height: 40px;
    font-size: var(--text-sm);
    background: var(--bg-sunken);
    border-color: transparent;
  }

  .search input:focus {
    background: var(--bg-surface);
    border-color: var(--border-focus);
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

  .view-toggle {
    display: inline-flex;
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-md);
    overflow: hidden;
    background: var(--bg-sunken);
    padding: 3px;
    gap: 2px;
  }

  .view-toggle button {
    background: transparent;
    border: none;
    padding: 6px 10px;
    cursor: pointer;
    color: var(--fg-muted);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-sm);
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

  .filter-row {
    display: flex;
    gap: var(--space-2);
    align-items: center;
    flex-wrap: wrap;
  }

  .filter-row select {
    width: auto;
    min-width: 140px;
    height: 36px;
    padding: 4px 28px 4px 10px;
    font-size: var(--text-sm);
    background-color: var(--bg-surface);
    appearance: none;
    background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23737264' stroke-width='2'><path d='M6 9l6 6 6-6' stroke-linecap='round'/></svg>");
    background-repeat: no-repeat;
    background-position: right 8px center;
  }

  .result-count {
    margin-left: auto;
    font-size: var(--text-sm);
    display: flex;
    align-items: center;
    gap: var(--space-2);
    color: var(--fg-muted);
  }

  .link-btn {
    background: transparent;
    border: none;
    color: var(--brand-active);
    font-weight: 600;
    cursor: pointer;
    font-size: var(--text-sm);
    padding: 0;
  }

  .link-btn:hover {
    text-decoration: underline;
  }

  .empty {
    background: var(--bg-surface);
    border: 1px dashed var(--border-default);
    border-radius: var(--radius-lg);
    padding: var(--space-12) var(--space-6);
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-3);
  }

  /* ------- Card view ------- */
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
    grid-auto-rows: 1fr;
    gap: var(--space-4);
  }

  .card {
    background: var(--bg-surface);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-lg);
    padding: var(--space-5);
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    transition: border-color 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease;
    text-decoration: none;
    color: inherit;
    height: 100%;
    box-shadow: var(--shadow-xs);
    position: relative;
    overflow: hidden;
  }

  .card::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 3px;
    background: linear-gradient(90deg, var(--brand) 0%, var(--brand) 30%, transparent 30%);
    opacity: 0;
    transition: opacity 0.18s ease;
  }

  .card:hover {
    border-color: var(--sage-300);
    box-shadow: var(--shadow-md);
    transform: translateY(-2px);
    text-decoration: none;
  }

  .card:hover::before {
    opacity: 1;
  }

  .card-title {
    font-family: var(--font-display);
    font-size: var(--text-md);
    font-weight: 600;
    line-height: 1.3;
    letter-spacing: var(--tracking-tight);
    color: var(--fg-default);
    margin: 0;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    min-height: calc(var(--text-md) * 1.3 * 2);
  }

  .card-summary {
    font-family: var(--font-sans);
    font-size: var(--text-sm);
    line-height: var(--leading-snug);
    color: var(--fg-muted);
    margin: 0;
    display: -webkit-box;
    -webkit-line-clamp: 3;
    line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
    min-height: calc(var(--text-sm) * 1.3 * 3);
  }

  .card-spacer {
    flex: 1;
  }

  .small {
    font-size: var(--text-xs);
  }

  .stat-row {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: var(--space-1);
    padding: var(--space-3);
    background: var(--bg-sunken);
    border-radius: var(--radius-md);
  }

  .stat-cell {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    font-size: var(--text-sm);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    color: var(--fg-default);
  }

  .icon {
    width: 14px;
    height: 14px;
    flex-shrink: 0;
  }

  .icon-unreviewed {
    color: var(--neutral-500);
  }
  .icon-accepted {
    color: var(--success-700);
  }
  .icon-rejected {
    color: var(--danger-700);
  }
  .icon-watchlisted {
    color: var(--warning-700);
  }

  .card-head {
    display: flex;
    justify-content: space-between;
    gap: var(--space-3);
    align-items: center;
    min-height: 22px;
  }

  .card-phase-pill {
    display: inline-flex;
    align-items: center;
    padding: 3px 10px;
    border-radius: var(--radius-full);
    background: var(--brand-soft);
    color: var(--sage-800);
    font-size: var(--text-2xs);
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }


  .meta-row {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }

  .tag {
    display: inline-block;
    padding: 3px 10px;
    background: var(--bg-surface);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-full);
    font-size: var(--text-xs);
    font-weight: 500;
    color: var(--fg-muted);
    white-space: nowrap;
    line-height: 1.4;
  }

  .tag-nct {
    background: var(--brand-soft);
    color: var(--sage-800);
    border-color: transparent;
    font-family: var(--font-mono);
    font-size: var(--text-2xs);
    font-weight: 500;
    letter-spacing: 0.02em;
  }

  .tag-ehr {
    background: var(--info-50);
    color: var(--info-700);
    border-color: transparent;
  }

  .tag-new {
    background: oklch(72% 0.165 60);
    color: oklch(20% 0.03 60);
    border-color: transparent;
    font-weight: 800;
    font-size: var(--text-2xs);
    letter-spacing: 0.04em;
    text-transform: uppercase;
    padding: 2px 8px;
    box-shadow: 0 1px 0 oklch(58% 0.150 60), 0 0 0 1px oklch(58% 0.150 60) inset;
    margin-left: 6px;
    vertical-align: middle;
  }

  .card-foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    font-size: var(--text-xs);
    color: var(--fg-muted);
  }

  .card-foot strong {
    font-weight: 700;
    color: var(--fg-default);
    font-variant-numeric: tabular-nums;
  }

  /* ------- List view ------- */
  .list {
    background: white;
    border: 1px solid var(--border);
    border-radius: 10px;
    overflow: hidden;
  }

  .list-head,
  .list-row {
    display: grid;
    grid-template-columns: minmax(280px, 2.6fr) 0.9fr 0.9fr 0.7fr 0.9fr 1fr;
    gap: 14px;
    padding: 12px 16px;
    align-items: center;
    font-size: 13px;
  }

  .list-head {
    background: var(--surface-alt);
    border-bottom: 1px solid var(--border);
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-muted);
  }

  .list-row {
    border-bottom: 1px solid var(--border);
    transition: background 0.1s ease;
    text-decoration: none;
    color: inherit;
  }

  .list-row:last-child {
    border-bottom: none;
  }

  .list-row:hover {
    background: var(--surface-alt);
    text-decoration: none;
  }

  .list-title {
    font-weight: 600;
    color: var(--text);
    line-height: 1.3;
  }

  .list-sub {
    font-size: 11px;
    color: var(--text-muted);
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    margin-top: 2px;
  }

  .col-criteria {
    display: flex;
    gap: 4px;
  }

  .num-pill {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 22px;
    height: 22px;
    padding: 0 6px;
    background: var(--surface-alt);
    border: 1px solid var(--border);
    border-radius: 4px;
    font-size: 12px;
    font-weight: 600;
    color: var(--text);
  }

  @media (max-width: 900px) {
    .list-head,
    .list-row {
      grid-template-columns: 2fr 0.8fr 0.8fr;
    }
    .col-criteria,
    .col-ehr,
    .col-date {
      display: none;
    }
  }
</style>
