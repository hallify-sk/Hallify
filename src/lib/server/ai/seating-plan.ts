import { seatGroups, type SeatingGroup, type SeatingResult, type SeatingTable } from '$lib/seating';

/**
 * The assistant's seating plan, on top of the shared seating search.
 *
 * People come in two sizes of "together": a group (a family, a couple) that must
 * sit at one table, and a circle the user listed (all the colleagues, all the
 * friends) that should sit together where the tables allow. The model tends to hand
 * a circle over as several couples, and a plan that keeps every couple whole can
 * still scatter the colleagues over three tables while claiming nothing was split.
 *
 * So two plans are made, both spreading the guests over the free tables rather than
 * packing them 8/8/7/0:
 *   1. each circle as one unit, and
 *   2. each group on its own,
 * and the better one is kept — fewest people without a seat, then fewest families
 * split, then fewest groups split, then fewest circles scattered. Splits are
 * reported for groups and circles alike, so the reply cannot say "nothing was split"
 * when colleagues ended up apart.
 */
export interface CircleGroup extends SeatingGroup {
	/** The wider circle the user listed this group under, or null. */
	circle: string | null;
}

export function planSeating(
	tables: SeatingTable[],
	groups: CircleGroup[],
	opts: { keepExisting: boolean; reserved?: string[] }
): SeatingResult {
	const key = (c: string | null) => c?.trim().toLowerCase() || null;
	const circles = new Map<string, { name: string; ids: string[] }>();
	for (const g of groups) {
		const k = key(g.circle);
		if (!k) continue;
		const c = circles.get(k) ?? { name: g.circle!.trim(), ids: [] };
		c.ids.push(...g.guestIds);
		circles.set(k, c);
	}

	// 1. Circles as units. A group that asked for a specific table keeps its own way there.
	const merged: SeatingGroup[] = [];
	const units = new Map<string, SeatingGroup>();
	for (const g of groups) {
		const k = key(g.circle);
		if (!k || g.preferredTable) {
			merged.push(g);
			continue;
		}
		const unit = units.get(k);
		if (unit) {
			unit.guestIds.push(...g.guestIds);
			unit.keepTogether = unit.keepTogether && !!g.keepTogether;
		} else {
			const u: SeatingGroup = { name: circles.get(k)!.name, preferredTable: null, keepTogether: !!g.keepTogether, guestIds: [...g.guestIds] };
			units.set(k, u);
			merged.push(u);
		}
	}

	const options = { ...opts, spread: true };
	const plans = [seatGroups(tables, groups, options)];
	if (merged.length < groups.length) plans.unshift(seatGroups(tables, merged, options));

	const judged = plans.map((plan) => {
		const tableOf = new Map<string, string>();
		for (const t of plan.tables) for (const id of t.assignments) if (id) tableOf.set(id, t.id);
		const apart = (ids: string[]) => new Set(ids.map((id) => tableOf.get(id)).filter(Boolean)).size;
		const families = groups.filter((g) => g.keepTogether && apart(g.guestIds) > 1).map((g) => g.name);
		const others = groups.filter((g) => !g.keepTogether && apart(g.guestIds) > 1).map((g) => g.name);
		let scattered = 0;
		const circleNames: string[] = [];
		for (const c of circles.values()) {
			const n = apart(c.ids);
			if (n > 1) {
				scattered += n - 1;
				circleNames.push(c.name);
			}
		}
		return {
			plan,
			score: [plan.unseated.length, families.length, others.length, scattered],
			split: [...new Set([...families, ...others, ...circleNames])]
		};
	});
	judged.sort((a, b) => {
		for (let i = 0; i < a.score.length; i++) if (a.score[i] !== b.score[i]) return a.score[i] - b.score[i];
		return 0;
	});
	const best = judged[0];
	return { tables: best.plan.tables, unseated: best.plan.unseated, split: best.split };
}
