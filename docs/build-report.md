# School Lunch Orders: build report (lead)

Overnight build 2026-09-14. Lead `sl-lead` (contract, integration, QA, journey); `sl1` Worker + parent pages
(`docs/build-report-sl1.md`); `sl2` kitchen, teacher, office and settings pages (`docs/build-report-sl2.md`).

## Final QA

TBD-FINAL-QA: sha, port, every suite's passed / failed / skipped, negative controls, allergen check.

## QA history (every number from a worktree pinned to a sha, never the shared tree)

| When | Sha | What | Result |
|---|---|---|---|
| 20:38 | c0ec703 (sl1 M1) | lead smoke test against docs/API.md, 44 checks | 41 ok; the 3 "fails" were the lead's own arithmetic (Thu Sep 17 is 9 items / $26.00, not 8 / $25.75); merged |
| 20:5x | 2832313 (sl2) | Playwright tests/staff | 78 passed, 6 skipped, 0 failed; merged |
| 21:0x | 5dacefa (sl2) | Playwright tests/staff after the phone header CSS | 78 passed, 6 skipped, 0 failed; merged |
| 21:0x | 6ddd47e (sl1) | Worker suite; Worker negative controls | 60 passed, 0 failed; 13 of 13 red; merged |
| 21:1x | 4292a4a (integration: sl1 0cc9e24 + sl2 ebce23e) | Worker suite; all Playwright | Worker 62 passed; Playwright 162 passed, 8 skipped, 2 failed: the journey in both engines, on stale "lunches" words in the lead's own spec (the page said "7 items for 3 families … $20.00", the hand-worked numbers). Not merged |
| TBD | TBD | integration round 2 | TBD |

## Cross-reviews (every real defect crossed a slice boundary)

- **sl2 on sl1's Worker (M1):** 0 blocking, 7 notes. Written into docs/API.md as the Worker behaves (ordered items that left the
  menu stay on the kitchen list, mark 404 first, closure note, CSV filename, labels); the no-school preview now refuses what the
  POST refuses (sl1 fixed, with tests); no session `created_at` check.
- **Lead on sl1's Worker:** a closure read the lines and then closed them in a second batch, so an order placed in between would
  stay active on a no-school day and never be credited. Fixed: one date-keyed batch, test reads the credits back against the
  closed lines. The same read-then-write race on `over_max` is a known gap.
- **sl1 on sl2's staff pages:** a blank cut-off "days before" saved as 0 (the parents' rule silently became "on the day"), the
  same on class sort; the settings "Parents see" line stayed stale after Save; a double tap on the office adjustment recorded two
  adjustments; refusal words shown away from the button tapped. All four fixed by sl2 with tests; negative controls (h) blank
  saved as 0, (i) adjustment guard removed (red on both runs, so the double-tap race is real in Playwright), (j) the rule line not
  re-read, (l) a refused Undo shown in the wrong place all went red.
- **sl2 on sl1's parent pages:** four real mismatches. (1) The kitchen label listed all of a child's allergies where the parent's
  warning named only the conflict → labels now lead with the conflict (sl2, negative (k)). (2) The Worker's refusal and the page's
  warning used different words for the same conflict → one wording everywhere (sl1). (3) **Safety gap:** a parent who ticked an
  allergy after ordering saw nothing while the kitchen saw "Not confirmed by the parent" → the family line now carries its
  conflicts, home shows the red warning with "I understand, keep it" or Cancel, and a new route records the confirmation (sl1,
  Worker negative 14, page negative (g)). (4) The cart used prices cached when an item was added → the cart says when a price has
  changed (sl1, page negative (h)).
- **sl2 on its own labels (after the lead asked for conflict-first wording):** the extra allergy line can be clipped on a 1-inch
  printed label, because the label hides overflow. A label that silently hides allergy words is the one failure this app cannot
  have. Fixed by sl2 (a9cd1c8): shorter print wording ("ALLERGY: Eggs", "Also: Sesame seeds", "Gluten" on labels only,
  "(not confirmed)" when the parent hasn't confirmed); labels drawn at their printed size on screen too; a fit step that, only
  while a label still overflows, goes dense, then replaces the extra line with "More allergies: see the kitchen list", then shortens
  the item and class lines, and never shortens the ALLERGY line; anything still too full is counted on the page. sl2 also found
  that a flex line with hidden overflow could shrink to nothing without the label ever reporting overflow (`flex: none` on every
  line). Test in print emulation: a SAMPLE child with all 12 allergies ordering the 4-allergen cookie, beside the normal children;
  every label's content fits (scrollHeight ≤ clientHeight + 1, no line wider than its box) and the worst case shows its ALLERGY line
  in full. Negative control (m), fit turned off, went red. Not checked on real label paper.
- **Lead on the demo:** every seeded family owed money, so the office never showed a credit or "Paid up" → sl1 seeded one family
  in credit and one paid up, with a test of the four balance signs. Acknowledged conflict lines on home had no allergen marking →
  a red "Contains Milk" pill (sl1).
- **Lead on the screenshots:** sl2's phone header took a quarter of the teacher's screen (tightened); sl1's sticky cart bar let
  card text read through at 390 (made solid, with a check and a negative control that makes it transparent again); the
  ingredients disclosure looked like an empty heading (chevron added).
- **Lead on negative controls:** sl2's (g) first went red only because the Worker refused a malformed price, which proves nothing
  about a wrong price being caught; redone to store a valid wrong price (3.75 typed → 38 cents) and go red on the price check.

## Incidents

- **node_modules through a symlink.** The lead linked main's `app/node_modules` into the slice worktrees; `npm install` (sl1,
  20:25) and `npm ci` (sl2, 20:36) replaced the links and emptied main's folder through them. Two QA runs then failed to start
  (`ERR_MODULE_NOT_FOUND`, exit 127). Those were setup failures, never reported as results. Fix: reinstall main; the QA worktree
  gets its own `npm ci`. For LEAD-RULES: give each worktree its own install instead of a link.
- **The lead's journey negative control named the wrong assertion.** Its break (a closure credited by unit price, so Jack's
  milk ×2 counts once) made the journey fail on the settings result line ("Credited $19.00" instead of "$20.00"), before the
  per-family balance check it had named, so the library correctly reported NOT RED. The expected text now names the real failure
  and the control went red. That first run's log was in the QA worktree and was cleaned away, so
  `app/tests/journey/negative-control.log` holds only the red rerun (the commit message says both runs are in the log; they are
  not).
- **A grep that could not fail.** The lead's first look at the integration run searched for `✘`, which the line reporter does
  not print, and read "no failures"; the summary said 2 failed. Failures are now read from the summary and the numbered `1) `
  list.

## Known gaps

TBD-FINAL-QA.
