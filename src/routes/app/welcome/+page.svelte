<script lang="ts">
  import { pageTitle } from '$lib/page-title';
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
  // Follow the server only when its step CHANGES — i.e. an action advanced it.
  // Comparing against `viewing` instead would snap the view forward again the
  // moment someone stepped back, making the Back button do nothing.
  let serverStep = data.state.step;
  $effect(() => {
    if (data.state.step !== serverStep) {
      serverStep = data.state.step;
      viewing = data.state.step;
    }
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

  // The plan screen describes the plan the organisation is ON. It used to print the
  // Free limits and "stay on free" to every organisation, paid ones included.
  const current = $derived(data.plans[data.plan] ?? data.plans.free);
  const onFree = $derived(data.plan === 'free');
  // Upgrades only: a plan at or below the current price is not an offer.
  const upgrades = $derived(
    PAID.filter((id) => (data.plans[id].priceMonthly ?? 0) > (current.priceMonthly ?? 0) && data.plan !== 'enterprise')
  );
  const limitValue = (n: number) => (n === -1 ? t.onboarding.limitUnlimited : String(n));

  // Ties an error to the screen that produced it; moving to another step drops it.
  const error = $derived(form?.error && (!('step' in form) || form.step === viewing) ? form.error : null);

  // ── Address ⇄ map ──────────────────────────────────────────────────────
  //
  // Both directions. Typing an address drops the pin on it; moving the pin
  // writes the address back. Either one alone leaves the operator guessing
  // whether we understood the other.
  //
  // The two have to be kept from chasing each other: every write to one side
  // changes the other, and without a guard the echo comes straight back and
  // overwrites what was just typed. So whichever side we wrote last is
  // recorded, and a change matching that record is recognised as our own echo
  // and ignored.
  let address = $state(data.hall?.address ?? '');
  let latitude = $state<number | null>(data.hall?.latitude ?? null);
  let longitude = $state<number | null>(data.hall?.longitude ?? null);
  let geoState = $state<'idle' | 'searching' | 'found' | 'notfound'>(
    data.hall?.latitude != null ? 'found' : 'idle'
  );

  const coordKey = (lat: number | null, lng: number | null) =>
    lat === null || lng === null ? null : `${lat},${lng}`;

  // Plain variables, not $state: these are bookkeeping, and making them
  // reactive would feed the effect below its own writes.
  let writtenCoords: string | null = coordKey(latitude, longitude);
  let lastQuery = '';
  let geoTimer: ReturnType<typeof setTimeout> | undefined;

  /** Address → pin. Debounced; a lookup per keystroke would hammer a
   *  rate-limited proxy. */
  function scheduleLookup() {
    clearTimeout(geoTimer);
    const query = address.trim();
    if (query.length < 4 || query === lastQuery) return;
    geoTimer = setTimeout(() => void lookup(query), 700);
  }

  async function lookup(query: string) {
    lastQuery = query;
    geoState = 'searching';
    try {
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(query)}`);
      const body = res.ok ? await res.json() : null;
      if (body?.result) {
        latitude = body.result.latitude;
        longitude = body.result.longitude;
        // Ours — so the effect below leaves the typed address alone.
        writtenCoords = coordKey(latitude, longitude);
        geoState = 'found';
      } else {
        geoState = 'notfound';
      }
    } catch {
      geoState = 'notfound';
    }
  }

  /** Pin → address, for a click or a drag on the map. */
  async function reverseLookup(lat: number, lng: number) {
    geoState = 'searching';
    try {
      const res = await fetch(`/api/geocode?lat=${lat}&lon=${lng}`);
      const body = res.ok ? await res.json() : null;
      if (body?.label) {
        address = body.label;
        // Stops the next keystroke re-geocoding an address we just derived.
        lastQuery = body.label.trim();
        geoState = 'found';
      } else {
        geoState = 'notfound';
      }
    } catch {
      geoState = 'notfound';
    }
  }

  $effect(() => {
    const key = coordKey(latitude, longitude);
    // Clearing the pin is not a reason to wipe an address they typed.
    if (key === null) { writtenCoords = null; return; }
    if (key === writtenCoords) return;
    writtenCoords = key;
    void reverseLookup(latitude!, longitude!);
  });
</script>

<svelte:head><title>{pageTitle(t.onboarding.title)}</title></svelte:head>

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
    {#if error}<div class="alert-error" role="alert">{error}</div>{/if}

    <!-- ── 1. A venue ───────────────────────────────────────────── -->
    {#if viewing === 'venue'}
      {#if !data.hall && data.hallCount > 0}
        <!-- Running the wizard again, or an organisation that already has venues:
             "your first venue" would be untrue. -->
        <h1>{t.onboarding.venueTitleMore}</h1>
        <p class="ob-lead">{t.onboarding.venueLeadMore.replace('{count}', String(data.hallCount))}</p>
      {:else}
        <h1>{t.onboarding.venueTitle}</h1>
        <p class="ob-lead">{t.onboarding.venueLead}</p>
      {/if}

      {#if data.hall}
        <div class="card--inset ob-created">
          <span class="icon-tile">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="20 6 9 17 4 12"/></svg>
          </span>
          <div>
            <strong>{data.hall.name}</strong>
            <span>{data.hall.max_people} {t.units.people(data.hall.max_people)}</span>
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
            <!-- Enter looks up the address instead of submitting. In a form
                 this short it otherwise advances the whole step mid-sentence,
                 which is how you lose your place in a wizard. -->
            <input id="ob-addr" name="address" type="text" maxlength="200"
              bind:value={address} oninput={scheduleLookup}
              onkeydown={(e) => {
                if (e.key !== 'Enter') return;
                e.preventDefault();
                clearTimeout(geoTimer);
                const q = address.trim();
                if (q.length >= 4) void lookup(q);
              }}
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

          <!-- The app has one switch (.ui-switch in app.css); a bare checkbox
               here was simply an oversight. -->
          <div class="ob-toggle">
            <label class="ui-switch">
              <input id="ob-allow" type="checkbox" name="allowReservations" />
              <span class="ui-switch-track" aria-hidden="true"></span>
            </label>
            <label class="ob-toggle-copy" for="ob-allow">
              <strong>{t.onboarding.allowReservations}</strong>
              <span>{t.onboarding.allowReservationsHint}</span>
            </label>
          </div>

          <div class="ob-actions">
            <button type="submit" class="btn-action">{t.onboarding.saveAndNext}</button>
            <button type="button" class="ob-link" onclick={() => (viewing = 'plan')}>{t.onboarding.skipStep}</button>
          </div>
        </form>
      {:else}
        <p class="ob-lead">{data.hallCount > 0 ? t.onboarding.detailsExistingVenues : t.onboarding.detailsNoVenue}</p>
        <div class="ob-actions">
          <button class="btn-action" onclick={() => (viewing = 'plan')}>{t.onboarding.next}</button>
        </div>
      {/if}

    <!-- ── 3. What the plan does and does not do ────────────────── -->
    {:else if viewing === 'plan'}
      <h1>{t.onboarding.planTitle}</h1>
      <!-- The honest version: what the free plan is for, and the exact line it
           stops at. An upgrade prompt that hides the limit gets clicked once. -->
      <p class="ob-lead">{onFree ? t.onboarding.planLead : t.onboarding.planLeadPaid}</p>

      <div class="ob-plan-now card--inset">
        <div>
          <span class="ob-plan-tag">{t.onboarding.yourPlan}</span>
          <strong>{current.name}</strong>
        </div>
        <ul>
          <li>{t.onboarding.limitHallsLabel}: {limitValue(current.limits.maxHalls)}</li>
          <li>{t.onboarding.limitReservationsLabel}: {limitValue(current.limits.maxReservationsPerHallMonth)}</li>
          <li>{t.onboarding.limitMembersLabel}: {limitValue(current.limits.maxMembers)}</li>
          {#if current.limits.customDomains}
            <li>{t.onboarding.limitDomain}</li>
          {:else}
            <li class="is-off">{t.onboarding.limitNoDomain}</li>
          {/if}
        </ul>
      </div>

      {#if upgrades.length > 0}
        <div class="ob-plans">
          {#each upgrades as id (id)}
            {@const plan = data.plans[id]}
            <div class="ob-plan">
              <div class="ob-plan-head">
                <strong>{plan.name}</strong>
                <span>{eur(Math.round((plan.priceMonthly ?? 0) * 100), getLocale())}<small>{t.onboarding.perMonth}</small></span>
              </div>
              <ul>
                <li>{t.onboarding.limitHallsLabel}: {limitValue(plan.limits.maxHalls)}</li>
                <li>{t.onboarding.limitReservationsLabel}: {limitValue(plan.limits.maxReservationsPerHallMonth)}</li>
                <li>{t.onboarding.limitDomain}</li>
                <li>{t.onboarding.limitBranding}</li>
              </ul>
            </div>
          {/each}
        </div>
      {/if}

      <div class="ob-actions">
        <a class="btn-action" href="/app/billing">{t.onboarding.seePlans}</a>
        <form method="POST" action="?/advance" use:enhance>
          <input type="hidden" name="from" value="plan" />
          <button type="submit" class="ob-link">{onFree ? t.onboarding.stayFree : t.onboarding.next}</button>
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
          <p class="ob-price"><strong>{eur(data.setupPriceCents, getLocale())}</strong> <span>{t.setupService.oneOff}</span></p>
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

    <!-- Every step is reversible. Progress already reached is kept, so
         stepping back and forward never costs anything. -->
    {#if index > 0}
      <button type="button" class="ob-back" onclick={() => (viewing = ONBOARDING_STEPS[index - 1])}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="15 18 9 12 15 6"/></svg>
        {t.onboarding.backStep}
      </button>
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

  .ob-toggle { display: flex; align-items: flex-start; gap: 12px; }
  .ob-toggle .ui-switch { margin-top: 1px; }
  .ob-toggle-copy { display: flex; flex-direction: column; gap: 3px; cursor: pointer; }
  .ob-toggle-copy strong { font-size: 13.5px; font-weight: 600; }
  .ob-toggle-copy span { font-size: var(--meta-size); color: var(--text-muted); line-height: 1.6; }

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
  .ob-back {
    display: inline-flex; align-items: center; gap: 5px;
    margin-top: 32px; padding: 7px 11px 7px 7px;
    border: 0; border-radius: var(--radius-sm);
    background: none; color: var(--text-subtle);
    font-family: inherit; font-size: 12.5px; cursor: pointer;
    transition: color .15s, background .15s;
  }
  .ob-back:hover { color: var(--text-base); background: var(--bg-hover); }
</style>
