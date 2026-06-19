// Static knowledgebase — authored in code, version-controlled, no admin UI.
// Bodies are trusted HTML (rendered with {@html}); keep them simple + helpful.

export interface Article {
	slug: string;
	title: string;
	category: 'Getting started' | 'Halls & floor plans' | 'Reservations' | 'Seating' | 'Account & billing';
	summary: string;
	body: string;
}

export const ARTICLES: Article[] = [
	{
		slug: 'getting-started',
		category: 'Getting started',
		title: 'Getting started with Hallify',
		summary: 'The big picture: organizations, halls, reservations and how guests book.',
		body: `
			<p>Hallify helps you manage event venues — your <strong>halls</strong> — and the <strong>reservations</strong> people make for them.</p>
			<h3>The flow</h3>
			<ol>
				<li><strong>Create a hall</strong> for each space you rent out (capacity, address, photos, pricing).</li>
				<li><strong>Draw its floor plan</strong> so you can arrange tables and seat guests.</li>
				<li><strong>Make it public</strong> and share your booking page — guests request dates, you approve them.</li>
				<li>Once approved, you (or the client) can build the <strong>table layout</strong> and manage the guest list.</li>
			</ol>
			<p>Use the <strong>onboarding checklist</strong> on the Help page to track your setup.</p>
		`,
	},
	{
		slug: 'halls-and-floorplans',
		category: 'Halls & floor plans',
		title: 'Setting up a hall and its floor plan',
		summary: 'Bounds, walls, zones and table types — what each one is for.',
		body: `
			<p>A <strong>floor plan</strong> is the canvas your tables live on. Open a hall and choose <em>Floor plan</em> to draw it.</p>
			<h3>The four steps</h3>
			<ol>
				<li><strong>Bounds</strong> — draw the outer rectangle of the room. This frames everything.</li>
				<li><strong>Walls</strong> — draw the solid structures (walls, pillars, the stage). They're obstacles tables can't overlap.</li>
				<li><strong>Zones</strong> — shade and <em>name</em> areas (e.g. “Dance floor”, “Bar”, “Entrance”). Purely organisational.</li>
				<li><strong>Done</strong> — save. You can edit it any time.</li>
			</ol>
			<h3>Table types</h3>
			<p>Tables aren't drawn on the hall plan directly — instead you define reusable <strong>table types</strong> (a round 8-seater, a long banquet table, …) in the hall's settings. When arranging a specific event, you place those types onto the plan.</p>
		`,
	},
	{
		slug: 'reservations-and-approvals',
		category: 'Reservations',
		title: 'How reservations and approvals work',
		summary: 'Statuses, approving a request, and what the client can do after.',
		body: `
			<p>When a guest requests a hall it arrives as <strong>Pending</strong>. Staff move it through its lifecycle:</p>
			<ul>
				<li><strong>Pending</strong> → a new request awaiting your decision.</li>
				<li><strong>Approved / Planned</strong> → confirmed. The date is reserved.</li>
				<li><strong>Completed</strong> → the event has passed (set automatically).</li>
				<li><strong>Cancelled</strong> → frees the date. “Deleting” a reservation cancels it (the record is kept).</li>
			</ul>
			<p>Only staff change the status. Each hall can be set to <strong>auto-approve</strong> if you don't want to vet every request.</p>
			<h3>After approval</h3>
			<p>Once a booking is approved, the <strong>client can self-serve</strong>: from their reservation they can open the table layout and the guest list. You both edit the same plan, so there's a single source of truth.</p>
		`,
	},
	{
		slug: 'seating-editor',
		category: 'Seating',
		title: 'The seating editor — tables, chairs & guests',
		summary: 'Placing tables, assigning guests, standalone chairs and zones.',
		body: `
			<p>Open a reservation's <strong>Table layout</strong> to arrange seating on the hall's floor plan.</p>
			<ul>
				<li><strong>Place tables</strong> from the hall's table types. Drag to position, use the handle to rotate.</li>
				<li><strong>Assign guests</strong> — click a chair to seat someone from the guest list. Add per-guest notes (dietary, accessibility).</li>
				<li><strong>Standalone chairs</strong> — the chair tool drops single seats not attached to a table (concert / ceremony rows). They're assignable like table seats.</li>
				<li><strong>Zones</strong> — shade and label areas to organise the space.</li>
			</ul>
			<p>Changes <strong>autosave</strong>. When you're done, the <strong>Seating sheet</strong> view prints a per-floor manifest with a check-in list, and exports the guest list as a CSV (opens in Excel / Google Sheets).</p>
		`,
	},
	{
		slug: 'hall-extras',
		category: 'Reservations',
		title: 'Offering extras with a booking',
		summary: 'Add catering, equipment or services guests can order.',
		body: `
			<p><strong>Extras</strong> are add-ons guests can pick when booking a hall — catering, a sound system, decoration, anything you offer.</p>
			<h3>Set them up</h3>
			<p>On a hall, open the <strong>Extras</strong> section and add each one with a price that's either <strong>fixed</strong> (per event) or <strong>per guest</strong> (multiplied by the guest count).</p>
			<h3>How guests use them</h3>
			<p>Guests tick the extras they want while booking and see a running total. They can change their selection until you approve the booking; after that, you can adjust it for them (handy when you agree on something over messages).</p>
			<p>The number of extras per hall depends on your plan.</p>
		`,
	},
	{
		slug: 'plans-and-limits',
		category: 'Account & billing',
		title: 'Plans, limits and what happens on downgrade',
		summary: 'What each plan includes and how downgrades are handled.',
		body: `
			<p>Your plan sets limits on halls, members, reservations per hall per month, gallery images and extras, plus features like custom domains, branding and webhooks.</p>
			<h3>Upgrades &amp; downgrades</h3>
			<p>Upgrading charges only the <strong>prorated difference</strong> for the rest of the period. Downgrading takes effect at the <strong>end of the current period</strong> — no surprise charge.</p>
			<h3>Downgrades never delete anything</h3>
			<p>If a downgrade puts you over a limit, the extra resources are <strong>suspended, not removed</strong> — over-limit halls are hidden until you reactivate them, branding/custom-domains/webhooks pause, and extra gallery images are hidden. Everything comes back when you upgrade again.</p>
		`,
	},
	{
		slug: 'domains',
		category: 'Account & billing',
		title: 'Your booking address & custom domains',
		summary: 'Your free subdomain, and connecting your own domain.',
		body: `
			<p>Every organization gets a free <strong>&lt;your-slug&gt;.hallify.sk</strong> address where your public halls live — no setup needed.</p>
			<h3>Custom domains (paid plans)</h3>
			<p>On a paid plan you can connect your own domain (e.g. <em>bookings.yourvenue.com</em>): add it under <strong>Domains</strong>, create a <strong>CNAME</strong> record pointing to the address we show, then wait a few minutes for SSL to provision. Once active, your booking pages load on your own brand.</p>
		`,
	},
	{
		slug: 'team-and-roles',
		category: 'Account & billing',
		title: 'Team members and roles',
		summary: 'Owners, admins and members — who can do what.',
		body: `
			<p>Invite teammates under <strong>Members</strong>. Each has a role:</p>
			<ul>
				<li><strong>Owner</strong> — full control, including billing and closing the organization.</li>
				<li><strong>Admin</strong> — manage halls, reservations, members and settings.</li>
				<li><strong>Member</strong> — day-to-day access without org-level settings.</li>
			</ul>
			<p>The number of members you can have depends on your plan.</p>
		`,
	},
];

export function getArticle(slug: string): Article | undefined {
	return ARTICLES.find((a) => a.slug === slug);
}
