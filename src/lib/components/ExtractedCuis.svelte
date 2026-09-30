<script lang="ts">
  import { cuiLabel } from '$lib/cui';
  import type { ExtractedCui, CuiEvidence } from '$lib/types';
  import RawDocument from '$lib/components/RawDocument.svelte';

  /** Raw CUI list (always available). */
  export let cuis: string[] = [];
  /** Rich detail (source + native code) — present for live patients. */
  export let detail: ExtractedCui[] | undefined = undefined;
  export let open = true;
  /** Live-patient context — enables the IRB-gated "view source document" link. */
  export let patientId: string | null = null;
  export let hospitalId: string | null = null;
  /** When true (IRB cleared), the raw source document can be opened. */
  export let irbCleared = false;

  // Which raw document (if any) is open in the viewer.
  let rawDoc: { docId: string; title: string | null } | null = null;

  // All extracted spans for a document (across every CUI), to highlight in the modal.
  function docHighlights(docId: string | null) {
    if (!docId) return [];
    const out: { start: number; end: number; label?: string }[] = [];
    for (const r of detail ?? []) {
      for (const ev of r.evidence ?? []) {
        if (ev.kind === 'note' && ev.docId === docId && ev.start != null && ev.end != null) {
          out.push({ start: ev.start, end: ev.end, label: r.label });
        }
      }
    }
    return out;
  }
  function openDoc(ev: CuiEvidence) {
    if (!irbCleared || !patientId || !hospitalId || !ev.docId) return;
    rawDoc = { docId: ev.docId, title: ev.docTitle ?? null };
  }

  function escapeHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  // Highlight the exact matched span inside the snippet (same idea as the modal).
  function highlightSnippet(snippet: string | null | undefined, matched: string | null | undefined): string {
    const text = escapeHtml(snippet ?? '');
    if (!matched) return text;
    const m = escapeHtml(matched).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return text.replace(new RegExp(m, 'ig'), '<mark class="ev-hl">$&</mark>');
  }

  // Collapse identical snippets (copy-forward/templated notes repeat the same text).
  function dedupeBySnippet(evs: CuiEvidence[]): CuiEvidence[] {
    const seen = new Set<string>();
    const out: CuiEvidence[] = [];
    for (const e of evs) {
      const k = (e.snippet ?? '').trim();
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(e);
    }
    return out;
  }

  const SYS: Record<string, string> = {
    'http://hl7.org/fhir/sid/icd-10-cm': 'ICD-10-CM',
    'http://snomed.info/sct': 'SNOMED',
    'http://www.nlm.nih.gov/research/umls/rxnorm': 'RxNorm',
    'http://loinc.org': 'LOINC',
    'http://www.ama-assn.org/go/cpt': 'CPT'
  };
  const sysShort = (s?: string | null): string =>
    s ? SYS[s] ?? s.replace(/^https?:\/\//, '').split('/')[0] : '';

  // Normalize to a uniform row list. Without detail (mock patients) everything
  // is shown as a plain coded concept.
  $: rows =
    detail && detail.length
      ? detail
      : cuis.map(
          (c): ExtractedCui => ({ cui: c, label: cuiLabel(c), source: 'structured', nativeSystem: null, nativeCode: null })
        );
  $: structured = rows.filter((r) => r.source === 'structured');
  $: unstructured = rows.filter((r) => r.source === 'unstructured');
  $: hasDetail = !!(detail && detail.length);
</script>

{#if !rows.length}
  <section class="ecu ecu-empty">
    <div class="ecu-head static">
      <span class="ecu-title">Extracted CUIs</span>
      <span class="ecu-count zero">0</span>
    </div>
    <p class="ecu-emptymsg">No concepts have been extracted from this patient's records yet.</p>
  </section>
{:else}
  <section class="ecu">
    <button class="ecu-head" on:click={() => (open = !open)} aria-expanded={open}>
      <span class="chev" class:open>▸</span>
      <span class="ecu-title">Extracted CUIs</span>
      <span class="ecu-count">{rows.length}</span>
      {#if hasDetail}
        <span class="ecu-meta">{structured.length} structured · {unstructured.length} from notes</span>
      {/if}
    </button>

    {#if open}
      <div class="ecu-body">
        {#each [{ label: 'Structured (coded data)', items: structured, cls: 'struct' }, { label: 'From clinical notes', items: unstructured, cls: 'unstruct' }] as group}
          {#if group.items.length}
            {#if hasDetail}<div class="ecu-group">{group.label}</div>{/if}
            <ul class="ecu-list">
              {#each group.items as r}
                {@const noteEv = dedupeBySnippet((r.evidence ?? []).filter((e) => e.kind === 'note'))}
                <li class="ecu-item">
                  <div class="ecu-row" title="{r.cui}{r.nativeCode ? ` · ${sysShort(r.nativeSystem)} ${r.nativeCode}` : ''}">
                    <span class="dot {group.cls}"></span>
                    <span class="ecu-name">{r.label}</span>
                    <code class="ecu-cui">{r.cui}</code>
                    {#if r.nativeCode}
                      <span class="ecu-native">{sysShort(r.nativeSystem)} {r.nativeCode}</span>
                    {/if}
                  </div>

                  {#if noteEv.length}
                    {#if irbCleared}
                      <ul class="ev-list">
                        {#each noteEv.slice(0, 3) as ev}
                          <li class="ev">
                            <span class="ev-quote">“{@html highlightSnippet(ev.snippet, ev.matchedText)}”</span>
                            <span class="ev-src">
                              <span class="ev-doc">{ev.docTitle ?? 'Clinical note'}{ev.docDate ? ` · ${ev.docDate}` : ''}</span>
                              {#if patientId && hospitalId && ev.docId}
                                <button type="button" class="ev-link" on:click={() => openDoc(ev)}>view source ↗</button>
                              {/if}
                            </span>
                          </li>
                        {/each}
                        {#if noteEv.length > 3}
                          <li class="ev-more muted">+{noteEv.length - 3} more mention{noteEv.length - 3 > 1 ? 's' : ''}</li>
                        {/if}
                      </ul>
                    {:else}
                      <!-- PHI gate: note text is hidden until IRB clearance is enabled -->
                      <div class="ev-locked" title="Enable IRB clearance to view note text">
                        🔒 {noteEv.length} mention{noteEv.length === 1 ? '' : 's'} in clinical notes — enable IRB clearance to view
                      </div>
                    {/if}
                  {/if}
                </li>
              {/each}
            </ul>
          {/if}
        {/each}
      </div>
    {/if}
  </section>
{/if}

{#if rawDoc && patientId && hospitalId}
  <RawDocument
    {patientId}
    {hospitalId}
    docId={rawDoc.docId}
    title={rawDoc.title}
    highlights={docHighlights(rawDoc.docId)}
    on:close={() => (rawDoc = null)}
  />
{/if}

<style>
  .ecu {
    border: 1px solid var(--border-subtle, #e5e7eb);
    border-radius: 10px;
    margin-bottom: 16px;
    background: var(--bg-surface, #fff);
    overflow: hidden;
  }
  .ecu-head {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 10px 12px;
    background: var(--bg-sunken, #f8fafc);
    border: none;
    cursor: pointer;
    font-family: inherit;
    text-align: left;
  }
  .chev {
    transition: transform 0.12s ease;
    color: var(--fg-muted, #94a3b8);
    font-size: 0.75rem;
  }
  .chev.open {
    transform: rotate(90deg);
  }
  .ecu-title {
    font-weight: 700;
    font-size: 0.8rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--fg-default, #334155);
  }
  .ecu-count {
    background: #e0e7ff;
    color: #3730a3;
    border-radius: 999px;
    padding: 1px 8px;
    font-size: 0.72rem;
    font-weight: 700;
  }
  .ecu-count.zero {
    background: #f1f5f9;
    color: #94a3b8;
  }
  .ecu-head.static {
    cursor: default;
  }
  .ecu-emptymsg {
    margin: 0;
    padding: 12px;
    font-size: 0.8rem;
    color: var(--fg-muted, #94a3b8);
  }
  .ecu-meta {
    margin-left: auto;
    color: var(--fg-muted, #94a3b8);
    font-size: 0.72rem;
  }
  .ecu-body {
    padding: 8px 12px 12px;
  }
  .ecu-group {
    font-size: 0.68rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--fg-muted, #94a3b8);
    margin: 8px 0 4px;
  }
  .ecu-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .ecu-item {
    list-style: none;
  }
  .ev-list {
    list-style: none;
    margin: 1px 0 6px 18px;
    padding: 0 0 0 10px;
    border-left: 2px solid #d1fae5;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .ev {
    font-size: 0.74rem;
    line-height: 1.35;
  }
  .ev-quote {
    color: #334155;
    font-style: italic;
  }
  .ev-quote :global(mark.ev-hl) {
    background: #fde68a;
    color: #1e293b;
    font-style: normal;
    padding: 0 2px;
    border-radius: 3px;
  }
  .ev-src {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    margin-top: 1px;
  }
  .ev-doc {
    color: #64748b;
    font-size: 0.68rem;
  }
  .ev-link {
    border: none;
    background: none;
    padding: 0;
    color: #2563eb;
    font: inherit;
    font-size: 0.68rem;
    cursor: pointer;
    text-decoration: underline;
  }
  .ev-lock {
    color: #94a3b8;
    font-size: 0.68rem;
  }
  .ev-more {
    font-size: 0.68rem;
    margin-left: 18px;
  }
  .ev-locked {
    margin: 1px 0 6px 18px;
    padding: 4px 8px;
    font-size: 0.72rem;
    color: #94a3b8;
    background: var(--bg-sunken, #f8fafc);
    border: 1px dashed #e2e8f0;
    border-radius: 6px;
  }
  .muted {
    color: #94a3b8;
  }
  .ecu-row {
    display: grid;
    grid-template-columns: auto 1fr auto auto;
    align-items: center;
    gap: 8px;
    padding: 3px 4px;
    border-radius: 6px;
  }
  .ecu-row:hover {
    background: var(--bg-sunken, #f1f5f9);
  }
  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex: none;
  }
  .dot.struct {
    background: #6366f1;
  }
  .dot.unstruct {
    background: #16a34a;
  }
  .ecu-name {
    font-size: 0.82rem;
    color: var(--fg-default, #1e293b);
  }
  .ecu-cui {
    font-family: ui-monospace, monospace;
    font-size: 0.7rem;
    color: var(--fg-muted, #64748b);
  }
  .ecu-native {
    font-size: 0.66rem;
    color: #475569;
    background: #f1f5f9;
    border-radius: 4px;
    padding: 1px 6px;
    white-space: nowrap;
  }
</style>
