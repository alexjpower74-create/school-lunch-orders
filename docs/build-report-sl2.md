# Build report: sl2 (kitchen, teacher, office and settings pages)

Branch `rig/sl2`. Built against docs/API.md, then tested against sl1's real Worker after merging main at 7179f99 (plus e595f83).
Nothing outside my slice was changed.

## What I built

DONE, all under `app/public/`:
- **`staff/staff.js`, `staff/staff.css`**: shared code for every staff page:
  - A sticky header with the school name, SAMPLE and the staff name.
  - `nav#staff-nav` shows only the pages that role may use, plus `#staff-sign-out`.
  - A 401 goes back to `/staff/`. A 403, or opening a page the role may not use, shows "That page is not for your PIN." with a
    link to the role's own page.
  - Helpers for the one-time code box, parsing typed dollars (integer cents, no floating point) and CSV downloads (fetch with
    the token, then a Blob download).
- **`/staff/` PIN**: keypad `button.key[data-key]` with Clear and Back, `#pin-dots`, `#pin-submit`, `#pin-error`. The keyboard's
  digits also work. Each role goes to its own page.
- **`/kitchen/`**:
  - Date controls: `#date-next`, `#date-today` and `#date-pick`; `?date=` keeps the day on reload.
  - Banners and stats: `#kitchen-date`, `#orders-open`, `#no-school`, and the stat cards.
  - `#item-totals`: rows with qty 0 are muted; "Contains …" is a neutral pill, never red.
  - `#class-totals`.
  - `#children`: conflict rows first with a 6 px `--allergen` edge, "ALLERGY", "Milk in Macaroni and cheese" and "Not confirmed
    by the parent" when unacknowledged. Then allergy-on-file rows, then the rest.
  - `#print-labels`.
  - Print styles.
- **`/kitchen/labels/?date=`**: one `.label[data-line]` per active line, 3 across on screen. At print it's a Letter sheet of
  2⅝ × 1 inch labels, 30 a sheet. `.label-allergen` reads "ALLERGY: <the conflicts>", with
  `.label-allergies` "Also: …" for the child's other allergies, or "Allergies on file: …" when nothing conflicts. Labels are drawn
  at their printed size, and a fit check makes sure no allergy word is cut off at print (fifth pass). There's a small SAMPLE mark, and `#print` calls `window.print()`.
- **`/teacher/`**:
  - `#class-pick` (defaults to `my_class_id`), `#teacher-date` (date input; `?date=` works too), and the three `#count-*` cards.
  - `.child-row[data-child][data-state][data-flag]` with red allergy words.
  - Given out / Absent `button.mark` at 56 px with `aria-pressed`. Tapping the pressed one clears it.
  - Counts are always taken from the API answer.
  - On another day or a no-school day there are no buttons, only `#teacher-note` saying why.
- **`/office/`**:
  - Totals and `button.family-row[data-family]` rows with a `.balance[data-balance-cents]` pill (owing, credit or paid up).
  - `#family-panel`: `#family-balance`, children with allergies, upcoming lunches, and the payment form (`#payment-amount`
    prefilled with the balance when the family owes, `#payment-method`, `#payment-note`, `#record-payment`).
  - An adjustment form (optional), a ledger with `button.void-entry` and an inline confirm, and `#new-code` →
    `#confirm-new-code` → `#code-value` shown once.
  - `#add-family-label` / `#add-family`, `#ledger-csv` and `#balances-csv`.
  - On narrow screens the panel moves above the list.
- **`/admin/` Settings**: tabs `button.tab[data-tab]`, remembered in the URL hash.
  - School form.
  - Menu grid: `input.menu-cell` at 44 px and `.ordered` counts. A change saves that day; a refusal shows in `#menu-error` and
    the tick goes back. Also `#fill-week`.
  - No-school days: the date starts at today, per PLAN. Preview → `#no-school-confirm` (`#confirm-items`,
    `#confirm-families`, `#confirm-credit`) → `#confirm-no-school` → `#no-school-result`. The list has a two-step remove.
  - Items, classes and staff: list plus form; field errors mark the input named by `field`.

## Verified, and how it could have failed

