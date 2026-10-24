<script lang="ts">
	import { enhance } from '$app/forms';
	import { pageTitle } from '$lib/page-title';
	import { t, getLocale } from '$lib/i18n.svelte';
	import { confirmFirst } from '$lib/forms';
	import { formatDateTime, timeAgo } from '$lib/format';
	import { PLATFORM_EVENT_GROUPS, PLATFORM_EVENT_FIELDS, type PlatformEventGroup, type PlatformPayloadEvent } from '$lib/platform-webhook-events';
	import EndpointForm from './EndpointForm.svelte';
	import type { ActionData, PageData } from './$types';

	const { data, form }: { data: PageData; form: ActionData } = $props();

	let showCreate = $state(false);
	let editId = $state<string | null>(null);
	let copied = $state(false);

	const eventLabel = (ev: string) => t.platformWebhooks.events[ev as PlatformPayloadEvent] ?? ev;
	const statusLabel = (s: string) =>
		s === 'delivered' ? t.platformWebhooks.statusDelivered : s === 'failed' ? t.platformWebhooks.statusFailed : t.platformWebhooks.statusPending;
	const host = (url: string) => { try { return new URL(url).host; } catch { return url; } };
	const pretty = (raw: string) => { try { return JSON.stringify(JSON.parse(raw), null, 2); } catch { return raw; } };

	const revealed = $derived(form && 'revealed' in form ? form.revealed : null);
	const sendResult = $derived(form && 'sendResult' in form ? form.sendResult : null);
	const formError = (id: string) => (form && 'formId' in form && form.formId === id ? (form.formError ?? null) : null);
	const echoed = (id: string) => (form && 'formId' in form && form.formId === id ? form.values : null);
	// A refused form stays open with what was typed.
	$effect(() => {
		if (form && 'formId' in form) {
			if (form.formId === 'create') showCreate = true;
			else editId = form.formId ?? null;
		}
	});

	async function copySecret(secret: string) {
		try {
			await navigator.clipboard.writeText(secret);
			copied = true;
			setTimeout(() => (copied = false), 2000);
		} catch { /* the value is selectable */ }
	}

	const keep = () => async ({ update }: { update: (o?: { reset?: boolean }) => Promise<void> }) => { await update({ reset: false }); };

	const groups = Object.entries(PLATFORM_EVENT_GROUPS) as [PlatformEventGroup, readonly string[]][];

	const SAMPLE = `import crypto from 'node:crypto';

// Verify against the RAW body, before parsing it.
export function verifyHallify(rawBody, signatureHeader, secret) {
  const expected = 'sha256=' + crypto
    .createHmac('sha256', secret).update(rawBody).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(signatureHeader ?? '');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Express: app.post('/hallify', express.raw({ type: 'application/json' }), handler)
function handler(req, res) {
  if (!verifyHallify(req.body, req.get('X-Hallify-Signature'), process.env.HALLIFY_SECRET))
    return res.sendStatus(401);
  const event = JSON.parse(req.body);
  if (alreadySeen(event.id)) return res.sendStatus(200); // retries reuse the id
  queue(event);                                         // answer fast, work later
  res.sendStatus(200);
}`;
</script>

<svelte:head><title>{pageTitle(t.platformWebhooks.title)}</title></svelte:head>

