<script lang="ts">
  import { enhance } from '$app/forms';
  import { t, getLocale } from '$lib/i18n.svelte';
  import { confirmFirst } from '$lib/forms';
  import { timeAgo, formatDateTime } from '$lib/format';

  interface Connection {
    id: string; client_name: string; redirect_host: string | null; writes: boolean;
    created_at: string; last_used_at: string | null; member_name: string; member_email: string; cut_off: boolean;
  }
  interface Activity { id: string; actor_name: string | null; client_name: string; tool: string; summary: string | null; created_at: string }
  interface Props {
    mcp: { available: boolean; connections: Connection[]; activity: Activity[] };
    form: unknown;
    readOnly?: boolean;
  }
  const { mcp, form, readOnly = false }: Props = $props();

  const f = $derived((form ?? {}) as { mcpRevoked?: boolean; mcpError?: string });

  /** The row's stored detail, worded in the reader's language. */
  function describe(a: Activity): string {
    let d: { label?: string; to?: string };
    try { d = JSON.parse(a.summary ?? '{}'); } catch { return a.summary ?? a.tool; }
    const label = d.label ?? '';
    const status = ((t.status as Record<string, string>)[d.to ?? ''] ?? d.to ?? '').toLowerCase();
    const what = a.tool === 'set_reservation_status' ? t.mcp.actStatus(label, status)
      : a.tool === 'reply_to_message_thread' ? t.mcp.actReply(label)
      : a.tool === 'update_hall_description' ? t.mcp.actHall(label)
      : a.tool;
    return `${what} ${t.mcp.viaMcp(a.client_name)}`;
  }
</script>

<!-- Members' own AI agents (MCP). Owner-only: cutting a connection off from the
     organisation leaves the member's other organisations alone. -->
<section class="section" id="mcp">
  <div class="section-head">
    <h2>{t.mcp.orgTitle}</h2>
    <p>{t.mcp.orgLead}</p>
  </div>

  {#if !mcp.available}<p class="alert-warning">{t.mcp.orgLocked}</p>{/if}
  {#if f.mcpRevoked}<div class="alert-success" role="status">{t.mcp.orgRevokedSaved}</div>{/if}
  {#if f.mcpError}<div class="alert-error" role="alert">{f.mcpError}</div>{/if}

  {#if mcp.connections.length}
    <div class="row-list">
      {#each mcp.connections as c (c.id)}
        <div class="row-item mcp-row">
          <div class="mcp-main">
            <strong>{c.member_name}</strong>
            <span class="mcp-meta">{c.member_email}</span>
            <span class="mcp-meta">
              {c.client_name}{#if c.redirect_host}{' '}({c.redirect_host}){/if} ·
              {c.writes ? t.mcp.accessReadWrite : t.mcp.accessReadOnly} ·
              {t.mcp.lastUsed}: {c.last_used_at ? timeAgo(c.last_used_at, getLocale()) : t.mcp.neverUsed}
            </span>
          </div>
          {#if c.cut_off}
            <span class="mcp-off">{t.mcp.orgRevoked}</span>
          {:else if !readOnly}
            <form method="POST" action="?/revokeMcp" use:enhance={confirmFirst(() => t.mcp.orgConfirmRevoke)}>
              <input type="hidden" name="id" value={c.id} />
              <button type="submit" class="btn-danger">{t.mcp.orgRevoke}</button>
            </form>
          {/if}
        </div>
      {/each}
    </div>
  {:else}
    <p class="mcp-empty">{t.mcp.orgNone}</p>
  {/if}

  <h3 class="group-title">{t.mcp.orgActivityTitle}</h3>
  {#if mcp.activity.length}
    <div class="row-list">
      {#each mcp.activity as a (a.id)}
        <div class="row-item mcp-row">
          <div class="mcp-main">
            <span>{describe(a)}</span>
            <span class="mcp-meta">{a.actor_name ?? '—'} · <span title={formatDateTime(a.created_at, getLocale())}>{timeAgo(a.created_at, getLocale())}</span></span>
          </div>
        </div>
      {/each}
    </div>
  {:else}
    <p class="mcp-empty">{t.mcp.orgActivityNone}</p>
  {/if}
</section>

<style>
  .mcp-row { justify-content: space-between; flex-wrap: wrap; }
  .mcp-main { display: flex; flex-direction: column; gap: 3px; min-width: 0; flex: 1 1 260px; font-size: 13px; }
  .mcp-main strong { font-weight: 600; }
  .mcp-meta { font-size: 12px; color: var(--text-muted); overflow-wrap: anywhere; }
  .mcp-off { font-size: 12px; color: var(--text-muted); }
  .mcp-empty { font-size: 13px; color: var(--text-muted); margin: 0; }
  .group-title { font-size: 13px; font-weight: 650; margin: 24px 0 8px; }
</style>
