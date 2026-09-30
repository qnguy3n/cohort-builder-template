<script lang="ts">
  import type { ClinicalKind } from '$lib/types';

  export let kind: ClinicalKind;
  export let size = 26;

  // color + lucide-style icon path per clinical event kind
  const META: Record<ClinicalKind, { color: string; label: string }> = {
    lab: { color: '#2563eb', label: 'Lab result' },
    medication: { color: '#7c3aed', label: 'Medication' },
    diagnosis: { color: '#dc2626', label: 'Diagnosis' },
    procedure: { color: '#0d9488', label: 'Procedure' },
    note: { color: '#16a34a', label: 'Clinical note' },
    encounter: { color: '#ea580c', label: 'Visit' },
    allergy: { color: '#b45309', label: 'Allergy' }
  };
  $: meta = META[kind] ?? META.note;
</script>

<span class="ti" style="--c: {meta.color}; width: {size}px; height: {size}px;" title={meta.label} aria-label={meta.label}>
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    {#if kind === 'lab'}
      <!-- flask / test -->
      <path d="M9 3h6" /><path d="M10 3v6.5L5.5 18a2 2 0 0 0 1.8 3h9.4a2 2 0 0 0 1.8-3L14 9.5V3" /><path d="M7.5 14h9" />
    {:else if kind === 'medication'}
      <!-- pill -->
      <rect x="3.5" y="8" width="17" height="8" rx="4" transform="rotate(45 12 12)" /><path d="M8.5 8.5l7 7" />
    {:else if kind === 'diagnosis'}
      <!-- pulse / activity -->
      <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
    {:else if kind === 'procedure'}
      <!-- syringe -->
      <path d="m18 2 4 4" /><path d="m17 7 3-3" /><path d="M19 9 8.7 19.3a2 2 0 0 1-2.8 0l-1.2-1.2a2 2 0 0 1 0-2.8L15 5" /><path d="m9 11 2 2" /><path d="m6 14 3 3" />
    {:else if kind === 'note'}
      <!-- file-text -->
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="M8 13h8" /><path d="M8 17h6" />
    {:else if kind === 'encounter'}
      <!-- calendar visit -->
      <rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /><path d="m9 16 2 2 4-4" />
    {:else if kind === 'allergy'}
      <!-- alert triangle -->
      <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /><path d="M12 9v4" /><path d="M12 17h.01" />
    {/if}
  </svg>
</span>

<style>
  .ti {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    color: var(--c);
    background: color-mix(in oklab, var(--c) 14%, white);
    border: 1px solid color-mix(in oklab, var(--c) 30%, white);
    flex: none;
  }
  .ti svg {
    width: 62%;
    height: 62%;
  }
</style>
