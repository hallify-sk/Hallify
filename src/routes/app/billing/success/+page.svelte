<script lang="ts">
  import { pageTitle } from '$lib/page-title';
  import { onMount } from 'svelte';
  import { saas } from '$lib/analytics';
  import { t } from '$lib/i18n.svelte';
  import { playSound } from '$lib/sounds';
  import type { PageData } from './$types';
  let { data }: { data: PageData } = $props();

  interface Piece { left: number; delay: number; duration: number; color: string; rot: number; size: number; round: boolean; }
  let confetti = $state<Piece[]>([]);

  onMount(() => {
    // Only a payment Stripe confirmed is celebrated, and counted once per Checkout
    // session: reloading the page used to send another purchase every time.
    if (data.state !== 'paid') return;
    let seen = false;
    const key = `hallify-purchase-${data.sessionId}`;
    try { seen = localStorage.getItem(key) === '1'; localStorage.setItem(key, '1'); } catch { /* storage blocked */ }
    if (seen) return;
    saas.upgradeCompleted(data.planId ?? 'unknown', data.value, data.sessionId ?? undefined);

    playSound('order');
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) return;
    const colors = ['#f05ca1', '#a6225e', '#f58cba', '#6cc292', '#e0a850', '#202322'];
    confetti = Array.from({ length: 40 }, (_, i) => ({
      left: Math.random() * 100,
      delay: Math.random() * 0.5,
      duration: 2.2 + Math.random() * 1.6,
      color: colors[i % colors.length],
      rot: Math.random() * 360,
      size: 6 + Math.random() * 6,
      round: Math.random() > 0.5,
    }));
  });

  const title = $derived(
    data.state === 'paid' ? t.accountExtra.paymentSuccessTitle
    : data.state === 'pending' ? t.accountExtra.paymentPendingTitle
    : t.accountExtra.paymentUnknownTitle
  );
</script>

<svelte:head><title>{pageTitle(title)}</title></svelte:head>

