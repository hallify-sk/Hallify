<script lang="ts">
	import { pageTitle } from '$lib/page-title';
	import { enhance } from '$app/forms';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { t } from '$lib/i18n.svelte';
	import { roleDisplayName } from '$lib/role-label';
	import { ELEVATED, PERMISSION_GROUPS, PERMISSIONS, sameRoleName, type Permission } from '$lib/permissions';
	import type { PageData, ActionData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	/** One role's editor at a time — two open panels of switches read as one list. */
	let openId = $state<string | null>(null);
	let showCreate = $state(false);

	/** What this person may put on a role. The server filters again regardless. */
	const grantable = $derived(new Set<Permission>(data.grantable));

	/** Swatches, not a native colour picker: an OS colour dialog is the one piece of
	 *  chrome we cannot style, and a role needs a recognisable tint, not a shade. */
	const ROLE_COLORS = [
		'#a6225e', '#9b2f6b', '#c3362c', '#955f10',
		'#2f7a52', '#1f6f72', '#2f5f9e', '#6b4a9e', '#686d68'
	];

	function permLabel(p: Permission): string {
		return t.rolesAdmin.perms[p].label;
	}
	function permDesc(p: Permission): string {
		return t.rolesAdmin.perms[p].desc;
	}
	/** PERMISSION_GROUPS types `key` as a plain string, so the lookup is widened. */
	function groupLabel(key: string): string {
		return (t.rolesAdmin.groups as Record<string, string>)[key] ?? key;
	}

	/** What the role grants, in one line. */
	function summary(perms: Permission[]): string {
		if (perms.length === 0) return t.rolesAdmin.noPermissions;
		if (perms.length === PERMISSIONS.length) return t.rolesAdmin.allPermissions;
		const shown = perms.slice(0, 3).map(permLabel);
		const rest = perms.length - shown.length;
		return rest > 0 ? `${shown.join(', ')} ${t.rolesAdmin.andMore(rest)}` : shown.join(', ');
	}

	/** A swap is only offered when BOTH ends are below the caller's rank, and never
	 *  across the default role — it stays the floor. The action re-checks all of it. */
	function canSwap(i: number, j: number): boolean {
		const a = data.roles[i];
		const b = data.roles[j];
		if (!a || !b) return false;
		return a.canManage && b.canManage && !a.isDefault && !b.isDefault;
	}

	const onCreate: SubmitFunction = () => async ({ result, update }) => {
		await update();
		if (result.type === 'success' && typeof result.data?.openId === 'string') {
			openId = result.data.openId;
			showCreate = false;
			newName = '';
		}
	};

	// Warn while typing when the name is already used; the server refuses it too.
	let newName = $state('');
	let editName = $state<{ id: string; value: string } | null>(null);
	function nameTaken(name: string, exceptId: string | null): boolean {
		return name.trim() !== '' && data.roles.some((r) => r.id !== exceptId && sameRoleName(r.name, name));
	}

	/** Save, delete and reorder all post from the editor's own form; a delete simply
	 *  takes the row away, so nothing has to close the panel by hand. */
	const keepOpen: SubmitFunction = () => async ({ update }) => {
		await update({ reset: false });
	};
</script>

<svelte:head><title>{pageTitle(t.rolesAdmin.pageTitle, t.membersAdmin.title)}</title></svelte:head>

{#if form?.error}
	<div class="alert-error">{form.error}</div>
{/if}

<section class="section section--lead">
	<div class="section-head section-head--row">
		<div>
			<h2>{t.rolesAdmin.title}</h2>
			<p>{data.isOwner ? t.rolesAdmin.ownerNote : t.rolesAdmin.rankNote}</p>
		</div>
		{#if data.canCreate}
			<button type="button" class="btn-action btn-sm" onclick={() => (showCreate = !showCreate)}>
				{showCreate ? t.common.cancel : '+ ' + t.rolesAdmin.newRole}
			</button>
		{/if}
	</div>

	{#if showCreate && data.canCreate}
		<form method="POST" action="?/createRole" class="create" use:enhance={onCreate}>
			<div class="create-top">
				<div class="fld fld-grow">
					<label for="new-role-name">{t.rolesAdmin.roleName}</label>
					<input
						id="new-role-name"
						name="name"
						type="text"
						required
						maxlength="40"
						autocomplete="off"
						placeholder={t.rolesAdmin.roleNamePlaceholder}
						bind:value={newName}
						aria-describedby={nameTaken(newName, null) ? 'new-role-taken' : undefined}
					/>
				</div>
				<button type="submit" class="btn-action btn-sm create-submit">{t.common.create}</button>
			</div>
			{#if nameTaken(newName, null)}
				<p id="new-role-taken" class="alert-warning name-warn">{t.serverErrors.roleNameTaken}</p>
			{/if}
			<div class="fld">
				<span class="fld-label">{t.rolesAdmin.color}</span>
				{@render colorPicker(null, false)}
			</div>
			<p class="create-hint">{t.rolesAdmin.createHint}</p>
		</form>
	{/if}

	{#if data.roles.length === 0}
		<div class="card--inset state-block">
			<span class="icon-tile" aria-hidden="true">
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
					<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
					<circle cx="9" cy="7" r="4" />
					<path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
				</svg>
			</span>
			<h3>{t.rolesAdmin.noRoles}</h3>
			<p>{t.rolesAdmin.noRolesHint}</p>
		</div>
	{:else}
		<div class="row-list">
			{#each data.roles as role, i (role.id)}
				{@const isOpen = openId === role.id}
				<div class="row-item role-row">
					<span
						class="swatch"
						class:swatch--none={!role.color}
						style:background={role.color ?? 'transparent'}
						aria-hidden="true"
					></span>

					<div class="r-info">
						<div class="r-name-row">
							<span class="r-name">{roleDisplayName(role.name, t)}</span>
							{#if role.isDefault}
								<span class="pill pill--default" title={t.rolesAdmin.defaultRoleHint}>
									{t.rolesAdmin.defaultRole}
								</span>
							{/if}
							{#if !role.canManage}
								<span class="pill pill--locked">{t.rolesAdmin.readOnly}</span>
							{/if}
						</div>
						<span class="r-summary">{summary(role.permissions)}</span>
					</div>

					<span class="r-count">{t.rolesAdmin.memberCount(role.memberCount)}</span>

					<div class="r-order">
						<form method="POST" action="?/moveRole" use:enhance={keepOpen}>
							<input type="hidden" name="id" value={role.id} />
							<input type="hidden" name="dir" value="up" />
							<button
								type="submit"
								class="icon-btn"
								disabled={!canSwap(i, i - 1)}
								aria-label={t.rolesAdmin.moveUp}
								title={t.rolesAdmin.moveUp}
							>
								<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="m6 15 6-6 6 6" /></svg>
							</button>
						</form>
						<form method="POST" action="?/moveRole" use:enhance={keepOpen}>
							<input type="hidden" name="id" value={role.id} />
							<input type="hidden" name="dir" value="down" />
							<button
								type="submit"
								class="icon-btn"
								disabled={!canSwap(i, i + 1)}
								aria-label={t.rolesAdmin.moveDown}
								title={t.rolesAdmin.moveDown}
							>
								<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="m6 9 6 6 6-6" /></svg>
							</button>
						</form>
					</div>

					<button
						type="button"
						class="btn-outline btn-sm r-toggle"
						aria-expanded={isOpen}
						onclick={() => (openId = isOpen ? null : role.id)}
					>
						{isOpen ? t.rolesAdmin.close : role.canManage ? t.common.edit : t.rolesAdmin.view}
					</button>
				</div>

				{#if isOpen}
					<form method="POST" action="?/updateRole" class="card--inset editor" use:enhance={keepOpen}>
						<input type="hidden" name="id" value={role.id} />

						{#if !role.canManage}
							<p class="alert-warning editor-warn">{t.rolesAdmin.readOnlyHint}</p>
						{/if}

						<div class="editor-head">
							<div class="fld fld-grow">
								<label for={'name-' + role.id}>{t.rolesAdmin.roleName}</label>
								<input
									id={'name-' + role.id}
									name="name"
									type="text"
									required
									maxlength="40"
									autocomplete="off"
									value={role.name}
									disabled={!role.canManage}
									oninput={(e) => (editName = { id: role.id, value: e.currentTarget.value })}
								/>
							</div>
							<div class="fld">
								<span class="fld-label">{t.rolesAdmin.color}</span>
								{@render colorPicker(role.color, !role.canManage)}
							</div>
						</div>
						{#if editName?.id === role.id && !sameRoleName(editName.value, role.name) && nameTaken(editName.value, role.id)}
							<p class="alert-warning name-warn">{t.serverErrors.roleNameTaken}</p>
						{/if}

						{#if role.isDefault}
							<p class="editor-note">{t.rolesAdmin.defaultRoleHint}</p>
						{/if}

						<div class="perm-groups">
							{#each PERMISSION_GROUPS as group (group.key)}
								<fieldset class="perm-group">
									<legend class="perm-group-title">{groupLabel(group.key)}</legend>
									<div class="perm-list">
										{#each group.permissions as p (p)}
											{@const held = grantable.has(p)}
											{@const locked = !held || !role.canManage}
											{@const elevated = ELEVATED.includes(p)}
											<label class="perm" class:perm--locked={locked}>
												<span class="ui-switch">
													<input
														type="checkbox"
														name="perm"
														value={p}
														checked={role.permissions.includes(p)}
														disabled={locked}
													/>
													<span class="ui-switch-track" aria-hidden="true"></span>
												</span>
												<span class="perm-body">
													<span class="perm-head">
														<span class="perm-name">{permLabel(p)}</span>
														{#if elevated}
															<span class="pill pill--warn">{t.rolesAdmin.elevated}</span>
														{/if}
													</span>
													<span class="perm-desc">{permDesc(p)}</span>
													{#if elevated}
														<span class="perm-note perm-note--warn">{t.rolesAdmin.elevatedHint}</span>
													{/if}
													{#if !held}
														<span class="perm-note">{t.rolesAdmin.notHeldHint}</span>
													{/if}
												</span>
											</label>
										{/each}
									</div>
								</fieldset>
							{/each}
						</div>

						{#if role.canManage}
							<div class="editor-actions">
								<button type="submit" class="btn-action btn-sm">{t.common.save}</button>
								{#if role.isDefault}
									<span class="editor-hint">{t.rolesAdmin.cannotDeleteDefault}</span>
								{:else}
									<button
										type="submit"
										class="btn-danger"
										formaction="?/deleteRole"
										formnovalidate
										onclick={(ev) => {
											if (!window.confirm(t.rolesAdmin.confirmDelete)) ev.preventDefault();
										}}
									>
										{t.rolesAdmin.deleteRole}
									</button>
								{/if}
							</div>
						{/if}
					</form>
				{/if}
			{/each}
		</div>
	{/if}
</section>

<!-- One picker, used by the create form and by every editor. `name="color"` is
     scoped to its own <form>, so the two never share a radio group. -->
{#snippet colorPicker(selected: string | null, disabled: boolean)}
	{@const sel = (selected ?? '').toLowerCase()}
	{@const list = sel && !ROLE_COLORS.includes(sel) ? [sel, ...ROLE_COLORS] : ROLE_COLORS}
	<div class="swatches" role="group" aria-label={t.rolesAdmin.color}>
		<label class="sw" class:sw--on={!sel}>
			<input type="radio" name="color" value="" checked={!sel} {disabled} />
			<span class="sw-box sw-box--none" aria-hidden="true"></span>
			<span class="sr-only">{t.rolesAdmin.colorNone}</span>
		</label>
		{#each list as c (c)}
			<label class="sw" class:sw--on={sel === c}>
				<input type="radio" name="color" value={c} checked={sel === c} {disabled} />
				<span class="sw-box" style:background={c} aria-hidden="true"></span>
				<span class="sr-only">{c}</span>
			</label>
		{/each}
	</div>
{/snippet}

<style>
	/* ─── Create ─────────────────────────────────────────────────── */
	.create {
		display: flex;
		flex-direction: column;
		gap: 14px;
		margin-bottom: 20px;
	}
	.create-top {
		display: flex;
		align-items: flex-end;
		gap: 12px;
		flex-wrap: wrap;
	}
	.create-submit {
		height: var(--control-h);
		box-sizing: border-box;
		padding-block: 0;
		flex-shrink: 0;
	}
	.name-warn { margin: 0; max-width: 60ch; }
	.create-hint {
		margin: 0;
		font-size: 12px;
		color: var(--text-muted);
		max-width: 60ch;
	}

	/* ─── Fields ─────────────────────────────────────────────────── */
	.fld {
		display: flex;
		flex-direction: column;
		gap: 5px;
		min-width: 0;
	}
	.fld-grow { flex: 1; min-width: 200px; }
	.fld label,
	.fld-label {
		font-size: 10px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: .12em;
		color: var(--text-muted);
	}
	.fld input[type='text'] {
		height: var(--control-h);
		box-sizing: border-box;
		padding: 0 11px;
		font-size: 13px;
	}
	.fld input[type='text']:disabled {
		opacity: .65;
		cursor: not-allowed;
	}

	/* ─── Colour swatches ────────────────────────────────────────── */
	.swatches { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
	.sw { position: relative; display: inline-flex; cursor: pointer; }
	.sw input {
		position: absolute;
		opacity: 0;
		width: 0;
		height: 0;
	}
	.sw-box {
		width: 22px;
		height: 22px;
		border-radius: var(--radius-sm);
		border: 1px solid var(--border);
		box-sizing: border-box;
		transition: box-shadow .15s, border-color .15s;
	}
	/* "No colour": a hairline square with a diagonal, not an empty hole. */
	.sw-box--none {
		background:
			linear-gradient(to top right,
				transparent calc(50% - 1px), var(--text-subtle) calc(50% - 1px),
				var(--text-subtle) calc(50% + 1px), transparent calc(50% + 1px));
	}
	.sw--on .sw-box {
		border-color: var(--text-base);
		box-shadow: 0 0 0 2px var(--bg-panel), 0 0 0 3px var(--text-base);
	}
	.sw input:focus-visible ~ .sw-box {
		outline: 2px solid var(--accent-ink);
		outline-offset: 2px;
	}
	.sw input:disabled ~ .sw-box { opacity: .5; cursor: not-allowed; }

	/* ─── Role rows ──────────────────────────────────────────────── */
	.swatch {
		width: 12px;
		height: 12px;
		border-radius: var(--radius-sm);
		flex-shrink: 0;
	}
	.swatch--none { border: 1px solid var(--border); }

	.r-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
	.r-name-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
	.r-name {
		font-size: 14px;
		font-weight: 600;
		color: var(--text-base);
		letter-spacing: -.01em;
	}
	.r-summary {
		font-size: 12px;
		color: var(--text-muted);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.r-count {
		font-size: 12px;
		color: var(--text-muted);
		white-space: nowrap;
		flex-shrink: 0;
	}

	.pill {
		font-size: 10px;
		font-weight: 650;
		text-transform: uppercase;
		letter-spacing: .06em;
		border-radius: var(--radius-sm);
		padding: 1px 7px;
		white-space: nowrap;
	}
	.pill--default { background: var(--accent-dim); color: var(--accent-ink); }
	.pill--locked {
		background: var(--bg-panel2);
		color: var(--text-muted);
		border: 1px solid var(--border);
	}
	.pill--warn { background: var(--warning-dim); color: var(--warning); }

	.r-order { display: flex; gap: 4px; flex-shrink: 0; }
	.icon-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		border-radius: var(--radius-sm);
		border: 1px solid var(--border);
		background: var(--bg-panel);
		color: var(--text-muted);
		cursor: pointer;
		font-family: inherit;
		transition: color .15s, border-color .15s, background .15s;
	}
	.icon-btn:hover:not(:disabled) {
		color: var(--text-base);
		background: var(--bg-hover);
	}
	.icon-btn:disabled { opacity: .35; cursor: not-allowed; }
	.r-toggle { flex-shrink: 0; }

	/* ─── Editor ─────────────────────────────────────────────────── */
	.editor {
		display: flex;
		flex-direction: column;
		gap: 20px;
		margin: 4px 0 14px;
	}
	.editor-warn { margin: 0; }
	.editor-head {
		display: flex;
		gap: 20px;
		flex-wrap: wrap;
		align-items: flex-end;
	}
	.editor-note,
	.editor-hint {
		margin: 0;
		font-size: 12px;
		color: var(--text-muted);
		max-width: 60ch;
	}

	.perm-groups { display: flex; flex-direction: column; gap: 22px; }
	.perm-group { border: none; padding: 0; margin: 0; min-width: 0; }
	.perm-group-title {
		padding: 0 0 10px;
		font-size: var(--meta-size);
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: .08em;
		color: var(--text-muted);
	}
	.perm-list {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
		gap: 14px 24px;
	}

	.perm {
		display: flex;
		gap: 11px;
		align-items: flex-start;
		cursor: pointer;
		min-width: 0;
	}
	.perm--locked { cursor: not-allowed; }
	.perm-body { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
	.perm-head { display: flex; align-items: center; gap: 7px; flex-wrap: wrap; }
	.perm-name { font-size: 13px; font-weight: 600; color: var(--text-base); }
	.perm--locked .perm-name { color: var(--text-muted); }
	.perm-desc { font-size: 12px; color: var(--text-muted); line-height: 1.5; }
	.perm-note {
		font-size: 11px;
		color: var(--text-subtle);
		line-height: 1.5;
		margin-top: 2px;
	}
	.perm-note--warn { color: var(--warning); }

	.editor-actions {
		display: flex;
		align-items: center;
		gap: 12px;
		flex-wrap: wrap;
	}

	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
		border: 0;
	}

	@media (max-width: 720px) {
		.role-row { flex-wrap: wrap; }
		.r-count { order: 5; width: 100%; }
	}
</style>
