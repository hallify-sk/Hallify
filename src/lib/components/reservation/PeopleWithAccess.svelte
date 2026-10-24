<!--
	Staff side of shared events (0038): who else the event is shared with, add a
	client of the venue (or any address, which gets an invitation), resend a pending
	invitation, remove someone. The primary client and "re-assign" stay on the page
	above this. Posts to the ?/members* actions of /app/reservation/[id].
-->
<script lang="ts">
	import { enhance } from '$app/forms';
	import { t, getLocale } from '$lib/i18n.svelte';
	import { formatDate } from '$lib/format';

	interface Member {
		id: string; email: string; first_name: string | null; last_name: string | null;
		status: 'invited' | 'joined'; expired: boolean; created_at: string;
	}
	interface Props {
		members: Member[];
		venueClients: Array<{ email: string; first_name: string; last_name: string }>;
		form: Record<string, unknown> | null | undefined;
	}
	const { members, venueClients, form }: Props = $props();

	const s = $derived(t.sharedEvent);
	const name = (m: Member) => `${m.first_name ?? ''} ${m.last_name ?? ''}`.trim();
	const emailFailed = $derived(form?.memberEmailSent === false);
</script>

<div class="people">
	<h3 class="people-h">{s.membersTitle}</h3>
	<p class="people-hint">{s.staffHint}</p>

	{#if form?.memberAdded || form?.memberInvited || form?.memberResent}
		<div class="people-toast" class:warn={emailFailed} class:ok={!emailFailed} role={emailFailed ? 'alert' : 'status'}>
			{emailFailed ? s.emailFailed : form?.memberAdded ? s.addedToast : form?.memberInvited ? s.invitedToast : s.resentToast}
		</div>
	{/if}
	{#if form?.memberRemoved}<div class="people-toast" role="status">{s.removedToast}</div>{/if}

	{#if members.length === 0}
		<p class="people-empty">{s.noMembers}</p>
	{:else}
		<ul class="people-list">
			{#each members as m (m.id)}
				<li class="people-row">
					<span class="people-who">
						{#if name(m)}<strong>{name(m)}</strong> <span class="people-mail">{m.email}</span>{:else}<strong>{m.email}</strong>{/if}
					</span>
					<span class="people-status" class:joined={m.status === 'joined'} class:expired={m.expired}>
						{m.status === 'joined' ? s.statusJoined : m.expired ? s.statusExpired : `${s.statusInvited} · ${formatDate(m.created_at.slice(0, 10), getLocale())}`}
					</span>
					<span class="people-actions">
						{#if m.status === 'invited'}
							<form method="POST" action="?/membersResend" use:enhance>
								<input type="hidden" name="memberId" value={m.id} />
								<button class="people-link" type="submit">{s.resend}</button>
							</form>
						{/if}
						<form method="POST" action="?/membersRemove"
							use:enhance={({ cancel }) => { if (!confirm(s.removeConfirm)) cancel(); }}>
							<input type="hidden" name="memberId" value={m.id} />
							<button class="people-link danger" type="submit">{s.remove}</button>
						</form>
					</span>
				</li>
			{/each}
		</ul>
	{/if}

	<form method="POST" action="?/membersAdd" use:enhance class="people-add">
		<label class="people-label" for="people-add-email">{s.addLabel}</label>
		<div class="people-add-row">
			<input id="people-add-email" name="email" type="email" list="people-clients" required autocomplete="off"
				placeholder={s.addPlaceholder} />
			<button type="submit" class="btn-action btn-sm">{s.addSubmit}</button>
		</div>
		<datalist id="people-clients">
			{#each venueClients as c}<option value={c.email}>{c.first_name} {c.last_name}</option>{/each}
		</datalist>
		<p class="people-hint small">{s.staffAddHint}</p>
		{#if form?.membersError}<span class="people-err" role="alert">{form.membersError}</span>{/if}
	</form>
</div>

<style>
	.people { margin-top: 18px; padding-top: 16px; border-top: 1px solid var(--border-subtle); max-width: 640px; }
	.people-h { font-size: 13px; font-weight: 650; color: var(--text-base); margin: 0 0 4px; }
	.people-hint { font-size: 12px; line-height: 1.55; color: var(--text-muted); margin: 0 0 10px; }
	.people-hint.small { font-size: 11.5px; color: var(--text-subtle); margin: 0; }
	.people-empty { font-size: 12.5px; color: var(--text-subtle); margin: 0 0 10px; }
	.people-list { list-style: none; margin: 0 0 12px; padding: 0; }
	.people-row {
		display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
		padding: 8px 0; border-bottom: 1px solid var(--border-subtle); font-size: 12.5px;
	}
	.people-who { flex: 1 1 220px; min-width: 0; overflow-wrap: anywhere; color: var(--text-base); }
	.people-mail { color: var(--text-muted); }
	.people-status { font-size: 11.5px; font-weight: 600; color: var(--warning); white-space: nowrap; }
	.people-status.joined { color: var(--success); }
	.people-status.expired { color: var(--text-subtle); }
	.people-actions { display: flex; gap: 12px; }
	.people-link {
		background: none; border: none; padding: 0; cursor: pointer; font: inherit;
		font-size: 12px; font-weight: 600; color: var(--accent-ink); text-decoration: underline;
	}
	.people-link.danger { color: var(--danger); }
	.people-add { display: flex; flex-direction: column; gap: 6px; }
	.people-label { font-size: 12px; font-weight: 600; color: var(--text-muted); }
	.people-add-row { display: flex; gap: 8px; }
	.people-add-row input {
		flex: 1; min-width: 0; box-sizing: border-box; font: inherit; font-size: 13px;
		padding: 8px 11px; border: 1px solid var(--border); border-radius: var(--radius);
		background: var(--bg-panel); color: var(--text-base);
	}
	.people-add-row input:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-dim); }
	.people-err { font-size: 12px; color: var(--danger); }
	.people-toast {
		font-size: 12.5px; font-weight: 600; margin: 0 0 8px; padding: 7px 10px; border-radius: var(--radius);
		background: var(--bg-hover); color: var(--text-muted);
	}
	.people-toast.ok { color: var(--success); }
	.people-toast.warn { color: var(--text-base); background: var(--warning-dim); }
</style>
