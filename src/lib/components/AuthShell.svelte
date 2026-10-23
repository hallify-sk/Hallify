<script lang="ts">
  import type { Snippet } from 'svelte';
  import { t } from '$lib/i18n.svelte';
  interface Props { children: Snippet; }
  const { children }: Props = $props();
</script>

<div class="auth-outer">

  <!-- Left: brand panel -->
  <div class="brand-panel">
    <div class="brand-grid-bg"></div>
    <div class="brand-glow"></div>

    <div class="brand-logo brand-anim" style="animation-delay: 0ms">
      <img src="/Hallify.svg" alt="" class="brand-logo-img" />
      <span class="brand-logo-text">Hallify</span>
    </div>

    <div class="brand-body">
      <h2 class="brand-headline brand-anim" style="animation-delay: 80ms">{t.auth.brandHeadline1}<br />{t.auth.brandHeadline2}</h2>

      <ul class="brand-features">
        <li class="brand-anim" style="animation-delay: 200ms">
          <span class="icon-tile"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg></span>
          {t.auth.brandFeature1}
        </li>
        <li class="brand-anim" style="animation-delay: 280ms">
          <span class="icon-tile"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg></span>
          {t.auth.brandFeature2}
        </li>
        <li class="brand-anim" style="animation-delay: 360ms">
          <span class="icon-tile"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg></span>
          {t.auth.brandFeature3}
        </li>
      </ul>
    </div>

    <p class="brand-footer brand-anim" style="animation-delay: 440ms">© 2026 Hallify</p>
  </div>

  <!-- Right: form area -->
  <div class="form-panel">
    <!-- The way out. Every auth page was a dead end: the brand panel's logo is
         decorative, so somebody who landed on sign-in by accident had nothing to
         click but the browser's own back button. -->
    <a class="auth-back" href="/">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="15 18 9 12 15 6"/></svg>
      {t.auth.backToSite}
    </a>
    <div class="form-content">
      {@render children()}
    </div>
  </div>

</div>

<style>
  .auth-outer {
    display: flex;
    min-height: 100%;
    width: 100%;
  }

  /* ── Brand panel ─────────────────────────────── */

  .brand-panel {
    width: 420px;
    flex-shrink: 0;
    /* The dark paper of the language (= the dark theme's --bg-base). Hardcoded on
       purpose: this panel stays dark in all three themes, so it cannot follow the
       theme tokens. */
    background: #181c1a;
    display: flex;
    flex-direction: column;
    padding: 44px 48px;
    position: relative;
    overflow: hidden;
    min-height: 100vh;
  }

  /* Two-tier editor-style grid (minor + major lines) */
  .brand-grid-bg {
    position: absolute;
    inset: 0;
    background-image:
      linear-gradient(rgba(255,255,255,.10) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255,255,255,.10) 1px, transparent 1px),
      linear-gradient(rgba(255,255,255,.04) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255,255,255,.04) 1px, transparent 1px);
    background-size: 180px 180px, 180px 180px, 36px 36px, 36px 36px;
    pointer-events: none;
  }

  /* Soft accent glow at bottom-left */
  .brand-glow {
    position: absolute;
    bottom: -80px;
    left: -80px;
    width: 360px;
    height: 360px;
    background: radial-gradient(circle, rgba(240,92,161,.22) 0%, transparent 70%);
    pointer-events: none;
  }

  .brand-logo {
    display: flex;
    align-items: center;
    gap: 9px;
    position: relative;
    z-index: 1;
  }

  .brand-logo-img {
    width: 28px;
    height: 28px;
    filter: brightness(0) invert(1);
    opacity: .9;
  }

  .brand-logo-text {
    font-family: 'Poppins', 'Segoe UI', system-ui, -apple-system, sans-serif;
    font-weight: 900;
    font-style: italic;
    font-size: 17px;
    color: rgba(255,255,255,.9);
    letter-spacing: -0.05em;
  }

  .brand-body {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: center;
    position: relative;
    z-index: 1;
  }

  .brand-headline {
    font-size: 32px;
    font-weight: 550;
    line-height: 1.14;
    color: #ffffff;
    letter-spacing: -0.045em;
    margin-bottom: 32px;
  }

  /* The landing's icon-tile + copy idiom, at the brand panel's scale. */
  .brand-features {
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .brand-features li {
    display: flex;
    align-items: center;
    gap: 14px;
    font-size: 13px;
    color: rgba(255,255,255,.62);
    font-weight: 400;
    line-height: 1.5;
  }

  /* The brand accent (#f05ca1) literal, not var(--accent): this panel is dark in
     every theme, so it must not follow a theme token. */
  .brand-features .icon-tile {
    width: 32px;
    height: 32px;
    border-radius: 8px;
    background: rgba(240,92,161,.14);
    color: rgba(240,92,161,.9);
  }
  .brand-features .icon-tile svg {
    width: 14px;
    height: 14px;
  }

  .brand-footer {
    font-size: 11px;
    color: rgba(255,255,255,.52);
    position: relative;
    z-index: 1;
  }

  /* Brand panel entrance animations */
  @keyframes brandSlideUp {
    from { opacity: 0; transform: translateY(18px); }
    to   { opacity: 1; transform: none; }
  }

  .brand-anim {
    opacity: 0;
    animation: brandSlideUp 0.55s cubic-bezier(0.22, 1, 0.36, 1) both;
  }

  /* ── Form panel ──────────────────────────────── */

  /* Paper, not a panel fill — the jump from the landing page should be small. */
  .form-panel {
    position: relative;
    flex: 1;
    background: var(--bg-base);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 48px 40px;
    overflow-y: auto;
    min-height: 100vh;
  }

  /* Taken out of the flow on purpose: this panel centres its form, and a link
     added as a sibling would shove that form off centre. */
  .auth-back {
    position: absolute;
    top: 26px;
    left: 32px;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 6px 10px 6px 6px;
    border-radius: var(--radius-sm);
    font-size: 12px;
    font-weight: 500;
    color: var(--text-subtle);
    text-decoration: none;
    transition: color .15s, background .15s;
  }
  .auth-back:hover { color: var(--text-base); background: var(--bg-hover); text-decoration: none; }
  .auth-back:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

  .form-content {
    width: 100%;
    max-width: 360px;
    animation: brandSlideUp 0.5s cubic-bezier(0.22, 1, 0.36, 1) 120ms both;
  }

  /* ── Mobile ──────────────────────────────────── */

  @media (max-width: 720px) {
    .brand-panel { display: none; }
    .form-panel { padding: 64px 24px 40px; min-height: 100vh; }
    /* Room made for it above: with the brand panel gone this is the only
       chrome on the screen, and it must not sit on top of the form. */
    .auth-back { top: 18px; left: 16px; }
  }
</style>
