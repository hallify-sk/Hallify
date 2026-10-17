<script lang="ts">
	import type { LayoutData } from './$types';

	interface Props { data: LayoutData; children: import('svelte').Snippet; }
	const { data, children }: Props = $props();

	const initials = $derived(
		`${data.user.first_name[0] ?? ''}${data.user.last_name[0] ?? ''}`.toUpperCase()
	);
</script>

<div class="shell">
	<header class="topbar">
		<a href="/app/client" class="brand">
			<img src="/Hallify.svg" alt="Hallify" class="logo" />
			<span>Hallify</span>
		</a>
		<nav class="nav">
			<a href="/app/halls">Browse halls</a>
			<a href="/app/client/reservations">My reservations</a>
		</nav>
		<div class="user-menu">
			<a href="/app/profile" class="avatar" title="Profile">{initials}</a>
			<form action="/app/logout" method="POST">
				<button type="submit" class="logout-btn">Sign out</button>
			</form>
		</div>
	</header>

	<main class="content">
		{@render children()}
	</main>
</div>

<style>
	.shell { min-height: 100vh; background: var(--bg-base); display: flex; flex-direction: column; }

	.topbar {
		display: flex;
		align-items: center;
		gap: 24px;
		padding: 0 24px;
		height: 60px;
		background: var(--bg-panel);
		border-bottom: 1px solid var(--border);
		position: sticky;
		top: 0;
		z-index: 100;
	}

	/* The wordmark — the one place Poppins 900 italic is allowed. */
	.brand {
		display: flex;
		align-items: center;
		gap: 8px;
		font-family: 'Poppins', 'Segoe UI', system-ui, -apple-system, sans-serif;
		font-weight: 900;
		font-style: italic;
		font-size: 16px;
		letter-spacing: -0.05em;
		color: var(--text-base);
		text-decoration: none;
	}
	.brand:hover { text-decoration: none; }

	.logo { width: 24px; height: 24px; }

	.nav {
		display: flex;
		gap: 4px;
		flex: 1;
	}

	.nav a {
		padding: 7px 13px;
		border-radius: var(--radius-sm);
		font-size: 13px;
		font-weight: 500;
		color: var(--text-muted);
		text-decoration: none;
		transition: color .15s, background .15s;
	}

	.nav a:hover {
		color: var(--text-base);
		background: var(--bg-hover);
		text-decoration: none;
	}

	.user-menu { display: flex; align-items: center; gap: 8px; margin-left: auto; }

	.avatar {
		width: 32px;
		height: 32px;
		border-radius: 50%;
		background: var(--accent);
		color: var(--accent-contrast);
		font-size: 12px;
		font-weight: 650;
		display: flex;
		align-items: center;
		justify-content: center;
		text-decoration: none;
		flex-shrink: 0;
		transition: background .15s;
	}
	/* An avatar chip is chrome, not a call to action — colour change, no lift. */
	.avatar:hover { background: var(--accent-hover); text-decoration: none; }

	.logout-btn {
		padding: 6px 12px;
		border-radius: var(--radius-sm);
		border: 1px solid var(--border);
		background: transparent;
		font-size: 12px;
		font-weight: 500;
		color: var(--text-muted);
		cursor: pointer;
		font-family: inherit;
		transition: background .15s, color .15s;
	}
	.logout-btn:hover { background: var(--danger-dim); color: var(--danger); border-color: var(--danger); }

	.content { flex: 1; padding: 32px 24px; max-width: 960px; width: 100%; margin: 0 auto; }
</style>
