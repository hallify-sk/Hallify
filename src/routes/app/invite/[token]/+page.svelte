<script lang="ts">
  import type { PageData, ActionData } from './$types';
  let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<div class="auth-shell">
  <div class="card auth-card">
    <h1>You've been invited</h1>
    <p class="subtitle">
      You've been invited to join <strong>{data.invite.org_name}</strong> as a
      <strong>{data.invite.role}</strong>.
    </p>

    {#if form?.error}
      <div class="alert-error">{form.error}</div>
    {/if}

    {#if data.user}
      <p class="info">Accepting as <strong>{data.user.email}</strong>.</p>
      <form method="POST" action="?/accept">
        <button type="submit" class="btn-action" style="width:100%">
          Accept invitation
        </button>
      </form>
    {:else}
      <p class="info">Please log in first to accept this invitation.</p>
      <a href="/login?redirect=/invite/{data.invite.id}" class="btn-action" style="display:block;text-align:center">
        Log in to accept
      </a>
    {/if}
  </div>
</div>

<style>
  .auth-shell {
    display: flex; justify-content: center; align-items: center;
    min-height: 80vh; padding: 2rem;
  }
  .auth-card { width: 100%; max-width: 420px; padding: 2rem; }
  h1 { font-size: 1.5rem; margin: 0 0 .5rem; }
  .subtitle { color: var(--text-muted); font-size: .9rem; margin: 0 0 1.5rem; }
  .info { font-size: .9rem; margin: 0 0 1rem; }
</style>
