# Fix progress — accounts (sign-up, sign-in, profile, first run, new organisations)

| id | status | note |
|----|--------|------|
| B43 | done | Brand panel on the auth pages reads from i18n (sk + en). |
| B46 | done | Reset tokens stored as SHA-256 (legacy 32-char links still honoured for their hour); a completed reset spends every outstanding link and deletes all sessions; links are scoped apex vs. venue; double redemption refused. Apex + venue reset routes (venue files touched minimally). Changing the password in the profile signs out other sessions. |
| B130 | done | Forgot-password link moved after the password input in the DOM (grid keeps it beside the label), so Tab goes email -> password. |
| B172 | done | A legacy apex client account (client, no org) is turned into a personal Hallify account at sign-in instead of getting a session that is then ignored. |
| I27 | done | Sign-in counts only failed attempts (new rateLimitStatus peek); registration is counted after the form validates. |
| B44 | done | Register name/email fields are bound $state, so switching the intent no longer resets them. |
| M2 | done | Apex sign-up links Terms and Privacy with a required checkbox (checked server-side) and records the acceptance in legal_acceptances (migration 0024 creates the table where missing; helper shared verbatim with the venue branch). |
| B47 | done | Changing the login email requires the current password (rate-limited like sign-in), the address is format-checked server-side (also at sign-up), and the old address gets a notice (bilingual, escaped). |
| B155 | done | Profile email uniqueness is checked within the account's own namespace (org_id IS NULL for Hallify accounts), so venue clients' addresses no longer leak. |
| B91 | done | Session check, cleanup (sessions, resets, org and reservation invites) and the pending-invites list compare datetime(expires_at) with datetime('now'), so ISO timestamps expire on time. |
| B154 | done | GET /app/logout shows a "Sign out?" page with a POST button (signed-out visitors go to sign-in); signing out on GET would be CSRF-able. |
| B15 | done | New organisation slugs use slugify (Kaštieľ Ťahanovce Žilina -> kastiel-tahanovce-zilina), via a new uniqueOrgSlug helper. |
| B97 | done | uniqueOrgSlug also refuses any slug in closed_organizations, so a closed venue subdomain is never handed to a new organisation. |
| I28 | done | Creating an organisation with the name of one you already belong to asks for confirmation first (warning + "Yes, create another"). |
| B11 | done | The wizard creates its hall with a unique slug (slugify, global check, venue-site paths reserved), so the venue site lists it at once. Venue-site empty state is the venue team's part. |
| B30 | done | Every wizard action requires settings.manage, and createVenue/saveDetails also halls.manage (requireOrgPermission); the page sends members without it home instead of a 403. |
| B119 | done | Plan step shows the current plan's limits (unlimited spelled out), custom domain on/off from the plan, only higher plans as offers, and "Pokračovať" instead of "stay on free" for paid orgs; the venue step says "add another venue" when the org already has halls. |
| B156 | done | Wizard errors carry the step that produced them and only show on that step; the register "Prihláste sa" link keeps ?redirect. (Org switcher part belongs to shell.) |