<div class="wrap page">
	<section class="section section--lead">
		<div class="section-head head-row">
			<div>
				<p class="eyebrow">{t.platformOrgs.platformAdmin}</p>
				<h1>{t.platformWebhooks.title}</h1>
				<p class="lead">{t.platformWebhooks.lead}</p>
			</div>
			<button class="btn-action btn-sm" type="button" aria-expanded={showCreate} onclick={() => { showCreate = !showCreate; editId = null; }}>
				{showCreate ? t.common.cancel : '+ ' + t.platformWebhooks.addEndpoint}
			</button>
		</div>

		{#if revealed}
			<div class="secret-box" role="status">
				<p class="secret-title">{t.platformWebhooks.secretTitle}</p>
				<div class="secret-row">
					<code class="secret-value">{revealed.secret}</code>
					<button type="button" class="btn-outline btn-sm" onclick={() => copySecret(revealed.secret)}>{copied ? t.platformWebhooks.copied : t.platformWebhooks.copy}</button>
				</div>
				<p class="secret-note">{t.platformWebhooks.secretOnce}</p>
			</div>
		{:else if form && 'saved' in form && form.saved}
			<div class="alert-success" role="status">{t.platformWebhooks.saved}</div>
		{:else if form && 'deleted' in form && form.deleted}
			<div class="alert-success" role="status">{t.platformWebhooks.deleted}</div>
		{/if}
		{#if form && 'error' in form && form.error}
			<div class="alert-error" role="alert">{form.error}</div>
		{/if}

		{#if showCreate}
			<div class="card--inset create-card">
				<h2 class="card-title">{t.platformWebhooks.newEndpoint}</h2>
				<EndpointForm action="?/create" prefix="new" values={echoed('create')} error={formError('create')} submitLabel={t.common.create} onDone={() => (showCreate = false)} />
			</div>
		{/if}

		{#if data.endpoints.length === 0}
			{#if !showCreate}<p class="muted empty">{t.platformWebhooks.empty}</p>{/if}
		{:else}
			<div class="row-list">
				{#each data.endpoints as ep (ep.id)}
					{@const auto = !ep.enabled && ep.disabled_reason === 'failures'}
					<div class="row-item ep" class:off={!ep.enabled}>
						<div class="ep-main">
							<div class="ep-info">
								<div class="ep-title">
									<span class="ep-name">{ep.description || host(ep.url)}</span>
									<span class="pill" class:ok={ep.enabled} class:warn={auto}>
										{ep.enabled ? t.platformWebhooks.statusActive : auto ? t.platformWebhooks.statusAutoDisabled : t.platformWebhooks.statusPaused}
									</span>
								</div>
								<span class="ep-url">{ep.url}</span>
								<div class="tags">
									{#if ep.events === null}
										<span class="tag tag-all">{t.platformWebhooks.allEventsTag}</span>
									{:else}
										{#each ep.events as ev (ev)}<span class="tag">{eventLabel(ev)}</span>{/each}
									{/if}
								</div>
								<p class="ep-meta">
									<span>{t.platformWebhooks.lastSuccess}: {ep.last_success_at ? timeAgo(ep.last_success_at, getLocale()) : t.platformWebhooks.never}</span>
									<span>{t.platformWebhooks.secretEndsWith(ep.secretTail)}</span>
									{#if ep.created_by_email}<span>{t.platformWebhooks.createdBy} {ep.created_by_email}</span>{/if}
								</p>
								{#if auto}
									<p class="ep-warn" role="status">{t.platformWebhooks.autoDisabledNote(ep.consecutive_failures)}{#if ep.disabled_at} ({formatDateTime(ep.disabled_at, getLocale())}){/if}</p>
								{:else if ep.consecutive_failures > 0}
									<p class="ep-warn soft">{t.platformWebhooks.failingNote(ep.consecutive_failures)}</p>
								{/if}
								{#if sendResult && sendResult.id === ep.id}
									<p class="send-result" class:ok={sendResult.ok} role="status">
										{sendResult.ok ? t.platformWebhooks.sentOk(sendResult.statusCode) : t.platformWebhooks.sentFailed(sendResult.error ?? String(sendResult.statusCode ?? ''))}
									</p>
								{/if}
							</div>
							<div class="ep-actions">
								<form method="POST" action="?/test" use:enhance={keep}>
									<input type="hidden" name="id" value={ep.id} />
									<button type="submit" class="btn-outline btn-sm">{t.platformWebhooks.sendTest}</button>
								</form>
								<button type="button" class="btn-outline btn-sm" aria-expanded={editId === ep.id} onclick={() => { editId = editId === ep.id ? null : ep.id; showCreate = false; }}>
									{editId === ep.id ? t.common.cancel : t.platformWebhooks.edit}
								</button>
								<form method="POST" action="?/toggle" use:enhance={keep}>
									<input type="hidden" name="id" value={ep.id} />
									<button type="submit" class="btn-outline btn-sm">{ep.enabled ? t.platformWebhooks.pause : t.platformWebhooks.resume}</button>
								</form>
								<form method="POST" action="?/rollSecret" use:enhance={confirmFirst(() => t.platformWebhooks.confirmRoll, keep())}>
									<input type="hidden" name="id" value={ep.id} />
									<button type="submit" class="btn-outline btn-sm">{t.platformWebhooks.rollSecret}</button>
								</form>
								<form method="POST" action="?/delete" use:enhance={confirmFirst(() => t.platformWebhooks.confirmDelete)}>
									<input type="hidden" name="id" value={ep.id} />
									<button type="submit" class="btn-danger btn-sm">{t.common.delete}</button>
								</form>
							</div>
						</div>
						{#if editId === ep.id}
							<div class="ep-edit">
								<h2 class="card-title">{t.platformWebhooks.editEndpoint}</h2>
								<EndpointForm action="?/update" prefix="ep-{ep.id}" id={ep.id} values={echoed(ep.id) ?? ep} error={formError(ep.id)} submitLabel={t.common.save} onDone={() => (editId = null)} />
							</div>
						{/if}
					</div>
				{/each}
			</div>
		{/if}
	</section>

	<section class="section">
		<div class="section-head">
			<h2>{t.platformWebhooks.deliveriesTitle}</h2>
		</div>
		{#if data.endpoints.length > 1}
			<nav class="filters" aria-label={t.platformWebhooks.deliveriesTitle}>
				<a href="?" class="filter" class:active={!data.endpointFilter}>{t.platformWebhooks.filterAll}</a>
				{#each data.endpoints as ep (ep.id)}
					<a href="?endpoint={ep.id}" class="filter" class:active={data.endpointFilter === ep.id}>{ep.description || host(ep.url)}</a>
				{/each}
			</nav>
		{/if}
		{#if data.deliveries.length === 0}
			<p class="muted">{t.platformWebhooks.deliveriesEmpty}</p>
		{:else}
			<div class="deliveries">
				<div class="dl-row dl-head" aria-hidden="true">
					<span>{t.platformWebhooks.colEvent}</span>
					<span>{t.platformWebhooks.colEndpoint}</span>
					<span>{t.platformWebhooks.colStatus}</span>
					<span class="num">{t.platformWebhooks.colAttempts}</span>
					<span>{t.platformWebhooks.colWhen}</span>
				</div>
				{#each data.deliveries as d (d.id)}
					<details class="dl">
						<summary class="dl-row">
							<span class="dl-event">{eventLabel(d.event)} <code>{d.event}</code></span>
							<span class="dl-host">{host(d.url)}</span>
							<span class="status" class:ok={d.status === 'delivered'} class:bad={d.status === 'failed'}>
								{statusLabel(d.status)}{#if d.response_code}{' · '}{d.response_code}{/if}
							</span>
							<span class="num">{d.attempts}</span>
							<span class="muted" title={formatDateTime(d.created_at, getLocale())}>{timeAgo(d.created_at, getLocale())}</span>
						</summary>
						<div class="dl-detail">
							<p class="dl-meta"><code>{d.id}</code>{#if d.status === 'pending' && d.next_attempt_at}{' · '}{t.platformWebhooks.nextAttempt}: {formatDateTime(d.next_attempt_at, getLocale())}{/if}</p>
							{#if sendResult && sendResult.id === d.id}
								<p class="send-result" class:ok={sendResult.ok} role="status">
									{sendResult.ok ? t.platformWebhooks.sentOk(sendResult.statusCode) : t.platformWebhooks.sentFailed(sendResult.error ?? String(sendResult.statusCode ?? ''))}
								</p>
							{/if}
							{#if d.attempts_log.length}
								<p class="label">{t.platformWebhooks.attemptsTitle}</p>
								<ol class="attempts">
									{#each d.attempts_log as a (a.attempt + a.attempted_at)}
										<li>
											<span class="a-head">
												<strong>#{a.attempt}</strong>
												<span>{t.platformWebhooks.triggers[a.trigger as keyof typeof t.platformWebhooks.triggers] ?? a.trigger}</span>
												<span class="status" class:ok={!!a.status_code && a.status_code < 300 && !a.error} class:bad={!!a.error}>{a.status_code ?? '—'}</span>
												<span class="muted">{t.platformWebhooks.duration}: {a.duration_ms ?? '—'} ms</span>
												<span class="muted">{formatDateTime(a.attempted_at, getLocale())}</span>
											</span>
											{#if a.error}<span class="a-error">{a.error}</span>{/if}
											{#if a.response_body}<span class="a-body"><span class="muted">{t.platformWebhooks.response}:</span> {a.response_body}</span>{/if}
										</li>
									{/each}
								</ol>
							{/if}
							<p class="label">{t.platformWebhooks.payload}</p>
							<pre class="payload">{pretty(d.payload)}</pre>
							<form method="POST" action="?/redeliver" use:enhance={keep}>
								<input type="hidden" name="delivery_id" value={d.id} />
								<button type="submit" class="btn-outline btn-sm">{t.platformWebhooks.redeliver}</button>
							</form>
						</div>
					</details>
				{/each}
			</div>
		{/if}
	</section>

	<section class="section docs">
		<div class="section-head">
			<h2>{t.platformWebhooks.docsTitle}</h2>
			<p>{t.platformWebhooks.docsLead}</p>
		</div>
		<ul class="doc-points">
			<li>{t.platformWebhooks.docsHeaders}</li>
			<li>{t.platformWebhooks.docsIdempotency}</li>
			<li>{t.platformWebhooks.docsRetry(data.limits.maxAttempts, data.limits.autoDisableAfter)}</li>
		</ul>

		<h3 class="sub">{t.platformWebhooks.docsSample}</h3>
		<pre class="code">{SAMPLE}</pre>

		<h3 class="sub">{t.platformWebhooks.docsEventsTitle}</h3>
		{#each groups as [group, events] (group)}
			<p class="label">{t.platformWebhooks.groups[group]}</p>
			<dl class="event-docs">
				{#each events as ev (ev)}
					<div class="ed">
						<dt><code>{ev}</code></dt>
						<dd>
							<span>{t.platformWebhooks.eventDocs[ev as PlatformPayloadEvent]}</span>
							<span class="fields">{#each PLATFORM_EVENT_FIELDS[ev as PlatformPayloadEvent] as f (f)}<code>{f}</code>{/each}</span>
						</dd>
					</div>
				{/each}
			</dl>
		{/each}
		<dl class="event-docs">
			<div class="ed">
				<dt><code>platform.test</code></dt>
				<dd>
					<span>{t.platformWebhooks.eventDocs['platform.test']}</span>
					<span class="fields">{#each PLATFORM_EVENT_FIELDS['platform.test'] as f (f)}<code>{f}</code>{/each}</span>
				</dd>
			</div>
		</dl>
	</section>
</div>

<style>
	.page { padding-block: 24px; }
	h1 { font-size: var(--display-size); font-weight: 550; letter-spacing: -.055em; line-height: 1.08; margin: 0; }
	.head-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
	.head-row .btn-action { flex-shrink: 0; margin-top: 4px; }
	.lead { max-width: 68ch; }
	.muted { color: var(--text-muted); }
	.empty { margin: 4px 0 0; }
	.num { text-align: right; font-variant-numeric: tabular-nums; }
	code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; }
	.label { margin: 14px 0 6px; font-size: 10px; font-weight: 650; text-transform: uppercase; letter-spacing: .13em; color: var(--text-muted); }

	.alert-success {
		padding: 10px 14px; border-radius: var(--radius-sm); font-size: 13px; font-weight: 500; margin-bottom: 16px;
		color: var(--success); background: var(--success-dim); border: 1px solid color-mix(in srgb, var(--success) 25%, transparent);
	}
	.secret-box { border: 1px solid var(--accent); background: var(--accent-dim); border-radius: var(--radius-sm); padding: 14px 16px; margin-bottom: 18px; }
	.secret-title { margin: 0 0 8px; font-size: 12px; font-weight: 650; color: var(--accent-ink); }
	.secret-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
	.secret-value { font-size: 12.5px; padding: 6px 9px; background: var(--bg-panel); border-radius: var(--radius-sm); overflow-wrap: anywhere; user-select: all; flex: 1; min-width: 0; }
	.secret-note { margin: 8px 0 0; font-size: 12px; color: var(--text-muted); }

	.create-card { margin-bottom: 20px; }
	.card-title { font-size: 14px; font-weight: 650; letter-spacing: -.03em; margin: 0 0 14px; color: var(--text-base); }

	.ep { flex-direction: column; align-items: stretch; }
	.ep.off .ep-info { opacity: .7; }
	.ep-main { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
	.ep-info { flex: 1; min-width: 0; }
	.ep-title { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
	.ep-name { font-size: 14px; font-weight: 600; color: var(--text-base); }
	.ep-url { display: block; font-size: 11.5px; color: var(--text-subtle); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-top: 2px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
	.ep-meta { display: flex; flex-wrap: wrap; gap: 4px 14px; margin: 8px 0 0; font-size: 11.5px; color: var(--text-muted); }
	.ep-warn { margin: 8px 0 0; font-size: 12px; color: var(--warning); background: var(--warning-dim); padding: 7px 10px; border-radius: var(--radius-sm); }
	.ep-warn.soft { background: none; padding: 0; }
	.ep-actions { display: flex; flex-wrap: wrap; gap: 6px; justify-content: flex-end; max-width: 330px; }
	.ep-actions form { display: contents; }
	.ep-edit { padding: 14px 0 4px; border-top: 1px solid var(--border-subtle); margin-top: 12px; }
	.send-result { font-size: 12px; margin: 8px 0 0; color: var(--danger); }
	.send-result.ok { color: var(--success); }

	.pill { font-size: 10px; font-weight: 650; text-transform: uppercase; letter-spacing: .08em; border-radius: var(--radius-sm); padding: 1px 8px; background: var(--bg-panel2); color: var(--text-subtle); }
	.pill.ok { background: var(--success-dim); color: var(--success); }
	.pill.warn { background: var(--warning-dim); color: var(--warning); }
	.tags { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 8px; }
	.tag { font-size: 10px; font-weight: 500; padding: 2px 8px; border-radius: var(--radius-sm); background: var(--accent-dim); color: var(--accent-ink); white-space: nowrap; }
	.tag-all { background: var(--bg-panel2); color: var(--text-muted); }

	.filters { display: flex; flex-wrap: wrap; gap: 6px; margin: 0 0 14px; }
	.filter { font-size: 12px; font-weight: 600; padding: 5px 11px; border: 1px solid var(--border); border-radius: var(--radius-sm); color: var(--text-muted); text-decoration: none; }
	.filter.active { border-color: var(--accent); background: var(--accent-dim); color: var(--accent-ink); }

	.deliveries { border-top: 1px solid var(--border); }
	.dl-row { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 1.3fr) minmax(0, 1fr) 70px minmax(0, .9fr); gap: 12px; align-items: center; padding: 10px 0; font-size: 12.5px; }
	.dl-head { font-size: 10px; font-weight: 650; color: var(--text-muted); text-transform: uppercase; letter-spacing: .13em; border-bottom: 1px solid var(--border); }
	.dl { border-bottom: 1px solid var(--border-subtle); }
	.dl summary { cursor: pointer; list-style: none; }
	.dl summary::-webkit-details-marker { display: none; }
	.dl-event code, .dl-host { color: var(--text-subtle); }
	.dl-event, .dl-host { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.status { font-weight: 600; color: var(--warning); }
	.status.ok { color: var(--success); }
	.status.bad { color: var(--danger); }
	.dl-detail { padding: 2px 0 16px; }
	.dl-meta { margin: 0; font-size: 11.5px; color: var(--text-muted); overflow-wrap: anywhere; }
	.attempts { margin: 0 0 4px; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 8px; }
	.attempts li { font-size: 12px; display: flex; flex-direction: column; gap: 3px; }
	.a-head { display: flex; flex-wrap: wrap; gap: 4px 12px; align-items: baseline; }
	.a-error { color: var(--danger); overflow-wrap: anywhere; }
	.a-body { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; color: var(--text-base); overflow-wrap: anywhere; }
	.payload, .code {
		margin: 0 0 12px; padding: 12px 14px; background: var(--bg-panel2); border: 1px solid var(--border-subtle); border-radius: var(--radius-sm);
		font-size: 11.5px; line-height: 1.55; overflow-x: auto; max-width: 100%; box-sizing: border-box;
	}

	.doc-points { margin: 0 0 8px; padding-left: 18px; display: flex; flex-direction: column; gap: 6px; font-size: 13px; color: var(--text-base); max-width: 80ch; line-height: 1.55; }
	.sub { font-size: 14px; font-weight: 650; letter-spacing: -.03em; margin: 22px 0 8px; }
	.event-docs { margin: 0; }
	.ed { display: grid; grid-template-columns: 220px minmax(0, 1fr); gap: 4px 16px; padding: 9px 0; border-bottom: 1px solid var(--border-subtle); font-size: 12.5px; }
	.ed dt code { font-size: 12px; font-weight: 600; color: var(--text-base); }
	.ed dd { margin: 0; display: flex; flex-direction: column; gap: 6px; color: var(--text-muted); line-height: 1.5; }
	.fields { display: flex; flex-wrap: wrap; gap: 4px; }
	.fields code { padding: 1px 6px; border-radius: var(--radius-sm); background: var(--bg-panel2); color: var(--text-base); }

	@media (max-width: 760px) {
		.head-row { flex-direction: column; }
		.ep-main { flex-direction: column; }
		.ep-actions { justify-content: flex-start; max-width: none; }
		.dl-row { grid-template-columns: minmax(0, 1fr) auto; }
		.dl-head { display: none; }
		.dl-row > :nth-child(2), .dl-row > :nth-child(4) { display: none; }
		.ed { grid-template-columns: 1fr; }
	}
</style>
