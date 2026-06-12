<script lang="ts">
  import type { Snippet } from 'svelte';
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
      <h2 class="brand-headline brand-anim" style="animation-delay: 80ms">Venue management<br />for modern teams.</h2>

      <ul class="brand-features">
        <li class="brand-anim" style="animation-delay: 200ms">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
          Manage every hall, seat, and layout
        </li>
        <li class="brand-anim" style="animation-delay: 280ms">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
          Streamline bookings and RSVPs
        </li>
        <li class="brand-anim" style="animation-delay: 360ms">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
          Collaborate across your organization
        </li>
      </ul>
    </div>

    <p class="brand-footer brand-anim" style="animation-delay: 440ms">© 2026 Hallify</p>
  </div>

  <!-- Right: form area -->
  <div class="form-panel">
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
    background: #0d1117;
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
    background: radial-gradient(circle, rgba(79,110,247,.22) 0%, transparent 70%);
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
    font-family: 'Poppins', sans-serif;
    font-weight: 900;
    font-style: italic;
    font-size: 17px;
    color: rgba(255,255,255,.9);
    letter-spacing: -0.01em;
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
    font-weight: 700;
    line-height: 1.2;
    color: #ffffff;
    letter-spacing: -0.02em;
    margin-bottom: 32px;
  }

  .brand-features {
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .brand-features li {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 13px;
    color: rgba(255,255,255,.55);
    font-weight: 400;
    line-height: 1.4;
  }

  .brand-features li svg {
    flex-shrink: 0;
    color: rgba(255,255,255,.35);
  }

  .brand-footer {
    font-size: 11px;
    color: rgba(255,255,255,.2);
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

  .form-panel {
    flex: 1;
    background: var(--bg-panel);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 48px 40px;
    overflow-y: auto;
    min-height: 100vh;
  }

  .form-content {
    width: 100%;
    max-width: 360px;
    animation: brandSlideUp 0.5s cubic-bezier(0.22, 1, 0.36, 1) 120ms both;
  }

  /* ── Mobile ──────────────────────────────────── */

  @media (max-width: 720px) {
    .brand-panel { display: none; }
    .form-panel { padding: 40px 24px; min-height: 100vh; }
  }
</style>
