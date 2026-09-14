# Build report: sl1 (Worker, D1 and the ordering rules; the parent's phone pages)

## M1 first commit (for sl2 and the lead)

**DONE: the Worker answers every route in docs/API.md** (reset, seed, sign-in, info, family, orders, kitchen, teacher, office,
settings, no-school, menu, CSV). First commit on `rig/sl1`: `c0ec703` "Worker M1". It was checked by hand against a real
`wrangler dev --local` on 8602 before committing; the lead merged it to main (7179f99) and passed a 44-check smoke test on a QA
worktree pinned to it. There is no git remote in this repo, so nothing is pushed; the lead merges `rig/sl1` locally.

## The Worker

Plain JS ESM, no npm dependencies, small modules: `calendar.js` (school days, cut-off, day status, week labels; pure),
`allergens.js` (list, conflicts, flags; pure), `codes.js`, `csv.js`, `text.js` (pure), `ledger.js`, `lines.js`, `auth.js`
(family codes, PINs, sessions, role matrix, rate guards), `family.js`, `orders.js` (`checkOrder` is pure and runs the contract's
checks in order), `kitchen.js`, `teacher.js`, `office.js`, `admin.js`, `seed.js`, `demo.js`, `testroutes.js`, `index.js` (router).
`migrations/0001_init.sql`. Money is integer cents everywhere. An order, a cancellation and a no-school day are each one
`db.batch()`.

**DONE (lead review note 1): a no-school day closes and credits in one batch keyed on the date.** The batch inserts the day off,
then one `closure` entry per family from `INSERT … SELECT -SUM(total_cents) … WHERE date = ? AND status = 'active' GROUP BY
family_id`, then `UPDATE lines SET status = 'closed' WHERE date = ? AND status = 'active'`. The answer's numbers are read back from
what that batch wrote, so they cannot drift from the money. The storm test reads the entries and the closed lines back afterwards
and checks they add up to each other and to the active totals before.

**DONE (sl2 cross-review): the no-school preview refuses exactly what the POST refuses** (same 400 messages for a weekend, a past
day, a day outside the year; same 409 for a day already off). One shared check; tested for each case.

### Verified: `cd worker && npm test` (fresh Workers on 8602)

| part | tests | result |
|---|---|---|
| unit (`time.test.mjs`, `unit.test.mjs`) | 17 | 17 pass |
| API on an empty, migrated D1 (`api-empty`) | 2 | 2 pass |
| API (`api-auth`, `api-orders`, `api-closure`, `api-kitchen`, `api-staff`) | 38 | 38 pass |
| a Worker WITHOUT `TEST_MODE` (`api-plain`: test routes 404, test clock and test IP ignored) | 3 | 3 pass |

What the suites cover, as the brief lists it: every worked cut-off example (holiday and PD day skipped, a closure does not move it,
0 and 2 days before, the exact instant is closed, an afternoon cut-off time); day status order; week labels; conflicts; balance
phrase inputs (using the shared `balancePhrase`); CSV quoting and the formula guard; family code normalisation. Info on an empty D1;
family sign-in right / wrong / 10-try rate limit (and the window expiring); staff sign-in and 5-try limit; the role matrix (3 roles
× 5 areas, no token, family token, made-up token); family isolation (child, order, line cancel → 404 and nothing changes);
children CRUD, validation, the 8-child limit, removal refused while lunches are ordered. The cut-off on a fake clock exactly as the
brief gives it, the same for cancel, Tue Oct 13 open until 9:00 AM Fri Oct 9. Allergens: Liam refused without the ack and listed
by index, accepted with it and stored `["milk"]`, **Ava accepted without an ack**, a mixed request lists only Liam's lines, two
allergens named in list order. All or nothing (orders and ledger read back identical after four kinds of refusal). The checks in
the contract's order (15 cases where two checks could fire). over_max counting earlier lines. The price snapshot. Ledger labels.
The family menu (default week, statuses, closed days list items, no-school days list none). **Storm closure to the cent** with a
seeded PRNG over all four families, a price change between two rounds (two snapshots of mac), a qty-2 line and a line cancelled
first; preview = POST; credit = Σ active totals; each family's balance drops by its own sum; closed lines = credits read back; the
kitchen day empty; ordering that day 409; a second POST 409; DELETE restores nothing and ordering works again. **Kitchen totals =
sum of orders** over three days (random orders, a quarter cancelled, one day closed): Σ items = item_count = Σ active qty read back
through every family's orders, per-item and per-class sums, flag order, every active line under exactly one child, one label per
active line; a new allergy after ordering shows as a conflict with `acknowledged: false`. Teacher marks (today only, no lunch 409,
counts from the answer, null clears, absent credits nothing). Office payment / adjustment / undo arithmetic and validation; families
sorted by balance with totals; a new family's code shown once and working; ledger and balances CSV byte for byte (header, CRLF,
`-3.00`, `'=SUM(A1)`, quoting). Menu PUT refusal and success, fill week, school settings validation, items (deactivate refused
while ordered, then off every menu from today), staff (`pin_taken`, the last-admin guard, an inactive PIN stops working), classes,
no-school validation, and the demo scenario's promises (a conflict and an allergy row on the kitchen's next day, Emma never gets
gluten, the payments, one cancel, the storm closure credited to the cent, half of Room 4 given out after noon, none before).

