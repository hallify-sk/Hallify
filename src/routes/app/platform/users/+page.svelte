<script lang="ts">
  import type { PageData } from './$types';
  let { data }: { data: PageData } = $props();
</script>

<div class="page-wrap">
  <div class="page-header">
    <h1>All Users</h1>
    <span class="count">{data.users.length} total</span>
  </div>

  <div class="card">
    <table class="table">
      <thead>
        <tr><th>Name</th><th>Email</th><th>Orgs</th><th>Joined</th><th>Platform admin</th><th></th></tr>
      </thead>
      <tbody>
        {#each data.users as user}
          <tr>
            <td><strong>{user.first_name} {user.last_name}</strong></td>
            <td class="muted">{user.email}</td>
            <td class="muted">{user.org_count}</td>
            <td class="muted">{new Date(user.created_at).toLocaleDateString()}</td>
            <td>
              {#if user.is_platform_admin}
                <span class="badge badge-admin">Yes</span>
              {:else}
                <span class="badge badge-no">No</span>
              {/if}
            </td>
            <td>
              {#if user.is_platform_admin}
                <form method="POST" action="?/revokePlatformAdmin" style="display:inline">
                  <input type="hidden" name="id" value={user.id} />
                  <button type="submit" class="btn-danger btn-sm">Revoke admin</button>
                </form>
              {:else}
                <form method="POST" action="?/grantPlatformAdmin" style="display:inline">
                  <input type="hidden" name="id" value={user.id} />
                  <button type="submit" class="btn-outline btn-sm">Make admin</button>
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
  .muted { color: var(--text-muted); }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 20px; font-size: .7rem; font-weight: 700; }
  .badge-admin { background: var(--accent-action-dim); color: var(--accent-action); }
  .badge-no { background: var(--bg-panel2); color: var(--text-muted); }
</style>
