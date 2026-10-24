<!--
	"Shared with" on the client's booking page (shared events, 0038). Self-contained:
	the owner (canManage) sees everyone with access, invites by email and removes; a
	member sees who else is on the event and can leave it. The forms post to the
	page's ?/membersInvite, ?/membersRemove and ?/membersLeave actions; the server
	decides who may do what, this only hides what they may not.
-->
<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import { t } from '$lib/i18n.svelte';

	interface Member {
		id: string;
		name: string | null;
		email: string | null;
		status: 'invited' | 'joined';
		expired: boolean;
		isOwner: boolean;
		isSelf: boolean;
	}
	interface Props {
		members: Member[];
		canManage: boolean;
		reservationId: string;
	}
	const { members, canManage, reservationId }: Props = $props();

	const s = $derived(t.sharedEvent);
	const form = $derived(page.form as Record<string, unknown> | null);
	const err = $derived(form?.scope === 'members' ? (form?.error as string | undefined) : undefined);
	const action = (name: string) => `/halls/my-reservations/${reservationId}?/${name}`;
	let email = $state('');
</script>

{#if canManage || members.length > 0}
	<section class="section shared-card" id="shared-with" aria-labelledby="shared-with-h">
		<div class="section-head">
			<h2 id="shared-with-h">{s.membersTitle}</h2>
			<p>{canManage ? s.cardIntro : s.cardIntroMember}</p>
		</div>

		{#if form?.membersInvited}
			<div class="sw-toast" class:ok={form?.membersEmailSent !== false} role="status">
				{form?.membersEmailSent === false ? s.emailFailed : s.invitedToast}
			</div>
		{/if}
		{#if form?.membersRemoved}<div class="sw-toast" role="status">{s.removedToast}</div>{/if}

		{#if members.length === 0}
			<p class="sw-empty">{s.noMembers}</p>
		{:else}
			<ul class="sw-list">
				{#each members as m (m.id)}
					<li class="sw-row">
						<span class="sw-who">
							<strong>{m.name || m.email || '—'}</strong>
							{#if m.isOwner}<span class="sw-tag">{s.ownerLabel}</span>{/if}
							{#if m.isSelf}<span class="sw-tag">{s.you}</span>{/if}
							{#if canManage && m.name && m.email}<span class="sw-mail">{m.email}</span>{/if}
						</span>
						{#if canManage}
							<span class="sw-status" class:joined={m.status === 'joined'}>
								{m.status === 'joined' ? s.statusJoined : m.expired ? s.statusExpired : s.statusInvited}
							</span>
							<form method="POST" action={action('membersRemove')}
								use:enhance={({ cancel }) => { if (!confirm(s.removeConfirm)) cancel(); return async ({ update }) => update(); }}>
								<input type="hidden" name="memberId" value={m.id} />
								<button type="submit" class="sw-link danger">{s.remove}</button>
							</form>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}

		{#if canManage}
			<form method="POST" action={action('membersInvite')} class="sw-invite"
				use:enhance={() => async ({ result, update }) => { await update({ reset: false }); if (result.type === 'success') email = ''; }}>
				<label for="sw-email" class="sw-label">{s.inviteLabel}</label>
				<div class="sw-invite-row">
					<input id="sw-email" name="email" type="email" required autocomplete="off" placeholder={s.invitePlaceholder} bind:value={email} />
					<button type="submit" class="sw-btn">{s.inviteSubmit}</button>
				</div>
			</form>
		{:else}
			<form method="POST" action={action('membersLeave')}
				use:enhance={({ cancel }) => { if (!confirm(s.leaveConfirm)) cancel(); }}>
				<button type="submit" class="sw-link danger">{s.leave}</button>
			</form>
		{/if}
		{#if err}<p class="sw-err" role="alert">{err}</p>{/if}
	</section>
{/if}

<style>
	.sw-list { list-style: none; margin: 0 0 16px; padding: 0; }
	.sw-row {
		display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
		padding: 10px 0; border-bottom: 1px solid var(--border-subtle); font-size: 13.5px;
	}
	.sw-who { flex: 1 1 220px; min-width: 0; display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; overflow-wrap: anywhere; }
	.sw-mail { font-size: 12.5px; color: var(--text-muted); }
	.sw-tag {
		font-size: 10.5px; font-weight: 650; text-transform: uppercase; letter-spacing: .08em;
		color: var(--text-muted); background: var(--bg-hover); padding: 2px 7px; border-radius: var(--radius-sm);
	}
	.sw-status { font-size: 12px; font-weight: 600; color: var(--warning); white-space: nowrap; }
	.sw-status.joined { color: var(--success); }
	.sw-empty { font-size: 13px; color: var(--text-muted); margin: 0 0 14px; }
	.sw-link {
		background: none; border: none; padding: 0; cursor: pointer; font: inherit;
		font-size: 12.5px; font-weight: 600; color: var(--accent-ink); text-decoration: underline;
	}
	.sw-link.danger { color: var(--danger); }
	.sw-invite { display: flex; flex-direction: column; gap: 6px; max-width: 520px; }
	.sw-label { font-size: 12.5px; font-weight: 600; color: var(--text-base); }
	.sw-invite-row { display: flex; gap: 8px; flex-wrap: wrap; }
	.sw-invite-row input {
		flex: 1 1 220px; min-width: 0; box-sizing: border-box; font: inherit; font-size: 14px;
		padding: 9px 12px; border: 1px solid var(--border); border-radius: var(--radius-sm);
		background: var(--bg-panel2, var(--bg-panel)); color: var(--text-base);
	}
	.sw-invite-row input:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-dim); }
	.sw-btn {
		padding: 9px 16px; border-radius: var(--radius-sm); border: none; cursor: pointer; font: inherit;
		font-size: 13px; font-weight: 650; background: var(--accent); color: var(--accent-contrast);
	}
	.sw-btn:hover { background: var(--accent-hover); }
	.sw-toast {
		font-size: 13px; font-weight: 600; margin: 0 0 12px; padding: 8px 12px; border-radius: var(--radius);
		background: var(--bg-hover); color: var(--text-muted);
	}
	.sw-toast.ok { color: var(--success); background: var(--success-dim); }
	.sw-err { font-size: 13px; color: var(--danger); margin: 10px 0 0; }
</style>