Playwright `app/tests/staff/` against the real Worker (`E2E_PORT=8603`, all four projects): **78 passed, 6 skipped, 0
failed.** The skips are the two menu-grid tests and the settings screenshots at 390, which PLAN allows. Orders, payments and
the sign-in sessions are set up through the API. Everything under test is driven by `tap()` / `type()` / `keypad()`. The date
inputs use PLAN's exception: a hit-test, then `fill`. The Thursday numbers are worked out by hand in `tests/staff/setup.mjs`
(13 items on 11 lines, credits $10.50 / $6.00 / $12.00 / $5.75 = $34.25), and both the page and the API are checked against
them.

- **pin.spec**: sign-in by keypad for admin, kitchen and teacher → the right URL, `data-nav` list, staff name, school name and
  SAMPLE badge; sign out clears the session. A wrong PIN → "That PIN is not right.". A teacher on `/office/` → the forbidden
  screen, whose link leads to `/teacher/`.
- **kitchen.spec**:
  - Totals: item and class totals on the page = hand numbers = API; `#stat-items` = 13.
  - Row order: Liam (conflict) first, then Noah (allergy on file). Flag ranks never go backwards, the order matches the API,
    Liam's row has a `solid 6px rgb(248, 113, 113)` edge, and the ALLERGY pill's contrast is ≥ 4.5.
  - Cut-off: `#orders-open` is visible with the exact words before the cut-off, and hidden after `setNow` Wed 9:00 AM.
  - Labels: 11 `.label` = the API's labels; Liam's reads "ALLERGY: Milk. Contains Milk.", Ava's mac has none, and Noah's has
    his allergies on file. Print emulation gives a white body, hides `#print` and the header, and keeps the allergen line bold,
    bordered and black.
  - Tap targets, no sideways scroll, screenshots.
- **teacher.spec** (clock Thu noon):
  - Tapping Liam's Given out and then Jack's Absent: after each tap all three `#count-*` = the API counts. A reload keeps the
    pressed states and counts; tapping pressed Given out clears it.
  - Fri clock viewing Thu: 2 rows, no buttons, and the note.
  - Every mark is ≥ 56 px and hit-tested; no sideways scroll.
- **office.spec**:
  - Typing 4.25 → `#family-balance` and the row go 1050 → 625, and the API agrees. Undo → back to 1050, struck through and
    "Undone".
  - Add a family → the code signs in through `POST /api/family/signin` and isn't in the page after a reload.
  - New code → the old code gets 401 and the new one 200.
  - Ledger and balances CSVs downloaded by real clicks (`download` event): the headers, `,10.50,`, `,-5.00,` and `5.50`.
  - Tap targets and screenshots.
- **admin.spec**:
  - Storm closure: the confirm's numbers = the API preview = the hand numbers. The result reads "Cancelled 13 items for 4
    families. Credited $34.25.". Each family's balance drops by exactly its own credit. The kitchen for Thu shows the no-school
    banner, 0 items and no rows, and the office rows show the new balances.
  - Menu grid: unticking cookie on Fri Sep 18 saves (API agrees). Unticking mac on Thu Sep 17 → `#menu-error` and the tick
    returns (API still has mac).
  - Fill: from Sep 14, Next is tapped to the empty week of Dec 21 (0 ticks); Fill gives each day exactly the usual-day items on
    both the page and the API.
  - Tab tap targets, 44 px menu cells, screenshots.

**Negative controls** (`node tests/staff/negative-all.mjs`, copies on 8607, logged in `tests/staff/negative-control.log`). All
thirteen went red for the named test:

