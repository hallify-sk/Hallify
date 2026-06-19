<script lang="ts">
  import { onMount } from 'svelte';
  import { t } from '$lib/i18n.svelte';
  import { playSound } from '$lib/sounds';
  import type { PageData } from './$types';
  let { data }: { data: PageData } = $props();

  interface Piece { left: number; delay: number; duration: number; color: string; rot: number; size: number; round: boolean; }
  let confetti = $state<Piece[]>([]);

  onMount(() => {
    playSound('order');
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) return;
    const colors = ['#4f6ef7', '#22c55e', '#f59e0b', '#e11d48', '#0ea5e9', '#8b5cf6'];
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
</script>

<svelte:head><title>{t.accountExtra.paymentSuccessTitle} – Hallify</title></svelte:head>

<div class="wrap">
  <div class="confetti" aria-hidden="true">
    {#each confetti as p}
      <span
        class="piece"
        class:round={p.round}
        style="left:{p.left}%; width:{p.size}px; height:{p.size}px; background:{p.color}; animation-delay:{p.delay}s; animation-duration:{p.duration}s; --rot:{p.rot}deg;"
      ></span>
    {/each}
  </div>

  <div class="card">
    <div class="check-wrap">
      <span class="ring"></span>
      <span class="ring ring-2"></span>
      <div class="check">
        <svg viewBox="0 0 52 52" width="48" height="48" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">
          <path class="check-path" d="M14 27l8 8 16-18" />
        </svg>
      </div>
    </div>

    <h1>{t.accountExtra.paymentSuccessTitle}</h1>
    <p class="sub">
      {#if data.planName}
        {data.orgName ?? t.accountExtra.yourOrganization} {t.accountExtra.nowOnPlanPrefix} <strong>{data.planName}</strong> {t.accountExtra.nowOnPlanSuffix}
      {:else}
        {t.accountExtra.subscriptionActive}
      {/if}
    </p>

    <div class="actions">
      <a href="/app/manage" class="btn-primary">{t.accountExtra.goToDashboard}</a>
      <a href="/app/billing" class="btn-ghost">{t.accountExtra.viewBilling}</a>
    </div>
  </div>
</div>

<style>
  .wrap {
    position: relative;
    min-height: 100%;
    display: flex; align-items: center; justify-content: center;
    padding: 48px 24px;
    overflow: hidden;
    background:
      radial-gradient(60% 50% at 50% 0%, color-mix(in srgb, var(--accent) 14%, transparent), transparent 70%),
      var(--bg-base);
  }

  .card {
    position: relative; z-index: 2;
    width: 100%; max-width: 440px; text-align: center;
    background: var(--bg-panel); border: 1px solid var(--border);
    border-radius: 20px; padding: 44px 32px;
    box-shadow: 0 24px 60px rgba(0,0,0,.14);
    animation: cardIn .6s cubic-bezier(.16,1,.3,1) both;
  }

  .check-wrap { position: relative; width: 96px; height: 96px; margin: 0 auto 22px; display: flex; align-items: center; justify-content: center; }

  .check {
    width: 84px; height: 84px; border-radius: 50%;
    background: linear-gradient(135deg, var(--accent), color-mix(in srgb, var(--accent) 70%, #22c55e));
    display: flex; align-items: center; justify-content: center;
    box-shadow: 0 12px 30px color-mix(in srgb, var(--accent) 40%, transparent);
    animation: pop .55s cubic-bezier(.18,1.4,.4,1) .12s both;
  }

  .check-path { stroke-dasharray: 48; stroke-dashoffset: 48; animation: draw .45s ease-out .5s forwards; }

  .ring {
    position: absolute; inset: 0; margin: auto; width: 84px; height: 84px; border-radius: 50%;
    border: 2px solid color-mix(in srgb, var(--accent) 55%, transparent);
    animation: ripple 1.1s ease-out .35s 1 both;
  }
  .ring-2 { animation-delay: .55s; }

  h1 { font-size: 24px; font-weight: 800; letter-spacing: -.02em; color: var(--text-base); margin: 0 0 10px; animation: riseIn .5s ease-out .3s both; }
  .sub { font-size: 14px; line-height: 1.6; color: var(--text-muted); margin: 0 0 26px; animation: riseIn .5s ease-out .42s both; }
  .sub strong { color: var(--text-base); }

  .actions { display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; animation: riseIn .5s ease-out .54s both; }
  .btn-primary {
    display: inline-flex; align-items: center; padding: 11px 22px; border-radius: 10px;
    background: var(--accent); color: #fff; font-size: 14px; font-weight: 700; text-decoration: none;
    box-shadow: 0 6px 18px color-mix(in srgb, var(--accent) 32%, transparent); transition: opacity .12s, transform .12s;
  }
  .btn-primary:hover { opacity: .92; transform: translateY(-1px); }
  .btn-ghost {
    display: inline-flex; align-items: center; padding: 11px 22px; border-radius: 10px;
    background: transparent; color: var(--text-base); border: 1px solid var(--border);
    font-size: 14px; font-weight: 600; text-decoration: none; transition: border-color .12s, color .12s;
  }
  .btn-ghost:hover { border-color: var(--accent); color: var(--accent); }

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
    .card, .check, .check-path, .ring, h1, .sub, .actions { animation: none !important; }
    .check-path { stroke-dashoffset: 0; }
    .ring { display: none; }
  }
</style>
