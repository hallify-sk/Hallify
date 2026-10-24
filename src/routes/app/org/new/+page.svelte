<script lang="ts">
  import { onMount } from 'svelte';
  import { saas } from '$lib/analytics';
  import { t } from '$lib/i18n.svelte';
  import type { ActionData } from './$types';
  let { form }: { form: ActionData } = $props();

  // Bound so a duplicate-name warning can disappear as soon as the name is edited.
  let name = $state(form?.name ?? '');
  let acceptDpa = $state(form?.acceptDpa ?? false);
  const duplicateOf = $derived(form?.duplicate ? String(form.name ?? '').trim().toLowerCase() : null);

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
               placeholder={t.accountExtra.orgNamePlaceholder} bind:value={name} />
      </div>
      <label class="consent">
        <input type="checkbox" name="acceptDpa" required bind:checked={acceptDpa} />
        <span>
          {t.accountExtra.orgDpaBefore}
          <a href="/dpa" target="_blank" rel="noopener">{t.accountExtra.orgDpaLink}</a>{t.accountExtra.orgDpaAfter}
        </span>
      </label>
      {#if duplicateOf !== null && duplicateOf === name.trim().toLowerCase()}
        <!-- Shown only while the name is still the one the server flagged; editing it
             goes back to the ordinary button. -->
        <div class="alert-warning" role="alert">{t.accountExtra.orgDuplicateWarning}</div>
        <input type="hidden" name="confirmDuplicate" value="1" />
        <button type="submit" class="btn-action" style="width:100%;margin-top:.5rem">
          {t.accountExtra.orgDuplicateConfirm}
        </button>
      {:else}
        <button type="submit" class="btn-action" style="width:100%;margin-top:.5rem">
          {t.accountExtra.createOrgTitle}
        </button>
      {/if}
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
  /* Same treatment as the consent box on /app/register. */
  .consent {
    display: flex;
    align-items: flex-start;
    gap: 9px;
    margin-top: .25rem;
    font-size: 12px;
    font-weight: 400;
    line-height: 1.5;
    color: var(--text-muted);
    cursor: pointer;
  }
  .consent input { width: 16px; height: 16px; margin: 1px 0 0; flex-shrink: 0; accent-color: var(--accent); }
  .consent a { color: var(--accent-ink); font-weight: 600; text-decoration: none; }
  .consent a:hover { text-decoration: underline; }
  h1 { font-size: 1.75rem; font-weight: 550; letter-spacing: -.055em; line-height: 1.08; margin: 0; }
</style>
