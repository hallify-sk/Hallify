<script lang="ts">
	import { t } from '$lib/i18n.svelte';
</script>

<svelte:head><title>{t.nav.signOut} – Hallify</title></svelte:head>

<div class="logout-shell">
	<section class="section section--lead logout-card">
		<div class="section-head">
			<h1>{t.auth.logoutTitle}</h1>
			<p class="subtitle">{t.auth.logoutBody}</p>
		</div>
		<form method="POST" class="logout-actions">
			<button type="submit" class="btn-action">{t.nav.signOut}</button>
			<a href="/app/" class="btn-outline">{t.common.cancel}</a>
		</form>
	</section>
</div>

<style>
	/* Same frame as /app/org/new: a short form centred on the page, no box. */
	.logout-shell {
		display: flex;
		justify-content: center;
		align-items: center;
		min-height: 60vh;
		padding: 2rem;
	}
	.logout-card {
		width: 100%;
		max-width: 420px;
		padding-block: 0;
	}
	h1 { font-size: 1.75rem; font-weight: 550; letter-spacing: -.055em; line-height: 1.08; margin: 0; }
	.logout-actions { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
</style>
