<script lang="ts">
  import { createEventDispatcher, tick } from 'svelte';
  import type { TeamMember } from '$lib/types';

  export let members: TeamMember[];
  export let selected: string[] = [];
  export let placeholder = 'Search by name or role…';

  const dispatch = createEventDispatcher<{ change: string[] }>();

  let query = '';
  let open = false;
  let activeIdx = 0;
  let inputEl: HTMLInputElement | null = null;
  let listEl: HTMLUListElement | null = null;

  $: byId = new Map(members.map((m) => [m.id, m]));
  $: selectedMembers = selected.map((id) => byId.get(id)).filter((m): m is TeamMember => !!m);

  $: results = (() => {
    const sel = new Set(selected);
    const pool = members.filter((m) => !sel.has(m.id));
    const q = query.trim().toLowerCase();
    if (!q) return pool.slice(0, 8);
    return pool
      .filter((m) => m.name.toLowerCase().includes(q) || m.role.toLowerCase().includes(q))
      .slice(0, 8);
  })();

  // Keep activeIdx in range when results change
  $: if (activeIdx >= results.length) activeIdx = Math.max(0, results.length - 1);

  function add(id: string) {
    if (selected.includes(id)) return;
    selected = [...selected, id];
    dispatch('change', selected);
    query = '';
    activeIdx = 0;
    // keep dropdown open for repeat additions
    tick().then(() => inputEl?.focus());
  }

  function remove(id: string) {
    selected = selected.filter((x) => x !== id);
    dispatch('change', selected);
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      open = true;
      activeIdx = Math.min(activeIdx + 1, results.length - 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      activeIdx = Math.max(activeIdx - 1, 0);
    } else if (e.key === 'Enter') {
      if (results.length > 0) {
        e.preventDefault();
        add(results[activeIdx]?.id ?? results[0].id);
      }
    } else if (e.key === 'Escape') {
      open = false;
      query = '';
    } else if (e.key === 'Backspace' && query === '' && selected.length > 0) {
      // Delete the last chip on Backspace when input is empty
      remove(selected[selected.length - 1]);
    }
  }

  function onBlur() {
    // Defer so a click on a result fires before the dropdown closes
    setTimeout(() => {
      open = false;
    }, 120);
  }
</script>

<div class="picker" class:open>
  <div
    class="chip-bar"
    role="presentation"
    on:click={() => inputEl?.focus()}
    on:keydown={(e) => {
      if (e.key === 'Enter' || e.key === ' ') inputEl?.focus();
    }}
  >
    {#each selectedMembers as m (m.id)}
      <span class="chip">
        <span class="chip-name">{m.name}</span>
        <span class="chip-role">· {m.role}</span>
        <button
          type="button"
          class="chip-x"
          aria-label="Remove {m.name}"
          on:click|stopPropagation={() => remove(m.id)}
        >×</button>
      </span>
    {/each}
    <input
      bind:this={inputEl}
      type="text"
      class="picker-input"
      {placeholder}
      bind:value={query}
      on:focus={() => (open = true)}
      on:blur={onBlur}
      on:keydown={onKey}
    />
  </div>

  {#if open && results.length > 0}
    <ul class="dropdown" bind:this={listEl} role="listbox">
      {#each results as m, i (m.id)}
        <li
          class="dd-row"
          class:active={i === activeIdx}
          role="option"
          aria-selected={i === activeIdx}
          on:mousedown|preventDefault={() => add(m.id)}
          on:mouseenter={() => (activeIdx = i)}
        >
          <span class="dd-name">{m.name}</span>
          <span class="dd-role">{m.role}</span>
        </li>
      {/each}
    </ul>
  {:else if open && query.trim()}
    <ul class="dropdown" role="listbox">
      <li class="dd-empty">No matching team members</li>
    </ul>
  {/if}
</div>

<style>
  .picker {
    position: relative;
    width: 100%;
  }
  .chip-bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    background: var(--bg-surface);
    border: 1px solid var(--border-default);
    border-radius: var(--radius-md);
    padding: 6px 8px;
    min-height: 40px;
    cursor: text;
    transition: border-color 0.12s ease, box-shadow 0.12s ease;
  }
  .picker.open .chip-bar {
    border-color: var(--brand-active);
    box-shadow: 0 0 0 3px var(--brand-soft);
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    background: var(--brand-soft);
    color: var(--sage-800);
    border-radius: var(--radius-full);
    padding: 3px 4px 3px 10px;
    font-size: var(--text-xs);
    font-weight: 600;
    line-height: 1.2;
  }
  .chip-name {
    color: var(--sage-800);
  }
  .chip-role {
    color: var(--sage-700);
    font-weight: 500;
    margin-left: 2px;
  }
  .chip-x {
    background: transparent;
    border: none;
    color: var(--sage-700);
    cursor: pointer;
    font-size: 14px;
    line-height: 1;
    padding: 2px 6px;
    border-radius: var(--radius-full);
  }
  .chip-x:hover {
    background: var(--sage-200);
    color: var(--sage-900);
  }
  .picker-input {
    flex: 1;
    min-width: 140px;
    border: none;
    outline: none;
    background: transparent;
    font-family: inherit;
    font-size: var(--text-sm);
    padding: 4px 6px;
    color: var(--fg-default);
  }
  .picker-input::placeholder {
    color: var(--fg-muted);
  }
  .dropdown {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    right: 0;
    list-style: none;
    margin: 0;
    padding: 4px;
    background: var(--bg-surface);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-md);
    max-height: 240px;
    overflow-y: auto;
    z-index: 10;
  }
  .dd-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    border-radius: var(--radius-sm);
    cursor: pointer;
    font-size: var(--text-sm);
  }
  .dd-row.active {
    background: var(--brand-soft);
  }
  .dd-name {
    color: var(--fg-default);
    font-weight: 500;
  }
  .dd-role {
    color: var(--fg-muted);
    font-size: var(--text-xs);
  }
  .dd-empty {
    padding: 10px;
    color: var(--fg-muted);
    font-size: var(--text-sm);
    font-style: italic;
  }
</style>
