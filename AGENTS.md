# School Lunch Orders

Hot lunch pre-orders for a Newfoundland school or its lunch provider. Parents order on their phone with a family code (no email,
no payments taken); the kitchen gets totals by item and class with allergens flagged and prints labels; teachers mark lunches given
out; the office keeps the ledger of orders, payments and credits. Overnight build 2026-09-14, lead `sl-lead`, slices `sl1` (Worker +
parent pages) and `sl2` (kitchen, teacher, office, settings pages).

Read PLAN.md first (the Rig contract), then docs/API.md (the contract between slices), then DECISIONS.md.

## Stack and ports

- `worker/`: Cloudflare Worker, plain JS ESM, no npm deps, D1 `DB` (`school-lunch-orders`), daily cron. Serves `/api/*` and
  `app/public/`.
- `app/public/`: plain HTML/JS/CSS, no build, nothing from another host. `/` family code, `/family/…` parent pages, `/staff/` PIN,
  `/kitchen/`, `/kitchen/labels/`, `/teacher/`, `/office/`, `/admin/`.
- `app/tests/`: Playwright 1.63, chromium + webkit at 390 and 1280, against the real Worker. `family/` sl1, `staff/` sl2,
  `journey/` lead.
- Ports (inspector = port + 10, always pass `--inspector-port`): demo 8601 · sl1 Worker 8602 · sl2 e2e 8603 · sl1 family e2e 8604
  · sl1 Worker negative copies 8605 · sl1 page negatives 8606 · sl2 negatives 8607 · lead journey 8608 · QA 8609.
- SAMPLE PINs: office/admin `3141` (Ms. Janes), kitchen `2718` (Mr. Kean), teachers `1618` (Ms. Oldford, Room 4) and `1414`
  (Mr. Pardy, Room 8). SAMPLE family codes: `KQ7M-4RTX` (Liam, milk allergy, and Ava), `W3PH-8JND` (Noah), `C9VB-6FYE` (Emma, Jack,
  Chloe), `T5ZA-2GUK` (Owen).

## Rules that bite here

- **Local only.** `wrangler dev --local`. No `wrangler deploy`, `secret put`, `d1 create`, `--remote`, Pages or DNS.
- **No payments, nothing sent.** The app shows the school's payment instructions; the office records what arrived.
- **Red means allergen.** Only that child's own ticked allergies trigger the warning, and the server refuses an order line with a
  conflict unless the parent said "I understand". The app shows what the school listed; it never calls an item safe.
- **Money is integer cents** end to end; credits and cancellations are ledger entries, never edits to old ones.
- **Time is the school's zone** (`America/St_Johns`) from the Worker, never the browser clock. Tests pin it with `X-Test-Now`
  (anchor Tue Sep 15 2026, 11:00 AM NDT).
- **SAMPLE only.** School "SAMPLE Harbour Pond Elementary (demo)"; families, children and staff are SAMPLE.
- Own only your slice's paths; `rig guard` enforces it. Verify → commit (own paths) → report.
- Every important check has a negative control that breaks a copy in `.negative/`, goes red, and is recorded.
- Plain English for Newfoundland users. No emoji as icons. No devils or demons.
- Kill only PIDs whose cwd is in your own worktree on your own ports. Never `pkill`/`killall` wrangler, workerd, node or npm.

## Standing rules (every project, read by Claude Code and Codex alike)

CLAUDE.md is a symlink to this file, so Onyx (Claude Code) and Cobalt (Codex) read the same text. Edit AGENTS.md only.

- **Read PLAN.md first where it exists; it is the contract.** Own only your slice's files.
- **What "done" means:** verified, committed (only your own paths, with a message that says what and why), pushed, and shown: a screenshot via `pwshot` for anything visible. Never hand back an empty screen; seed demo data if the UI needs it. Never leave a green step uncommitted.
- **Nothing leaves without Alexander.** Emails, forms, applications, posts, marketplace submissions and pull requests to other people's repos are staged to one click; he presses send.
- **Tests that cannot lie.** A bug that reached a person gets a test that fails without the fix, proved by reverting the fix. Every guard (grep, lint, check) is shown to fail on a known-bad input in the same run: a check that cannot fail measured nothing. Real dependencies over mocks where practical. Hit-test with elementFromPoint, never rects.
- **Public-repo hygiene.** No secrets, no machine names, no home-folder paths, no invented businesses. Real businesses appear only where Alexander chose to show them. Run `check-no-personal-data` before pushing a public repo.
- **Browser work.** Playwright is the default; WebKit check before calling a WKWebView page done; the Chrome extension only for pages that need his real login.
- **Keep this file short:** commands, gotchas with a why, hard rules. Architecture belongs in the code and README.
