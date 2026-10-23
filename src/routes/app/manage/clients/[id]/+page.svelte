<script lang="ts">
	import { pageTitle } from '$lib/page-title';
	import { enhance } from '$app/forms';
	import { t, getLocale } from '$lib/i18n.svelte';
	import { formatDate, formatDateTime } from '$lib/format';
	import { formatRating } from '$lib/feedback';
	import StatusBadge from '$lib/components/StatusBadge.svelte';
	import StarRating from '$lib/components/StarRating.svelte';
	import type { PageData, ActionData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const c = $derived(data.client);
	const day = (d: string | null | undefined) => (d ? formatDate(d, getLocale()) : '—');
	type Status = 'pending' | 'waiting_payment' | 'approved' | 'planned' | 'completed' | 'cancelled';
	const isPast = (d: string) => d.slice(0, 10) < data.today;
</script>

<svelte:head><title>{pageTitle(c.name, t.clients.title)}</title></svelte:head>

<div class="page wrap">
	<a href="/app/manage/clients" class="back">
		<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><polyline points="15 18 9 12 15 6"/></svg>
		{t.clients.back}
	</a>

	<div class="page-header">
		<div>
			<h1 class="page-title">{c.name}</h1>
			<p class="head-sub">
				{#if c.kind === 'guest'}
					<span class="guest-tag">{t.clients.guestTag}</span> {t.clients.guestHint}
				{:else if data.registeredAt}
					{t.clients.registeredOn(day(data.registeredAt))}
				{/if}
			</p>
		</div>
	</div>

	<!-- Contact and the figures that matter at a glance -->
	<section class="section section--lead">
		<div class="cl-top">
			<dl class="contact">
				<div><dt>{t.clients.email}</dt><dd>{#if c.email}<a href="mailto:{c.email}">{c.email}</a>{:else}—{/if}</dd></div>
				<div><dt>{t.clients.phone}</dt><dd>{#if c.phone}<a href="tel:{c.phone.replace(/[^\d+]/g, '')}">{c.phone}</a>{:else}—{/if}</dd></div>
			</dl>
			<dl class="stats">
				<div><dt>{t.clients.statBookings}</dt><dd>{c.bookings}</dd></div>
				<div><dt>{t.clients.statUpcoming}</dt><dd>{data.upcoming}</dd></div>
				<div><dt>{t.clients.statCompleted}</dt><dd>{data.completed}</dd></div>
				<div>
					<dt>{t.clients.statRating}</dt>
					<dd>
						{#if data.ratings.average != null}
							<span class="star" aria-hidden="true">★</span> {formatRating(data.ratings.average, getLocale())}
							<span class="dd-sub">{t.feedback.count(data.ratings.count)}</span>
						{:else}—{/if}
					</dd>
				</div>
			</dl>
		</div>
	</section>

	<div class="cl-cols">
		<div class="cl-main">
			<!-- Every event with the venue, newest first -->
			<section class="section">
				<div class="section-head"><h2>{t.clients.events}</h2></div>
				{#if data.bookings.length === 0}
					<p class="muted">{t.clients.noEvents}</p>
				{:else}
					<div class="row-list">
						{#each data.bookings as b (b.id)}
							<a href="/app/reservation/{b.id}" class="row-item row-item--bleed ev-row" class:is-past={isPast(b.event_date)}>
								<div class="ev-main">
									<span class="ev-title">{b.title}</span>
									<span class="ev-sub">{b.hall_name}</span>
								</div>
								<span class="ev-date">{day(b.event_date)}</span>
								<StatusBadge status={b.status as Status} />
							</a>
						{/each}
					</div>
				{/if}
			</section>

			<!-- Feedback: private to the venue -->
			{#if c.kind === 'account'}
				<section class="section">
					<div class="section-head"><h2>{t.clients.feedback}</h2></div>
					{#if data.feedback.length === 0}
						<p class="muted">{t.clients.noFeedback}</p>
					{:else}
						<ul class="fb-list">
							{#each data.feedback as f (f.reservation_id)}
								<li class="fb-item">
									<div class="fb-head">
										<StarRating rating={f.rating} />
										<a href="/app/reservation/{f.reservation_id}" class="fb-event">{f.title}</a>
										<span class="fb-meta">{f.hall_name} · {day(f.event_date)}</span>
									</div>
									<p class="fb-comment" class:muted={!f.comment}>{f.comment ?? t.feedback.noComment}</p>
								</li>
							{/each}
						</ul>
					{/if}
				</section>
			{/if}

			<!-- Conversations -->
			{#if c.kind === 'account'}
				<section class="section">
					<div class="section-head"><h2>{t.clients.messages}</h2></div>
					{#if data.threads.length === 0}
						<p class="muted">{t.clients.noMessages}</p>
					{:else if data.canReadMessages}
						<div class="row-list">
							{#each data.threads as th (th.id)}
								<a href="/app/manage/messages/{th.id}" class="row-item row-item--bleed ev-row">
									<div class="ev-main">
										<span class="ev-title">{th.subject}</span>
										<span class="ev-sub">{t.clients.messageCount(th.message_count)} · {formatDateTime(th.updated_at, getLocale())}</span>
									</div>
									<span></span>
									<StatusBadge status={th.status === 'closed' ? 'closed' : 'open'} />
								</a>
							{/each}
						</div>
					{:else}
						<p class="muted">{t.clients.messagesStaffOnly(data.threads.length)}</p>
					{/if}
				</section>
			{/if}
		</div>

		<!-- The team's private notes -->
		<aside class="cl-side">
			<section class="section notes">
				<div class="section-head">
					<h2>{t.clients.notes}</h2>
					<p>{t.clients.notesHint}</p>
				</div>
				<form method="POST" action="?/saveNotes" class="notes-form"
					use:enhance={() => async ({ update }) => { await update({ reset: false }); }}>
					<div class="field">
						<label for="cn-phone">{t.clients.phone}</label>
						<input id="cn-phone" name="phone" type="tel" maxlength="40" autocomplete="off"
							value={data.notes?.phone ?? ''} placeholder={t.clients.phonePlaceholder} />
					</div>
					<div class="field">
						<label for="cn-notes">{t.clients.notes}</label>
						<textarea id="cn-notes" name="notes" rows="7" maxlength="5000"
							placeholder={t.clients.notesPlaceholder}>{data.notes?.notes ?? ''}</textarea>
					</div>
					{#if form?.notesError}<p class="n-err" role="alert">{form.notesError}</p>{/if}
					{#if form?.notesSaved}<p class="n-ok" role="status">{t.clients.notesSaved}</p>{/if}
					<div class="n-actions">
						{#if data.notes?.updated_at}
							<span class="n-meta">{t.clients.lastEdited(data.notes.updated_by_name ?? '—', formatDateTime(data.notes.updated_at, getLocale()))}</span>
						{/if}
						<button type="submit" class="btn-action btn-sm">{t.clients.saveNotes}</button>
					</div>
				</form>
			</section>
		</aside>
	</div>
</div>

<style>
	.page { padding-block: 24px; }
	.back {
		display: inline-flex; align-items: center; gap: 6px; margin-bottom: 14px;
		font-size: 12.5px; font-weight: 600; color: var(--text-muted); text-decoration: none;
	}
	.back:hover { color: var(--accent-ink); }
	.page-header { padding-bottom: 18px; }
	.page-title { font-size: var(--display-size); font-weight: 550; color: var(--text-base); letter-spacing: -.055em; line-height: 1.08; margin: 0; }
	.head-sub { font-size: 13px; color: var(--text-muted); margin: 6px 0 0; }
	.guest-tag {
		display: inline-block; padding: 0 6px; border-radius: 3px;
		font-size: 10.5px; font-weight: 600; color: var(--text-muted); background: var(--bg-hover);
	}
	.muted { font-size: 13px; color: var(--text-muted); margin: 0; }

	.cl-top { display: flex; flex-wrap: wrap; gap: 18px 40px; justify-content: space-between; }
	.contact, .stats { display: flex; flex-wrap: wrap; gap: 14px 32px; margin: 0; }
	dt { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .1em; color: var(--text-muted); margin-bottom: 3px; }
	dd { margin: 0; font-size: 14px; color: var(--text-base); overflow-wrap: anywhere; }
	.stats dd { font-size: 20px; font-weight: 600; font-variant-numeric: tabular-nums; }
	.dd-sub { display: block; font-size: 11.5px; font-weight: 500; color: var(--text-muted); }
	.contact a { color: var(--accent-ink); text-decoration: none; }
	.contact a:hover { text-decoration: underline; }
	.star { color: var(--warning); }

	.cl-cols { display: grid; grid-template-columns: minmax(0, 1fr) minmax(260px, 340px); gap: 0 28px; align-items: start; }
	@media (max-width: 900px) { .cl-cols { grid-template-columns: 1fr; } }

	.ev-row {
		display: grid; grid-template-columns: minmax(0, 1fr) auto auto; gap: 14px; align-items: center;
		color: var(--text-base); text-decoration: none; transition: background .15s;
	}
	.ev-row:hover { background: var(--bg-hover); }
	.ev-row.is-past { opacity: .7; }
	.ev-main { min-width: 0; }
	.ev-title { display: block; font-size: 13px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.ev-sub { display: block; font-size: 11.5px; color: var(--text-muted); margin-top: 1px; }
	.ev-date { font-size: 12px; font-weight: 600; color: var(--text-muted); white-space: nowrap; }

	.fb-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 14px; }
	.fb-item { padding-bottom: 14px; border-bottom: 1px solid var(--border-subtle); }
	.fb-item:last-child { border-bottom: none; padding-bottom: 0; }
	.fb-head { display: flex; flex-wrap: wrap; gap: 4px 10px; align-items: baseline; }
	.fb-event { font-size: 13px; font-weight: 600; color: var(--text-base); text-decoration: none; }
	.fb-event:hover { color: var(--accent-ink); }
	.fb-meta { font-size: 11.5px; color: var(--text-muted); }
	.fb-comment { font-size: 13px; line-height: 1.55; margin: 6px 0 0; white-space: pre-line; overflow-wrap: anywhere; }

	.notes-form { display: flex; flex-direction: column; gap: 10px; }
	.notes-form .field { display: flex; flex-direction: column; gap: 4px; margin: 0; }
	.notes-form label { font-size: 12.5px; font-weight: 600; color: var(--text-base); }
	.notes-form textarea { resize: vertical; }
	.n-actions { display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; }
	.n-actions button { margin-left: auto; }
	.n-meta { font-size: 11.5px; color: var(--text-subtle); }
	.n-err { color: var(--danger); font-size: 12.5px; margin: 0; }
	.n-ok { color: var(--success); font-size: 12.5px; margin: 0; }
</style>
