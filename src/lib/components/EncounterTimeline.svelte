<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import TimelineIcon from './TimelineIcon.svelte';
  import { parseClinicalDate, relativeTime, fmtDate, fmtMonthYear } from '$lib/clinicalDate';
  import type { ClinicalKind } from '$lib/types';

  const dispatch = createEventDispatcher();

  type TimelineEv = {
    kind: ClinicalKind;
    id: string;
    date: string | null;
    title: string;
    detail?: string | null;
    value?: string | number | null;
    units?: string | null;
    flag?: string | null;
    // note-specific (for evidence + click-through)
    docId?: string | null;
    cuis?: { cui: string; label: string }[];
    body?: string | null;
  };

  export let events: TimelineEv[] = [];
  /** Gate note text (PHI) behind IRB clearance. */
  export let irbCleared = false;

  let onlyEvidence = false;
  let selectedKey: string | null = null;

  type Group = { key: string; date: string | null; ts: number; events: TimelineEv[]; hasEvidence: boolean };

  function buildGroups(evs: TimelineEv[]): Group[] {
    const map = new Map<string, Group>();
    for (const e of evs) {
      const d = parseClinicalDate(e.date);
      const key = d ? `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}` : 'undated';
      let g = map.get(key);
      if (!g) {
        g = { key, date: e.date, ts: d ? d.getTime() : -1, events: [], hasEvidence: false };
        map.set(key, g);
      }
      g.events.push(e);
      if (e.cuis && e.cuis.length) g.hasEvidence = true;
    }
    return [...map.values()];
  }

  $: groups = buildGroups(events);
  $: dated = groups.filter((g) => g.ts >= 0).sort((a, b) => a.ts - b.ts);
  $: undated = groups.find((g) => g.key === 'undated') ?? null;
  $: shown = onlyEvidence ? dated.filter((g) => g.hasEvidence) : dated;
  $: rangeMin = dated.length ? dated[0].date : null;
  $: rangeMax = dated.length ? dated[dated.length - 1].date : null;
  $: evidenceCount = dated.filter((g) => g.hasEvidence).length;
  $: selected = [...dated, ...(undated ? [undated] : [])].find((g) => g.key === selectedKey) ?? null;

  const kindsOf = (g: Group): ClinicalKind[] => [...new Set(g.events.map((e) => e.kind))];
  function label(e: TimelineEv): string {
    if (e.kind === 'lab' && e.value != null) return `${e.title} ${e.value}${e.units ? ' ' + e.units : ''}`;
    return e.title;
  }
  function toggle(key: string) {
    selectedKey = selectedKey === key ? null : key;
  }
</script>

