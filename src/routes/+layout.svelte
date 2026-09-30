<script lang="ts">
  import '../app.css';
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import {
    HOSPITALS, HOSPITAL_BY_ID, activeHospital, hospitalShortLabel,
    LIVE_HOSPITAL_ID, isLiveHospital
  } from '$lib/hospitals';
  import { SPONSOR_VIEW_ID } from '$lib/types';
  import { irbCleared } from '$lib/irb';
  import {
    liveUnlocked, unlockLive, lockLive, tryRestoreLive,
    bumpSession, clearSession, sessionRemainingMs, LIVE_IDLE_MS
  } from '$lib/liveStore';
  import { autofocus } from '$lib/actions/autofocus';
  import LiveStatusBanner from '$lib/components/LiveStatusBanner.svelte';

  $: pathname = $page.url.pathname;

  // Password gate for the live (real-EHR) institution.
  let showLiveModal = false;
  let livePassword = '';
  let liveError = '';
  let liveBusy = false;

  // --- Idle timeout for the live (PHI) session ---
  // Lock the institution after 15 minutes of inactivity; activity resets the
  // timer. The deadline is persisted (liveStore), so a refresh / navigation
  // within the window restores the session instead of re-prompting.
  const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart'];
  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  let lastActivity = 0;

  function clearIdleTimer() {
    if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
  }
  function armIdle(ms: number) {
    clearIdleTimer();
    idleTimer = setTimeout(onIdleTimeout, Math.max(0, ms));
  }
  async function onIdleTimeout() {
    await lockLive();
    if ($activeHospital === LIVE_HOSPITAL_ID) {
      liveError = 'Session locked after 15 minutes of inactivity — re-enter the password to continue.';
      livePassword = '';
      showLiveModal = true;
    }
  }
  function onActivity() {
    if (!$liveUnlocked) return;
    const now = Date.now();
    if (now - lastActivity < 1000) return; // throttle frequent mousemove/scroll
    lastActivity = now;
    bumpSession();          // extend the persisted deadline
    armIdle(LIVE_IDLE_MS);  // and the in-memory timer
  }
  // Stop the timer whenever we're locked.
  $: if (!$liveUnlocked) clearIdleTimer();

  onMount(() => {
    // If the live institution is the active tenant on load, restore the session
    // when the idle timer is still running (respecting it across refresh), else prompt.
    if ($activeHospital === LIVE_HOSPITAL_ID && !$liveUnlocked) {
      (async () => {
        const remaining = sessionRemainingMs();
        if (remaining > 0 && (await tryRestoreLive())) {
          armIdle(remaining); // continue the running timer, don't reset it
        } else {
          clearSession();
          showLiveModal = true;
        }
      })();
    }
    for (const ev of ACTIVITY_EVENTS) window.addEventListener(ev, onActivity, { passive: true });
    return () => {
      for (const ev of ACTIVITY_EVENTS) window.removeEventListener(ev, onActivity);
      clearIdleTimer();
    };
  });

  function handleHospitalChange(e: Event) {
    const target = e.target as HTMLSelectElement;
    const value = target.value;
    if (isLiveHospital(value)) {
      // ALWAYS require the password when (re)selecting the live institution.
      target.value = $activeHospital; // hold the dropdown until unlocked
      liveUnlocked.set(false);
      livePassword = '';
      liveError = '';
      showLiveModal = true;
      return;
    }
    // Leaving the live institution locks it (clears PHI + cookie) so returning re-prompts.
    void lockLive();
    activeHospital.set(value);
  }

  async function submitLivePassword() {
    if (liveBusy) return;
    liveBusy = true;
    liveError = '';
    const result = await unlockLive(livePassword);
    liveBusy = false;
    if (result.ok) {
      showLiveModal = false;
      livePassword = '';
      armIdle(LIVE_IDLE_MS); // start the 15-min idle countdown (session persisted in unlockLive)
      activeHospital.set(LIVE_HOSPITAL_ID);
    } else {
      liveError = result.error ?? 'Unlock failed';
    }
  }

  function cancelLiveModal() {
    showLiveModal = false;
    livePassword = '';
    liveError = '';
    // If the user backed out while the (locked) live institution was active,
    // fall back to a normal hospital so they aren't stranded on an empty tenant.
    if (!$liveUnlocked && $activeHospital === LIVE_HOSPITAL_ID) {
      activeHospital.set(HOSPITALS[0].id);
    }
  }

  $: isSponsor = $activeHospital === SPONSOR_VIEW_ID;
  $: activeHospitalRecord = isSponsor ? null : HOSPITAL_BY_ID.get($activeHospital) ?? null;
</script>

