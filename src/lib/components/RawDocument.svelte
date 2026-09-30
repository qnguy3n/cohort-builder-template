<script lang="ts">
  import { onMount } from 'svelte';
  import { createEventDispatcher } from 'svelte';

  // Mirror of the server's LiveDocument (can't import from $lib/server on client).
  type LiveDocument = {
    found: boolean;
    docId: string;
    title: string | null;
    date: string | null;
    contentType: string | null;
    isText: boolean;
    text?: string;
    dataUrl?: string;
    mime?: string;
  };

  /** Identifies the document to fetch (PHI — endpoint is auth-gated). */
  export let patientId: string;
  export let hospitalId: string;
  export let docId: string;
  export let title: string | null = null;
  /** Extracted spans to highlight (offsets into the raw text) + their concept label. */
  export let highlights: { start: number; end: number; label?: string }[] = [];

  const dispatch = createEventDispatcher();

  let loading = true;
  let err: string | null = null;
  let doc: LiveDocument | null = null;

  onMount(async () => {
    try {
      const qs = new URLSearchParams({ patientId, hospitalId, docId });
      const res = await fetch(`/api/live/document?${qs}`);
      if (!res.ok) throw new Error(`(${res.status}) ${await res.text()}`);
      doc = await res.json();
    } catch (e) {
      err = e instanceof Error ? e.message : 'Failed to load document';
    } finally {
      loading = false;
    }
  });

  // Break the raw text into plain + highlighted segments at every extracted span.
  type Seg = { text: string; mark: boolean; label?: string };
  function buildSegments(text: string | undefined, hl: { start: number; end: number; label?: string }[]): Seg[] | null {
    if (!text) return null;
    const valid = hl
      .filter((h) => h.start != null && h.end != null && h.end > h.start && h.end <= text.length)
      .sort((a, b) => a.start - b.start);
    if (!valid.length) return null;
    const segs: Seg[] = [];
    let pos = 0;
    for (const h of valid) {
      if (h.start < pos) continue; // skip overlapping span
      if (h.start > pos) segs.push({ text: text.slice(pos, h.start), mark: false });
      segs.push({ text: text.slice(h.start, h.end), mark: true, label: h.label });
      pos = h.end;
    }
    if (pos < text.length) segs.push({ text: text.slice(pos), mark: false });
    return segs;
  }
  $: segments = buildSegments(doc?.text, highlights);

  function close() {
    dispatch('close');
  }
  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') close();
  }
</script>

<svelte:window on:keydown={onKey} />

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_noninteractive_element_interactions -->
<div class="overlay" role="dialog" aria-modal="true" tabindex="-1" on:click={close}>
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div class="sheet" on:click|stopPropagation>
    <header class="head">
      <div>
        <div class="muted small">Source document · PHI</div>
        <h3>{doc?.title ?? title ?? 'Document'}</h3>
        {#if doc?.date}<div class="muted small">{doc.date}</div>{/if}
      </div>
      <button class="x" aria-label="Close" on:click={close}>×</button>
    </header>

    <div class="body">
      {#if loading}
        <div class="muted">Loading…</div>
      {:else if err}
        <div class="err">Could not load document: {err}</div>
      {:else if doc && doc.isText && doc.text}
        <div class="doc">{#if segments}{#each segments as s}{#if s.mark}<mark title={s.label}>{s.text}</mark>{:else}{s.text}{/if}{/each}{:else}{doc.text}{/if}</div>
      {:else if doc && doc.dataUrl && doc.mime === 'application/pdf'}
        <embed class="doc-pdf" src={doc.dataUrl} type="application/pdf" title={doc.title ?? 'PDF'} />
      {:else if doc && doc.dataUrl && doc.mime?.startsWith('image/')}
        <img class="doc-img" src={doc.dataUrl} alt={doc.title ?? 'Scanned document'} />
      {:else if doc}
        <div class="binary">
          <p><strong>{doc.mime ?? doc.contentType ?? 'Binary document'}</strong></p>
          <p class="muted">
            This document type can't be previewed inline (e.g. a zipped/proprietary
            format). Only its metadata is available here.
          </p>
        </div>
      {/if}
    </div>
  </div>
</div>

<style>
  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(15, 23, 42, 0.55);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 60;
    padding: 24px;
  }
  .sheet {
    background: #fff;
    border-radius: 12px;
    width: min(760px, 100%);
    max-height: 85vh;
    display: flex;
    flex-direction: column;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  }
  .head {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 12px;
    padding: 16px 18px;
    border-bottom: 1px solid #e5e7eb;
  }
  .head h3 {
    margin: 2px 0;
    font-size: 1rem;
  }
  .small {
    font-size: 0.72rem;
  }
  .muted {
    color: #64748b;
  }
  .x {
    border: none;
    background: none;
    font-size: 1.5rem;
    line-height: 1;
    cursor: pointer;
    color: #64748b;
  }
  .body {
    padding: 16px 18px;
    overflow: auto;
  }
  .doc {
    white-space: pre-wrap;
    word-break: break-word;
    font-family:
      ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    font-size: 0.9rem;
    line-height: 1.65;
    color: #1e293b;
    margin: 0;
    background: #fcfcfd;
    border: 1px solid #eef2f6;
    border-radius: 8px;
    padding: 18px 20px;
    max-width: 68ch;
  }
  .doc mark {
    background: #fde68a;
    padding: 0 2px;
    border-radius: 3px;
  }
  .doc-img {
    max-width: 100%;
    height: auto;
    display: block;
    margin: 0 auto;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
  }
  .doc-pdf {
    width: 100%;
    height: 70vh;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
  }
  .err {
    color: #b91c1c;
  }
  .binary p {
    margin: 6px 0;
  }
</style>
