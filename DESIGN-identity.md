# One account everywhere, email verification, account deletion

Design for D4 (one Hallify account on every venue site), D11 (email verification) and
D7 (self-service account deletion). Migration: `migrations/0030_identity.sql`.

## Today

- A **Hallify account** is a `users` row with `org_id IS NULL` (account_type
  `organization`, even for people who only look for venues). Email is unique among them.
- A **venue client** is a `users` row with `account_type = 'client'` and `org_id` = the
  venue. Email is unique per venue. It has its own password, its own session, and every
  booking made on the venue site points at it (`reservations.user_id`).
- Sessions are tenant-isolated in `getSessionUser`: a client row is only signed in on
  its own venue's site; a Hallify account only on the apex or on a venue it is a member of.

## D4: link, don't merge

The per-venue client rows stay. They scope bookings, messages, the venue's client list
and the closing of a venue, and every venue-site page already reads them. What changes
is **who authenticates them**.

- New column `users.account_id` (nullable, references `users.id`). A client row with
  `account_id` set is **linked** to that Hallify account. Its own `password_hash` is set
  to the unusable marker `!linked` and is never checked again.
- Sign-in on a venue site (`/login ?/login`), in order:
  1. An organisation member of this venue signs in as staff (unchanged).
  2. The Hallify account with this email, if the password is right:
     - no client row here yet: one is created, linked, with the account's names, email,
       language and verification state; signed in as that row;
     - a linked row exists: signed in as it;
     - an unlinked (old, separate) row exists and the same password also opens it: it
       is linked now (the person proved both) and signed in;
     - an unlinked row exists with a different password: refused with an explanation
       and a "send me a link" button. That mails a *join* link to the Hallify account's
       address (its email says it joins an older account); the old row is linked once
       the link is confirmed there with the Hallify password (see claiming).
  3. An unlinked client row with its own password (accounts from before this change)
     still signs in as before.
- Registration on a venue site: if a Hallify account already has the email, the person
  is told to sign in with it instead (the form switches to the sign-in tab with the
  email filled in). Otherwise it creates **the Hallify account and the linked client
  row** together, records Terms acceptance for both, signs in as the client row and
  sends the verification email.
- Accepting a reservation invitation (`/invite/[token]`) creates the same pair; the
  invitation link itself proves the address, so both start verified. An address with a
  Hallify account is asked to sign in instead; signed in with it (on the venue site, or
  on hallify.sk when the venue has no public address) the event is taken as the
  account's linked client row here.
- Staff assigning an event to an address that has a Hallify account (reservation
  detail → assign) hand it over at once: the linked client row is created if missing.
- Password reset on a venue site resets the **Hallify account** when the email has one
  (the link stays on the venue site, whose reset page now also accepts Hallify
  accounts: `ResetScope` `venue`), otherwise the old client row. A finished reset or
  password change signs out the account's linked client rows too (`endSessions`).
  A finished reset also proves the mailbox (`mailboxProven`): the address counts as
  verified and old venue rows are claimed, because whoever opened the link has just set
  the password and nobody else holds the account. The reset page names those venues
  before the password is set.
- Wrong passwords on venue sites count against the venue's bucket and the address's
  global one, so spreading guesses over many venues gains nothing.
- Changing name or email in the profile updates the linked client rows (an email that
  would collide with another client row at that venue is skipped for that venue).
- Apex sign-in is unchanged: only Hallify accounts sign in there.

### Claiming old venue accounts (mailbox and password together)

Every unlinked client row with the account's email, at any venue, is linked to the
account (`claimClientRows`) only after a step that shows **the same person** reads the
mailbox and holds the Hallify account:

- a verification link (or the join link from "send me a link") opened and then
  confirmed on that page with the Hallify password, or by a session of the account
  (`findJoinLink`, `joinOldAccounts`); the page lists the venues first;
- a finished password reset of the Hallify account (see above).

Opening a verification link only verifies. Anyone can sign up with someone else's
address and choose the password; if the owner of the address clicked "confirm" (or the
join link that whoever signed up can have mailed to them), joining on that click would
hand their old venue accounts to the person who knows the password. The join email
and page tell someone who does not know the password how to take the account over
instead ("Forgot password" sets their own).

