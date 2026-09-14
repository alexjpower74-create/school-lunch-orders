# School Lunch Orders: build contract

One plan file. It is the contract, and it lives at the repo root so every agent reads the same copy.
Then read `docs/API.md` (the contract between slices), `DECISIONS.md` and `AGENTS.md` (ports, hard rules). `BRIEF.md` is the
original brief. `docs/ALLERGENS.md` cites the allergen list.

## The brief (Onyx for Alexander, 2026-09-14)
Hot lunch pre-orders for a school (or its parent council or lunch provider) in Newfoundland. Many NL schools still do this on paper
forms and cash envelopes. Parents order lunches for the coming days or weeks on their phone; the kitchen gets daily totals by item
and by class with **allergens flagged**; teachers get a class list at lunchtime showing who ordered what.

- **Parent (phone, no email):** a family code from the school on paper → children (first name, class, allergies ticked from the
  list) → pick days and items for each child → the app **warns in red** when an item contains an allergen ticked for that child and
  requires an explicit "I understand" per item → cart → total → the school's payment instructions (e-Transfer / cash envelope).
  **The app takes no payments.** Order history, balance owing or credit, cancel before the cut-off.
- **Kitchen:** tomorrow's totals by item and by class, allergen-flagged rows on top, printable labels per child (name, class, item,
  allergen warning). **Teacher:** today's class lunch list on a tablet or phone, mark given out / absent. **Office:** payments ledger
  (mark paid), balances, credits from cancellations and closures, CSV export.
