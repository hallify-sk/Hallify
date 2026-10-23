/**
 * Seating guests at tables, group by group.
 *
 * Groups stay whole wherever the tables allow it, in this order of effort:
 *
 *   1. A group that asked for a table by label (the head table) gets the chairs
 *      free there; any overflow is seated with everyone else.
 *   2. Every group whole — searched properly, not just best-fit. Greedy packing
 *      misses arrangements that exist: two 7-seat tables and groups of 3, 3, 2, 2,
 *      2, 2 fit whole as 3+2+2 twice, but largest-first best-fit seats both 3s
 *      together and then has to split a 2.
 *   3. If that is impossible, families whole and only the other groups split.
 *      A child sat at a stranger's table is the failure this exists to avoid.
 *   4. Otherwise the editor's own auto-seat rule: smallest table that fits the
 *      whole group, else spread across the emptiest tables.
 *
 * With `spread`, a group goes to the ROOMIEST table that takes it whole instead of
 * the tightest: the guests are spread over the tables the venue set up rather than
 * packed 8/8/7 with a fourth table left empty.
 *
 * Reserved tables (the head table) are never filled automatically: only a group
 * that asks for one by label sits there. Seating cousins at the bride's table
 * because it happened to be the tightest fit is the other failure to avoid.
 *
 * Pure: chairs in, chairs out, so it is tested directly and runs on the server.
 */

/** Labels that name a head table in the languages we serve. Reserved even when
 *  nobody says so, because filling one by accident is never what was meant. */
export const HEAD_TABLE = /hlavn|čestn|cestn|novoman|head|bridal|top table|honou?r/i;

export interface SeatingTable {
	floorId: string;
	id: string;
	label: string;
	/** One entry per chair: a guest id or null. */
	assignments: (string | null)[];
}

export interface SeatingGroup {
	name: string;
	preferredTable: string | null;
	/** A family or couple: never split if any arrangement avoids it. */
	keepTogether?: boolean;
	guestIds: string[];
}

export interface SeatingResult {
	tables: SeatingTable[];
	unseated: string[];
	/** Names of groups that ended up across more than one table. */
	split: string[];
}

interface Pending {
	name: string;
	keepTogether: boolean;
	ids: string[];
}

const free = (t: SeatingTable) => t.assignments.filter((a) => a === null).length;

function fill(t: SeatingTable, ids: string[]): string[] {
	const rest = [...ids];
	for (let i = 0; i < t.assignments.length && rest.length; i++) {
		if (t.assignments[i] === null) t.assignments[i] = rest.shift()!;
	}
	return rest;
}

/** Search budget. Event-sized inputs finish far inside it; a pathological one
 *  falls back to the greedy rule instead of hanging a request. */
const SEARCH_LIMIT = 50_000;

/**
 * A table for every group with no group split, or null. Depth-first, largest group
 * first, trying the tightest table first; tables with the same free count are
 * interchangeable, so only one of them is tried at each step.
 */
function packWhole(freeChairs: number[], sizes: number[], spread = false): number[] | null {
	const order = sizes.map((s, i) => [s, i] as const).sort((a, b) => b[0] - a[0]);
	const room = [...freeChairs];
	const out: number[] = new Array(sizes.length);
	let nodes = 0;

	const place = (k: number): boolean => {
		if (k === order.length) return true;
		if (++nodes > SEARCH_LIMIT) return false;
		const [size, gi] = order[k];
		const tried = new Set<number>();
		const candidates = room.map((r, t) => [r, t] as const).filter(([r]) => r >= size).sort((a, b) => (spread ? b[0] - a[0] : a[0] - b[0]));
		for (const [r, t] of candidates) {
			if (tried.has(r)) continue;
			tried.add(r);
			room[t] -= size;
			out[gi] = t;
			if (place(k + 1)) return true;
			room[t] += size;
		}
		return false;
	};
	return place(0) ? out : null;
}

/** The editor's auto-seat rule, for whatever is left. */
function greedy(tables: SeatingTable[], groups: Pending[], unseated: string[], spread = false) {
	for (const g of [...groups].sort((a, b) => b.ids.length - a.ids.length)) {
		let best: SeatingTable | null = null;
		for (const t of tables) {
			const f = free(t);
			if (f >= g.ids.length && (!best || (spread ? f > free(best) : f < free(best)))) best = t;
		}
		if (best) {
			fill(best, g.ids);
			continue;
		}
		let rest = g.ids;
		while (rest.length) {
			const roomiest = tables.reduce<SeatingTable | null>((m, t) => (free(t) > (m ? free(m) : 0) ? t : m), null);
			if (!roomiest) break;
			rest = fill(roomiest, rest);
		}
		unseated.push(...rest);
	}
}

export function seatGroups(
	input: SeatingTable[],
	groups: SeatingGroup[],
	opts: { keepExisting: boolean; reserved?: string[]; spread?: boolean }
): SeatingResult {
	const tables = input.map((t) => ({
		...t,
		assignments: opts.keepExisting ? [...t.assignments] : t.assignments.map(() => null)
	}));
	const seated = new Set(tables.flatMap((t) => t.assignments.filter((a): a is string => a !== null)));
	const unseated: string[] = [];
	const byLabel = new Map(tables.map((t) => [t.label.trim().toLowerCase(), t]));

	// Anyone already sitting stays where they are; a guest listed twice sits once.
	const all = groups
		.map((g) => ({ ...g, guestIds: [...new Set(g.guestIds)].filter((id) => !seated.has(id)) }))
		.filter((g) => g.guestIds.length > 0);
	for (const g of all) g.guestIds.forEach((id) => seated.add(id));

	const reservedLabels = new Set((opts.reserved ?? []).map((l) => l.trim().toLowerCase()));
	const open = tables.filter((t) => !reservedLabels.has(t.label.trim().toLowerCase()) && !HEAD_TABLE.test(t.label));

	// 1. Requested tables.
	const rest: Pending[] = [];
	for (const g of all) {
		const wanted = g.preferredTable ? byLabel.get(g.preferredTable.trim().toLowerCase()) : undefined;
		const ids = wanted ? fill(wanted, g.guestIds) : g.guestIds;
		if (ids.length) rest.push({ name: g.name, keepTogether: !!g.keepTogether, ids });
	}

	const placeWhole = (subset: Pending[]): boolean => {
		const plan = packWhole(open.map(free), subset.map((g) => g.ids.length), opts.spread);
		if (!plan) return false;
		subset.forEach((g, i) => fill(open[plan[i]], g.ids));
		return true;
	};

	// 2. Everyone whole. 3. Families whole, the others wherever they fit. 4. Greedy.
	if (!placeWhole(rest)) {
		const families = rest.filter((g) => g.keepTogether);
		const others = rest.filter((g) => !g.keepTogether);
		if (families.length && placeWhole(families)) greedy(open, others, unseated, opts.spread);
		else greedy(open, rest, unseated, opts.spread);
	}

	const tablesOf = new Map<string, Set<string>>();
	for (const t of tables) for (const id of t.assignments) if (id) tablesOf.set(id, (tablesOf.get(id) ?? new Set()).add(t.id));
	const split = all
		.filter((g) => new Set(g.guestIds.flatMap((id) => [...(tablesOf.get(id) ?? [])])).size > 1)
		.map((g) => g.name);

	return { tables, unseated, split };
}
