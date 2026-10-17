<script lang="ts">
  import { t } from '$lib/i18n.svelte';
  import { reveal } from '$lib/reveal';
  import type { PageData, ActionData } from './$types';
  let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<div class="auth-shell">
  <!-- A plain div: the root layout already renders the page <main>. -->
  <div class="auth-measure">
    <section class="section section--lead" use:reveal>
      <div class="section-head">
        <h1>{t.authPages.inviteTitle}</h1>
        <p>
          {t.authPages.inviteIntro} <strong>{data.invite.org_name}</strong> {t.authPages.inviteAsRole}
          <strong>{data.invite.role}</strong>.
        </p>
      </div>

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
    </section>
  </div>
</div>

<style>
  /* No panel here any more: the page is one .section, and .section-head supplies
     the heading and its lede. */
  .auth-shell {
    display: flex; justify-content: center; align-items: center;
    min-height: 80vh; padding: 2rem;
  }
  .auth-measure { width: min(620px, 100%); }
  h1 { font-size: var(--display-size); font-weight: 550; letter-spacing: -.055em; line-height: 1.08; margin: 0; }
  .info { font-size: 14px; line-height: 1.75; margin: 0 0 1rem; }
</style>
