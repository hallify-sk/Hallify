import type { SubmitFunction } from '@sveltejs/kit';

/**
 * `use:enhance` that asks before submitting.
 *
 * `onsubmit={(e) => { if (!confirm(...)) e.preventDefault(); }}` does NOT stop an
 * enhanced form: SvelteKit's enhance ignores defaultPrevented, so "Cancel" still
 * submitted (closing an organisation went ahead after Cancel). Use this instead:
 *
 *   <form method="POST" action="?/closeOrg" use:enhance={confirmFirst(() => t.x.confirm)}>
 *
 * `after` is the usual enhance result callback, when the form needs one.
 */
export function confirmFirst(
	message: string | (() => string),
	after?: ReturnType<SubmitFunction>
): SubmitFunction {
	return ({ cancel }) => {
		const text = typeof message === 'function' ? message() : message;
		if (!confirm(text)) {
			cancel();
			return;
		}
		return after;
	};
}
