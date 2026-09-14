# Deploying School Lunch Orders (for Alexander, when he decides to)

Nothing here has been run. Tonight's build is local only (`wrangler dev --local`). Every command below touches Cloudflare
and is Alexander's call.

## What it is on Cloudflare

- **One Worker** `school-lunch-orders` serves the API (`/api/*`) and the pages (`app/public/`, via Workers static assets). One
  deployment = one school.
- **One D1 database** `school-lunch-orders` (binding `DB`), schema in `worker/migrations/`.
- **One cron** `0 7 * * *` (daily, 7:00 UTC = 3:30 or 4:30 AM in Newfoundland): deletes expired sessions and old wrong-PIN /
  wrong-code records. Nothing else runs on a schedule; cut-offs are computed on every request.
- **No secrets.** PINs and family codes are stored hashed in D1. No API keys, no email or SMS provider, no payment provider.
- **Never set `TEST_MODE`.** It turns on the test clock header and the `/api/test/*` reset and seed routes. It is not in
  `wrangler.toml` and must never be added as a var or secret.

## Steps

1. `cd worker && wrangler d1 create school-lunch-orders` → copy the `database_id` into `worker/wrangler.toml` (it holds a
   placeholder of zeros).
2. `wrangler d1 migrations apply school-lunch-orders --remote`
3. First setup, the school's own name and the first office PIN (no SAMPLE data), still in `worker/`:
   `node tools/first-setup.mjs --school "<school name>" --admin "<office person>" --pin <4-6 digits> --out setup.sql`
   (optional: `--payment "<how parents pay>"`, `--year-start YYYY-MM-DD --year-end YYYY-MM-DD`)
   then `wrangler d1 execute school-lunch-orders --remote --file setup.sql`, then delete `setup.sql` (it holds a PIN hash).
   The PIN is typed on the command line, so it can sit in shell history: the office changes it in Settings → Staff after
   the first sign-in. Until the school year is set (here or in Settings), every day reads "No school" and nothing can be
   ordered.
4. `wrangler deploy` (from `worker/`).
5. Sign in at `/staff/` with that PIN, then in **Settings**: payment instructions, cut-off, school year, classes, the menu items
   and their allergens (checked against the kitchen's real labels), the no-school days, and staff PINs for the kitchen and
   teachers. In **Office**: one family per household, printing each code once on the paper that goes home.
6. A domain: a short address parents can type from paper (for example a subdomain the school or its parent council owns). Add it
   as a Workers custom domain.

## Cost

One school fits inside Cloudflare's free Workers and D1 plans (CA$0 a month), assuming a few hundred families placing orders
and a few staff pages. The paid Workers plan is only needed if requests outgrow the free daily limit.

## Before a real school uses it

- **Privacy.** Children's first names, rooms and **allergies** are personal health information about children. The school
  (and NLSchools, if it is a public school) decides whether a parent council or lunch provider may hold it, what the parents
  are told, and how long it is kept. Add a privacy notice to the sign-in page and a year-end clean-out (not built).
- **The allergen list is only as good as the menu data.** The warning uses what the kitchen types for each item. Someone at
  the school must check each item against the real product labels, and the kitchen's cross-contact practice is outside the app.
- **Backups.** D1 Time Travel restores the database to any point in its window (7 days on the free plan, 30 on the paid plan); nothing else is exported automatically.
  The office's CSV exports are the paper trail.
- **Money.** The app records what arrived; it takes no payments. The school's own bookkeeping is still the record of cash.
