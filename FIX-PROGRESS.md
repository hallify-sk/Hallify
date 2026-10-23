# Venue site fixes (branch fix/venue)

| Id | State | Note |
|----|-------|------|
| B11 | done | /halls shows an empty state (and hides search/CTA) when the venue has no public hall yet. Slugs at creation are other teams'. |
| B14 | done | Hall and site Contact links only render http(s) websites (safeHref / displayWebsite). |
| B18 | done | Saved accent, display name and logo are applied to the venue site (accent written after the template tokens, ink tuned for contrast) and to its sign-in/recovery pages, under the paid-and-current plan rule. |
| B19 | done | Venue-site bookings dispatch the reservation.new webhook with the staff payload. |
| B39 | done | Statuses, dates, message times, prices, member roles and ticket subjects use the visitor's locale. |
| B48 | done | /forgot-password and /reset-password render a venue-branded card (no Hallify shell), 8-character hint and minlength; invalid-link points to the venue's own recovery page. One line added to AUTH_PATHS in src/routes/+layout.svelte (shell team's file). |
| B49 | done | Booking errors render next to the submit button (role=alert, scrolled into view); detail-page update/cancel/extras errors render next to their control. |
| B50 | done | Calendars get server-computed unavailable dates (blocks + closed weekdays). Refusing holds on closed days in /api/holds belongs to the permissions team (B26), which reuses assertCanBook. |
| B51 | partial | Full months are shown as unavailable with a note, the hold is released on refusal, the message names the month and no longer leaks the plan limit, and the error is visible. Whether pending requests should count toward the cap is a policy decision (approvals don't check the cap, so excluding them would let a month overfill). |
| B52 | done | Cancel is only offered within the notice period; the deadline is shown, and after it a note tells the client to message the venue. Page and action share one rule. |
| B53 | done | Sign-out link does a full page load. |
| B55 | done | Venue form shows the auto-approve note when the hall auto-approves; the success banner says "confirmed" for approved bookings. Client confirmation email is M4 (another team). |
| B56 | done | Own hold reads "Podržané pre vás" / "Held for you". |
| B71 | done | Public pages name custom amenities from org_amenities, falling back to a humanised key. |
| B74 | done | Public opening hours fill untouched days with the console default (09:00–22:00), only explicit open:false shows as closed. |
| B88 | done | Clients see and can order only the oldest extras up to the plan limit (an already ordered one stays). Console-side marking of over-limit extras is not in scope. |
| B127 | done | Website shown shortened, wraps; link keeps the full URL. |
| B135 | done | SiteShell and the cookie banner have print rules. |
| B136 | done | Phone nav becomes a full-width tab bar under the brand row; My reservations tabs wrap. |
| B143 | done | Login errors only show on the tab that produced them; negative guest counts get "Zadajte platný počet hostí" (booking and edit). |
| B144 | done | src/routes/halls/+error.svelte shows the server's 4xx message inside the venue site. |
| B173 | done | The cookie banner publishes its height as --consent-space; the venue site pads its content by it. |
| B174 | done | "Napíšte priestoru" extras hint hidden on cancelled, completed and started bookings. |
| M2 | done | Client registration links Terms and Privacy, requires the checkbox and records a legal_acceptances row (migration 0019_legal_acceptances, IF NOT EXISTS, same schema as production). |
| M26 | done | Read-only availability calendar on the public hall page (taken, unavailable, full months; no booker details). |
| I30 | done | MiniCalendar: one tab stop with arrow/Home/End/PageUp/PageDown navigation, unavailable days announced via aria-label/aria-disabled. |
| I32 | done | Finished bookings say "Táto udalosť sa už skončila" instead of "already started". |
