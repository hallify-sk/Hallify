# Fix progress: halls (hall management in the console)

Branch `fix/halls`, migration `0022_hall_slugs_and_profile_cleanup.sql`.

| id | status | note |
|----|--------|------|
| B11 | done | Console/AI-created halls get a unique slug (`uniqueHallSlug`, Slovak transliteration); 0022 backfills every NULL slug. The wizard's own insert is the accounts team's. |
| B14 | done | Website validated with `normaliseWebsite` on save (profile form and assistant patch); 0022 removes stored non-http(s) links. Rendering with `safeHref` is the venue team's. |
| B29 | done | "Uložiť všetky zmeny" finds the first invalid field on any tab, opens that tab and reports it; website field is plain text; slug field no longer browser-required. |
| B62 | done | Pasted image URLs are copied into R2 by `/app/manage/halls/import-image` (importImage, SSRF-safe); the server refuses new non-own image URLs (existing ones are kept). |
| B70 | done | Table-type steppers no longer clamp per keystroke; values are clamped when the field is left. |
| B72 | done | Settings form posts booking rules only; `saveInfo` uses `updateBookingSettings`; errors are shown. |
| B73 | done | New console/AI halls are drafts (`is_public = 0`) with a slug; listing needs an address. Directory filter is discovery's. |
| B74 | done | All seven days stored with the console defaults (`completeOpeningHours`), also for assistant patches; 0022 completes partially-set hours. |
| B84 | done | Reactivation error is shown and localised; when the plan is full the banner offers swapping (pause another hall, activate this one). |
| B85 | done | Gallery limit blocks only growth; an over-limit gallery can be saved, reordered and trimmed. Localised message. |
| B98 | done | Block dialog lists/cancels only live upcoming bookings on the chosen weekdays; server re-derives them; clients get the status message, note and email; webhook fires. |
| B99 | done | The listed toggle follows the server after archive/plan lock; profile fields re-sync after a successful save. |
| B140 | partial | Slug not browser-required (derived from the name when empty), reserved words refused, clash suggests a free slug. Slugs stay unique across Hallify: the apex `/app/halls/<slug>` route resolves them globally (discovery owns it). |
| B150 | done | Deleting a custom amenity unticks it on every hall of the org; 0022 removes leftovers. |
| B152 | partial | Photos of deleted halls and photos removed from a hall are deleted from R2 when nothing else references them. Closed orgs: `orgHallImageUrls` + `deleteUnusedHallImages` are ready for the settings team's org closure (needs the R2 binding there). Production test cover is the owner's. |
| B153 | done | Restore at the limit gives restore-specific advice; Create is disabled at the limit with an upgrade link; create advice no longer says "reactivate". |
| B170 | done | Floor-plan request email escapes org, hall and user names. |
| M14 | done | Gallery photos can be moved earlier/later and set as cover. |
| M15 | done | Leaving the hall page with unsaved changes asks first (browser prompt on reload/close). |
| M25 | partial | Owner sees the request status, dates and note and can withdraw an open request (operator is emailed). Status-change emails and a delivery attachment belong to the platform queue (settings/platform teams). |
| I2 | done | Photos are downscaled in the browser before upload (longest side 2000 px, JPEG/WebP 0.85). srcset is not part of this scope. |
| I14 | done | Create disabled at the limit with upgrade link; default names numbered; skipped gallery photos are reported. |
| I15 | done | Toasts for archive/restore/reactivate, notice after delete; `hall.archived/restored/deleted` webhooks; cancellation payloads carry `hall_id` and `reason`. |
