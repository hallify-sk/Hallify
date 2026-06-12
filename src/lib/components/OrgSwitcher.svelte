<script lang="ts">
  import type { OrgContext } from '../../app.d';

  interface OrgOption {
    id: string;
    name: string;
    slug: string;
    role: string;
  }

  interface Props {
    currentOrg: OrgContext | null | undefined;
    orgs: OrgOption[];
    returnTo?: string;
  }

  const { currentOrg, orgs, returnTo = '/' }: Props = $props();

  let open = $state(false);

  function close(e: MouseEvent) {
    if (!(e.target as HTMLElement).closest('.org-switcher')) open = false;
  }

  $effect(() => {
    if (open) {
      document.addEventListener('click', close, true);
      return () => document.removeEventListener('click', close, true);
    }
  });
</script>

<div class="org-switcher">
  <button class="org-btn" onclick={() => open = !open} type="button">
    <div class="org-icon">{currentOrg?.name?.[0]?.toUpperCase() ?? '?'}</div>
    <span class="org-name">{currentOrg?.name ?? 'No organization'}</span>
    <svg class="chevron" class:rotated={open} width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
      <polyline points="6 9 12 15 18 9"/>
    </svg>
  </button>

  {#if open}
    <div class="org-dropdown">
      <p class="dropdown-label">Switch organization</p>
      {#each orgs as org}
        <form method="POST" action="/org/switch">
          <input type="hidden" name="org_id" value={org.id} />
          <input type="hidden" name="return_to" value={returnTo} />
          <button type="submit" class="org-option" class:active={org.id === currentOrg?.id}>
            <div class="org-option-icon">{org.name[0].toUpperCase()}</div>
            <div class="org-option-info">
              <span class="org-option-name">{org.name}</span>
              <span class="org-option-role">{org.role}</span>
            </div>
            {#if org.id === currentOrg?.id}
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            {/if}
          </button>
        </form>
      {/each}

      <div class="dropdown-divider"></div>
      <a href="/org/new" class="org-option new-org">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="12" y1="5" x2="12" y2="19"/>
          <line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
        Create organization
      </a>
    </div>
  {/if}
</div>

<style>
  .org-switcher { position: relative; width: 100%; }

  .org-btn {
    display: flex;
    align-items: center;
    gap: 7px;
    width: 100%;
    padding: 5px 8px;
    border-radius: 7px;
    background: var(--bg-hover);
    border: 1px solid var(--border);
    cursor: pointer;
    font-family: inherit;
    font-size: 12px;
    font-weight: 600;
    color: var(--text-base);
    transition: border-color .12s, background .12s;
  }
  .org-btn:hover { border-color: var(--accent); background: var(--bg-panel2); }

  .org-icon {
    width: 18px;
    height: 18px;
    border-radius: 4px;
    background: var(--accent);
    color: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 9px;
    font-weight: 700;
    flex-shrink: 0;
  }

  .org-name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    text-align: left;
  }

  .chevron { flex-shrink: 0; color: var(--text-muted); transition: transform .15s; }
  .chevron.rotated { transform: rotate(180deg); }

  .org-dropdown {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    right: 0;
    background: var(--bg-panel);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 5px;
    box-shadow: var(--shadow);
    z-index: 202;
    min-width: 180px;
  }

  .dropdown-label {
    font-size: 10px;
    font-weight: 700;
    color: var(--text-subtle);
    text-transform: uppercase;
    letter-spacing: .06em;
    padding: 3px 9px 5px;
    margin: 0;
  }

  .org-option {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 6px 9px;
    border-radius: 6px;
    cursor: pointer;
    background: none;
    border: none;
    font-family: inherit;
    text-decoration: none;
    color: var(--text-base);
    transition: background .1s;
  }
  .org-option:hover { background: var(--bg-hover); }
  .org-option.active { background: var(--accent-dim); color: var(--accent); }

  .org-option-icon {
    width: 20px;
    height: 20px;
    border-radius: 4px;
    background: var(--accent);
    color: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 10px;
    font-weight: 700;
    flex-shrink: 0;
  }

  .org-option-info {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-width: 0;
  }
  .org-option-name { font-size: 12px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .org-option-role { font-size: 10px; color: var(--text-subtle); text-transform: capitalize; }

  .dropdown-divider { height: 1px; background: var(--border-subtle); margin: 4px 0; }

  .new-org { font-size: 12px; color: var(--accent); font-weight: 600; }
</style>