<div class="success-page">
  <div class="confetti" aria-hidden="true">
    {#each confetti as p}
      <span
        class="piece"
        class:round={p.round}
        style="left:{p.left}%; width:{p.size}px; height:{p.size}px; background:{p.color}; animation-delay:{p.delay}s; animation-duration:{p.duration}s; --rot:{p.rot}deg;"
      ></span>
    {/each}
  </div>

  <div class="wrap">
    <section class="section section--lead success-panel">
      {#if data.state === 'paid'}
        <div class="check-wrap">
          <span class="ring"></span>
          <span class="ring ring-2"></span>
          <div class="check">
            <svg viewBox="0 0 52 52" width="48" height="48" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">
              <path class="check-path" d="M14 27l8 8 16-18" />
            </svg>
          </div>
        </div>
      {/if}

      <h1>{title}</h1>
      <p class="sub">
        {#if data.state === 'paid' && data.planName}
          {data.orgName ?? t.accountExtra.yourOrganization} {t.accountExtra.nowOnPlanPrefix} <strong>{data.planName}</strong>{t.accountExtra.nowOnPlanSuffix}
        {:else if data.state === 'paid'}
          {t.accountExtra.subscriptionActive}
        {:else if data.state === 'pending'}
          {t.accountExtra.paymentPendingBody}
        {:else}
          {t.accountExtra.paymentUnknownBody}
        {/if}
      </p>

      <div class="actions">
        <a href="/app/manage" class="btn-primary">{t.accountExtra.goToDashboard}</a>
        <a href="/app/billing" class="btn-ghost">{t.accountExtra.viewBilling}</a>
      </div>
    </section>
  </div>
</div>

<style>
  .success-page {
    position: relative;
    min-height: 100%;
    display: flex; align-items: center; justify-content: center;
    padding: 48px 0;
    overflow: hidden;
    background:
      radial-gradient(60% 50% at 50% 0%, color-mix(in srgb, var(--accent) 14%, transparent), transparent 70%),
      var(--bg-base);
  }

  /* No box: the mark, the heading and the actions sit on the page. */
  .success-panel {
    position: relative; z-index: 2;
    max-width: 440px; margin-inline: auto; text-align: center;
    animation: cardIn .6s cubic-bezier(.16,1,.3,1) both;
  }

  .check-wrap { position: relative; width: 96px; height: 96px; margin: 0 auto 22px; display: flex; align-items: center; justify-content: center; }

  .check {
    width: 84px; height: 84px; border-radius: 50%;
    background: var(--accent);
    color: var(--accent-contrast);
    display: flex; align-items: center; justify-content: center;
    animation: pop .55s cubic-bezier(.18,1.4,.4,1) .12s both;
  }

  .check-path { stroke-dasharray: 48; stroke-dashoffset: 48; animation: draw .45s ease-out .5s forwards; }

  .ring {
    position: absolute; inset: 0; margin: auto; width: 84px; height: 84px; border-radius: 50%;
    border: 2px solid color-mix(in srgb, var(--accent) 55%, transparent);
    animation: ripple 1.1s ease-out .35s 1 both;
  }
  .ring-2 { animation-delay: .55s; }

  h1 { font-size: var(--display-size); font-weight: 550; letter-spacing: -.055em; line-height: 1.08; color: var(--text-base); margin: 0 0 14px; animation: riseIn .5s ease-out .3s both; }
  .sub { font-size: var(--body-size); line-height: var(--body-leading); color: var(--text-muted); margin: 0 0 28px; animation: riseIn .5s ease-out .42s both; }
  .sub strong { color: var(--text-base); font-weight: 600; }

  .actions { display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; animation: riseIn .5s ease-out .54s both; }
  .btn-primary {
    display: inline-flex; align-items: center; padding: 11px 22px; border-radius: var(--radius-sm);
    background: var(--accent); color: var(--accent-contrast); font-size: 13px; font-weight: 650; text-decoration: none;
    transition: transform .2s, background .2s;
  }
  .btn-primary:hover { background: var(--accent-hover); transform: translateY(-2px); }
  .btn-primary:active { transform: translateY(0); }
  .btn-ghost {
    display: inline-flex; align-items: center; padding: 11px 22px; border-radius: var(--radius-sm);
    background: transparent; color: var(--text-base); border: 1px solid var(--border);
    font-size: 13px; font-weight: 600; text-decoration: none; transition: border-color .15s, background .15s;
  }
  .btn-ghost:hover { border-color: var(--text-subtle); background: var(--bg-hover); }

  /* Confetti */
  .confetti { position: absolute; inset: 0; z-index: 1; pointer-events: none; }
  .piece { position: absolute; top: -24px; border-radius: 2px; opacity: 0; animation-name: fall; animation-timing-function: linear; animation-fill-mode: forwards; }
  .piece.round { border-radius: 50%; }

  @keyframes fall {
    0% { transform: translateY(0) rotate(0deg); opacity: 1; }
    100% { transform: translateY(105vh) rotate(calc(var(--rot) * 3)); opacity: 1; }
  }
  @keyframes cardIn { from { opacity: 0; transform: translateY(16px) scale(.97); } to { opacity: 1; transform: none; } }
  @keyframes pop { 0% { transform: scale(0); } 100% { transform: scale(1); } }
  @keyframes draw { to { stroke-dashoffset: 0; } }
  @keyframes ripple { 0% { transform: scale(1); opacity: .7; } 100% { transform: scale(2.1); opacity: 0; } }
  @keyframes riseIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }

  @media (prefers-reduced-motion: reduce) {
    .success-panel, .check, .check-path, .ring, h1, .sub, .actions { animation: none !important; }
    .check-path { stroke-dashoffset: 0; }
    .ring { display: none; }
    .btn-primary:hover { transform: none; }
  }
</style>
