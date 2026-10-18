<script lang="ts">
  import { enhance } from '$app/forms';
  import { t } from '$lib/i18n.svelte';
  import { reveal } from '$lib/reveal';
  import type { PageData, ActionData } from './$types';
  let { data, form }: { data: PageData; form: ActionData } = $props();

  // Accepting writes BOTH organization_members.role and the invite's roles, and the
  // two are stored separately — so listing only one of them could understate what
  // the invitation actually grants. The lede keeps the familiar admin/member word;
  // the access row names everything that will be applied.
  const legacyRole = $derived(
    data.invite.role === 'admin' ? t.membersAdmin.roleAdmin : t.membersAdmin.roleMember
  );
  const accessLabel = $derived(
    [legacyRole, ...data.invite.roleNames].filter((v, i, all) => v && all.indexOf(v) === i).join(', ')
  );

  // Encoded as one query value: the login action re-validates it (same-origin
  // path only), and encoding stops a token with `&` or `#` in it from being read
  // as a second parameter instead of part of the path.
  const loginHref = $derived(
    `/app/login?redirect=${encodeURIComponent(`/app/invite/${data.token}`)}`
  );

  // The name fields are prefilled from the invite and editable; a failed submit
  // hands back whatever was typed rather than resetting to the invite's version.
  const firstName = $derived(form?.firstName || data.invite.firstName);
  const lastName = $derived(form?.lastName || data.invite.lastName);
</script>

<svelte:head><title>{t.authPages.inviteTitle} – {data.invite.orgName}</title></svelte:head>

<div class="auth-shell">
  <!-- A plain div: the root layout already renders the page <main>. -->
  <div class="auth-measure">
    <section class="section section--lead" use:reveal>
      <div class="section-head">
        <h1>{t.authPages.inviteTitle}</h1>
        <p>
          {t.authPages.inviteIntro} <strong>{data.invite.orgName}</strong> {t.authPages.inviteAsRole}
          <strong>{legacyRole}</strong>.
        </p>
      </div>

      <div class="row-list">
        <div class="row-item">
          <span class="inv-k">{t.authPages.inviteOrgLabel}</span>
          <span class="inv-v">{data.invite.orgName}</span>
        </div>
        <div class="row-item">
          <span class="inv-k">{t.auth.email}</span>
          <span class="inv-v">{data.invite.email}</span>
        </div>
        <div class="row-item">
          <span class="inv-k">{t.authPages.inviteRolesLabel}</span>
          <span class="inv-v">{accessLabel}</span>
        </div>
      </div>
    </section>

    <section class="section" use:reveal>
      {#if form?.error}
        <!-- role="alert": use:enhance replaces this in place without a navigation,
             so without it a screen reader never hears why the submit failed. -->
        <div class="alert-error" role="alert">{form.error}</div>
      {/if}

      {#if data.signedInMatches}
        <!-- Signed in as the invited address → one click. -->
        <p class="info">{t.authPages.inviteAcceptingAs} <strong>{data.currentEmail}</strong>.</p>
        <form method="POST" action="?/accept" use:enhance>
          <button type="submit" class="btn-action inv-wide">{t.authPages.inviteAccept}</button>
        </form>
      {:else if data.signedInDifferent}
        <!-- Somebody else is signed in. The server refuses the accept either way;
             this offers the way out instead of letting them try and fail. -->
        <div class="section-head">
          <h2>{t.authPages.inviteWrongAccountTitle}</h2>
          <p>{t.authPages.inviteWrongAccountHint}</p>
        </div>
        <p class="info">{t.authPages.inviteAcceptingAs} <strong>{data.currentEmail}</strong>.</p>
        <form method="POST" action="?/signOut" use:enhance>
          <button type="submit" class="btn-outline inv-wide">{t.authPages.inviteSignOut}</button>
        </form>
      {:else if data.hasAccount}
        <!-- The invited address already has an account → sign in and come back. -->
        <div class="section-head">
          <h2>{t.authPages.inviteHasAccountTitle}</h2>
          <p>{t.authPages.inviteHasAccountHint}</p>
        </div>
        <a href={loginHref} class="btn-action inv-wide">{t.authPages.inviteLoginToAccept}</a>
      {:else}
        <!-- No account anywhere → set a password and join in one step. -->
        <div class="section-head">
          <h2>{t.authPages.inviteCreateTitle}</h2>
          <p>{t.authPages.inviteCreateHint}</p>
        </div>

        <form method="POST" action="?/register" use:enhance>
          <div class="field-row">
            <div class="field">
              <label for="firstName">{t.auth.firstName}</label>
              <input id="firstName" name="firstName" type="text" required
                value={firstName} autocomplete="given-name" />
            </div>
            <div class="field">
              <label for="lastName">{t.auth.lastName}</label>
              <input id="lastName" name="lastName" type="text" required
                value={lastName} autocomplete="family-name" />
            </div>
          </div>
          <div class="field">
            <label for="password">{t.auth.password}</label>
            <input id="password" name="password" type="password" required minlength={6}
              placeholder={t.auth.passwordMin} autocomplete="new-password" />
          </div>
          <button type="submit" class="btn-action inv-wide">{t.authPages.inviteCreateSubmit}</button>
        </form>
      {/if}
    </section>
  </div>
</div>

<style>
  /* No panel here any more: the page is one .section, and .section-head supplies
     the heading and its lede. The form itself is the global .field / .field-row /
     input treatment, so only the measure, the key column and the full-width
     button are local. */
  .auth-shell {
    display: flex; justify-content: center; align-items: center;
    min-height: 80vh; padding: 2rem;
  }
  .auth-measure { width: min(620px, 100%); }
  h1 { font-size: var(--display-size); font-weight: 550; letter-spacing: -.055em; line-height: 1.08; margin: 0; }
  .info { font-size: 14px; line-height: 1.75; margin: 0 0 1rem; }

  .inv-k { width: 110px; flex-shrink: 0; color: var(--text-muted); font-weight: 600; font-size: 13px; }
  .inv-v { color: var(--text-base); font-weight: 500; font-size: 13px; overflow-wrap: anywhere; }

  /* The one action on the page, so it takes the full measure. */
  .inv-wide { width: 100%; justify-content: center; text-align: center; }

  @media (max-width: 480px) {
    /* 16px gutter at phone width, and the name pair stacks rather than
       squeezing two labelled fields into ~160px each. */
    .auth-shell { padding: 16px; }
    .field-row { grid-template-columns: 1fr; }
    .inv-k { width: 92px; }
  }
</style>
