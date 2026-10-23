# Fix progress: platform team (emails, notifications, request hooks, production files)

Branch: fix/platform

| id | status | note |
|----|--------|------|
| B166 | done | static/marketing/PHOTO-SOURCES.md moved to docs/marketing/ (content kept). |
| I13 | done | favicon.ico, apple-touch-icon.png, icon-192/512.png, site.webmanifest, /.well-known/security.txt (route, Expires always ~a year ahead), static/_headers with long cache for fonts and marketing images. |
| B12 | done | hooks: http to https (301 GET/HEAD, 308 otherwise) on every production host incl. venue subdomains and custom domains; scheme read from CF-Visitor, then X-Forwarded-Proto, then the URL; never on localhost, *.localhost, IPs, workers.dev, pages.dev (src/lib/server/edge.ts). Cloudflare 'Always Use HTTPS' and HSTS preload remain owner settings. |
| B124 | done | www.hallify.sk redirects to hallify.sk (same path and query), so the canonical is single. |
| I9 | partial | App-level Origin check on POST/PUT/PATCH/DELETE to /api/* and /app/manage/assistant/* (Stripe webhook and cron exempt); foreign or opaque Origin, or Sec-Fetch-Site cross-site, gets 403. TLS minimum, HSTS preload and dropping unsafe-inline are owner decisions. |
| B8 | not done | |
| B9 | not done | |
| B96 | not done | |
| B10 | not done | |
| M5 | not done | |
| I6 | not done | |
| B112 | not done | |
| B113 | not done | |
| B3 | not done | |
| B93 | not done | |