- **Settings (admin PIN):** menu items (price, ingredients, allergens, vegetarian, usual days, optional daily max per child), menu
  calendar by week, order cut-off (9:00 AM the school day before), no-school days (PD days, holidays, and storm closures added on the
  day, which cancel and credit that day's orders), classes and grades, staff PINs.
- **Data:** SAMPLE school "SAMPLE Harbour Pond Elementary (demo)", SAMPLE families and children (first names only).

**Tests that matter:** cut-off enforced on a fake clock (clock back → order allowed; forward → refused; negative control); the
allergen warning appears for a child with that allergy and not for a sibling without it (negative control); a storm-closure day
cancels and credits every order for that day to the cent; kitchen totals equal the sum of orders; journeys in chromium + webkit at
390 and 1280.

## Design
Tokens are in `app/public/theme.css` (lead-owned: read it, never edit it; style your pages in your own CSS). Alexander's approved
portfolio look: dark navy ground, tonal surfaces, hairlines, soft shadows, colour on data, pills and edges, never a loud backdrop
(`.aurora` at 0.2 is allowed on staff pages only, never on parent pages or print). Indigo is the one accent. System fonts. Inline
SVG for icons, never emoji. Everything quiet under `prefers-reduced-motion`. Every screen shows the school name with a visible
`.sample-badge` "SAMPLE" while `sample` is true. Money in tabular figures (`font-variant-numeric: tabular-nums`).

**Red means allergen.** The `--allergen*` tokens are used for allergen warnings, allergen pills that match a child, and allergy
flags, and for nothing else. Errors such as "ordering closed" use `--warn` (orange). A warning names the child, the allergen and
the item in plain words: "Liam is allergic to Milk. Macaroni and cheese contains Milk." Pills and flags always carry words as well
as colour, so they work when printed in black and white or read by a screen reader. The order page carries one plain line near the
menu: "The red warning uses the allergens the school listed for each item. Ask the school about anything else."

Tap targets: **≥ 48 px on parent pages** (base type 17 px), **≥ 56 px** for Place order, "I understand, add it", the
quantity steppers and the teacher's Given out / Absent; ≥ 44 px on the other staff and settings controls. Sticky headers carry
`data-sticky-header`, sticky footers `data-sticky-footer` (the `tap()` helper reads both). Print (`/kitchen/labels/`, and the
kitchen page): white sheet, black ink, allergen lines bold with a border and the word "ALLERGY"; `.no-print` on buttons and nav.

Plain English for Newfoundland parents: "Order by 9:00 AM Fri Sep 18", "You owe $12.50", "You have a $3.00 credit",
"All paid up", "No school: PD day". Times and dates always come from the API labels.

### Parent pages (sl1, phone 390 first; must also work at 1280)
- **`/` Sign in.** Header: school name + SAMPLE. "Family code" `#code` (autocapitalize characters, autocomplete off, placeholder
  `ABCD-2345`, a dash appears after 4 characters), **Sign in** `#sign-in`, errors in `#code-error` (`role="alert"`). One line: "The
  school gives each family a code on paper. Lost it? Ask the office." Session in `localStorage` `school-lunch:family` via
  `session.set('family', …)` from `common/api.js`. Already signed in → `/family/`. Any 401 later → back here.
- **`/family/` Home.** `#balance` card (`data-balance-cents`) with `#balance-text` ("You owe $12.50" / "You have a $3.00 credit" /
  "All paid up", from `balancePhrase()` in `common/ui.js`) and the school's `#payment-instructions`; **Order lunches**
  `#order-lunches`; `#children` with `.child-card[data-child]` (first name, "Room 4 · Grade 2", allergy pills); **Add a child**
  `#add-child`; `#upcoming` with each active line `.line[data-line]` grouped by day ("Thu Sep 17: Liam, Macaroni and cheese ×1,
  $4.00") and **Cancel** `button.cancel-line` only when `can_cancel` (inline confirm, then the balance updates). A line whose `acknowledged`
  is false (an allergy ticked after ordering) shows the red `.allergen-warning` in the same words plus "You ticked this allergy after
  ordering.", with **I understand, keep it** `button.ack-line` (`POST /api/family/lines/:id/ack`) beside Cancel; `#history-link`;
  `#sign-out`. No children yet → the page leads with "Add your children first".
- **`/family/children/`.** List `.child-row[data-child]` with `button.edit-child` and `button.remove-child`; form `#child-form`:
  `#first-name`, `#class` (select, "Room 4 · Grade 2"), allergies as large checkbox rows `input[name="allergy"][value="<key>"]`
  (labels from `/api/info`), `#save-child`. Errors inline by `field`.
- **`/family/order/`.** Child tabs `button.child-tab[data-child]` (`aria-pressed`); week `#prev-week` `#week-label` `#next-week`;
  day chips `button.day[data-date][data-status]` (`aria-pressed`; "Thu Sep 17" + Open / Closed / No school); `#day-status` (the
  cut-off label or the no-school words). Items `.item[data-item]`: name, price, "Vegetarian" pill `.veg`, allergen pills
  `.allergen-pill[data-allergen]`, ingredients in a `<details>`, `.already-ordered` when this child already has it that day.
  **For the selected child only:** when the item's allergens include one ticked for that child the card gets
  `data-conflict="true"`, a red `.allergen-warning` (the words above), and instead of the + button **I understand, add it**
  `button.ack`; tapping it adds 1 with the acknowledgement, after which `.qty-minus` `.qty` `.qty-plus` show. No conflict → no
  warning, no `button.ack`, just the stepper (`button.qty-plus` adds 1). Closed or no-school day → items for reading, no steppers,
  `#day-status` says why. `max_per_child` stops the + at the limit. Sticky `#cart-bar[data-sticky-footer]` with `#cart-count`
  ("3 items"), `#cart-total`, **View cart** `#view-cart`. The cart lives in `localStorage` `school-lunch:cart:<family id>` as
  `[{ child_id, date, item_id, qty, allergen_ack }]` and survives reloads.
- **`/family/cart/`.** Grouped by day, then child: `.cart-line[data-child][data-date][data-item]` with qty, line total and
  `button.remove-line`. A conflicting line shows the red `.allergen-warning` and a checkbox `input.ack-check` "I understand Liam is
  allergic to Milk" (ticked when acknowledged on the order page); **Place order** `#place-order` stays disabled while any conflicting
  line is unticked. `#cart-total`. A refusal from the API shows in `#order-error` (`role="alert"`) and marks the line
  `data-error="<code>"`; nothing is removed silently. Success → `#order-placed`: "Order placed", `#placed-total`, the school's
  `#payment-instructions`, `#new-balance`; the cart is emptied.
- **`/family/history/`.** `#balance`, `#ledger` with `.entry[data-entry][data-kind]` (voided ones struck through with "Undone"),
  past lines `.line[data-line]` with status and "Given out" / "Absent".

### Staff pages (sl2, 1280 first; kitchen, teacher and office must also work at 390)
- **`/staff/` PIN.** Keypad `button.key[data-key="0".."9"]`, `button.key[data-key="back"]`, `#pin-dots`, **Sign in** `#pin-submit`,
  `#pin-error`. Session `school-lunch:staff`. Role → page: admin `/office/`, kitchen `/kitchen/`, teacher `/teacher/`. Every staff
  page: `[data-sticky-header]` with the school name, SAMPLE, the staff name, `nav#staff-nav` links `a[data-nav]` (`kitchen`,
  `teacher`, `office`, `admin`) for the pages the role may use, and `#staff-sign-out`. A 403 shows "That page is not for your PIN."
  with a link to the right page; a 401 goes back to `/staff/`.
- **`/kitchen/`.** `#date-next` (the next school day, the default), `#date-today`, `#date-pick` (date input); `#kitchen-date`
  (long label); `#orders-open` "Orders are still open until 9:00 AM Wed Sep 16. These numbers can still change." while
  `orders_open`; `#no-school` banner. Stat cards `#stat-items`, `#stat-children`, `#stat-flagged`. `#item-totals` rows
  `tr[data-item]` with `.qty` (qty 0 rows muted); `#class-totals` rows `tr[data-class]` with `.qty` and the items; `#children` rows
  `tr.child-row[data-child][data-flag]`: conflict rows first with a red edge, "ALLERGY" and "Milk in Macaroni and cheese" (plus "Not
  confirmed by the parent" when `acknowledged` is false), then allergy-on-file rows, then the rest. **Print labels** `#print-labels`
  → `/kitchen/labels/?date=`.
- **`/kitchen/labels/?date=`.** Print sheet: `.label[data-line]` in a 3-across grid (2⅝ × 1 inch at print): first name large, room +
  grade, item ×qty, `.label-allergen` "ALLERGY: Eggs. Contains Eggs." naming only the conflicts (plus `.label-allergies` "Also allergic to: Sesame
  seeds" when the child has others), or "Allergies on file: Peanuts" when
  the child has allergies and no conflict; a small "SAMPLE" while sample. `#print` (`.no-print`) calls `window.print()`.
- **`/teacher/`.** `#class-pick` (select, default `my_class_id`), `#teacher-date`, counts `#count-waiting`, `#count-delivered`,
  `#count-absent`; rows `.child-row[data-child][data-state]`: first name, items ×qty, the red allergy flag words, **Given out**
  `button.mark[data-state="delivered"]` and **Absent** `button.mark[data-state="absent"]` (`aria-pressed`; tapping the pressed one
  clears it). The counts come from the API answer, never counted locally. Not today or no school → no buttons, a plain line why.
- **`/office/`.** `#owing-total`, `#credit-total`; `.family-row[data-family]` (label, children, `.balance[data-balance-cents]` pill:
  owing amber, credit green, paid up grey). Opening a family shows `#family-panel`: `#family-balance[data-balance-cents]`, children
  with allergies, ledger `.entry[data-entry][data-kind]` with `button.void-entry` on payments and adjustments, **Record a payment**:
  `#payment-amount` (dollars, prefilled with the balance when owing), `#payment-method`, `#payment-note`, `#record-payment`;
  **New code** `#new-code` → inline confirm `#confirm-new-code` → `#code-value` shown once with "Write this on the family's paper
  now. It won't be shown again." **Add a family** `#add-family-label` + `#add-family` → `#code-value`. CSV: `#ledger-csv`,
  `#balances-csv` (fetch with the token, then download a Blob).
- **`/admin/` Settings.** Tabs `button.tab[data-tab]`: `school`, `menu`, `days`, `items`, `classes`, `staff`.
  - School: `#school-name`, `#payment-instructions-input`, `#cutoff-days`, `#cutoff-time`, `#year-start`, `#year-end`,
    `#save-school`, `#school-saved`.
  - Menu: `#menu-prev`, `#menu-week-label`, `#menu-next`; a grid of items × days with `input.menu-cell[data-date][data-item]`
    checkboxes and `.ordered[data-date][data-item]` counts; a change saves that day (`PUT /api/admin/menu/:date`) and a refusal
    shows in `#menu-error` and puts the tick back; **Fill from usual days** `#fill-week`.
  - No-school days: `#no-school-date`, `#no-school-kind`, `#no-school-note`, **Add** `#add-no-school` → `#no-school-confirm` with
    the preview in words ("This cancels 12 lunches for 5 families and credits $48.25 to their balances.") and
    `#confirm-no-school` → `#no-school-result` ("Cancelled 12 lunches for 5 families. Credited $48.25."). List
    `.no-school-row[data-date]` with `button.remove-no-school` for today and later.
  - Items: `.item-row[data-item]` + `button.edit-item`, `#new-item`; form `#item-name`, `#item-price` (dollars, `3.50`),
    `#item-ingredients`, `input[name="item-allergen"]`, `#item-veg`, `input[name="item-day"]`, `#item-max`, `#item-active`,
    `#save-item`.
  - Classes: `.class-row[data-class]`, `#class-name`, `#class-grade`, `#class-sort`, `#save-class`. Staff: `.staff-row[data-staff]`,
    `#staff-name`, `#staff-role`, `#staff-pin`, `#staff-class`, `#staff-active`, `#save-staff`.

## Stack
- `worker/`: Cloudflare Worker, plain JS ESM, no npm deps, the wrangler on PATH (4.131). D1 `DB` = `school-lunch-orders`
  (placeholder id). `wrangler.toml`: `[assets] directory = "../app/public"`, `binding = "ASSETS"`, `run_worker_first = ["/api/*"]`;
  cron `0 7 * * *` (deletes expired sessions and old PIN/code attempts). Started from Visitor Log's proven scaffold (already in the
  tree): `src/time.js`, `src/clock.js`, `src/http.js`, `src/auth.js`, `tests/run.mjs`, `tests/negative-lib.mjs`,
  `tests/time.test.mjs`. sl1 owns them from now on and makes them fit this contract.
- `app/public/`: plain HTML/JS/CSS, no build, nothing from another host. Lead-owned shared files: `theme.css`, `common/api.js`
  (`api()`, `session`, `ApiError`), `common/ui.js` (`money`, `balancePhrase`, `esc`, `h`, `plural`, `listWords`). Ask the lead for
  changes in your report; put anything page-specific in your own files.
- `app/tests/`: Playwright 1.63, projects `chromium-390`, `chromium-1280`, `webkit-390`, `webkit-1280`, one worker, against the
  real Worker started fresh by `tests/start-worker.mjs` with `TEST_MODE=1`. `helpers.mjs` (lead-owned) has `tap`, `type`,
  `keypad`, `expectTapTarget`, `expectNoHorizontalScroll`, `contrastOf`, `shot`, the session and API setup helpers, the SAMPLE
  codes and PINs, and `NOW`. `negative-lib.mjs` (lead-owned) runs a page negative control against a broken copy.
- **Ports** (inspector = port + 10, always pass `--inspector-port`): demo 8601 · sl1 Worker/API tests 8602 · sl2 e2e 8603 · sl1
  family e2e 8604 · sl1 Worker negative copies 8605 · sl1 page negative copies 8606 · sl2 negative copies 8607 · lead journey 8608
  · QA 8609.
- Commands: `cd worker && npm test` (PORT 8602) · `cd worker && npm run negative` · `cd app && E2E_PORT=8604 npx playwright test
  tests/family` · `cd app && E2E_PORT=8603 npx playwright test tests/staff` · `node tools/check-allergen-quotes.mjs`.

## Rules
- You own the paths under your id and nothing else; `rig guard` enforces it. Commit only your own paths
  (`git commit -- <paths>`). Verify → commit → report in your `docs/build-report-<id>.md`. Never leave a green step uncommitted.
- When the lead says main has something you need, `git merge --no-edit main` in your worktree.
- Never grade the shared tree. No visible Chrome; `pwshot` or Playwright screenshots into your own `app/tests/<dir>/shots/`.
- **REAL input** in Playwright: `tap()` / `type()` / `keypad()` from helpers. `page.evaluate` only reads. Setting up data through the
  API is fine; the thing under test is always driven through the page. Hit-test with `elementFromPoint`, never rects alone.
  Two documented exceptions, because headless engines draw their own pickers that no real input can reach: a native `<select>`
  is hit-tested with `expectTapTarget()` and then set with `selectOption()`; an `<input type="date">` is hit-tested and then set
  with `fill('YYYY-MM-DD')`. Prefer defaults that avoid them (the no-school form's date starts at today; the kitchen has
  "Next school day" and "Today" buttons).
- A check that cannot fail measured nothing: every important check has a negative control that breaks a **copy** (worker/.negative
  or app/.negative), goes red for the right reason, and is appended to the matching `negative-control.log`. No switch in shipped
  code turns a guard off.
- Local only: `wrangler dev --local`. Never `wrangler deploy`, `secret put`, `d1 create`, `--remote`, Pages or DNS. Nothing is
  sent anywhere (no email, no SMS). No payments are taken.
- SAMPLE data only. Plain English for Newfoundland parents and school staff. No emoji as icons. No devils or demons.
- Every kill is by PID whose `/proc/<pid>/cwd` is inside your own worktree and on your own ports. Never `pkill`/`killall`
  wrangler, workerd, node or npm: other projects' demos run on this machine.

## Agents

### sl1 — Worker, D1 and the ordering rules; the parent's phone pages
Owns:
- worker/**
- app/public/index.html
- app/public/family/**
- app/tests/family/**

Report: docs/build-report-sl1.md

Task:
Implement `docs/API.md` exactly, then the parent pages in "Design → Parent pages". **Order of work (sl2 is waiting on the Worker):**

**M1: the Worker, committed early.** `worker/wrangler.toml`, `migrations/0001_init.sql`, the SAMPLE seed and `POST /api/test/reset`
first, then auth (family code + PIN + roles + rate guards), `/api/info`, and every **staff** route (kitchen, teacher, office,
settings, no-school preview/add/delete, menu, CSV) so sl2 can test against a real Worker. Make your first commit as soon as reset,
sign-in and the kitchen/teacher/office GET routes answer (aim for the first hour), note it at the top of your report, then carry on
with the family routes and the ordering rules. Keep the code in small modules (calendar/cut-off, allergens, orders, ledger,
kitchen, teacher, office, admin, seed), pure functions where possible so unit tests run in node. Money is integer cents end to end.
Use `db.batch()` so an order, a cancellation and a no-school day are each all-or-nothing.

**Worker tests** (`cd worker && npm test`, `tests/run.mjs`, fresh Worker on 8602, `X-Test-Now`/`X-Test-IP`):
- Unit: every worked cut-off example in docs/API.md (holiday and PD day skipped, a closure does not move it, 0 days before, the exact
  instant is closed), day status order, week labels, conflicts, balance phrase inputs, CSV quoting and the formula guard, family code
  normalisation.
- API: info on an empty D1; family sign-in right/wrong/rate limit (10); staff sign-in and the **role matrix** (every role × one route
  per area → 200/403/401, family token on staff routes 401); **family isolation** (fam-2's token on fam-1's child, line and cancel →
  404); children CRUD and validation.
- **Cut-off on a fake clock:** an order for Wed Sep 16 at `2026-09-15T11:29:00Z` (8:59 AM) → 201; at `11:30:00Z` (9:00 AM) → 409
  `cutoff_passed`; at the anchor → 409; Thu Sep 17 at the anchor → 201; the same clock rules for cancel; Tue Oct 13 open until
  9:00 AM Fri Oct 9 and closed one minute after.
- **Allergens:** Liam (milk) + `mac` on Thu Sep 17 without `allergen_ack` → 409 `allergen_ack_required` listing that index; with the
  ack → 201 and `ack_allergens: ["milk"]`; **Ava (no allergies) + `mac` the same day without an ack → 201**; a request mixing both
  lists only Liam's line; a request with one bad line stores nothing (ledger and lines unchanged).
- **Storm closure to the cent:** a seeded PRNG places many orders across all four families for one day (every item, qty 1–2 within
  max, an item price changed between orders so snapshots differ, one line cancelled first); the preview equals the POST's
  `cancelled`; `credit_cents` = the sum of that day's active line totals before; each family's balance drops by exactly its own sum;
  that day's lines are all `closed`; the kitchen day is empty; ordering that day → 409 `no_school`; a second POST → 409; DELETE does
  not restore anything.
- **Kitchen totals = sum of orders:** after random orders over two days plus cancellations and a closure, for each day
  `Σ items[].qty` = `totals.item_count` = Σ qty of active lines read back through `GET /api/family/orders` for all four families;
  each class's `qty` = the sum of its items; flag order (conflict, allergy, none); labels = one per active line. Also: a new allergy
  ticked after ordering shows as a conflict with `acknowledged: false`.
- over_max, not_on_menu, no_school, teacher mark (today only; no lunch → 409), office payment / adjustment / void arithmetic,
  ledger CSV and balances CSV (header, `-3.00`, the formula guard on a family label `=SUM(A1)`), menu PUT refusal when an ordered
  item is left out, fill week, school settings validation, the last-admin guard, the demo scenario's promises.

**Worker negative controls** (`npm run negative`, copies on 8605; each must go red for the named test, then logged): (1) cut-off
compares against D's own 9:00 AM instead of the school day before; (2) cut-off stops skipping holidays/PD days; (3) the server
stops requiring `allergen_ack`; (4) conflicts use the whole family's allergies (Ava's order goes red); (5) closure credit ignores qty;
(6) closure also credits already-cancelled lines; (7) kitchen totals count lines instead of qty; (8) kitchen includes cancelled lines;
(9) cancel skips the family check; (10) the role matrix lets kitchen into office; (11) the CSV formula guard is removed; (12) the
family-code rate guard is off; (13) a line takes the item's current price instead of its snapshot.

**M2: the parent pages** per the Design section. Playwright `app/tests/family/` (`E2E_PORT=8604`, all four projects, real input,
`useFamilySession()` for setup except in the sign-in spec):
- sign in by typing `KQ7M-4RTX` (lower case and without the dash too); a wrong code shows `#code-error`; sign out.
- add a child with two allergies ticked; edit; remove refused while lunches are ordered.
- **Allergen warning for Liam and not for Ava:** Thu Sep 17, Macaroni and cheese: with Liam's tab the card has
  `data-conflict="true"`, the red warning names Liam and Milk, there is `button.ack` and no `.qty-plus`; switch to Ava: no warning,
  no `button.ack`, `.qty-plus` adds it. The red warning's contrast ≥ 4.5.
- "I understand" is required: tap `button.ack` → qty 1; in the cart the line shows the warning with `input.ack-check` ticked;
  unticking disables `#place-order`; placing the order → `GET /api/family/orders` shows `ack_allergens: ["milk"]` for Liam and `[]`
  for Ava.
- Closed day (Wed Sep 16 at the anchor) shows "Ordering closed at 9:00 AM Tue Sep 15" and no steppers; Thu Sep 17 is open; with a
  Thu line in the cart, move the clock past Thu's cut-off (`setNow`) and place the order → `#order-error` names the day, the line
  is marked, nothing is stored.
- Cancel before the cut-off → the line goes and `#balance-text` changes by exactly the line total; no Cancel after the cut-off.
- Balance phrases (owing / credit / all paid up) and the payment instructions after ordering; a storm closure added through the API
  shows as a credit in history.
- Tap targets (48/56) hit-tested with elementFromPoint, the last item's stepper not covered by `#cart-bar`, no sideways scroll at
  390, WebKit included. Screenshots of every parent page at 390 and 1280 into `app/tests/family/shots/`.

**Page negative controls** (`app/tests/family/negative-*.mjs` with `pageNegative` from `app/tests/negative-lib.mjs`, port 8606):
(a) the order page uses every child's allergies for the warning → the Ava check goes red; (b) the warning element is not rendered →
the Liam check goes red; (c) `button.ack` adds without recording the acknowledgement → the ack_allergens check goes red; (d) the
cart ignores an API refusal and shows "Order placed" → the cut-off check goes red; (e) a transparent cover over the cart bar's
neighbour → the tap-target check goes red.

### sl2 — Kitchen, teacher, office and settings pages
Owns:
- app/public/staff/**
- app/public/kitchen/**
- app/public/teacher/**
- app/public/office/**
- app/public/admin/**
- app/tests/staff/**

Report: docs/build-report-sl2.md

Task:
Build the staff pages in "Design → Staff pages" against `docs/API.md`. Until the lead tells you sl1's Worker is on main, build the
pages and their CSS from the contract (the SAMPLE seed in docs/API.md tells you exactly what the screens will hold); you may keep a
throwaway mock server under `app/tests/staff/` for looking at layouts, but **no final test may use it**. When the lead says so,
`git merge --no-edit main` and test against the real Worker. Priorities if time runs short: (P1) PIN sign-in + nav, kitchen,
labels, teacher, office balances + payments, no-school days; (P2) menu grid, items, school settings, CSV; (P3) classes, staff PINs.
Shared code for your pages goes in `app/public/staff/staff.js` / `staff.css`.

**Playwright `app/tests/staff/`** (`E2E_PORT=8603`, all four projects; kitchen labels and settings may skip 390 with a reason; real
input; orders, payments and closures set up through the API, the thing under test through the page):
- PIN sign-in by keypad taps for each role lands on the right page with the right nav; a wrong PIN shows `#pin-error`; a teacher
  opening `/office/` sees "That page is not for your PIN."
- **Kitchen totals equal the orders:** place a known set of orders through the API for Thu Sep 17 (including Liam + mac with the ack
  and Noah, who has allergies on file); `#item-totals` qty per item = the hand-computed numbers = the API; class totals likewise;
  `#children` shows Liam's conflict row first with "ALLERGY" and the red edge, Noah's allergy row next; `#orders-open` shows before
  the cut-off and not after (`setNow`).
- Labels: one `.label` per active line; Liam's has `.label-allergen` naming Milk; print emulation (`page.emulateMedia({ media:
  'print' })`) gives a white background and hides `.no-print`.
- Teacher (clock on Thu Sep 17 at noon): Ms. Oldford's PIN opens Room 4; tapping Given out / Absent updates `#count-*` from the
  answer and survives a reload; the API agrees; tapping the pressed button clears it; another day shows no buttons.
- Office: record a payment by typing an amount → `#family-balance` and the row's balance change to the cent and the API agrees; undo
  it; add a family → the code shows once and signs in through `POST /api/family/signin`; new code → the old one stops working;
  ledger CSV downloaded by a real click (Playwright `download` event) has the header and the right amounts.
- **Storm closure through settings:** with orders on Thu Sep 17, add a `closure` for that day: `#no-school-confirm`'s numbers equal
  the API preview; confirm → `#no-school-result`; the kitchen page for that day shows the no-school banner and zero items; the office
  balances dropped by exactly the credited amounts.
- Menu grid: untick an item on a day with no orders → saved; untick an ordered one → `#menu-error` and the tick comes back; Fill
  from usual days on an empty week.
- Tap targets (44; teacher marks 56) hit-tested, no sideways scroll at 390 on kitchen, teacher and office, WebKit included.
  Screenshots of every staff page at 1280 (and 390 for kitchen, teacher, office) into `app/tests/staff/shots/`.

**Negative controls** (`app/tests/staff/negative-*.mjs` with `pageNegative`, port 8607): (a) the kitchen page sorts children by name
only → the flagged-rows-first check goes red; (b) the label's allergen line is dropped → the labels check goes red; (c) the teacher
page counts marks locally and ignores the answer's `counts` (break the answer mapping) → the count check goes red; (d) the office
panel keeps the balance from before the payment → the payment check goes red; (e) the closure confirm shows the kitchen's line count
instead of the preview → the confirm-numbers check goes red; (f) a transparent cover over the teacher's buttons → the tap check goes
red.

## Main (sl-lead, not a slice)
Owns PLAN.md, AGENTS.md, CLAUDE.md, DECISIONS.md, BRIEF.md, README.md, package.json, demo.mjs, .gitignore, docs/API.md,
docs/ALLERGENS.md, docs/DEPLOY.md, docs/build-report.md, docs/shots/**, data/**, tools/**, app/package.json, app/package-lock.json,
app/playwright.config.mjs, app/public/theme.css, app/public/common/**, app/tests/helpers.mjs, app/tests/start-worker.mjs,
app/tests/negative-lib.mjs, app/tests/journey/**. Merges each slice after reading its diff, runs the cross-reviews, writes the
cross-slice journey (parent orders on a phone → kitchen totals and flagged row → storm closure in settings → the parent's credit to
the cent → the teacher's list for that day is empty) with its own negative control, runs final QA from a worktree pinned with
`rig qa --ref <sha>` on 8609, and writes the README, DEPLOY and build report.
