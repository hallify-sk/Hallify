<script lang="ts">
  import type { PageData, ActionData } from './$types';
  let { data, form }: { data: PageData; form: ActionData } = $props();

  let showInviteForm = $state(false);
</script>

<div class="page-wrap">
  <div class="page-header">
    <div>
      <h1>Members</h1>
      <p class="subtitle">{data.members.length} member{data.members.length !== 1 ? 's' : ''} in {data.currentOrg?.name}</p>
    </div>
    <button class="btn-action btn-sm" onclick={() => showInviteForm = !showInviteForm}>
      + Invite member
    </button>
  </div>

  {#if form?.error}
    <div class="alert-error">{form.error}</div>
  {/if}
  {#if form?.message}
    <div class="alert-success">{form.message}</div>
  {/if}

  {#if showInviteForm}
    <div class="card invite-card">
      <h3>Invite by email</h3>
      <form method="POST" action="?/invite" class="field-row">
        <div class="field">
          <label for="email">Email address</label>
          <input id="email" name="email" type="email" required placeholder="colleague@example.com" />
        </div>
        <div class="field">
          <label for="role">Role</label>
          <select id="role" name="role">
            <option value="member">Member</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        <div class="field" style="align-self:flex-end">
          <button type="submit" class="btn-action">Send invite</button>
        </div>
      </form>
    </div>
  {/if}

  <!-- Current members -->
  <div class="card">
    <table class="table">
      <thead>
        <tr><th>Name</th><th>Email</th><th>Role</th><th>Joined</th><th></th></tr>
      </thead>
      <tbody>
        {#each data.members as member}
          <tr>
            <td><strong>{member.user_first_name} {member.user_last_name}</strong></td>
            <td class="muted">{member.user_email}</td>
            <td>
              <form method="POST" action="?/changeRole" style="display:inline">
                <input type="hidden" name="user_id" value={member.user_id} />
                <select name="role" onchange={(e) => (e.currentTarget as HTMLSelectElement).form?.submit()} class="role-select">
                  <option value="owner" selected={member.role === 'owner'}>Owner</option>
                  <option value="admin" selected={member.role === 'admin'}>Admin</option>
                  <option value="member" selected={member.role === 'member'}>Member</option>
                </select>
              </form>
            </td>
            <td class="muted">{new Date(member.joined_at).toLocaleDateString()}</td>
            <td>
              <form method="POST" action="?/remove">
                <input type="hidden" name="user_id" value={member.user_id} />
                <button type="submit" class="btn-danger btn-sm"
                  onclick={(e) => { if (!confirm('Remove this member?')) e.preventDefault(); }}>Remove</button>
              </form>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>

  <!-- Pending invites -->
  {#if data.invites.length > 0}
    <h2 style="margin-top:2rem">Pending invites</h2>
    <div class="card">
      <table class="table">
        <thead>
          <tr><th>Email</th><th>Role</th><th>Expires</th><th></th></tr>
        </thead>
        <tbody>
          {#each data.invites as invite}
            <tr>
              <td>{invite.email}</td>
              <td class="muted" style="text-transform:capitalize">{invite.role}</td>
              <td class="muted">{new Date(invite.expires_at).toLocaleDateString()}</td>
              <td>
                <form method="POST" action="?/revoke">
                  <input type="hidden" name="id" value={invite.id} />
                  <button type="submit" class="btn-outline btn-sm">Revoke</button>
                </form>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>

<style>
  .page-wrap { padding: 2rem; max-width: 900px; }
  .page-header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 1.5rem; }
  h1 { font-size: 1.4rem; margin: 0 0 .25rem; }
  .subtitle { color: var(--text-muted); font-size: .875rem; margin: 0; }
  .invite-card { padding: 1.5rem; margin-bottom: 1.5rem; }
  .invite-card h3 { margin: 0 0 1rem; font-size: 1rem; }
  .table { width: 100%; border-collapse: collapse; font-size: .875rem; }
  .table th { text-align: left; padding: .6rem 1rem; font-size: .75rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: .04em; border-bottom: 1px solid var(--border); }
  .table td { padding: .75rem 1rem; border-bottom: 1px solid var(--border); }
  .table tr:last-child td { border-bottom: none; }
  .muted { color: var(--text-muted); }
  .role-select { font-size: .8rem; padding: 2px 6px; border: 1px solid var(--border); border-radius: 5px; background: var(--bg-panel2); font-family: inherit; }
  .alert-success { background: #dcfce7; color: #166534; border: 1px solid #bbf7d0; border-radius: 8px; padding: .75rem 1rem; margin-bottom: 1rem; font-size: .875rem; }
</style>
