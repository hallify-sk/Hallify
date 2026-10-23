<script lang="ts">
  import Icon from './Icon.svelte';
  import { setContext, type Snippet } from 'svelte';
  import { getLocale, chooseLocale } from '$lib/i18n.svelte';
  import { LEGAL_LABELS } from '$lib/legal';
  import { openConsentSettings } from '$lib/analytics';
  import { chooseMarketingTheme, chosenMarketingTheme, readMarketingTheme } from './theme.svelte';
  import './marketing.css';
  import { page } from '$app/stores';
  let { audience, children, explorer = false }: { audience: 'customer' | 'business'; children: Snippet; explorer?: boolean } = $props();
  // A choice made during this visit wins; otherwise the cookie the page load read
  // (pages without a load of their own, like the error page, fall back to dark).
  const theme = $derived(chosenMarketingTheme() ?? readMarketingTheme(($page.data as { marketingTheme?: string | null }).marketingTheme) ?? 'dark');
  setContext('marketing-theme', () => theme);
  // <html lang> is rendered by the server; keep it in step when the language changes
  // on the page, so assistive technology reads English as English.
  $effect(() => { document.documentElement.lang = getLocale(); });
  const en = $derived(getLocale() === 'en');
  const legal = $derived(LEGAL_LABELS[getLocale()]);
  // Signed in: the header leads back into the app instead of to the sign-in form.
  const signedIn = $derived(!!($page.data as { user?: unknown }).user);
</script>
<div class="marketing" class:explorer-shell={explorer} data-audience={audience} data-theme={theme}>
  <a class="skip" href="#main">{en ? 'Skip to content' : 'Preskočiť na obsah'}</a>
  <header class="site-header">
    <a class="brand" href="/" aria-label="Hallify"><img src="/Hallify.svg" alt="" width="33" height="33"><span>Hallify</span></a>
    <nav aria-label={en ? 'Main navigation' : 'Hlavná navigácia'}>
      <a href="/" aria-current={audience === 'customer' ? 'page' : undefined}>{en ? 'Find a venue' : 'Hľadám priestor'}</a>
      <a href="/pre-prevadzkovatelov" aria-current={audience === 'business' ? 'page' : undefined}>{en ? 'For businesses' : 'Pre prevádzkovateľov'}</a>
    </nav>
    <div class="header-right">
      <button class="locale-toggle" onclick={() => chooseLocale(en ? 'sk' : 'en')} aria-label={en ? 'Switch to Slovak' : 'Prepnúť na angličtinu'}>{en ? 'SK' : 'EN'}</button>
      <button class="theme-toggle" onclick={() => chooseMarketingTheme(theme === 'dark' ? 'light' : 'dark')} aria-label={en ? 'Switch color theme' : 'Prepnúť farebný režim'}>◐</button>
      {#if signedIn}
        <a class="header-cta" href="/app">{en ? 'Go to the app' : 'Prejsť do aplikácie'} <Icon /></a>
      {:else}
        <a class="header-cta" href={audience === 'customer' ? '/app/login?type=client' : '/app/login'}>{en ? 'Sign in' : 'Prihlásiť sa'} <Icon /></a>
      {/if}
    </div>
  </header>
  <main id="main">{@render children()}</main>
  {#if !explorer}<footer class="wrap footer">
    <a class="brand" href="/"><img src="/Hallify.svg" alt="" width="25" height="25"><span>Hallify</span></a>
    <div class="footer-links"><a href="/terms">{legal.terms}</a><a href="/privacy">{legal.privacy}</a><button onclick={openConsentSettings}>{en ? 'Cookie preferences' : 'Nastavenia súkromia'}</button></div>
    <span>© {new Date().getFullYear()} Hallify</span>
  </footer>{/if}
</div>
