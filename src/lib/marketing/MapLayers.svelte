<script lang="ts">
  import { tick } from 'svelte';
  import Icon from './Icon.svelte';
  import { mapPreferences, saveMapStyle } from './map-preferences.svelte';

  let { english = false, websiteTheme = 'light', raised = false }: { english?: boolean; websiteTheme?: 'light' | 'dark'; raised?: boolean } = $props();
  let open = $state(false);
  let root: HTMLDivElement, trigger: HTMLButtonElement;
  let panel = $state<HTMLDivElement>();
  const effectiveStyle = $derived(mapPreferences.style === 'auto' ? websiteTheme : mapPreferences.style);
  const choices = $derived([
    { id: 'street' as const, label: english ? 'Colour' : 'Farebná' },
    { id: 'light' as const, label: english ? 'Light' : 'Svetlá' },
    { id: 'dark' as const, label: english ? 'Dark' : 'Tmavá' },
  ]);

  async function toggle() {
    open = !open;
    if (open) { await tick(); panel?.focus(); }
  }
  function close(restoreFocus = false) {
    open = false;
    if (restoreFocus) trigger?.focus();
  }
  function outside(event: PointerEvent) {
    if (open && event.target instanceof Node && !root.contains(event.target)) close();
  }
</script>

<svelte:window onpointerdown={outside} onkeydown={(event) => { if (open && event.key === 'Escape') { event.preventDefault(); close(true); } }} />

