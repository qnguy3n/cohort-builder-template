<script lang="ts">
  import { fly, fade } from 'svelte/transition';
  import { createEventDispatcher } from 'svelte';
  import type { PatientSummary, Study } from '$lib/types';
  import { getFullPatient } from '$lib/patients';
  import { decisions, studyDecisions, type Decision } from '$lib/decisions';
  import { cuiLabel, CUI_BY_ID } from '$lib/cui';
  import { canonicalizeCuis } from '$lib/ontology';
  import CuiChip from './CuiChip.svelte';

  export let patient: PatientSummary;
  export let studies: Study[];

  const dispatch = createEventDispatcher<{ close: void }>();

  let view: 'list' | 'detail' = 'list';
  let activeStudy: Study | null = null;

  $: studyDec = activeStudy ? studyDecisions(activeStudy.id) : null;
  $: decision = activeStudy && studyDec
    ? ($studyDec ?? {})[String(patient.index)] ?? null
    : null;

  $: full = activeStudy ? getFullPatient(patient.index) : null;

  function openStudy(s: Study) {
    activeStudy = s;
    view = 'detail';
  }
  function back() {
    view = 'list';
    activeStudy = null;
  }
  function setDecision(d: Decision) {
    if (activeStudy) decisions.set(activeStudy.id, patient.index, d);
  }
  function clearDecision() {
    if (activeStudy) decisions.clear(activeStudy.id, patient.index);
  }

  function notesMentioning(cui: string): string[] {
    if (!full) return [];
    const out: string[] = [];
    const labels = [cuiLabel(cui), ...(CUI_BY_ID.get(cui)?.aliases ?? [])];
    for (const note of full.notes) {
      // Cheap snippet: first sentence containing any label
      for (const label of labels) {
        const re = new RegExp(`(?<![A-Za-z0-9])${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![A-Za-z0-9])`, 'i');
        const idx = note.body.search(re);
        if (idx >= 0) {
          // Extract surrounding sentence
          const start = note.body.lastIndexOf('.', idx) + 1;
          const endIdx = note.body.indexOf('.', idx + label.length);
          const end = endIdx === -1 ? note.body.length : endIdx + 1;
          const snippet = note.body.slice(start, end).trim();
          if (snippet) {
            out.push(`${new Date(note.date).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })} · ${snippet}`);
            break;
          }
        }
      }
      if (out.length >= 2) break;
    }
    return out;
  }

  function handleEsc(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      if (view === 'detail') back();
      else dispatch('close');
    }
  }

  $: cuiSet = new Set(patient.cuis);
  $: incCuis = activeStudy ? canonicalizeCuis(activeStudy.inclusionCuis) : [];
  $: excCuis = activeStudy ? canonicalizeCuis(activeStudy.exclusionCuis) : [];
  $: incHits = incCuis.filter((c) => cuiSet.has(c));
  $: incMisses = incCuis.filter((c) => !cuiSet.has(c));
  $: excHits = excCuis.filter((c) => cuiSet.has(c));
</script>

<svelte:window on:keydown={handleEsc} />

<!-- svelte-ignore a11y_interactive_supports_focus a11y_click_events_have_key_events -->
<div
  class="overlay"
  role="dialog"
  aria-modal="true"
  on:click={() => dispatch('close')}
  transition:fade={{ duration: 150 }}
