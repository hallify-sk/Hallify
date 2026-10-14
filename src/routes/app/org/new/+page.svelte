<script lang="ts">
  import { onMount } from 'svelte';
  import { saas } from '$lib/analytics';
  import { t } from '$lib/i18n.svelte';
  import type { ActionData } from './$types';
  let { form }: { form: ActionData } = $props();

  onMount(() => saas.signUpCompleted());
</script>

<div class="auth-shell">
  <div class="card auth-card">
    <h1>{t.accountExtra.createOrgTitle}</h1>
    <p class="subtitle">{t.accountExtra.createOrgSubtitle}</p>

    {#if form?.error}
      <div class="alert-error">{form.error}</div>
    {/if}

    <form method="POST">
      <div class="field">
        <label for="name">{t.accountExtra.orgNameLabel}</label>
        <input id="name" name="name" type="text" required minlength="2" maxlength="80"
               placeholder={t.accountExtra.orgNamePlaceholder} value={form?.name ?? ''} />
      </div>
      <button type="submit" class="btn-action" style="width:100%;margin-top:.5rem">
        {t.accountExtra.createOrgTitle}
      </button>
    </form>
  </div>
</div>

<style>
  .auth-shell {
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 80vh;
    padding: 2rem;
  }
  .auth-card {
    width: 100%;
    max-width: 420px;
    padding: 2rem;
  }
  h1 { font-size: 1.5rem; margin: 0 0 .5rem; }
  .subtitle { color: var(--text-muted); font-size: .9rem; margin: 0 0 1.5rem; }
</style>
