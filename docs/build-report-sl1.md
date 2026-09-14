# Build report: sl1 (Worker, D1 and the ordering rules; the parent's phone pages)

## M1 first commit (for sl2 and the lead)

**DONE: the Worker answers every route in docs/API.md** (reset, seed, sign-in, info, family, orders, kitchen, teacher, office,
settings, no-school, menu, CSV). The first commit on `rig/sl1` is the one titled "Worker M1". It was checked by hand against a
real `wrangler dev --local` on 8602 before committing: reset, all four PINs, family code (lower case, no dash), allergen ack refusal
and acceptance, cut-off refusal, kitchen day and labels, teacher classes, role refusal (kitchen → office 403), office families,
payment, family detail, settings, admin menu, closure preview and add, family ledger, both CSVs, the demo seed. The full test suite
came in the commits after it.

There is no git remote in this repo, so nothing was pushed; the lead merges `rig/sl1` locally.

(The rest of this report follows as the work lands.)
