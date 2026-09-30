<script lang="ts">
  import { liveStatus } from '$lib/liveStore';
</script>

{#if $liveStatus && $liveStatus.status !== 'ok'}
  <div class="lsb lsb-{$liveStatus.status}" role="status">
    <div class="lsb-row">
      <span class="lsb-icon">⚠️</span>
      <div>
        <div class="lsb-title">
          {#if $liveStatus.status === 'permission_denied'}
            DrChrono connected, but missing patient permissions
          {:else if $liveStatus.status === 'not_connected'}
            Not connected to DrChrono
          {:else}
            DrChrono connection problem
          {/if}
        </div>
        <p class="lsb-msg">{$liveStatus.message}</p>

        {#if $liveStatus.missing_permissions?.length}
          <div class="lsb-sub">Permissions to enable for this account:</div>
          <ul class="lsb-perms">
            {#each $liveStatus.missing_permissions as p}
              <li><span class="x">✕</span> {p.label} <code>{p.key}</code></li>
            {/each}
          </ul>
        {/if}

        {#if $liveStatus.authorized_user}
          <div class="lsb-foot">
            Authorized as <code>{$liveStatus.authorized_user}</code>{$liveStatus.is_doctor === false ? ' — a staff account' : ''}.
            A DrChrono admin can grant the permissions above, or re-authorize with a provider account that has them.
            {#if $liveStatus.checked_at}<span class="lsb-time">· checked {new Date($liveStatus.checked_at).toLocaleString()}</span>{/if}
          </div>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .lsb {
    margin: 12px 24px 0;
    border: 1px solid #fcd34d;
    background: #fffbeb;
    border-radius: 10px;
    padding: 12px 14px;
    font-size: 0.85rem;
    color: #78350f;
  }
  .lsb-not_connected { border-color: #cbd5e1; background: #f8fafc; color: #334155; }
  .lsb-error { border-color: #fca5a5; background: #fef2f2; color: #7f1d1d; }
  .lsb-row { display: flex; gap: 10px; align-items: flex-start; }
  .lsb-icon { font-size: 1.1rem; line-height: 1.2; }
  .lsb-title { font-weight: 700; margin-bottom: 2px; }
  .lsb-msg { margin: 0 0 6px; }
  .lsb-sub { font-weight: 600; font-size: 0.78rem; margin-top: 4px; }
  .lsb-perms { list-style: none; margin: 4px 0 6px; padding: 0; display: flex; flex-direction: column; gap: 2px; }
  .lsb-perms .x { color: #dc2626; font-weight: 700; }
  .lsb-perms code, .lsb-foot code { font-family: ui-monospace, monospace; font-size: 0.72rem; background: rgba(0,0,0,0.05); padding: 0 4px; border-radius: 3px; }
  .lsb-foot { font-size: 0.78rem; opacity: 0.9; }
  .lsb-time { opacity: 0.7; }
</style>
