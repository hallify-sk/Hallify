<script lang="ts">
  import { enhance } from '$app/forms';
  import type { PageData, ActionData } from './$types';

  interface Props { data: PageData; form: ActionData; }
  const { data, form }: Props = $props();

  const hall = data.hall;
  let submitting = $state(false);

  // Default date to tomorrow
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const defaultDate = tomorrow.toISOString().split('T')[0];
</script>

<svelte:head><title>Book {hall.name} – {data.domainOrg.name}</title></svelte:head>

<div class="page">

  <nav class="breadcrumb">
    <a href="/halls">Browse halls</a>
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
    <a href="/halls/{hall.slug}">{hall.name}</a>
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
    <span>Request booking</span>
  </nav>

  <div class="layout">

    <div class="form-col">
      <div class="card">
        <div class="card-header">
          <h1 class="card-title">Request booking</h1>
          <p class="card-sub">Submit your event details and we'll confirm your booking.</p>
        </div>

        {#if form?.error}
          <div class="alert-error">{form.error}</div>
        {/if}

        <form
          method="POST"
          class="form-body"
          use:enhance={() => {
            submitting = true;
            return async ({ update }) => {
              submitting = false;
              await update();
            };
          }}
        >
          <div class="field">
            <label class="field-label" for="title">Event name *</label>
            <input class="field-input" id="title" name="title" type="text"
              placeholder="Birthday dinner, corporate event…"
              value={form?.title ?? ''} required />
          </div>

          <div class="field">
            <label class="field-label" for="description">Description <span class="opt">(optional)</span></label>
            <textarea class="field-input field-textarea" id="description" name="description"
              placeholder="Tell us more about your event…" rows="4">{form?.description ?? ''}</textarea>
          </div>

          <div class="field-row">
            <div class="field field-grow">
              <label class="field-label" for="event_date">Event date *</label>
              <input class="field-input" id="event_date" name="event_date" type="date"
                value={form?.event_date ?? defaultDate} min={defaultDate} required />
            </div>
            <div class="field field-grow">
              <label class="field-label" for="num_guests">Guests <span class="opt">(optional)</span></label>
              <input class="field-input" id="num_guests" name="num_guests" type="number"
                min="1" max={hall.max_people} placeholder="How many?" value={form?.num_guests ?? ''} />
            </div>
          </div>

          <div class="field-row">
            <div class="field field-grow">
              <label class="field-label" for="start_time">Start time <span class="opt">(optional)</span></label>
              <input class="field-input" id="start_time" name="start_time" type="time"
                value={form?.start_time ?? ''} />
            </div>
            <div class="field field-grow">
              <label class="field-label" for="end_time">End time <span class="opt">(optional)</span></label>
              <input class="field-input" id="end_time" name="end_time" type="time"
                value={form?.end_time ?? ''} />
            </div>
          </div>

          <div class="form-footer">
            <a href="/halls/{hall.slug}" class="btn-ghost">Cancel</a>
            <button type="submit" class="btn-primary" disabled={submitting}>
              {submitting ? 'Sending…' : 'Submit booking request'}
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- Hall summary sidebar -->
    <aside class="side-col">
      <div class="hall-summary" style="--hc:{hall.color}">
        {#if hall.cover_image_url}
          <div class="summary-cover" style="background-image:url('{hall.cover_image_url}')"></div>
        {:else}
          <div class="summary-cover summary-cover-plain" style="background:color-mix(in srgb,var(--hc) 20%,var(--bg-base))"></div>
        {/if}
        <div class="summary-body">
          <h3 class="summary-name">{hall.name}</h3>
          {#if hall.address}
            <p class="summary-addr">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
              {hall.address}
            </p>
          {/if}
          <div class="summary-cap">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
            Up to {hall.max_people} guests
          </div>
        </div>
      </div>
      <div class="note-card">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0;margin-top:2px;color:var(--accent)"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        <p>Your request will be reviewed by the venue and you'll receive a confirmation via the contact you used to sign up.</p>
      </div>
    </aside>

  </div>
</div>

<style>
  @keyframes fadeUp {
    from { opacity: 0; transform: translateY(10px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  .page {
    max-width: 900px; margin: 0 auto;
    padding: 32px 32px 60px; box-sizing: border-box;
    animation: fadeUp .2s ease both;
  }

  /* Breadcrumb */
  .breadcrumb {
    display: flex; align-items: center; gap: 6px;
    font-size: 12px; color: var(--text-subtle); margin-bottom: 24px;
  }
  .breadcrumb a { color: var(--text-subtle); text-decoration: none; transition: color .1s; }
  .breadcrumb a:hover { color: var(--accent); }
  .breadcrumb svg { opacity: .5; }

  /* Layout */
  .layout {
    display: grid; grid-template-columns: 1fr 260px; gap: 20px; align-items: start;
  }

  /* Card */
  .card {
    background: var(--bg-panel); border: 1px solid var(--border); border-radius: 14px; overflow: hidden;
  }
  .card-header { padding: 22px 24px 0; }
  .card-title { font-size: 18px; font-weight: 800; color: var(--text-base); letter-spacing: -.025em; margin: 0 0 6px; }
  .card-sub { font-size: 13px; color: var(--text-muted); margin: 0; }

  /* Alert */
  .alert-error {
    margin: 16px 24px 0;
    padding: 9px 13px; border-radius: 7px; font-size: 12px;
    background: color-mix(in srgb, #ef4444 10%, transparent);
    border: 1px solid color-mix(in srgb, #ef4444 25%, transparent);
    color: #ef4444;
  }

  /* Form */
  .form-body { padding: 20px 24px; display: flex; flex-direction: column; gap: 16px; }
  .field { display: flex; flex-direction: column; gap: 5px; }
  .field-row { display: flex; gap: 12px; }
  .field-grow { flex: 1; min-width: 0; }
  .field-label {
    font-size: 10px; font-weight: 700; text-transform: uppercase;
    letter-spacing: .06em; color: var(--text-subtle);
  }
  .opt { font-weight: 400; text-transform: none; letter-spacing: 0; font-size: 10px; }
  .field-input {
    padding: 9px 11px; border: 1px solid var(--border); border-radius: 8px;
    background: var(--bg-panel2, var(--bg-base)); font-size: 13px;
    color: var(--text-base); font-family: inherit; outline: none; transition: border-color .12s;
  }
  .field-input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 12%, transparent); }
  .field-textarea { resize: vertical; }

  .form-footer {
    display: flex; align-items: center; justify-content: flex-end; gap: 10px; padding-top: 4px;
  }
  .btn-primary {
    padding: 9px 22px; border-radius: 8px; font-size: 13px; font-weight: 600;
    background: var(--accent); color: #fff; border: none; cursor: pointer;
    font-family: inherit; transition: opacity .12s;
  }
  .btn-primary:hover:not(:disabled) { opacity: .88; }
  .btn-primary:disabled { opacity: .5; cursor: default; }
  .btn-ghost {
    padding: 8px 16px; border-radius: 8px; font-size: 13px; font-weight: 500;
    background: none; border: 1px solid var(--border); color: var(--text-muted);
    text-decoration: none; cursor: pointer; font-family: inherit; transition: border-color .1s, color .1s;
  }
  .btn-ghost:hover { border-color: var(--accent); color: var(--text-base); }

  /* Hall summary */
  .hall-summary {
    background: var(--bg-panel); border: 1px solid var(--border); border-radius: 14px; overflow: hidden;
  }
  .summary-cover {
    height: 130px; background-size: cover; background-position: center;
  }
  .summary-cover-plain { opacity: .5; }
  .summary-body { padding: 14px 16px; }
  .summary-name { font-size: 15px; font-weight: 700; color: var(--text-base); margin: 0 0 6px; }
  .summary-addr {
    display: flex; align-items: center; gap: 4px;
    font-size: 12px; color: var(--text-subtle); margin: 0 0 8px;
  }
  .summary-cap {
    display: inline-flex; align-items: center; gap: 5px;
    font-size: 12px; color: var(--accent); font-weight: 600;
    padding: 3px 9px; border-radius: 99px;
    background: color-mix(in srgb, var(--accent) 8%, transparent);
    border: 1px solid color-mix(in srgb, var(--accent) 20%, transparent);
  }

  /* Note */
  .note-card {
    display: flex; gap: 10px; align-items: flex-start;
    margin-top: 12px; padding: 12px 14px;
    background: color-mix(in srgb, var(--accent) 6%, transparent);
    border: 1px solid color-mix(in srgb, var(--accent) 16%, transparent);
    border-radius: 10px;
  }
  .note-card p { font-size: 12px; color: var(--text-muted); line-height: 1.5; margin: 0; }

  @media (max-width: 700px) {
    .page { padding: 20px 18px 40px; }
    .layout { grid-template-columns: 1fr; }
    .side-col { order: -1; }
  }
</style>
