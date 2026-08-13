<script lang="ts">
  import { t } from '$lib/i18n.svelte';
  import type { PageData, ActionData } from './$types';
  let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<div class="auth-shell">
  <div class="card auth-card">
    <h1>{t.authPages.inviteTitle}</h1>
    <p class="subtitle">
      {t.authPages.inviteIntro} <strong>{data.invite.org_name}</strong> {t.authPages.inviteAsRole}
      <strong>{data.invite.role}</strong>.
    </p>

    {#if form?.error}
      <div class="alert-error">{form.error}</div>
    {/if}

    {#if data.user}
      <p class="info">{t.authPages.inviteAcceptingAs} <strong>{data.user.email}</strong>.</p>
      <form method="POST" action="?/accept">
        <button type="submit" class="btn-action" style="width:100%">
          {t.authPages.inviteAccept}
        </button>
      </form>
    {:else}
      <p class="info">{t.authPages.inviteLoginFirst}</p>
      <a href="/app/login?redirect=/app/invite/{data.token}" class="btn-action" style="display:block;text-align:center">
        {t.authPages.inviteLoginToAccept}
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
