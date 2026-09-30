<script lang="ts">
  import { CUIS, type CuiEntry, cuiLabel, CUI_BY_ID } from '$lib/cui';

  /** Currently selected CUIs — two-way bound. */
  export let cuis: string[];
  /** CUIs to filter OUT of search results (e.g. those already used on the opposite side). */
  export let disallowed: string[] = [];
  export let placeholder = 'Search a clinical phrase…';
  export let chipVariant: 'inc' | 'exc' = 'inc';
  export let emptyText = 'No concepts selected yet.';

  let query = '';
  let open = false;
  let active = 0;

  function searchCuis(q: string, taken: Set<string>): CuiEntry[] {
    const lower = q.trim().toLowerCase();
    if (!lower) return [];
    const matches: CuiEntry[] = [];
    for (const c of CUIS) {
      if (taken.has(c.cui)) continue;
      const hay = `${c.label} ${c.cui} ${c.category}`.toLowerCase();
      if (hay.includes(lower)) matches.push(c);
    }
    matches.sort((a, b) => {
      const ap = a.label.toLowerCase().startsWith(lower) ? 0 : 1;
      const bp = b.label.toLowerCase().startsWith(lower) ? 0 : 1;
      if (ap !== bp) return ap - bp;
      return a.label.localeCompare(b.label);
    });
    return matches.slice(0, 8);
  }

  $: takenSet = new Set([...cuis, ...disallowed]);
  $: results = searchCuis(query, takenSet);

  function add(cui: string) {
    if (!cuis.includes(cui)) cuis = [...cuis, cui];
    query = '';
    open = false;
    active = 0;
  }

  function remove(cui: string) {
    cuis = cuis.filter((c) => c !== cui);
  }

  function handleKey(e: KeyboardEvent) {
    if (!open || results.length === 0) {
      if (e.key === 'Escape') open = false;
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      active = (active + 1) % results.length;
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      active = (active - 1 + results.length) % results.length;
    } else if (e.key === 'Enter') {
      e.preventDefault();
      add(results[active].cui);
    } else if (e.key === 'Escape') {
      open = false;
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

<div class="picker">
  <div class="search-wrap">
    <input
      type="text"
      {placeholder}
      bind:value={query}
      on:focus={() => (open = true)}
      on:input={() => {
        open = true;
        active = 0;
      }}
      on:keydown={handleKey}
    />
    {#if open && query.trim() && results.length > 0}
      <ul class="results">
        {#each results as r, i}
          <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_noninteractive_element_interactions -->
          <li
            class="result"
            class:active={i === active}
            on:click={() => add(r.cui)}
            on:mouseenter={() => (active = i)}
          >
            <span class="cat-dot" style="background: {categoryColor(r.category)}" title={r.category}></span>
            <span class="r-label">{r.label}</span>
            <span class="r-cui mono muted">{r.cui}</span>
          </li>
        {/each}
      </ul>
    {:else if open && query.trim() && results.length === 0}
      <div class="no-results muted small">No matches. Try a different phrase.</div>
    {/if}
  </div>

  <div class="chips">
    {#each cuis as cui}
      {@const entry = CUI_BY_ID.get(cui)}
      <span class="chip chip-{chipVariant}" title={cui}>
        {#if entry}
          <span class="cat-dot" style="background: {categoryColor(entry.category)}"></span>
        {/if}
        {cuiLabel(cui)}
        <button type="button" class="x" on:click={() => remove(cui)} aria-label="Remove">×</button>
      </span>
    {:else}
      <span class="muted small">{emptyText}</span>
    {/each}
  </div>
</div>

<style>
  .picker {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .search-wrap {
    position: relative;
  }
  .search-wrap input {
    background: var(--bg-surface);
  }

  .results {
    list-style: none;
    margin: 4px 0 0;
    padding: 4px;
    background: var(--bg-surface);
    border: 1px solid var(--border-default);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-md);
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    z-index: 10;
    max-height: 280px;
    overflow-y: auto;
  }
  .result {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: 6px 8px;
    border-radius: var(--radius-sm);
    cursor: pointer;
    font-size: var(--text-sm);
  }
  .result.active {
    background: var(--brand-soft);
  }
  .r-label {
    flex: 1;
  }
  .r-cui {
    font-size: var(--text-xs);
  }
  .no-results {
    margin-top: 6px;
    padding: 8px 10px;
    background: var(--bg-surface);
    border: 1px dashed var(--border-default);
    border-radius: var(--radius-md);
  }

  .cat-dot {
    width: 8px;
    height: 8px;
    border-radius: var(--radius-full);
    flex-shrink: 0;
  }

  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    min-height: 32px;
    align-items: flex-start;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 4px 4px 4px 8px;
    border-radius: var(--radius-full);
    font-size: var(--text-xs);
    font-weight: 500;
    line-height: 1.2;
  }
  .chip-inc {
    background: var(--success-50);
    color: var(--success-700);
  }
  .chip-exc {
    background: var(--danger-50);
    color: var(--danger-700);
  }
  .chip .x {
    background: transparent;
    border: none;
    color: inherit;
    cursor: pointer;
    font-size: 14px;
    line-height: 1;
    padding: 0 4px;
    border-radius: var(--radius-full);
    opacity: 0.6;
  }
  .chip .x:hover {
    opacity: 1;
    background: rgba(0, 0, 0, 0.05);
  }

  .mono {
    font-family: var(--font-mono);
  }
  .small {
    font-size: var(--text-xs);
  }
</style>