### Verified: the 13 Worker negative controls (`npm run negative`, copies on 8605, log in `worker/tests/negative-control.log`)

Each breaks one thing in a copy and must turn exactly the named tests red. **13 of 13 went red, each for the right reason** (the
log keeps the assertion under each red test):

| # | break | red test(s) and why |
|---|---|---|
| 1 | cut-off on D's own 9:00 AM | unit: Wed Sep 16 cut-off `2026-09-16T11:30Z` not `…15T11:30Z`; API: 9:00 AM order got 201 |
| 2 | no holiday / PD day skip | unit: Oct 13 → `2026-10-12`; API: label "Order by 9:00 AM Mon Oct 12" |
| 3 | ack not required | Liam + mac without ack got 201 |
| 4 | family's allergies | Ava + mac got 409 |
| 5 | closure credit ignores qty | preview 6110 ≠ POST 5760 (and balances) |
| 6 | closure credits cancelled lines | preview 6110 ≠ POST 6310 |
| 7 | kitchen counts lines | item_count ≠ Σ qty (19) |
| 8 | kitchen includes cancelled | Σ items ≠ Σ active qty |
| 9 | cancel skips the family check | fam-2's cancel of fam-1's line got 200 |
| 10 | kitchen into office | kitchen on /api/office/families got 200 |
| 11 | CSV formula guard removed | unit `'=SUM(A1)`; API ledger row starts `=SUM(A1)` |
| 12 | family-code rate guard off | the 11th try got 200 |
| 13 | current price, not the snapshot | price snapshot test and the storm test |

## Known gaps

- **over_max across two simultaneous requests** (lead review note 2): the check reads the child's existing lines, then the order
  batch writes. Two requests landing at the same moment for the same child, day and item could together pass the limit. One parent
  on one phone makes this unlikely; a fix would be a per-(child, date, item) guard row written in the batch.
- A closure re-added at the same test instant after a DELETE would count lines closed by the first one in its answer (the money is
  still right). Only possible with a pinned test clock.

