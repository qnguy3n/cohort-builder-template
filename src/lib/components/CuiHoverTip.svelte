<script lang="ts">
  import { CUI_BY_ID, cuiLabel, childrenOf, siblingsOf } from '$lib/cui';

  export let cui: string;
  /** CUIs already chosen in the current filter — highlights selected siblings/children. */
  export let selectedCuis: string[] = [];
  export let phrase: string | null = null;

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

<span class="cui-hover">
  <slot />
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
            <span class="tip-pill" class:selected={c.selected}>
              {#if c.selected}<span class="tip-check">✓</span>{/if}{c.label}
            </span>
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
            <span class="tip-pill" class:selected={s.selected}>
              {#if s.selected}<span class="tip-check">✓</span>{/if}{s.label}
            </span>
          {/each}
        </span>
      </span>
    {/if}
  </span>
</span>

<style>
  .cui-hover {
    position: relative;
    display: inline-flex;
    align-items: center;
  }
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
    min-width: 240px;
    max-width: 360px;
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
  .cui-hover:hover .tip {
    opacity: 1;
    visibility: visible;
    transform: translateX(-50%) translateY(0);
  }
  .tip-row {
    display: flex;
    align-items: center;
    gap: 6px;
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
    line-height: 1.4;
  }
  .tip-pill.selected {
    background: oklch(72% 0.145 75);
    color: oklch(20% 0.020 90);
    font-weight: 700;
  }
  .tip-check {
    margin-right: 4px;
    color: oklch(35% 0.080 145);
    font-weight: 800;
  }
  .tip-sel-badge {
    color: oklch(82% 0.080 75);
    font-weight: 600;
    text-transform: none;
    letter-spacing: 0;
  }
</style>
