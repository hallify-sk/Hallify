/**
 * Keeping measurement labels apart.
 *
 * With "Rozmery" on, every wall edge, zone, table and stretch of the room gets a
 * label, and on a busy plan they printed on top of each other into an unreadable
 * smear. Labels are offered in order of importance and each is kept only if it
 * does not cover one already kept (or a reserved area, such as the room's overall
 * size), so what is shown can always be read. Zooming in makes room for more.
 */

export interface LabelBox { x0: number; y0: number; x1: number; y1: number }

export interface Label {
	/** Centre of the text, in screen pixels. */
	x: number;
	y: number;
	text: string;
	/** Font size in pixels. */
	size: number;
}

/** The area a label covers: an estimate from its length, generous by a few pixels. */
export function labelBox(l: Label, pad = 2): LabelBox {
	const w = l.text.length * l.size * 0.6 + pad * 2;
	const h = l.size * 1.25 + pad;
	return { x0: l.x - w / 2, y0: l.y - h / 2, x1: l.x + w / 2, y1: l.y + h / 2 };
}

const overlaps = (a: LabelBox, b: LabelBox) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

/** The labels that fit, most important first, without covering each other. */
export function placeLabels<T extends Label>(labels: T[], reserved: LabelBox[] = []): T[] {
	const taken = [...reserved];
	const out: T[] = [];
	for (const l of labels) {
		const box = labelBox(l);
		if (taken.some((b) => overlaps(b, box))) continue;
		taken.push(box);
		out.push(l);
	}
	return out;
}
