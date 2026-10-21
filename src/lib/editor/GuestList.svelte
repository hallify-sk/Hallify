<script lang="ts">
	import { t as tr } from '$lib/i18n.svelte';

	/** A guest as the list shows it: the record plus where they sit. */
	export interface GuestRow {
		id: string;
		firstName: string;
		lastName: string;
		group?: string;
		note?: string;
		/** "T3 · seat 2", "Chair 1", or null when unseated. */
		seatRef: string | null;
	}

	interface Props {
		guests: GuestRow[];
		existingGroups: string[];
		/** The guest being dragged onto the canvas, if any — its row is highlighted. */
		draggingId?: string | null;
		importMessage?: string | null;
		onAdd: (first: string, last: string, group: string) => void;
		onRemove: (id: string) => void;
		onNote: (id: string, note: string) => void;
		onImport: (text: string) => void;
		onDragStart: (e: PointerEvent, id: string) => void;
		onAutoSeat: () => void;
		onClearAll: () => void;
	}
	const { guests, existingGroups, draggingId = null, importMessage = null, onAdd, onRemove, onNote, onImport, onDragStart, onAutoSeat, onClearAll }: Props = $props();

	let search = $state('');
	let filter = $state<'unseated' | 'all' | 'notes'>('unseated');
	let groupFilter = $state('');
	let addOpen = $state(false);
	let newFirst = $state('');
	let newLast = $state('');
	let newGroup = $state('');
	let groupDropOpen = $state(false);
	let noteEditId = $state<string | null>(null);
	let fileInput: HTMLInputElement | undefined = $state();

	const seated = $derived(guests.filter((g) => g.seatRef).length);
	const unseatedCount = $derived(guests.length - seated);
	const notesCount = $derived(guests.filter((g) => g.note).length);

	const groupSuggestions = $derived.by(() => {
		const q = newGroup.trim().toLowerCase();
		return existingGroups.filter((g) => (q ? g.toLowerCase().includes(q) && g.toLowerCase() !== q : true)).slice(0, 6);
	});

	const visible = $derived.by(() => {
		const q = search.trim().toLowerCase();
		return guests
			.filter((g) => (filter === 'unseated' ? !g.seatRef : filter === 'notes' ? !!g.note : true))
			.filter((g) => !groupFilter || (g.group ?? '') === groupFilter)
			.filter((g) => !q || `${g.firstName} ${g.lastName} ${g.group ?? ''} ${g.note ?? ''}`.toLowerCase().includes(q))
			.sort((a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName));
	});

	function submitAdd() {
		const first = newFirst.trim(), last = newLast.trim();
		if (!first && !last) return;
		onAdd(first, last, newGroup.trim());
		newFirst = ''; newLast = '';
	}

	async function onFile(e: Event) {
		const input = e.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		const text = await file.text();
		onImport(text);
		input.value = '';
	}

	function rowPointerDown(e: PointerEvent, id: string) {
		// Buttons and fields inside the row keep their own behaviour.
		if ((e.target as HTMLElement).closest('button, input, textarea')) return;
		onDragStart(e, id);
	}
</script>