<div bind:this={root} class="map-layers" class:raised onfocusout={(event) => { if (event.relatedTarget instanceof Node && !root.contains(event.relatedTarget)) close(); }}>
  <button bind:this={trigger} class="layers-trigger" type="button" aria-expanded={open} aria-haspopup="dialog" aria-label={english ? 'Layers: change map appearance' : 'Vrstvy: zmeniť vzhľad mapy'} onclick={toggle}>
    <span class="layer-preview trigger-preview" data-style={effectiveStyle} aria-hidden="true"><span class="layers-symbol"><Icon name="layers" size={19} /></span></span>
    <span>{english ? 'Layers' : 'Vrstvy'}</span>
  </button>
  {#if open}
    <div bind:this={panel} class="layers-panel" role="dialog" aria-modal="false" aria-label={english ? 'Map appearance' : 'Vzhľad mapy'} tabindex="-1">
      <div class="layers-header"><h3>{english ? 'Map appearance' : 'Vzhľad mapy'}</h3><button type="button" class="layers-close" aria-label={english ? 'Close layers' : 'Zavrieť vrstvy'} onclick={() => close(true)}><Icon name="close" size={17} /></button></div>
      <div class="layers-choices" role="group" aria-label={english ? 'Map styles' : 'Štýly mapy'}>
        {#each choices as choice}
          <button type="button" class="layer-choice" aria-pressed={effectiveStyle === choice.id} onclick={() => saveMapStyle(choice.id)}>
            <span class="layer-preview" data-style={choice.id} aria-hidden="true">{#if effectiveStyle === choice.id}<span class="layer-check"><Icon name="check" size={13} /></span>{/if}</span>
            <span>{choice.label}</span>
          </button>
        {/each}
      </div>
      <label class="layers-auto"><span>{english ? 'Match website theme' : 'Podľa vzhľadu stránky'}</span><input type="checkbox" role="switch" checked={mapPreferences.style === 'auto'} onchange={(event) => saveMapStyle(event.currentTarget.checked ? 'auto' : effectiveStyle)}><span class="switch-track" aria-hidden="true"></span></label>
    </div>
  {/if}
</div>

<style>
  .map-layers{position:absolute;left:16px;bottom:34px;z-index:1100;font-family:Inter,Arial,sans-serif;color:var(--map-ink)}
  .map-layers.raised{bottom:124px}
  button{font-family:inherit;cursor:pointer;color:inherit}
  .layers-trigger{display:flex;flex-direction:column;align-items:center;gap:5px;width:52px;min-height:59px;padding:4px 4px 5px;background:var(--map-panel);border:1px solid var(--map-border);border-radius:5px;box-shadow:0 2px 8px #11151120;font-size:10px;line-height:1.2;font-weight:600}
  .layers-trigger[aria-expanded=true]{border-color:var(--map-accent)}
  .layer-preview{position:relative;display:block;width:100%;height:57px;border-radius:3px;background:#e8e9e5 url('/marketing/map-preview.png') center/cover;overflow:hidden;isolation:isolate}
  .layer-preview::before{content:'';position:absolute;inset:0;background:inherit;z-index:-1}
  .layer-preview[data-style=light]::before{filter:grayscale(1) brightness(1.03) contrast(1.12)}
  .layer-preview[data-style=dark]::before{filter:grayscale(1) invert(1) brightness(.92) contrast(1.04)}
  .trigger-preview{height:30px}
  .layers-symbol{display:grid;place-items:center;position:absolute;inset:0;color:#fff;background:#10181038;text-shadow:none}
  .layers-symbol :global(svg){filter:drop-shadow(0 1px 2px #0008)}
  .layers-panel{position:absolute;left:0;bottom:calc(100% + 10px);width:280px;padding:15px;background:var(--map-panel);border:1px solid var(--map-border);border-radius:5px;box-shadow:0 10px 30px #11151125;outline:none}
  .layers-header{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:13px}
  .layers-header h3{font-size:13px;font-weight:600;letter-spacing:-.02em;line-height:1.4;margin:0}
  .layers-close{display:grid;place-items:center;min-width:30px;min-height:30px;padding:4px;background:transparent;border:0;border-radius:3px;color:var(--map-muted)}
  .layers-close:hover{background:var(--map-bg);color:var(--map-ink)}
  .layers-choices{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
  .layer-choice{min-width:0;display:flex;flex-direction:column;gap:7px;padding:0 0 6px;border:0;background:transparent;font-size:11px;line-height:1.4;text-align:center;align-items:center}
  .layer-choice .layer-preview{border:2px solid transparent;background-clip:padding-box}
  .layer-choice[aria-pressed=true]{color:var(--map-accent);font-weight:600}
  .layer-choice[aria-pressed=true] .layer-preview{border-color:var(--map-accent)}
  .layer-choice:hover .layer-preview{outline:1px solid var(--map-muted);outline-offset:2px}
  .layer-check{position:absolute;right:3px;bottom:3px;display:grid;place-items:center;width:19px;height:19px;border-radius:50%;background:var(--map-accent);color:var(--map-panel)}
  .layers-auto{position:relative;display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:45px;margin-top:10px;padding-top:10px;border-top:1px solid var(--map-border);font-size:11px;line-height:1.5;cursor:pointer}
  .layers-auto input{position:absolute;right:0;bottom:4px;width:36px;height:22px;opacity:0;cursor:pointer;margin:0;z-index:1}
  .switch-track{position:relative;flex-shrink:0;width:34px;height:20px;border:1px solid var(--map-border);border-radius:20px;background:var(--map-bg)}
  .switch-track::after{content:'';position:absolute;left:3px;top:3px;width:12px;height:12px;background:var(--map-muted);border-radius:50%;transition:transform 150ms ease}
  .layers-auto input:checked+.switch-track{background:var(--map-accent);border-color:var(--map-accent)}
  .layers-auto input:checked+.switch-track::after{transform:translateX(14px);background:var(--map-panel)}
  button:focus-visible,.layers-auto input:focus-visible+.switch-track{outline:2px solid var(--map-accent);outline-offset:3px}
  @media(prefers-reduced-motion:reduce){.switch-track::after{transition:none}}
  @media(max-width:600px){.map-layers{left:12px;bottom:30px}.map-layers.raised{bottom:116px}.layers-trigger{width:48px;min-height:54px;font-size:9px}.trigger-preview{height:27px}.layers-panel{position:fixed;left:12px;right:12px;bottom:16px;width:auto;max-width:320px;padding:12px}}
</style>
