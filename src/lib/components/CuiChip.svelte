<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { CUI_BY_ID, cuiLabel, childrenOf, siblingsOf } from '$lib/cui';

  export let cui: string;
  export let variant: 'inc' | 'exc' | 'plain' = 'plain';
  export let removable = false;
  /** Optional one-line context shown beneath the label (e.g. "8,231 patients in Stanford"). */
  export let context: string | null = null;
  /** The original phrase the user typed that resolved to this CUI. */
  export let phrase: string | null = null;
  /** When true, emit "broaden" events when user clicks a sibling/child suggestion. */
  export let suggestBroaden = false;
  /** CUIs already chosen in the current filter — used to highlight siblings/children that are selected. */
  export let selectedCuis: string[] = [];

  const dispatch = createEventDispatcher<{ remove: string; broaden: string }>();
  $: entry = CUI_BY_ID.get(cui);
  $: selectedSet = new Set(selectedCuis);
  $: children = childrenOf(cui).map((c) => ({ cui: c, label: cuiLabel(c), selected: selectedSet.has(c) }));
  $: siblings = siblingsOf(cui).map((c) => ({ cui: c, label: cuiLabel(c), selected: selectedSet.has(c) }));
  $: selectedChildren = children.filter((c) => c.selected).length;
  $: selectedSiblings = siblings.filter((s) => s.selected).length;

  function categoryColor(cat?: string): string {
    if (cat === 'disorder') return 'oklch(60% 0.036 115)';
    if (cat === 'medication') return 'oklch(60% 0.140 240)';
    if (cat === 'procedure') return 'oklch(62% 0.130 40)';
    if (cat === 'assessment') return 'oklch(72% 0.145 75)';
    if (cat === 'gene') return 'oklch(58% 0.130 155)';
    return 'oklch(58% 0.011 90)';
  }
</script>

