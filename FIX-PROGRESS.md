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