<div class="guests">
	<div class="head">
		<div class="row between">
			<span class="title">{tr.editor.guests}</span>
			<span class="count">{tr.editor.seatedOf(seated, guests.length)}</span>
		</div>
		<div class="bar" aria-hidden="true"><div style="width:{guests.length ? Math.round((seated / guests.length) * 100) : 0}%"></div></div>
		<label class="search">
			<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>
			<input type="search" bind:value={search} placeholder={tr.editor.searchGuests} aria-label={tr.editor.searchGuests} />
		</label>
		<div class="chips">
			<button type="button" class="chip" class:on={filter === 'unseated'} onclick={() => filter = 'unseated'}>{tr.editor.unseated} · {unseatedCount}</button>
			<button type="button" class="chip" class:on={filter === 'all'} onclick={() => filter = 'all'}>{tr.editor.allGuests} · {guests.length}</button>
			{#if notesCount > 0}
				<button type="button" class="chip" class:on={filter === 'notes'} onclick={() => filter = 'notes'}>{tr.editor.withNotes} · {notesCount}</button>
			{/if}
			{#if existingGroups.length > 0}
				<select class="chip sel" bind:value={groupFilter} aria-label={tr.editor.byGroup}>
					<option value="">{tr.editor.byGroup}</option>
					{#each existingGroups as g}<option value={g}>{g}</option>{/each}
				</select>
			{/if}
		</div>
		<div class="actions">
			<button type="button" class="btn" class:on={addOpen} onclick={() => addOpen = !addOpen} aria-expanded={addOpen}>{tr.editor.addGuest}</button>
			<button type="button" class="btn" onclick={() => fileInput?.click()}>{tr.editor.importCsv}</button>
			<input type="file" accept=".csv,.txt,text/csv,text/plain" bind:this={fileInput} onchange={onFile} class="hidden-file" aria-label={tr.editor.importCsv} />
		</div>
		{#if importMessage}<p class="msg">{importMessage}</p>{/if}
		{#if addOpen}
			<div class="add">
				<div class="two">
					<input type="text" bind:value={newFirst} placeholder={tr.editor.firstNamePlaceholder} aria-label={tr.users.firstName}
						onkeydown={(e) => e.key === 'Enter' && submitAdd()} />
					<input type="text" bind:value={newLast} placeholder={tr.editor.lastNamePlaceholder} aria-label={tr.users.lastName}
						onkeydown={(e) => e.key === 'Enter' && submitAdd()} />
				</div>
				<div class="combo">
					<input type="text" bind:value={newGroup} placeholder={tr.editor.groupFamily} aria-label={tr.editor.groupFamily} autocomplete="off"
						onfocus={() => groupDropOpen = true} oninput={() => groupDropOpen = true}
						onblur={() => setTimeout(() => groupDropOpen = false, 120)}
						onkeydown={(e) => { if (e.key === 'Enter') { groupDropOpen = false; submitAdd(); } else if (e.key === 'Escape') groupDropOpen = false; }} />
					{#if groupDropOpen && groupSuggestions.length > 0}
						<div class="suggest">
							{#each groupSuggestions as grp}
								<button type="button" onmousedown={(e) => { e.preventDefault(); newGroup = grp; groupDropOpen = false; }}>{grp}</button>
							{/each}
						</div>
					{/if}
				</div>
				<p class="hint">{tr.editor.importHint}</p>
				<button type="button" class="btn primary" onclick={submitAdd}>{tr.editor.addGuest}</button>
			</div>
		{/if}
	</div>

	<div class="list">
		{#each visible as g (g.id)}
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div class="grow" class:dragging={draggingId === g.id} class:seated={!!g.seatRef} onpointerdown={(e) => rowPointerDown(e, g.id)}>
				<span class="grip" aria-hidden="true">⋮⋮</span>
				<span class="nm">
					<b>{g.lastName}{g.lastName && g.firstName ? ', ' : ''}{g.firstName}</b>
					<span>{[g.group, g.note].filter(Boolean).join(' · ')}</span>
				</span>
				<span class="seat" class:no={!g.seatRef}>{g.seatRef ?? tr.editor.unseated}</span>
				<button type="button" class="ib" class:on={noteEditId === g.id || !!g.note} onclick={() => noteEditId = noteEditId === g.id ? null : g.id}
					title={g.note ? tr.editor.editNote : tr.editor.addNote} aria-label={tr.editor.note}>
					<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z"/></svg>
				</button>
				<button type="button" class="ib" onclick={() => onRemove(g.id)} title={tr.editor.removeGuest} aria-label={tr.editor.removeGuest}>✕</button>
			</div>
			{#if noteEditId === g.id}
				<div class="note-edit">
					<textarea rows="2" placeholder={tr.editor.notePlaceholder} value={g.note ?? ''}
						oninput={(e) => onNote(g.id, e.currentTarget.value)}
						onkeydown={(e) => { if (e.key === 'Escape') noteEditId = null; }}></textarea>
				</div>
			{/if}
		{:else}
			<p class="empty">{guests.length ? tr.editor.noGuestsMatch : tr.editor.guestsEmpty}</p>
		{/each}
	</div>

	<div class="foot">
		<button type="button" class="btn" onclick={onAutoSeat} title={tr.editor.autoSeatTitle} disabled={unseatedCount === 0}>✦ {tr.editor.autoSeatRest}</button>
		<button type="button" class="btn danger" onclick={onClearAll} title={tr.editor.clearAllTitle} disabled={seated === 0}>{tr.editor.clear}</button>
	</div>
</div>

<style>
	.guests { width: 300px; flex-shrink: 0; display: flex; flex-direction: column; background: var(--bg-panel); border-right: 1px solid var(--border); box-sizing: border-box; min-height: 0; }
	.head { padding: 12px 12px 10px; border-bottom: 1px solid var(--border-subtle); display: flex; flex-direction: column; gap: 8px; flex-shrink: 0; }
	.row { display: flex; align-items: center; gap: 8px; }
	.between { justify-content: space-between; }
	.title { font-size: 11px; font-weight: 650; letter-spacing: .06em; text-transform: uppercase; color: var(--text-muted); }
	.count { font-size: 12px; color: var(--text-muted); }
	.bar { height: 5px; border-radius: 3px; background: var(--bg-panel2); overflow: hidden; }
	.bar > div { height: 100%; background: var(--success); transition: width .2s; }
	.search { display: flex; align-items: center; gap: 8px; height: 32px; border: 1px solid var(--border); border-radius: var(--radius); padding: 0 10px; color: var(--text-subtle); background: var(--bg-panel); }
	.search input { border: 0; outline: 0; background: transparent; flex: 1; min-width: 0; font: inherit; color: var(--text-base); }
	.chips { display: flex; flex-wrap: wrap; gap: 6px; }
	.chip {
		display: inline-flex; align-items: center; height: 24px; padding: 0 9px; border-radius: 12px; border: 1px solid transparent;
		background: var(--bg-panel2); color: var(--text-base); font-size: 12px; cursor: pointer; font-family: inherit;
	}
	.chip.on { background: var(--accent-dim); color: var(--accent-ink); border-color: color-mix(in srgb, var(--accent) 45%, transparent); font-weight: 600; }
	.chip.sel { appearance: none; padding-right: 9px; max-width: 120px; }
	.actions { display: flex; gap: 6px; }
	.btn {
		flex: 1; height: 30px; padding: 0 10px; border-radius: var(--radius); border: 1px solid var(--border); background: var(--bg-panel);
		color: var(--text-base); font-size: 12.5px; font-weight: 500; cursor: pointer; font-family: inherit; white-space: nowrap;
	}
	.btn:hover:not(:disabled) { border-color: var(--accent); }
	.btn:disabled { opacity: .45; cursor: default; }
	.btn.on { background: var(--accent-dim); border-color: var(--accent); color: var(--accent-ink); }
	.btn.primary { background: var(--accent); border-color: var(--accent); color: var(--accent-contrast); font-weight: 600; }
	.btn.danger { color: var(--danger); flex: 0 0 auto; }
	.hidden-file { position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none; }
	.msg { margin: 0; font-size: 12px; color: var(--success); font-weight: 600; }
	.add { display: flex; flex-direction: column; gap: 6px; padding-top: 2px; }
	.two { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
	.add input { height: 30px; border: 1px solid var(--border); border-radius: var(--radius); padding: 0 9px; font: inherit; font-size: 12.5px; background: var(--bg-panel); color: var(--text-base); width: 100%; box-sizing: border-box; }
	.add input:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-dim); }
	.combo { position: relative; }
	.suggest { position: absolute; left: 0; right: 0; top: calc(100% + 2px); z-index: 20; background: var(--bg-panel); border: 1px solid var(--border); border-radius: var(--radius); box-shadow: var(--shadow); padding: 4px; display: flex; flex-direction: column; }
	.suggest button { text-align: left; padding: 6px 8px; border-radius: var(--radius-sm); background: none; border: 0; font: inherit; font-size: 12px; color: var(--text-base); cursor: pointer; }
	.suggest button:hover { background: var(--bg-panel2); }
	.hint { margin: 0; font-size: 11px; color: var(--text-muted); line-height: 1.4; }
	.list { flex: 1; overflow-y: auto; min-height: 0; }
	.grow {
		display: flex; align-items: center; gap: 8px; padding: 7px 10px 7px 8px; border-bottom: 1px solid var(--border-subtle);
		cursor: grab; user-select: none;
	}
	.grow:active { cursor: grabbing; }
	.grow.dragging { background: var(--accent-dim); }
	.grip { width: 10px; color: var(--text-subtle); font-size: 13px; line-height: 1; flex-shrink: 0; }
	.nm { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
	.nm b { font-size: 12.5px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--text-base); }
	.nm > span { font-size: 11px; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.seat { font-size: 11px; font-weight: 600; color: var(--success); background: var(--success-dim); padding: 2px 7px; border-radius: 10px; white-space: nowrap; }
	.seat.no { color: var(--warning); background: var(--warning-dim); }
	.ib { font-size: 11px; color: var(--text-muted); padding: 3px 5px; border-radius: var(--radius-sm); border: 0; background: none; cursor: pointer; font-family: inherit; flex-shrink: 0; }
	.ib:hover { background: var(--danger-dim); color: var(--danger); }
	.ib.on { color: var(--accent-ink); }
	.ib.on:hover { background: var(--accent-dim); color: var(--accent-ink); }
	.note-edit { padding: 0 10px 8px 26px; border-bottom: 1px solid var(--border-subtle); }
	.note-edit textarea { width: 100%; box-sizing: border-box; border: 1px solid var(--border); border-radius: var(--radius); padding: 6px 8px; font: inherit; font-size: 12px; background: var(--bg-panel); color: var(--text-base); resize: vertical; }
	.note-edit textarea:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-dim); }
	.empty { padding: 16px 12px; font-size: 12.5px; color: var(--text-muted); line-height: 1.45; margin: 0; }
	.foot { display: flex; gap: 6px; padding: 10px 12px; border-top: 1px solid var(--border-subtle); flex-shrink: 0; }
</style>
