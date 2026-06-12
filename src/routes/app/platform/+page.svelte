<script lang="ts">
  import type { PageData } from './$types';
  let { data }: { data: PageData } = $props();
  const s = $derived(data.stats);
</script>

<div class="page-wrap">
  <div class="page-header">
    <h1>Platform overview</h1>
  </div>

  <div class="kpi-grid">
    <div class="kpi-card">
      <span class="kpi-label">Organizations</span>
      <span class="kpi-value">{s.total_orgs}</span>
    </div>
    <div class="kpi-card">
      <span class="kpi-label">Users</span>
      <span class="kpi-value">{s.total_users}</span>
    </div>
    <div class="kpi-card">
      <span class="kpi-label">Paid subscriptions</span>
      <span class="kpi-value">{s.active_subscriptions}</span>
    </div>
    <div class="kpi-card">
      <span class="kpi-label">Total reservations</span>
      <span class="kpi-value">{s.total_reservations}</span>
    </div>
  </div>

  <h2>Recent organizations</h2>
  <div class="card">
    <table class="table">
      <thead>
        <tr><th>Name</th><th>Slug</th><th>Plan</th><th>Created</th></tr>
      </thead>
      <tbody>
        {#each data.recentOrgs as org}
          <tr>
            <td><a href="/app/platform/orgs/{org.id}">{org.name}</a></td>
            <td class="muted">{org.slug}</td>
            <td><span class="badge badge-{org.plan ?? 'free'}">{org.plan ?? 'free'}</span></td>
            <td class="muted">{new Date(org.created_at).toLocaleDateString()}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
</div>

<style>
  .page-wrap { padding: 2rem; }
  .page-header { margin-bottom: 2rem; }
  h1 { font-size: 1.4rem; margin: 0 0 .25rem; }
  h2 { font-size: 1rem; font-weight: 700; margin: 2rem 0 .75rem; }
  .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1rem; margin-bottom: 2rem; }
  .kpi-card { background: var(--bg-panel); border: 1px solid var(--border); border-radius: 12px; padding: 1.25rem 1.5rem; }
  .kpi-label { display: block; font-size: .75rem; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: .04em; margin-bottom: .4rem; }
  .kpi-value { font-size: 2rem; font-weight: 700; color: var(--text-base); }
  .table { width: 100%; border-collapse: collapse; font-size: .875rem; }
  .table th { text-align: left; padding: .6rem 1rem; font-size: .75rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: .04em; border-bottom: 1px solid var(--border); }
  .table td { padding: .75rem 1rem; border-bottom: 1px solid var(--border); }
  .table tr:last-child td { border-bottom: none; }
  .table a { color: var(--accent); text-decoration: none; font-weight: 600; }
  .muted { color: var(--text-muted); }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 20px; font-size: .7rem; font-weight: 700; text-transform: uppercase; }
  .badge-free { background: var(--bg-panel2); color: var(--text-muted); }
  .badge-starter { background: var(--accent-dim); color: var(--accent); }
  .badge-professional { background: #fef3c7; color: #92400e; }
  .badge-enterprise { background: var(--accent-action-dim); color: var(--accent-action); }
</style>