| | break | went red on |
|---|---|---|
| a | kitchen sorts children by first name only | "children order" (Ava, Chloe, … instead of Liam, Noah) |
| b | the label's ALLERGY line is not rendered | "Liam's label-allergen" |
| c | teacher bumps its own counts instead of the answer's | "count-delivered after Liam given out" (1 expected, 2 shown) |
| d | office panel ignores the payment answer's balance | "#family-balance after the payment" (625 expected, 1050 shown) |
| e | the closure confirm uses the kitchen's `line_count` | "confirm-items" ("13 items" expected, "11 items" shown; it said "lunches" before the wording change) |
| f | a transparent fixed layer over the teacher's list | "teacher mark button: something else is on top" (webkit-390) |
| g | the items form stores `Math.round(price / 10)` as cents (3.75 typed → 38, accepted by the Worker) | "the new item row price" ("$3.75" expected, "$0.38" shown) |
| h | the school form reads cut-off days with `Number()` again (blank → 0) | "cutoff_days_before still 1 in the API" (1 expected, 0 saved) |
| i | Add adjustment loses its `busy()` guard | "adjustments stored after a double tap" (1 expected, 2 stored; red on both runs) |
| j | the school form does not re-read `/api/info` after saving | "the parents' rule line after saving, without a reload" (still "Order by 9:00 AM the school day before.") |
| k | the label's ALLERGY part lists all of the child's allergies again | "Chloe's label-allergen names only the conflict" ("ALLERGY: Eggs and Sesame seeds" shown) |
| l | a refused Undo puts its words in `#payment-error` again | "the refusal next to the entry that was tapped" (the entry's line empty) |
| m | the label fit check does nothing (`fit()` returns at once) | "labels whose words are cut off at print" (the worst-case label) |

Control (c) first ran red on `count-delivered` rather than the string I had named (`count-waiting`). The break leaves
`day.counts` set from the answer and then adds 1, so the delivered counter shows the error first. I widened the expect string to
the shared "after Liam given out" and reran it; it went red. Both runs are in the log.

Screenshots of every staff page are in `app/tests/staff/shots/`: 1280 for all pages, and 390 for PIN, kitchen, teacher, office
and labels.

## Choices worth knowing

- **The no-school confirm and result count items (`item_count`)**, not lines: "This cancels 13 items for 4 families and credits
  $34.25 to their balances." Jack's 2 milks count as 2, matching the kitchen's "Items to make", and negative (e) can fail
  (11 lines vs 13 items). They said "lunches" until the lead asked for "items".
- **Kitchen stat "Allergy rows"** = children with any flag (conflict or allergy on file). A red sub-line counts the conflicts.
- **The cut-off test signs in with the later clock** (Wed 8:00 AM), so the 12-hour staff session is still good once the clock
  moves to Wed 9:00 AM. This relies on the Worker checking only `expires_at > now` (see the cross-review, item 7).
- **Settings at 390 is skipped** for the menu grid and screenshots only. The storm-closure test runs in all four projects.
- A throwaway layout mock (`tests/staff/mock-server.mjs`) was used before the Worker was merged. No test ever used it, and it
  has been deleted.
- `npm ci` in `app/` (20:36:58) replaced a `node_modules` symlink in this worktree with a real install of the pinned
  `@playwright/test`. The lead saw main's `app/node_modules` emptied through a symlink at 20:25, which was before my install,
  so mine was not that cause. I can't rule out that `npm ci` emptied the link's target a second time before removing the link.
  Main's folder was reinstalled at 20:51, and every worktree now has a real directory. I told the lead.

## Not done

- DONE in the third pass (below): save round-trip tests for the school, items, classes and staff PIN forms and the office
  adjustment.
- Not checked on paper: the label sheet's physical size (2⅝ × 1 inch, 3 across on Letter). Print emulation checks colours and
  visibility, not millimetres.
- No office search box, no date range for the ledger CSV (it uses the API defaults), and no family rename (the
  `PUT /api/office/families/:id` route exists).
- I did not run `rig qa`; numbers from a pinned QA worktree are the lead's to take.

## Needed from other slices

Nothing blocks sl2. No changes asked of the lead's shared files.

## Second pass (after the lead's review)

- DONE: merged main again (97153a9: docs/API.md now records the Worker behaviours from the cross-review below). No page
  changes were needed. The Days tab previews only when Add is tapped, and a refused preview shows in `#no-school-error`.
- DONE: lead's visual note (a). At 390 the staff header and the teacher's title, pickers and counts are tighter, so the class
  list starts higher. Tap targets are unchanged (44, and 56 for the marks). The full suite with this CSS passed everything
  except the 5 failures below.
- DONE: lead's visual note (b). The kitchen specs tap the heading after filling the date, so Chromium's highlighted date
  segment is not in the screenshots. My first version also asserted `#date-pick` lost focus. That went red in webkit-390 for
  all 5 kitchen tests that open Thursday (a touch tap on text does not move focus in WebKit), so the assertion was removed.
  The kitchen spec then passed 24/24 in all four projects, and negatives (a) and (b) went red again against the changed spec
  (logged).

## Third pass (the lead's next steps)

- DONE: `tests/staff/settings.spec.mjs`. Each form saves through the page, reloads, and checks both the page and
  `GET /api/admin/settings`:
  - School: a year end before the start is refused and marked on `#year-end`; then the name, payment words, cut-off (2 school
    days, 08:30) and year end save, and the header and "Parents see" line show the new values after the reload.
  - A new item typed in dollars (3.75) with two allergens, Mon and Wed, max 2 and vegetarian: the row shows $3.75 straight after
    saving, the API stores 375, and the form shows the same values after the reload.
  - Editing mac: price 4.25, mustard added, Tuesday off, no max. The API agrees, and so does the form after the reload.
  - A new class, then an edit of its grade and order.
  - A new staff member: Ms. Oldford's PIN is refused and marked on `#staff-pin` with nothing saved; then 5566 saves, signs in
    through the API as a teacher in Room 5, and the row reads "Teacher · Room 5".
  - Switching off the only office PIN is refused with "The school needs at least one office PIN." and stays active.
- DONE: `office.spec` adjustment test. +2.50 moves `#family-balance` from 1050 to 1300 and -4.00 to 900, the row and the API
  agree, and both adjustments are still there after a reload.
- DONE: the settings inputs now use PLAN's ids `#school-name` and `#staff-name`. The shared header used those same ids, so it
  dropped them (it keeps `.brand-name` and `.staff-who`), and the pin spec reads the header by class.
- DONE: the no-school confirm and result say "items" (`#confirm-items`), as the lead asked.
- DONE: negative (g), redone. My first version sent 3.75 / 100, which the Worker refused with a 400. That red (`#item-saved`
  empty) only proved a refused save shows no "Saved"; the lead caught it. The break now stores `Math.round(price / 10)`
  (3.75 → 38 cents, accepted), and the red is the row showing $0.38 instead of $3.75. Both runs are in the log.
- Runs: settings, office, pin and admin specs 70 passed, 6 skipped (menu grid and settings shots at 390); kitchen and teacher
  36 passed; storm closure 4/4 after the wording change; settings 24/24 after adding the row check; negatives (e) and (g) red.
  Every changed spec ran in all four projects. I did not rerun the whole suite in one go on the final sha.

## Fifth pass (labels never cut off allergy words)

- DONE: a9cd1c8, shorter label wording. `.label-allergen` reads "ALLERGY: Eggs" (no "Contains" repeat), `.label-allergies` reads
  "Also: Sesame seeds", gluten reads "Gluten" (the full grains name stays on the kitchen page), and an unconfirmed conflict adds
  "(not confirmed)". The kitchen's #children row is unchanged.
- DONE: labels are drawn at their printed size on screen too (2⅝ × 1 inch, point type sizes, decoration by box-shadow only), so
  the box is the same in both media. After rendering, and again when print media applies, `labels.js` `fit()` takes these steps
  only while a label still overflows:
  1. denser type (`.dense`)
  2. "More allergies: see the kitchen list" in place of the other allergies
  3. a one-line item
  4. a one-line class
  
  The ALLERGY line is never shortened. `.label > * { flex: none }` means no line can be squeezed to hide its words; I caught that
  while writing it, because a flex line with `overflow: hidden` could shrink to nothing without the label ever reporting overflow.
  A label that still doesn't fit is counted on screen in `#labels-too-full`.
- Test, in print emulation: a worst-case SAMPLE child (Zoe, all 12 allergies ticked) gets the cookie (eggs, milk, wheat and
  triticale, gluten), alongside Thursday's normal children. No `.label` has `scrollHeight > clientHeight + 1` or a line wider
  than its box. Zoe's ALLERGY line reads "ALLERGY: Eggs, Milk, Wheat and triticale and Gluten" inside her label, and her other
  allergies are all shown or replaced by the kitchen-list words. Jack's and Liam's labels keep normal type. Negative (m) turns the
  fit check off: red. (k) and (b) were rerun red.
- What the worst case needed (a throwaway probe, deleted, never committed): in chromium-1280 and webkit-390, Zoe's label needed
  only denser type and keeps all eight other allergies. Its content fills the label down to the 0.05 inch bottom padding (96 of
  96 px), with no spare room past that padding. It was the only dense label of 12. I looked at the print-emulation screenshot of
  her label in both engines: every word is visible.
- Runs: kitchen spec (labels included) 32/32 in all four projects; negatives (m), (k) and (b) red. I did not rerun the whole staff
  suite; the lead is rerunning it and the staff negatives on the final tree.
- Not checked on paper: the check measures the browser's print layout, which is what the browser sends to the printer, but a
  real label sheet's alignment isn't tested. On screen the labels are now small (their true size), 4 across at 1280; paper
  takes 3 across.

## Fourth pass (sl1's review of my pages, and the label decision)

One commit per fix, each with its spec passing in all four projects and its negative control logged. Main (integration round 2,
400dd69) was merged before committing fixes 2, 4 and 5, and their specs were rerun on the merged tree.

- DONE: 5879cd5, blank numbers. `Number('')` is 0, so a blank "school days before" quietly saved 0 ("order on the day"), and a
  blank class order saved 0. Both now go through `wholeNumber()`: a blank, decimal or out-of-range value marks the field, shows
  words and sends nothing. The test clears each field and saves; the API still has 1 and 2. Negative (h) restores `Number()`.
- DONE: 6a7dd8d, the "Parents see" line. After a successful save the page re-reads `/api/info` and redraws the rule. The school
  round-trip checks "Order by 8:30 AM 2 school days before." without a reload. Negative (j) skips the re-read.
- DONE: 4d1eb06, the adjustment double tap. Add adjustment is wrapped in `busy()` like payments. The test makes two real taps
  back to back without waiting, lets the network go quiet, and finds exactly one adjustment in the API and in the ledger.
  Negative (i) removes the guard and went red on both runs (2 stored), so the double tap does race the request in Playwright.
- DONE: bbe4b10, refusals next to what was tapped. A refused Undo shows its words under that entry (`.entry-error`), and a refused
  New code under its button (`#new-code-error`). The test taps Undo, undoes the same payment through the API (another desk),
  then confirms on the page. Negative (l) puts the words back in `#payment-error`. New code can't be made to fail through the
  Worker except with a 401 or 403, which go to sign-in or the forbidden screen, so its placement has no test.
- DONE: 45e2ef0, the lead's label decision. `.label-allergen` names only the conflicting allergens ("ALLERGY: Eggs. Contains
  Eggs."), then `.label-allergies` "Also allergic to: Sesame seeds"; a child with allergies and no conflict keeps "Allergies on
  file: …". The kitchen's conflict row does the same. The test orders Chloe a cookie in that test only, so the shared hand
  numbers stay the same. Negative (k) puts all the allergies back, and (b) was rerun red.
- Corrected in the fifth pass: I first wrote here that a crowded label "clips rather than spilling onto the next one". That
  was the failure itself, because a clipped label silently hides allergy words. The lead caught it.
- Runs after the merge: settings, kitchen and office specs 88 passed in all four projects; negative (l) red. Full staff suite on
  the final commit: 122 passed, 6 skipped (menu grid and settings shots at 390), 0 failed, in chromium and webkit at 390 and 1280.

## Cross-review of sl1 parent pages (0cc9e24)

Read-only: order.js, cart.js, family.js, home.js, history.js, family.css, layout.spec, and the Worker's orders.js, family.js,
lines.js and allergens.js at 0cc9e24; sl1's WebKit-390 screenshots of the order warning, cart and home. Real mismatches:

- Words (my side, the lead to decide): the label's "ALLERGY:" part lists all of the child's allergies, while the parent's warning
  names only the conflicting ones. Chloe (eggs, sesame) with a cookie: the parent sees "Chloe is allergic to Eggs. Oatmeal raisin
  cookie contains Eggs."; the label says "ALLERGY: Eggs and Sesame seeds. Contains Eggs." Aligning would be "ALLERGY: Eggs.
  Contains Eggs." with the rest under "Allergies on file". DONE: the lead chose this; the rest now reads "Also allergic to: Sesame seeds" (fourth pass).
- Words (contract level): the Worker's refusal is "Liam is allergic to Milk, and Macaroni and cheese contains it. Tick "I
  understand" to order it anyway." (docs/API.md), and the order and cart warning is "Liam is allergic to Milk. Macaroni and
  cheese contains Milk." (PLAN). A parent can see both, one after the other. Same child, allergen and item; two sentence forms.
- Flags (contract gap): an allergy ticked after ordering shows on the kitchen, labels and teacher pages as a conflict, "Not
  confirmed by the parent". The parent's "Coming up" list shows no warning on that line and has no way to confirm; they see red
  only by reopening the order page for that day. A Line carries `ack_allergens` but not the item's allergens, so home can't
  work it out without a contract change (e.g. `conflicts` on Line).
- Numbers (minor): the order page's cart bar and the cart's `#cart-total` use the menu price fetched when the page loaded. If the
  office changes a price while the cart is open, `#cart-total` differs from `#placed-total` (the Worker charges the price at
  placing). After placing, the office's order entry equals `#placed-total`.

Checked and matching: the same `money()` on both sides; "You owe $12.50" / "Owes $12.50" and "You have a $3.00 credit" / "Credit
$3.00" from the same sign rule; negative ledger amounts "-$4.00" and the word "Undone" on both sides; the closure credit entry and
its note; allergen labels from `/api/info`, and conflicts computed the same way (item allergens in the child's own allergies, in
list order) in order.js, cart.js, the Worker and the kitchen. Can't happen: a removed child can't be ordered for (404), nor removed
while it has lunches still to come; over_max is enforced by the page and the Worker; "I understand" on a line with no conflict
stores [], so the kitchen shows no flag; cancelled and closed lines never reach the kitchen or teacher pages. Tap and layout: sl1's
layout spec hit-tests 48/56 px in all four projects, including the last stepper at the page bottom against `#cart-bar`. In the
WebKit-390 screenshots, items showed through the glass cart bar; sl1 has since made it solid (5850220).

## Cross-review of sl1 M1 (c0ec703), for the routes the staff pages use

Nothing blocking; all 78 staff e2e tests pass against it. Notes (sent to sl-lead):

1. `kitchen.js` kitchenDay: `items` also adds an ordered item that is no longer on that day's menu. The contract says "every
   item on that day's menu". It's an extra row and harmless, since the menu PUT and item deactivation already refuse that case.
2. `teacher.js` teacherMark: an unknown `child_id` gives 404 before the "only today" 409. The contract names only the two 409s
   for mark.
3. `admin.js` previewNoSchool checks only the date format. A Saturday, a past day or a day outside the year previews as zeros,
   where POST gives 400.
4. `admin.js` addNoSchool gives each closure credit entry the no-school note (e.g. "Storm closure"). The contract doesn't say
   what note a closure entry carries.
5. `office.js` balancesCsv filename `lunch-balances-<today>.csv` is not named in the contract (the ledger CSV matches it).
6. `calendar.js` staffStatus labels `outside_year` "Outside the school year". The contract gives no label.
7. `auth.js` sessionOf checks only `expires_at > now`, so a session made at a later test clock is valid at an earlier one. The
   kitchen cut-off test depends on this; a `created_at <= now` check would break it.

Checked and matching: the kitchen day and labels shapes and sort orders (flag, class sort, first name; items qty desc then name;
classes by sort), `totals`, `orders_open`, `cutoff_label`; the teacher classes, day and mark shapes and `counts`; the office
families list (sort, totals), family detail, payments, adjustments, void messages, codes, and the CSV headers and CRLF;
settings, menu, fill, no-school preview/add/delete, items, classes and staff; the role matrix (401 before 403); "That PIN is
not right." and "That page is not for your PIN.".
