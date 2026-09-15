# School Lunch Orders

Hot lunch pre-orders for a Newfoundland school, its parent council or its lunch provider, instead of paper forms and cash
envelopes. Parents order on their phone with a family code (no email, **no payments taken**); the kitchen gets totals by item and
class with **allergens flagged** and prints labels; teachers mark lunches given out; the office keeps the ledger.

Built overnight 2026-09-14 (lead `sl-lead`, slices `sl1` and `sl2`). **Local only, not deployed.**

## Open it

```sh
cd ~/Projects/"School Lunch Orders" && npm run demo
```

Then open <http://127.0.0.1:8601/>. Everything is SAMPLE and seeded around today.

| Who | Where | Sign in |
|---|---|---|
| Parent (phone) | <http://127.0.0.1:8601/> | family code `KQ7M-4RTX` (Liam, milk allergy, and Ava) · `W3PH-8JND` (Noah) · `C9VB-6FYE` (Emma, Jack, Chloe) · `T5ZA-2GUK` (Owen) |
| Office + settings | <http://127.0.0.1:8601/staff/> | PIN `3141` (Ms. Janes) |
| Kitchen | <http://127.0.0.1:8601/staff/> | PIN `2718` (Mr. Kean) |
| Teacher, Room 4 | <http://127.0.0.1:8601/staff/> | PIN `1618` (Ms. Oldford) · Room 8: `1414` (Mr. Pardy) |

`npm run demo` keeps the data from last time; `npm run demo -- --fresh` re-seeds it around today. It needs Node and `wrangler`
(4.131) on the PATH; nothing is installed for the demo itself.

## What's real and what's SAMPLE

- **Real:** the allergen list. It is Health Canada's and CFIA's priority allergens plus gluten sources, and every quote in
  `docs/ALLERGENS.md` is checked word for word against the saved government pages in `data/sources/`
  (`npm run check:allergens`, which also proves the check can fail).
- **SAMPLE:** the school ("SAMPLE Harbour Pond Elementary (demo)"), every family, child (first names only), staff member, PIN,
  family code, menu item, price and ingredient list, and the payment address (`example.org`). The ingredients are made up and are
  not a real kitchen's recipes.

## What it does

- **Parents:** family code → children (first name, room, allergies ticked from the list) → pick days and items → a **red warning**
  when an item contains an allergen ticked for *that* child (never a sibling's), with "I understand" required per item, and the
  Worker refuses the order without it → cart → total → the school's payment instructions. Balance owing or credit, history,
  cancel before the cut-off (9:00 AM the school day before, skipping holidays and PD days).
- **Kitchen:** the next school day's totals by item and by class, allergy rows on top, printable labels with the allergy line.
- **Teacher:** today's class list on a phone, Given out / Absent.
- **Office:** balances, the ledger (orders, cancellations, closure credits, payments, adjustments, undo), new family codes shown
  once, CSV exports.
- **Settings:** school, cut-off, school year, menu items with allergens, the week's menu, no-school days (a storm closure added
  on the day cancels and credits every order for that day to the cent), classes, staff PINs.

## Tests

One run from a QA worktree pinned to `ffd6dc7` (the code on main), port 8609, 2026-09-14 21:56 NDT:

| Suite | Command | Result |
|---|---|---|
| Worker (unit, empty D1, API, without TEST_MODE) | `npm run test:worker` | 64 passed, 0 failed (18 unit, 2 empty D1, 40 API, 4 without TEST_MODE) |
| Worker negative controls | `npm run test:negative` | 14 of 14 red |
| Playwright, chromium + webkit at 390 and 1280 | `npm run test:e2e` (after `cd app && npm ci`) | 192 passed, 8 skipped (allowed: settings at 390, the journey's 390 runs), 0 failed |
| Page negative controls (family, staff, journey) | `npm run test:e2e:negative` | 8 of 8, 13 of 13, 1 of 1 red |
| Allergen quotes | `npm run check:allergens` | 6 of 6 quotes found word for word; the self-test goes red |

Details, negative controls and what the cross-reviews found: `docs/build-report.md`.

## What deploying needs

Not done tonight; Alexander's call. Full steps in `docs/DEPLOY.md`.

- Cloudflare **D1** database `school-lunch-orders` (migrations in `worker/migrations/`) and one **Worker** `school-lunch-orders`
  serving the API and the pages.
- **Cron** `0 7 * * *` (housekeeping only). **No secrets.** Never set `TEST_MODE`.
- **First setup** for a real school: `worker/tools/first-setup.mjs` writes the school row and the first office PIN as SQL.
- A **domain** parents can type from paper.
- Cost: inside Cloudflare's free Workers and D1 plans for one school (CA$0 a month).

## Where to pick this up

- **Needs Alexander:** whether a real school, parent council or NLSchools lets this hold children's allergy information, and the
  privacy notice and year-end clean-out that would go with it; a person at the school checking every menu item's allergens against
  the real labels; the deploy.
- **Known gaps** (details in `docs/build-report.md`):
  - Two orders sent at the same instant for the same child, day and item could together pass that item's daily maximum.
  - The order page's cart bar keeps the price from when the page loaded (the cart page itself shows a changed price).
  - Labels were checked in the browser's print layout, never on a real label sheet or printer; phones and printers are emulated.
  - No privacy notice, no year-end clean-out of children's allergies, one school per deployment.
  - Nothing is texted or emailed (on purpose); a lost family code means the office makes a new one.
  - Two children with the same first name in one room are told apart only by what the parent types.
  - Where a refused "New code" message appears on the office page has no test; no screen-reader pass was done.
- **Contract and reasoning:** `PLAN.md` (the build contract), `docs/API.md` (every route and rule), `DECISIONS.md` (the calls made
  overnight), `docs/ALLERGENS.md` (sources).