<div class="app">
  <header class="topbar">
    <a class="brand" href="/studies">
      <span class="dot"></span>
      Cohort Builder
    </a>

    <nav class="nav" class:nav-sponsor={isSponsor}>
      <a href="/studies" class:active={pathname.startsWith('/studies')}>Studies</a>
      {#if !isSponsor}
        <a href="/patients" class:active={pathname.startsWith('/patients')}>Patients</a>
      {/if}
    </nav>

    {#if !isSponsor}
      <button
        type="button"
        class="irb-toggle"
        class:on={$irbCleared}
        on:click={() => irbCleared.toggle()}
        title="Toggle IRB clearance (testing only). When on, patient names and MRN are shown for the active hospital tenant."
        aria-pressed={$irbCleared}
      >
        <span class="irb-dot"></span>
        IRB · {$irbCleared ? 'Cleared' : 'Off'}
      </button>
    {/if}

    <div class="tenant">
      <label for="hospital-switcher" class="tenant-label">Logged in as</label>
      <div class="select-wrap" class:has-pill={!!activeHospitalRecord}>
        <select
          id="hospital-switcher"
          class="tenant-select"
          class:sponsor={isSponsor}
          value={$activeHospital}
          on:change={handleHospitalChange}
        >
          <optgroup label="Hospital">
            {#each HOSPITALS.filter((h) => !isLiveHospital(h.id)) as h}
              <option value={h.id}>{h.shortName}</option>
            {/each}
          </optgroup>
          <optgroup label="Connected (live EHR)">
            {#each HOSPITALS.filter((h) => isLiveHospital(h.id)) as h}
              <option value={h.id}>🔒 {h.shortName}</option>
            {/each}
          </optgroup>
          <optgroup label="Sponsor">
            <option value={SPONSOR_VIEW_ID}>Sponsor view (all hospitals)</option>
          </optgroup>
        </select>
        {#if activeHospitalRecord}
          <span class="ehr-pill" title="EHR system of record">{activeHospitalRecord.ehr}</span>
        {/if}
      </div>
    </div>
  </header>

  {#if isLiveHospital($activeHospital)}
    <LiveStatusBanner />
  {/if}

  <main class="main">
    <slot></slot>
  </main>
</div>

{#if showLiveModal}
  <div class="live-overlay" role="dialog" aria-modal="true" aria-label="Institution password">
    <div class="live-modal">
      <h2>Daniel Franc MD PhD</h2>
      <p class="live-sub">This is a connected institution with real EHR data. Enter the access password to continue.</p>
      <form on:submit|preventDefault={submitLivePassword}>
        <input
          type="password"
          placeholder="Institution password"
          bind:value={livePassword}
          autocomplete="off"
          use:autofocus
        />
        {#if liveError}<p class="live-error">{liveError}</p>{/if}
        <div class="live-actions">
          <button type="button" class="ghost" on:click={cancelLiveModal} disabled={liveBusy}>Cancel</button>
          <button type="submit" class="primary" disabled={liveBusy || !livePassword}>
            {liveBusy ? 'Unlocking…' : 'Unlock'}
          </button>
        </div>
      </form>
    </div>
  </div>
{/if}

<style>
  .app {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
  }

  .topbar {
    display: flex;
    align-items: center;
    gap: var(--space-4);
    padding: 0 var(--space-6);
    height: 60px;
    background: var(--bg-surface);
    border-bottom: 1px solid var(--border-subtle);
    position: sticky;
    top: 0;
    z-index: 10;
    box-shadow: var(--shadow-xs);
  }

  .brand {
    margin-right: auto;
  }

  .nav {
    margin-right: auto;
  }

  .irb-toggle {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 5px 10px 5px 8px;
    border-radius: var(--radius-full);
    border: 1px solid var(--border-subtle);
    background: var(--bg-sunken);
    color: var(--fg-muted);
    font-family: inherit;
    font-size: var(--text-2xs);
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    cursor: pointer;
    transition: all 0.12s ease;
  }

  .irb-toggle:hover {
    border-color: var(--border-default);
  }

  .irb-toggle.on {
    background: var(--warning-50);
    border-color: var(--warning-100);
    color: var(--warning-700);
  }

  .irb-dot {
    width: 8px;
    height: 8px;
    border-radius: var(--radius-full);
    background: var(--neutral-400);
  }

  .irb-toggle.on .irb-dot {
    background: var(--warning-500);
    box-shadow: 0 0 0 3px rgba(217, 119, 6, 0.15);
  }

  .brand {
    display: inline-flex;
    align-items: center;
    gap: var(--space-3);
    font-family: var(--font-display);
    font-weight: 600;
    color: var(--fg-default);
    font-size: var(--text-md);
    letter-spacing: var(--tracking-tight);
  }

  .brand:hover {
    text-decoration: none;
  }

  .dot {
    width: 12px;
    height: 12px;
    border-radius: var(--radius-full);
    background: var(--brand);
    box-shadow: 0 0 0 3px var(--brand-soft);
  }

  .nav {
    display: flex;
    gap: var(--space-1);
    font-size: var(--text-sm);
    font-weight: 500;
    justify-self: center;
    background: var(--bg-sunken);
    padding: 3px;
    border-radius: var(--radius-md);
  }

  .nav :global(a) {
    color: var(--fg-muted);
    padding: 6px 14px;
    border-radius: var(--radius-sm);
    transition: all 0.12s ease;
  }

  .nav :global(a:hover) {
    color: var(--fg-default);
    text-decoration: none;
  }

  .nav :global(a.active) {
    color: var(--fg-default);
    background: var(--bg-surface);
    box-shadow: var(--shadow-xs);
  }

  /* In sponsor mode, the single Studies tab expands to roughly the
     combined width Studies + Patients had, so the nav doesn't visually
     shrink when the sponsor toggle hides one tab. */
  .nav-sponsor :global(a) {
    min-width: 156px;
    text-align: center;
  }

  .tenant {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
  }

  .select-wrap {
    position: relative;
    display: inline-flex;
    align-items: center;
  }

  /* Reserve room for the inline EHR pill + chevron */
  .select-wrap.has-pill .tenant-select {
    padding-right: 130px;
  }

  .ehr-pill {
    position: absolute;
    right: 28px;
    top: 50%;
    transform: translateY(-50%);
    display: inline-flex;
    align-items: center;
    padding: 2px 10px;
    border-radius: var(--radius-full);
    background: var(--brand-soft);
    color: var(--sage-800);
    font-weight: 600;
    font-size: var(--text-2xs);
    letter-spacing: 0.02em;
    line-height: 1.4;
    pointer-events: none;
  }

  .tenant-label {
    margin: 0;
    font-size: var(--text-2xs);
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--fg-subtle);
  }

  .tenant-select {
    width: auto;
    height: 34px;
    font-size: var(--text-sm);
    padding: 4px 28px 4px 12px;
    background-color: var(--bg-surface);
    border: 1px solid var(--border-default);
    border-radius: var(--radius-md);
    cursor: pointer;
    appearance: none;
    background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23737264' stroke-width='2'><path d='M6 9l6 6 6-6' stroke-linecap='round'/></svg>");
    background-repeat: no-repeat;
    background-position: right 8px center;
    font-weight: 500;
    transition: border-color 0.15s ease;
  }

  .tenant-select:hover {
    border-color: var(--border-strong);
  }

  .tenant-select.sponsor {
    background-color: var(--warning-50);
    border-color: var(--warning-500);
    color: var(--warning-700);
    font-weight: 600;
  }

  .main {
    flex: 1;
    padding: var(--space-8) var(--space-6) var(--space-16);
    max-width: 1200px;
    width: 100%;
    margin: 0 auto;
  }

  @media (max-width: 720px) {
    .topbar {
      grid-template-columns: 1fr auto;
    }
    .nav {
      grid-column: 1 / -1;
      justify-self: start;
      grid-row: 2;
    }
    .topbar {
      height: auto;
      padding: 10px 16px;
    }
  }

  /* Live-institution password modal */
  .live-overlay {
    position: fixed;
    inset: 0;
    background: rgba(15, 23, 42, 0.45);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
  }
  .live-modal {
    background: var(--bg-surface, #fff);
    border-radius: 12px;
    padding: 24px;
    width: 360px;
    max-width: calc(100vw - 32px);
    box-shadow: 0 20px 50px rgba(0, 0, 0, 0.25);
  }
  .live-modal h2 {
    margin: 0 0 4px;
    font-size: 1.1rem;
  }
  .live-sub {
    margin: 0 0 16px;
    color: var(--fg-muted, #64748b);
    font-size: 0.85rem;
  }
  .live-modal input {
    width: 100%;
    padding: 10px 12px;
    border: 1px solid var(--border-default, #cbd5e1);
    border-radius: 8px;
    font-size: 0.95rem;
    box-sizing: border-box;
  }
  .live-error {
    color: #dc2626;
    font-size: 0.8rem;
    margin: 8px 0 0;
  }
  .live-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 16px;
  }
  .live-actions button {
    padding: 8px 14px;
    border-radius: 8px;
    border: 1px solid var(--border-default, #cbd5e1);
    cursor: pointer;
    font-family: inherit;
    font-size: 0.85rem;
  }
  .live-actions .ghost {
    background: #fff;
  }
  .live-actions .primary {
    background: #4f46e5;
    border-color: #4f46e5;
    color: #fff;
  }
  .live-actions button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
</style>
