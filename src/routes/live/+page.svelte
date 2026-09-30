<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { cuiLabel } from '$lib/cui';
  import type { PageData } from './$types';

  export let data: PageData;

  // Build a new URL from the current params with overrides, then navigate.
  function navigate(mutate: (p: URLSearchParams) => void) {
    const params = new URLSearchParams($page.url.searchParams);
    mutate(params);
    goto(`?${params.toString()}`, { keepFocus: true, noScroll: true });
  }

  function toggleCui(cui: string, checked: boolean) {
    navigate((p) => {
      const current = p.getAll('cui').filter((c) => c !== cui);
      p.delete('cui');
      for (const c of current) p.append('cui', c);
      if (checked) p.append('cui', cui);
    });
  }

  function setParam(key: string, value: string) {
    navigate((p) => {
      if (value) p.set(key, value);
      else p.delete(key);
    });
  }

  function toggleIrb() {
    navigate((p) => {
      if (data.includePhi) p.delete('irb');
      else p.set('irb', '1');
    });
  }

  function clearAll() {
    goto('?', { keepFocus: true, noScroll: true });
  }

  $: selected = new Set(data.selectedCuis);
  $: label = (cui: string) => {
    const fromUi = cuiLabel(cui);
    return fromUi && fromUi !== cui ? fromUi : cui;
  };
</script>

<svelte:head><title>Live cohort · {data.institution ?? 'Olivo'}</title></svelte:head>

<div class="wrap">
  <header>
    <h1>Live cohort — repository view</h1>
    <p class="sub">
      {#if data.available}
        {data.institution ?? data.hospitalId} ·
        <strong>{data.patients.length}</strong> patient{data.patients.length === 1 ? '' : 's'}
        {#if data.selectedCuis.length}· filtered by {data.selectedCuis.length} CUI(s){/if}
      {:else}
        No live store found. Run the ingestion pull + ml-processing pipeline, then reload.
      {/if}
    </p>
    <div class="actions">
      <button class:on={data.includePhi} on:click={toggleIrb}>
        {data.includePhi ? '🔓 PHI visible (IRB cleared)' : '🔒 De-identified (default)'}
      </button>
      <button on:click={clearAll}>Clear filters</button>
    </div>
  </header>

  {#if data.available}
    <div class="grid">
      <aside class="filters">
        <h3>Filters</h3>
        <label class="field">
          <span>Gender</span>
          <select value={data.gender ?? ''} on:change={(e) => setParam('gender', e.currentTarget.value)}>
            <option value="">Any</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
          </select>
        </label>
        <div class="field two">
          <label><span>Age ≥</span>
            <input type="number" value={data.ageMin ?? ''} on:change={(e) => setParam('ageMin', e.currentTarget.value)} /></label>
          <label><span>Age ≤</span>
            <input type="number" value={data.ageMax ?? ''} on:change={(e) => setParam('ageMax', e.currentTarget.value)} /></label>
        </div>

        <h3>CUI codes <span class="muted">(AND)</span></h3>
        <div class="facets">
          {#each data.facets as f}
            <label class="facet">
              <input type="checkbox" checked={selected.has(f.cui)} on:change={(e) => toggleCui(f.cui, e.currentTarget.checked)} />
              <span class="flabel">{label(f.cui)}</span>
              <span class="fcount">{f.count}</span>
            </label>
          {:else}
            <p class="muted">No CUIs in store yet.</p>
          {/each}
        </div>
      </aside>

      <main>
        <table>
          <thead>
            <tr>
              {#if data.includePhi}<th>Name</th><th>MRN</th>{/if}
              <th>Patient</th><th>Age</th><th>Sex</th><th>Race</th><th>State</th><th>CUIs</th>
            </tr>
          </thead>
          <tbody>
            {#each data.patients as p}
              <tr>
                {#if data.includePhi}
                  <td>{p.lastName ?? ''}{p.firstName ? ', ' + p.firstName : ''}</td>
                  <td class="mono">{p.mrn ?? ''}</td>
                {/if}
                <td class="mono">{p.patientId.slice(0, 8)}</td>
                <td>{p.age ?? '—'}</td>
                <td>{p.gender ?? '—'}</td>
                <td>{p.race ?? '—'}</td>
                <td>{p.state ?? '—'}</td>
                <td class="chips">
                  {#each p.cuiDetail as c}
                    <span class="chip" class:unstruct={c.source === 'unstructured'} title={`${c.cui} · ${c.source}`}>
                      {c.label ?? label(c.cui)}
                    </span>
                  {/each}
                </td>
              </tr>
            {:else}
              <tr><td colspan="8" class="muted">No patients match.</td></tr>
            {/each}
          </tbody>
        </table>
      </main>
    </div>
  {/if}
</div>

<style>
  .wrap { padding: 1.5rem; max-width: 1200px; margin: 0 auto; font-family: system-ui, sans-serif; }
  h1 { margin: 0; font-size: 1.4rem; }
  .sub { color: #555; margin: 0.25rem 0 0.75rem; }
  .actions { display: flex; gap: 0.5rem; margin-bottom: 1rem; }
  .actions button { padding: 0.4rem 0.7rem; border: 1px solid #ccc; border-radius: 6px; background: #fff; cursor: pointer; }
  .actions button.on { background: #fde68a; border-color: #f59e0b; }
  .grid { display: grid; grid-template-columns: 260px 1fr; gap: 1.25rem; }
  .filters h3 { margin: 1rem 0 0.4rem; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.04em; color: #444; }
  .field { display: flex; flex-direction: column; gap: 0.2rem; margin-bottom: 0.5rem; font-size: 0.85rem; }
  .field.two { flex-direction: row; gap: 0.5rem; }
  .field input, .field select { padding: 0.3rem; border: 1px solid #ccc; border-radius: 5px; }
  .facets { display: flex; flex-direction: column; gap: 0.15rem; max-height: 60vh; overflow: auto; }
  .facet { display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 0.4rem; font-size: 0.85rem; padding: 0.15rem 0.25rem; border-radius: 4px; }
  .facet:hover { background: #f3f4f6; }
  .fcount { color: #888; font-variant-numeric: tabular-nums; }
  table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
  th, td { text-align: left; padding: 0.45rem 0.5rem; border-bottom: 1px solid #eee; vertical-align: top; }
  th { color: #555; font-weight: 600; }
  .mono { font-family: ui-monospace, monospace; }
  .chips { display: flex; flex-wrap: wrap; gap: 0.25rem; }
  .chip { background: #e0e7ff; color: #3730a3; border-radius: 999px; padding: 0.05rem 0.5rem; font-size: 0.72rem; }
  .chip.unstruct { background: #dcfce7; color: #166534; }
  .muted { color: #999; }
</style>
