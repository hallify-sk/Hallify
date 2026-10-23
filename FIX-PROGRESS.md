# Fix progress: settings team (fix/settings)

| id | status | note |
|----|--------|------|
| B6 | done | Close org, leave and webhook delete use `confirmFirst`; Cancel now cancels. |
| B24 | done | Closing cancels the Stripe subscription first (strict: closing aborts if Stripe fails); Stripe webhook ignores events for deleted orgs. |
| B25 | done | Clients with upcoming bookings are emailed (sk + en) before deletion; the danger zone and confirm dialog say how many. |
| B49 | done | Danger-zone errors render inside the danger zone with role=alert. |
| B80 | done | Webhook URL must be public https (isSafeWebhookUrl) on create/edit and again at send time; redirects not followed. |
| B87 | done | Webhooks stay listed after a downgrade as "paused by plan" and can be deleted. |
| B104 | done | Any member can leave (Settings > Advanced, or /app/org/leave for members without console access); roles and overrides are deleted. |
| B159 | done | Webhook form stays open with its input on a validation error. |
| I15 | done | Closing leads to /app/org-closed with a summary (billing, clients emailed). |
| I16 | done | Webhook test send, edit, delivery detail (payload, error), retry, translated statuses. |
| M10 | done | Owner can download all org data (JSON) or bookings (CSV) from Advanced. |
| B40 | partial | Webhook delivery log uses parseDbTime-based timeAgo; announcements: see below. |
| B16 | done | Preview posts a $state.snapshot (the proxy threw DataCloneError and froze the builder); posting is guarded. |
| B79 | done | On Free the section controls are disabled with a plan notice, saving keeps stored texts/sections, and the preview shows what visitors get. |
| B17 | done | Logo upload posts to /api/upload/image, shows an error when it fails; accept list and hint match the endpoint (no SVG). |
| B77 | done | Name and theme are controlled state (no longer overwritten on re-render); the org default theme applies to members without a personal choice (root layout); accent ink was already derived. |
| B37 | done | Platform settings forms no longer reset (update reset:false) and fields re-seed from saved data. |
| B94 | done | "Otvoriť priestor" posts to View as with return_to the hall. |
| B95 | partial | Slug limited to 63 chars (slugify), confirm dialog warns the old URL stops working, change audited. No redirect from the old slug (needs a slug-history table + hooks change). |
| B96 | done | Per-template restore-default, customised badge, sandboxed preview with sample data; only real overrides are stored (empty = default). |
| B114 | done | Announcement emails are counted (delivered/failed), stored and reported truthfully. |
| B158 | done | Server URL without GTM id refused; visitor default language no longer switches the console; unused slogan field removed (value kept); reset-to-defaults confirms; announcements signed "Tím Hallify". |
| B162 | done | Users list uses enhanced forms with confirms and shows errors; no revoke button on your own row. |
| M22 | done | platform_audit_log (migration 0021) records admin grants, plan/slug/partner/suspend, View as, credits, announcements, settings and email templates; /app/platform/audit and per-org log. |
| M23 | done | Org detail page: grant/remove AI credits with reason (ledger row + audit). |
| I7 | done | Users: search, account-type filter and column; orgs: plan/status filters; announcement picker: search + slug. |
| I18 | done | Announcements: edit, expiry date, live preview; "all" reaches only orgs that existed when published. |
| I19 | done | "Paid" counts Stripe-backed subscriptions only, manual plans shown apart, partners = is_hallify_partner. |
| B81 | partial | Strict hostname validation (rejects -bad-.sk, a..b.sk; pasted URLs tidied), clear pending-verification explanation, unverified claims expire after 7 days so a squatter cannot block the owner. Real ownership verification needs Cloudflare for SaaS (owner). |
| I17 | done | No CF_ZONE_ID jargon: plain notice when connection is manual, refresh step only when automatic, "čaká na pripojenie" label. |
| B82 | done | All help articles in Slovak and English; categories, page title and "More in" localized; both languages sent so the switch needs no reload. |
| M21 | done | Help search (diacritics-insensitive, ranked) and new SK+EN articles: public site, webhooks, AI assistant, messages, calendar (+ export and closing). |
