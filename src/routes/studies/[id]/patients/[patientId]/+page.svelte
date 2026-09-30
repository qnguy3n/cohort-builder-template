<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import { studies } from '$lib/studies';
  import { irbCleared } from '$lib/irb';
  import { activeHospital, HOSPITAL_BY_ID, isLiveHospital } from '$lib/hospitals';
  import { SPONSOR_VIEW_ID } from '$lib/types';
  import { decisions, studyDecisions, type Decision } from '$lib/decisions';
  import { CUIS, cuiLabel, CUI_BY_ID } from '$lib/cui';
  import { canonicalizeCuis } from '$lib/ontology';
  import CuiHoverTip from '$lib/components/CuiHoverTip.svelte';
  import ExtractedCuis from '$lib/components/ExtractedCuis.svelte';
  import EncounterTimeline from '$lib/components/EncounterTimeline.svelte';
  import RawDocument from '$lib/components/RawDocument.svelte';
  import {
    getSummaryByPatientId,
    getFullPatient,
    patientsLoading,
    PATIENTS_TOTAL
  } from '$lib/patients';
  import { fmtDate, fmtMonthYear } from '$lib/clinicalDate';
  import type { ClinicalNote, TimelineEvent, ClinicalKind, LiveFullRecord } from '$lib/types';

  $: studyId = $page.params.id ?? '';
  $: patientId = $page.params.patientId ?? '';

  // Sponsor mode never sees patient detail — bounce back to study
  $: if ($activeHospital === SPONSOR_VIEW_ID) {
    goto(`/studies/${studyId}`, { replaceState: true });
  }

  $: study = $studies.find((s) => s.id === studyId);

  $: summary = !$patientsLoading ? getSummaryByPatientId(patientId) : null;

  // Live (real-EHR) patients NEVER use mock data. Mock patients keep generated data.
  $: isLive = summary ? isLiveHospital(summary.hospitalId) : false;
  $: full = !$patientsLoading && summary && !isLive ? getFullPatient(summary.index) : null;

  // Real bundle-derived record for live patients (fetched from the server).
  let liveFull: LiveFullRecord | null = null;
  let liveFullLoading = false;
  let liveFullError: string | null = null;
  let liveFetchedFor = '';
  $: if (isLive && summary && summary.patientId !== liveFetchedFor) {
    loadLiveFull(summary.patientId, summary.hospitalId);
  }

  async function loadLiveFull(pid: string, hid: string) {
    liveFetchedFor = pid;
    liveFull = null;
    liveFullError = null;
    liveFullLoading = true;
    try {
      const res = await fetch(
        `/api/live/full?patientId=${encodeURIComponent(pid)}&hospitalId=${encodeURIComponent(hid)}`
      );
      if (!res.ok) throw new Error(`(${res.status}) ${await res.text()}`);
      liveFull = await res.json();
    } catch (e) {
      liveFullError = e instanceof Error ? e.message : 'Failed to load record';
    } finally {
      liveFullLoading = false;
    }
  }

  type TLRow = {
    kind: ClinicalKind;
    id: string;
    date: string | null;
    title: string;
    detail?: string | null;
    value?: string | number | null;
    units?: string | null;
    flag?: string | null;
    docId?: string | null;
    cuis?: { cui: string; label: string }[];
    body?: string | null;
  };

  function normalizeMockEvent(e: TimelineEvent): TLRow {
    if (e.kind === 'note')
      return { kind: 'note', id: e.id, date: e.date, title: e.noteType, detail: e.author };
    if (e.kind === 'lab')
      return { kind: 'lab', id: e.id, date: e.date, title: e.name, value: e.value, units: e.units, flag: e.flag ?? null };
    return { kind: 'encounter', id: e.id, date: e.date, title: e.type, detail: e.reason };
  }

  // Real bundle events for live (notes carry their extracted CUIs + body for the
  // click-through; meds contribute prescribe + stop events), mock for mock.
  function buildLiveTimeline(lf: LiveFullRecord | null): TLRow[] {
    if (!lf) return [];
    const out: TLRow[] = [];
    lf.notes.forEach((n, i) =>
      out.push({
        kind: 'note',
        id: `n-${n.docId ?? i}`,
        date: n.date,
        title: n.title,
        docId: n.docId,
        cuis: noteCuisFor(n.docId),
        body: n.body
      })
    );
    lf.medications.forEach((m, i) => {
      if (m.start) out.push({ kind: 'medication', id: `rxs-${i}`, date: m.start, title: m.display, detail: m.dosage ? `prescribed · ${m.dosage}` : 'prescribed' });
      if (m.end) out.push({ kind: 'medication', id: `rxe-${i}`, date: m.end, title: `${m.display} — stopped` });
    });
    lf.procedures.forEach((p, i) => out.push({ kind: 'procedure', id: `pr-${i}`, date: p.date, title: p.display }));
    lf.conditions.forEach((c, i) => out.push({ kind: 'diagnosis', id: `dx-${i}`, date: c.onsetDate, title: c.display, detail: c.status }));
    return out;
  }

  $: tl = isLive ? buildLiveTimeline(liveFull) : (full?.timeline ?? []).map(normalizeMockEvent);

  $: studyDec = studyDecisions(studyId);
  $: decision = summary ? ($studyDec[String(summary.index)] ?? null) : null;

  // Patient match diagnostics — does this patient satisfy the study's CUIs?
  // Canonicalize study CUIs so legacy mock codes line up with the patient's
  // canonical (ontology) coding.
  $: cuiSet = summary ? new Set(summary.cuis) : new Set<string>();
  $: incCuis = study ? canonicalizeCuis(study.inclusionCuis) : [];
  $: excCuis = study ? canonicalizeCuis(study.exclusionCuis) : [];
  $: incHits = incCuis.filter((c) => cuiSet.has(c));
  $: incMisses = incCuis.filter((c) => !cuiSet.has(c));
  $: excHits = excCuis.filter((c) => cuiSet.has(c));
  $: excMisses = excCuis.filter((c) => !cuiSet.has(c));

  // Study-agnostic view (opened from the patient list): every published study
  // this patient matches. Shown as a collapsed "Matched against N studies"
  // accordion instead of a single study's decision panel.
  let studiesAccordionOpen = false;
  $: matchedStudies = !$patientsLoading && summary
    ? $studies.filter((s) => {
        if (!s.published) return false;
        if (s.patientStatus !== 'either' && s.patientStatus !== summary.status) return false;
        const set = new Set(summary.cuis);
        if (!canonicalizeCuis(s.inclusionCuis).every((c) => set.has(c))) return false;
        if (canonicalizeCuis(s.exclusionCuis).some((c) => set.has(c))) return false;
        return true;
      })
    : [];

  function setDecision(d: Decision) {
    if (!summary) return;
    decisions.set(studyId, summary.index, d);
  }

  function clearDecision() {
    if (!summary) return;
    decisions.clear(studyId, summary.index);
  }

  // Per-note extracted CUIs (live patients): docId -> [{cui,label}], from the
  // CUI evidence provenance. Drives the per-note "Extracted (N)" + chip list.
  $: noteCuisByDoc = (() => {
    const m = new Map<string, { cui: string; label: string }[]>();
    for (const d of summary?.cuiDetail ?? []) {
      for (const ev of d.evidence ?? []) {
        if (ev.kind === 'note' && ev.docId) {
          const arr = m.get(ev.docId) ?? [];
          if (!arr.some((x) => x.cui === d.cui)) arr.push({ cui: d.cui, label: d.label });
          m.set(ev.docId, arr);
        }
      }
    }
    return m;
  })();
  // Total distinct concepts extracted from notes across the whole record.
  $: totalNoteCuis = new Set(
    (summary?.cuiDetail ?? []).filter((d) => d.source === 'unstructured').map((d) => d.cui)
  ).size;
  const noteCuisFor = (docId: string | null) => (docId ? noteCuisByDoc.get(docId) ?? [] : []);

  // All extracted spans for a document (across every CUI) → highlight in the modal.
  function docHighlights(docId: string | null) {
    if (!docId) return [];
    const out: { start: number; end: number; label?: string }[] = [];
    for (const r of summary?.cuiDetail ?? []) {
      for (const ev of r.evidence ?? []) {
        if (ev.kind === 'note' && ev.docId === docId && ev.start != null && ev.end != null) {
          out.push({ start: ev.start, end: ev.end, label: r.label });
        }
      }
    }
    return out;
  }

  $: noteCount = isLive ? liveFull?.notes.length ?? 0 : full?.notes.length ?? 0;
  $: notesTotalExtracted = isLive
    ? totalNoteCuis
    : new Set((full?.notes ?? []).flatMap((n) => n.extractedCuis)).size;

  let notesOpen = true;
  let docsOpen = false;
  let clinOpen = false;
  // Document library modal (open any source doc — text/pdf/image).
  let libDoc: { docId: string; title: string } | null = null;
  const docKindLabel: Record<string, string> = { text: 'Text', pdf: 'PDF', image: 'Image', other: 'File' };

  // Render note body with CUI labels highlighted as <mark> spans.
  function highlightNote(body: string, cuis: string[]): string {
    let html = escapeHtml(body);
    // Sort longest-first so we don't truncate substrings
    const labels = cuis
      .map((c) => ({ cui: c, label: CUI_BY_ID.get(c)?.label }))
      .filter((x): x is { cui: string; label: string } => !!x.label)
      .sort((a, b) => b.label.length - a.label.length);
    for (const { cui, label } of labels) {
      const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(`\\b(${escapedLabel})\\b`, 'gi');
      html = html.replace(
        re,
        `<mark class="cui-mark" data-cui="${cui}" title="${escapeAttr(cui + ' · ' + label)}">$1</mark>`
      );
    }
    return html.replace(/\n/g, '<br/>');
  }

  function escapeHtml(s: string): string {
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
  function escapeAttr(s: string): string {
    return escapeHtml(s).replace(/"/g, '&quot;');
  }

</script>

{#if $patientsLoading}
  <div class="loading">
    <div class="spinner"></div>
    <p class="muted">Loading patient index for {PATIENTS_TOTAL.toLocaleString()} records…</p>
  </div>
{:else if !summary}
  <div class="empty">
    <a href="/patients" class="back">← Back to patients</a>
    <h1>Patient not found</h1>
    <p class="muted">No patient with id <code>{patientId}</code>.</p>
  </div>
{:else if summary}
  <div class="page-header">
    {#if study}
      <a href="/studies/{studyId}" class="back">← {study.name}</a>
    {:else}
      <a href="/patients" class="back">← Back to patients</a>
    {/if}
    <div class="title-row">
      <div>
        {#if $irbCleared}
          <h1>{summary.firstName} {summary.lastName}</h1>
          <p class="patient-meta muted">
            <span class="mono">{summary.patientId}</span>
            <span class="dot-sep">·</span>
            MRN <span class="mono">{summary.mrn}</span>
            <span class="dot-sep">·</span>
            {summary.age}{summary.gender === 'female' ? 'F' : 'M'}
            <span class="dot-sep">·</span>
            {summary.race}, {summary.ethnicity}
            <span class="dot-sep">·</span>
            <span class="mono">{summary.zip}</span>
            <span class="dot-sep">·</span>
            {HOSPITAL_BY_ID.get(summary.hospitalId)?.shortName}
          </p>
        {:else}
          <h1 class="mono mono-title">{summary.patientId}</h1>
          <p class="patient-meta muted">
            {summary.age}{summary.gender === 'female' ? 'F' : 'M'}
            <span class="dot-sep">·</span>
            {summary.race}, {summary.ethnicity}
            <span class="dot-sep">·</span>
            <span class="mono">{summary.zip}</span>
            <span class="dot-sep">·</span>
            {HOSPITAL_BY_ID.get(summary.hospitalId)?.shortName}
            <span class="dot-sep">·</span>
            <span class="phi-note">PHI hidden — toggle IRB clearance to view name & MRN</span>
          </p>
        {/if}
      </div>
    </div>
  </div>

  {#if !study}
    <!-- Study-agnostic (opened from the patient list): which studies this
         patient matches, collapsed by default. -->
    <section class="matched-studies">
      <button
        class="ms-head"
        on:click={() => (studiesAccordionOpen = !studiesAccordionOpen)}
        aria-expanded={studiesAccordionOpen}
      >
        <span class="ms-chev" class:open={studiesAccordionOpen}>▸</span>
        Matched against <strong>{matchedStudies.length}</strong>
        stud{matchedStudies.length === 1 ? 'y' : 'ies'}
      </button>
      {#if studiesAccordionOpen}
        <ul class="ms-list">
          {#each matchedStudies as s}
            <li>
              <a href="/studies/{s.id}/patients/{patientId}">{s.name}</a>
              <a class="ms-study-link" href="/studies/{s.id}" title="Open study">↗</a>
            </li>
          {:else}
            <li class="muted small">No matching studies for this patient.</li>
          {/each}
        </ul>
      {/if}
    </section>
  {:else}
  <!-- Decision panel: review for this study -->
  <section class="decision-panel" class:decided={decision}>
    <div class="decision-header">
      <div>
        <div class="muted small">Reviewing for</div>
        <div class="study-name">{study.name}</div>
      </div>
      {#if decision}
        <span class="decision-pill decision-{decision}">{decision}</span>
      {/if}
    </div>

    <div class="match-summary">
      <div class="match-cell">
        <div class="match-num good">{incHits.length}/{incCuis.length}</div>
        <div class="muted small">inclusion CUIs met</div>
      </div>
      <div class="match-cell">
        <div class="match-num" class:bad={excHits.length > 0}>{excHits.length}</div>
        <div class="muted small">exclusion CUIs hit</div>
      </div>
      <div class="match-cell wide">
        <div class="muted small">Inclusion</div>
        <div class="cui-list">
          {#each incHits as c}
            <CuiHoverTip cui={c} selectedCuis={study.inclusionCuis}>
              <span class="cui-tag inc-hit">✓ {cuiLabel(c)}</span>
            </CuiHoverTip>
          {/each}
          {#each incMisses as c}
            <CuiHoverTip cui={c} selectedCuis={study.inclusionCuis}>
              <span class="cui-tag inc-miss">✗ {cuiLabel(c)}</span>
            </CuiHoverTip>
          {/each}
        </div>
      </div>
      {#if study.exclusionCuis.length > 0}
        <div class="match-cell wide">
          <div class="muted small">Exclusion</div>
          <div class="cui-list">
            {#each excHits as c}
              <CuiHoverTip cui={c} selectedCuis={study.exclusionCuis}>
                <span class="cui-tag exc-hit">⚠ {cuiLabel(c)}</span>
              </CuiHoverTip>
            {/each}
            {#each excMisses as c}
              <CuiHoverTip cui={c} selectedCuis={study.exclusionCuis}>
                <span class="cui-tag exc-miss">{cuiLabel(c)}</span>
              </CuiHoverTip>
            {/each}
          </div>
        </div>
      {/if}
    </div>

    <div class="decision-actions">
      <span class="muted small">
        {decision ? 'Change decision:' : 'After reviewing notes, record a decision:'}
      </span>
      <button
        class="btn btn-decision accept"
        class:active={decision === 'accepted'}
        on:click={() => setDecision('accepted')}
      >
        ✓ Accept
      </button>
      <button
        class="btn btn-decision reject"
        class:active={decision === 'rejected'}
        on:click={() => setDecision('rejected')}
      >
        ✕ Reject
      </button>
      <button
        class="btn btn-decision watch"
        class:active={decision === 'watchlisted'}
        on:click={() => setDecision('watchlisted')}
      >
        <svg class="dec-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <circle cx="12" cy="13" r="8" />
          <path d="M12 9v4l2.5 1.5" />
          <path d="M9 3h6" />
        </svg>
        Watchlist
      </button>
      {#if decision}
        <button class="btn btn-decision unreview" on:click={clearDecision}>
          ↺ Unreview
        </button>
      {/if}
    </div>
  </section>
  {/if}

  <!-- Horizontal encounter timeline (relative time) -->
  <section class="timeline-band">
    <div class="tb-head">
      <h2>Timeline</h2>
      <span class="muted small">encounters &amp; matched notes, most recent at right</span>
    </div>
    {#if isLive && liveFullLoading}
      <p class="muted small">Loading clinical record…</p>
    {:else if isLive && liveFullError}
      <p class="muted small">Could not load record: {liveFullError}</p>
    {:else}
      <EncounterTimeline
        events={tl}
        irbCleared={$irbCleared}
        on:viewDoc={(ev) => ($irbCleared && (libDoc = ev.detail))}
      />
    {/if}
  </section>

  <!-- Primary: extracted concepts + provenance (replaces the raw notes list) -->
  <div class="detail-main">
    {#if summary}
      <ExtractedCuis
        cuis={summary.cuis}
        detail={summary.cuiDetail}
        patientId={summary.patientId}
        hospitalId={summary.hospitalId}
        irbCleared={$irbCleared}
      />
    {/if}

    {#if isLive && liveFull}
      <!-- Document library: open any source doc (text / pdf / image) in a modal -->
      <section class="section-card">
        <button class="sc-head" on:click={() => (docsOpen = !docsOpen)} aria-expanded={docsOpen}>
          <span class="ms-chev" class:open={docsOpen}>▸</span>
          <h2 class="sc-title">Documents</h2>
          <span class="sc-pill">{liveFull.documents.length}</span>
        </button>
        {#if docsOpen}
          {#if !$irbCleared}
            <p class="muted small sc-empty">
              🔒 {liveFull.documents.length} document{liveFull.documents.length === 1 ? '' : 's'} —
              enable IRB clearance to view source documents (they may contain PHI).
            </p>
          {:else if liveFull.documents.length}
            <ul class="doc-list">
              {#each liveFull.documents as d (d.docId ?? d.title)}
                <li>
                  <button
                    class="doc-row"
                    on:click={() => d.docId && (libDoc = { docId: d.docId, title: d.title })}
                  >
                    <span class="doc-kind k-{d.kind}">{docKindLabel[d.kind] ?? 'File'}</span>
                    <span class="doc-title">{d.title}</span>
                    {#if d.date}<span class="doc-date muted small">{fmtDate(d.date)}</span>{/if}
                    <span class="doc-open">open ↗</span>
                  </button>
                </li>
              {/each}
            </ul>
          {:else}
            <p class="muted small sc-empty">No documents in source data.</p>
          {/if}
        {/if}
      </section>

      <!-- Medications · Vaccinations · Allergies (collapsed to start) -->
      <section class="section-card">
        <button class="sc-head" on:click={() => (clinOpen = !clinOpen)} aria-expanded={clinOpen}>
          <span class="ms-chev" class:open={clinOpen}>▸</span>
          <h2 class="sc-title">Medications · Vaccinations · Allergies</h2>
          <span class="sc-pill">{liveFull.medications.length + liveFull.allergies.length}</span>
        </button>
        {#if clinOpen}
          <div class="clin-group">
            <div class="clin-h">Medications ({liveFull.medications.length})</div>
            {#if liveFull.medications.length}
              <ul class="clin-list">
                {#each liveFull.medications as m}
                  <li>
                    <span class="clin-name">{m.display}</span>
                    {#if m.dosage}<span class="muted small">· {m.dosage}</span>{/if}
                    {#if m.start || m.end}<span class="muted small">· {m.start ? fmtDate(m.start) : '?'}{m.end ? ` – ${fmtDate(m.end)}` : ''}</span>{/if}
                  </li>
                {/each}
              </ul>
            {:else}<p class="muted small">None in source.</p>{/if}
          </div>
          <div class="clin-group">
            <div class="clin-h">Vaccinations (0)</div>
            <p class="muted small">No vaccination records in source data.</p>
          </div>
          <div class="clin-group">
            <div class="clin-h">Allergies ({liveFull.allergies.length})</div>
            {#if liveFull.allergies.length}
              <ul class="clin-list">
                {#each liveFull.allergies as a}
                  <li>
                    <span class="clin-name">{a.substance}</span>
                    {#if a.reaction}<span class="muted small">· {a.reaction}</span>{/if}
                  </li>
                {/each}
              </ul>
            {:else}<p class="muted small">No allergies recorded.</p>{/if}
          </div>
        {/if}
      </section>
    {/if}

      <h2 class="labs-h2">Recent labs</h2>
      {#if isLive}
        {#if liveFullLoading}
          <p class="muted small">Loading labs…</p>
        {:else if liveFull && liveFull.labs.length}
          <div class="labs-table">
            <div class="labs-head">
              <div>Date</div>
              <div>Test</div>
              <div class="num">Value</div>
              <div>Reference</div>
            </div>
            {#each liveFull.labs.slice(0, 30) as lab (lab.code ?? lab.name)}
              <div class="labs-row" class:abnormal={lab.flag === 'H' || lab.flag === 'L'}>
                <div class="muted">{lab.date ? fmtDate(lab.date) : '—'}</div>
                <div>{lab.name}</div>
                <div class="num">
                  <strong>{lab.value}</strong> {lab.unit ?? ''}
                  {#if lab.flag === 'H'}<span class="flag flag-h">H</span>{/if}
                  {#if lab.flag === 'L'}<span class="flag flag-l">L</span>{/if}
                </div>
                <div class="muted small">{lab.refRange ?? ''}</div>
              </div>
            {/each}
          </div>
        {:else}
          <p class="muted small">No lab results in source data.</p>
        {/if}
      {:else if full}
        <div class="labs-table">
          <div class="labs-head">
            <div>Date</div>
            <div>Test</div>
            <div class="num">Value</div>
            <div>Reference</div>
          </div>
          {#each full.labs.slice(0, 14) as lab (lab.id)}
            <div class="labs-row" class:abnormal={lab.flag === 'H' || lab.flag === 'L'}>
              <div class="muted">{fmtDate(lab.date)}</div>
              <div>{lab.name}</div>
              <div class="num">
                <strong>{lab.value}</strong> {lab.units}
                {#if lab.flag === 'H'}<span class="flag flag-h">H</span>{/if}
                {#if lab.flag === 'L'}<span class="flag flag-l">L</span>{/if}
              </div>
              <div class="muted small">
                {#if lab.refLow != null && lab.refHigh != null}
                  {lab.refLow}–{lab.refHigh} {lab.units}
                {/if}
              </div>
            </div>
          {/each}
        </div>
      {/if}
  </div>

  {#if libDoc && summary && $irbCleared}
    <RawDocument
      patientId={summary.patientId}
      hospitalId={summary.hospitalId}
      docId={libDoc.docId}
      title={libDoc.title}
      highlights={docHighlights(libDoc.docId)}
      on:close={() => (libDoc = null)}
    />
  {/if}
{/if}

<style>
  .loading,
  .empty {
    background: var(--bg-surface);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-lg);
    padding: var(--space-12);
    text-align: center;
  }
  .spinner {
    width: 28px;
    height: 28px;
    border: 3px solid var(--border-subtle);
    border-top-color: var(--brand);
    border-radius: 50%;
    animation: spin 0.9s linear infinite;
    margin: 0 auto var(--space-3);
  }
  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .page-header {
    margin-bottom: var(--space-5);
  }
  .back {
    display: inline-block;
    margin-bottom: var(--space-2);
    font-size: var(--text-sm);
    color: var(--fg-muted);
  }
  .title-row {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    gap: var(--space-3);
  }
  .page-header h1 {
    font-family: var(--font-display);
    font-size: var(--text-2xl);
    margin: 0;
  }
  .mono-title {
    font-family: var(--font-mono);
    font-weight: 600;
    font-size: var(--text-xl);
  }
  .patient-meta {
    margin: 4px 0 0;
    font-size: var(--text-sm);
  }
  .dot-sep {
    margin: 0 6px;
    opacity: 0.4;
  }
  .phi-note {
    color: var(--warning-700);
    font-style: italic;
  }
  .mono {
    font-family: var(--font-mono);
  }
  .small {
    font-size: var(--text-xs);
  }

  /* Decision panel */
  .decision-panel {
    background: var(--bg-surface);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-lg);
    padding: var(--space-4) var(--space-5);
    margin-bottom: var(--space-5);
    box-shadow: var(--shadow-xs);
    border-left: 4px solid var(--brand);
  }
  .decision-panel.decided {
    border-left-color: var(--neutral-300);
    background: var(--bg-sunken);
  }

  .decision-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--space-3);
    margin-bottom: var(--space-3);
  }
  .study-name {
    font-family: var(--font-display);
    font-weight: 600;
    font-size: var(--text-md);
  }

  .match-summary {
    display: grid;
    grid-template-columns: auto auto 1fr 1fr;
    gap: var(--space-4);
    align-items: start;
    padding: var(--space-3) 0;
    border-top: 1px solid var(--border-subtle);
    border-bottom: 1px solid var(--border-subtle);
  }
  .match-cell.wide {
    min-width: 0;
  }
  .match-num {
    font-family: var(--font-display);
    font-size: var(--text-xl);
    font-weight: 700;
    line-height: 1;
    color: var(--fg-default);
    font-variant-numeric: tabular-nums;
  }
  .match-num.good {
    color: var(--success-700);
  }
  .match-num.bad {
    color: var(--danger-700);
  }

  .cui-list {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-top: 4px;
  }
  .cui-tag {
    display: inline-block;
    padding: 2px 8px;
    border-radius: var(--radius-sm);
    font-size: var(--text-xs);
    font-weight: 500;
  }
  .cui-tag.inc-hit {
    background: var(--success-50);
    color: var(--success-700);
  }
  .cui-tag.inc-miss {
    background: var(--bg-sunken);
    color: var(--fg-subtle);
    text-decoration: line-through;
  }
  .cui-tag.exc-hit {
    background: var(--danger-50);
    color: var(--danger-700);
  }
  .cui-tag.exc-miss {
    background: var(--bg-sunken);
    color: var(--fg-subtle);
  }

  .decision-actions {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin-top: var(--space-3);
    flex-wrap: wrap;
  }
  .btn-decision {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    border: 1px solid var(--border-subtle);
    background: var(--bg-surface);
    padding: 6px 14px;
    border-radius: var(--radius-md);
    font-size: var(--text-sm);
    font-weight: 600;
    cursor: pointer;
    transition: all 0.12s ease;
  }
  .dec-icon {
    width: 14px;
    height: 14px;
    flex-shrink: 0;
  }
  .btn-decision.accept {
    color: var(--success-700);
    background: var(--success-50);
    border-color: transparent;
  }
  .btn-decision.accept:hover,
  .btn-decision.accept.active {
    background: var(--success-700);
    color: white;
  }
  .btn-decision.reject {
    color: var(--danger-700);
    background: var(--danger-50);
    border-color: transparent;
  }
  .btn-decision.reject:hover,
  .btn-decision.reject.active {
    background: var(--danger-700);
    color: white;
  }
  .btn-decision.watch {
    color: var(--warning-700);
    background: var(--warning-50);
    border-color: transparent;
  }
  .btn-decision.watch:hover,
  .btn-decision.watch.active {
    background: var(--warning-500);
    color: white;
  }
  .btn-decision.unreview {
    color: var(--fg-muted);
    background: var(--bg-sunken);
    border-color: var(--border-subtle);
    margin-left: auto;
  }
  .btn-decision.unreview:hover {
    background: var(--neutral-200);
    color: var(--fg-default);
  }

  .decision-pill {
    display: inline-block;
    padding: 4px 12px;
    border-radius: var(--radius-full);
    font-size: var(--text-xs);
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .decision-accepted {
    background: var(--success-50);
    color: var(--success-700);
  }
  .decision-rejected {
    background: var(--danger-50);
    color: var(--danger-700);
  }
  .decision-watchlisted {
    background: var(--warning-50);
    color: var(--warning-700);
  }

  /* Two column layout */
  .detail-main {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .src-note {
    margin: 2px 0 var(--space-2);
  }

  /* Consistent collapsible card sections */
  .section-card {
    background: var(--bg-surface, #fff);
    border: 1px solid var(--border-subtle, #e5e7eb);
    border-radius: var(--radius-lg, 12px);
    box-shadow: var(--shadow-xs);
    overflow: hidden;
  }
  .sc-head {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    width: 100%;
    background: var(--bg-sunken, #f8fafc);
    border: none;
    padding: 12px 14px;
    cursor: pointer;
    text-align: left;
    font-family: inherit;
  }
  .sc-title {
    font-family: var(--font-display);
    font-size: var(--text-md);
    font-weight: 600;
    margin: 0;
  }
  .sc-pill {
    font-size: var(--text-2xs);
    font-weight: 700;
    padding: 1px 8px;
    border-radius: 999px;
    background: #e0e7ff;
    color: #3730a3;
  }
  .sc-empty {
    padding: 12px 14px;
  }
  .doc-list,
  .clin-list {
    list-style: none;
    margin: 0;
    padding: 6px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .doc-row {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    background: none;
    border: none;
    padding: 7px 8px;
    border-radius: 7px;
    cursor: pointer;
    font-family: inherit;
    text-align: left;
  }
  .doc-row:hover {
    background: var(--bg-sunken, #f1f5f9);
  }
  .doc-kind {
    flex: none;
    font-size: 0.62rem;
    font-weight: 800;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    padding: 2px 6px;
    border-radius: 4px;
    width: 44px;
    text-align: center;
  }
  .k-text {
    background: #dcfce7;
    color: #166534;
  }
  .k-pdf {
    background: #fee2e2;
    color: #991b1b;
  }
  .k-image {
    background: #e0e7ff;
    color: #3730a3;
  }
  .k-other {
    background: #f1f5f9;
    color: #475569;
  }
  .doc-title {
    flex: 1;
    font-size: 0.82rem;
    color: var(--fg-default, #1e293b);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .doc-date {
    flex: none;
  }
  .doc-open {
    flex: none;
    font-size: 0.7rem;
    color: #2563eb;
  }
  .clin-group {
    padding: 8px 14px 12px;
    border-top: 1px solid var(--border-subtle, #eef2f6);
  }
  .clin-h {
    font-size: 0.68rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--fg-muted, #94a3b8);
    font-weight: 700;
    margin-bottom: 4px;
  }
  .clin-list li {
    font-size: 0.82rem;
    padding: 2px 0;
  }
  .clin-name {
    color: var(--fg-default, #1e293b);
    font-weight: 500;
  }

  .detail-main h2 {
    font-family: var(--font-display);
    font-size: var(--text-lg);
    font-weight: 600;
    margin: var(--space-4) 0 var(--space-3);
  }

  /* Horizontal encounter timeline */
  .timeline-band {
    background: var(--bg-surface);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-lg);
    padding: var(--space-4) var(--space-5);
    margin-bottom: var(--space-5);
    box-shadow: var(--shadow-xs);
  }
  .tb-head {
    display: flex;
    align-items: baseline;
    gap: var(--space-3);
    margin-bottom: var(--space-2);
  }
  .tb-head h2 {
    font-family: var(--font-display);
    font-size: var(--text-lg);
    font-weight: 600;
    margin: 0;
  }

  /* Notes accordion */
  .notes-acc-head {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    width: 100%;
    background: none;
    border: none;
    padding: 0 0 var(--space-2);
    cursor: pointer;
    text-align: left;
    font-family: inherit;
  }
  .notes-acc-title {
    font-family: var(--font-display);
    font-size: var(--text-lg);
    font-weight: 600;
    margin: 0;
  }
  .notes-pill {
    font-size: var(--text-2xs);
    font-weight: 700;
    padding: 2px 9px;
    border-radius: var(--radius-full);
    background: var(--bg-sunken, #f1f5f9);
    color: var(--fg-muted, #64748b);
  }
  .notes-pill.extracted {
    background: var(--brand-soft);
    color: var(--sage-800);
  }
  .note-head-main {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
  }
  .note-cuis {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-top: 4px;
  }
  .extracted-count {
    flex: none;
    font-size: var(--text-2xs);
    font-weight: 700;
    color: var(--fg-muted, #64748b);
    white-space: nowrap;
  }
  .dup-badge {
    margin-left: 6px;
    padding: 1px 6px;
    border-radius: var(--radius-full);
    background: var(--bg-sunken, #f1f5f9);
    color: var(--fg-muted, #64748b);
    font-weight: 600;
  }

  .flag {
    display: inline-block;
    margin-left: 4px;
    padding: 0 5px;
    border-radius: var(--radius-xs);
    font-family: var(--font-mono);
    font-size: var(--text-2xs);
    font-weight: 700;
  }
  .flag-h {
    background: var(--danger-50);
    color: var(--danger-700);
  }
  .flag-l {
    background: var(--info-50);
    color: var(--info-700);
  }

  /* Notes */
  .notes-help {
    margin: 0 0 var(--space-4);
    line-height: var(--leading-relaxed);
    max-width: 64ch;
  }
  .note {
    background: var(--bg-surface);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-lg);
    padding: var(--space-4) var(--space-5);
    margin-bottom: var(--space-3);
    box-shadow: var(--shadow-xs);
  }
  .note-head {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: var(--space-3);
    padding-bottom: var(--space-3);
    margin-bottom: var(--space-3);
    border-bottom: 1px solid var(--border-subtle);
  }
  .note-type {
    font-family: var(--font-display);
    font-weight: 600;
    font-size: var(--text-md);
  }
  .extracted-cuis {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    align-items: center;
    max-width: 60%;
    justify-content: flex-end;
  }
  .cui-chip {
    display: inline-block;
    padding: 2px 8px;
    background: var(--brand-soft);
    color: var(--sage-800);
    border-radius: var(--radius-sm);
    font-size: var(--text-2xs);
    font-weight: 600;
  }
  .note-body {
    font-family: var(--font-sans);
    font-size: var(--text-sm);
    line-height: var(--leading-relaxed);
    color: var(--fg-default);
  }
  :global(.cui-mark) {
    background: var(--brand-soft);
    color: var(--sage-900);
    padding: 0 3px;
    border-radius: 3px;
    font-weight: 500;
    cursor: help;
    border-bottom: 1px dashed var(--sage-700);
  }

  /* Labs */
  .labs-h2 {
    margin-top: var(--space-6) !important;
  }
  .labs-table {
    background: var(--bg-surface);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-lg);
    overflow: hidden;
  }
  .labs-head,
  .labs-row {
    display: grid;
    grid-template-columns: 110px 1fr 1.2fr 1fr;
    gap: var(--space-3);
    padding: 8px var(--space-4);
    align-items: center;
    font-size: var(--text-sm);
  }
  .labs-head {
    background: var(--bg-sunken);
    border-bottom: 1px solid var(--border-subtle);
    font-size: var(--text-2xs);
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--fg-muted);
  }
  .labs-row {
    border-bottom: 1px solid var(--border-subtle);
  }
  .labs-row:last-child {
    border-bottom: none;
  }
  .labs-row.abnormal {
    background: rgba(255, 246, 235, 0.4);
  }
  .num {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  @media (max-width: 980px) {
    .detail-grid {
      grid-template-columns: 1fr;
    }
    .match-summary {
      grid-template-columns: 1fr 1fr;
    }
    .extracted-cuis {
      max-width: 100%;
      justify-content: flex-start;
    }
  }

  /* Study-agnostic "Matched against N studies" accordion (patient-list entry) */
  .matched-studies {
    margin: 0 0 var(--space-4, 16px);
    border: 1px solid var(--border-subtle, #e5e7eb);
    border-radius: 10px;
    overflow: hidden;
    background: var(--bg-surface, #fff);
  }
  .ms-head {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 12px 14px;
    background: var(--bg-sunken, #f8fafc);
    border: none;
    cursor: pointer;
    font-family: inherit;
    font-size: 0.9rem;
    text-align: left;
  }
  .ms-chev {
    transition: transform 0.12s ease;
    color: var(--fg-muted, #94a3b8);
    font-size: 0.75rem;
  }
  .ms-chev.open {
    transform: rotate(90deg);
  }
  .ms-list {
    list-style: none;
    margin: 0;
    padding: 6px 14px 12px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .ms-list li {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .ms-list a {
    color: var(--accent-600, #4f46e5);
    text-decoration: none;
    font-size: 0.88rem;
  }
  .ms-list a:hover {
    text-decoration: underline;
  }
  .ms-study-link {
    color: var(--fg-muted, #94a3b8);
  }
</style>