This is how someone with only venue accounts gets one Hallify account for all of them:
register on hallify.sk (or on any venue site) with the same email, open the link and
confirm with the new password. Accounts that existed before the
migration count as verified, but **are not auto-linked by the migration**: an old
apex account and an old client row sharing an address were never proven to be the same
person, so linking waits for a link confirmed with the password, a reset, or the same password opening both.

### Bookings across venues

`/app/client/reservations` (and the personal home) list the bookings of the Hallify
account and of every client row linked to it, with a link to each booking on its
venue's own site (`$lib/server/account-bookings`). Sessions stay host-scoped: opening
that link signs in on the venue site with the same Hallify email and password.
`/app/client` is now open to every Hallify account (it used to require the
`client` account type, which never reaches /app) and sits in the app shell; the
sidebar links it for members and the account menu for owners and admins.

## D11: email verification

- `users.email_verified_at` (nullable). The migration sets it for every existing row,
  so existing accounts count as verified.
- `email_verifications` table: one row per mailed link, storing only the SHA-256 of the
  token (like password resets), the address it was sent to, a 3-day expiry and when it
  was used. A link only verifies while the account still has that address.
- Verified state of a linked client row is copied from its Hallify account whenever it
  changes (verification, email change, linking), so a single column answers "is this
  client's email verified" everywhere.
- Sent: on apex registration, on venue registration, on an email change (the account
  becomes unverified until the new address is confirmed), and on "resend".
  Without an email provider (dev) the link is logged to the console.
- Operators: when `REQUIRE_EMAIL_VERIFICATION` is set (`1`, `true`, `on`, `yes`), an
  unverified Hallify account opening the console (`/app/manage`, `/app/org/new`,
  `/app/welcome`, `/app/billing`) is sent to `/verify-email`: resend the link, change the
  address (with the password), or sign out. Off by default because production email is
  not working yet. Platform admins are never gated.
- Clients (light version): the link is sent, booking works immediately, the venue site
  shows a reminder banner with a resend button until the address is confirmed, and the
  venue sees "email not verified" next to the client on its bookings.
- Operators without the switch: a reminder strip in the app shell links to
  `/verify-email` until the address is confirmed (existing accounts never see it).
- Platform admins can mark an account verified on the platform user page
  (`?/markVerified`, audited as `user.email_verified`); for a linked venue row the
  Hallify account is marked, with all its rows.
- `REQUIRE_EMAIL_VERIFICATION` is documented, commented out, in `wrangler.toml` and in
  `.env.example`.

## D7: deleting your own account

From the profile, with the current password and an explicit confirmation. The profile
shows beforehand exactly what will happen.

1. **Refused** for the last platform admin.
2. Each organisation the person **owns**:
   - another owner remains: only the membership is removed;
   - other members exist: the next person becomes owner (administrators first, then
     members, each by join date), the Stripe subscription is set to end (no further
     charges), every hall is made private, and the new owner is emailed;
   - nobody else: the organisation is closed exactly as Settings → Close does
     (`archiveAndDeleteOrg`: Stripe cancelled, clients emailed, archive kept). If Stripe
     cannot be cancelled, deletion stops before anything is removed for that venue.
3. Organisations where they are only a member: membership, role rows and overrides
   removed.
4. Their bookings (on the Hallify account and on every linked client row): upcoming ones
   are cancelled and the venue is notified; past ones are kept for the venue's records,
   with the client row anonymised (`Zmazaný klient`, a `deleted-…@deleted.invalid`
   address, no password, `deleted_at` set). Client rows without bookings are deleted.
5. The Hallify account: sessions, reset and verification tokens deleted; the row is
   deleted, or anonymised the same way when records still point at it (legacy apex
   bookings, setup requests), because those references must not dangle.
6. Signed out; the sign-in page confirms the account is gone.

Code: `$lib/server/account-deletion` (plan and order, tested with fake side effects)
and `$lib/server/account-deletion-live` (Stripe, `archiveAndDeleteOrg` with
`strictBilling`, the new-owner email, the venue's cancellation notice). Billing is
handled first: hand-overs' subscriptions are set to end, then one-person orgs are
closed; a failure stops before anything personal is removed. A row is also kept
(anonymised) when the person sent messages in other people's threads or the team
channel, which would otherwise cascade away with it.
