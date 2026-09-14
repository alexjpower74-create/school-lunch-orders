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
  2⅝ × 1 inch labels, 30 a sheet. `.label-allergen` reads "ALLERGY: <the child's allergies>. Contains <the conflicts>.", or
  `.label-allergies` "Allergies on file: …". There's a small SAMPLE mark, and `#print` calls `window.print()`.
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
  - No-school days: the date starts at today, per PLAN. Preview → `#no-school-confirm` (`#confirm-lunches`,
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
  - Storm closure: the confirm's numbers = the API preview = the hand numbers. The result reads "Cancelled 13 lunches for 4
    families. Credited $34.25.". Each family's balance drops by exactly its own credit. The kitchen for Thu shows the no-school
    banner, 0 items and no rows, and the office rows show the new balances.
  - Menu grid: unticking cookie on Fri Sep 18 saves (API agrees). Unticking mac on Thu Sep 17 → `#menu-error` and the tick
    returns (API still has mac).
  - Fill: from Sep 14, Next is tapped to the empty week of Dec 21 (0 ticks); Fill gives each day exactly the usual-day items on
    both the page and the API.
  - Tab tap targets, 44 px menu cells, screenshots.

**Negative controls** (`node tests/staff/negative-all.mjs`, copies on 8607, logged in `tests/staff/negative-control.log`). All
six went red for the named test:

| | break | went red on |
|---|---|---|
| a | kitchen sorts children by first name only | "children order" (Ava, Chloe, … instead of Liam, Noah) |
| b | the label's ALLERGY line is not rendered | "Liam's label-allergen" |
| c | teacher bumps its own counts instead of the answer's | "count-delivered after Liam given out" (1 expected, 2 shown) |
| d | office panel ignores the payment answer's balance | "#family-balance after the payment" (625 expected, 1050 shown) |
| e | the closure confirm uses the kitchen's `line_count` | "confirm-lunches" ("13 lunches" expected, "11 lunches" shown) |
| f | a transparent fixed layer over the teacher's list | "teacher mark button: something else is on top" (webkit-390) |

Control (c) first ran red on `count-delivered` rather than the string I had named (`count-waiting`). The break leaves
`day.counts` set from the answer and then adds 1, so the delivered counter shows the error first. I widened the expect string to
the shared "after Liam given out" and reran it; it went red. Both runs are in the log.

Screenshots of every staff page are in `app/tests/staff/shots/`: 1280 for all pages, and 390 for PIN, kitchen, teacher, office
and labels.

## Choices worth knowing

- **"lunches" in the no-school confirm and result = `item_count`**, not `lines`. Jack's 2 milks count as 2. That keeps "13
  lunches" matching the kitchen's "Items to make", and makes negative (e) able to fail (11 lines vs 13 items).
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

- REJECTED for now: no e2e tests for the items, classes, staff PIN and school forms (P2/P3), or for the office adjustment
  form. The pages are built and wired to the routes, and the settings screenshot test opens every tab, but nothing checks that
  a save round-trips.
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
