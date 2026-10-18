<script lang="ts">
  /**
   * First run, rendered inside the console like any other page.
   *
   * It deliberately does NOT take over the screen. Someone who wants to look
   * around mid-flow should be able to, and seeing the navigation while being
   * walked through it is how the walkthrough teaches where things live —
   * which a full-bleed wizard, however focused, cannot do.
   */
  import { enhance } from '$app/forms';
  import { t, getLocale } from '$lib/i18n.svelte';
  import { eur } from '$lib/extras';
  import { ONBOARDING_STEPS, stepIndex, type OnboardingStep } from '$lib/onboarding';
  import { SETUP_SERVICE_INCLUDES, SETUP_SERVICE_GUARANTEE, SETUP_SERVICE_EXCLUDES } from '$lib/setup-service';
  import VenueLocationPicker from '$lib/marketing/VenueLocationPicker.svelte';
  import type { PageData, ActionData } from './$types';

  let { data, form }: { data: PageData; form: ActionData } = $props();

  const locale = $derived(getLocale() === 'en' ? 'en' : 'sk');

  // The step shown. Server state is the floor; moving forward is local so a
  // step does not need a round trip just to be read.
  let viewing = $state<OnboardingStep>(data.state.step);
  $effect(() => {
    // A successful action advances the server's step; follow it.
    if (stepIndex(data.state.step) > stepIndex(viewing)) viewing = data.state.step;
  });

  const index = $derived(stepIndex(viewing));
  const total = ONBOARDING_STEPS.length - 1; // 'done' is the finish line, not a step

  const STEP_LABELS = $derived<Record<OnboardingStep, string>>({
    venue: t.onboarding.stepVenue,
    details: t.onboarding.stepDetails,
    plan: t.onboarding.stepPlan,
    help: t.onboarding.stepHelp,
    done: t.onboarding.stepDone
  });

  const PAID = ['starter', 'professional'] as const;

  // ── Address → map ──────────────────────────────────────────────────────
  // Typing an address and seeing the pin land on it is the whole point of
  // asking for one, and it is also the only check an operator gets that we
  // read it the way they meant it.
  let address = $state(data.hall?.address ?? '');
  let latitude = $state<number | null>(data.hall?.latitude ?? null);
  let longitude = $state<number | null>(data.hall?.longitude ?? null);
  let geoState = $state<'idle' | 'searching' | 'found' | 'notfound'>(
    data.hall?.latitude != null ? 'found' : 'idle'
  );

  /** Debounced: a lookup per keystroke would hammer a rate-limited proxy. */
  let geoTimer: ReturnType<typeof setTimeout> | undefined;
  let lastLookup = '';
  function scheduleLookup() {
    clearTimeout(geoTimer);
    const query = address.trim();
    if (query.length < 4 || query === lastLookup) return;
    geoTimer = setTimeout(() => void lookup(query), 700);
  }

  async function lookup(query: string) {
    lastLookup = query;
    geoState = 'searching';
    try {
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(query)}`);
      const body = res.ok ? await res.json() : null;
      if (body?.result) {
        latitude = body.result.latitude;
        longitude = body.result.longitude;
        geoState = 'found';
      } else {
        geoState = 'notfound';
      }
    } catch {
      geoState = 'notfound';
    }
  }
</script>

<svelte:head><title>{t.onboarding.title} – Hallify</title></svelte:head>

<div class="ob">
  <header class="ob-head">
    <p class="eyebrow">{t.onboarding.eyebrow} · {data.orgName}</p>
    <!-- Always available, and it LEAVES rather than finishes: skipping must not
         mark the flow done, or there is no way back to it. -->
    <form method="POST" action="?/leave" class="ob-skip-form" use:enhance>
      <button type="submit" class="ob-skip">{t.onboarding.skipAll}</button>
    </form>
  </header>

  <div class="ob-progress" role="list" aria-label={t.onboarding.title}>
    {#each ONBOARDING_STEPS.slice(0, total) as s, i (s)}
      <div class="ob-tick" class:is-done={i < index} class:is-current={i === index} role="listitem">
        <span class="ob-tick-dot" aria-hidden="true"></span>
        <span class="ob-tick-label">{STEP_LABELS[s]}</span>
      </div>
    {/each}
  </div>

  <main class="ob-body">
    {#if form?.error}<div class="alert-error">{form.error}</div>{/if}

    <!-- ── 1. A venue ───────────────────────────────────────────── -->
    {#if viewing === 'venue'}
      <h1>{t.onboarding.venueTitle}</h1>
      <p class="ob-lead">{t.onboarding.venueLead}</p>

      {#if data.hall}
        <div class="card--inset ob-created">
          <span class="icon-tile">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="20 6 9 17 4 12"/></svg>
          </span>
          <div>
            <strong>{data.hall.name}</strong>
            <span>{data.hall.max_people} {t.common.people}</span>
          </div>
        </div>
        <button class="btn-action" onclick={() => (viewing = 'details')}>{t.onboarding.next}</button>
      {:else}
        <form method="POST" action="?/createVenue" class="ob-form" use:enhance>
          <div class="field">
            <label class="field-label" for="ob-name">{t.onboarding.venueName}</label>
            <input id="ob-name" name="name" type="text" maxlength="80" required
              placeholder={t.onboarding.venueNamePlaceholder} />
          </div>
          <div class="field">
            <label class="field-label" for="ob-cap">{t.onboarding.venueCapacity}</label>
            <input id="ob-cap" name="capacity" type="number" min="1" max="100000" value="50" />
            <p class="ob-hint">{t.onboarding.venueCapacityHint}</p>
          </div>
          <div class="ob-actions">
            <button type="submit" class="btn-action">{t.onboarding.createVenue}</button>
            <button type="button" class="ob-link" onclick={() => (viewing = 'details')}>{t.onboarding.skipStep}</button>
          </div>
        </form>
      {/if}

    <!-- ── 2. What a visitor needs to know ──────────────────────── -->
    {:else if viewing === 'details'}
      <h1>{t.onboarding.detailsTitle}</h1>
      <p class="ob-lead">{t.onboarding.detailsLead}</p>

      {#if data.hall}
        <form method="POST" action="?/saveDetails" class="ob-form" use:enhance>
          <input type="hidden" name="hallId" value={data.hall.id} />
          <div class="field">
            <label class="field-label" for="ob-addr">{t.onboarding.venueAddress}</label>
            <input id="ob-addr" name="address" type="text" maxlength="200"
              bind:value={address} oninput={scheduleLookup}
              placeholder={t.onboarding.venueAddressPlaceholder} />
            <p class="ob-hint" aria-live="polite">
              {#if geoState === 'searching'}{t.onboarding.geoSearching}
              {:else if geoState === 'found'}{t.onboarding.geoFound}
              {:else if geoState === 'notfound'}{t.onboarding.geoNotFound}
              {:else}{t.onboarding.venueAddressHint}{/if}
            </p>
          </div>

          <!-- The pin is draggable: geocoding gets the street right and the
               building wrong often enough that an operator needs the last word. -->
          <input type="hidden" name="latitude" value={latitude ?? ''} />
          <input type="hidden" name="longitude" value={longitude ?? ''} />
          <div class="ob-map">
            <VenueLocationPicker bind:latitude bind:longitude english={locale === 'en'} />
          </div>

          <label class="ob-toggle">
            <input type="checkbox" name="allowReservations" />
            <span>
              <strong>{t.onboarding.allowReservations}</strong>
              <span>{t.onboarding.allowReservationsHint}</span>
            </span>
          </label>

          <div class="ob-actions">
            <button type="submit" class="btn-action">{t.onboarding.saveAndNext}</button>
            <button type="button" class="ob-link" onclick={() => (viewing = 'plan')}>{t.onboarding.skipStep}</button>
          </div>
        </form>
      {:else}
        <p class="ob-lead">{t.onboarding.detailsNoVenue}</p>
        <div class="ob-actions">
          <button class="btn-action" onclick={() => (viewing = 'plan')}>{t.onboarding.next}</button>
          <button type="button" class="ob-link" onclick={() => (viewing = 'venue')}>{t.onboarding.backStep}</button>
        </div>
      {/if}

    <!-- ── 3. What the plan does and does not do ────────────────── -->
    {:else if viewing === 'plan'}
      <h1>{t.onboarding.planTitle}</h1>
      <!-- The honest version: what the free plan is for, and the exact line it
           stops at. An upgrade prompt that hides the limit gets clicked once. -->
      <p class="ob-lead">{t.onboarding.planLead}</p>

      <div class="ob-plan-now card--inset">
        <div>
          <span class="ob-plan-tag">{t.onboarding.yourPlan}</span>
          <strong>{data.plans[data.plan].name}</strong>
        </div>
        <ul>
          <li>{data.plans.free.limits.maxHalls} {t.onboarding.limitHalls}</li>
          <li>{data.plans.free.limits.maxReservationsPerHallMonth} {t.onboarding.limitReservations}</li>
          <li>{data.plans.free.limits.maxMembers} {t.onboarding.limitMembers}</li>
          <li class="is-off">{t.onboarding.limitNoDomain}</li>
        </ul>
      </div>

      <div class="ob-plans">
        {#each PAID as id (id)}
          {@const plan = data.plans[id]}
          <div class="ob-plan">
            <div class="ob-plan-head">
              <strong>{plan.name}</strong>
              <span>€{plan.priceMonthly}<small>{t.onboarding.perMonth}</small></span>
            </div>
            <ul>
              <li>{plan.limits.maxHalls} {t.onboarding.limitHalls}</li>
              <li>{plan.limits.maxReservationsPerHallMonth} {t.onboarding.limitReservations}</li>
              <li>{t.onboarding.limitDomain}</li>
              <li>{t.onboarding.limitBranding}</li>
            </ul>
          </div>
        {/each}
      </div>

      <div class="ob-actions">
        <a class="btn-action" href="/app/billing">{t.onboarding.seePlans}</a>
        <form method="POST" action="?/advance" use:enhance>
          <input type="hidden" name="from" value="plan" />
          <button type="submit" class="ob-link">{t.onboarding.stayFree}</button>
        </form>
      </div>

    <!-- ── 4. Or have us do all of it ───────────────────────────── -->
    {:else if viewing === 'help'}
      <h1>{t.setupService.title}</h1>
      <p class="ob-lead">{t.setupService.lead}</p>

      {#if data.setupRequested}
        <div class="card--inset ob-created">
          <span class="icon-tile">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="20 6 9 17 4 12"/></svg>
          </span>
          <div><strong>{t.setupService.pendingTitle}</strong><span>{t.setupService.pendingBody}</span></div>
        </div>
      {:else}
        <div class="ob-offer card--inset">
          <p class="ob-price"><strong>{eur(data.setupPriceCents)}</strong> <span>{t.setupService.oneOff}</span></p>
          <ul class="ob-offer-list">
            {#each SETUP_SERVICE_INCLUDES as item (item.en)}
              <li>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>
                {item[locale]}
              </li>
            {/each}
          </ul>
          <p class="ob-guarantee">{SETUP_SERVICE_GUARANTEE[locale]}</p>
          <p class="ob-excl">{SETUP_SERVICE_EXCLUDES[locale]}</p>
        </div>
      {/if}

      <!-- The line that makes it safe to say no now. -->
      <p class="ob-findit">{t.onboarding.findOfferLater}</p>

      <div class="ob-actions">
        <a class="btn-action" href="/app/billing">{t.onboarding.goToAddons}</a>
        <form method="POST" action="?/advance" use:enhance>
          <input type="hidden" name="from" value="help" />
          <button type="submit" class="ob-link">{t.onboarding.doItMyself}</button>
        </form>
      </div>

    <!-- ── 5. Out into the product ──────────────────────────────── -->
    {:else}
      <h1>{t.onboarding.doneTitle}</h1>
      <p class="ob-lead">{t.onboarding.doneLead}</p>

      <ul class="ob-next">
        <li><a href="/app/manage/halls">{t.onboarding.nextHalls}</a><span>{t.onboarding.nextHallsHint}</span></li>
        <li><a href="/app/manage/settings/site">{t.onboarding.nextSite}</a><span>{t.onboarding.nextSiteHint}</span></li>
        <li><a href="/app/manage/help">{t.onboarding.nextHelp}</a><span>{t.onboarding.nextHelpHint}</span></li>
      </ul>

      <form method="POST" action="?/finish" use:enhance>
        <button type="submit" class="btn-action">{t.onboarding.openConsole}</button>
      </form>
    {/if}
  </main>
</div>

<style>
  /* Sits in the console's scroll container, so it sizes to its content rather
     than claiming a viewport height it does not own. */
  .ob {
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  .ob-head {
    width: 100%;
    max-width: 720px;
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 26px 24px 0;
  }
  .ob-head .eyebrow { margin: 0; }
  .ob-skip-form { margin-left: auto; }
  .ob-skip {
    background: none; border: 0; cursor: pointer; font-family: inherit;
    font-size: 12px; color: var(--text-subtle); padding: 6px 8px; border-radius: var(--radius-sm);
    transition: color .15s, background .15s;
  }
  .ob-skip:hover { color: var(--text-base); background: var(--bg-hover); }

  .ob-progress {
    width: 100%;
    max-width: 720px;
    display: flex;
    gap: 6px;
    padding: 20px 24px 0;
  }
  .ob-tick { flex: 1; display: flex; flex-direction: column; gap: 7px; }
  .ob-tick-dot {
    display: block; height: 3px; border-radius: 2px;
    background: var(--border); transition: background .25s;
  }
  .ob-tick.is-done .ob-tick-dot { background: var(--success); }
  .ob-tick.is-current .ob-tick-dot { background: var(--accent); }
  .ob-tick-label { font-size: 10px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; color: var(--text-subtle); }
  .ob-tick.is-current .ob-tick-label { color: var(--text-base); }

  .ob-body { width: 100%; max-width: 720px; padding: 34px 24px 64px; }
  .ob-body h1 { margin: 0 0 10px; }
  .ob-lead { font-size: 15px; line-height: 1.75; color: var(--text-muted); margin: 0 0 26px; max-width: 58ch; }
  .ob-hint { font-size: var(--meta-size); color: var(--text-subtle); margin: 6px 0 0; }

  .ob-form { display: flex; flex-direction: column; gap: 18px; max-width: 420px; }
  /* The step carrying a map gets the whole column; 420px is a form width, not
     a map width. */
  .ob-form:has(.ob-map) { max-width: none; }
  .ob-map { max-width: 100%; }
  .ob-actions { display: flex; align-items: center; gap: 16px; margin-top: 8px; flex-wrap: wrap; }
  .ob-link {
    background: none; border: 0; cursor: pointer; font-family: inherit;
    font-size: 13px; color: var(--text-muted); text-decoration: underline;
    text-underline-offset: 3px; padding: 0;
  }
  .ob-link:hover { color: var(--text-base); }

  .ob-created { display: flex; align-items: center; gap: 13px; padding: 16px 18px; margin-bottom: 24px; }
  .ob-created strong { display: block; font-size: 14px; font-weight: 650; }
  .ob-created span { font-size: var(--meta-size); color: var(--text-muted); line-height: 1.6; }

  .ob-toggle { display: flex; align-items: flex-start; gap: 11px; cursor: pointer; }
  .ob-toggle input { margin-top: 3px; flex-shrink: 0; }
  .ob-toggle > span { display: flex; flex-direction: column; gap: 3px; }
  .ob-toggle strong { font-size: 13.5px; font-weight: 600; }
  .ob-toggle span span { font-size: var(--meta-size); color: var(--text-muted); line-height: 1.6; }

  /* ── Plan step ── */
  .ob-plan-now { padding: 16px 18px; margin-bottom: 16px; }
  .ob-plan-tag { display: block; font-size: 10px; font-weight: 650; text-transform: uppercase; letter-spacing: .09em; color: var(--text-subtle); }
  .ob-plan-now strong { font-size: 17px; font-weight: 650; letter-spacing: -.03em; }
  .ob-plan-now ul, .ob-plan ul { list-style: none; padding: 0; margin: 12px 0 0; display: flex; flex-direction: column; gap: 6px; }
  .ob-plan-now li, .ob-plan li { font-size: 12.5px; color: var(--text-muted); }
  .ob-plan-now li.is-off { color: var(--text-subtle); text-decoration: line-through; }

  .ob-plans { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 12px; margin-bottom: 26px; }
  .ob-plan { padding: 16px 18px; border: 1px solid var(--border); border-radius: var(--radius); }
  .ob-plan-head { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; }
  .ob-plan-head strong { font-size: 15px; font-weight: 650; letter-spacing: -.03em; }
  .ob-plan-head span { font-size: 15px; font-weight: 650; }
  .ob-plan-head small { font-size: 11px; font-weight: 500; color: var(--text-subtle); }

  /* ── Offer step ── */
  .ob-offer { padding: 20px; margin-bottom: 18px; }
  .ob-price { display: flex; align-items: baseline; gap: 8px; margin: 0 0 16px; }
  .ob-price strong { font-size: 29px; font-weight: 650; letter-spacing: -.04em; }
  .ob-price span { font-size: var(--meta-size); color: var(--text-muted); }
  .ob-offer-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 8px; }
  .ob-offer-list li { display: flex; align-items: flex-start; gap: 9px; font-size: 13px; line-height: 1.6; color: var(--text-muted); }
  .ob-offer-list svg { flex-shrink: 0; margin-top: 3px; color: var(--success); }
  /* The promise, not a deliverable — given its own weight. */
  .ob-guarantee {
    margin: 16px 0 0; padding: 10px 13px;
    border-radius: var(--radius-sm);
    background: var(--success-dim);
    color: color-mix(in srgb, var(--success) 72%, var(--text-base));
    font-size: 12.5px; font-weight: 600; line-height: 1.6;
  }
  .ob-excl { margin: 12px 0 0; font-size: var(--meta-size); line-height: 1.7; color: var(--text-subtle); }
  .ob-findit {
    margin: 0 0 22px; padding: 11px 13px;
    border-left: 2px solid var(--border);
    font-size: var(--meta-size); line-height: 1.7; color: var(--text-muted);
  }

  /* ── Done step ── */
  .ob-next { list-style: none; padding: 0; margin: 0 0 28px; display: flex; flex-direction: column; gap: 14px; }
  .ob-next li { display: flex; flex-direction: column; gap: 3px; }
  .ob-next a { font-size: 14px; font-weight: 600; color: var(--accent-ink); }
  .ob-next span { font-size: var(--meta-size); color: var(--text-muted); line-height: 1.6; }

  @media (max-width: 620px) {
    .ob-tick-label { display: none; }
    .ob-body { padding: 26px 18px 48px; }
  }
</style>