**DONE (lead request): `worker/tools/first-setup.mjs`.** Writes SQL for the school row (sample 0, cut-off 1 / 09:00) and one
office PIN (PBKDF2 with auth.js's parameters), nothing else; refuses a PIN that is not 4–6 digits and never prints it. `npm test`
now starts its no-TEST_MODE Worker from that SQL: the name shows with `sample: false`, the PIN signs in as admin, no classes or
items exist, `/api/test/reset` is 404. With it the suite is **67 tests** (18 unit, 2 empty, 38 API, 4 plain), all green.

## The parent pages

**DONE.** `/` sign-in (`app/public/index.html` + `family/signin.js`), `/family/` home, `/family/children/`, `/family/order/`,
`/family/cart/`, `/family/history/`, with shared `family/family.js` (session, 401 → sign-in, header, allergen words, the cart in
`localStorage` `school-lunch:cart:<family id>`, menu weeks) and `family/family.css`. Plain HTML/JS/CSS on the lead's tokens and
`common/` helpers; no emoji, inline SVG icons; red only for allergens (a solid block, white words); "closed" and refusals in orange.
Dates, times and labels come from the API. Checkbox rows put the real input over the whole row, so the row is the tap target.

### Verified: Playwright `tests/family` on 8604, all four projects (chromium and webkit, 390 and 1280)

**56 passed (14 tests × 4 projects).** Sign-in by typing `KQ7M-4RTX`, `kq7m4rtx` (shown as `KQ7M-4RTX`), a wrong code in
`#code-error`, sign out. Add a child with two allergies (the `<select>` hit-tested then `selectOption`, per PLAN), edit, removal
refused by the Worker while Owen has a lunch ordered. **Liam gets the warning, Ava does not** (data-conflict, the exact words,
`button.ack` and no `.qty-plus`; for Ava no warning, no ack, `.qty-plus` adds it; contrast ≥ 4.5). "I understand" required: ack →
qty 1, the cart survives a reload, the tick shows in the cart, unticking disables Place order, the placed order stores `["milk"]`
for Liam and `[]` for Ava, payment instructions and "You owe $8.00" after. Wed Sep 16 closed with the exact label and no steppers;
Thu open; clock moved to Thu's cut-off → `#order-error` "Ordering for Thu Sep 17 closed at 9:00 AM Wed Sep 16.", the line marked
`cutoff_passed`, nothing stored, the cart kept. max_per_child stops the +. Cancel before the cut-off: the balance changes by exactly
the line total and matches the API; no Cancel on the closed Wednesday line. Balance phrases (owe / all paid up / credit). A storm
closure through the API shows as a credit in history. Tap targets (48, 56 for steppers, ack, Place order, View cart) hit-tested on
every page; the last item's action at the bottom of a scrolled page is not under `#cart-bar`; no sideways scroll. 32 screenshots
(8 pages × 4 projects) in `app/tests/family/shots/`, looked at on chromium-390, webkit-390 and webkit-1280.

A bug the suite caught before commit: a missing `)` in `cart.js` left the cart page on "Loading…" (seen in the trace's page error).

### Verified: the 5 page negative controls (`npm run negative:family`, port 8606, `app/tests/family/negative-control.log`)

**5 of 5 red, each for the right reason:** (a) every child's allergies → Ava's card had `data-conflict="true"`; (b) no warning
element → the warning locator not found; (c) ack without the acknowledgement → the stepper never showed qty 1; (d) refusal shown as
"Order placed" → `#order-error` empty; (e) a transparent cover above the cart bar → the hit-test found `#cart-bar` on top.

### DONE (lead's visual review): a solid cart bar and a real Ingredients disclosure

`#cart-bar` now has a solid `--surface` background with its top hairline and an upward shadow (card text no longer reads
through it). The order-page layout test adds: at the bottom of the page, elementFromPoint at the bar's centre is inside the bar,
the last item's action is wholly above the bar's top, the bar's computed background alpha is 1 (or a backdrop blur is set), and the
Ingredients summary is a 48 px target. "Ingredients" is a native `<details>` summary in muted normal weight with an inline SVG
chevron that turns when open. Re-run: **56 passed** in all four projects, screenshots re-shot. Page negative control **(f)** makes
the bar transparent again: red on "cart bar background is solid (alpha 0) or blurred". **6 of 6** page controls red.

## Round 3 (sl2's cross-review of the parent pages, and the demo balances)

- **DONE (safety gap): an allergy ticked after ordering reaches the parent** (70e8dfa). Family Lines carry `conflicts` and
  `acknowledged`, computed with the kitchen's own functions; `POST /api/family/lines/:id/ack` stores the current conflicts (404 for
  another family's line; 409 `bad_state` for a cancelled line, a past day, or nothing to confirm; no cut-off). Home shows the red
  warning in the standard words, "You ticked this allergy after ordering." and **I understand, keep it** beside Cancel. Tests: two
  API tests (the kitchen shows not confirmed, the ack confirms it for both, only that line, no money changes, each refusal) and a
  family spec by real taps (tick Milk on /family/children/, the warning on home, the ack clears it, the kitchen API agrees, still
  clear after a reload). Worker negative **14** (the ack stores `[]`) went red: `acknowledged` stayed false. Page negative **(g)**
  (home ignores `acknowledged`) went red: the warning was not found.
- **DONE (one wording):** the Worker's `allergen_ack_required` message is now "Liam is allergic to Milk. Macaroni and cheese
  contains Milk. Tick "I understand" to order it anyway." (320ca1b); the allergen API tests check it.
- **DONE (cart prices)** (756f1b9). The cart page already priced every line from the menu fetched when it opens, so its total
  already matched the placed total after a price change; what was missing was saying so. A cart line now keeps the price seen when
  it was added, and the cart shows "Price changed: now $4.50 each (was $4.00)." Spec: the price changed through the API between
  adding and opening the cart; the cart, its total and the placed total all read $4.50. Page negative **(h)** (the price is not
  kept) went red. Not covered: the order page's cart bar still shows the price from when that page loaded until it is reloaded.
- **DONE (demo balances, lead request):** in the demo scenario fam-1 sends one round e-Transfer larger than it owes (a credit),
  fam-2 pays exactly its balance (paid up), fam-3 keeps its part cash payment and fam-4 has paid nothing. The contract's demo line
  should read that way instead of "a payment for fam-1 that covers its first week". The demo API test asserts the signs (credit,
  zero, owing, owing), one round e-Transfer for fam-1 and the office totals showing both owing and credit.

Verified on the merged branch (main's integration round 2 merged in first): `npm test` **64 tests** (18 unit, 2 empty, 40 API,
4 without TEST_MODE) green; Playwright `tests/family` **64 passed** (16 tests × 4 projects); Worker negative controls **14 of 14**
red; page negative controls **8 of 8** red.

## Cross-review of sl2 staff pages

Read-only, against main at 17e6466 (sl2's pages) and ebce23e, checked against what the Worker actually sends. Real mismatches:

- admin School: a blank "Order cut-off: school days before" saves **0** (`Number('')`), so the parents' rule silently becomes "on the day" instead of a refusal; the same `Number('')` turns a blank class "Order in lists" into 0.
- admin School: "Parents see: …" (`#cutoff-rule`) comes from `/api/info` at page load and is not refreshed after Save, so it keeps showing the old rule.
- admin No-school confirm and result: "This cancels N lunches" uses `item_count` (Σ qty), so Liam's mac + milk ×2 reads "3 lunches" for one child's lunch; the numbers match the API, the word does not (say "items", or use `lines`).
- office Adjustment: the form has no `busy()` guard (payments have one), so a double tap records two adjustments.
- office (minor): a refused Undo or New code shows its words in the payment form's `#payment-error`, not next to the entry or button that was tapped.

Checked and matching: `parseDollars` ("4.5" → 450, "4.05" → 405, "$4" → 400, "4.999" refused, "-4" → -400 on adjustments and refused
for payments); balance pills (owing / credit / paid up) and "Credits held" as a positive amount; Undo only on payments and
adjustments; the one-time code box; CSV download with the Worker's filename; kitchen conflict vs "Allergy on file" rows,
"Not confirmed by the parent" when `acknowledged` is false, off-menu ordered items listed, weekend / no-school / outside-year
banners, `orders_open` wording; labels' ALLERGY line and "Allergies on file"; teacher buttons only today on a school day, counts
from the answer; menu refusal message shown and the tick put back; last-admin and `pin_taken` refusals shown with the Worker's
words; the PIN page shows the 429 words. Red is used only for allergen rows, pills and label lines.

## For the lead

- Nothing needed from sl2. No changes asked of lead-owned files.
