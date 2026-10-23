<script lang="ts">
  /**
   * One image-picking surface for every place the app takes a picture: drag a file
   * onto the zone, click the zone to open the file picker, or paste an address in
   * the field below. The gallery uses the same dialog with `multiple`.
   *
   * It owns the upload itself (POST /api/upload/image — the endpoint already does
   * the type/size/rate-limit validation) and reports finished URLs through `onadd`,
   * so a caller only has to decide where the URL goes.
   *
   * It floats above the page, so the panel is a .card--raised.
   */
  import { tick } from 'svelte';
  import { t } from '$lib/i18n.svelte';
  import { downscaleImage } from '$lib/image-resize';

  let {
    open = $bindable(false),
    multiple = false,
    remaining = Number.POSITIVE_INFINITY,
    onadd
  }: {
    open?: boolean;
    /** Accept more than one file per drop / pick (the gallery variant). */
    multiple?: boolean;
    /**
     * How many more images the caller can take right now; Infinity when there is
     * no limit. It is read live on every render, so a caller that grows its own
     * list in `onadd` sees the figure fall as pictures land — the dialog must not
     * also subtract what it has added, or the budget is spent twice over.
     */
    remaining?: number;
    onadd: (urls: string[]) => void;
  } = $props();

  const ACCEPT = 'image/jpeg,image/png,image/webp,image/gif';

  let busy = $state(false);
  let errorMessage = $state('');
  let addedCount = $state(0);
  let dragging = $state(false);
  let urlDraft = $state('');
  let fileInput = $state<HTMLInputElement>();
  let zone = $state<HTMLButtonElement>();
  let returnFocusTo: HTMLElement | null = null;

  const limited = $derived(Number.isFinite(remaining));
  const left = $derived(Math.max(0, remaining));
  const full = $derived(limited && left <= 0);

  // Opening resets the dialog and parks focus on the drop zone; closing hands focus
  // back to whatever opened it, so the keyboard does not fall to the top of the page.
  $effect(() => {
    if (open) {
      errorMessage = '';
      addedCount = 0;
      urlDraft = '';
      dragging = false;
      returnFocusTo = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      tick().then(() => zone?.focus());
    } else if (returnFocusTo) {
      const target = returnFocusTo;
      returnFocusTo = null;
      target.focus();
    }
  });

  function close() {
    open = false;
  }

  async function upload(original: File): Promise<string> {
    // Made smaller first: a phone photo is several MB and is shown far smaller (I2).
    const file = await downscaleImage(original);
    const body = new FormData();
    body.append('file', file);
    const response = await fetch('/api/upload/image', { method: 'POST', body });
    if (!response.ok) {
      let message = t.imageDialog.uploadFailed;
      try {
        const payload = await response.json();
        if (payload?.message) message = String(payload.message);
      } catch {
        message = (await response.text().catch(() => '')) || message;
      }
      throw new Error(message);
    }
    const payload = await response.json();
    return String(payload.url);
  }

  async function take(files: File[]) {
    if (busy || files.length === 0) return;
    const images = files.filter((file) => file.type.startsWith('image/'));
    if (images.length === 0) {
      errorMessage = t.imageDialog.notAnImage;
      return;
    }
    const queue = multiple ? images.slice(0, limited ? left : images.length) : images.slice(0, 1);
    if (queue.length === 0) {
      errorMessage = t.imageDialog.limitReached;
      return;
    }
    // Say how many did not fit instead of dropping them without a word (I14).
    const skipped = multiple ? images.length - queue.length : 0;

    busy = true;
    errorMessage = '';
    const urls: string[] = [];
    for (const file of queue) {
      try {
        urls.push(await upload(file));
      } catch (err) {
        errorMessage = err instanceof Error ? err.message : t.imageDialog.uploadFailed;
        break;
      }
    }
    busy = false;
    if (skipped > 0 && !errorMessage) errorMessage = t.imageDialog.skippedOverLimit(skipped);

    if (urls.length > 0) {
      addedCount += urls.length;
      onadd(urls);
      // A single picture is the whole job: take it and get out of the way.
      if (!multiple && !errorMessage) close();
    }
  }

  function onDrop(event: DragEvent) {
    event.preventDefault();
    dragging = false;
    const files = Array.from(event.dataTransfer?.files ?? []);
    if (files.length > 0) { void take(files); return; }
    // Dragging a picture out of another tab hands over a URL, not a file.
    const dropped = event.dataTransfer?.getData('text/uri-list') || event.dataTransfer?.getData('text/plain');
    if (dropped) { urlDraft = dropped.trim(); void addUrl(); }
  }

  // A pasted address is not stored as it is: the site serves images from its own
  // origin only, so a link to someone else's picture showed visitors a broken image
  // (B62). The server copies the picture into our storage and hands back our URL.
  async function addUrl() {
    const value = urlDraft.trim();
    if (!value || busy) return;
    if (full) { errorMessage = t.imageDialog.limitReached; return; }
    if (!/^https?:\/\/\S+$/i.test(value) && !/^\/uploads\/halls\/\S+$/.test(value)) {
      errorMessage = t.imageDialog.invalidUrl;
      return;
    }
    busy = true;
    errorMessage = '';
    try {
      const response = await fetch('/app/manage/halls/import-image', {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ url: value })
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.url) {
        errorMessage = payload?.message ? String(payload.message) : t.imageDialog.importFailed;
        return;
      }
      urlDraft = '';
      addedCount += 1;
      onadd([String(payload.url)]);
      if (!multiple) close();
    } catch {
      errorMessage = t.imageDialog.importFailed;
    } finally {
      busy = false;
    }
  }