<span class="cui-chip cui-chip-{variant}" class:has-phrase={!!phrase}>
  {#if entry}
    <span class="cat-dot" style="background: {categoryColor(entry.category)}"></span>
  {/if}
  <span class="chip-text">
    <span class="cui-label">{cuiLabel(cui)}</span>
    {#if phrase && phrase.toLowerCase() !== cuiLabel(cui).toLowerCase()}
      <span class="phrase-tag" title="Your original phrase">“{phrase}”</span>
    {/if}
  </span>
  {#if removable}
    <button type="button" class="x" on:click|stopPropagation={() => dispatch('remove', cui)} aria-label="Remove">×</button>
  {/if}

  <span class="tip" role="tooltip">
    <span class="tip-row tip-head">
      {#if entry}
        <span class="tip-dot" style="background: {categoryColor(entry.category)}"></span>
        <span class="tip-cat">{entry.category}</span>
      {/if}
      <span class="tip-cui">{cui}</span>
    </span>
    <span class="tip-label">{cuiLabel(cui)}</span>

    {#if phrase}
      <span class="tip-section">
        <span class="tip-section-head">From your phrase</span>
        <span class="tip-phrase">“{phrase}”</span>
      </span>
    {/if}

    {#if entry?.aliases && entry.aliases.length > 0}
      <span class="tip-aliases">
        Also: {entry.aliases.slice(0, 4).join(', ')}{entry.aliases.length > 4 ? '…' : ''}
      </span>
    {/if}

    {#if children.length > 0}
      <span class="tip-section">
        <span class="tip-section-head">
          More specific concepts ({children.length}{#if selectedChildren > 0}<span class="tip-sel-badge"> · {selectedChildren} selected</span>{/if})
        </span>
        <span class="tip-list">
          {#each children as c}
            {#if suggestBroaden}
              <button
                type="button"
                class="tip-pill clickable"
                class:selected={c.selected}
                on:click|stopPropagation|preventDefault={() => dispatch('broaden', c.cui)}
              >
                {c.selected ? '✓' : '+'} {c.label}
              </button>
            {:else}
              <span class="tip-pill" class:selected={c.selected}>
                {#if c.selected}<span class="tip-check">✓</span>{/if}{c.label}
              </span>
            {/if}
          {/each}
        </span>
      </span>
    {/if}

    {#if siblings.length > 0}
      <span class="tip-section">
        <span class="tip-section-head">
          Related concepts ({siblings.length}{#if selectedSiblings > 0}<span class="tip-sel-badge"> · {selectedSiblings} selected</span>{/if})
        </span>
        <span class="tip-list">
          {#each siblings.slice(0, 6) as s}
            {#if suggestBroaden}
              <button
                type="button"
                class="tip-pill clickable"
                class:selected={s.selected}
                on:click|stopPropagation|preventDefault={() => dispatch('broaden', s.cui)}
              >
                {s.selected ? '✓' : '+'} {s.label}
              </button>
            {:else}
              <span class="tip-pill" class:selected={s.selected}>
                {#if s.selected}<span class="tip-check">✓</span>{/if}{s.label}
              </span>
            {/if}
          {/each}
        </span>
      </span>
    {/if}

    {#if context}
      <span class="tip-context">{context}</span>
    {/if}
  </span>
</span>

<style>
  .cui-chip {
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 4px 4px 4px 9px;
    border-radius: var(--radius-full);
    font-size: var(--text-xs);
    font-weight: 500;
    line-height: 1.3;
    cursor: default;
  }
  .cui-chip-inc {
    background: var(--success-50);
    color: var(--success-700);
  }
  .cui-chip-exc {
    background: var(--danger-50);
    color: var(--danger-700);
  }
  .cui-chip-plain {
    background: var(--brand-soft);
    color: var(--sage-800);
  }

  .cat-dot {
    width: 7px;
    height: 7px;
    border-radius: var(--radius-full);
    flex-shrink: 0;
  }

  .chip-text {
    display: inline-flex;
    align-items: baseline;
    gap: 5px;
    line-height: 1.2;
  }
  .cui-label {
    line-height: 1.2;
  }
  .phrase-tag {
    font-style: italic;
    opacity: 0.65;
    font-size: var(--text-2xs);
    font-weight: 400;
  }

  .x {
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
  .x:hover {
    opacity: 1;
    background: rgba(0, 0, 0, 0.05);
  }

  /* Hover tooltip */
  .tip {
    position: absolute;
    bottom: calc(100% + 8px);
    left: 50%;
    transform: translateX(-50%) translateY(2px);
    background: var(--neutral-900);
    color: var(--neutral-50);
    padding: 10px 12px;
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-md);
    min-width: 220px;
    max-width: 320px;
    font-size: var(--text-2xs);
    line-height: 1.4;
    pointer-events: none;
    opacity: 0;
    visibility: hidden;
    transition: opacity 0.1s ease, transform 0.1s ease;
    z-index: 200;
    display: flex;
    flex-direction: column;
    gap: 6px;
    text-align: left;
    font-weight: 500;
  }
  .tip::after {
    content: '';
    position: absolute;
    top: 100%;
    left: 50%;
    transform: translateX(-50%);
    border: 5px solid transparent;
    border-top-color: var(--neutral-900);
  }
  .cui-chip:hover .tip {
    opacity: 1;
    visibility: visible;
    transform: translateX(-50%) translateY(0);
    pointer-events: auto;
  }

  .tip-row {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }
  .tip-dot {
    width: 6px;
    height: 6px;
    border-radius: var(--radius-full);
  }
  .tip-cat {
    text-transform: uppercase;
    letter-spacing: 0.06em;
    font-weight: 700;
    font-size: 10px;
    color: oklch(80% 0.020 90);
  }
  .tip-cui {
    font-family: var(--font-mono);
    margin-left: auto;
    color: oklch(80% 0.020 90);
  }
  .tip-label {
    font-weight: 600;
    color: white;
  }
  .tip-aliases {
    color: oklch(78% 0.020 90);
    font-style: italic;
  }
  .tip-context {
    color: oklch(85% 0.020 90);
    border-top: 1px solid oklch(35% 0.010 90);
    padding-top: 4px;
    margin-top: 2px;
  }

  .tip-section {
    display: flex;
    flex-direction: column;
    gap: 4px;
    border-top: 1px solid oklch(35% 0.010 90);
    padding-top: 6px;
  }
  .tip-section-head {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    font-weight: 700;
    color: oklch(80% 0.020 90);
  }
  .tip-phrase {
    color: oklch(90% 0.020 90);
    font-style: italic;
  }
  .tip-list {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }
  .tip-pill {
    background: oklch(34% 0.010 90);
    color: oklch(95% 0.005 90);
    padding: 2px 7px;
    border-radius: var(--radius-full);
    font-size: 11px;
    font-weight: 500;
    border: none;
    font-family: inherit;
    line-height: 1.4;
  }
  .tip-pill.clickable {
    cursor: pointer;
    background: oklch(40% 0.020 115);
    color: oklch(95% 0.020 115);
  }
  .tip-pill.clickable:hover {
    background: var(--brand);
    color: var(--brand-fg);
  }
  .tip-pill.selected {
    background: oklch(72% 0.145 75);
    color: oklch(20% 0.020 90);
    font-weight: 700;
  }
  .tip-pill.clickable.selected:hover {
    background: oklch(78% 0.145 75);
    color: oklch(15% 0.020 90);
  }
  .tip-check {
    margin-right: 4px;
    color: var(--success-700);
    font-weight: 800;
  }
  .tip-pill.selected .tip-check {
    color: oklch(35% 0.080 145);
  }
  .tip-sel-badge {
    color: oklch(82% 0.080 75);
    font-weight: 600;
    text-transform: none;
    letter-spacing: 0;
  }
</style>
