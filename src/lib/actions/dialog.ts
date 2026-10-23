// Make a custom role="dialog" element behave like a dialog: focus moves into it when it
// opens, Tab stays inside, Escape closes it, and focus returns to the opener afterwards.
//
//   {#if open}<div role="dialog" aria-modal="true" use:dialog={{ onclose: () => (open = false) }}>…</div>{/if}

export interface DialogOptions {
	onclose: () => void;
	/** CSS selector of the element to focus first (defaults to the first focusable one). */
	initialFocus?: string;
}

const FOCUSABLE = 'a[href],area[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"]),[contenteditable="true"]';

export function dialog(node: HTMLElement, options: DialogOptions) {
	let opts = options;
	const opener = (typeof document !== 'undefined' ? document.activeElement : null) as HTMLElement | null;
	const focusables = () =>
		Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.getClientRects().length > 0);

	queueMicrotask(() => {
		const first = (opts.initialFocus && node.querySelector<HTMLElement>(opts.initialFocus)) || focusables()[0];
		if (first) first.focus();
		else {
			if (!node.hasAttribute('tabindex')) node.setAttribute('tabindex', '-1');
			node.focus();
		}
	});

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			e.stopPropagation();
			opts.onclose();
			return;
		}
		if (e.key !== 'Tab') return;
		const list = focusables();
		if (!list.length) {
			e.preventDefault();
			return;
		}
		const i = list.indexOf(document.activeElement as HTMLElement);
		if (e.shiftKey && i <= 0) {
			e.preventDefault();
			list[list.length - 1].focus();
		} else if (!e.shiftKey && i === list.length - 1) {
			e.preventDefault();
			list[0].focus();
		}
	}

	node.addEventListener('keydown', onKeydown);
	return {
		update(next: DialogOptions) {
			opts = next;
		},
		destroy() {
			node.removeEventListener('keydown', onKeydown);
			if (opener && document.contains(opener)) opener.focus();
		}
	};
}
