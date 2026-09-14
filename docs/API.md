# School Lunch Orders: API contract (v1)

The contract between the Worker and the pages. sl1 builds the Worker and the parent pages; sl2 builds the staff pages (kitchen,
teacher, office, settings). If the code and this file disagree, this file wins until the lead changes it. Written by sl-lead
2026-09-14. Questions go in your build report; do not invent a different contract.

One Worker `school-lunch-orders` serves the API under `/api/*` and the static app from `app/public/` (same origin, no CORS).
One deployment = one school. Local only tonight: `wrangler dev --local`. D1 binding `DB`, database `school-lunch-orders`.

## Conventions

- JSON in, JSON out (the two CSV routes are the exception). `Cache-Control: no-store` on every `/api/*` answer.
- Errors are always `{ "error": "<plain English for a Newfoundland parent or school worker>", "code": "<code>", "field"?: "<input>" }`
  plus any extra keys named below.

| code | HTTP | when |
|---|---|---|
| `bad_request` | 400 | validation; `field` names the input |
| `unauthorized` | 401 | missing or expired token, a wrong PIN (`field: "pin"`), a wrong family code (`field: "code"`), a family token on a staff route or a staff token on a family route |
| `forbidden` | 403 | a staff token whose role may not use this route |
| `not_found` | 404 | unknown id, **or a child, line or entry that belongs to another family** (never 403 for another family's data) |
| `no_school` | 409 | ordering for a day that is not a school day |
| `not_on_menu` | 409 | ordering an item that is not on that day's menu |
| `cutoff_passed` | 409 | ordering or cancelling for a day whose cut-off has passed |
| `over_max` | 409 | more of an item than its `max_per_child` for one child on one day |
| `allergen_ack_required` | 409 | an item contains an allergen ticked for that child and the line has no `allergen_ack: true` |
| `pin_taken` | 409 | another staff member already has that PIN (`field: "pin"`) |
| `bad_state` | 409 | anything else not allowed from the current state (named per route) |
| `rate_limited` | 429 | too many wrong PINs or family codes |

- **Money is integer cents** in every field ending `_cents`. The API never sends a formatted amount except inside CSV. Pages format
  with `money()` from `app/public/common/ui.js`: `350` → `"$3.50"`, `-300` → `"-$3.00"`.
- Ids are strings. Seeded ids are fixed (see SAMPLE seed); new ones are `<prefix>_<16 hex>`.

## Time and the test clock

- The school's zone is `America/St_Johns`. Every `date` is school-local `YYYY-MM-DD`. Labels: `date_label` `"Mon Sep 21"`,
  `long_label` `"Monday, September 21"`, time labels `"9:00 AM"` (`"12:00 PM"` noon), `at_label` `"Mon Sep 14, 3:05 PM"`.
  Instants in JSON are ISO strings in UTC.
- Pages never use the browser clock for dates or times. They take `today`, `now` and every label from the API.
- A local time on a date becomes an instant with the offset in effect at that local time (`localInstant` in `worker/src/time.js`).
- Only when the Worker runs with var `TEST_MODE=1` (never in `wrangler.toml`): header `X-Test-Now: <ISO instant>` replaces "now"
  and `X-Test-IP: <string>` replaces the client IP. Without `TEST_MODE=1` both are ignored and the `/api/test/*` routes are 404.
- **Test anchor.** Tests pin `X-Test-Now: 2026-09-15T13:30:00Z` = **Tue Sep 15 2026, 11:00 AM NDT** unless a test says otherwise.
  9:00 AM NDT is `11:30Z`.

## The school calendar

- **Weekday**: Monday to Friday. Weekday numbers in `days` fields: Monday `1` … Friday `5`.
- **No-school day**: a row `{ date, kind, note }`, `kind` one of `holiday` ("Holiday"), `pd_day` ("PD day"), `closure`
  ("School closed"; storms, water, power). `kind_label` is the word in brackets.
- **School day**: a weekday, `year_start <= date <= year_end`, and not a no-school day.
- **`next_school_day`**: the first school day strictly after `today`, or `null` when none is left before `year_end`.
- **Cut-off.** For a weekday D: start with P = D and repeat `cutoff_days_before` times: P = the latest date before P that is a
  weekday and **not a no-school day of kind `holiday` or `pd_day`**. A `closure` does not move any cut-off (it is added on the day;
  planned days off are known in advance) and the school-year bounds are ignored here. `cutoff_at(D)` = the instant of `cutoff_time`
  on P. With `cutoff_days_before = 0`, P = D. Defaults: `1` and `"09:00"`.
- **Open for orders at instant T**: D is a school day, D has at least one item on its menu, and `T < cutoff_at(D)`. At exactly
  `cutoff_at` it is closed.
- `cutoff_label`: while open `"Order by 9:00 AM Fri Sep 18"`; once passed `"Ordering closed at 9:00 AM Fri Sep 18"`. `null` on a
  day that is not a school day.
- `cutoff_rule_label` (from `/api/info`): `"Order by 9:00 AM on the day."` (0), `"Order by 9:00 AM the school day before."` (1),
  `"Order by 9:00 AM 2 school days before."` (2+).
- **Day `status`** for a weekday D, the first that applies: `no_school` (a no-school day, or outside the school year), `no_menu`
  (no items that day), `closed` (T ≥ cutoff_at), `open`. `status_label`: the no-school `kind_label` or `"No school"` outside the
  year, `"No menu yet"`, `"Closed for orders"`, `"Open"`.

Worked examples with the SAMPLE seed (all must hold in the unit tests):

| day | cut-off | at the test anchor (Tue Sep 15, 11:00 AM) |
|---|---|---|
| Wed Sep 16 | 9:00 AM Tue Sep 15 | `closed` |
| Thu Sep 17 | 9:00 AM Wed Sep 16 | `open` |
| Mon Sep 21 | 9:00 AM Fri Sep 18 | `open` |
| Mon Oct 12 | — | `no_school` (Holiday, Thanksgiving Day) |
| Tue Oct 13 | 9:00 AM **Fri Oct 9** (Mon Oct 12 is a holiday) | `open` |
| Mon Oct 26 | 9:00 AM **Thu Oct 22** (Fri Oct 23 is a PD day) | `open` |
| Thu Sep 24 after a `closure` is added on Wed Sep 23 | still 9:00 AM Wed Sep 23 | `open` |

`next_school_day` at the anchor is Wed Sep 16. With `cutoff_days_before = 0`, Thu Sep 17's cut-off is 9:00 AM Thu Sep 17.

## Allergens

The list is fixed in the Worker (sources cited in `docs/ALLERGENS.md`). `GET /api/info` returns it in this order; pages take labels
from there. An unknown key anywhere → 400.

| key | label |
|---|---|
| `eggs` | Eggs |
| `milk` | Milk |
| `mustard` | Mustard |
| `peanuts` | Peanuts |
| `crustaceans_molluscs` | Crustaceans and molluscs |
| `fish` | Fish |
| `sesame` | Sesame seeds |
| `soy` | Soy |
| `sulphites` | Sulphites |
| `tree_nuts` | Tree nuts |
| `wheat_triticale` | Wheat and triticale |
| `gluten` | Gluten (barley, oats, rye, triticale, wheat) |

- **Conflicts** of a (child, item) pair = the item's `allergens` that are in the child's `allergies`, in list order.
  **Only that child's own allergies count**; a sibling's never do.
- When an order is placed, each line stores `ack_allergens` = its conflicts at that moment (only when `allergen_ack` was true).
- Kitchen, labels and teacher views recompute conflicts from the child's allergies and the item's allergens **as they are now**
  (a parent may tick a new allergy after ordering). `acknowledged` = every current conflict is in `ack_allergens`.
- `flag` of a child on a day: `"conflict"` if any of their active lines has a conflict; else `"allergy"` if the child has any
  allergy ticked; else `null`.

## Auth

- **Parents** sign in with a **family code**: 8 characters from `ABCDEFGHJKMNPQRSTUVWXYZ23456789`, shown as `XXXX-XXXX`. Input is
  case-insensitive; spaces and dashes are ignored. The Worker stores only the SHA-256 of the 8 normalised characters.
- **Staff** sign in with a PIN: 4 to 6 digits, unique in the school, stored as PBKDF2-SHA-256 (100 000 iterations, per-staff salt).
- Tokens are 32 random bytes, base64url (43 characters), stored as SHA-256. `Authorization: Bearer <token>`. Family sessions last
  90 days, staff sessions 12 hours.
- Rate guards (per client IP, 15-minute window): 10 wrong family codes, or 5 wrong PINs → 429 `rate_limited`
  `"Too many tries. Wait 15 minutes, then try again."` for the rest of that window, even for a right code or PIN.
- **Roles**: `admin` may use every staff route (`/api/staff/*`, `/api/kitchen/*`, `/api/teacher/*`, `/api/office/*`,
  `/api/admin/*`). `kitchen` may use `/api/staff/*` and `/api/kitchen/*`. `teacher` may use `/api/staff/*` and `/api/teacher/*`.
  Any other staff route → 403 `forbidden` `"That page is not for your PIN."`. No token, an expired one or the wrong kind → 401
  `"Please sign in again."`.

| method + path | who | body → answer |
|---|---|---|
| `POST /api/family/signin` | anyone | `{ code }` → 200 `{ token, family: { id, label }, expires_at }`. Wrong → 401 `"That family code doesn't match. Check the paper from the school, or ask the office."` `field: "code"`. |
| `POST /api/family/signout` | family | → 200 `{ ok: true }` |
| `POST /api/staff/signin` | anyone | `{ pin }` → 200 `{ token, role, staff: { id, name, role, class_id }, expires_at }`. Wrong → 401 `"That PIN is not right."` `field: "pin"`. |
| `POST /api/staff/signout` | staff | → 200 `{ ok: true }` |
| `GET /api/staff/me` | staff | → `{ staff: { id, name, role, class_id }, school_name, sample }` |

## Ledger and balance

A family's money is a list of entries: `{ id, at, at_label, date, kind, amount_cents, label, method, note, voided }`
(`method` is `null` except on payments; `note` is `""` when empty).

| kind | amount | label (exact) |
|---|---|---|
| `order` | + the order's total | `"Order: 5 items, Mon Sep 21 to Fri Sep 25"` (one day: `"Order: 1 item, Thu Sep 17"`) |
| `cancel` | − the cancelled line's total | `"Cancelled: Macaroni and cheese ×2 for Liam, Thu Sep 17"` |
| `closure` | − the family's active lines that day | `"Credit: School closed Wed Sep 23"` (`"Credit: PD day Fri Oct 23"`, `"Credit: Holiday …"`) |
| `payment` | − the amount received | `"Payment: e-Transfer"` (`Cash`, `Cheque`, `Other`) |
| `adjustment` | ± | `"Adjustment"` |

- `balance_cents` = the sum of `amount_cents` over entries that are not voided. **Positive = the family owes; negative = credit.**
- Only `payment` and `adjustment` entries can be voided; a voided entry stays in every list with `voided: true`.

## Public

`GET /api/info` → `{ school_name, sample, zone, today, date_label, long_label, now, time_label, next_school_day,
next_school_day_label, payment_instructions, cutoff_days_before, cutoff_time, cutoff_rule_label, allergens: [{ key, label }] }`.
On a migrated, empty D1: `school_name` `""`, `sample` `false`, `payment_instructions` `""`, the defaults above.

## Family routes (family token)

Shapes used below:
- **Class** `{ id, name, grade, sort }`, e.g. `{ "id": "room-2", "name": "Room 4", "grade": "Grade 2", "sort": 2 }`.
- **Child** `{ id, first_name, class_id, class_name, grade, allergies: [keys] }`.
- **MenuItem** `{ id, name, price_cents, ingredients, allergens: [keys], vegetarian, max_per_child }` (`max_per_child` `null` = no limit).
- **Line** `{ id, order_id, child_id, first_name, date, date_label, item_id, item_name, qty, unit_price_cents, total_cents, status,
  status_label, ack_allergens: [keys], conflicts: [keys], acknowledged, can_cancel, cutoff_at, cutoff_label, delivery, placed_at }`. `status`: `active`
  ("Ordered"), `cancelled` ("Cancelled"), `closed` ("No school, credited"). `delivery`: `null`, `"delivered"`, `"absent"`.
  `can_cancel` = `status == "active"` and now < `cutoff_at`. `conflicts` and `acknowledged` are computed exactly as the kitchen
  computes them (the child's allergies and the item's allergens as they are now), so a parent sees an allergy ticked after ordering.

| method + path | body → answer |
|---|---|
| `GET /api/family` | → `{ family: { id, label }, children: [Child], classes: [Class], balance_cents, payment_instructions }` (children by first name) |
| `POST /api/family/children` | `{ first_name, class_id, allergies }` → 201 `{ child }`. `first_name` 1–30 characters after trimming (letters, spaces, `-`, `'`); `class_id` must exist; `allergies` unique known keys. At most 8 children → 409 `bad_state`. |
| `PUT /api/family/children/:id` | same body → 200 `{ child }` |
| `DELETE /api/family/children/:id` | → 200 `{ ok: true }` (the child leaves every list; past lines keep their history). 409 `bad_state` `"Liam has lunches ordered for days still to come. Cancel them first."` while the child has an active line dated today or later. |
| `GET /api/family/menu?week=YYYY-MM-DD` | → `{ week_start, week_label, prev_week, next_week, days: [Day × 5] }`. `week` may be any date (its Monday is used). **Without `week`**: the week of the first `open` day from today on (searching 8 weeks), else the week containing today (a Saturday or Sunday means the next week). `week_label`: `"Sep 21 to 25"`, or `"Sep 28 to Oct 2"` across months. **Day** `{ date, date_label, long_label, status, status_label, no_school, cutoff_at, cutoff_label, items: [MenuItem] }`; `no_school` is `null` or `{ kind, kind_label, note }`; `items` is `[]` when `status` is `no_school` and is listed (for reading) when `closed`. |
| `GET /api/family/orders?from=&to=` | → `{ lines: [Line] }` for this family's children (removed children included), sorted by date, first name, item name. Defaults: `from` = today − 60 days, `to` = `year_end`. |
| `POST /api/family/orders` | `{ lines: [{ child_id, date, item_id, qty, allergen_ack? }] }` → 201 `{ order: { id, placed_at, total_cents, item_count, lines: [Line] }, balance_cents }`. See "Placing an order". |
| `POST /api/family/lines/:id/cancel` | → 200 `{ line, balance_cents }`. 404 if not this family's. 409 `bad_state` `"That lunch is already cancelled."` if not active. 409 `cutoff_passed` (message as below). Adds a `cancel` entry. |
| `POST /api/family/lines/:id/ack` | → 200 `{ line }`: sets the line's `ack_allergens` to its current `conflicts`, so the kitchen no longer shows "Not confirmed by the parent". 404 if not this family's. 409 `bad_state` `"That lunch is already cancelled."` if not active; `"That lunch was for a day that has passed."` before today; `"There's nothing to confirm on that lunch."` when `conflicts` is empty. No cut-off: confirming changes no numbers. |
| `GET /api/family/ledger` | → `{ balance_cents, entries: [Entry] }`, newest first |

### Placing an order

All or nothing: the first failing check in this order rejects the whole request and **nothing is stored**. `index` is the
zero-based position in `lines`.
1. 400 `bad_request` (`field: "lines"`, `index`): `lines` is not an array of 1–60; `qty` is not an integer 1–10; a bad `date`;
   `allergen_ack` present but not a boolean; the same (child_id, date, item_id) twice in one request.
2. 404 `not_found` (`index`): the child is not this family's (or was removed); the item does not exist.
3. 409 `no_school` (`index`, `date`): `"There's no school on Mon Oct 12 (Holiday)."` / `"There's no school on Sat Sep 19."`
4. 409 `not_on_menu` (`index`): `"Fish cakes and potatoes isn't on the menu for Thu Sep 17."`
5. 409 `cutoff_passed` (`index`, `date`): `"Ordering for Wed Sep 16 closed at 9:00 AM Tue Sep 15."`
6. 409 `over_max` (`index`): the child's active qty of that item that day plus this line's qty is over `max_per_child`:
   `"Liam can have at most 2 of White milk (250 mL) on Thu Sep 17."`
7. 409 `allergen_ack_required`: **every** line whose conflicts are not empty and whose `allergen_ack` is not `true`, listed as
   `lines: [{ index, child_id, first_name, item_id, item_name, allergens: [keys] }]`. Message for the first:
   `"Liam is allergic to Milk. Macaroni and cheese contains Milk. Tick \"I understand\" to order it anyway."` (several allergens:
   `"Milk and Mustard"`, `"Eggs, Milk and Mustard"`).

On success, in one D1 batch: an `orders` row; one line per request line with `unit_price_cents` copied from the item **now** (a
later price change never changes a placed line); `ack_allergens` as above; one `order` ledger entry for the total. A new line for a
(child, date, item) that already has an active line is stored as another line (the maximum counts both).

## Staff routes

### Kitchen (`kitchen`, `admin`)

`GET /api/kitchen/day?date=` (default `next_school_day`, or today when that is `null`) →
```
{ date, date_label, long_label, today, is_today,
  status: "school_day" | "no_school" | "weekend" | "outside_year", status_label, no_school: null | { kind, kind_label, note },
  // status_label: "School day", the no-school kind label, "Weekend", "Outside the school year"
  cutoff_at, cutoff_label, orders_open,            // orders_open: a school day and now < cutoff_at (totals can still change)
  totals: { item_count, line_count, children },   // item_count = Σ qty of active lines
  items: [{ item_id, name, qty, allergens, vegetarian }],        // every item on that day's menu (qty 0 included) plus any item with
                                                                  // active lines that day that is no longer on it; qty desc, then name
  classes: [{ class_id, name, grade, sort, children, qty, items: [{ item_id, name, qty }] }],   // classes with qty ≥ 1, by sort
  children: [{ child_id, first_name, class_id, class_name, grade, flag, allergies,
               lines: [{ line_id, item_id, item_name, qty, conflicts: [keys], acknowledged }] }] }
```
Only `active` lines count. `children` order: `flag` `conflict` first, then `allergy`, then `null`; inside each, class `sort`, then
first name. **Invariants the tests check:** `Σ items[].qty` = `totals.item_count` = Σ qty of that date's active lines;
per class `qty` = Σ of its `items`; every active line appears under exactly one child.

`GET /api/kitchen/labels?date=` (same default) → `{ date, date_label, school_name, sample, labels: [{ line_id, first_name,
class_name, grade, item_name, qty, conflicts: [keys], allergies: [keys], acknowledged }] }`, one label per active line, sorted by
class `sort`, first name, item name.

### Teacher (`teacher`, `admin`)

- `GET /api/teacher/classes` → `{ classes: [Class], my_class_id }` (`my_class_id` is the staff member's class; for an admin or a
  teacher without a class, the first class by `sort`).
- `GET /api/teacher/day?class_id=&date=` (defaults `my_class_id`, today) → `{ date, date_label, is_today, status, status_label,
  no_school, class: Class, children: [{ child_id, first_name, allergies, flag, state, state_label,
  lines: [{ line_id, item_name, qty, conflicts }] }], counts: { children, delivered, absent, waiting } }`. Only children with at
  least one active line that day, sorted by first name. `state`: `null` ("Waiting"), `"delivered"` ("Given out"), `"absent"`
  ("Absent"). Any teacher may look at any class (substitutes). 404 for an unknown class.
- `POST /api/teacher/mark` `{ date, child_id, state }` (`state` `"delivered"`, `"absent"` or `null` to clear) → 200 `{ child, counts }`
  (the child's row and the class counts). 409 `bad_state` `"You can only mark today's lunches."` when `date` is not today;
  409 `bad_state` `"Liam has no lunch ordered today."` when the child has no active line that day; 404 for an unknown child (checked
  first). Absent does not credit anything.

### Office (`admin`)

| method + path | body → answer |
|---|---|
| `GET /api/office/families` | → `{ families: [{ id, label, children: [{ id, first_name, class_name }], balance_cents, last_payment_at, last_payment_label }], totals: { families, owing_cents, credit_cents } }`. Sorted by balance (highest owing first), then label. `owing_cents` = Σ positive balances; `credit_cents` = Σ negative balances (≤ 0). `last_payment_label` `"Mon Sep 14"` or `null`. |
| `POST /api/office/families` | `{ label }` (1–60) → 201 `{ family: { id, label }, code }`. **The only answer that ever carries the code.** |
| `PUT /api/office/families/:id` | `{ label }` → 200 `{ family }` |
| `POST /api/office/families/:id/code` | → 200 `{ code }`. The old code and every session of that family stop working. |
| `GET /api/office/families/:id` | → `{ family, children: [Child], balance_cents, entries: [Entry] (newest first), upcoming: { lines, total_cents } }` (active lines dated today or later) |
| `POST /api/office/payments` | `{ family_id, amount_cents (1–1 000 000), method: "etransfer" \| "cash" \| "cheque" \| "other", note (0–200) }` → 201 `{ entry, balance_cents }` |
| `POST /api/office/adjustments` | `{ family_id, amount_cents (non-zero, −1 000 000 to 1 000 000), note (1–200, required) }` → 201 `{ entry, balance_cents }` |
| `POST /api/office/entries/:id/void` | → 200 `{ entry, balance_cents }`. 409 `bad_state` `"Only payments and adjustments can be undone."` / `"That entry is already undone."` |
| `GET /api/office/ledger.csv?from=&to=` | → `text/csv; charset=utf-8`, `Content-Disposition: attachment; filename="lunch-ledger-<from>-to-<to>.csv"`. Defaults `year_start` to today. Columns `Date,Time,Family,Kind,Description,Amount,Method,Note,Voided`, oldest first, CRLF. `Amount` is a plain number `12.50` / `-3.00`. `Voided` is `yes` or empty. |
| `GET /api/office/balances.csv` | → `filename="lunch-balances-<today>.csv"`, columns `Family,Children,Balance` (`Children` `"Liam (Room 4); Ava (Room 8)"`, `Balance` `12.50`), same order as the families list. |

**CSV rules:** a cell containing a comma, a double quote, CR or LF is quoted with `"` doubled. Any text cell that starts with `=`,
`+`, `-`, `@`, a tab or CR gets a leading `'` (spreadsheet formula guard). The `Amount` and `Balance` columns are written by the
Worker as numbers and are never prefixed.

### Settings (`admin`)

- **Item** `{ id, name (1–60), price_cents (0–5000), ingredients (0–400), allergens: [keys], vegetarian, days: [1–5], max_per_child
  (null or 1–10), active }`.

| method + path | body → answer |
|---|---|
| `GET /api/admin/settings` | → `{ school: { school_name, sample, payment_instructions, cutoff_days_before, cutoff_time, year_start, year_end }, classes: [Class + child_count], staff: [{ id, name, role, class_id, active }], items: [Item], no_school_days: [{ date, date_label, kind, kind_label, note }] (by date), allergens }` |
| `PUT /api/admin/school` | `{ school_name (1–80), payment_instructions (1–600), cutoff_days_before (0–5), cutoff_time ("HH:MM"), year_start, year_end (start < end) }` → 200 `{ school }` (`sample` is never changed here) |
| `POST /api/admin/items` | Item without `id` → 201 `{ item }` |
| `PUT /api/admin/items/:id` | Item without `id` → 200 `{ item }`. `active: false` while the item has active lines dated today or later → 409 `bad_state` `"4 of Cheese pizza slice are ordered for days still to come. Leave it on until those days pass."`; otherwise it is taken off every menu day from today on. |
| `GET /api/admin/menu?week=` | → `{ week_start, week_label, prev_week, next_week, days: [{ date, date_label, status, status_label, no_school, item_ids: [ids], ordered: { "<item_id>": qty } }] }` (`status` as kitchen: `school_day`, `no_school`, `outside_year`) |
| `PUT /api/admin/menu/:date` | `{ item_ids }` → 200 `{ day }` (same shape as a `days` entry). 400 when the date is not a school day or an id is not an active item. 409 `bad_state` `"That day has passed."` for a date before today. 409 `bad_state` `"3 of Cheese pizza slice are already ordered for Fri Sep 25. Keep it on the menu, or make the day a no-school day."` when an item with active lines that day is left out. |
| `POST /api/admin/menu/fill` | `{ week }` → 200 (same shape as `GET /api/admin/menu`). Every school day in that week dated today or later that has **no** items gets the active items whose `days` include its weekday. Days that already have items are not touched. |
| `GET /api/admin/no-school/preview?date=` | → `{ date, date_label, lines, item_count, families, credit_cents }`: what adding that date would cancel and credit now. The same 400s and 409 as the POST below (not a weekday, before today, outside the year, already a no-school day). |
| `POST /api/admin/no-school` | `{ date, kind, note (0–120) }` → 201 `{ day: { date, date_label, kind, kind_label, note }, cancelled: { lines, item_count, families, credit_cents } }`. 400 when the date is not a weekday, is before today, or is outside the school year. 409 `bad_state` `"Wed Sep 23 is already a no-school day."`. **In one D1 batch:** every `active` line that day becomes `closed`, and each family with such lines gets one `closure` entry of −(the sum of those lines' `total_cents`), whose `note` is the no-school day's note. `credit_cents` is the sum over families (positive number). |
| `DELETE /api/admin/no-school/:date` | → 200 `{ ok: true, restored_lines: 0 }`. 404 when unknown; 409 `bad_state` `"That day has passed."` before today. **Closed lines stay closed and credits stay**; parents may order again once it is a school day with a menu. |
| `POST /api/admin/classes` | `{ name (1–30), grade (1–30), sort (0–99) }` → 201 `{ class }` |
| `PUT /api/admin/classes/:id` | same → 200 `{ class }` |
| `POST /api/admin/staff` | `{ name (1–60), role, pin, class_id (null or a class) }` → 201 `{ staff }`. 409 `pin_taken`. |
| `PUT /api/admin/staff/:id` | `{ name, role, pin? , class_id, active }` → 200 `{ staff }`. 409 `bad_state` `"The school needs at least one office PIN."` when it would leave no active admin. |

## Test routes (`TEST_MODE=1` only; 404 otherwise)

- `POST /api/test/reset` → wipes every table and loads the SAMPLE seed below → 200 `{ ok: true, today }`.
- `POST /api/test/seed` `{ scenario: "demo" }` → reset, then the demo orders around today → 200 `{ ok: true, today,
  families: [{ id, label, code }] }`.

## SAMPLE seed (exact; tests rely on it)

**School**: `school_name` `"SAMPLE Harbour Pond Elementary (demo)"`, `sample` `true`, `cutoff_days_before` `1`, `cutoff_time`
`"09:00"`, `year_start` `2026-09-08`, `year_end` `2027-06-25`, `payment_instructions`:
`"Pay by Interac e-Transfer to lunch-orders@example.org (SAMPLE address) and put your family code in the message. Or send cash in a sealed envelope marked with your child's name and room."`

**Classes**

| id | name | grade | sort |
|---|---|---|---|
| `room-k` | Room 1 | Kindergarten | 0 |
| `room-1` | Room 2 | Grade 1 | 1 |
| `room-2` | Room 4 | Grade 2 | 2 |
| `room-3` | Room 5 | Grade 3 | 3 |
| `room-4` | Room 7 | Grade 4 | 4 |
| `room-5` | Room 8 | Grade 5 | 5 |
| `room-6` | Room 9 | Grade 6 | 6 |

**Staff** (SAMPLE PINs)

| id | name | role | PIN | class |
|---|---|---|---|---|
| `st-office` | Ms. Janes (SAMPLE) | admin | `3141` | — |
| `st-kitchen` | Mr. Kean (SAMPLE) | kitchen | `2718` | — |
| `st-oldford` | Ms. Oldford (SAMPLE) | teacher | `1618` | `room-2` |
| `st-pardy` | Mr. Pardy (SAMPLE) | teacher | `1414` | `room-5` |

**Items** (all active; the ingredients are SAMPLE text, not a real kitchen's recipe)

| id | name | price | allergens | veg | days | max | ingredients |
|---|---|---|---|---|---|---|---|
| `pizza` | Cheese pizza slice | 350 | wheat_triticale, gluten, milk | yes | 5 | 2 | Wheat flour crust, tomato sauce, mozzarella cheese |
| `fishcakes` | Fish cakes and potatoes | 500 | fish, eggs, wheat_triticale, gluten | no | 5 | 1 | Cod, potatoes, egg, breadcrumbs (wheat), onion |
| `soup` | Chicken noodle soup and a roll | 425 | eggs, wheat_triticale, gluten | no | 1, 3 | 1 | Chicken, egg noodles (wheat, egg), carrots, celery, wheat roll |
| `wrap` | Turkey and cheese wrap | 450 | wheat_triticale, gluten, milk, mustard | no | 1, 3 | 1 | Wheat tortilla, turkey, cheddar cheese, lettuce, mustard |
| `stirfry` | Vegetable stir-fry with rice | 450 | soy, sesame | yes | 3 | 1 | Broccoli, carrots, peppers, tofu (soy), rice, sesame oil, gluten-free tamari (soy) |
| `chili` | Beef chili with rice | 475 | — | no | 2, 4 | 1 | Ground beef, kidney beans, tomatoes, onion, peppers, spices, rice |
| `mac` | Macaroni and cheese | 400 | wheat_triticale, gluten, milk | yes | 2, 4 | 1 | Wheat macaroni, milk, cheddar cheese, butter |
| `milk` | White milk (250 mL) | 100 | milk | yes | 1–5 | 2 | Partly skimmed milk |
| `apple` | Apple slices | 125 | — | yes | 1–5 | 2 | Apples |
| `cookie` | Oatmeal raisin cookie | 100 | eggs, milk, wheat_triticale, gluten | yes | 1–5 | 1 | Oats, wheat flour, butter, egg, raisins, brown sugar |

**Menu**: every school day from `2026-09-08` through the later of `2026-12-18` and today + 56 days (never past `year_end`) gets the
items whose `days` include its weekday.

**No-school days**: `2026-10-12` holiday "Thanksgiving Day"; `2026-10-23` pd_day "Professional development day"; `2026-11-11`
holiday "Remembrance Day".

**Families** (codes are SAMPLE and printed by the demo)

| id | label | code | children (id, first name, class, allergies) |
|---|---|---|---|
| `fam-1` | Liam and Ava (SAMPLE) | `KQ7M-4RTX` | `ch-liam` Liam, room-2, milk · `ch-ava` Ava, room-5, none |
| `fam-2` | Noah (SAMPLE) | `W3PH-8JND` | `ch-noah` Noah, room-k, peanuts + tree_nuts |
| `fam-3` | Emma, Jack and Chloe (SAMPLE) | `C9VB-6FYE` | `ch-emma` Emma, room-6, gluten · `ch-jack` Jack, room-2, none · `ch-chloe` Chloe, room-1, eggs + sesame |
| `fam-4` | Owen (SAMPLE) | `T5ZA-2GUK` | `ch-owen` Owen, room-4, none |

No orders and no ledger entries after a reset.

**Demo scenario** (for `npm run demo`, anchored to the real today): orders placed "last week" (the seed may bypass cut-off; nothing
else may) for today and the next 8 school days with a menu, so that the kitchen's next school day has at least one `conflict` row
(Liam with an acknowledged milk item) and one `allergy` row; Emma never gets a gluten item; an e-Transfer `payment` for fam-1
larger than it owes (a credit), a `payment` for fam-2 of exactly its balance (all paid up), a part `payment` in cash for fam-3
(still owes), fam-4 unpaid, one `cancel` credit, and a `closure` with credits on the most recent
past school day since `year_start` when there is one (note "Storm closure (SAMPLE)"); when today is a school day and it is after
noon, about half of Room 4 marked given out.