</script>

<svelte:window onkeydown={(event) => { if (open && event.key === 'Escape') { event.preventDefault(); close(); } }} />

{#if open}
  <div
    class="image-dialog-backdrop"
    role="presentation"
    onmousedown={(event) => { if (event.target === event.currentTarget) close(); }}
  >
    <div class="card--raised image-dialog" role="dialog" aria-modal="true" aria-labelledby="image-dialog-title">
      <div class="image-dialog-head">
        <h2 id="image-dialog-title">{multiple ? t.imageDialog.titleMultiple : t.imageDialog.titleSingle}</h2>
        <button type="button" class="image-dialog-close" onclick={close} aria-label={t.imageDialog.close}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>

      <div class="image-dialog-body">
        <button
          bind:this={zone}
          type="button"
          class="drop-zone"
          class:dragging
          class:busy
          disabled={busy || full}
          ondragover={(event) => { event.preventDefault(); dragging = true; }}
          ondragleave={() => dragging = false}
          ondrop={onDrop}
          onclick={() => fileInput?.click()}
        >
          {#if busy}
            <svg class="drop-icon" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
            <span class="drop-title">{t.imageDialog.uploading}</span>
          {:else}
            <svg class="drop-icon" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/></svg>
            <span class="drop-title">{multiple ? t.imageDialog.dropHereMultiple : t.imageDialog.dropHereSingle}</span>
            <span class="drop-sub">{t.imageDialog.orClick}</span>
          {/if}
        </button>
        <p class="drop-note">{t.imageDialog.allowedTypes}</p>

        <input
          bind:this={fileInput}
          type="file"
          accept={ACCEPT}
          {multiple}
          class="visually-hidden-input"
          tabindex="-1"
          aria-hidden="true"
          onchange={(event) => {
            const files = Array.from(event.currentTarget.files ?? []);
            event.currentTarget.value = '';
            void take(files);
          }}
        />

        <div class="url-field">
          <label class="url-label" for="image-dialog-url">{t.imageDialog.orPasteUrl}</label>
          <div class="url-row">
            <input
              id="image-dialog-url"
              type="text"
              bind:value={urlDraft}
              placeholder={t.imageDialog.urlPlaceholder}
              onkeydown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void addUrl(); } }}
            />
            <button type="button" class="btn-outline btn-sm" onclick={() => void addUrl()} disabled={!urlDraft.trim() || full || busy}>
              {t.imageDialog.addUrl}
            </button>
          </div>
        </div>

        {#if errorMessage}
          <p class="image-dialog-error" role="alert">{errorMessage}</p>
        {/if}

        <div class="image-dialog-foot">
          <span class="image-dialog-status" aria-live="polite">
            {#if addedCount > 0}{addedCount} {t.imageDialog.added}{/if}
            {#if limited}
              <span class="image-dialog-left">{t.imageDialog.remainingLabel}: {left}</span>
            {/if}
          </span>
          <button type="button" class="btn-action btn-sm" onclick={close}>{t.imageDialog.done}</button>
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  .image-dialog-backdrop {
    position: fixed; inset: 0; z-index: 140;
    display: flex; align-items: center; justify-content: center;
    padding: 20px;
    background: rgba(0, 0, 0, .45);
    backdrop-filter: blur(2px);
  }
  /* .card--raised carries the surface, hairline, radius and shadow. */
  .image-dialog { width: min(460px, 100%); max-height: 90vh; overflow-y: auto; padding: 0; }

  .image-dialog-head {
    display: flex; align-items: center; justify-content: space-between; gap: 12px;
    padding: 18px 22px 14px; border-bottom: 1px solid var(--border);
  }
  .image-dialog-head h2 { font-size: 15px; font-weight: 650; letter-spacing: -.045em; margin: 0; }
  .image-dialog-close {
    width: 28px; height: 28px; border-radius: var(--radius-sm);
    display: grid; place-items: center; color: var(--text-muted);
    transition: background .15s, color .15s;
  }
  .image-dialog-close:hover { background: var(--bg-hover); color: var(--text-base); }

  .image-dialog-body { padding: 18px 22px 20px; display: flex; flex-direction: column; gap: 14px; }

  .drop-zone {
    display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px;
    width: 100%; min-height: 148px; padding: 20px;
    border: 1.5px dashed var(--border); border-radius: var(--radius-lg);
    background: var(--bg-panel2); color: var(--text-muted);
    font: inherit; text-align: center; cursor: pointer;
    transition: border-color .15s, background .15s, color .15s;
  }
  .drop-zone:hover:not(:disabled),
  .drop-zone.dragging { border-color: var(--accent); background: var(--accent-dim); color: var(--accent-ink); }
  .drop-zone:disabled { cursor: default; opacity: .55; }
  .drop-icon { flex-shrink: 0; }
  .drop-title { font-size: 13px; font-weight: 600; letter-spacing: -.02em; color: var(--text-base); }
  .drop-zone:hover:not(:disabled) .drop-title,
  .drop-zone.dragging .drop-title { color: var(--accent-ink); }
  .drop-sub { font-size: 12px; }
  .drop-note { margin: -8px 0 0; font-size: 11px; color: var(--text-subtle); }

  /* The real file input stays in the DOM (the zone clicks it) but never reachable
     on its own — the drop zone is the control people see and tab to. */
  .visually-hidden-input {
    position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
    overflow: hidden; clip-path: inset(50%); white-space: nowrap; border: 0;
  }

  .url-field { display: flex; flex-direction: column; gap: 5px; }
  .url-label {
    font-size: 10px; font-weight: 600; text-transform: uppercase;
    letter-spacing: .09em; color: var(--text-muted);
  }
  .url-row { display: flex; gap: 8px; align-items: stretch; }
  .url-row input { flex: 1; min-width: 0; font-size: 13px; }
  .url-row .btn-outline { flex-shrink: 0; }

  .image-dialog-error {
    margin: 0; padding: 8px 12px; border-radius: var(--radius-sm);
    background: var(--danger-dim); color: var(--danger);
    border: 1px solid color-mix(in srgb, var(--danger) 24%, transparent);
    font-size: 12px;
  }

  .image-dialog-foot {
    display: flex; align-items: center; justify-content: space-between; gap: 12px;
    padding-top: 12px; border-top: 1px solid var(--border);
  }
  .image-dialog-status { font-size: 11.5px; color: var(--text-muted); display: flex; gap: 10px; }
  .image-dialog-left { color: var(--text-subtle); }
</style>
