<script lang="ts">
  import { onMount } from 'svelte';
  import { saas } from '$lib/analytics';
  import { t } from '$lib/i18n.svelte';
  import type { ActionData } from './$types';
  let { form }: { form: ActionData } = $props();

  onMount(() => saas.signUpCompleted());
</script>

<div class="auth-shell">
  <section class="section section--lead auth-card">
    <div class="section-head">
      <h1>{t.accountExtra.createOrgTitle}</h1>
      <p class="subtitle">{t.accountExtra.createOrgSubtitle}</p>
    </div>

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
  </section>
</div>

<style>
  .auth-shell {
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 80vh;
    padding: 2rem;
  }
  /* No box: the form sits on the page. The flex centring supplies the room a
     .section's own padding would. */
  .auth-card {
    width: 100%;
    max-width: 420px;
    padding-block: 0;
  }
  h1 { font-size: 1.75rem; font-weight: 550; letter-spacing: -.055em; line-height: 1.08; margin: 0; }
</style>