>
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions a11y_click_events_have_key_events -->
  <aside
    class="panel"
    on:click|stopPropagation
    transition:fly={{ x: 480, duration: 220 }}
  >
    {#if view === 'list'}
      <header class="panel-head">
        <div>
          <div class="muted small">Matching studies</div>
          <h2 class="mono">{patient.patientId}</h2>
        </div>
        <button type="button" class="close-btn" aria-label="Close" on:click={() => dispatch('close')}>×</button>
      </header>

      {#if studies.length === 0}
        <div class="empty muted">No published studies match this patient.</div>
      {:else}
        <ul class="study-list">
          {#each studies as s (s.id)}
            <li>
              <button type="button" class="study-row" on:click={() => openStudy(s)}>
                <div class="sr-main">
                  <div class="sr-name">{s.name}</div>
                  <div class="sr-meta muted small">
                    {s.phase}{#if s.nctId} · <span class="mono">{s.nctId}</span>{/if}
                  </div>
                </div>
                <svg class="chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                  <path d="M9 6l6 6-6 6" />
                </svg>
              </button>
            </li>
          {/each}
        </ul>
      {/if}
    {:else if activeStudy}
      <header class="panel-head">
        <button type="button" class="back-btn" on:click={back}>← Studies</button>
        <button type="button" class="close-btn" aria-label="Close" on:click={() => dispatch('close')}>×</button>
      </header>

      <div class="detail-body">
        <div>
          <div class="muted small">Reviewing for</div>
          <h2 class="study-title">{activeStudy.name}</h2>
          <div class="muted small">
            {activeStudy.phase}{#if activeStudy.nctId} · <span class="mono">{activeStudy.nctId}</span>{/if}
          </div>
        </div>

        {#if activeStudy.summary}
          <p class="study-summary">{activeStudy.summary}</p>
        {/if}

        <!-- Evidence -->
        <section class="evidence">
          <h3>Evidence</h3>
          <div class="ev-stat-row">
            <div class="ev-stat good">
              <div class="ev-num">{incHits.length}/{activeStudy.inclusionCuis.length}</div>
              <div class="muted small">inclusion CUIs met</div>
            </div>
            <div class="ev-stat" class:bad={excHits.length > 0}>
              <div class="ev-num">{excHits.length}</div>
              <div class="muted small">exclusion CUIs hit</div>
            </div>
          </div>

          {#each incHits as cui (cui)}
            {@const snippets = notesMentioning(cui)}
            <div class="ev-row ev-row-hit">
              <div class="ev-row-head">
                <span class="ev-mark good">✓</span>
                <CuiChip {cui} variant="inc" selectedCuis={activeStudy.inclusionCuis} />
              </div>
              {#if snippets.length > 0}
                <ul class="ev-snippets">
                  {#each snippets as snip}
                    <li>{snip}</li>
                  {/each}
                </ul>
              {/if}
            </div>
          {/each}

          {#each incMisses as cui (cui)}
            <div class="ev-row ev-row-miss">
              <div class="ev-row-head">
                <span class="ev-mark muted">✗</span>
                <CuiChip {cui} variant="plain" selectedCuis={activeStudy.inclusionCuis} />
                <span class="muted small">not in patient record</span>
              </div>
            </div>
          {/each}

          {#each excHits as cui (cui)}
            <div class="ev-row ev-row-excl">
              <div class="ev-row-head">
                <span class="ev-mark bad">⚠</span>
                <CuiChip {cui} variant="exc" selectedCuis={activeStudy.exclusionCuis} />
                <span class="bad small">exclusion criterion present</span>
              </div>
            </div>
          {/each}
        </section>

        <!-- Decision actions -->
        <section class="decision">
          <h3>Decision</h3>
          <div class="dec-row">
            <button class="dec-btn accept" class:active={decision === 'accepted'} on:click={() => setDecision('accepted')}>
              ✓ Accept
            </button>
            <button class="dec-btn reject" class:active={decision === 'rejected'} on:click={() => setDecision('rejected')}>
              ✕ Reject
            </button>
            <button class="dec-btn watch" class:active={decision === 'watchlisted'} on:click={() => setDecision('watchlisted')}>
              <svg class="dec-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <circle cx="12" cy="13" r="8" />
                <path d="M12 9v4l2.5 1.5" />
                <path d="M9 3h6" />
              </svg>
              Watchlist
            </button>
            {#if decision}
              <button class="dec-btn unreview" on:click={clearDecision}>↺ Unreview</button>
            {/if}
          </div>
          {#if decision}
            <div class="muted small" style="margin-top: 8px;">
              Currently <strong>{decision}</strong> for this study.
            </div>
          {/if}
        </section>

        <a class="open-full" href="/studies/{activeStudy.id}/patients/{patient.patientId}">
          Open full patient review →
        </a>
      </div>
    {/if}
  </aside>
</div>

<style>
  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(20, 24, 16, 0.45);
    z-index: 1200;
    display: flex;
    justify-content: flex-end;
  }
  .panel {
    background: var(--bg-surface);
    width: 100%;
    max-width: 480px;
    height: 100vh;
    display: flex;
    flex-direction: column;
    box-shadow: var(--shadow-lg);
    overflow: hidden;
  }
  .panel-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-4) var(--space-5);
    border-bottom: 1px solid var(--border-subtle);
    flex-shrink: 0;
  }
  .panel-head h2 {
    font-family: var(--font-display);
    font-size: var(--text-lg);
    font-weight: 600;
    margin: 2px 0 0;
  }
  .panel-head h2.mono {
    font-family: var(--font-mono);
    font-size: var(--text-md);
  }
  .close-btn,
  .back-btn {
    background: transparent;
    border: none;
    cursor: pointer;
    color: var(--fg-muted);
    font-family: inherit;
    font-size: var(--text-sm);
    font-weight: 500;
    padding: 6px 10px;
    border-radius: var(--radius-md);
  }
  .close-btn {
    font-size: 22px;
    line-height: 1;
    padding: 4px 10px;
  }
  .close-btn:hover,
  .back-btn:hover {
    background: var(--bg-sunken);
    color: var(--fg-default);
  }

  .small {
    font-size: var(--text-xs);
  }
  .mono {
    font-family: var(--font-mono);
  }

  /* List view */
  .study-list {
    list-style: none;
    margin: 0;
    padding: var(--space-2);
    overflow-y: auto;
  }
  .study-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-4);
    border-radius: var(--radius-md);
    border: 1px solid transparent;
    background: transparent;
    cursor: pointer;
    text-align: left;
    font: inherit;
    color: var(--fg-default);
  }
  .study-row:hover {
    background: var(--bg-sunken);
  }
  .sr-name {
    font-weight: 600;
    line-height: 1.3;
  }
  .sr-meta {
    margin-top: 2px;
  }
  .chev {
    color: var(--fg-subtle);
    flex-shrink: 0;
  }

  .empty {
    padding: var(--space-8);
    text-align: center;
  }

  /* Detail view */
  .detail-body {
    padding: var(--space-4) var(--space-5);
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }
  .study-title {
    font-family: var(--font-display);
    font-size: var(--text-lg);
    font-weight: 600;
    margin: 2px 0 4px;
    line-height: 1.25;
  }
  .study-summary {
    margin: 0;
    color: var(--fg-muted);
    font-size: var(--text-sm);
    line-height: var(--leading-relaxed);
    padding: var(--space-3);
    background: var(--bg-sunken);
    border-radius: var(--radius-md);
  }

  .evidence h3,
  .decision h3 {
    font-family: var(--font-display);
    font-size: var(--text-md);
    font-weight: 600;
    margin: 0 0 var(--space-2);
  }

  .ev-stat-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-2);
    margin-bottom: var(--space-3);
  }
  .ev-stat {
    background: var(--bg-sunken);
    border-radius: var(--radius-md);
    padding: var(--space-3);
  }
  .ev-stat.good {
    background: var(--success-50);
    color: var(--success-700);
  }
  .ev-stat.bad {
    background: var(--danger-50);
    color: var(--danger-700);
  }
  .ev-num {
    font-family: var(--font-display);
    font-size: var(--text-xl);
    font-weight: 700;
    line-height: 1;
    font-variant-numeric: tabular-nums;
  }

  .ev-row {
    padding: var(--space-3);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-md);
    margin-bottom: var(--space-2);
    background: var(--bg-surface);
  }
  .ev-row-head {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    flex-wrap: wrap;
  }
  .ev-mark {
    font-weight: 700;
    font-size: var(--text-md);
    width: 18px;
    text-align: center;
  }
  .ev-mark.good {
    color: var(--success-700);
  }
  .ev-mark.bad {
    color: var(--danger-700);
  }
  .bad {
    color: var(--danger-700);
  }
  .ev-row-hit {
    border-color: var(--success-100);
  }
  .ev-row-miss {
    opacity: 0.65;
  }
  .ev-row-excl {
    border-color: var(--danger-100);
    background: var(--danger-50);
  }
  .ev-snippets {
    list-style: none;
    margin: var(--space-2) 0 0 30px;
    padding: 0;
    font-size: var(--text-xs);
    color: var(--fg-default);
    line-height: 1.45;
  }
  .ev-snippets li {
    padding: 6px 10px;
    background: var(--bg-sunken);
    border-radius: var(--radius-sm);
    margin-bottom: 4px;
  }
  .ev-snippets li:last-child {
    margin-bottom: 0;
  }

  /* Decision row */
  .dec-row {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .dec-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    border: 1px solid var(--border-subtle);
    background: var(--bg-surface);
    padding: 6px 12px;
    border-radius: var(--radius-md);
    font-size: var(--text-sm);
    font-weight: 600;
    cursor: pointer;
    font-family: inherit;
  }
  .dec-icon {
    width: 14px;
    height: 14px;
    flex-shrink: 0;
  }
  .dec-btn.accept {
    color: var(--success-700);
    background: var(--success-50);
    border-color: transparent;
  }
  .dec-btn.accept:hover,
  .dec-btn.accept.active {
    background: var(--success-700);
    color: white;
  }
  .dec-btn.reject {
    color: var(--danger-700);
    background: var(--danger-50);
    border-color: transparent;
  }
  .dec-btn.reject:hover,
  .dec-btn.reject.active {
    background: var(--danger-700);
    color: white;
  }
  .dec-btn.watch {
    color: var(--warning-700);
    background: var(--warning-50);
    border-color: transparent;
  }
  .dec-btn.watch:hover,
  .dec-btn.watch.active {
    background: var(--warning-500);
    color: white;
  }
  .dec-btn.unreview {
    color: var(--fg-muted);
    background: var(--bg-sunken);
    margin-left: auto;
  }

  .open-full {
    display: inline-block;
    margin-top: var(--space-3);
    padding: var(--space-3);
    text-align: center;
    border: 1px dashed var(--border-default);
    border-radius: var(--radius-md);
    color: var(--brand-active);
    font-weight: 600;
    font-size: var(--text-sm);
    text-decoration: none;
  }
  .open-full:hover {
    background: var(--brand-soft);
    text-decoration: none;
  }
</style>
