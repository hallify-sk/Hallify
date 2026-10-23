<script lang="ts">
  /**
   * The "we set Hallify up for you" add-on, as an offer.
   *
   * Shared by two pages that are each the right place for it from a different
   * direction: Billing is where someone goes to see what Hallify sells, and Help
   * is where someone is already staring at a checklist of everything still to
   * do. One component so the price, the inclusions and the exclusion cannot
   * disagree between them.
   */
  import { enhance } from '$app/forms';
  import { t, getLocale } from '$lib/i18n.svelte';
  import { eur } from '$lib/extras';
  import { SETUP_SERVICE_INCLUDES, SETUP_SERVICE_EXCLUDES, SETUP_SERVICE_GUARANTEE } from '$lib/setup-service';
  import { formatDate, formatMoney } from '$lib/format';
  import { confirmFirst } from '$lib/forms';

  interface Props {
    priceCents: number;
    /** An outstanding request, if there is one — then this reports instead of offering. */
    pending: { status: string; created_at?: string; note?: string | null; price_cents?: number } | null;
    /** The form action to post to; both hosting pages name it `requestSetup`. */
    action?: string;
    /** Where to post a withdrawal; both hosting pages name it `cancelSetup`. */
    cancelAction?: string;
  }

  const { priceCents, pending, action = '?/requestSetup', cancelAction = '?/cancelSetup' }: Props = $props();

  const locale = $derived(getLocale() === 'en' ? 'en' : 'sk');
</script>

{#if pending}
  <div class="card--inset su-pending">
    <span class="icon-tile">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><polyline points="20 6 9 17 4 12"/></svg>
    </span>
    <div class="su-pending-body">
      <strong>{t.setupService.pendingTitle}</strong>
      {#if pending.created_at}<span class="su-meta">{t.setupService.pendingRequestedOn(formatDate(pending.created_at, locale))}</span>{/if}
      <p>{t.setupService.pendingBody}</p>
      <p class="su-meta">{t.setupService.pendingPrice(formatMoney(pending.price_cents ?? priceCents, locale))}</p>
      {#if pending.note}
        <p class="su-their-note"><b>{t.setupService.pendingNote}:</b> {pending.note}</p>
      {/if}
      {#if pending.status === 'requested' || pending.status === 'contacted'}
        <form method="POST" action={cancelAction} class="su-cancel" use:enhance={confirmFirst(() => t.setupService.cancelConfirm)}>
          <button type="submit" class="su-cancel-btn">{t.setupService.cancelRequest}</button>
        </form>
      {:else}
        <p class="su-meta">{t.setupService.pendingInProgress}</p>
      {/if}
    </div>
  </div>
{:else}
  <div class="su-grid">
    <div>
      <ul class="su-list">
        {#each SETUP_SERVICE_INCLUDES as item (item.en)}
          <li>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>
            {item[locale]}
          </li>
        {/each}
      </ul>
      <p class="su-guarantee">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><path d="M12 2l7 4v6c0 4.4-3 8.3-7 10-4-1.7-7-5.6-7-10V6z"/></svg>
        {SETUP_SERVICE_GUARANTEE[locale]}
      </p>
      <p class="su-excludes">{SETUP_SERVICE_EXCLUDES[locale]}</p>
    </div>

    <form method="POST" {action} class="su-form card--inset" use:enhance>
      <p class="su-price">
        <strong>{eur(priceCents)}</strong>
        <span>{t.setupService.oneOff}</span>
      </p>
      <label class="su-note-label" for="su-note">{t.setupService.noteLabel}</label>
      <textarea id="su-note" name="note" rows="3" maxlength="1000"
        placeholder={t.setupService.notePlaceholder}></textarea>
      <button type="submit" class="btn-action">{t.setupService.request}</button>
      <p class="su-fine">{t.setupService.billingNote}</p>
    </form>
  </div>
{/if}

<style>
  .su-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(300px, 380px); gap: 28px; align-items: start; }

  .su-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 9px; }
  .su-list li { display: flex; align-items: flex-start; gap: 9px; font-size: 13px; line-height: 1.6; color: var(--text-muted); }
  .su-list svg { flex-shrink: 0; margin-top: 3px; color: var(--success); }

  /* The promise, not a deliverable: it is what happens AFTER delivery, and it
     is the part that answers "what if they get it wrong". Given its own weight
     because it is what makes the price safe to say yes to. */
  .su-guarantee {
    display: flex; align-items: flex-start; gap: 8px;
    margin: 16px 0 0; padding: 10px 13px;
    border-radius: var(--radius-sm);
    background: var(--success-dim);
    color: color-mix(in srgb, var(--success) 72%, var(--text-base));
    font-size: 12.5px; font-weight: 600; line-height: 1.6;
  }
  .su-guarantee svg { flex-shrink: 0; margin-top: 2px; }

  /* Said in the same breath as what IS included: the floorplan is the thing
     people will assume they are buying. */
  .su-excludes {
    margin: 16px 0 0; padding: 10px 13px;
    border-left: 2px solid var(--border);
    font-size: var(--meta-size); line-height: 1.7; color: var(--text-subtle);
  }

  .su-form { display: flex; flex-direction: column; gap: 10px; padding: 18px; }
  .su-price { display: flex; align-items: baseline; gap: 8px; margin: 0; }
  .su-price strong { font-size: 27px; font-weight: 650; letter-spacing: -.04em; }
  .su-price span { font-size: var(--meta-size); color: var(--text-muted); }
  .su-note-label { font-size: var(--meta-size); font-weight: 600; color: var(--text-muted); }
  .su-form textarea {
    font-family: inherit; font-size: 13px; padding: 9px 11px; resize: vertical;
    border: 1px solid var(--border); border-radius: var(--radius-sm);
    background: var(--bg-panel2); color: var(--text-base);
  }
  .su-fine { margin: 0; font-size: var(--meta-size); line-height: 1.6; color: var(--text-subtle); }

  .su-pending { display: flex; align-items: flex-start; gap: 13px; padding: 18px; }
  .su-pending strong { font-size: 13.5px; font-weight: 600; }
  .su-pending p { margin: 4px 0 0; font-size: var(--meta-size); line-height: 1.7; color: var(--text-muted); }
  .su-pending-body { display: flex; flex-direction: column; min-width: 0; }
  .su-pending .su-meta { font-size: var(--meta-size); color: var(--text-subtle); }
  .su-pending span.su-meta { margin-top: 2px; }
  .su-pending .su-their-note { padding: 8px 11px; border-left: 2px solid var(--border); white-space: pre-line; overflow-wrap: anywhere; }
  .su-pending .su-their-note b { font-weight: 600; color: var(--text-base); }
  .su-cancel { margin: 10px 0 0; }
  .su-cancel-btn {
    font: inherit; font-size: var(--meta-size); font-weight: 600; color: var(--danger);
    background: none; border: none; padding: 0; cursor: pointer; text-decoration: underline;
  }

  @media (max-width: 860px) {
    .su-grid { grid-template-columns: 1fr; gap: 20px; }
  }
</style>
