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
  adjustments; refusal words shown away from the button tapped. TBD: sl2's fixes and their negative controls.
- **sl2 on sl1's parent pages:** TBD.
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
