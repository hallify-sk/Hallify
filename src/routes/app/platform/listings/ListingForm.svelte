<script lang="ts">
  // The add / edit form of a venue that is not on Hallify. The photo goes through the
  // same upload as any hall's (our own storage; the CSP serves nothing else).
  import { untrack } from 'svelte';
  import { enhance } from '$app/forms';
  import { t } from '$lib/i18n.svelte';
  import { imageSrcset } from '$lib/image-variants';
  import ImageUploadDialog from '$lib/components/ImageUploadDialog.svelte';

  interface Values {
    name?: unknown; address?: unknown; max_people?: unknown; description?: unknown; cover_image_url?: unknown;
    amenities?: unknown; website?: unknown; phone?: unknown; email?: unknown; is_public?: unknown;
  }
  let { values, error, submitLabel }: { values: Values | null; error: string | null; submitLabel: string } = $props();

  const str = (v: unknown) => (v == null ? '' : String(v));
  let cover = $state(untrack(() => str(values?.cover_image_url)));
  let coverOpen = $state(false);
  let saving = $state(false);
  const chosen = $derived(new Set(Array.isArray(values?.amenities) ? values.amenities.map(String) : []));

  const AMENITIES = $derived([
    ['parking', t.hallProfile.amenityParking], ['catering', t.hallProfile.amenityCatering], ['av', t.hallProfile.amenityAv],
    ['wifi', t.hallProfile.amenityWifi], ['ac', t.hallProfile.amenityAc], ['accessible', t.hallProfile.amenityAccessible],
    ['outdoor', t.hallProfile.amenityOutdoor], ['stage', t.hallProfile.amenityStage], ['dancefloor', t.hallProfile.amenityDancefloor],
    ['bar', t.hallProfile.amenityBar],
  ] as const);
</script>

<form
  method="POST"
  action="?/save"
  class="lf-form"
  use:enhance={() => {
    saving = true;
    return async ({ update }) => { await update({ reset: false }); saving = false; };
  }}
>
  {#if error}<div class="lf-error" role="alert">{error}</div>{/if}

  <div class="lf-grid">
    <div class="field lf-wide">
      <label for="lf-name">{t.listings.fieldName}</label>
      <input id="lf-name" name="name" value={str(values?.name)} maxlength="120" required />
    </div>
    <div class="field lf-wide">
      <label for="lf-address">{t.listings.fieldAddress}</label>
      <input id="lf-address" name="address" value={str(values?.address)} maxlength="300" required autocomplete="street-address" />
      <span class="hint">{t.listings.fieldAddressHint}</span>
    </div>
    <div class="field">
      <label for="lf-cap">{t.listings.fieldCapacity}</label>
      <input id="lf-cap" name="max_people" type="number" min="1" max="100000" inputmode="numeric" value={str(values?.max_people ?? 100)} required />
    </div>
    <div class="field lf-wide">
      <label for="lf-desc">{t.listings.fieldDescription}</label>
      <textarea id="lf-desc" name="description" rows="4" maxlength="2000">{str(values?.description)}</textarea>
    </div>

    <div class="field lf-wide">
      <span class="lf-label">{t.listings.fieldCover}</span>
      <input type="hidden" name="cover_image_url" value={cover} />
      <div class="lf-cover">
        {#if cover}
          <img src={cover} srcset={imageSrcset(cover)} sizes="160px" alt="" width="160" height="100" />
        {:else}
          <span class="lf-cover-blank" aria-hidden="true"></span>
        {/if}
        <div class="lf-cover-actions">
          <button type="button" class="btn-outline btn-sm" onclick={() => (coverOpen = true)}>{t.listings.chooseCover}</button>
          {#if cover}<button type="button" class="btn-outline btn-sm" onclick={() => (cover = '')}>{t.listings.removeCover}</button>{/if}
        </div>
      </div>
    </div>

    <div class="field">
      <label for="lf-web">{t.listings.fieldWebsite}</label>
      <input id="lf-web" name="website" type="text" inputmode="url" spellcheck="false" maxlength="300" value={str(values?.website)} placeholder="www.priestor.sk" />
    </div>
    <div class="field">
      <label for="lf-phone">{t.listings.fieldPhone}</label>
      <input id="lf-phone" name="phone" type="tel" maxlength="40" value={str(values?.phone)} placeholder="+421 900 000 000" />
    </div>
    <div class="field">
      <label for="lf-email">{t.listings.fieldEmail}</label>
      <input id="lf-email" name="email" type="email" maxlength="200" value={str(values?.email)} />
    </div>
    <p class="hint lf-wide">{t.listings.contactHint}</p>

    <fieldset class="field lf-wide lf-amen">
      <legend>{t.listings.fieldAmenities}</legend>
      {#each AMENITIES as [key, label] (key)}
        <label class="lf-check"><input type="checkbox" name="amenities" value={key} checked={chosen.has(key)} /> {label}</label>
      {/each}
    </fieldset>

    <label class="lf-check lf-wide">
      <input type="checkbox" name="is_public" checked={values ? !!values.is_public : true} />
      <span><strong>{t.listings.fieldVisible}</strong> — {t.listings.fieldVisibleHint}</span>
    </label>
  </div>

  <div class="lf-actions">
    <button type="submit" class="btn-action" disabled={saving}>{submitLabel}</button>
    <a class="btn-outline" href="/app/platform/listings">{t.listings.cancel}</a>
  </div>
</form>

<ImageUploadDialog bind:open={coverOpen} onadd={(urls) => { if (urls[0]) cover = urls[0]; }} />

<style>
  .lf-form { display: grid; gap: 16px; max-width: 820px; }
  .lf-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px 16px; }
  .lf-wide { grid-column: 1 / -1; }
  .field { display: flex; flex-direction: column; gap: 5px; min-width: 0; border: 0; padding: 0; margin: 0; }
  .field label, .lf-label, .field legend { font-size: 12px; font-weight: 600; color: var(--text-muted); padding: 0; }
  .field input:not([type='checkbox']), .field textarea {
    font: inherit; font-size: 13px; padding: 8px 10px; border: 1px solid var(--border);
    border-radius: var(--radius-sm); background: var(--bg-panel); color: var(--text-base); width: 100%; box-sizing: border-box;
  }
  .hint { font-size: 11.5px; color: var(--text-muted); margin: 0; line-height: 1.5; }
  .lf-cover { display: flex; gap: 14px; align-items: center; }
  .lf-cover img, .lf-cover-blank { width: 160px; height: 100px; object-fit: cover; border-radius: var(--radius-sm); border: 1px solid var(--border); background: var(--bg-hover); display: block; }
  .lf-cover-actions { display: flex; gap: 8px; flex-wrap: wrap; }
  .lf-amen { flex-direction: row; flex-wrap: wrap; gap: 8px 16px; }
  .lf-amen legend { width: 100%; margin-bottom: 6px; }
  .lf-check { display: inline-flex; gap: 7px; align-items: center; font-size: 13px; color: var(--text-base); }
  .lf-check input { accent-color: var(--accent); }
  .lf-error { padding: 10px 12px; border-radius: var(--radius-sm); background: color-mix(in srgb, var(--danger) 10%, transparent); color: var(--danger); font-size: 13px; }
  .lf-actions { display: flex; gap: 8px; flex-wrap: wrap; }
  @media (max-width: 640px) { .lf-grid { grid-template-columns: 1fr; } }
</style>