{#if dated.length === 0 && !undated}
  <p class="muted small">No dated events in source data.</p>
{:else}
  <div class="tl-controls">
    <div class="tl-range">
      {#if rangeMin && rangeMax}
        <span class="range-end">{fmtMonthYear(rangeMin)}</span>
        <span class="range-line"></span>
        <span class="range-end">{fmtMonthYear(rangeMax)}</span>
      {/if}
    </div>
    {#if evidenceCount > 0}
      <button
        type="button"
        class="ev-toggle"
        class:on={onlyEvidence}
        on:click={() => (onlyEvidence = !onlyEvidence)}
        aria-pressed={onlyEvidence}
        title="Show only encounters where a concept was extracted from the notes"
      >
        <span class="ev-dot"></span>
        Concept evidence only · {evidenceCount}
      </button>
    {/if}
  </div>

  <div class="rail">
    {#each shown as g (g.key)}
      <button
        class="enc"
        class:has-ev={g.hasEvidence}
        class:active={selectedKey === g.key}
        on:click={() => toggle(g.key)}
      >
        <div class="enc-when">
          <div class="rel">{relativeTime(g.date)}</div>
          <div class="abs muted small">{fmtMonthYear(g.date)}</div>
        </div>
        <div class="node-row">
          <span class="line"></span>
          <span class="node" class:ev={g.hasEvidence}>
            {#each kindsOf(g) as k}<TimelineIcon kind={k} size={20} />{/each}
          </span>
        </div>
        {#if g.hasEvidence}<div class="ev-badge">concept evidence</div>{/if}
        <div class="enc-count muted small">{g.events.length} event{g.events.length === 1 ? '' : 's'}</div>
      </button>
    {/each}

    {#if undated && !onlyEvidence}
      <button class="enc undated" class:active={selectedKey === 'undated'} on:click={() => toggle('undated')}>
        <div class="enc-when"><div class="rel">Undated</div><div class="abs muted small">no date</div></div>
        <div class="node-row"><span class="line dashed"></span><span class="node">
          {#each kindsOf(undated) as k}<TimelineIcon kind={k} size={20} />{/each}
        </span></div>
        <div class="enc-count muted small">{undated.events.length} event{undated.events.length === 1 ? '' : 's'}</div>
      </button>
    {/if}
  </div>

  {#if selected}
    <div class="enc-detail">
      <div class="ed-head">
        <strong>{selected.date ? fmtDate(selected.date) : 'Undated'}</strong>
        <span class="muted small">{relativeTime(selected.date)} · {selected.events.length} event{selected.events.length === 1 ? '' : 's'}</span>
        <button class="ed-close" on:click={() => (selectedKey = null)} aria-label="Close">×</button>
      </div>
      {#each selected.events as e (e.id)}
        {@const clickable = e.kind === 'note' && !!e.docId && irbCleared}
        <div class="ed-event">
          <TimelineIcon kind={e.kind} size={20} />
          <div class="ed-body">
            <div class="ed-title">
              {#if clickable}
                <button class="ed-notelink" on:click={() => dispatch('viewDoc', { docId: e.docId, title: e.title })}>
                  {label(e)} <span class="ed-open-ico">↗</span>
                </button>
              {:else}
                {label(e)}
              {/if}
              {#if e.detail}<span class="muted small"> · {e.detail}</span>{/if}
            </div>
            {#if e.cuis && e.cuis.length}
              <div class="ed-cuis">
                <span class="muted small">extracted:</span>
                {#each e.cuis as c}<span class="ed-chip" title={c.cui}>{c.label}</span>{/each}
              </div>
            {/if}
            {#if e.kind === 'note' && e.docId && !irbCleared}
              <div class="ed-locked muted small">🔒 enable IRB clearance to open this note</div>
            {/if}
          </div>
        </div>
      {/each}
    </div>
  {/if}
{/if}

<style>
  .tl-controls {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
    margin-bottom: 8px;
  }
  .tl-range {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: 1;
    min-width: 160px;
  }
  .range-end {
    font-size: 0.7rem;
    font-weight: 700;
    color: var(--fg-muted, #64748b);
  }
  .range-line {
    flex: 1;
    height: 2px;
    background: linear-gradient(90deg, #cbd5e1, #94a3b8);
    border-radius: 2px;
  }
  .ev-toggle {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 5px 10px 5px 8px;
    border-radius: 999px;
    border: 1px solid var(--border-subtle, #e2e8f0);
    background: var(--bg-sunken, #f8fafc);
    color: var(--fg-muted, #64748b);
    font-family: inherit;
    font-size: 0.66rem;
    font-weight: 700;
    letter-spacing: 0.03em;
    text-transform: uppercase;
    cursor: pointer;
    white-space: nowrap;
    transition: all 0.12s ease;
  }
  .ev-toggle:hover {
    border-color: #cbd5e1;
  }
  .ev-toggle.on {
    background: #eef2ff;
    border-color: #c7d2fe;
    color: #4338ca;
  }
  .ev-dot {
    width: 8px;
    height: 8px;
    border-radius: 999px;
    background: var(--neutral-400, #94a3b8);
    flex: none;
  }
  .ev-toggle.on .ev-dot {
    background: #6366f1;
    box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.15);
  }
  .rail {
    display: flex;
    gap: 0;
    overflow-x: auto;
    padding: 4px 2px 10px;
    align-items: flex-start;
  }
  .enc {
    min-width: 130px;
    max-width: 170px;
    flex: 0 0 auto;
    padding: 4px 8px 8px;
    background: none;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    font-family: inherit;
  }
  .enc:hover {
    background: var(--bg-sunken, #f8fafc);
  }
  .enc.active {
    background: #eef2ff;
  }
  .enc-when {
    text-align: center;
    margin-bottom: 4px;
    min-height: 30px;
  }
  .rel {
    font-weight: 700;
    font-size: 0.76rem;
    color: var(--fg-default, #1e293b);
  }
  .node-row {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    height: 28px;
    margin-bottom: 5px;
  }
  .line {
    position: absolute;
    left: 0;
    right: 0;
    top: 50%;
    height: 2px;
    background: var(--border-subtle, #e2e8f0);
  }
  .line.dashed {
    background: repeating-linear-gradient(90deg, #cbd5e1 0 4px, transparent 4px 8px);
  }
  .node {
    position: relative;
    z-index: 1;
    display: inline-flex;
    gap: 3px;
    background: var(--bg-surface, #fff);
    padding: 2px 4px;
    border-radius: 999px;
  }
  .node.ev {
    box-shadow: 0 0 0 2px #6366f1;
  }
  .ev-badge {
    text-align: center;
    font-size: 0.6rem;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    color: #4338ca;
    background: #e0e7ff;
    border-radius: 4px;
    padding: 1px 4px;
    margin-bottom: 3px;
  }
  .enc-count {
    text-align: center;
  }
  .undated {
    border-left: 1px dashed var(--border-subtle, #e2e8f0);
  }
  .enc-detail {
    margin-top: 8px;
    border: 1px solid var(--border-subtle, #e5e7eb);
    border-radius: 10px;
    background: var(--bg-sunken, #f8fafc);
    padding: 12px 14px;
  }
  .ed-head {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 8px;
  }
  .ed-close {
    margin-left: auto;
    border: none;
    background: none;
    font-size: 1.2rem;
    line-height: 1;
    cursor: pointer;
    color: #64748b;
  }
  .ed-event {
    display: flex;
    gap: 10px;
    padding: 8px 0;
    border-top: 1px solid #eef2f6;
  }
  .ed-body {
    flex: 1;
    min-width: 0;
  }
  .ed-title {
    font-size: 0.84rem;
    color: var(--fg-default, #1e293b);
    font-weight: 500;
  }
  .ed-cuis {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-top: 3px;
  }
  .ed-chip {
    font-size: 0.68rem;
    font-weight: 600;
    padding: 1px 7px;
    border-radius: 999px;
    background: #dcfce7;
    color: #166534;
  }
  .ed-notelink {
    border: none;
    background: none;
    padding: 0;
    font: inherit;
    font-weight: 500;
    color: #2563eb;
    cursor: pointer;
    text-align: left;
  }
  .ed-notelink:hover {
    text-decoration: underline;
  }
  .ed-open-ico {
    font-size: 0.72rem;
  }
  .ed-locked {
    margin-top: 5px;
    padding: 4px 8px;
    border: 1px dashed #e2e8f0;
    border-radius: 6px;
  }
  .muted {
    color: var(--fg-muted, #94a3b8);
  }
  .small {
    font-size: 0.68rem;
  }
</style>
