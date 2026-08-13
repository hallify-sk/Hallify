<script lang="ts">
  import { page } from '$app/stores';
  import { enhance } from '$app/forms';
  import { t } from '$lib/i18n.svelte';
  import type { PageData, ActionData } from './$types';

  interface Props { data: PageData; form: ActionData; }
  const { data, form }: Props = $props();

  const org = $derived(data.domainOrg);
  let tab = $state((form?.tab as 'login' | 'register' | undefined) ?? 'login');
  const resetSuccess = $derived($page.url.searchParams.get('reset') === 'success');
</script>

<svelte:head><title>{t.publicBooking.signInTitle} – {org.name}</title></svelte:head>

<div class="auth-root">
  <div class="auth-card">

    <!-- Org branding -->
    <div class="auth-brand">
      {#if org.logoUrl}
        <img src={org.logoUrl} alt={org.name} class="brand-logo" />
      {:else}
        <div class="brand-icon">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
            <polyline points="9 22 9 12 15 12 15 22"/>
          </svg>
        </div>
      {/if}
      <span class="brand-name">{org.name}</span>
    </div>

    <!-- Tabs -->
    <div class="tabs">
      <button class="tab" class:tab-active={tab === 'login'} type="button" onclick={() => tab = 'login'}>{t.auth.signIn}</button>
      <button class="tab" class:tab-active={tab === 'register'} type="button" onclick={() => tab = 'register'}>{t.auth.createAccount}</button>
    </div>

    {#if resetSuccess}<div class="notice notice-success">{t.forgotPassword.resetSuccess}</div>{/if}

    {#if form?.error}
      <div class="alert-error">{form.error}</div>
    {/if}

    <!-- ── Login form ── -->
    {#if tab === 'login'}
      <form method="POST" action="?/login" use:enhance class="form">
        <input type="hidden" name="redirect" value={data.redirectTo} />
        <div class="field">
          <label class="field-label" for="l-email">{t.auth.email}</label>
          <input class="field-input" id="l-email" name="email" type="email"
            placeholder="you@example.com" value={form?.email ?? ''} autocomplete="email" required />
        </div>
        <div class="field">
          <label class="field-label" for="l-password">{t.auth.password}</label>
          <input class="field-input" id="l-password" name="password" type="password"
            placeholder="••••••••" autocomplete="current-password" required />
        </div>
        <button type="submit" class="btn-submit">{t.auth.signIn}</button>
      </form>
      <p class="switch-hint">
        <a class="switch-link" href="/forgot-password">{t.forgotPassword.title}</a>
      </p>
      <p class="switch-hint">
        {t.auth.noAccount}
        <button type="button" class="switch-link" onclick={() => tab = 'register'}>{t.publicBooking.createOne}</button>
      </p>
      <p class="owner-hint">{t.publicBooking.ownerHint}</p>
    {/if}

    <!-- ── Register form ── -->
    {#if tab === 'register'}
      <form method="POST" action="?/register" use:enhance class="form">
        <input type="hidden" name="redirect" value={data.redirectTo} />
        <div class="field-row">
          <div class="field field-grow">
            <label class="field-label" for="r-first">{t.auth.firstName}</label>
            <input class="field-input" id="r-first" name="first_name" type="text"
              placeholder="Jane" value={form?.first_name ?? ''} autocomplete="given-name" required />
          </div>
          <div class="field field-grow">
            <label class="field-label" for="r-last">{t.auth.lastName}</label>
            <input class="field-input" id="r-last" name="last_name" type="text"
              placeholder="Smith" value={form?.last_name ?? ''} autocomplete="family-name" required />
          </div>
        </div>
        <div class="field">
          <label class="field-label" for="r-email">{t.auth.email}</label>
          <input class="field-input" id="r-email" name="email" type="email"
            placeholder="you@example.com" value={form?.email ?? ''} autocomplete="email" required />
        </div>
        <div class="field">
          <label class="field-label" for="r-password">{t.auth.password} <span class="opt">{t.publicBooking.passwordMin8}</span></label>
          <input class="field-input" id="r-password" name="password" type="password"
            placeholder="••••••••" autocomplete="new-password" required minlength="8" />
        </div>
        <button type="submit" class="btn-submit">{t.auth.register}</button>
      </form>
      <p class="switch-hint">
        {t.auth.hasAccount}
        <button type="button" class="switch-link" onclick={() => tab = 'login'}>{t.auth.signInLink}</button>
      </p>
    {/if}

  </div>
</div>

<style>
  .auth-root {
    min-height: 100vh; display: flex; align-items: center; justify-content: center;
    background: var(--bg-base); padding: 24px;
  }

  .auth-card {
    width: 100%; max-width: 400px;
    background: var(--bg-panel); border: 1px solid var(--border); border-radius: 16px;
    padding: 32px; box-shadow: 0 16px 48px rgba(0,0,0,.2);
    animation: fadeUp .2s ease both;
  }
  @keyframes fadeUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }

  /* Branding */
  .auth-brand {
    display: flex; align-items: center; gap: 10px;
    margin-bottom: 24px;
  }
  .brand-logo { width: 36px; height: 36px; border-radius: 8px; object-fit: contain; }
  .brand-icon {
    width: 36px; height: 36px; border-radius: 8px;
    background: color-mix(in srgb, var(--accent) 12%, transparent);
    border: 1px solid color-mix(in srgb, var(--accent) 25%, transparent);
    display: flex; align-items: center; justify-content: center; color: var(--accent);
  }
  .brand-name { font-size: 17px; font-weight: 800; color: var(--text-base); letter-spacing: -.02em; }

  /* Tabs */
  .tabs {
    display: flex; gap: 0; border-bottom: 1px solid var(--border);
    margin-bottom: 20px;
  }
  .tab {
    padding: 8px 16px; font-size: 13px; font-weight: 600; font-family: inherit;
    background: none; border: none; cursor: pointer; color: var(--text-subtle);
    border-bottom: 2px solid transparent; margin-bottom: -1px;
    transition: color .1s, border-color .1s;
  }
  .tab-active { color: var(--accent); border-bottom-color: var(--accent); }
  .tab:hover:not(.tab-active) { color: var(--text-muted); }

  /* Alert */
  .alert-error {
    padding: 9px 12px; border-radius: 8px; font-size: 12px; margin-bottom: 16px;
    background: color-mix(in srgb, #ef4444 10%, transparent);
    border: 1px solid color-mix(in srgb, #ef4444 22%, transparent);
    color: #ef4444;
  }

  /* Form */
  .form { display: flex; flex-direction: column; gap: 14px; }
  .field { display: flex; flex-direction: column; gap: 5px; }
  .field-row { display: flex; gap: 10px; }
  .field-grow { flex: 1; min-width: 0; }
  .field-label {
    font-size: 10px; font-weight: 700; text-transform: uppercase;
    letter-spacing: .06em; color: var(--text-subtle);
  }
  .opt { font-weight: 400; text-transform: none; letter-spacing: 0; font-size: 10px; }
  .field-input {
    padding: 9px 11px; border: 1px solid var(--border); border-radius: 8px;
    background: var(--bg-panel2, var(--bg-base)); font-size: 13px;
    color: var(--text-base); font-family: inherit; outline: none; transition: border-color .12s, box-shadow .12s;
  }
  .field-input:focus {
    border-color: var(--accent);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 12%, transparent);
  }

  .btn-submit {
    width: 100%; padding: 11px; border-radius: 9px; font-size: 14px; font-weight: 700;
    background: var(--accent); color: #fff; border: none; cursor: pointer;
    font-family: inherit; transition: opacity .12s; margin-top: 4px;
  }
  .btn-submit:hover { opacity: .88; }

  /* Switch */
  .switch-hint {
    text-align: center; font-size: 12px; color: var(--text-subtle); margin-top: 16px; margin-bottom: 0;
  }
  .switch-link {
    background: none; border: none; color: var(--accent); font-size: 12px; font-weight: 600;
    cursor: pointer; padding: 0; font-family: inherit; text-decoration: underline;
  }

  .owner-hint {
    text-align: center; font-size: 11px; color: var(--text-subtle);
    margin: 10px 0 0; padding-top: 10px; border-top: 1px solid var(--border-subtle, var(--border));
  }
</style>
