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

(The parent pages section follows as the work lands.)
