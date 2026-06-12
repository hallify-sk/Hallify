<script lang="ts">
  import type { PageData } from './$types';
  let { data }: { data: PageData } = $props();
</script>

<div class="page-wrap">
  <div class="page-header">
    <h1>Organizations</h1>
    <span class="count">{data.orgs.length} total</span>
  </div>

  <div class="card">
    <table class="table">
      <thead>
        <tr>
          <th>Name</th><th>Slug</th><th>Plan</th><th>Members</th>
          <th>Created</th><th>Status</th><th></th>
        </tr>
      </thead>
      <tbody>
        {#each data.orgs as org}
          <tr class:suspended={!!org.suspended_at}>
            <td><strong>{org.name}</strong></td>
            <td class="muted">{org.slug}</td>
            <td><span class="badge badge-{org.plan ?? 'free'}">{org.plan ?? 'free'}</span></td>
            <td class="muted">{org.member_count}</td>
            <td class="muted">{new Date(org.created_at).toLocaleDateString()}</td>
            <td>
              {#if org.suspended_at}
                <span class="badge badge-suspended">Suspended</span>
              {:else}
                <span class="badge badge-active">Active</span>
              {/if}
            </td>
            <td>
              {#if org.suspended_at}
                <form method="POST" action="?/unsuspend" style="display:inline">
                  <input type="hidden" name="id" value={org.id} />
                  <button type="submit" class="btn-outline btn-sm">Unsuspend</button>
                </form>
              {:else}
                <form method="POST" action="?/suspend" style="display:inline">
                  <input type="hidden" name="id" value={org.id} />
                  <button type="submit" class="btn-danger btn-sm"
                    onclick={(e) => { if (!confirm('Suspend this organization?')) e.preventDefault(); }}>Suspend</button>
                </form>
              {/if}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
</div>

<style>
  .page-wrap { padding: 2rem; }
  .page-header { display: flex; align-items: center; gap: 1rem; margin-bottom: 1.5rem; }
  h1 { font-size: 1.4rem; margin: 0; }
  .count { font-size: .875rem; color: var(--text-muted); }
  .table { width: 100%; border-collapse: collapse; font-size: .875rem; }
  .table th { text-align: left; padding: .6rem 1rem; font-size: .75rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: .04em; border-bottom: 1px solid var(--border); }
  .table td { padding: .75rem 1rem; border-bottom: 1px solid var(--border); }
  .table tr:last-child td { border-bottom: none; }
  .table tr.suspended td { opacity: .5; }
  .muted { color: var(--text-muted); }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 20px; font-size: .7rem; font-weight: 700; text-transform: uppercase; }
  .badge-free { background: var(--bg-panel2); color: var(--text-muted); }
  .badge-starter { background: var(--accent-dim); color: var(--accent); }
  .badge-professional { background: #fef3c7; color: #92400e; }
  .badge-enterprise { background: var(--accent-action-dim); color: var(--accent-action); }
  .badge-active { background: #dcfce7; color: #166534; }
  .badge-suspended { background: #fee2e2; color: #991b1b; }
</style>
